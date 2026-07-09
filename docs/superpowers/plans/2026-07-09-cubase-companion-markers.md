# Cubase Companion Markers (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 marker-navigation actions (Add Marker, Next/Previous Marker, To Marker 1-9) to `companion-module-cubase`, plus a new Cubase MIDI Remote script (`CubaseCompanion_Markers.js`) that responds to them, reusing the existing MIDI connection/port but on its own dedicated MIDI channel.

**Architecture:** No new Companion connection, no new virtual MIDI port. The existing `MidiConnection` gains a channel-aware `sendTrigger`; 12 new no-feedback trigger actions call it with a new `MARKERS_CHANNEL` (14, zero-indexed) instead of the existing `TRANSPORT_CHANNEL` (15). A second, independent Cubase device-driver script binds to the same physical port pair as the existing Transport script and responds only to `MARKERS_CHANNEL` notes via `page.makeCommandBinding`, the same pattern already used for Return to Zero.

**Tech Stack:** TypeScript, Vitest, `@companion-module/base` 2.0.4, `@julusian/midi`; Cubase's `midiremote_api_v1` (ES5) for the new driver script.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md`. Follow it exactly; if anything here conflicts with it, the spec wins and this plan should be corrected.
- `MARKERS_CHANNEL = 14` (MIDI channel 15, zero-indexed). Note map (all Companion→Cubase, one-shot trigger, no feedback):
  AddMarker=0, NextMarker=1, PreviousMarker=2, ToMarker1=3, ToMarker2=4, ToMarker3=5, ToMarker4=6, ToMarker5=7, ToMarker6=8, ToMarker7=9, ToMarker8=10, ToMarker9=11.
- Exact Cubase key command names (category `Transport` for all — pulled from the installed Cubase key-command presets, not guessed): `Insert Marker`, `Locate Next Marker`, `Locate Previous Marker`, `To Marker 1` .. `To Marker 9`.
- No feedbacks, no presets-with-feedback, no new Companion config fields, no new heartbeat for this phase.
- Only `MidiConnection.sendTrigger` becomes channel-aware (`sendTrigger(channel, note)`). `sendNoteOn`/`sendNoteOff` keep their existing single-argument signature (implicitly `TRANSPORT_CHANNEL`) — nothing in this plan calls them with a different channel.
- Package manager: npm, run all commands from `companion-module-cubase/` unless stated otherwise.

---

## File Structure

```
companion-module-cubase/
  src/
    midi/
      protocol.ts       # MODIFY: channel param on encode fns, MARKERS_CHANNEL + MarkerNote
      connection.ts      # MODIFY: sendTrigger(channel, note)
    actions.ts            # MODIFY: existing sendTrigger call sites pass TRANSPORT_CHANNEL; +12 marker actions
    presets.ts             # MODIFY: +12 marker presets, new "Markers" preset section
  test/
    midi/
      protocol.test.ts    # MODIFY
      connection.test.ts   # MODIFY
    actions.test.ts         # MODIFY

cubase-midi-remote/
  Local/
    CubaseCompanion/
      Markers/
        CubaseCompanion_Markers.js   # CREATE

docs/
  adr/
    ADR-006-channel-per-phase-script.md   # CREATE
  cubase-companion-markers-setup.md        # CREATE

ROADMAP.md   # MODIFY: Phase 3 status
```

---

### Task 1: Generalize `protocol.ts`'s channel handling, add Markers constants

**Files:**
- Modify: `companion-module-cubase/src/midi/protocol.ts`
- Modify: `companion-module-cubase/test/midi/protocol.test.ts`

**Interfaces:**
- Produces: `MARKERS_CHANNEL: number`, `MarkerNote` enum (`AddMarker`, `NextMarker`, `PreviousMarker`, `ToMarker1`..`ToMarker9`), and `encodeNoteOn(channel: number, note: number, velocity？= 127): number[]`, `encodeNoteOff(channel: number, note: number): number[]`, `encodeTrigger(channel: number, note: number): number[][]` — all now require an explicit `channel` as their first argument (breaking change from the current single-`note`-argument signatures). `decodeMidiMessage` is unchanged (still Transport-only).

- [ ] **Step 1: Replace `test/midi/protocol.test.ts` with the updated test file**

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
    expect(encodeNoteOff(MARKERS_CHANNEL, MarkerNote.ToMarker9)).toEqual([0x8e, 11, 0])
  })
})

describe('encodeTrigger', () => {
  it('produces a Note On followed by a Note Off for the same note', () => {
    expect(encodeTrigger(TRANSPORT_CHANNEL, TransportNote.Rewind)).toEqual([
      [0x9f, 6, 127],
      [0x8f, 6, 0],
    ])
  })

  it('produces a Note On followed by a Note Off on the Markers channel', () => {
    expect(encodeTrigger(MARKERS_CHANNEL, MarkerNote.NextMarker)).toEqual([
      [0x9e, 1, 127],
      [0x8e, 1, 0],
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
    expect(decodeMidiMessage([0x8f, 4, 0])).toEqual({
      channel: 15,
      note: 4,
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

- [ ] **Step 2: Run the test suite to verify it fails to compile/run**

Run: `npm test` (from `companion-module-cubase/`)
Expected: FAIL — TypeScript errors like "Expected 2 arguments, but got 1" from `protocol.ts` not yet updated, and `MARKERS_CHANNEL`/`MarkerNote` not found.

- [ ] **Step 3: Replace `src/midi/protocol.ts` with the updated implementation**

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
  ReturnToZero = 3,
  Cycle = 4,
  Click = 5,
  Rewind = 6,
  Forward = 7,
  Heartbeat = 9,
  // Dedicated state-feedback notes (Cubase -> Companion only), separate from
  // the trigger notes above (Companion -> Cubase). ADR-004 originally had
  // Play/Record/Cycle/Click's feedback share the same note as their trigger;
  // that made the Cubase script's own feedback output loop back into its own
  // input binding on the shared loopMIDI port, re-triggering the toggle and
  // making it flip back and forth on its own (confirmed via direct MIDI trace
  // of Cubase's mOnProcessValueChange -- see ADR-004 for detail). Splitting
  // feedback onto its own notes, in the 10+ range ADR-004 reserved for
  // exactly this, means the Cubase script's own output never matches what its
  // input binding is listening for.
  PlayState = 10,
  RecordState = 11,
  CycleState = 12,
  ClickState = 13,
}

// Markers phase (Phase 3) note map, on MARKERS_CHANNEL -- entirely separate
// from TransportNote's channel, so this enum's numbering never needs to
// account for what Transport has already claimed. All one-shot triggers,
// Companion -> Cubase only; no feedback and no heartbeat on this channel
// (connectivity is already tracked via TransportNote.Heartbeat, since both
// scripts share the same underlying MidiConnection). See ADR-006 and
// docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
export enum MarkerNote {
  AddMarker = 0,
  NextMarker = 1,
  PreviousMarker = 2,
  ToMarker1 = 3,
  ToMarker2 = 4,
  ToMarker3 = 5,
  ToMarker4 = 6,
  ToMarker5 = 7,
  ToMarker6 = 8,
  ToMarker7 = 9,
  ToMarker8 = 10,
  ToMarker9 = 11,
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

// Transport-only: only TransportNote.Heartbeat and the *State notes are ever
// received from Cubase, and both live on TRANSPORT_CHANNEL. Markers has
// nothing incoming to decode (see MarkerNote's doc comment above), so a
// message on MARKERS_CHANNEL is correctly rejected here, same as any other
// unrecognized channel.
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

- [ ] **Step 4: Run the test suite to verify `protocol.test.ts` now passes**

Run: `npm test` (from `companion-module-cubase/`)
Expected: `test/midi/protocol.test.ts` passes. Other test files (`connection.test.ts`, `actions.test.ts`) will still FAIL to compile at this point — that's expected and fixed in Tasks 2-3, not this one.

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts companion-module-cubase/test/midi/protocol.test.ts
git commit -m "feat: add channel-aware MIDI encode + Markers note map to protocol.ts"
```

---

### Task 2: Make `MidiConnection.sendTrigger` channel-aware

**Files:**
- Modify: `companion-module-cubase/src/midi/connection.ts`
- Modify: `companion-module-cubase/test/midi/connection.test.ts`

**Interfaces:**
- Consumes: `TRANSPORT_CHANNEL`, `MARKERS_CHANNEL`, `encodeNoteOn`, `encodeNoteOff`, `encodeTrigger` from Task 1's `protocol.ts` (all now channel-first).
- Produces: `MidiConnection.sendTrigger(channel: number, note: number): void` (was `sendTrigger(note: number)`). `sendNoteOn(note: number)` and `sendNoteOff(note: number)` keep their existing signatures unchanged (still implicitly `TRANSPORT_CHANNEL` internally).

- [ ] **Step 1: Replace `test/midi/connection.test.ts` with the updated test file**

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
      cycleActive: false,
      clickActive: false,
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
// Play/Record/Cycle/Click's feedback originally reused their trigger note --
// that also turned out to be the root cause of a much worse bug (Cubase's own
// input binding re-ingesting its own feedback as a fresh press; see ADR-004),
// fixed by moving feedback onto dedicated *State notes Companion never sends
// on. These tests exercise the suppression mechanism generically with
// TransportNote.CycleState standing in for "some note Companion both sends
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

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.CycleState)
    // sendTrigger()'s Note Off is sent TRIGGER_HOLD_MS after the Note On (see
    // connection.ts) rather than immediately, so let it actually go out before
    // simulating loopMIDI echoing both back into our own input.
    vi.advanceTimersByTime(TRIGGER_HOLD_MS)
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.CycleState))
    fakeInputOf(connection).emit('message', 0, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.CycleState))

    expect(connection.getTransportState().cycleActive).toBe(false)

    connection.close()
  })

  it('applies state from a later genuine echo once the self-sent pair has been consumed', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.CycleState)
    vi.advanceTimersByTime(TRIGGER_HOLD_MS)
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.CycleState))
    fakeInputOf(connection).emit('message', 0, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.CycleState))

    // Cubase's real feedback, arriving after its own script-engine round trip.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.CycleState))

    expect(connection.getTransportState().cycleActive).toBe(true)

    connection.close()
  })

  it('still applies state from messages that were never self-sent', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    // No sendTrigger() call here -- this is Cubase-initiated (e.g. the user
    // toggled Cycle from Cubase's own transport bar, not from Companion).
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.CycleState))

    expect(connection.getTransportState().cycleActive).toBe(true)

    connection.close()
  })

  it('stops trusting a pending self-echo once it is older than the suppression window', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.CycleState)
    vi.advanceTimersByTime(1000)
    // Arrives too late to plausibly be the loopback echo of the send above --
    // treat it as genuine (e.g. a real, independent later Cubase toggle) rather
    // than silently swallowing it forever.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.CycleState))

    expect(connection.getTransportState().cycleActive).toBe(true)

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

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.CycleState)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.CycleState))

    vi.advanceTimersByTime(TRIGGER_HOLD_MS - 1)
    expect(sendSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy).toHaveBeenNthCalledWith(2, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.CycleState))

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

describe('MidiConnection hold-style Rewind/Forward', () => {
  it('sendNoteOn sends only a Note On, with no matching Note Off', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendNoteOn(TransportNote.Rewind)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Rewind))

    connection.close()
  })

  it('sendNoteOff sends only a Note Off', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendNoteOff(TransportNote.Rewind)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.Rewind))

    connection.close()
  })
})
```

- [ ] **Step 2: Run the test suite to verify it fails**

Run: `npm test` (from `companion-module-cubase/`)
Expected: FAIL — `connection.ts`'s `sendTrigger` still only accepts one argument.

- [ ] **Step 3: Update `src/midi/connection.ts`**

Change the import line (line 3) from:

```typescript
import { TransportNote, encodeNoteOn, encodeNoteOff, encodeTrigger, decodeMidiMessage } from './protocol.js'
```

to:

```typescript
import { TransportNote, TRANSPORT_CHANNEL, encodeNoteOn, encodeNoteOff, encodeTrigger, decodeMidiMessage } from './protocol.js'
```

Change the `sendTrigger`/`sendNoteOn`/`sendNoteOff` methods from:

```typescript
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
```

to:

```typescript
  // channel is explicit (not defaulted to TRANSPORT_CHANNEL) because this is
  // the one send method shared across phase scripts on different channels --
  // see actions.ts's Markers actions for the MARKERS_CHANNEL callers.
  sendTrigger(channel: number, note: number): void {
    const [noteOn, noteOff] = encodeTrigger(channel, note)
    this.sendRaw(noteOn)
    setTimeout(() => this.sendRaw(noteOff), TRIGGER_HOLD_MS)
  }

  // For host values that need a genuine press-and-hold (e.g. Cubase's
  // mRewind/mForward -- see actions.ts), rather than sendTrigger()'s instant
  // Note On + Note Off pulse, which never registers as a hold. Transport-only
  // (Rewind/Forward/Stop) -- always TRANSPORT_CHANNEL, unlike sendTrigger.
  sendNoteOn(note: number): void {
    this.sendRaw(encodeNoteOn(TRANSPORT_CHANNEL, note))
  }

  sendNoteOff(note: number): void {
    this.sendRaw(encodeNoteOff(TRANSPORT_CHANNEL, note))
  }
```

- [ ] **Step 4: Run the test suite to verify it passes**

Run: `npm test` (from `companion-module-cubase/`)
Expected: `test/midi/connection.test.ts` passes. `actions.test.ts` still fails to compile — fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/connection.ts companion-module-cubase/test/midi/connection.test.ts
git commit -m "feat: make MidiConnection.sendTrigger channel-aware"
```

---

### Task 3: Update `actions.ts` — pass `TRANSPORT_CHANNEL` explicitly, add 12 marker actions

**Files:**
- Modify: `companion-module-cubase/src/actions.ts`
- Modify: `companion-module-cubase/test/actions.test.ts`

**Interfaces:**
- Consumes: `MidiConnection.sendTrigger(channel, note)` from Task 2; `TRANSPORT_CHANNEL`, `MARKERS_CHANNEL`, `TransportNote`, `MarkerNote` from Task 1's `protocol.ts`.
- Produces: 12 new action ids in the `CompanionActionDefinitions` returned by `UpdateActions`: `addMarker`, `nextMarker`, `previousMarker`, `toMarker1`..`toMarker9`.

- [ ] **Step 1: Replace `test/actions.test.ts` with the updated test file**

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
  it('registers one action per transport function plus the marker actions', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      [
        'play',
        'stop',
        'record',
        'returnToZero',
        'toggleCycle',
        'toggleClick',
        'rewind',
        'rewindStop',
        'forward',
        'forwardStop',
        'addMarker',
        'nextMarker',
        'previousMarker',
        'toMarker1',
        'toMarker2',
        'toMarker3',
        'toMarker4',
        'toMarker5',
        'toMarker6',
        'toMarker7',
        'toMarker8',
        'toMarker9',
      ].sort(),
    )
  })

  // Cubase's mRewind/mForward host values need a genuine hold (value stays 1
  // while pressed, back to 0 on release) to produce continuous motion -- a
  // Note On immediately followed by Note Off (sendTrigger's shape) never
  // registers as a hold. So rewind/forward send only Note On (start of hold)
  // and rely on a paired rewindStop/forwardStop action -- wired to the preset
  // button's release step -- to send Note Off (end of hold).
  it('rewind action sends Note On (not a full trigger) on the Rewind note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.rewind.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Rewind)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
  })

  it('rewindStop action sends Note Off on the Rewind note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.rewindStop.callback({} as any)

    expect(self.midi.sendNoteOff).toHaveBeenCalledWith(TransportNote.Rewind)
  })

  it('forward action sends Note On (not a full trigger) on the Forward note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.forward.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Forward)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
  })

  it('forwardStop action sends Note Off on the Forward note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.forwardStop.callback({} as any)

    expect(self.midi.sendNoteOff).toHaveBeenCalledWith(TransportNote.Forward)
  })

  it('play action sends a trigger on TRANSPORT_CHANNEL, Play note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.play.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Play)
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

  it('toggleCycle action sends a trigger on TRANSPORT_CHANNEL, Cycle note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleCycle.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Cycle)
  })

  it('toggleClick action sends a trigger on TRANSPORT_CHANNEL, Click note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleClick.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Click)
  })

  it('returnToZero action sends a trigger on TRANSPORT_CHANNEL, ReturnToZero note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.returnToZero.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.ReturnToZero)
  })

  // mStop is a plain (non-toggle, non-command) value binding in the Cubase
  // script -- every write to it invokes Stop, so a Note On + Note Off pair
  // (sendTrigger's shape) fires Stop twice in the same instant. Cubase treats
  // that the same as a real double-press of Stop while already stopped, which
  // natively returns the cursor to the start position. Sending only Note On
  // (like the Rewind/Forward press) avoids the second write entirely.
  it('stop action sends only Note On, not a full trigger', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.stop.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Stop)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
    expect(self.midi.sendNoteOff).not.toHaveBeenCalled()
  })

  // Markers phase (Phase 3): all one-shot triggers on MARKERS_CHANNEL, no
  // feedback -- see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
  it('addMarker action sends a trigger on MARKERS_CHANNEL, AddMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.addMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AddMarker)
  })

  it('nextMarker action sends a trigger on MARKERS_CHANNEL, NextMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.nextMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.NextMarker)
  })

  it('previousMarker action sends a trigger on MARKERS_CHANNEL, PreviousMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.previousMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.PreviousMarker)
  })

  const numberedMarkers: Array<[string, keyof typeof MarkerNote]> = [
    ['toMarker1', 'ToMarker1'],
    ['toMarker2', 'ToMarker2'],
    ['toMarker3', 'ToMarker3'],
    ['toMarker4', 'ToMarker4'],
    ['toMarker5', 'ToMarker5'],
    ['toMarker6', 'ToMarker6'],
    ['toMarker7', 'ToMarker7'],
    ['toMarker8', 'ToMarker8'],
    ['toMarker9', 'ToMarker9'],
  ]

  it.each(numberedMarkers)('%s action sends a trigger on MARKERS_CHANNEL, %s note', async (actionId, noteKey) => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions[actionId].callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote[noteKey])
  })
})
```

- [ ] **Step 2: Run the test suite to verify it fails**

Run: `npm test` (from `companion-module-cubase/`)
Expected: FAIL — `actions.ts` doesn't yet define the marker actions, and its existing `sendTrigger` calls only pass one argument.

- [ ] **Step 3: Replace `src/actions.ts` with the updated implementation**

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
    getTransportState(): { playing: boolean; recording: boolean; cycleActive: boolean; clickActive: boolean }
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
    returnToZero: {
      name: 'Return to Zero',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.ReturnToZero),
    },
    toggleCycle: {
      name: 'Toggle Cycle',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Cycle),
    },
    toggleClick: {
      name: 'Toggle Click',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Click),
    },
    // Cubase's mRewind/mForward host values need a genuine hold (value stays 1
    // while pressed, back to 0 on release) to produce continuous motion -- a
    // Note On immediately followed by Note Off (sendTrigger's shape) never
    // registers as a hold, so these send only Note On. Presets pair each with
    // its *Stop counterpart (Note Off) wired to the button's release step.
    rewind: {
      name: 'Rewind (Hold)',
      options: [],
      callback: async () => self.midi.sendNoteOn(TransportNote.Rewind),
    },
    rewindStop: {
      name: 'Rewind Stop',
      options: [],
      callback: async () => self.midi.sendNoteOff(TransportNote.Rewind),
    },
    forward: {
      name: 'Forward (Hold)',
      options: [],
      callback: async () => self.midi.sendNoteOn(TransportNote.Forward),
    },
    forwardStop: {
      name: 'Forward Stop',
      options: [],
      callback: async () => self.midi.sendNoteOff(TransportNote.Forward),
    },
    // Markers (Phase 3): one-shot triggers on MARKERS_CHANNEL, no feedback --
    // see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md
    // and ADR-006.
    addMarker: {
      name: 'Add Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker),
    },
    nextMarker: {
      name: 'Next Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.NextMarker),
    },
    previousMarker: {
      name: 'Previous Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.PreviousMarker),
    },
    toMarker1: {
      name: 'To Marker 1',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker1),
    },
    toMarker2: {
      name: 'To Marker 2',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker2),
    },
    toMarker3: {
      name: 'To Marker 3',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker3),
    },
    toMarker4: {
      name: 'To Marker 4',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker4),
    },
    toMarker5: {
      name: 'To Marker 5',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker5),
    },
    toMarker6: {
      name: 'To Marker 6',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker6),
    },
    toMarker7: {
      name: 'To Marker 7',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker7),
    },
    toMarker8: {
      name: 'To Marker 8',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker8),
    },
    toMarker9: {
      name: 'To Marker 9',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker9),
    },
  }

  self.setActionDefinitions(definitions)
}
```

- [ ] **Step 4: Run the full test suite to verify everything passes**

Run: `npm test` (from `companion-module-cubase/`)
Expected: all test files pass (`protocol.test.ts`, `connection.test.ts`, `transportState.test.ts`, `feedbacks.test.ts`, `actions.test.ts`).

- [ ] **Step 5: Run the build to verify no TypeScript errors**

Run: `npm run build` (from `companion-module-cubase/`)
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add companion-module-cubase/src/actions.ts companion-module-cubase/test/actions.test.ts
git commit -m "feat: add 12 marker navigation actions"
```

---

### Task 4: Add marker presets

**Files:**
- Modify: `companion-module-cubase/src/presets.ts`

**Interfaces:**
- Consumes: the 12 marker action ids from Task 3 (`addMarker`, `nextMarker`, `previousMarker`, `toMarker1`..`toMarker9`).
- Produces: 12 new preset ids (same names as the action ids), grouped under a new `"Markers"` section in the structure passed to `setPresetDefinitions`.

No dedicated test file exists for `presets.ts` today (matching current project convention — see the Markers design spec's Testing plan section), so this task has no test steps, only implementation + manual sanity via the build.

- [ ] **Step 1: Add the marker preset ids and definitions to `src/presets.ts`**

Find this block:

```typescript
const TRANSPORT_PRESET_IDS = [
  'play',
  'stop',
  'record',
  'returnToZero',
  'toggleCycle',
  'toggleClick',
  'rewind',
  'forward',
] as const
```

Add immediately after it:

```typescript
const MARKER_PRESET_IDS = [
  'addMarker',
  'nextMarker',
  'previousMarker',
  'toMarker1',
  'toMarker2',
  'toMarker3',
  'toMarker4',
  'toMarker5',
  'toMarker6',
  'toMarker7',
  'toMarker8',
  'toMarker9',
] as const
```

Find this block inside `UpdatePresets`:

```typescript
    rewind: holdPreset('Rewind', 'rewind', 'rewindStop'),
    forward: holdPreset('Forward', 'forward', 'forwardStop'),
    cubaseConnected: {
```

Change it to:

```typescript
    rewind: holdPreset('Rewind', 'rewind', 'rewindStop'),
    forward: holdPreset('Forward', 'forward', 'forwardStop'),
    addMarker: preset('Add Marker', 'addMarker'),
    nextMarker: preset('Next Marker', 'nextMarker'),
    previousMarker: preset('Previous Marker', 'previousMarker'),
    toMarker1: preset('To Marker 1', 'toMarker1'),
    toMarker2: preset('To Marker 2', 'toMarker2'),
    toMarker3: preset('To Marker 3', 'toMarker3'),
    toMarker4: preset('To Marker 4', 'toMarker4'),
    toMarker5: preset('To Marker 5', 'toMarker5'),
    toMarker6: preset('To Marker 6', 'toMarker6'),
    toMarker7: preset('To Marker 7', 'toMarker7'),
    toMarker8: preset('To Marker 8', 'toMarker8'),
    toMarker9: preset('To Marker 9', 'toMarker9'),
    cubaseConnected: {
```

Find this block:

```typescript
  const structure: CompanionPresetSection[] = [
    {
      id: 'transport',
      name: 'Transport',
      definitions: [...TRANSPORT_PRESET_IDS],
    },
    {
      id: 'status',
      name: 'Status',
      definitions: ['cubaseConnected'],
    },
  ]
```

Change it to:

```typescript
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
```

- [ ] **Step 2: Run the build and full test suite**

Run: `npm run build && npm test` (from `companion-module-cubase/`)
Expected: both exit 0. No test file exercises `presets.ts` directly, so this step is a compile/regression check, not new coverage.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/src/presets.ts
git commit -m "feat: add marker presets under a new Markers section"
```

---

### Task 5: Create the Cubase Markers driver script

**Files:**
- Create: `cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js`

**Interfaces:**
- Consumes: nothing from the TypeScript side (separate runtime — Cubase's embedded ES5 engine). Must match the note map Tasks 1-3 implemented: `MARKERS_CHANNEL = 14`, notes 0-11 in the order Add/Next/Previous/ToMarker1-9.
- Produces: a Cubase MIDI Remote device driver, installable the same way as the existing Transport script.

This file is not unit-testable (ES5, no test harness — see ARCHITECTURE.md and the Markers design spec's Testing plan). Verified manually in Task 8.

- [ ] **Step 1: Create the directory and script file**

```javascript
// cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js
var midiremote_api = require('midiremote_api_v1')

var MARKERS_CHANNEL = 14 // MIDI channel 15, zero-indexed -- see ADR-006
var NOTE_ADD_MARKER = 0
var NOTE_NEXT_MARKER = 1
var NOTE_PREVIOUS_MARKER = 2
var NOTE_TO_MARKER_1 = 3
var NOTE_TO_MARKER_2 = 4
var NOTE_TO_MARKER_3 = 5
var NOTE_TO_MARKER_4 = 6
var NOTE_TO_MARKER_5 = 7
var NOTE_TO_MARKER_6 = 8
var NOTE_TO_MARKER_7 = 9
var NOTE_TO_MARKER_8 = 10
var NOTE_TO_MARKER_9 = 11

var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Markers', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

// Shares the same physical/virtual port pair as CubaseCompanion_Transport.js
// (see the Markers design spec's Architecture section) -- the detection hint
// below intentionally matches Transport's, since both scripts are meant to be
// bound to the same port regardless of what it's actually named. This project's
// own setup uses a manually-assigned port name, so the hint is a convenience,
// not a requirement (already proven non-blocking for Transport).
deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion Transport')
  .expectOutputNameEquals('CubaseCompanion Transport')

var surface = deviceDriver.mSurface

function makeMarkerButton(x) {
  return surface.makeButton(x, 0, 1, 1)
}

var btnAddMarker = makeMarkerButton(0)
var btnNextMarker = makeMarkerButton(1)
var btnPreviousMarker = makeMarkerButton(2)
var btnToMarker1 = makeMarkerButton(3)
var btnToMarker2 = makeMarkerButton(4)
var btnToMarker3 = makeMarkerButton(5)
var btnToMarker4 = makeMarkerButton(6)
var btnToMarker5 = makeMarkerButton(7)
var btnToMarker6 = makeMarkerButton(8)
var btnToMarker7 = makeMarkerButton(9)
var btnToMarker8 = makeMarkerButton(10)
var btnToMarker9 = makeMarkerButton(11)

// All input-only (no .setOutputPort()) -- these are one-shot command
// triggers with no persistent state, so there's nothing to send feedback
// for (see the design spec's Scope section: no feedback for any marker
// action, confirmed with the project owner rather than assumed).
btnAddMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_ADD_MARKER)
btnNextMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_NEXT_MARKER)
btnPreviousMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_PREVIOUS_MARKER)
btnToMarker1.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_1)
btnToMarker2.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_2)
btnToMarker3.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_3)
btnToMarker4.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_4)
btnToMarker5.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_5)
btnToMarker6.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_6)
btnToMarker7.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_7)
btnToMarker8.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_8)
btnToMarker9.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_9)

var page = deviceDriver.mMapping.makePage('Markers')

// Exact Cubase key command names, category 'Transport' for all -- pulled from
// this Cubase install's own key-command presets (Presets/KeyCommands/*.xml),
// not guessed. 'To Marker N' jumps to an existing marker; 'Set Marker N'
// (not used here) assigns/overwrites one instead -- see the design spec's
// decision log.
page.makeCommandBinding(btnAddMarker.mSurfaceValue, 'Transport', 'Insert Marker')
page.makeCommandBinding(btnNextMarker.mSurfaceValue, 'Transport', 'Locate Next Marker')
page.makeCommandBinding(btnPreviousMarker.mSurfaceValue, 'Transport', 'Locate Previous Marker')
page.makeCommandBinding(btnToMarker1.mSurfaceValue, 'Transport', 'To Marker 1')
page.makeCommandBinding(btnToMarker2.mSurfaceValue, 'Transport', 'To Marker 2')
page.makeCommandBinding(btnToMarker3.mSurfaceValue, 'Transport', 'To Marker 3')
page.makeCommandBinding(btnToMarker4.mSurfaceValue, 'Transport', 'To Marker 4')
page.makeCommandBinding(btnToMarker5.mSurfaceValue, 'Transport', 'To Marker 5')
page.makeCommandBinding(btnToMarker6.mSurfaceValue, 'Transport', 'To Marker 6')
page.makeCommandBinding(btnToMarker7.mSurfaceValue, 'Transport', 'To Marker 7')
page.makeCommandBinding(btnToMarker8.mSurfaceValue, 'Transport', 'To Marker 8')
page.makeCommandBinding(btnToMarker9.mSurfaceValue, 'Transport', 'To Marker 9')

page.mOnActivate = function (activeDevice) {
  console.log('CubaseCompanion Markers: page activated')
}
```

- [ ] **Step 2: Syntax-check the script**

Run: `node --check "cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js"` (from the repo root)
Expected: exits 0, no output (matches how the Transport script was checked throughout Phase 1 — `require('midiremote_api_v1')` fails at runtime outside Cubase, but `node --check` only parses, so this is a safe syntax check, not a functional one).

- [ ] **Step 3: Commit**

```bash
git add "cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js"
git commit -m "feat: add Cubase MIDI Remote script for marker navigation"
```

---

### Task 6: Document the channel-per-phase-script convention (ADR-006)

**Files:**
- Create: `docs/adr/ADR-006-channel-per-phase-script.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-006: Dedicated MIDI channel per phase script

**Status:** Accepted (2026-07-09)

## Context

Phase 1 (Transport) established one Cubase MIDI Remote script on one dedicated
MIDI channel (16, zero-indexed 15). Phase 3 (Markers) is the first phase to add
a second, independent script ([ADR-003](ADR-003-phased-delivery-transport-first.md)
already called for one script per phase, a project owner preference). Both
scripts need to share the same underlying MIDI port pair, since asking the user
to wire up a new virtual MIDI port for every phase doesn't scale.

## Decision

Each phase's Cubase script gets its **own dedicated MIDI channel**, with its own
note numbering starting fresh at 0 — not a continuation of whatever notes earlier
phases already claimed on a shared channel. Markers uses channel 15 (zero-indexed
14); later phases (Mixer, Track/Macros, Control Room) claim their own channel the
same way when they're built.

## Consequences

- **Gained:** every phase script's protocol is fully self-contained. A later
  phase's script (and its note-map documentation) can be read and reasoned about
  without cross-referencing what earlier phases already claimed on the same
  channel — there's no shared note-numbering ledger to keep in sync across
  phases, unlike [ADR-004](ADR-004-fixed-midi-note-contract.md)'s single-channel
  Transport note map, which does require that bookkeeping within Transport itself.
- **Given up:** MIDI channels are a limited resource (16 total, one already used
  by Transport, one by Markers). At 14 channels remaining and one phase per
  channel, this comfortably covers the remaining four planned phases (Mixer,
  Track/Macros, Control Room, plus one spare) without needing multi-channel
  phases — but a phase requiring more scope than a single 128-note channel can
  hold, or more phases than channels remain, would need to revisit this.
- `MidiConnection.sendTrigger` (`companion-module-cubase/src/midi/connection.ts`)
  takes an explicit `channel` argument for exactly this reason — one shared
  connection, multiple phase-specific channels.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/ADR-006-channel-per-phase-script.md
git commit -m "docs: add ADR-006 for channel-per-phase-script convention"
```

---

### Task 7: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update the Phase 3 section**

Find:

```markdown
## Phase 3: Markers & locators — Not started

Jump to cycle markers, punch in/out points, named markers/cue points.
```

Replace with:

```markdown
## Phase 3: Markers & locators — In progress

- [x] Add Marker, Next/Previous Marker, To Marker 1-9 — see [design spec](docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md) and [ADR-006](docs/adr/ADR-006-channel-per-phase-script.md)
- [ ] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-markers-setup.md](docs/cubase-companion-markers-setup.md)'s checklist.
- [ ] Cycle markers, punch in/out points, named marker assignment (`Set Marker N`) — out of scope for this pass, could extend the same pattern later.
```

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark Phase 3 (Markers) in progress in ROADMAP"
```

---

### Task 8: End-to-end manual verification and setup doc

**Files:**
- Create: `docs/cubase-companion-markers-setup.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7. This task has no code deliverable beyond the setup/checklist doc — it's the design spec's testing plan, executed for real, plus the write-up needed to repeat it.

- [ ] **Step 1: Write the setup/verification doc**

```markdown
# Cubase Companion Markers — Setup & Verification

## Setup

1. Companion's MIDI In/Out config is unchanged from Transport — no new port, no new Companion connection. If Transport is already working, Markers reuses that exact same connection.
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Markers\`.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote, add "CubaseCompanion Markers" as a *second* controller (alongside the existing "CubaseCompanion Transport"), and bind its MIDI In/Out to the same port pair Transport already uses.
4. Rebuild the Companion module: `cd companion-module-cubase && npm run build`, then reload/rescan the module in Companion the same way Transport changes were picked up during Phase 1 (disable/re-enable the connection, or restart Companion if that doesn't pick up the change).

## Verification checklist

- [ ] Add Marker: press in Companion, confirm a new marker appears at the current cursor/playhead position in Cubase.
- [ ] Next Marker / Previous Marker: with at least two markers present, confirm the cursor jumps to the next/previous marker relative to its current position.
- [ ] To Marker 1 through To Marker 9: with markers 1-9 present, confirm each button jumps directly to its corresponding marker.
- [ ] Pressing a To Marker N button for a marker that doesn't exist does not error or crash Cubase (should simply do nothing).
- [ ] Confirm Transport's own actions/feedback (Play, Stop, Record, Cycle, Click, Rewind, Forward, Cubase Connected) still work correctly with both scripts active simultaneously — this is the main risk of sharing one port between two device drivers.
```

- [ ] **Step 2: Walk through the verification checklist for real**

Run through every checkbox in the doc above against a real Cubase 15 instance with a project that has at least 9 markers placed. Check off each item as it passes; if any item fails, fix the relevant task's code before proceeding. Pay particular attention to the last item (Transport regression) — since both scripts now share one port pair, confirm nothing about Task 5 broke Transport's existing behavior.

- [ ] **Step 3: Commit**

```bash
git add docs/cubase-companion-markers-setup.md
git commit -m "docs: add Cubase Companion markers setup and verification checklist"
```
