# Cubase Companion Module — Mixer (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selected-channel mixer control (Mute, Solo, Volume, Pan, and a Selected Channel Name feedback) to the Cubase Companion control surface, per [the Phase 2 design spec](../specs/2026-07-10-cubase-companion-mixer-design.md).

**Architecture:** Extend the existing `companion-module-cubase` Companion module (new actions/feedbacks/presets on a new dedicated MIDI channel, two new message shapes — relative CC and SysEx — added to the existing `protocol.ts`/`connection.ts` pure-core-plus-thin-IO split) and extend the one consolidated Cubase MIDI Remote script with a new Mixer section bound to `page.mHostAccess.mTrackSelection.mMixerChannel`.

**Tech Stack:** TypeScript (`companion-module-cubase`, `@companion-module/base`, `@julusian/midi`, Vitest) on the Companion side; ES5 (no build step, no test harness) on the Cubase MIDI Remote script side.

## Global Constraints

- MIDI channel for this phase: `MIXER_CHANNEL = 12` (MIDI channel 13, zero-indexed), per [ADR-006](../../adr/ADR-006-channel-per-phase-script.md)'s per-phase-channel convention.
- Mute/Solo trigger and feedback must never share a note (see [ADR-004](../../adr/ADR-004-fixed-midi-note-contract.md)'s amendment) — same split-note pattern as Play/Record/Cycle/Click.
- Volume/Pan are relative-step only, via Cubase's `setTypeRelativeSignedBit()` CC binding: value `1` = +1 tick, value `65` = −1 tick. No absolute value actions, no level/position feedback.
- Selected Channel Name is transmitted as SysEx `[0xF0, 0x7D, <ASCII bytes>, 0xF7]`, ASCII-only, truncated to 32 characters, non-ASCII replaced with `?` (byte `0x3F`).
- The Cubase-side script file is **`cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`** — despite the name, this is the one consolidated script for all phases, kept at this path/vendor/model per [ADR-008](../../adr/ADR-008-reuse-transport-registration-slot.md). Do not create a new `CubaseCompanion.js` file or a new `makeDeviceDriver(...)` registration.
- All new Companion-side pure logic (`protocol.ts`, `mixerState.ts`, `connection.ts`, `actions.ts`, `feedbacks.ts`) must be unit-tested; `presets.ts` and the Cubase script are not, matching existing project convention (see [ARCHITECTURE.md](../../../ARCHITECTURE.md)).
- Run tests with `npm test` (`vitest run`) from `companion-module-cubase/`.

---

## Task 1: Mixer note/CC constants and CC encoding in `protocol.ts`

**Files:**
- Modify: `companion-module-cubase/src/midi/protocol.ts`
- Test: `companion-module-cubase/test/midi/protocol.test.ts`

**Interfaces:**
- Produces: `MIXER_CHANNEL: number`, `MixerNote` enum (`ToggleMute`, `ToggleSolo`, `MuteState`, `SoloState`), `MixerCC` enum (`VolumeDelta`, `PanDelta`), `encodeControlChange(channel: number, controller: number, value: number): number[]`, `encodeRelativeTick(channel: number, controller: number, direction: 1 | -1): number[]`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `companion-module-cubase/test/midi/protocol.test.ts` (after the existing `decodeMidiMessage` describe block):

```ts
describe('Mixer protocol constants', () => {
  it('uses zero-indexed channel 12 for MIDI channel 13 (Mixer)', () => {
    expect(MIXER_CHANNEL).toBe(12)
  })
})

describe('encodeControlChange', () => {
  it('encodes a Control Change message', () => {
    expect(encodeControlChange(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)).toEqual([0xbc, 0, 1])
  })
})

describe('encodeRelativeTick', () => {
  it('encodes an "up" tick as value 1', () => {
    expect(encodeRelativeTick(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)).toEqual([0xbc, 0, 1])
  })

  it('encodes a "down" tick as value 65', () => {
    expect(encodeRelativeTick(MIXER_CHANNEL, MixerCC.PanDelta, -1)).toEqual([0xbc, 1, 65])
  })
})
```

Update the top-of-file import to include the new names:

```ts
import {
  TRANSPORT_CHANNEL,
  MARKERS_CHANNEL,
  MIXER_CHANNEL,
  TransportNote,
  MarkerNote,
  MixerCC,
  encodeNoteOn,
  encodeNoteOff,
  encodeTrigger,
  encodeControlChange,
  encodeRelativeTick,
  decodeMidiMessage,
} from '../../src/midi/protocol.js'
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `companion-module-cubase/`): `npm test -- protocol`
Expected: FAIL — `MIXER_CHANNEL`, `MixerCC`, `encodeControlChange`, `encodeRelativeTick` are not exported.

- [ ] **Step 3: Implement**

In `companion-module-cubase/src/midi/protocol.ts`, add after the existing `MARKERS_CHANNEL` constant (before `export enum TransportNote`):

```ts
// Dedicated channel for the Mixer phase section of the consolidated Cubase
// script -- next available channel per ADR-006's per-phase convention
// (Transport=15, Markers=14).
export const MIXER_CHANNEL = 12 // MIDI channel 13, zero-indexed
```

Add after the existing `MarkerNote` enum:

```ts
// Mixer phase (Phase 2) note map, on MIXER_CHANNEL. Mute/Solo are toggles
// with live feedback, so -- per ADR-004's split-note lesson -- each has a
// separate trigger note (Companion -> Cubase) and *State note (Cubase ->
// Companion); they must never share a note, or Cubase's own feedback output
// loops back into its own input binding and re-triggers the toggle.
export enum MixerNote {
  ToggleMute = 0,
  ToggleSolo = 1,
  MuteState = 2,
  SoloState = 3,
}

// Mixer phase relative-CC map, on MIXER_CHANNEL. Volume/Pan are discrete
// relative steps (see the Phase 2 design spec), sent as a single CC message
// per press using Cubase's relative-signed-bit encoding -- see
// encodeRelativeTick below. One-directional (Companion -> Cubase only); no
// level/position readout.
export enum MixerCC {
  VolumeDelta = 0,
  PanDelta = 1,
}

// Relative-signed-bit tick values for a single-detent nudge: 1-63 means
// "increment by that amount," 65-127 means "decrement by (value - 64)." A
// single press/tick always sends a magnitude-1 nudge; Cubase's own binding
// determines how much that actually moves the fader/pan.
const RELATIVE_TICK_UP = 1
const RELATIVE_TICK_DOWN = 65
```

Add after the existing `encodeTrigger` function:

```ts
export function encodeControlChange(channel: number, controller: number, value: number): number[] {
  return [0xb0 | channel, controller, value]
}

export function encodeRelativeTick(channel: number, controller: number, direction: 1 | -1): number[] {
  return encodeControlChange(channel, controller, direction === 1 ? RELATIVE_TICK_UP : RELATIVE_TICK_DOWN)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- protocol`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts companion-module-cubase/test/midi/protocol.test.ts
git commit -m "feat: add Mixer channel/note/CC constants and relative-CC encoding"
```

---

## Task 2: Generalize `decodeMidiMessage` to accept `MIXER_CHANNEL`

**Files:**
- Modify: `companion-module-cubase/src/midi/protocol.ts`
- Test: `companion-module-cubase/test/midi/protocol.test.ts`

**Interfaces:**
- Consumes: `MIXER_CHANNEL`, `MixerNote` from Task 1.
- Produces: `decodeMidiMessage` now also accepts note messages on `MIXER_CHANNEL` (previously `TRANSPORT_CHANNEL`-only). Signature and `DecodedNote` shape unchanged.

- [ ] **Step 1: Write the failing test**

Add to the `decodeMidiMessage` describe block in `companion-module-cubase/test/midi/protocol.test.ts`:

```ts
  it('decodes a Note On on the Mixer channel', () => {
    expect(decodeMidiMessage([0x9c, 2, 127])).toEqual({
      channel: 12,
      note: 2,
      velocity: 127,
      isOn: true,
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- protocol`
Expected: FAIL — the new Mixer-channel case returns `null` because `decodeMidiMessage` still hardcodes `channel !== TRANSPORT_CHANNEL`.

- [ ] **Step 3: Implement**

In `companion-module-cubase/src/midi/protocol.ts`, replace the comment and channel check on `decodeMidiMessage`:

```ts
// Only TransportNote.Heartbeat/*State notes (TRANSPORT_CHANNEL) and
// MixerNote.MuteState/SoloState (MIXER_CHANNEL) are ever received from
// Cubase -- Markers has nothing incoming to decode (see MarkerNote's doc
// comment), so a message on MARKERS_CHANNEL is correctly rejected here, same
// as any other unrecognized channel. SysEx (channel name feedback) has no
// channel nibble and is decoded separately by decodeChannelNameSysEx, not
// here.
export function decodeMidiMessage(bytes: number[]): DecodedNote | null {
  if (bytes.length < 3) return null

  const status = bytes[0]
  const messageType = status & 0xf0
  const channel = status & 0x0f
  const note = bytes[1]
  const velocity = bytes[2]

  if (channel !== TRANSPORT_CHANNEL && channel !== MIXER_CHANNEL) return null
  if (messageType !== 0x90 && messageType !== 0x80) return null

  const isOn = messageType === 0x90 && velocity > 0
  return { channel, note, velocity: isOn ? velocity : 0, isOn }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- protocol`
Expected: PASS (including the pre-existing "returns null for messages on the Markers channel" and "returns null for messages on a different channel" tests, which must still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts companion-module-cubase/test/midi/protocol.test.ts
git commit -m "feat: decode Mixer-channel note messages alongside Transport"
```

---

## Task 3: Channel-name SysEx encode/decode in `protocol.ts`

**Files:**
- Modify: `companion-module-cubase/src/midi/protocol.ts`
- Test: `companion-module-cubase/test/midi/protocol.test.ts`

**Interfaces:**
- Produces: `encodeChannelNameSysEx(name: string): number[]`, `decodeChannelNameSysEx(bytes: number[]): string | null`.

- [ ] **Step 1: Write the failing tests**

Add to `companion-module-cubase/test/midi/protocol.test.ts` (update the import list at the top to add `encodeChannelNameSysEx, decodeChannelNameSysEx`):

```ts
describe('encodeChannelNameSysEx', () => {
  it('wraps an ASCII name in a SysEx message with the 0x7D manufacturer id', () => {
    expect(encodeChannelNameSysEx('Vocal')).toEqual([0xf0, 0x7d, 0x56, 0x6f, 0x63, 0x61, 0x6c, 0xf7])
  })

  it('truncates names longer than 32 characters', () => {
    const longName = 'A'.repeat(40)
    const encoded = encodeChannelNameSysEx(longName)
    // 2 header bytes (0xF0, manufacturer id) + 32 name bytes + 1 trailer byte (0xF7)
    expect(encoded.length).toBe(2 + 32 + 1)
  })

  it('replaces non-ASCII characters with 0x3F ("?")', () => {
    expect(encodeChannelNameSysEx('Café')).toEqual([0xf0, 0x7d, 0x43, 0x61, 0x66, 0x3f, 0xf7])
  })
})

describe('decodeChannelNameSysEx', () => {
  it('decodes a SysEx message back to its ASCII name', () => {
    expect(decodeChannelNameSysEx([0xf0, 0x7d, 0x56, 0x6f, 0x63, 0x61, 0x6c, 0xf7])).toBe('Vocal')
  })

  it('round-trips through encodeChannelNameSysEx', () => {
    expect(decodeChannelNameSysEx(encodeChannelNameSysEx('Drum Bus'))).toBe('Drum Bus')
  })

  it('returns null for a message not starting with 0xF0', () => {
    expect(decodeChannelNameSysEx([0x90, 0x7d, 0x56, 0xf7])).toBeNull()
  })

  it('returns null for a message not ending with 0xF7', () => {
    expect(decodeChannelNameSysEx([0xf0, 0x7d, 0x56])).toBeNull()
  })

  it('returns null for a message with a different manufacturer id', () => {
    expect(decodeChannelNameSysEx([0xf0, 0x00, 0x56, 0xf7])).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- protocol`
Expected: FAIL — `encodeChannelNameSysEx`/`decodeChannelNameSysEx` are not exported.

- [ ] **Step 3: Implement**

In `companion-module-cubase/src/midi/protocol.ts`, add after the `encodeRelativeTick` function:

```ts
// Manufacturer ID 0x7D is the MIDI spec's reserved "non-commercial/
// educational use" id -- appropriate here since this SysEx message is a
// private convention between the two halves of this project, not a real
// registered manufacturer.
const SYSEX_MANUFACTURER_ID = 0x7d
const CHANNEL_NAME_MAX_LENGTH = 32

// SysEx data bytes must be 7-bit clean (0x00-0x7F). Restricting to printable
// ASCII (0x20-0x7E) satisfies that automatically and also keeps control
// characters (e.g. a stray newline) out of a Companion button's text.
// Non-ASCII characters (accented letters, non-Latin scripts, emoji, etc.)
// are replaced with '?' rather than building a full Unicode-safe nibble
// encoding -- see the Phase 2 design spec's decision log for why.
function toSafeAsciiByte(charCode: number): number {
  return charCode >= 0x20 && charCode <= 0x7e ? charCode : 0x3f
}

export function encodeChannelNameSysEx(name: string): number[] {
  const truncated = name.slice(0, CHANNEL_NAME_MAX_LENGTH)
  const bytes = Array.from(truncated).map((char) => toSafeAsciiByte(char.charCodeAt(0)))
  return [0xf0, SYSEX_MANUFACTURER_ID, ...bytes, 0xf7]
}

export function decodeChannelNameSysEx(bytes: number[]): string | null {
  if (bytes.length < 3) return null
  if (bytes[0] !== 0xf0) return null
  if (bytes[bytes.length - 1] !== 0xf7) return null
  if (bytes[1] !== SYSEX_MANUFACTURER_ID) return null

  const nameBytes = bytes.slice(2, bytes.length - 1)
  return String.fromCharCode(...nameBytes)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- protocol`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts companion-module-cubase/test/midi/protocol.test.ts
git commit -m "feat: add SysEx encode/decode for the selected channel name"
```

---

## Task 4: `MixerState` pure state module

**Files:**
- Create: `companion-module-cubase/src/midi/mixerState.ts`
- Test: `companion-module-cubase/test/midi/mixerState.test.ts` (new)

**Interfaces:**
- Consumes: `MixerNote` from `protocol.ts` (Task 1).
- Produces: `MixerState { muted: boolean; solo: boolean; selectedChannelName: string | null }`, `createInitialMixerState(): MixerState`, `applyMixerStateNote(state: MixerState, note: number, isOn: boolean): MixerState`, `applyChannelName(state: MixerState, name: string | null): MixerState`.

- [ ] **Step 1: Write the failing tests**

Create `companion-module-cubase/test/midi/mixerState.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MixerNote } from '../../src/midi/protocol.js'
import { createInitialMixerState, applyMixerStateNote, applyChannelName } from '../../src/midi/mixerState.js'

describe('createInitialMixerState', () => {
  it('starts unmuted, not soloed, with no selected channel name', () => {
    expect(createInitialMixerState()).toEqual({
      muted: false,
      solo: false,
      selectedChannelName: null,
    })
  })
})

describe('applyMixerStateNote', () => {
  it('sets muted true on MuteState note-on', () => {
    const state = createInitialMixerState()
    const next = applyMixerStateNote(state, MixerNote.MuteState, true)
    expect(next.muted).toBe(true)
  })

  it('sets muted false on MuteState note-off', () => {
    const state = { ...createInitialMixerState(), muted: true }
    const next = applyMixerStateNote(state, MixerNote.MuteState, false)
    expect(next.muted).toBe(false)
  })

  it('sets solo independently of muted', () => {
    const state = { ...createInitialMixerState(), muted: true }
    const next = applyMixerStateNote(state, MixerNote.SoloState, true)
    expect(next).toEqual({ muted: true, solo: true, selectedChannelName: null })
  })

  it('does not change state for the raw trigger notes', () => {
    const state = createInitialMixerState()
    expect(applyMixerStateNote(state, MixerNote.ToggleMute, true)).toEqual(state)
    expect(applyMixerStateNote(state, MixerNote.ToggleSolo, true)).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state = createInitialMixerState()
    applyMixerStateNote(state, MixerNote.MuteState, true)
    expect(state.muted).toBe(false)
  })
})

describe('applyChannelName', () => {
  it('sets the selected channel name', () => {
    const state = createInitialMixerState()
    const next = applyChannelName(state, 'Vocal')
    expect(next.selectedChannelName).toBe('Vocal')
  })

  it('returns the same object reference when the name is unchanged', () => {
    const state = applyChannelName(createInitialMixerState(), 'Vocal')
    const next = applyChannelName(state, 'Vocal')
    expect(next).toBe(state)
  })

  it('can clear the name back to null', () => {
    const state = applyChannelName(createInitialMixerState(), 'Vocal')
    const next = applyChannelName(state, null)
    expect(next.selectedChannelName).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mixerState`
Expected: FAIL — `../../src/midi/mixerState.js` does not exist.

- [ ] **Step 3: Implement**

Create `companion-module-cubase/src/midi/mixerState.ts`:

```ts
import { MixerNote } from './protocol.js'

export interface MixerState {
  muted: boolean
  solo: boolean
  selectedChannelName: string | null
}

export function createInitialMixerState(): MixerState {
  return {
    muted: false,
    solo: false,
    selectedChannelName: null,
  }
}

export function applyMixerStateNote(state: MixerState, note: number, isOn: boolean): MixerState {
  switch (note) {
    case MixerNote.MuteState:
      return { ...state, muted: isOn }
    case MixerNote.SoloState:
      return { ...state, solo: isOn }
    default:
      return state
  }
}

export function applyChannelName(state: MixerState, name: string | null): MixerState {
  if (name === state.selectedChannelName) return state
  return { ...state, selectedChannelName: name }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- mixerState`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/mixerState.ts companion-module-cubase/test/midi/mixerState.test.ts
git commit -m "feat: add pure MixerState reducer module"
```

---

## Task 5: `MidiConnection` — relative CC send, mixer state, SysEx handling

**Files:**
- Modify: `companion-module-cubase/src/midi/connection.ts`
- Test: `companion-module-cubase/test/midi/connection.test.ts`

**Interfaces:**
- Consumes: `MIXER_CHANNEL`, `MixerNote`, `encodeRelativeTick`, `decodeChannelNameSysEx` from `protocol.ts`; `MixerState`, `createInitialMixerState`, `applyMixerStateNote`, `applyChannelName` from `mixerState.ts`.
- Produces: `MidiConnection.sendRelativeCC(channel: number, controller: number, direction: 1 | -1): void`, `MidiConnection.getMixerState(): MixerState`. `handleMessage` now also updates `MixerState` and emits `'stateChanged'` for Mixer-channel note messages and SysEx channel-name messages.

- [ ] **Step 1: Write the failing tests**

Add to `companion-module-cubase/test/midi/connection.test.ts`. First, update the two `await import(...)` lines near the top to pull in the new names:

```ts
const { MidiConnection, TRIGGER_HOLD_MS } = await import('../../src/midi/connection.js')
const { TransportNote, MixerNote, MixerCC, TRANSPORT_CHANNEL, MARKERS_CHANNEL, MIXER_CHANNEL, encodeNoteOn, encodeNoteOff, encodeControlChange, encodeChannelNameSysEx } =
  await import('../../src/midi/protocol.js')
const { HEARTBEAT_TIMEOUT_MS } = await import('../../src/midi/connectionState.js')
```

Then add new describe blocks at the end of the file:

```ts
describe('MidiConnection sendRelativeCC', () => {
  it('sends a single relative-tick CC message, up', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendRelativeCC(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeControlChange(MIXER_CHANNEL, MixerCC.VolumeDelta, 1))

    connection.close()
  })

  it('sends a single relative-tick CC message, down', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendRelativeCC(MIXER_CHANNEL, MixerCC.PanDelta, -1)

    expect(sendSpy).toHaveBeenCalledWith(encodeControlChange(MIXER_CHANNEL, MixerCC.PanDelta, 65))

    connection.close()
  })
})

describe('MidiConnection mixer state', () => {
  function fakeInputOf(connection: InstanceType<typeof MidiConnection>): EventEmitter {
    return (connection as unknown as { input: EventEmitter }).input
  }

  it('starts with initial mixer state', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    expect(connection.getMixerState()).toEqual({ muted: false, solo: false, selectedChannelName: null })

    connection.close()
  })

  it('updates muted from a MuteState note on MIXER_CHANNEL and emits stateChanged', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const stateChangedSpy = vi.fn()
    connection.on('stateChanged', stateChangedSpy)

    fakeInputOf(connection).emit('message', 0, encodeNoteOn(MIXER_CHANNEL, MixerNote.MuteState))

    expect(connection.getMixerState().muted).toBe(true)
    expect(stateChangedSpy).toHaveBeenCalled()

    connection.close()
  })

  it('updates solo from a SoloState note on MIXER_CHANNEL', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    fakeInputOf(connection).emit('message', 0, encodeNoteOn(MIXER_CHANNEL, MixerNote.SoloState))

    expect(connection.getMixerState().solo).toBe(true)

    connection.close()
  })

  it('does not confuse a Mixer-channel note with a same-numbered Transport note', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    // TransportNote.Record (2) and MixerNote.MuteState (2) share a note
    // number but live on different channels -- only the Mixer one should
    // affect mixer state, and vice versa.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(MIXER_CHANNEL, MixerNote.MuteState))
    expect(connection.getTransportState().recording).toBe(false)
    expect(connection.getMixerState().muted).toBe(true)

    connection.close()
  })

  it('updates the selected channel name from a SysEx message', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const stateChangedSpy = vi.fn()
    connection.on('stateChanged', stateChangedSpy)

    fakeInputOf(connection).emit('message', 0, encodeChannelNameSysEx('Vocal'))

    expect(connection.getMixerState().selectedChannelName).toBe('Vocal')
    expect(stateChangedSpy).toHaveBeenCalled()

    connection.close()
  })

  it('resets mixer state on heartbeat-timeout disconnect', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Heartbeat))
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(MIXER_CHANNEL, MixerNote.MuteState))
    expect(connection.getMixerState().muted).toBe(true)

    vi.useFakeTimers()
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1000)

    expect(connection.getMixerState()).toEqual({ muted: false, solo: false, selectedChannelName: null })

    vi.useRealTimers()
    connection.close()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- connection`
Expected: FAIL — `sendRelativeCC`/`getMixerState` do not exist, and mixer-channel messages currently have no effect.

- [ ] **Step 3: Implement**

In `companion-module-cubase/src/midi/connection.ts`, update the import line at the top:

```ts
import {
  TransportNote,
  TRANSPORT_CHANNEL,
  MIXER_CHANNEL,
  encodeNoteOn,
  encodeNoteOff,
  encodeTrigger,
  encodeRelativeTick,
  decodeMidiMessage,
  decodeChannelNameSysEx,
} from './protocol.js'
import { TransportState, createInitialTransportState, applyStateNote } from './transportState.js'
import { MixerState, createInitialMixerState, applyMixerStateNote, applyChannelName } from './mixerState.js'
import { ConnectionState } from './connectionState.js'
```

Add a `mixerState` field next to the existing `transportState` field:

```ts
  private transportState: TransportState = createInitialTransportState()
  private mixerState: MixerState = createInitialMixerState()
```

Add `sendRelativeCC` and `getMixerState` next to the existing `sendTrigger`/`getTransportState` methods:

```ts
  // One-directional (Companion -> Cubase only), same channel-explicit
  // reasoning as sendTrigger -- see actions.ts's Mixer Volume/Pan actions.
  sendRelativeCC(channel: number, controller: number, direction: 1 | -1): void {
    this.sendRaw(encodeRelativeTick(channel, controller, direction))
  }
```

```ts
  getMixerState(): MixerState {
    return this.mixerState
  }
```

Replace the body of `handleMessage` to branch on SysEx vs. channel-voice messages, and within channel-voice messages, on which channel the message is on:

```ts
  private handleMessage(message: number[]): void {
    if (this.consumeSelfEcho(message)) return

    if (message[0] === 0xf0) {
      const name = decodeChannelNameSysEx(message)
      if (name === null) return
      const next = applyChannelName(this.mixerState, name)
      if (next !== this.mixerState) {
        this.mixerState = next
        this.emit('stateChanged')
      }
      return
    }

    const decoded = decodeMidiMessage(message)
    if (!decoded) return

    if (decoded.channel === TRANSPORT_CHANNEL) {
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
      return
    }

    if (decoded.channel === MIXER_CHANNEL) {
      const next = applyMixerStateNote(this.mixerState, decoded.note, decoded.isOn)
      if (next !== this.mixerState) {
        this.mixerState = next
        this.emit('stateChanged')
      }
    }
  }
```

Update `applyConnectedState` to also reset mixer state on disconnect, alongside the existing transport-state reset:

```ts
  private applyConnectedState(nowConnected: boolean): void {
    if (nowConnected === this.lastKnownConnected) return
    this.lastKnownConnected = nowConnected
    if (!nowConnected) {
      // Cubase stopped responding; don't let stale "Playing"/"Recording" or
      // stale Mute/Solo/channel-name state linger next to a fresh
      // "Disconnected" status.
      this.transportState = createInitialTransportState()
      this.mixerState = createInitialMixerState()
    }
    this.emit('stateChanged')
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- connection`
Expected: PASS — including all pre-existing heartbeat/self-echo/hold-gap tests, which must be unaffected.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions in `protocol.test.ts`, `transportState.test.ts`, `connectionState.test.ts`, `actions.test.ts`, `feedbacks.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add companion-module-cubase/src/midi/connection.ts companion-module-cubase/test/midi/connection.test.ts
git commit -m "feat: wire MixerState and channel-name SysEx into MidiConnection"
```

---

## Task 6: Six new actions in `actions.ts`

**Files:**
- Modify: `companion-module-cubase/src/actions.ts`
- Test: `companion-module-cubase/test/actions.test.ts`

**Interfaces:**
- Consumes: `MIXER_CHANNEL`, `MixerNote`, `MixerCC` from `protocol.ts`.
- Produces: `ModuleLike.midi` gains `sendRelativeCC(channel: number, controller: number, direction: 1 | -1): void` and `getMixerState(): { muted: boolean; solo: boolean; selectedChannelName: string | null }`. New action ids: `toggleMute`, `toggleSolo`, `volumeUp`, `volumeDown`, `panLeft`, `panRight`.

- [ ] **Step 1: Write the failing tests**

In `companion-module-cubase/test/actions.test.ts`, update the import and `makeFakeSelf`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { UpdateActions } from '../src/actions.js'
import { TransportNote, MarkerNote, MixerNote, MixerCC, TRANSPORT_CHANNEL, MARKERS_CHANNEL, MIXER_CHANNEL } from '../src/midi/protocol.js'

function makeFakeSelf() {
  return {
    midi: {
      sendTrigger: vi.fn(),
      sendNoteOn: vi.fn(),
      sendNoteOff: vi.fn(),
      sendRelativeCC: vi.fn(),
      getTransportState: vi.fn(),
      getMixerState: vi.fn(),
      isConnected: vi.fn(),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}
```

Update the "registers one action per..." test's expected id list to include the six new ids (add to the array before `.sort()`):

```ts
        'toggleMute',
        'toggleSolo',
        'volumeUp',
        'volumeDown',
        'panLeft',
        'panRight',
```

Add new test cases at the end of the `describe('UpdateActions', ...)` block:

```ts
  it('toggleMute action sends a trigger on MIXER_CHANNEL, ToggleMute note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleMute.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MIXER_CHANNEL, MixerNote.ToggleMute)
  })

  it('toggleSolo action sends a trigger on MIXER_CHANNEL, ToggleSolo note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleSolo.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MIXER_CHANNEL, MixerNote.ToggleSolo)
  })

  it('volumeUp action sends an "up" relative tick on the Volume CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.volumeUp.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)
  })

  it('volumeDown action sends a "down" relative tick on the Volume CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.volumeDown.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.VolumeDelta, -1)
  })

  it('panLeft action sends a "down" relative tick on the Pan CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.panLeft.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.PanDelta, -1)
  })

  it('panRight action sends an "up" relative tick on the Pan CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.panRight.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.PanDelta, 1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- actions`
Expected: FAIL — the six new action ids don't exist yet, and the "registers one action per..." test's id list won't match.

- [ ] **Step 3: Implement**

In `companion-module-cubase/src/actions.ts`, update the import:

```ts
import { TransportNote, MarkerNote, MixerNote, MixerCC, TRANSPORT_CHANNEL, MARKERS_CHANNEL, MIXER_CHANNEL } from './midi/protocol.js'
```

Extend the `ModuleLike` interface's `midi` member:

```ts
  midi: {
    sendTrigger(channel: number, note: number): void
    sendNoteOn(note: number): void
    sendNoteOff(note: number): void
    sendRelativeCC(channel: number, controller: number, direction: 1 | -1): void
    getTransportState(): { playing: boolean; recording: boolean; cycleActive: boolean; clickActive: boolean }
    getMixerState(): { muted: boolean; solo: boolean; selectedChannelName: string | null }
    isConnected(): boolean
  }
```

Add six new entries to the `definitions` object, after the last `toMarker9` entry and before the closing `}`:

```ts
    // Mixer (Phase 2): selected-channel control only -- see
    // docs/superpowers/specs/2026-07-10-cubase-companion-mixer-design.md.
    // Mute/Solo are toggles with feedback (paired feedbacks below in
    // feedbacks.ts); Volume/Pan are relative single-tick nudges, matching a
    // real rotary encoder detent and working with Stream Deck+ dial
    // Rotate Left/Right triggers with no special module-side handling.
    toggleMute: {
      name: 'Toggle Mute',
      options: [],
      callback: async () => self.midi.sendTrigger(MIXER_CHANNEL, MixerNote.ToggleMute),
    },
    toggleSolo: {
      name: 'Toggle Solo',
      options: [],
      callback: async () => self.midi.sendTrigger(MIXER_CHANNEL, MixerNote.ToggleSolo),
    },
    volumeUp: {
      name: 'Volume Up',
      options: [],
      callback: async () => self.midi.sendRelativeCC(MIXER_CHANNEL, MixerCC.VolumeDelta, 1),
    },
    volumeDown: {
      name: 'Volume Down',
      options: [],
      callback: async () => self.midi.sendRelativeCC(MIXER_CHANNEL, MixerCC.VolumeDelta, -1),
    },
    panLeft: {
      name: 'Pan Left',
      options: [],
      callback: async () => self.midi.sendRelativeCC(MIXER_CHANNEL, MixerCC.PanDelta, -1),
    },
    panRight: {
      name: 'Pan Right',
      options: [],
      callback: async () => self.midi.sendRelativeCC(MIXER_CHANNEL, MixerCC.PanDelta, 1),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/actions.ts companion-module-cubase/test/actions.test.ts
git commit -m "feat: add Mixer actions (Toggle Mute/Solo, Volume/Pan step)"
```

---

## Task 7: Three new feedbacks in `feedbacks.ts`

**Files:**
- Modify: `companion-module-cubase/src/feedbacks.ts`
- Test: `companion-module-cubase/test/feedbacks.test.ts`

**Interfaces:**
- Consumes: `ModuleLike.midi.getMixerState()` from Task 6.
- Produces: new feedback ids `muteActive`, `soloActive` (boolean), `selectedChannelName` (advanced, returns `{ text: string }`).

- [ ] **Step 1: Write the failing tests**

In `companion-module-cubase/test/feedbacks.test.ts`, update `makeFakeSelf` to also accept and expose mixer state:

```ts
function makeFakeSelf(
  transportState: {
    playing: boolean
    recording: boolean
    cycleActive: boolean
    clickActive: boolean
  },
  connected: boolean,
  mixerState: { muted: boolean; solo: boolean; selectedChannelName: string | null } = {
    muted: false,
    solo: false,
    selectedChannelName: null,
  },
) {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(() => transportState),
      getMixerState: vi.fn(() => mixerState),
      isConnected: vi.fn(() => connected),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}
```

Update the "registers the six Phase 1 feedbacks" test's expected id list (rename the test to reflect the new total, and add the three new ids):

```ts
  it('registers the six Phase 1 feedbacks plus the three Mixer feedbacks', () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)

    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      ['playing', 'recording', 'stopped', 'cycleActive', 'clickActive', 'cubaseConnected', 'muteActive', 'soloActive', 'selectedChannelName'].sort(),
    )
  })
```

Add new test cases at the end of the `describe('UpdateFeedbacks', ...)` block:

```ts
  it('muteActive feedback reflects mixer state', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: true, solo: false, selectedChannelName: null },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.muteActive.callback({} as any)).toBe(true)
  })

  it('soloActive feedback reflects mixer state', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: false, solo: true, selectedChannelName: null },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.soloActive.callback({} as any)).toBe(true)
  })

  it('selectedChannelName feedback returns the channel name as button text', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: false, solo: false, selectedChannelName: 'Vocal' },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.selectedChannelName.callback({} as any)).toEqual({ text: 'Vocal' })
  })

  it('selectedChannelName feedback falls back to a placeholder when nothing is selected', async () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.selectedChannelName.callback({} as any)).toEqual({ text: 'No Channel Selected' })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- feedbacks`
Expected: FAIL — `muteActive`/`soloActive`/`selectedChannelName` don't exist, and `getMixerState` isn't called by anything yet.

- [ ] **Step 3: Implement**

In `companion-module-cubase/src/feedbacks.ts`, add three new entries to the `definitions` object, after `cubaseConnected`:

```ts
    // Mixer (Phase 2) -- see
    // docs/superpowers/specs/2026-07-10-cubase-companion-mixer-design.md.
    muteActive: {
      type: 'boolean',
      name: 'Mute Active',
      description: 'True while the selected channel is muted in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getMixerState().muted,
    },
    soloActive: {
      type: 'boolean',
      name: 'Solo Active',
      description: 'True while the selected channel is soloed in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getMixerState().solo,
    },
    selectedChannelName: {
      type: 'advanced',
      name: 'Selected Channel Name',
      description: "Shows the name of Cubase's currently selected mixer channel",
      options: [],
      callback: async () => ({ text: self.midi.getMixerState().selectedChannelName ?? 'No Channel Selected' }),
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- feedbacks`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add companion-module-cubase/src/feedbacks.ts companion-module-cubase/test/feedbacks.test.ts
git commit -m "feat: add Mute Active, Solo Active, Selected Channel Name feedbacks"
```

---

## Task 8: Mixer presets in `presets.ts`

**Files:**
- Modify: `companion-module-cubase/src/presets.ts`

**Interfaces:**
- Consumes: action ids from Task 6 (`toggleMute`, `toggleSolo`, `volumeUp`, `volumeDown`, `panLeft`, `panRight`), feedback ids from Task 7 (`muteActive`, `soloActive`, `selectedChannelName`).
- Produces: preset ids `toggleMute`, `toggleSolo`, `volumeUp`, `volumeDown`, `panLeft`, `panRight`, `selectedChannelName`, grouped under a new `"Mixer"` preset section.

No dedicated test file exists for `presets.ts` today (see `docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md`'s Testing plan — same project convention followed here); this task is implementation plus a manual/compile check instead of TDD steps.

- [ ] **Step 1: Implement**

In `companion-module-cubase/src/presets.ts`, add a new constant after `MARKER_PRESET_IDS`:

```ts
const MIXER_PRESET_IDS = ['toggleMute', 'toggleSolo', 'volumeUp', 'volumeDown', 'panLeft', 'panRight', 'selectedChannelName'] as const
```

Add new entries to the `presets` object inside `UpdatePresets`, after the last `toMarker9` entry and before `cubaseConnected`:

```ts
    toggleMute: preset('Mute', 'toggleMute', 'muteActive'),
    toggleSolo: preset('Solo', 'toggleSolo', 'soloActive'),
    volumeUp: preset('Volume Up', 'volumeUp'),
    volumeDown: preset('Volume Down', 'volumeDown'),
    panLeft: preset('Pan Left', 'panLeft'),
    panRight: preset('Pan Right', 'panRight'),
    // No action -- pure display, same shape as cubaseConnected below.
    selectedChannelName: {
      type: 'simple',
      name: 'Selected Channel Name',
      style: {
        text: 'Channel',
        size: '14',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(0, 0, 0),
      },
      steps: [{ down: [], up: [] }],
      feedbacks: [{ feedbackId: 'selectedChannelName', options: {}, style: {} }],
    },
```

Add a new section to the `structure` array, after `'markers'` and before `'status'`:

```ts
    {
      id: 'mixer',
      name: 'Mixer',
      definitions: [...MIXER_PRESET_IDS],
    },
```

- [ ] **Step 2: Type-check and run the full test suite**

Run (from `companion-module-cubase/`): `npm run build && npm test`
Expected: `tsc` compiles cleanly (no type errors from the new preset entries or the `MIXER_PRESET_IDS` structure), and all existing tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/src/presets.ts
git commit -m "feat: add Mixer preset section"
```

---

## Task 9: Cubase MIDI Remote script — Mixer section

**Files:**
- Modify: `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`

This is ES5 with no build step and no test harness (see [ARCHITECTURE.md](../../../ARCHITECTURE.md) and [ADR-008](../../adr/ADR-008-reuse-transport-registration-slot.md) for why this exact file/vendor/model must be reused rather than a new script). Verification is manual, against real Cubase 15, in Step 3 below.

**Note on risk:** two of this task's bindings — the relative-CC volume/pan nudge and the `mOnTitleChange` channel-name callback — are new API surface this project hasn't exercised before. Prior phases (see ADR-006→007, and ADR-008's Mapping Page issue) each found at least one live-Cubase surprise that the written API reference didn't fully predict. Treat Step 3's live verification as load-bearing, not a formality — if `mOnTitleChange` doesn't fire on `btnVolume.mSurfaceValue`, retry binding it to `btnPan.mSurfaceValue` or to `selectedChannel.mValue.mOnTitleChange` directly (all three are plausible per the API's class hierarchy; only live testing on this install disambiguates, same as ADR-008's approach).

- [ ] **Step 1: Add Mixer constants**

In `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`, add after the existing Markers constants block (after `var NOTE_TO_MARKER_9 = 11`):

```js
// Mixer (Phase 2) -- MIDI channel 13, zero-indexed 12. Selected-channel
// control only (page.mHostAccess.mTrackSelection.mMixerChannel), not a
// fixed bank -- see
// docs/superpowers/specs/2026-07-10-cubase-companion-mixer-design.md.
var MIXER_CHANNEL = 12
var NOTE_TOGGLE_MUTE = 0
var NOTE_TOGGLE_SOLO = 1
var NOTE_MUTE_STATE = 2
var NOTE_SOLO_STATE = 3
var CC_VOLUME_DELTA = 0
var CC_PAN_DELTA = 1
// Manufacturer ID 0x7D ("non-commercial/educational use" per the MIDI spec)
// for the Selected Channel Name SysEx feedback -- must stay byte-for-byte
// compatible with protocol.ts's encodeChannelNameSysEx/decodeChannelNameSysEx.
var SYSEX_MANUFACTURER_ID = 0x7d
var CHANNEL_NAME_MAX_LENGTH = 32
```

- [ ] **Step 2: Add Mixer buttons and bindings**

Add after the existing Marker buttons block (after `var btnToMarker9 = makeButton(11, 1)`):

```js
// Mixer buttons -- row 2, so they don't collide with Transport (row 0) or
// Markers (row 1) now that all three phases share one surface. Only 4
// buttons for 6 Companion actions: Volume Up/Down both target btnVolume's
// single relative-CC binding (as do Pan Left/Right and btnPan) -- see the
// Mixer design spec's MIDI mapping.
var btnToggleMute = makeButton(0, 2)
var btnToggleSolo = makeButton(1, 2)
var btnVolume = makeButton(2, 2)
var btnPan = makeButton(3, 2)
```

Add after the existing Marker input bindings block (after the `btnToMarker9...bindToNote(...)` line):

```js
// Mute/Solo are input-only here, same reasoning as Play/Record/Cycle/Click
// above -- Steinberg's automatic MIDI-mirror for .setTypeToggle() bindings
// sends a noisy multi-message burst; the explicit mOnProcessValueChange
// feedback below sends exactly one message per real change instead.
btnToggleMute.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MIXER_CHANNEL, NOTE_TOGGLE_MUTE)
btnToggleSolo.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MIXER_CHANNEL, NOTE_TOGGLE_SOLO)

// Volume/Pan are relative-encoder style: Companion sends a single CC tick
// per press (value 1 = up/right, 65 = down/left -- see protocol.ts's
// encodeRelativeTick), and setTypeRelativeSignedBit() tells Cubase to
// interpret that as a relative nudge rather than an absolute position.
// Input-only -- no level/position feedback, per the Mixer design spec's
// Scope.
btnVolume.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToControlChange(MIXER_CHANNEL, CC_VOLUME_DELTA).setTypeRelativeSignedBit()
btnPan.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToControlChange(MIXER_CHANNEL, CC_PAN_DELTA).setTypeRelativeSignedBit()
```

Add after the existing Marker command bindings block (after the `btnToMarker9...makeCommandBinding(...)` line, still before `page.mOnActivate = ...`):

```js
// Mixer: selected-channel control only (no bank/zone) -- whatever track is
// currently selected in Cubase, via mHostAccess.mTrackSelection.mMixerChannel.
var selectedChannel = page.mHostAccess.mTrackSelection.mMixerChannel
page.makeValueBinding(btnToggleMute.mSurfaceValue, selectedChannel.mValue.mMute).setTypeToggle()
page.makeValueBinding(btnToggleSolo.mSurfaceValue, selectedChannel.mValue.mSolo).setTypeToggle()
page.makeValueBinding(btnVolume.mSurfaceValue, selectedChannel.mValue.mVolume)
page.makeValueBinding(btnPan.mSurfaceValue, selectedChannel.mValue.mPan)
```

- [ ] **Step 3: Add Mute/Solo state feedback and the channel-name SysEx callback**

Generalize the existing `bindStateFeedback` helper to take an explicit channel (it currently hardcodes `TRANSPORT_CHANNEL`), and update its four existing call sites:

```js
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
bindStateFeedback(btnCycle.mSurfaceValue, TRANSPORT_CHANNEL, NOTE_CYCLE_STATE)
bindStateFeedback(btnClick.mSurfaceValue, TRANSPORT_CHANNEL, NOTE_CLICK_STATE)
bindStateFeedback(btnToggleMute.mSurfaceValue, MIXER_CHANNEL, NOTE_MUTE_STATE)
bindStateFeedback(btnToggleSolo.mSurfaceValue, MIXER_CHANNEL, NOTE_SOLO_STATE)
```

Add the channel-name SysEx callback after the `bindStateFeedback` calls (before `var lastHeartbeatSentAt = 0`):

```js
// Selected Channel Name feedback -- SysEx (see the Mixer design spec's SysEx
// section): plain Note/CC messages can't carry text, but a bound surface
// value's mOnTitleChange fires with the underlying host object's title (here,
// the selected channel's name) whenever it changes -- same "only documented
// on mSurfaceValue" pattern already established for mOnProcessValueChange
// above (see ADR-004's amendment) and confirmed against Steinberg's own
// ExampleCompany_RealWorldDevice.js factory script's
// faderStrip.fader.mSurfaceValue.mOnTitleChange usage. Bound to btnVolume
// since it's the fader-equivalent control; ASCII-only, truncated to 32
// characters -- must stay byte-for-byte compatible with protocol.ts's
// encodeChannelNameSysEx.
function toSafeAsciiByte(charCode) {
  return charCode >= 0x20 && charCode <= 0x7e ? charCode : 0x3f
}

btnVolume.mSurfaceValue.mOnTitleChange = function (activeDevice, objectTitle) {
  var truncated = objectTitle.substring(0, CHANNEL_NAME_MAX_LENGTH)
  var bytes = [0xf0, SYSEX_MANUFACTURER_ID]
  for (var i = 0; i < truncated.length; i++) {
    bytes.push(toSafeAsciiByte(truncated.charCodeAt(i)))
  }
  bytes.push(0xf7)
  midiOutput.sendMidi(activeDevice, bytes)
}
```

- [ ] **Step 4: Deploy and live-verify against real Cubase 15**

Copy the updated `CubaseCompanion_Transport.js` to `C:\Users\Admin\Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Transport\CubaseCompanion_Transport.js` (same deployment path Transport/Markers already use), then in Cubase:

1. Rescan/reload the MIDI Remote script (or restart Cubase) so the updated file is picked up.
2. Confirm Transport and Markers buttons still work exactly as before (non-interference check) — press Play, confirm feedback; fire Add Marker.
3. Select an audio/instrument track in the Project window. Press **Toggle Mute** in Companion — confirm the track mutes in Cubase and the Companion `Mute Active` feedback lights. Un-mute the track from Cubase's own mixer — confirm the Companion feedback clears (two-way check, same as Cycle/Click in Phase 1).
4. Repeat step 3 for **Toggle Solo** / `Solo Active`.
5. Press **Volume Up** several times — confirm the selected channel's fader moves up in Cubase's mixer. Press **Volume Down** — confirm it moves back down. Repeat for **Pan Left** / **Pan Right** and the pan control.
6. Select a different track — confirm the **Selected Channel Name** feedback's button text updates to the new track's name within a second or two. If it does not update, see this task's risk note above and try rebinding `mOnTitleChange` to `btnPan.mSurfaceValue` or `selectedChannel.mValue.mOnTitleChange` instead, re-deploy, and re-test.
7. Confirm no self-echo flicker on Mute/Solo (the failure mode ADR-004 documents) — toggle each rapidly a few times from Companion and confirm the feedback settles cleanly rather than flickering.

- [ ] **Step 5: Commit**

```bash
git add "cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js"
git commit -m "feat: add Mixer section (Mute/Solo/Volume/Pan/channel name) to the Cubase script"
```

---

## Task 10: Update ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update the Phase 2 entry**

In `ROADMAP.md`, replace the current Phase 2 section:

```markdown
## Phase 2: Mixer channel control — Not started

Per-channel mute, solo, fader volume, pan for specific tracks/channels (e.g. "mute vocal track"). Will need its own spec (design questions: how are channels addressed — by name, by index, or by selection? does fader volume need a rotary/relative encoder input, or discrete up/down actions?) before implementation.
```

with:

```markdown
## Phase 2: Mixer channel control — Done, verified against real Cubase 15

Selected-channel Mute, Solo, Volume (relative step), Pan (relative step), and a Selected Channel Name feedback — see [design spec](docs/superpowers/specs/2026-07-10-cubase-companion-mixer-design.md) and [implementation plan](docs/superpowers/plans/2026-07-10-cubase-companion-mixer.md):

- [x] Actions: Toggle Mute, Toggle Solo, Volume Up, Volume Down, Pan Left, Pan Right
- [x] Feedbacks: Mute Active, Solo Active, Selected Channel Name
- [x] Presets pairing Mute/Solo with their feedback; standalone Volume/Pan/name presets
- [x] Cubase MIDI Remote script: selected-channel bindings on MIDI channel 13, relative-CC volume/pan, SysEx channel-name feedback
- [x] **Verified against a real Cubase 15 instance** — see Task 9's live-verification checklist in the implementation plan.
```

(Only make this edit once Task 9's live verification has actually passed — if it hasn't yet, mark this section "Implemented, pending live verification" instead and revisit once Task 9's Step 4 is complete.)

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: mark Phase 2 (Mixer channel control) done"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1-3 cover the MIDI mapping section (Mute/Solo notes, relative CC, SysEx). Task 4-5 cover `MixerState`/`MidiConnection`. Task 6-8 cover actions/feedbacks/presets. Task 9 covers the Cubase script. Task 10 covers the ROADMAP status update the design spec's precedent (Transport/Markers) established. All six actions, three feedbacks, and the SysEx mechanism from the design spec have a task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `sendRelativeCC(channel: number, controller: number, direction: 1 | -1)` and `getMixerState(): MixerState` signatures are identical across `connection.ts` (Task 5), the `ModuleLike` interface in `actions.ts` (Task 6), and their call sites in `feedbacks.ts` (Task 7) — checked against each task's Interfaces block.
