# Punch Points & Named Marker Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 new one-shot trigger actions to the Cubanion Companion module and Cubase script — `Set Marker 1`-`9` (assign marker slot at current position) and `Set Punch In/Out Position` + `Auto Punch In/Out` (toggle) — extending the existing Markers feature area.

**Architecture:** All 13 actions extend the existing `MarkerNote` enum on the already-shared `MARKERS_CHANNEL` (14). Every action is a one-shot MIDI trigger (Note On + Note Off) with no feedback, wired via `page.makeCommandBinding(...)` in the Cubase script — identical shape to the already-shipped Add/Next/Previous/To Marker 1-9 actions. No new files, no new channel, no new Companion connection.

**Tech Stack:** TypeScript (`companion-module-cubase`, `@companion-module/base`, Vitest), Cubase MIDI Remote API v1 (ES5 JavaScript, `Cubanion_Transport.js`).

## Global Constraints

- All 13 new notes live on `MARKERS_CHANNEL` (14, zero-indexed) — no new channel constant.
- Note numbers: `SetMarker1`-`SetMarker9` = 12-20, `SetPunchIn` = 21, `SetPunchOut` = 22, `AutoPunchIn` = 23, `AutoPunchOut` = 24 (continuing directly after the existing Markers range 0-11).
- Exact Cubase key command names (category `'Transport'`, pulled from this install's `Key Commands.xml`, not guessed): `Set Marker 1`..`Set Marker 9`, `Set Punch In Position`, `Set Punch Out Position`, `Auto Punch In`, `Auto Punch Out`.
- No feedback for any of the 13 actions (no Cubase host-value exists to bind for punch or marker-slot state) — same as every existing Marker action.
- `setMarker1`..`setMarker9` join the existing `"Markers"` Companion preset section. `setPunchIn`, `setPunchOut`, `autoPunchIn`, `autoPunchOut` form a new `"Punch"` preset section, positioned after `"Markers"` and before `"Status"`.
- Cubase script buttons: row 2 (`y=2`) for `btnSetMarker1`..`btnSetMarker9` at `x=0..8`; row 3 (`y=3`) for `btnSetPunchIn`, `btnSetPunchOut`, `btnAutoPunchIn`, `btnAutoPunchOut` at `x=0..3`.

---

### Task 1: Extend `protocol.ts`'s `MarkerNote` enum

**Files:**
- Modify: `companion-module-cubase/src/midi/protocol.ts:45-61`
- Test: `companion-module-cubase/test/midi/protocol.test.ts` (no new test needed — verified in Step 2 below that the existing test file has no exhaustive `MarkerNote` key enumeration to update)

**Interfaces:**
- Produces: `MarkerNote.SetMarker1`..`MarkerNote.SetMarker9` (values 12-20), `MarkerNote.SetPunchIn` (21), `MarkerNote.SetPunchOut` (22), `MarkerNote.AutoPunchIn` (23), `MarkerNote.AutoPunchOut` (24) — consumed by Task 2 (actions.ts).

- [ ] **Step 1: Edit the `MarkerNote` enum**

In `companion-module-cubase/src/midi/protocol.ts`, the current enum (lines 45-61) reads:

```typescript
export enum MarkerNote {
  AddMarker = 0,
  // Next/Previous Marker and To Marker 1-9 were built, unit-tested, and
  // verified live before being trimmed out of the v1.0 release for scope,
  // then restored here -- see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
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
```

Replace it with:

```typescript
export enum MarkerNote {
  AddMarker = 0,
  // Next/Previous Marker and To Marker 1-9 were built, unit-tested, and
  // verified live before being trimmed out of the v1.0 release for scope,
  // then restored here -- see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
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
  // Set Marker 1-9 (assign/overwrite marker slot N at the current position)
  // and punch points -- see
  // docs/superpowers/specs/2026-07-13-cubase-companion-punch-markers-design.md.
  SetMarker1 = 12,
  SetMarker2 = 13,
  SetMarker3 = 14,
  SetMarker4 = 15,
  SetMarker5 = 16,
  SetMarker6 = 17,
  SetMarker7 = 18,
  SetMarker8 = 19,
  SetMarker9 = 20,
  SetPunchIn = 21,
  SetPunchOut = 22,
  AutoPunchIn = 23,
  AutoPunchOut = 24,
}
```

- [ ] **Step 2: Confirm no existing test needs updating**

Run: `grep -n "MarkerNote" "companion-module-cubase/test/midi/protocol.test.ts"`

Expected: matches only use individual enum members (e.g. `MarkerNote.AddMarker`), not `Object.keys(MarkerNote)` or similar exhaustive enumeration. If an exhaustive check exists, add the 13 new keys to it; otherwise no test change needed.

- [ ] **Step 3: Run the protocol test suite**

Run: `cd "companion-module-cubase" && npx vitest run test/midi/protocol.test.ts`
Expected: all existing tests still PASS (this step only added enum members, it didn't change behavior).

- [ ] **Step 4: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts
git commit -m "feat: add Set Marker 1-9 and punch point notes to MarkerNote"
```

---

### Task 2: Add actions to `actions.ts`

**Files:**
- Modify: `companion-module-cubase/src/actions.ts:105-109`
- Test: `companion-module-cubase/test/actions.test.ts`

**Interfaces:**
- Consumes: `MarkerNote.SetMarker1`..`SetMarker9`, `SetPunchIn`, `SetPunchOut`, `AutoPunchIn`, `AutoPunchOut` (from Task 1), `MARKERS_CHANNEL` (existing), `self.midi.sendTrigger(channel: number, note: number): void` (existing `ModuleLike` interface method).
- Produces: action ids `setMarker1`..`setMarker9`, `setPunchIn`, `setPunchOut`, `autoPunchIn`, `autoPunchOut` in the `CompanionActionDefinitions` returned by `UpdateActions` — consumed by Task 3 (presets.ts).

- [ ] **Step 1: Write the failing tests**

In `companion-module-cubase/test/actions.test.ts`, update the registration-completeness test (lines 21-52) — replace the closing of the array (currently ending `'toMarker9',\n      ].sort(),`) so it reads:

```typescript
  it('registers one action per transport function plus Add Marker', () => {
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
        'setMarker1',
        'setMarker2',
        'setMarker3',
        'setMarker4',
        'setMarker5',
        'setMarker6',
        'setMarker7',
        'setMarker8',
        'setMarker9',
        'setPunchIn',
        'setPunchOut',
        'autoPunchIn',
        'autoPunchOut',
      ].sort(),
    )
  })
```

Then append new test cases at the end of the file, immediately before the closing `})` of the `describe('UpdateActions', ...)` block (i.e. right after the existing `it.each(...)('toMarker%i ...')` block that ends at line 223):

```typescript
  it.each([
    [1, 'SetMarker1'],
    [2, 'SetMarker2'],
    [3, 'SetMarker3'],
    [4, 'SetMarker4'],
    [5, 'SetMarker5'],
    [6, 'SetMarker6'],
    [7, 'SetMarker7'],
    [8, 'SetMarker8'],
    [9, 'SetMarker9'],
  ] as const)('setMarker%i action sends a trigger on MARKERS_CHANNEL, %s note', async (n, noteKey) => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions[`setMarker${n}`].callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote[noteKey])
  })

  it('setPunchIn action sends a trigger on MARKERS_CHANNEL, SetPunchIn note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.setPunchIn.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.SetPunchIn)
  })

  it('setPunchOut action sends a trigger on MARKERS_CHANNEL, SetPunchOut note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.setPunchOut.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.SetPunchOut)
  })

  it('autoPunchIn action sends a trigger on MARKERS_CHANNEL, AutoPunchIn note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.autoPunchIn.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AutoPunchIn)
  })

  it('autoPunchOut action sends a trigger on MARKERS_CHANNEL, AutoPunchOut note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.autoPunchOut.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AutoPunchOut)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "companion-module-cubase" && npx vitest run test/actions.test.ts`
Expected: FAIL — `definitions.setMarker1` (and the other new ids) is `undefined`, so `.callback` throws, and the registration-completeness test's array comparison fails (actual definitions object is missing the 13 new keys).

- [ ] **Step 3: Add the 13 new actions**

In `companion-module-cubase/src/actions.ts`, the current `addMarker` action and closing brace (lines 105-110) read:

```typescript
    addMarker: {
      name: 'Add Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker),
    },
  }
```

Replace with:

```typescript
    addMarker: {
      name: 'Add Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker),
    },
    // Set Marker 1-9 (assign/overwrite marker slot N at the current position)
    // and punch points: one-shot triggers on MARKERS_CHANNEL, no feedback --
    // see docs/superpowers/specs/2026-07-13-cubase-companion-punch-markers-design.md.
    setMarker1: {
      name: 'Set Marker 1',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker1),
    },
    setMarker2: {
      name: 'Set Marker 2',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker2),
    },
    setMarker3: {
      name: 'Set Marker 3',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker3),
    },
    setMarker4: {
      name: 'Set Marker 4',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker4),
    },
    setMarker5: {
      name: 'Set Marker 5',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker5),
    },
    setMarker6: {
      name: 'Set Marker 6',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker6),
    },
    setMarker7: {
      name: 'Set Marker 7',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker7),
    },
    setMarker8: {
      name: 'Set Marker 8',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker8),
    },
    setMarker9: {
      name: 'Set Marker 9',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker9),
    },
    setPunchIn: {
      name: 'Set Punch In Position',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetPunchIn),
    },
    setPunchOut: {
      name: 'Set Punch Out Position',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetPunchOut),
    },
    autoPunchIn: {
      name: 'Auto Punch In',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AutoPunchIn),
    },
    autoPunchOut: {
      name: 'Auto Punch Out',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AutoPunchOut),
    },
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "companion-module-cubase" && npx vitest run test/actions.test.ts`
Expected: PASS, all tests including the 13 new ones.

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/actions.ts companion-module-cubase/test/actions.test.ts
git commit -m "feat: add Set Marker 1-9 and punch point actions"
```

---

### Task 3: Add "Punch" preset section and Set Marker presets to `presets.ts`

**Files:**
- Modify: `companion-module-cubase/src/presets.ts:68-135`

**Interfaces:**
- Consumes: action ids `setMarker1`..`setMarker9`, `setPunchIn`, `setPunchOut`, `autoPunchIn`, `autoPunchOut` (from Task 2), existing `preset(text: string, actionId: string, feedbackId?: string): CompanionSimplePresetDefinition` helper.
- Produces: preset ids of the same names, registered under `"Markers"` (Set Marker 1-9) and a new `"Punch"` section (the 4 punch actions) in `UpdatePresets`'s `structure` output.

No dedicated test file exists for `presets.ts` today (matching current project convention — confirmed in the design spec's Testing plan); none is added here.

- [ ] **Step 1: Extend `MARKER_PRESET_IDS` and add `PUNCH_PRESET_IDS`**

In `companion-module-cubase/src/presets.ts`, the current `MARKER_PRESET_IDS` constant (lines 68-81) reads:

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

Replace it with:

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
  'setMarker1',
  'setMarker2',
  'setMarker3',
  'setMarker4',
  'setMarker5',
  'setMarker6',
  'setMarker7',
  'setMarker8',
  'setMarker9',
] as const

const PUNCH_PRESET_IDS = ['setPunchIn', 'setPunchOut', 'autoPunchIn', 'autoPunchOut'] as const
```

- [ ] **Step 2: Add the preset definitions**

The current `addMarker`..`toMarker9` presets and the line before `cubaseConnected` (lines 93-105) read:

```typescript
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

Replace with:

```typescript
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
    setMarker1: preset('Set Marker 1', 'setMarker1'),
    setMarker2: preset('Set Marker 2', 'setMarker2'),
    setMarker3: preset('Set Marker 3', 'setMarker3'),
    setMarker4: preset('Set Marker 4', 'setMarker4'),
    setMarker5: preset('Set Marker 5', 'setMarker5'),
    setMarker6: preset('Set Marker 6', 'setMarker6'),
    setMarker7: preset('Set Marker 7', 'setMarker7'),
    setMarker8: preset('Set Marker 8', 'setMarker8'),
    setMarker9: preset('Set Marker 9', 'setMarker9'),
    setPunchIn: preset('Set Punch In', 'setPunchIn'),
    setPunchOut: preset('Set Punch Out', 'setPunchOut'),
    autoPunchIn: preset('Auto Punch In', 'autoPunchIn'),
    autoPunchOut: preset('Auto Punch Out', 'autoPunchOut'),
    cubaseConnected: {
```

- [ ] **Step 3: Add the "Punch" section to `structure`**

The current `structure` array (lines 119-135) reads:

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

Replace with:

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
      id: 'punch',
      name: 'Punch',
      definitions: [...PUNCH_PRESET_IDS],
    },
    {
      id: 'status',
      name: 'Status',
      definitions: ['cubaseConnected'],
    },
  ]
```

- [ ] **Step 4: Type-check**

Run: `cd "companion-module-cubase" && npx tsc --noEmit -p tsconfig.build.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/presets.ts
git commit -m "feat: add Set Marker 1-9 presets and new Punch preset section"
```

---

### Task 4: Add buttons and bindings to the Cubase script

**Files:**
- Modify: `cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js`

**Interfaces:**
- Consumes: `MARKERS_CHANNEL` (existing constant, value 14), the note values defined in this task's own new constants (must match Task 1's `MarkerNote` values exactly: `SetMarker1..9` = 12-20, `SetPunchIn` = 21, `SetPunchOut` = 22, `AutoPunchIn` = 23, `AutoPunchOut` = 24).
- Produces: no exports (ES5 script) — this task's correctness is checked by live verification in Task 5, not by unit tests (documented limitation, same as every prior Cubase-script task).

- [ ] **Step 1: Add the note constants**

In `cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js`, the current Markers constants block (lines 34-49) ends with:

```javascript
var NOTE_TO_MARKER_9 = 11
```

Insert immediately after it (still before the blank line at line 50):

```javascript
// Set Marker 1-9 (assign/overwrite marker slot N at the current position)
// and punch points -- see
// docs/superpowers/specs/2026-07-13-cubase-companion-punch-markers-design.md.
var NOTE_SET_MARKER_1 = 12
var NOTE_SET_MARKER_2 = 13
var NOTE_SET_MARKER_3 = 14
var NOTE_SET_MARKER_4 = 15
var NOTE_SET_MARKER_5 = 16
var NOTE_SET_MARKER_6 = 17
var NOTE_SET_MARKER_7 = 18
var NOTE_SET_MARKER_8 = 19
var NOTE_SET_MARKER_9 = 20
var NOTE_SET_PUNCH_IN = 21
var NOTE_SET_PUNCH_OUT = 22
var NOTE_AUTO_PUNCH_IN = 23
var NOTE_AUTO_PUNCH_OUT = 24
```

- [ ] **Step 2: Add the button declarations**

The current Markers buttons block ends with (current lines 99-110):

```javascript
var btnAddMarker = makeButton(0, 1)
var btnNextMarker = makeButton(1, 1)
var btnPreviousMarker = makeButton(2, 1)
var btnToMarker1 = makeButton(3, 1)
var btnToMarker2 = makeButton(4, 1)
var btnToMarker3 = makeButton(5, 1)
var btnToMarker4 = makeButton(6, 1)
var btnToMarker5 = makeButton(7, 1)
var btnToMarker6 = makeButton(8, 1)
var btnToMarker7 = makeButton(9, 1)
var btnToMarker8 = makeButton(10, 1)
var btnToMarker9 = makeButton(11, 1)
```

Insert immediately after it:

```javascript

// Set Marker 1-9 -- row 2, so they don't collide with row 1's marker
// navigation buttons.
var btnSetMarker1 = makeButton(0, 2)
var btnSetMarker2 = makeButton(1, 2)
var btnSetMarker3 = makeButton(2, 2)
var btnSetMarker4 = makeButton(3, 2)
var btnSetMarker5 = makeButton(4, 2)
var btnSetMarker6 = makeButton(5, 2)
var btnSetMarker7 = makeButton(6, 2)
var btnSetMarker8 = makeButton(7, 2)
var btnSetMarker9 = makeButton(8, 2)

// Punch points -- row 3.
var btnSetPunchIn = makeButton(0, 3)
var btnSetPunchOut = makeButton(1, 3)
var btnAutoPunchIn = makeButton(2, 3)
var btnAutoPunchOut = makeButton(3, 3)
```

- [ ] **Step 3: Add the MIDI bindings**

The current Markers MIDI bindings block ends with (current lines 131-142):

```javascript
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
```

Insert immediately after it:

```javascript
btnSetMarker1.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_1)
btnSetMarker2.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_2)
btnSetMarker3.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_3)
btnSetMarker4.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_4)
btnSetMarker5.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_5)
btnSetMarker6.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_6)
btnSetMarker7.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_7)
btnSetMarker8.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_8)
btnSetMarker9.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_MARKER_9)
btnSetPunchIn.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_PUNCH_IN)
btnSetPunchOut.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_SET_PUNCH_OUT)
btnAutoPunchIn.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_AUTO_PUNCH_IN)
btnAutoPunchOut.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_AUTO_PUNCH_OUT)
```

- [ ] **Step 4: Add the command bindings**

The current Markers command bindings block ends with (current lines 167-178):

```javascript
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
```

Insert immediately after it:

```javascript
page.makeCommandBinding(btnSetMarker1.mSurfaceValue, 'Transport', 'Set Marker 1')
page.makeCommandBinding(btnSetMarker2.mSurfaceValue, 'Transport', 'Set Marker 2')
page.makeCommandBinding(btnSetMarker3.mSurfaceValue, 'Transport', 'Set Marker 3')
page.makeCommandBinding(btnSetMarker4.mSurfaceValue, 'Transport', 'Set Marker 4')
page.makeCommandBinding(btnSetMarker5.mSurfaceValue, 'Transport', 'Set Marker 5')
page.makeCommandBinding(btnSetMarker6.mSurfaceValue, 'Transport', 'Set Marker 6')
page.makeCommandBinding(btnSetMarker7.mSurfaceValue, 'Transport', 'Set Marker 7')
page.makeCommandBinding(btnSetMarker8.mSurfaceValue, 'Transport', 'Set Marker 8')
page.makeCommandBinding(btnSetMarker9.mSurfaceValue, 'Transport', 'Set Marker 9')
page.makeCommandBinding(btnSetPunchIn.mSurfaceValue, 'Transport', 'Set Punch In Position')
page.makeCommandBinding(btnSetPunchOut.mSurfaceValue, 'Transport', 'Set Punch Out Position')
page.makeCommandBinding(btnAutoPunchIn.mSurfaceValue, 'Transport', 'Auto Punch In')
page.makeCommandBinding(btnAutoPunchOut.mSurfaceValue, 'Transport', 'Auto Punch Out')
```

- [ ] **Step 5: Commit**

```bash
git add "cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js"
git commit -m "feat: add Set Marker 1-9 and punch point buttons to Cubase script"
```

---

### Task 5: Build, deploy, and verify live

**Files:** none (deployment/verification only — no source changes)

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `cd "companion-module-cubase" && npm test`
Expected: all tests PASS (79 existing + 13 new `it` cases from Task 2, plus the 9 parameterized `setMarker%i` cases count individually — verify the final count in the output is 79 + 13 = 92 or higher depending on how `it.each` is counted by Vitest's reporter).

- [ ] **Step 2: Build the Companion module**

Run: `cd "companion-module-cubase" && npm run build`
Expected: exits 0, `dist/` regenerated with no TypeScript errors.

- [ ] **Step 3: Deploy the Cubase script**

Run:
```bash
cp "cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js" "/c/Users/Admin/Documents/Steinberg/Cubase/MIDI Remote/Driver Scripts/Local/Cubanion/Transport/Cubanion_Transport.js"
```
Expected: file copied, no error.

- [ ] **Step 4: Deploy the Companion module**

Run:
```bash
cp -r companion-module-cubase/dist/* "/c/Users/Admin/Documents/companion-modules/cubanion/"
cp companion-module-cubase/companion/manifest.json "/c/Users/Admin/Documents/companion-modules/cubanion/companion/manifest.json"
sed -i 's#"\.\./dist/main\.js"#"../main.js"#' "/c/Users/Admin/Documents/companion-modules/cubanion/companion/manifest.json"
grep entrypoint "/c/Users/Admin/Documents/companion-modules/cubanion/companion/manifest.json"
```
Expected: last command prints `"entrypoint": "../main.js",` (the recurring flatten-fix, required every redeploy per DEPLOYMENT.md).

- [ ] **Step 5: Report deployment complete and hand off for live verification**

This step is a checkpoint, not an automated action — report to the project owner that:
- Cubase script and Companion module are both deployed.
- Cubase needs a MIDI Remote rescan (or restart) to pick up the new buttons/bindings on the existing device driver.
- The Companion connection likely needs deleting and re-adding (per DEPLOYMENT.md's documented "stale module reference" gotcha) if it doesn't pick up the new actions/presets automatically.
- Ask the project owner to verify each of the 13 new buttons in Companion triggers the correct behavior in Cubase: marker slots 1-9 reassign at the current playhead position, punch in/out points move to the current playhead position, and Auto Punch In/Out visibly toggle in Cubase's transport panel. No feedback to check, since none exists for this action set (per design).

Do not mark this task complete until the project owner confirms live verification passed.
