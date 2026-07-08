import { EventEmitter } from 'node:events'
import { Input, Output } from '@julusian/midi'
import { TransportNote, encodeTrigger, decodeMidiMessage } from './protocol.js'
import { TransportState, createInitialTransportState, applyStateNote } from './transportState.js'
import { ConnectionState } from './connectionState.js'

// How often the passive ConnectionState.isConnected() computation is re-checked
// while no MIDI messages are arriving. Must be well under HEARTBEAT_TIMEOUT_MS so
// a timeout is detected promptly rather than lingering for another full window.
const CONNECTION_CHECK_INTERVAL_MS = 1000

export class MidiConnection extends EventEmitter {
  private readonly input = new Input()
  private readonly output = new Output()
  private transportState: TransportState = createInitialTransportState()
  private readonly connectionState = new ConnectionState()
  // ConnectionState.isConnected() is a passive on-demand computation (derived from
  // now() - lastHeartbeatAt) — nothing re-evaluates it on its own once messages stop
  // arriving. Without an active poll, a heartbeat timeout (e.g. Cubase quits) would
  // never produce a 'stateChanged' event, so main.ts would never learn the module
  // disconnected. connectionCheckTimer re-derives isConnected() on an interval and
  // diffs it against lastKnownConnected so a silent timeout is still observed.
  private connectionCheckTimer: ReturnType<typeof setInterval> | null = null
  private lastKnownConnected = false

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

      // Ports are genuinely open. Start (or restart) the periodic re-check so a
      // later heartbeat timeout is still detected even though no more 'message'
      // events will arrive to trigger it. Clearing any pre-existing timer first
      // keeps this idempotent across repeated open() calls on the same instance
      // (e.g. a retry after a prior failed open()), matching the no-duplicate-
      // listener discipline already applied to the 'message' listener above.
      this.startConnectionCheckTimer()
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
    this.stopConnectionCheckTimer()
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
      this.connectionState.recordHeartbeat()
      this.applyConnectedState(true)
      return
    }

    const next = applyStateNote(this.transportState, decoded.note, decoded.isOn)
    if (next !== this.transportState) {
      this.transportState = next
      this.emit('stateChanged')
    }
  }

  private startConnectionCheckTimer(): void {
    this.stopConnectionCheckTimer()
    this.connectionCheckTimer = setInterval(() => this.checkConnectionState(), CONNECTION_CHECK_INTERVAL_MS)
  }

  private stopConnectionCheckTimer(): void {
    if (this.connectionCheckTimer !== null) {
      clearInterval(this.connectionCheckTimer)
      this.connectionCheckTimer = null
    }
  }

  // Re-derives ConnectionState.isConnected() (a passive, on-demand computation) and
  // diffs it against the last-known value so a heartbeat timeout is detected even
  // when no further 'message' events arrive to trigger a check.
  private checkConnectionState(): void {
    this.applyConnectedState(this.connectionState.isConnected())
  }

  private applyConnectedState(nowConnected: boolean): void {
    if (nowConnected === this.lastKnownConnected) return
    this.lastKnownConnected = nowConnected
    if (!nowConnected) {
      // Cubase stopped responding; don't let a stale "Playing"/"Recording" linger
      // next to a fresh "Disconnected" status.
      this.transportState = createInitialTransportState()
    }
    this.emit('stateChanged')
  }
}
