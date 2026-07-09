import { EventEmitter } from 'node:events'
import { Input, Output } from '@julusian/midi'
import { TransportNote, encodeNoteOn, encodeNoteOff, encodeTrigger, decodeMidiMessage } from './protocol.js'
import { TransportState, createInitialTransportState, applyStateNote } from './transportState.js'
import { ConnectionState } from './connectionState.js'

// How often the passive ConnectionState.isConnected() computation is re-checked
// while no MIDI messages are arriving. Must be well under HEARTBEAT_TIMEOUT_MS so
// a timeout is detected promptly rather than lingering for another full window.
const CONNECTION_CHECK_INTERVAL_MS = 1000

// Companion's MIDI In/Out point at the same loopMIDI virtual port the Cubase
// script uses (ADR-005's same-machine topology), and loopMIDI echoes anything
// written to a port's output back into every listener's input on that port --
// including the sender. So a message we just sent arrives back on `this.input`
// moments later, byte-identical to and indistinguishable from genuine state
// feedback Cubase echoes back on the same note (ADR-004). Left unhandled, that
// self-echo raced Cubase's real (slower, script-engine-round-tripped) feedback
// and flipped state true-then-false within microseconds -- visible as a flicker
// instead of a clean toggle (e.g. Cycle/Click). SELF_ECHO_WINDOW_MS bounds how
// long a just-sent message is trusted as "could still be my own loopback echo";
// it comfortably covers local loopback latency while staying far shorter than a
// genuine Cubase round trip, so a real independent state change past the window
// is never mistaken for an echo of our own send. On topologies with no self-echo
// at all (e.g. cross-machine network MIDI per ADR-005), pending entries simply
// expire unmatched and are dropped -- see consumeSelfEcho().
const SELF_ECHO_WINDOW_MS = 150

// sendTrigger() used to send Note On immediately followed by Note Off with no
// gap at all. Cubase's .setTypeToggle() bindings for Record/Cycle/Click kept
// reporting the toggle reverting right back to its prior state after a
// Companion-sent trigger, even once feedback was wired up correctly -- a
// genuine hardware button always has *some* non-zero hold duration between
// press and release, and a real gap here better matches what Cubase's toggle
// handling expects instead of a zero-duration pulse.
export const TRIGGER_HOLD_MS = 40

function messagesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((byte, index) => byte === b[index])
}

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
  // FIFO of messages we've sent that a loopback echo might still be pending for.
  // See SELF_ECHO_WINDOW_MS above for why this exists.
  private readonly pendingSelfEcho: Array<{ message: number[]; sentAt: number }> = []

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
    this.pendingSelfEcho.length = 0
    this.input.closePort()
    this.output.closePort()
  }

  sendTrigger(note: number): void {
    const [noteOn, noteOff] = encodeTrigger(note)
    this.sendRaw(noteOn)
    setTimeout(() => this.sendRaw(noteOff), TRIGGER_HOLD_MS)
  }

  // For host values that need a genuine press-and-hold (e.g. Cubase's
  // mRewind/mForward -- see actions.ts), rather than sendTrigger()'s instant
  // Note On + Note Off pulse, which never registers as a hold.
  sendNoteOn(note: number): void {
    this.sendRaw(encodeNoteOn(note))
  }

  sendNoteOff(note: number): void {
    this.sendRaw(encodeNoteOff(note))
  }

  private sendRaw(message: number[]): void {
    this.pendingSelfEcho.push({ message, sentAt: Date.now() })
    this.output.sendMessage(message)
  }

  // Returns true if `message` matches a message we ourselves sent recently
  // (and consumes it, so it isn't matched again), meaning it's almost
  // certainly our own loopback echo rather than genuine incoming state.
  private consumeSelfEcho(message: number[]): boolean {
    const now = Date.now()
    while (this.pendingSelfEcho.length > 0) {
      const pending = this.pendingSelfEcho[0]
      if (now - pending.sentAt > SELF_ECHO_WINDOW_MS) {
        // Too old to plausibly be our own loopback echo -- drop it and let
        // whatever arrives now be treated as genuine.
        this.pendingSelfEcho.shift()
        continue
      }
      if (messagesEqual(pending.message, message)) {
        this.pendingSelfEcho.shift()
        return true
      }
      break
    }
    return false
  }

  getTransportState(): TransportState {
    return this.transportState
  }

  isConnected(): boolean {
    return this.connectionState.isConnected()
  }

  private handleMessage(message: number[]): void {
    if (this.consumeSelfEcho(message)) return

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
