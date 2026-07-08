import { EventEmitter } from 'node:events'
import { Input, Output } from '@julusian/midi'
import { TransportNote, encodeTrigger, decodeMidiMessage } from './protocol.js'
import { TransportState, createInitialTransportState, applyStateNote } from './transportState.js'
import { ConnectionState } from './connectionState.js'

export class MidiConnection extends EventEmitter {
  private readonly input = new Input()
  private readonly output = new Output()
  private transportState: TransportState = createInitialTransportState()
  private readonly connectionState = new ConnectionState()

  constructor(
    private readonly inPortName: string,
    private readonly outPortName: string,
  ) {
    super()
    // Registered once here (not in open()) so repeated open()/close() cycles on the
    // same instance (e.g. a retry after a failed open()) never stack duplicate
    // 'message' listeners, which would otherwise cause handleMessage to fire multiple
    // times per incoming message and emit spurious duplicate 'stateChanged' events.
    this.input.on('message', (_deltaTime: number, message: number[]) => this.handleMessage(message))
  }

  open(): void {
    try {
      this.input.openPortByName(this.inPortName)
      this.output.openPortByName(this.outPortName)

      // @julusian/midi's openPortByName does NOT throw when the name doesn't match
      // any available port — it silently does nothing (linear scan, `return
      // undefined` on no match; see node_modules/@julusian/midi/midi.js). So a typo'd
      // port name, an unplugged device, or Cubase not yet running would otherwise
      // "succeed" here with no port actually open and no error ever emitted. Verify
      // explicitly via isPortOpen() and treat a still-closed port as a failure.
      const inputOpen = this.input.isPortOpen()
      const outputOpen = this.output.isPortOpen()
      if (!inputOpen || !outputOpen) {
        const missing: string[] = []
        if (!inputOpen) missing.push(`input port "${this.inPortName}"`)
        if (!outputOpen) missing.push(`output port "${this.outPortName}"`)
        this.close()
        this.emit('error', `Could not open configured MIDI port(s): ${missing.join(', ')} not found`)
        return
      }
    } catch (err) {
      // Kept in addition to the isPortOpen() check above, in case some backend does
      // throw. One port may have opened successfully before the other threw. Close
      // both unconditionally so a failed open() never leaves an OS MIDI port held
      // open behind a module that reports itself disconnected. closePort() on a port
      // that was never opened is a safe no-op (see @julusian/midi's native
      // MidiInWinMM::closePort / MidiOutWinMM::closePort, both guarded on
      // `connected_`).
      this.close()
      const message = err instanceof Error ? err.message : String(err)
      this.emit('error', `Could not open configured MIDI port(s): ${message}`)
    }
  }

  close(): void {
    this.input.closePort()
    this.output.closePort()
  }

  sendTrigger(note: number): void {
    for (const message of encodeTrigger(note)) {
      this.output.sendMessage(message)
    }
  }

  getTransportState(): TransportState {
    return this.transportState
  }

  isConnected(): boolean {
    return this.connectionState.isConnected()
  }

  private handleMessage(message: number[]): void {
    const decoded = decodeMidiMessage(message)
    if (!decoded) return

    if (decoded.note === TransportNote.Heartbeat) {
      const wasConnected = this.connectionState.isConnected()
      this.connectionState.recordHeartbeat()
      if (!wasConnected) this.emit('stateChanged')
      return
    }

    const next = applyStateNote(this.transportState, decoded.note, decoded.isOn)
    if (next !== this.transportState) {
      this.transportState = next
      this.emit('stateChanged')
    }
  }
}
