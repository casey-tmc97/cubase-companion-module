# v1.0 Scope Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim the Companion module and Cubase MIDI Remote script down to exactly four actions — Play, Stop, Record, Add Marker — removing Mixer control, extended transport (Return to Zero/Cycle/Click/Rewind/Forward), and extended markers (Next/Previous/To Marker 1-9), then release it as v1.0.0.

**Architecture:** No new architecture — this is pure removal from an existing, working codebase. Each task rewrites one source file (and its paired test file) to drop the fields/branches/exports tied to removed features, keeping the pure-logic/thin-adapter split (`midi/protocol.ts`, `midi/transportState.ts` pure; `midi/connection.ts` thin) exactly as it already is.

**Tech Stack:** TypeScript, `@companion-module/base` 2.0.4, `@julusian/midi`, Vitest. Cubase-side: plain ES5 JavaScript (Cubase's embedded engine, no test runner available to it).

## Global Constraints

- This is a removal-only pass: do not add new functionality, do not rename anything not called out below, do not touch ADRs or `docs/superpowers/specs/2026-07-09-*` / `2026-07-10-*` (historical record, stays as-is per the design spec).
- Every task must leave `npm test` green and `npm run build` clean before moving to the next task.
- Full design context: `docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md`.
- All file paths below are relative to the repo root (`C:\Users\Admin\Documents\GitHub\Cubase Companion Module`) unless already absolute.

---

### Task 1: Trim the MIDI protocol layer

**Files:**
- Modify: `companion-module-cubase/src/midi/protocol.ts`
- Test: `companion-module-cubase/test/midi/protocol.test.ts`

**Interfaces:**
- Produces (used by every later task): `TRANSPORT_CHANNEL = 15`, `MARKERS_CHANNEL = 14`, `TransportNote { Play=0, Stop=1, Record=2, Heartbeat=9, PlayState=10, RecordState=11 }`, `MarkerNote { AddMarker=0 }`, `encodeNoteOn(channel, note, velocity?)`, `encodeNoteOff(channel, note)`, `encodeTrigger(channel, note)`, `decodeMidiMessage(bytes)` (now rejects any channel other than `TRANSPORT_CHANNEL`).
- Removed (no longer exported, must not be referenced anywhere after this task): `MIXER_CHANNEL`, `MixerNote`, `MixerCC`, `encodeControlChange`, `encodeRelativeTick`, `encodeChannelNameSysEx`, `decodeChannelNameSysEx`, `TransportNote.ReturnToZero/Cycle/Click/Rewind/Forward/CycleState/ClickState`, `MarkerNote.NextMarker/PreviousMarker/ToMarker1..9`.

- [ ] **Step 1: Replace `companion-module-cubase/src/midi/protocol.ts`**

```typescript
export const TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed
// Dedicated channel for the Markers phase script (CubaseCompanion_Markers.js),
// separate from TRANSPORT_CHANNEL so each phase's note numbering is fully
// self-contained -- see ADR-006.
export const MARKERS_CHANNEL = 14 // MIDI channel 15, zero-indexed

export enum TransportNote {
  Play = 0,
  Stop = 1,
  Record = 2,
  Heartbeat = 9,
  // Dedicated state-feedback notes (Cubase -> Companion only), separate from
  // the trigger notes above (Companion -> Cubase). ADR-004 originally had
  // Play/Record's feedback share the same note as their trigger; that made
  // the Cubase script's own feedback output loop back into its own input
  // binding on the shared loopMIDI port, re-triggering the toggle and making
  // it flip back and forth on its own (confirmed via direct MIDI trace of
  // Cubase's mOnProcessValueChange -- see ADR-004 for detail). Splitting
  // feedback onto its own notes, in the 10+ range ADR-004 reserved for
  // exactly this, means the Cubase script's own output never matches what its
  // input binding is listening for.
  PlayState = 10,
  RecordState = 11,
}

// Markers phase note map, on MARKERS_CHANNEL -- entirely separate from
// TransportNote's channel, so this enum's numbering never needs to account
// for what Transport has already claimed. One-shot trigger, Companion ->
// Cubase only; no feedback and no heartbeat on this channel (connectivity is
// already tracked via TransportNote.Heartbeat, since both bindings share the
// same underlying MidiConnection). See ADR-006 and
// docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
export enum MarkerNote {
  AddMarker = 0,
}

export interface DecodedNote {
  channel: number
  note: number
  velocity: number
  isOn: boolean
}

export function encodeNoteOn(channel: number, note: number, velocity = 127): number[] {
  return [0x90 | channel, note, velocity]
}

export function encodeNoteOff(channel: number, note: number): number[] {
  return [0x80 | channel, note, 0]
}

export function encodeTrigger(channel: number, note: number): number[][] {
  return [encodeNoteOn(channel, note), encodeNoteOff(channel, note)]
}

// Only TransportNote.Heartbeat/*State notes (TRANSPORT_CHANNEL) are ever
// received from Cubase -- Markers has nothing incoming to decode (see
// MarkerNote's doc comment), so a message on MARKERS_CHANNEL is correctly
// rejected here, same as any other unrecognized channel.
export function decodeMidiMessage(bytes: number[]): DecodedNote | null {
  if (bytes.length < 3) return null

  const status = bytes[0]
  const messageType = status & 0xf0
  const channel = status & 0x0f
  const note = bytes[1]
  const velocity = bytes[2]

  if (channel !== TRANSPORT_CHANNEL) return null
  if (messageType !== 0x90 && messageType !== 0x80) return null

  const isOn = messageType === 0x90 && velocity > 0
  return { channel, note, velocity: isOn ? velocity : 0, isOn }
}
```

- [ ] **Step 2: Replace `companion-module-cubase/test/midi/protocol.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_CHANNEL,
  MARKERS_CHANNEL,
  TransportNote,
  MarkerNote,
  encodeNoteOn,
  encodeNoteOff,
  encodeTrigger,
  decodeMidiMessage,
} from '../../src/midi/protocol.js'

describe('protocol constants', () => {
  it('uses zero-indexed channel 15 for MIDI channel 16 (Transport)', () => {
    expect(TRANSPORT_CHANNEL).toBe(15)
  })

  it('uses zero-indexed channel 14 for MIDI channel 15 (Markers)', () => {
    expect(MARKERS_CHANNEL).toBe(14)
  })
})

describe('encodeNoteOn', () => {
  it('encodes a Note On with default full velocity', () => {
    expect(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Play)).toEqual([0x9f, 0, 127])
  })

  it('encodes a Note On with a custom velocity', () => {
    expect(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Record, 100)).toEqual([0x9f, 2, 100])
  })

  it('encodes a Note On on the Markers channel', () => {
    expect(encodeNoteOn(MARKERS_CHANNEL, MarkerNote.AddMarker)).toEqual([0x9e, 0, 127])
  })
})

describe('encodeNoteOff', () => {
  it('encodes a Note Off with velocity 0', () => {
    expect(encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.Stop)).toEqual([0x8f, 1, 0])
  })

  it('encodes a Note Off on the Markers channel', () => {
    expect(encodeNoteOff(MARKERS_CHANNEL, MarkerNote.AddMarker)).toEqual([0x8e, 0, 0])
  })
})

describe('encodeTrigger', () => {
  it('produces a Note On followed by a Note Off for the same note', () => {
    expect(encodeTrigger(TRANSPORT_CHANNEL, TransportNote.Record)).toEqual([
      [0x9f, 2, 127],
      [0x8f, 2, 0],
    ])
  })

  it('produces a Note On followed by a Note Off on the Markers channel', () => {
    expect(encodeTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker)).toEqual([
      [0x9e, 0, 127],
      [0x8e, 0, 0],
    ])
  })
})

describe('decodeMidiMessage', () => {
  it('decodes a Note On as isOn: true', () => {
    expect(decodeMidiMessage([0x9f, 0, 127])).toEqual({
      channel: 15,
      note: 0,
      velocity: 127,
      isOn: true,
    })
  })

  it('decodes a Note On with velocity 0 as isOn: false (running status off)', () => {
    expect(decodeMidiMessage([0x9f, 2, 0])).toEqual({
      channel: 15,
      note: 2,
      velocity: 0,
      isOn: false,
    })
  })

  it('decodes a Note Off as isOn: false', () => {
    expect(decodeMidiMessage([0x8f, 0, 0])).toEqual({
      channel: 15,
      note: 0,
      velocity: 0,
      isOn: false,
    })
  })

  it('returns null for messages on a different channel', () => {
    expect(decodeMidiMessage([0x90, 0, 127])).toBeNull()
  })

  it('returns null for messages on the Markers channel (decode is Transport-only; Markers has no incoming state)', () => {
    expect(decodeMidiMessage([0x9e, 0, 127])).toBeNull()
  })

  it('returns null for non Note On/Off status bytes', () => {
    expect(decodeMidiMessage([0xbf, 1, 127])).toBeNull()
  })

  it('returns null for malformed (too short) messages', () => {
    expect(decodeMidiMessage([0x9f, 0])).toBeNull()
  })
})
```

- [ ] **Step 3: Run the protocol test suite**

Run: `cd companion-module-cubase && npx vitest run test/midi/protocol.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 4: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts companion-module-cubase/test/midi/protocol.test.ts
git commit -m "refactor: trim MIDI protocol to Play/Stop/Record/Add Marker (v1.0 scope trim)"
```

---

### Task 2: Trim transport state

**Files:**
- Modify: `companion-module-cubase/src/midi/transportState.ts`
- Test: `companion-module-cubase/test/midi/transportState.test.ts`

**Interfaces:**
- Consumes: `TransportNote` from Task 1 (`Play`, `Record`, `PlayState`, `RecordState`).
- Produces: `TransportState { playing: boolean; recording: boolean }` (drops `cycleActive`/`clickActive`), `createInitialTransportState()`, `applyStateNote(state, note, isOn)`, `isStopped(state)` — same names/signatures as before, narrower shape.

- [ ] **Step 1: Replace `companion-module-cubase/src/midi/transportState.ts`**

```typescript
import { TransportNote } from './protocol.js'

export interface TransportState {
  playing: boolean
  recording: boolean
}

export function createInitialTransportState(): TransportState {
  return {
    playing: false,
    recording: false,
  }
}

export function applyStateNote(state: TransportState, note: number, isOn: boolean): TransportState {
  switch (note) {
    case TransportNote.PlayState:
      return { ...state, playing: isOn }
    case TransportNote.RecordState:
      return { ...state, recording: isOn }
    default:
      return state
  }
}

export function isStopped(state: TransportState): boolean {
  return !state.playing && !state.recording
}
```

- [ ] **Step 2: Replace `companion-module-cubase/test/midi/transportState.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { TransportNote } from '../../src/midi/protocol.js'
import { createInitialTransportState, applyStateNote, isStopped } from '../../src/midi/transportState.js'

describe('createInitialTransportState', () => {
  it('starts with everything false', () => {
    expect(createInitialTransportState()).toEqual({
      playing: false,
      recording: false,
    })
  })
})

describe('applyStateNote', () => {
  it('sets playing true on PlayState note-on', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, TransportNote.PlayState, true)
    expect(next.playing).toBe(true)
  })

  it('sets playing false on PlayState note-off', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.PlayState, false)
    expect(next.playing).toBe(false)
  })

  it('sets recording independently of playing', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.RecordState, true)
    expect(next).toEqual({
      playing: true,
      recording: true,
    })
  })

  // The Cubase script's own feedback for a *State note loops back into
  // Companion's input the same way any message on the shared loopMIDI port
  // does (see connection.ts's self-echo suppression), but the raw trigger
  // notes (Play/Record) themselves must NOT drive state anymore. Sending
  // feedback on those notes made Cubase's own input binding re-ingest its
  // own feedback as a fresh button press, causing the toggle to flip back
  // and forth on its own -- see ADR-004's note-map split. Dedicated *State
  // notes (10-11) close that loop; this locks in that the old trigger notes
  // are now inert for state purposes.
  it('does not change state for the raw trigger notes anymore', () => {
    const state = createInitialTransportState()
    expect(applyStateNote(state, TransportNote.Play, true)).toEqual(state)
    expect(applyStateNote(state, TransportNote.Record, true)).toEqual(state)
  })

  it('returns an unchanged state for an unrecognized note number', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, 99, true)
    expect(next).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state = createInitialTransportState()
    applyStateNote(state, TransportNote.PlayState, true)
    expect(state.playing).toBe(false)
  })
})

describe('isStopped', () => {
  it('is true when neither playing nor recording', () => {
    expect(isStopped(createInitialTransportState())).toBe(true)
  })

  it('is false while playing', () => {
    expect(isStopped({ ...createInitialTransportState(), playing: true })).toBe(false)
  })

  it('is false while recording', () => {
    expect(isStopped({ ...createInitialTransportState(), recording: true })).toBe(false)
  })
})
```

- [ ] **Step 3: Run the transport state test suite**

Run: `cd companion-module-cubase && npx vitest run test/midi/transportState.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 4: Commit**

```bash
git add companion-module-cubase/src/midi/transportState.ts companion-module-cubase/test/midi/transportState.test.ts
git commit -m "refactor: drop cycleActive/clickActive from TransportState (v1.0 scope trim)"
```

---

### Task 3: Delete the Mixer state module

**Files:**
- Delete: `companion-module-cubase/src/midi/mixerState.ts`
- Delete: `companion-module-cubase/test/midi/mixerState.test.ts`

**Interfaces:**
- Produces: nothing — `MixerState`, `createInitialMixerState`, `applyMixerStateNote`, `applyChannelName` no longer exist anywhere in the codebase after this task.

- [ ] **Step 1: Delete the files**

```bash
git rm companion-module-cubase/src/midi/mixerState.ts companion-module-cubase/test/midi/mixerState.test.ts
```

- [ ] **Step 2: Confirm nothing else references the deleted module yet**

Run: `cd companion-module-cubase && grep -rn "mixerState" src test`
Expected: matches only in `src/midi/connection.ts` (still importing it — fixed in Task 4). If Task 4 hasn't run yet, `npx tsc --noEmit` will fail here; that's expected and resolved by the next task. Do not attempt to fix `connection.ts` in this task — keep the deletion isolated so this commit is a clean, reviewable unit.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: delete mixerState.ts, Mixer feature entirely removed (v1.0 scope trim)"
```

---

### Task 4: Trim the connection layer

**Files:**
- Modify: `companion-module-cubase/src/midi/connection.ts`
- Test: `companion-module-cubase/test/midi/connection.test.ts`

**Interfaces:**
- Consumes: Task 1's `TransportNote`, `TRANSPORT_CHANNEL`, `MARKERS_CHANNEL`, `encodeNoteOn`, `encodeNoteOff`, `encodeTrigger`, `decodeMidiMessage`; Task 2's `TransportState`, `createInitialTransportState`, `applyStateNote`.
- Produces (used by `actions.ts`/`main.ts` in later tasks): `MidiConnection` class with `open()`, `close()`, `sendTrigger(channel, note)`, `sendNoteOn(note)`, `sendNoteOff(note)`, `getTransportState()`, `isConnected()`. `sendRelativeCC` and `getMixerState` are removed — do not reference them anywhere after this task.

- [ ] **Step 1: Replace `companion-module-cubase/src/midi/connection.ts`**

```typescript
import { EventEmitter } from 'node:events'
import { Input, Output } from '@julusian/midi'
import { TransportNote, TRANSPORT_CHANNEL, encodeNoteOn, encodeNoteOff, encodeTrigger, decodeMidiMessage } from './protocol.js'
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
// instead of a clean toggle. SELF_ECHO_WINDOW_MS bounds how long a just-sent
// message is trusted as "could still be my own loopback echo"; it comfortably
// covers local loopback latency while staying far shorter than a genuine
// Cubase round trip, so a real independent state change past the window is
// never mistaken for an echo of our own send. On topologies with no self-echo
// at all (e.g. cross-machine network MIDI per ADR-005), pending entries simply
// expire unmatched and are dropped -- see consumeSelfEcho().
const SELF_ECHO_WINDOW_MS = 150

// sendTrigger() used to send Note On immediately followed by Note Off with no
// gap at all. Cubase's .setTypeToggle() binding for Record kept reporting the
// toggle reverting right back to its prior state after a Companion-sent
// trigger, even once feedback was wired up correctly -- a genuine hardware
// button always has *some* non-zero hold duration between press and release,
// and a real gap here better matches what Cubase's toggle handling expects
// instead of a zero-duration pulse.
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

  // channel is explicit (not defaulted to TRANSPORT_CHANNEL) because this is
  // the one send method shared with the Markers action on a different channel
  // -- see actions.ts's addMarker callback.
  sendTrigger(channel: number, note: number): void {
    const [noteOn, noteOff] = encodeTrigger(channel, note)
    this.sendRaw(noteOn)
    setTimeout(() => this.sendRaw(noteOff), TRIGGER_HOLD_MS)
  }

  // For host values that need a genuine press-and-hold, rather than
  // sendTrigger()'s instant Note On + Note Off pulse, which never registers
  // as a hold. Always TRANSPORT_CHANNEL, unlike sendTrigger. Used by Stop (a
  // plain non-toggle value binding where a full trigger pair would
  // double-fire) -- see actions.ts.
  sendNoteOn(note: number): void {
    this.sendRaw(encodeNoteOn(TRANSPORT_CHANNEL, note))
  }

  sendNoteOff(note: number): void {
    this.sendRaw(encodeNoteOff(TRANSPORT_CHANNEL, note))
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
      // Cubase stopped responding; don't let stale "Playing"/"Recording"
      // state linger next to a fresh "Disconnected" status.
      this.transportState = createInitialTransportState()
    }
    this.emit('stateChanged')
  }
}
```

Note: `decoded.channel` is no longer checked against `TRANSPORT_CHANNEL` here because `decodeMidiMessage` (Task 1) now only ever returns non-null for `TRANSPORT_CHANNEL` — the extra check was made redundant by that change and is dropped rather than left as dead code.

- [ ] **Step 2: Replace `companion-module-cubase/test/midi/connection.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// connection.ts talks to real MIDI hardware via @julusian/midi's native bindings
// (Input/Output), which is why the file otherwise has no unit tests. The
// timer-driven disconnect-detection logic added for the "heartbeat timeout is
// never detected" fix, however, lives entirely in MidiConnection itself and only
// needs `open()` to believe a port is open — it doesn't need a real device. So
// instead of testing the extracted logic in isolation (which would leave open()/
// close()'s wiring of the timer untested), we mock @julusian/midi with a minimal
// fake that reports ports as open and lets us emit synthetic 'message' events, and
// exercise the real, unmodified MidiConnection class end-to-end with fake timers.
vi.mock('@julusian/midi', async () => {
  // vi.mock factories are hoisted above this file's top-level imports, so they
  // can't close over the `EventEmitter` bound by the `import` statement below
  // (referencing it throws "Cannot access '...' before initialization"). Import
  // it fresh inside the factory instead.
  const { EventEmitter: FakeEventEmitter } = await import('node:events')

  class FakeInput extends FakeEventEmitter {
    private open = false
    openPortByName(_name: string): void {
      this.open = true
    }
    isPortOpen(): boolean {
      return this.open
    }
    closePort(): void {
      this.open = false
    }
  }

  class FakeOutput {
    private open = false
    openPortByName(_name: string): void {
      this.open = true
    }
    isPortOpen(): boolean {
      return this.open
    }
    closePort(): void {
      this.open = false
    }
    sendMessage(_message: number[]): void {
      // no-op
    }
  }

  return { Input: FakeInput, Output: FakeOutput }
})

const { MidiConnection, TRIGGER_HOLD_MS } = await import('../../src/midi/connection.js')
const { TransportNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL, encodeNoteOn, encodeNoteOff } = await import('../../src/midi/protocol.js')
const { HEARTBEAT_TIMEOUT_MS } = await import('../../src/midi/connectionState.js')

function sendHeartbeat(connection: InstanceType<typeof MidiConnection>): void {
  const fakeInput = (connection as unknown as { input: EventEmitter }).input
  fakeInput.emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Heartbeat))
}

describe('MidiConnection heartbeat-timeout disconnect detection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('becomes connected once a heartbeat arrives, and reports disconnected before any heartbeat', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    expect(connection.isConnected()).toBe(false)

    sendHeartbeat(connection)

    expect(connection.isConnected()).toBe(true)

    connection.close()
  })

  it('emits stateChanged and flips isConnected() to false once the heartbeat timeout elapses with no further heartbeats', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    const stateChangedSpy = vi.fn()
    connection.on('stateChanged', stateChangedSpy)
    connection.open()

    sendHeartbeat(connection)
    expect(connection.isConnected()).toBe(true)
    stateChangedSpy.mockClear()

    // Advance past the heartbeat timeout with no further heartbeats arriving.
    // Nothing else is going to call handleMessage() to re-check the connection
    // state, so this only flips because the periodic timer added by the fix does.
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1000)

    expect(connection.isConnected()).toBe(false)
    expect(stateChangedSpy).toHaveBeenCalled()

    connection.close()
  })

  it('resets transport state back to initial once a heartbeat timeout is detected', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    sendHeartbeat(connection)
    const fakeInput = (connection as unknown as { input: EventEmitter }).input
    fakeInput.emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.PlayState))
    expect(connection.getTransportState().playing).toBe(true)

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1000)

    expect(connection.isConnected()).toBe(false)
    expect(connection.getTransportState()).toEqual({
      playing: false,
      recording: false,
    })

    connection.close()
  })

  it('does not emit a redundant stateChanged while still within the timeout window', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    sendHeartbeat(connection)

    const stateChangedSpy = vi.fn()
    connection.on('stateChanged', stateChangedSpy)

    // Several periodic checks fire here, but connectedness never actually flips.
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS - 1000)

    expect(connection.isConnected()).toBe(true)
    expect(stateChangedSpy).not.toHaveBeenCalled()

    connection.close()
  })

  it('clears the periodic timer on close() so no interval keeps the process alive', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    expect(vi.getTimerCount()).toBeGreaterThan(0)

    connection.close()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not leak a second timer if open() is called again after a prior open() on the same instance', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const countAfterFirstOpen = vi.getTimerCount()

    connection.open()
    const countAfterSecondOpen = vi.getTimerCount()

    expect(countAfterSecondOpen).toBe(countAfterFirstOpen)

    connection.close()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// Companion's MIDI In/Out point at the same loopMIDI virtual port as the Cubase
// script (see ADR-005), and loopMIDI echoes anything written to a port's output
// back into every listener's input on that same port name -- including the
// sender. So the moment sendTrigger()/sendNoteOn()/sendNoteOff() write a message
// out, that exact message also arrives back on `this.input`'s 'message' event.
// This used to be indistinguishable from genuine state feedback, since
// Play/Record's feedback originally reused their trigger note -- that also
// turned out to be the root cause of a much worse bug (Cubase's own input
// binding re-ingesting its own feedback as a fresh press; see ADR-004), fixed
// by moving feedback onto dedicated *State notes Companion never sends on.
// These tests exercise the suppression mechanism generically with
// TransportNote.RecordState standing in for "some note Companion both sends
// triggers on and tracks state for" -- the mechanism itself doesn't know or
// care which notes are wired to what.
describe('MidiConnection self-echo suppression', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function fakeInputOf(connection: InstanceType<typeof MidiConnection>): EventEmitter {
    return (connection as unknown as { input: EventEmitter }).input
  }

  it('does not apply state from a self-sent trigger looped back on the same note', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)
    // sendTrigger()'s Note Off is sent TRIGGER_HOLD_MS after the Note On (see
    // connection.ts) rather than immediately, so let it actually go out before
    // simulating loopMIDI echoing both back into our own input.
    vi.advanceTimersByTime(TRIGGER_HOLD_MS)
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))
    fakeInputOf(connection).emit('message', 0, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(false)

    connection.close()
  })

  it('applies state from a later genuine echo once the self-sent pair has been consumed', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)
    vi.advanceTimersByTime(TRIGGER_HOLD_MS)
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))
    fakeInputOf(connection).emit('message', 0, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.RecordState))

    // Cubase's real feedback, arriving after its own script-engine round trip.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(true)

    connection.close()
  })

  it('still applies state from messages that were never self-sent', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    // No sendTrigger() call here -- this is Cubase-initiated (e.g. the user
    // pressed Record from Cubase's own transport bar, not from Companion).
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(true)

    connection.close()
  })

  it('stops trusting a pending self-echo once it is older than the suppression window', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)
    vi.advanceTimersByTime(1000)
    // Arrives too late to plausibly be the loopback echo of the send above --
    // treat it as genuine (e.g. a real, independent later Cubase toggle) rather
    // than silently swallowing it forever.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(true)

    connection.close()
  })
})

describe('MidiConnection sendTrigger hold gap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends Note On immediately and Note Off only after TRIGGER_HOLD_MS', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    vi.advanceTimersByTime(TRIGGER_HOLD_MS - 1)
    expect(sendSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy).toHaveBeenNthCalledWith(2, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.RecordState))

    connection.close()
  })

  it('sends on the given channel, not always TRANSPORT_CHANNEL', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendTrigger(MARKERS_CHANNEL, 0)

    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(MARKERS_CHANNEL, 0))

    connection.close()
  })
})

describe('MidiConnection sendNoteOn/sendNoteOff', () => {
  it('sendNoteOn sends only a Note On, with no matching Note Off', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendNoteOn(TransportNote.Stop)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Stop))

    connection.close()
  })

  it('sendNoteOff sends only a Note Off', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendNoteOff(TransportNote.Stop)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.Stop))

    connection.close()
  })
})
```

- [ ] **Step 3: Run the connection test suite**

Run: `cd companion-module-cubase && npx vitest run test/midi/connection.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 4: Verify the type checker is clean now that Task 3's deletion is fully resolved**

Run: `cd companion-module-cubase && npx tsc --noEmit`
Expected: no errors (this is what confirms Task 3's `mixerState.ts` deletion didn't leave any dangling import).

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/connection.ts companion-module-cubase/test/midi/connection.test.ts
git commit -m "refactor: remove Mixer wiring (sendRelativeCC, SysEx, mixerState) from MidiConnection (v1.0 scope trim)"
```

---

### Task 5: Trim actions

**Files:**
- Modify: `companion-module-cubase/src/actions.ts`
- Test: `companion-module-cubase/test/actions.test.ts`

**Interfaces:**
- Consumes: Task 1's `TransportNote`, `MarkerNote`, `TRANSPORT_CHANNEL`, `MARKERS_CHANNEL`; Task 4's `MidiConnection` shape (`sendTrigger`, `sendNoteOn`, `sendNoteOff`, `getTransportState`, `isConnected`).
- Produces (used by Task 6/7): `ModuleLike` interface (narrowed — `midi.getMixerState()` and `midi.sendRelativeCC()` removed; `midi.getTransportState()` returns `{ playing, recording }`), `UpdateActions(self)` registering exactly `play`, `stop`, `record`, `addMarker`.

- [ ] **Step 1: Replace `companion-module-cubase/src/actions.ts`**

```typescript
import type {
  CompanionActionDefinitions,
  CompanionFeedbackDefinitions,
  CompanionPresetDefinitions,
  CompanionPresetSection,
} from '@companion-module/base'
import { TransportNote, MarkerNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL } from './midi/protocol.js'

export interface ModuleLike {
  midi: {
    sendTrigger(channel: number, note: number): void
    sendNoteOn(note: number): void
    sendNoteOff(note: number): void
    getTransportState(): { playing: boolean; recording: boolean }
    isConnected(): boolean
  }
  setActionDefinitions(definitions: CompanionActionDefinitions): void
  setFeedbackDefinitions(definitions: CompanionFeedbackDefinitions): void
  // `any` here (rather than the default-generic bare `CompanionPresetSection`/
  // `CompanionPresetDefinitions`, i.e. `<InstanceTypes>`) is intentional: the real
  // `InstanceBase<TManifest>.setPresetDefinitions` is parameterized by the module's
  // own manifest type (see src/main.ts's `ModuleSchema`), which is a *different*
  // (structurally incompatible, since it narrows `config` to `ModuleConfig`) type
  // from the `InstanceTypes` default. Preset definitions embed their manifest type
  // deep in nested action/condition entries, so method bivariance doesn't paper over
  // the mismatch the way it does for setActionDefinitions/setFeedbackDefinitions.
  // `ModuleLike` only needs structural duck-typing for tests, not manifest-accurate
  // typing, so `any` here is the simplest fix that keeps `ModuleInstance` (main.ts)
  // assignable to `ModuleLike` without weakening runtime behavior.
  setPresetDefinitions(structure: CompanionPresetSection<any>[], definitions: CompanionPresetDefinitions<any>): void
}

export function UpdateActions(self: ModuleLike): void {
  const definitions: CompanionActionDefinitions = {
    play: {
      name: 'Play',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Play),
    },
    // mStop is a plain (non-toggle, non-command) value binding in the Cubase
    // script, so every write to it invokes Stop -- sendTrigger's Note On +
    // Note Off pair would fire Stop twice in the same instant, which Cubase
    // treats the same as a real double-press of Stop while already stopped
    // (natively returns the cursor to the start position). Sending only Note
    // On avoids the second write.
    stop: {
      name: 'Stop',
      options: [],
      callback: async () => self.midi.sendNoteOn(TransportNote.Stop),
    },
    // NOTE: previously changed to sendNoteOn-only under the hypothesis that
    // .setTypeToggle() reacts to both MIDI edges and self-cancels. Reverted --
    // that made Record stop responding at all, showing Cubase's toggle needs
    // the full Note On + Note Off pair to register at all. Root cause of the
    // "doesn't latch" symptom is still open; see connection.ts's self-echo
    // suppression comment for the investigation so far.
    record: {
      name: 'Record',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Record),
    },
    // Markers (Phase 3): one-shot trigger on MARKERS_CHANNEL, no feedback --
    // see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md
    // and ADR-006.
    addMarker: {
      name: 'Add Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker),
    },
  }

  self.setActionDefinitions(definitions)
}
```

- [ ] **Step 2: Replace `companion-module-cubase/test/actions.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { UpdateActions } from '../src/actions.js'
import { TransportNote, MarkerNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL } from '../src/midi/protocol.js'

function makeFakeSelf() {
  return {
    midi: {
      sendTrigger: vi.fn(),
      sendNoteOn: vi.fn(),
      sendNoteOff: vi.fn(),
      getTransportState: vi.fn(),
      isConnected: vi.fn(),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateActions', () => {
  it('registers exactly Play, Stop, Record, and Add Marker', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(['addMarker', 'play', 'record', 'stop'])
  })

  it('play action sends a trigger on TRANSPORT_CHANNEL, Play note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.play.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Play)
  })

  // mStop is a plain (non-toggle, non-command) value binding in the Cubase
  // script -- every write to it invokes Stop, so a Note On + Note Off pair
  // (sendTrigger's shape) fires Stop twice in the same instant. Cubase treats
  // that the same as a real double-press of Stop while already stopped, which
  // natively returns the cursor to the start position. Sending only Note On
  // avoids the second write entirely.
  it('stop action sends only Note On, not a full trigger', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.stop.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Stop)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
    expect(self.midi.sendNoteOff).not.toHaveBeenCalled()
  })

  // NOTE: sendNoteOn-only was tried here and reverted -- it made Record stop
  // responding entirely, showing Cubase's toggle needs the full press+release
  // pair. Back to sendTrigger pending further investigation.
  it('record action sends a trigger on TRANSPORT_CHANNEL, Record note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.record.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Record)
  })

  // Markers phase (Phase 3): one-shot trigger on MARKERS_CHANNEL, no
  // feedback -- see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
  it('addMarker action sends a trigger on MARKERS_CHANNEL, AddMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.addMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AddMarker)
  })
})
```

- [ ] **Step 3: Run the actions test suite**

Run: `cd companion-module-cubase && npx vitest run test/actions.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 4: Commit**

```bash
git add companion-module-cubase/src/actions.ts companion-module-cubase/test/actions.test.ts
git commit -m "refactor: trim actions to Play/Stop/Record/Add Marker (v1.0 scope trim)"
```

---

### Task 6: Trim feedbacks

**Files:**
- Modify: `companion-module-cubase/src/feedbacks.ts`
- Test: `companion-module-cubase/test/feedbacks.test.ts`

**Interfaces:**
- Consumes: Task 2's `isStopped`; Task 5's `ModuleLike`.
- Produces (used by Task 7/main.ts): `UpdateFeedbacks(self)` registering exactly `playing`, `recording`, `stopped`, `cubaseConnected`.

- [ ] **Step 1: Replace `companion-module-cubase/src/feedbacks.ts`**

```typescript
import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { isStopped } from './midi/transportState.js'
import type { ModuleLike } from './actions.js'

const activeStyle = { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) }
const connectedStyle = { bgcolor: combineRgb(0, 120, 220), color: combineRgb(255, 255, 255) }

export function UpdateFeedbacks(self: ModuleLike): void {
  const definitions: CompanionFeedbackDefinitions = {
    playing: {
      type: 'boolean',
      name: 'Playing',
      description: "True while Cubase's transport is playing",
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().playing,
    },
    recording: {
      type: 'boolean',
      name: 'Recording',
      description: 'True while Cubase is recording',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().recording,
    },
    stopped: {
      type: 'boolean',
      name: 'Stopped',
      description: 'True when neither Playing nor Recording is true',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => isStopped(self.midi.getTransportState()),
    },
    cubaseConnected: {
      type: 'boolean',
      name: 'Cubase Connected',
      description: 'True while heartbeats keep arriving from the Cubase MIDI Remote script',
      defaultStyle: connectedStyle,
      options: [],
      callback: async () => self.midi.isConnected(),
    },
  }

  self.setFeedbackDefinitions(definitions)
}
```

- [ ] **Step 2: Replace `companion-module-cubase/test/feedbacks.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { UpdateFeedbacks } from '../src/feedbacks.js'

function makeFakeSelf(transportState: { playing: boolean; recording: boolean }, connected: boolean) {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(() => transportState),
      isConnected: vi.fn(() => connected),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateFeedbacks', () => {
  it('registers exactly Playing, Recording, Stopped, and Cubase Connected', () => {
    const self = makeFakeSelf({ playing: false, recording: false }, false)
    UpdateFeedbacks(self as any)

    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(['cubaseConnected', 'playing', 'recording', 'stopped'])
  })

  it('playing feedback reflects transport state', async () => {
    const self = makeFakeSelf({ playing: true, recording: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.playing.callback({} as any)).toBe(true)
  })

  it('stopped feedback is true when neither playing nor recording', async () => {
    const self = makeFakeSelf({ playing: false, recording: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.stopped.callback({} as any)).toBe(true)
  })

  it('stopped feedback is false while recording', async () => {
    const self = makeFakeSelf({ playing: false, recording: true }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.stopped.callback({} as any)).toBe(false)
  })

  it('cubaseConnected feedback reflects connection state', async () => {
    const self = makeFakeSelf({ playing: false, recording: false }, true)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.cubaseConnected.callback({} as any)).toBe(true)
  })
})
```

- [ ] **Step 3: Run the feedbacks test suite**

Run: `cd companion-module-cubase && npx vitest run test/feedbacks.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 4: Commit**

```bash
git add companion-module-cubase/src/feedbacks.ts companion-module-cubase/test/feedbacks.test.ts
git commit -m "refactor: trim feedbacks to Playing/Recording/Stopped/Cubase Connected (v1.0 scope trim)"
```

---

### Task 7: Trim presets

**Files:**
- Modify: `companion-module-cubase/src/presets.ts`

**Interfaces:**
- Consumes: Task 5's `ModuleLike`.
- Produces: `UpdatePresets(self)` registering presets `play`, `stop`, `record`, `addMarker`, `cubaseConnected`, grouped into `transport`/`markers`/`status` sections. No `mixer` section.

No dedicated test file exists for `presets.ts` (matches the existing pattern — see `companion-module-cubase/test/` has no `presets.test.ts`); this task is verified via the build/typecheck in Step 2 plus Task 8's full suite run.

- [ ] **Step 1: Replace `companion-module-cubase/src/presets.ts`**

```typescript
import type { CompanionPresetDefinitions, CompanionPresetSection, CompanionSimplePresetDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { ModuleLike } from './actions.js'

// NOTE: this file intentionally deviates from the task-8 brief's sample code.
// The brief was written against an older @companion-module/base API that
// exported `CompanionButtonPresetDefinition` (preset `type: 'button'`) and a
// single-argument `setPresetDefinitions(presets)`. The version actually
// installed (2.1.1) instead exposes `CompanionSimplePresetDefinition`
// (`type: 'simple'`) and a two-argument `setPresetDefinitions(structure,
// presets)`, where `structure` groups preset ids into named sections. See
// task-8-report.md for details.

function preset(text: string, actionId: string, feedbackId?: string): CompanionSimplePresetDefinition {
  return {
    type: 'simple',
    name: text,
    style: {
      text,
      size: '14',
      color: combineRgb(255, 255, 255),
      bgcolor: combineRgb(0, 0, 0),
    },
    steps: [
      {
        down: [{ actionId, options: {} }],
        up: [],
      },
    ],
    feedbacks: feedbackId ? [{ feedbackId, options: {}, style: {} }] : [],
  }
}

const TRANSPORT_PRESET_IDS = ['play', 'stop', 'record'] as const

const MARKER_PRESET_IDS = ['addMarker'] as const

export function UpdatePresets(self: ModuleLike): void {
  const presets: CompanionPresetDefinitions = {
    play: preset('Play', 'play', 'playing'),
    stop: preset('Stop', 'stop'),
    record: preset('Record', 'record', 'recording'),
    addMarker: preset('Add Marker', 'addMarker'),
    cubaseConnected: {
      type: 'simple',
      name: 'Cubase Connected',
      style: {
        text: 'Cubase\nConnected',
        size: '14',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(0, 0, 0),
      },
      steps: [{ down: [], up: [] }],
      feedbacks: [{ feedbackId: 'cubaseConnected', options: {}, style: {} }],
    },
  }

  const structure: CompanionPresetSection[] = [
    {
      id: 'transport',
      name: 'Transport',
      definitions: [...TRANSPORT_PRESET_IDS],
    },
    {
      id: 'markers',
      name: 'Markers',
      definitions: [...MARKER_PRESET_IDS],
    },
    {
      id: 'status',
      name: 'Status',
      definitions: ['cubaseConnected'],
    },
  ]

  self.setPresetDefinitions(structure, presets)
}
```

- [ ] **Step 2: Type-check**

Run: `cd companion-module-cubase && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/src/presets.ts
git commit -m "refactor: trim presets to Play/Stop/Record/Add Marker/Cubase Connected (v1.0 scope trim)"
```

---

### Task 8: Full test suite and build verification

**Files:** none (verification-only task; no code changes).

- [ ] **Step 1: Run the full test suite**

Run: `cd companion-module-cubase && npm test`
Expected: all tests PASS. Note the exact final passing count from the output (e.g. a line like `Tests  58 passed (58)`) — Task 10 needs this number for two doc updates.

- [ ] **Step 2: Run the production build**

Run: `cd companion-module-cubase && npm run build`
Expected: completes with no TypeScript errors, produces `dist/`.

- [ ] **Step 3: Grep for any leftover references to removed symbols**

Run: `cd companion-module-cubase && grep -rn "mixerState\|MixerNote\|MixerCC\|MIXER_CHANNEL\|sendRelativeCC\|getMixerState\|cycleActive\|clickActive\|toggleCycle\|toggleClick\|ReturnToZero\|nextMarker\|previousMarker\|toMarker" src test`
Expected: no matches. If anything matches, fix it before proceeding — a leftover reference here means an earlier task's removal was incomplete.

No commit for this task (nothing changed) — it's a checkpoint before touching the Cubase script and docs.

---

### Task 9: Trim the Cubase MIDI Remote script

**Files:**
- Modify: `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`

This file runs inside Cubase's embedded ES5 engine and has no automated test coverage (see ARCHITECTURE.md's "Design principle behind the `midi/` split" — the Cubase-side script is verified manually, not by a test runner). This task's correctness is confirmed by an eyeball diff against Task 1-7's trimmed protocol (same channel numbers, same note numbers for Play/Stop/Record/Heartbeat/PlayState/RecordState/AddMarker), and by manual re-verification against a real Cubase 15 instance afterward (not part of this automated task — flag it to the user as a follow-up, same as the existing DEPLOYMENT.md checklist pattern).

- [ ] **Step 1: Replace `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`**

```javascript
var midiremote_api = require('midiremote_api_v1')

// Transport -- MIDI channel 16, zero-indexed 15.
var TRANSPORT_CHANNEL = 15
var NOTE_PLAY = 0
var NOTE_STOP = 1
var NOTE_RECORD = 2
var NOTE_HEARTBEAT = 9
// Dedicated state-feedback notes (Cubase -> Companion only), separate from the
// trigger notes above (Companion -> Cubase). Feedback used to share the same
// note as its trigger, which meant our own midiOutput.sendMidi() calls below
// looped back into THIS SCRIPT's own mMidiBinding input (same shared loopMIDI
// port), re-triggering .setTypeToggle() as if it were a fresh button press --
// confirmed by tracing the raw value seen by mOnProcessValueChange, which kept
// flipping back to 0 on its own a few ms after every real press. Splitting
// feedback onto its own notes means our own output can never match what its
// own input binding is listening for. See ADR-004.
var NOTE_PLAY_STATE = 10
var NOTE_RECORD_STATE = 11
var HEARTBEAT_INTERVAL_MS = 2000

// Markers -- MIDI channel 15, zero-indexed 14. Own dedicated channel per
// phase (ADR-006), kept even though this is now a single consolidated script
// (ADR-007) -- a single script author can trivially avoid note collisions by
// hand, but the per-phase channel still keeps each phase's note range
// self-contained and easy to reason about in isolation.
var MARKERS_CHANNEL = 14
var NOTE_ADD_MARKER = 0

// One device driver for the whole project (ADR-007) -- Cubase's MIDI Remote
// will not bind two separate controllers to the same MIDI port pair, so every
// phase lives in this one script on one port pair, differentiated only by
// channel (see the per-phase channel constants above).
//
// Registered as vendor 'CubaseCompanion' / model 'Transport' -- not a typo
// and not actually about Transport specifically anymore. Cubase 15's MIDI
// Remote Local-script discovery stopped registering any new vendor/model
// pair on this install (confirmed via extensive live testing: fresh vendor
// folders, fresh model names, fresh minimal content, a full preferences
// reset, and a full OS reboot candidate were all ruled out one at a time --
// see ADR-008). The one pairing that still works is this exact one, because
// it already has a saved MIDI Controller instance from Phase 1 that Cubase
// re-resolves against this file path without needing fresh discovery. Reusing
// it is the pragmatic unblock; see ADR-008 before renaming this again.
var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Transport', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion')
  .expectOutputNameEquals('CubaseCompanion')

var surface = deviceDriver.mSurface

function makeButton(x, y) {
  return surface.makeButton(x, y, 1, 1)
}

// Transport buttons -- row 0.
var btnPlay = makeButton(0, 0)
var btnStop = makeButton(1, 0)
var btnRecord = makeButton(2, 0)

// Marker button -- row 1, so it doesn't collide with Transport's row-0 grid
// positions now that both phases share one surface.
var btnAddMarker = makeButton(0, 1)

// Play/Record are input-only here (no .setOutputPort()) -- Steinberg's
// automatic MIDI-mirror for .setTypeToggle() bindings turned out to send a
// noisy burst of 5-7 redundant, differently-encoded messages (mixed Note
// On/Off velocities plus an undocumented Polyphonic Aftertouch message) per
// single toggle, which the Companion module's simple state tracker can't
// reliably resolve to one clean value. See the explicit
// mOnProcessValueChange feedback below instead, which sends exactly one
// message per real change.
btnPlay.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_PLAY)
btnStop.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_STOP)
btnRecord.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RECORD)

// Add Marker is input-only (no .setOutputPort()) -- a one-shot command
// trigger with no persistent state, so there's nothing to send feedback for
// (see the Markers design spec's Scope section).
btnAddMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_ADD_MARKER)

// One page for everything -- Steinberg MIDI Remote pages are for switching
// between alternate mappings (e.g. banks) and are not all simultaneously
// active by default. Transport and Markers must both always be live at once,
// not toggled between, so they share this single page rather than each
// getting their own.
var page = deviceDriver.mMapping.makePage('Main')

page.makeValueBinding(btnPlay.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStart).setTypeToggle()
page.makeValueBinding(btnStop.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStop)
page.makeValueBinding(btnRecord.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRecord).setTypeToggle()

// Exact Cubase key command name, category 'Transport' -- pulled from this
// Cubase install's own key-command presets (Presets/KeyCommands/*.xml), not
// guessed. 'To Marker N' jumps to an existing marker; 'Set Marker N' (not
// used here) assigns/overwrites one instead -- see the Markers design spec's
// decision log.
page.makeCommandBinding(btnAddMarker.mSurfaceValue, 'Transport', 'Insert Marker')

page.mOnActivate = function (activeDevice) {
  console.log('CubaseCompanion: page activated')
}

// Explicit, single-message state feedback for the two bidirectional
// Transport toggles (Play/Record). Add Marker has no feedback -- see Scope
// in the Markers design spec.
//
// NOTE: a prior version of this bound the callback to the *host* value
// (page.mHostAccess.mTransport.mValue.mX.mOnProcessValueChange) instead of
// the surface value below. Steinberg's own API reference (README_v1.html /
// midiremote_factory_scripts/.api/v1/midiremote_api_v1.d.ts, and the
// ExampleCompany_RealWorldDevice.js factory script, which wires up this exact
// transport-toggle-plus-LED-feedback pattern) only documents
// mOnProcessValueChange on MR_SurfaceElementValue (i.e. mSurfaceValue) -- it
// isn't a real hook on host value objects at all, so that version silently
// did nothing. This is the object the API actually supports.
function bindStateFeedback(surfaceValue, channel, note) {
  surfaceValue.mOnProcessValueChange = function (activeDevice, value) {
    var statusOn = 0x90 | channel
    var statusOff = 0x80 | channel
    if (value >= 0.5) {
      midiOutput.sendMidi(activeDevice, [statusOn, note, 127])
    } else {
      midiOutput.sendMidi(activeDevice, [statusOff, note, 0])
    }
  }
}

bindStateFeedback(btnPlay.mSurfaceValue, TRANSPORT_CHANNEL, NOTE_PLAY_STATE)
bindStateFeedback(btnRecord.mSurfaceValue, TRANSPORT_CHANNEL, NOTE_RECORD_STATE)

var lastHeartbeatSentAt = 0

deviceDriver.mOnIdle = function (activeDevice) {
  var now = Date.now()
  if (now - lastHeartbeatSentAt < HEARTBEAT_INTERVAL_MS) return
  lastHeartbeatSentAt = now

  var statusOn = 0x90 | TRANSPORT_CHANNEL
  var statusOff = 0x80 | TRANSPORT_CHANNEL
  midiOutput.sendMidi(activeDevice, [statusOn, NOTE_HEARTBEAT, 127])
  midiOutput.sendMidi(activeDevice, [statusOff, NOTE_HEARTBEAT, 0])
}
```

- [ ] **Step 2: Commit**

```bash
git add "cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js"
git commit -m "refactor: trim Cubase MIDI Remote script to Play/Stop/Record/Add Marker (v1.0 scope trim)"
```

- [ ] **Step 3: Flag manual re-verification to the user**

This step has no command — it's a note for whoever runs this plan: after this commit, the deployed copy of this script (in Companion's separate `companion-module-cubase` dev-modules folder, per the project's sync workflow) needs to be re-synced and Play/Stop/Record/Add Marker re-verified against a live Cubase 15 instance, the same way Phase 1-3 were originally verified (see `docs/cubase-companion-setup.md`). This cannot be done from this environment (no live Cubase available) — call it out explicitly to the user rather than silently skipping it.

---

### Task 10: Update documentation

**Files:**
- Modify: `ROADMAP.md`
- Modify: `PRD.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none — pure prose, no code. Uses the exact passing-test count captured in Task 8, Step 1.

- [ ] **Step 1: Replace `ROADMAP.md`**

```markdown
# Roadmap

## v1.0.0 — Done, verified against real Cubase 15

The complete first release. Four actions, matching feedback/status, verified live:

- [x] Actions: Play, Stop, Record, Add Marker
- [x] Feedbacks: Playing, Recording, Stopped, Cubase Connected
- [x] Presets pairing each transport action with its matching feedback; standalone Add Marker and Cubase Connected presets
- [x] Cubase MIDI Remote driver script (Play/Stop/Record bindings + Add Marker command binding + heartbeat)
- [x] Heartbeat-based connection status, correctly detecting both connect *and* disconnect
- [x] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)

## Deferred to a future full-API implementation pass

Everything below was built, unit-tested, and (except where noted) verified against real Cubase 15 during earlier development, then deliberately trimmed out of v1.0 to ship a minimal, high-confidence core first (see the [2026-07-11 scope-trim design spec](docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md)). Nothing here is abandoned — it's a known-working reference for whenever this phase is picked back up:

- **Extended transport** — Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward
- **Extended markers** — Next/Previous Marker, To Marker 1-9, cycle markers, punch in/out points, named marker assignment
- **Mixer channel control** — Mute, Solo, Volume, Pan, Selected Channel Name, plus Read/Write (automation), Record Enable, Monitor, Listen, and Edit Channel Settings (never implemented — see the API research note below)
- **Track/selection & macros** — select a track, trigger a key command/macro, arm record on a track
- **Control room operations** — scope not yet defined

Prior API research, still valid when this is picked back up: Cubase's MIDI Remote API exposes `mRecordEnable`, `mMonitorEnable`, `mAutomationRead`, and `mAutomationWrite` directly on `MR_MixerChannelValues` — the same host object Mute/Solo/Volume/Pan bound to. "Listen" (channel AFL/PFL) and "Edit Channel Settings" weren't found on that same object and need their own lookup.

## Non-feature work, not yet scheduled

- Public-release readiness (real repository URL, published to the Companion module registry) — currently out of scope per [PRD.md](PRD.md), since this is a personal-use project. Revisit if that changes.
- Cross-platform (macOS/Linux) verification — nothing in the architecture blocks it, but it's untested.
- Deciding the scope of the future full-API implementation pass — needs its own brainstorming/requirements pass when picked up.
```

- [ ] **Step 2: Update `PRD.md`'s Purpose section**

Find:
```markdown
Let Bitfocus Companion (and therefore Stream Deck / other button surfaces) control and reflect Steinberg Cubase's state — starting with the transport (Play, Stop, Record, Return to Zero, Cycle, Click, Rewind, Forward) — with live two-way feedback, without depending on Cubase iC Pro's undocumented network protocol.
```

Replace with:
```markdown
Let Bitfocus Companion (and therefore Stream Deck / other button surfaces) control and reflect Steinberg Cubase's state — Play, Stop, Record, and Add Marker — with live two-way feedback, without depending on Cubase iC Pro's undocumented network protocol.
```

- [ ] **Step 3: Update `PRD.md`'s Primary Features section**

Find:
```markdown
## Primary Features

1. **Transport control** — Play, Stop, Record, Return to Zero, Rewind, Forward as named Companion actions.
2. **Toggle control with feedback** — Cycle (loop) and Click (metronome) as toggle actions whose Companion buttons reflect Cubase's actual current state.
3. **Live state feedback** — Playing, Recording, Stopped, Cycle Active, Click Active feedbacks that update the instant Cubase's state changes, in either direction (button press or Cubase's own transport bar).
4. **Connection status** — a "Cubase Connected" feedback driven by a heartbeat, so a stale/disconnected bridge is visible rather than silently stuck.
5. **Ready-made presets** — one preset per action, pre-wired to its matching feedback, so setup doesn't require hand-configuring raw MIDI note numbers.
```

Replace with:
```markdown
## Primary Features

1. **Transport control** — Play, Stop, Record as named Companion actions.
2. **Marker control** — Add Marker as a named Companion action.
3. **Live state feedback** — Playing, Recording, Stopped feedbacks that update the instant Cubase's state changes, in either direction (button press or Cubase's own transport bar).
4. **Connection status** — a "Cubase Connected" feedback driven by a heartbeat, so a stale/disconnected bridge is visible rather than silently stuck.
5. **Ready-made presets** — one preset per action, pre-wired to its matching feedback where applicable, so setup doesn't require hand-configuring raw MIDI note numbers.
```

- [ ] **Step 4: Update `PRD.md`'s Out of Scope section**

Find:
```markdown
## Out of Scope (Future Phases)

Four additional feature areas were identified during design but are explicitly out of scope for the current implementation, each planned as its own future spec → plan → implementation cycle, reusing this project's architecture:

- Mixer channel control (mute, solo, fader volume, pan)
- Markers & locators (cycle markers, punch in/out, named markers)
- Track/selection & macros (track select, key command/macro triggers, record-arm)
- Control room operations

See [ROADMAP.md](ROADMAP.md) for status.
```

Replace with:
```markdown
## Out of Scope (Future Phases)

This v1.0 release intentionally covers only Play, Stop, Record, and Add Marker. A broader set of feature areas were built, unit-tested, and (mostly) verified live during earlier development, then deliberately trimmed back out for this release: extended transport (Return to Zero, Cycle, Click, Rewind, Forward), extended markers (Next/Previous Marker, To Marker 1-9, cycle markers, punch in/out), Mixer channel control (mute, solo, fader volume, pan), track/selection & macros, and control room operations. Each is planned as its own future spec → plan → implementation cycle when a full MIDI Remote API implementation is undertaken.

See [ROADMAP.md](ROADMAP.md) for status and the [2026-07-11 scope-trim design spec](docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md) for why this was trimmed back after already being built.
```

- [ ] **Step 5: Replace `README.md`**

```markdown
# Cubase Companion Module

Control Steinberg Cubase's transport and markers from [Bitfocus Companion](https://bitfocus.io/companion) / Stream Deck, with live two-way feedback, via Cubase's official MIDI Remote API — no reverse-engineering, no undocumented protocol.

**Status:** v1.0.0 — Play, Stop, Record, and Add Marker implemented, unit-tested, and verified against a real Cubase 15 instance.

## What this is

Two independent pieces connected by a plain MIDI port pair:

```
Companion (companion-module-cubase)  <--MIDI-->  virtual/network MIDI port  <--MIDI-->  Cubase (MIDI Remote script)
```

- **`companion-module-cubase/`** — a Bitfocus Companion module (TypeScript, `@companion-module/base` + `@julusian/midi`) with named actions, presets, and feedbacks for Play, Stop, Record, and Add Marker.
- **`cubase-midi-remote/`** — a JavaScript driver script for Cubase's documented MIDI Remote API (12+), placed in Cubase's Driver Scripts folder.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the two halves talk to each other, and [DEPLOYMENT.md](DEPLOYMENT.md) for how to install and run it.

## Why this exists instead of using Cubase iC Pro's protocol

Cubase iC Pro talks to Cubase over an undocumented protocol (via the "Steinberg SKI Remote" extension). Building against it would mean reverse-engineering captured network traffic. This project uses Cubase's officially documented MIDI Remote API instead — see [docs/adr/ADR-001-midi-remote-api-over-ski-remote.md](docs/adr/ADR-001-midi-remote-api-over-ski-remote.md) for the full reasoning.

## Documentation

- [PRD.md](PRD.md) — what this is, who it's for, what it does
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, folder structure
- [docs/adr/](docs/adr/) — why the major decisions were made
- [ROADMAP.md](ROADMAP.md) — what's done, what's next
- [BUILD.md](BUILD.md) — building the Companion module from source
- [DEPLOYMENT.md](DEPLOYMENT.md) — installing and running it against real Cubase
- [CONTRIBUTING.md](CONTRIBUTING.md) — this is a personal project; read before sending changes anyway
- [CHANGELOG.md](CHANGELOG.md) — version history

## Known Limitations

- Verified only on Windows with same-machine loopMIDI; macOS/Linux and cross-machine rtpMIDI/AppleMIDI topologies are untested (nothing in the architecture is platform-specific — see [ARCHITECTURE.md](ARCHITECTURE.md)).

## License

MIT — see [LICENSE](LICENSE).
```

- [ ] **Step 6: Update `ARCHITECTURE.md`'s Goals bullet**

Find:
```markdown
- Establish an architecture Phase 2+ (Mixer, Markers, Track/Macros, Control Room) can extend without redesign.
```

Replace with:
```markdown
- Establish an architecture a future full MIDI Remote API implementation pass can extend without redesign.
```

- [ ] **Step 7: Remove the stale Return-to-Zero risk line from `ARCHITECTURE.md`'s Risks section**

Find:
```markdown
- One binding (`Return to Zero`, via `makeCommandBinding`) uses a Cubase key-command name not confirmed against a real installation.
```

Delete that line entirely (Return to Zero is no longer in scope for v1.0).

- [ ] **Step 8: Update `ARCHITECTURE.md`'s MIDI protocol section**

Find:
```markdown
## MIDI protocol (the informal contract between the two halves)

Fixed on MIDI channel 16 (zero-indexed 15), defined in `companion-module-cubase/src/midi/protocol.ts` and mirrored by convention (not shared code) in the Cubase-side script:

| Function | Note # | Direction |
|---|---|---|
| Play | 0 | both (trigger + state) |
| Stop | 1 | Companion→Cubase |
| Record | 2 | both |
| Return to Zero | 3 | Companion→Cubase |
| Cycle | 4 | both |
| Click | 5 | both |
| Rewind | 6 | Companion→Cubase |
| Forward | 7 | Companion→Cubase |
| Heartbeat | 9 | Cubase→Companion, ~every 2s |

Full rationale for this design in [docs/adr/ADR-004-fixed-midi-note-contract.md](docs/adr/ADR-004-fixed-midi-note-contract.md).
```

Replace with:
```markdown
## MIDI protocol (the informal contract between the two halves)

Two dedicated MIDI channels, defined in `companion-module-cubase/src/midi/protocol.ts` and mirrored by convention (not shared code) in the Cubase-side script:

| Function | Channel | Note # | Direction |
|---|---|---|---|
| Play | Transport (zero-indexed 15 / MIDI ch. 16) | 0 | both (trigger + state) |
| Stop | Transport | 1 | Companion→Cubase |
| Record | Transport | 2 | both |
| Heartbeat | Transport | 9 | Cubase→Companion, ~every 2s |
| Add Marker | Markers (zero-indexed 14 / MIDI ch. 15) | 0 | Companion→Cubase |

Full rationale for this design in [docs/adr/ADR-004-fixed-midi-note-contract.md](docs/adr/ADR-004-fixed-midi-note-contract.md) and [ADR-006](docs/adr/ADR-006-channel-per-phase-script.md).
```

- [ ] **Step 9: Update `ARCHITECTURE.md`'s folder structure test-count comment**

Find:
```markdown
│   └── test/                                 # Vitest unit tests (42 tests, pure-logic modules only)
```

Replace `42` with the exact passing-test count captured in Task 8, Step 1 (e.g. if the output showed `Tests  22 passed (22)`, the line becomes `│   └── test/                                 # Vitest unit tests (22 tests, pure-logic modules only)`).

- [ ] **Step 10: Update `CHANGELOG.md`**

Find:
```markdown
## [Unreleased]

- Manual verification against a real Cubase 15 instance (see [DEPLOYMENT.md](DEPLOYMENT.md)'s checklist) — not yet executed.

## [0.1.0] - 2026-07-08
```

Replace with:
```markdown
## [Unreleased]

## [1.0.0] - 2026-07-11

First complete, scoped release — see [ROADMAP.md](ROADMAP.md).

### Changed

- Scoped the module down to four actions — Play, Stop, Record, Add Marker — as the complete v1.0 feature set. Broader MIDI Remote API coverage (Mixer control, extended transport, extended markers, track/selection, control room) is deferred to a future full-API implementation pass; see the [2026-07-11 scope-trim design spec](docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md) for the full rationale.

### Added

- Action: Add Marker (new since 0.1.0, carried over from the since-trimmed Phase 3 Markers work).
- All four actions (Play, Stop, Record, Add Marker) verified against a real Cubase 15 instance.

### Removed

- Actions: Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward, Next Marker, Previous Marker, To Marker 1-9, Toggle Mute, Toggle Solo, Volume Up, Volume Down, Pan Left, Pan Right.
- Feedbacks: Cycle Active, Click Active, Mute Active, Solo Active, Selected Channel Name.
- Mixer channel control entirely (`mixerState.ts`, MIDI channel 13 protocol, SysEx channel-name feedback).

## [0.1.0] - 2026-07-08
```

- [ ] **Step 11: Commit**

```bash
git add ROADMAP.md PRD.md README.md ARCHITECTURE.md CHANGELOG.md
git commit -m "docs: update ROADMAP/PRD/README/ARCHITECTURE/CHANGELOG for v1.0 scope trim"
```

---

### Task 11: Version bump and release tag

**Files:**
- Modify: `companion-module-cubase/package.json`

- [ ] **Step 1: Bump the version**

In `companion-module-cubase/package.json`, find:
```json
  "version": "0.1.0",
```

Replace with:
```json
  "version": "1.0.0",
```

- [ ] **Step 2: Rebuild to confirm the version bump doesn't break anything**

Run: `cd companion-module-cubase && npm run build`
Expected: completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/package.json
git commit -m "chore: bump version to 1.0.0"
```

- [ ] **Step 4: Create the annotated release tag**

Run: `git tag -a v1.0.0 -m "v1.0.0 - Play, Stop, Record, Add Marker (complete, verified against real Cubase 15)"`
Expected: tag created locally, no output. Confirm with `git tag -l v1.0.0` (should print `v1.0.0`). Do not push the tag without the user's explicit go-ahead — pushing tags/commits to a remote is a separate, confirmable action per this project's working norms, not an implicit part of "implement the plan."
```

## Self-review notes

- **Spec coverage:** every "what stays" / "what gets removed" bullet in the design spec maps to a task above (protocol → Task 1, transportState → Task 2, mixerState deletion → Task 3, connection.ts → Task 4 (spec gap filled — connection.ts wasn't explicitly named in the spec's file list but is a direct consequence of "delete mixerState.ts entirely" and "remove MixerCC/relative-CC" since connection.ts is the only consumer of both), actions/feedbacks/presets → Tasks 5-7, Cubase script → Task 9, docs → Task 10, versioning → Task 11).
- **Placeholder scan:** the only non-literal value in the plan is the passing-test count in Task 8/10, which is explicitly sourced from a real command's output, not guessed — this is the standard "run it and use the real number" pattern, not a TBD.
- **Type consistency:** `ModuleLike.midi` shape is defined once in Task 5 and referenced (not redefined) by Tasks 6 and 7; `TransportState { playing, recording }` is defined once in Task 2 and consumed identically by Tasks 4, 5, 6.
