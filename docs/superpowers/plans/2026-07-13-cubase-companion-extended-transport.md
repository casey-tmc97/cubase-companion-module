# Extended Transport Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Companion actions/presets and Cubase script buttons for the 120 remaining Transport-category Cubase key commands, using a data-driven architecture (one source-of-truth array, consumed via loops) rather than the hand-written-per-command pattern used for the smaller Transport/Markers/Punch batches.

**Architecture:** A new file `src/midi/extendedTransportCommands.ts` exports `EXTENDED_TRANSPORT_CHANNEL` (13) and `EXTENDED_TRANSPORT_COMMANDS` (120-entry array of `{id, label, command, group}`). `actions.ts` and `presets.ts` both loop over this array to generate definitions instead of 120 hand-written blocks. The Cubase script gets its own literal JS array of the same 120 command strings, in the same order, and a `for` loop that builds all 120 buttons/bindings.

**Tech Stack:** TypeScript (`companion-module-cubase`, `@companion-module/base`, Vitest), Cubase MIDI Remote API v1 (ES5 JavaScript, `Cubanion_Transport.js`).

## Global Constraints

- `EXTENDED_TRANSPORT_CHANNEL = 13` (zero-indexed, MIDI channel 14) — distinct from `TRANSPORT_CHANNEL` (15) and `MARKERS_CHANNEL` (14 zero-indexed... i.e. `MARKERS_CHANNEL = 14`, do not confuse with the new channel's *value* 13).
- The TypeScript array (`extendedTransportCommands.ts`) and the Cubase script's literal JS array MUST list all 120 commands in the **exact same order** — array index is the MIDI note number in both, with no separate enum.
- No feedback for any of the 120 commands — one-shot Note On + Note Off triggers only, via `page.makeCommandBinding(..., 'Transport', <exact command string>)` in the Cubase script and `self.midi.sendTrigger(EXTENDED_TRANSPORT_CHANNEL, index)` on the Companion side.
- Companion preset sections are generated from each command's `group` field, in first-appearance order, inserted into `UpdatePresets`'s `structure` array after the existing `'punch'` section and before `'status'`.
- Cubase script buttons occupy grid rows 4-13 (12 columns × 10 rows), continuing after the existing rows 0-3.
- The exact 120-entry table (id / label / command / group) is fully specified in `docs/superpowers/specs/2026-07-13-cubase-companion-extended-transport-design.md`'s "Command table" section — every array in this plan was generated directly from that table and is not to be re-derived or retyped from any other source.

---

### Task 1: Create the shared command-table module

**Files:**
- Create: `companion-module-cubase/src/midi/extendedTransportCommands.ts`
- Test: `companion-module-cubase/test/midi/extendedTransportCommands.test.ts`

**Interfaces:**
- Produces: `EXTENDED_TRANSPORT_CHANNEL: number` (13), `ExtendedTransportCommand` interface (`{id: string, label: string, command: string, group: string}`), `EXTENDED_TRANSPORT_COMMANDS: ExtendedTransportCommand[]` (120 entries) — consumed by Task 2 (`actions.ts`) and Task 3 (`presets.ts`).

- [ ] **Step 1: Write the failing test**

Create `companion-module-cubase/test/midi/extendedTransportCommands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { EXTENDED_TRANSPORT_CHANNEL, EXTENDED_TRANSPORT_COMMANDS } from '../../src/midi/extendedTransportCommands.js'

describe('EXTENDED_TRANSPORT_COMMANDS', () => {
  it('uses zero-indexed channel 13 for MIDI channel 14', () => {
    expect(EXTENDED_TRANSPORT_CHANNEL).toBe(13)
  })

  it('has exactly 120 commands', () => {
    expect(EXTENDED_TRANSPORT_COMMANDS).toHaveLength(120)
  })

  it('has unique ids for every command', () => {
    const ids = EXTENDED_TRANSPORT_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spot-checks specific entries against the design spec', () => {
    expect(EXTENDED_TRANSPORT_COMMANDS[0]).toEqual({
      id: 'setLeftLocator',
      label: 'Set Left Locator',
      command: 'Set Left Locator',
      group: 'Locators',
    })
    expect(EXTENDED_TRANSPORT_COMMANDS[59]).toEqual({
      id: 'fastForward',
      label: 'Fast Forward',
      command: 'Fast Forward',
      group: 'Transport Extras',
    })
    expect(EXTENDED_TRANSPORT_COMMANDS[119]).toEqual({
      id: 'tempoTrackRehearsalModeOnOff',
      label: 'Tempo Track Rehearsal Mode',
      command: 'Tempo Track Rehearsal Mode On/Off',
      group: 'Setup/Misc',
    })
  })

  it('has 18 distinct groups matching the design spec group counts', () => {
    const counts: Record<string, number> = {}
    for (const c of EXTENDED_TRANSPORT_COMMANDS) {
      counts[c.group] = (counts[c.group] ?? 0) + 1
    }
    expect(counts).toEqual({
      Locators: 10,
      'Cycle Markers': 21,
      'Punch (Extra)': 6,
      'Marker Misc': 3,
      'Selection Playback': 10,
      'Loop/Locate Selection': 4,
      'Event/Hitpoint Nav': 4,
      'Transport Extras': 5,
      'Restart/Start Position': 3,
      'Nudge Cursor': 8,
      'Nudge Frame/Step': 4,
      Jog: 2,
      Shuttle: 14,
      'Record Modes': 10,
      'MIDI Retrospective Record': 3,
      'Tempo/Time': 2,
      'Pre/Post-Roll & Sync': 6,
      'Setup/Misc': 5,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "companion-module-cubase" && npx vitest run test/midi/extendedTransportCommands.test.ts`
Expected: FAIL — cannot find module `'../../src/midi/extendedTransportCommands.js'`.

- [ ] **Step 3: Create the source file**

Create `companion-module-cubase/src/midi/extendedTransportCommands.ts` with exactly this content:

```typescript
export const EXTENDED_TRANSPORT_CHANNEL = 13 // MIDI channel 14, zero-indexed

export interface ExtendedTransportCommand {
  id: string
  label: string
  command: string
  group: string
}

// Note number = array index. See docs/superpowers/specs/2026-07-13-cubase-companion-extended-transport-design.md
// (Command table section) -- this array must stay in the exact same order as the
// EXTENDED_TRANSPORT_COMMANDS array in the Cubase script (Cubanion_Transport.js).
export const EXTENDED_TRANSPORT_COMMANDS: ExtendedTransportCommand[] = [
  { id: 'setLeftLocator', label: 'Set Left Locator', command: 'Set Left Locator', group: 'Locators' },
  { id: 'setRightLocator', label: 'Set Right Locator', command: 'Set Right Locator', group: 'Locators' },
  { id: 'toLeftLocator', label: 'To Left Locator', command: 'To Left Locator', group: 'Locators' },
  { id: 'toRightLocator', label: 'To Right Locator', command: 'To Right Locator', group: 'Locators' },
  { id: 'exchangeLocatorPositions', label: 'Exchange Locator Positions', command: 'Exchange Locator Positions', group: 'Locators' },
  { id: 'locatorsToSelection', label: 'Locators to Selection', command: 'Locators to Selection', group: 'Locators' },
  { id: 'inputLeftLocator', label: 'Input Left Locator', command: 'Input Left Locator', group: 'Locators' },
  { id: 'inputRightLocator', label: 'Input Right Locator', command: 'Input Right Locator', group: 'Locators' },
  { id: 'inputLocatorDuration', label: 'Input Locator Duration', command: 'Input Locator Duration', group: 'Locators' },
  { id: 'inputPosition', label: 'Input Position', command: 'Input Position', group: 'Locators' },
  { id: 'insertCycleMarker', label: 'Insert Cycle Marker', command: 'Insert Cycle Marker', group: 'Cycle Markers' },
  { id: 'toCycleMarker1', label: 'To Cycle Marker 1', command: 'To Cycle Marker 1', group: 'Cycle Markers' },
  { id: 'toCycleMarker2', label: 'To Cycle Marker 2', command: 'To Cycle Marker 2', group: 'Cycle Markers' },
  { id: 'toCycleMarker3', label: 'To Cycle Marker 3', command: 'To Cycle Marker 3', group: 'Cycle Markers' },
  { id: 'toCycleMarker4', label: 'To Cycle Marker 4', command: 'To Cycle Marker 4', group: 'Cycle Markers' },
  { id: 'toCycleMarker5', label: 'To Cycle Marker 5', command: 'To Cycle Marker 5', group: 'Cycle Markers' },
  { id: 'toCycleMarker6', label: 'To Cycle Marker 6', command: 'To Cycle Marker 6', group: 'Cycle Markers' },
  { id: 'toCycleMarker7', label: 'To Cycle Marker 7', command: 'To Cycle Marker 7', group: 'Cycle Markers' },
  { id: 'toCycleMarker8', label: 'To Cycle Marker 8', command: 'To Cycle Marker 8', group: 'Cycle Markers' },
  { id: 'toCycleMarker9', label: 'To Cycle Marker 9', command: 'To Cycle Marker 9', group: 'Cycle Markers' },
  { id: 'toCycleMarkerX', label: 'To Cycle Marker X', command: 'To Cycle Marker X', group: 'Cycle Markers' },
  { id: 'recallCycleMarker1', label: 'Recall Cycle Marker 1', command: 'Recall Cycle Marker 1', group: 'Cycle Markers' },
  { id: 'recallCycleMarker2', label: 'Recall Cycle Marker 2', command: 'Recall Cycle Marker 2', group: 'Cycle Markers' },
  { id: 'recallCycleMarker3', label: 'Recall Cycle Marker 3', command: 'Recall Cycle Marker 3', group: 'Cycle Markers' },
  { id: 'recallCycleMarker4', label: 'Recall Cycle Marker 4', command: 'Recall Cycle Marker 4', group: 'Cycle Markers' },
  { id: 'recallCycleMarker5', label: 'Recall Cycle Marker 5', command: 'Recall Cycle Marker 5', group: 'Cycle Markers' },
  { id: 'recallCycleMarker6', label: 'Recall Cycle Marker 6', command: 'Recall Cycle Marker 6', group: 'Cycle Markers' },
  { id: 'recallCycleMarker7', label: 'Recall Cycle Marker 7', command: 'Recall Cycle Marker 7', group: 'Cycle Markers' },
  { id: 'recallCycleMarker8', label: 'Recall Cycle Marker 8', command: 'Recall Cycle Marker 8', group: 'Cycle Markers' },
  { id: 'recallCycleMarker9', label: 'Recall Cycle Marker 9', command: 'Recall Cycle Marker 9', group: 'Cycle Markers' },
  { id: 'recallCycleMarkerX', label: 'Recall Cycle Marker X', command: 'Recall Cycle Marker X', group: 'Cycle Markers' },
  { id: 'inputPunchInPosition', label: 'Input Punch In Position', command: 'Input Punch In Position', group: 'Punch (Extra)' },
  { id: 'inputPunchOutPosition', label: 'Input Punch Out Position', command: 'Input Punch Out Position', group: 'Punch (Extra)' },
  { id: 'setPunchPointsToSelection', label: 'Set Punch Points To Selection', command: 'Set Punch Points To Selection', group: 'Punch (Extra)' },
  { id: 'syncPunchToCycle', label: 'Sync Punch To Cycle', command: 'Sync Punch To Cycle', group: 'Punch (Extra)' },
  { id: 'toPunchInPosition', label: 'To Punch In Position', command: 'To Punch In Position', group: 'Punch (Extra)' },
  { id: 'toPunchOutPosition', label: 'To Punch Out Position', command: 'To Punch Out Position', group: 'Punch (Extra)' },
  { id: 'playUntilNextMarker', label: 'Play until Next Marker', command: 'Play until Next Marker', group: 'Marker Misc' },
  { id: 'toMarkerX', label: 'To Marker X', command: 'To Marker X', group: 'Marker Misc' },
  { id: 'toggleCycleFollowsMarkers', label: 'Toggle Cycle Follows Markers', command: 'Toggle: Cycle follows when locating to Markers', group: 'Marker Misc' },
  { id: 'playSelectionRange', label: 'Play Selection Range', command: 'Play Selection Range', group: 'Selection Playback' },
  { id: 'playSelectionSolo', label: 'Play Selection Solo', command: 'Play Selection Solo', group: 'Selection Playback' },
  { id: 'playFromSelectionEnd', label: 'Play from Selection End', command: 'Play from Selection End', group: 'Selection Playback' },
  { id: 'playFromSelectionStart', label: 'Play from Selection Start', command: 'Play from Selection Start', group: 'Selection Playback' },
  { id: 'playUntilSelectionEnd', label: 'Play until Selection End', command: 'Play until Selection End', group: 'Selection Playback' },
  { id: 'playUntilSelectionStart', label: 'Play until Selection Start', command: 'Play until Selection Start', group: 'Selection Playback' },
  { id: 'postRollFromSelectionEnd', label: 'Post-roll from Selection End', command: 'Post-roll from Selection End', group: 'Selection Playback' },
  { id: 'postRollFromSelectionStart', label: 'Post-roll from Selection Start', command: 'Post-roll from Selection Start', group: 'Selection Playback' },
  { id: 'preRollToSelectionEnd', label: 'Pre-roll to Selection End', command: 'Pre-roll to Selection End', group: 'Selection Playback' },
  { id: 'preRollToSelectionStart', label: 'Pre-roll to Selection Start', command: 'Pre-roll to Selection Start', group: 'Selection Playback' },
  { id: 'locateSelection', label: 'Locate Selection', command: 'Locate Selection', group: 'Loop/Locate Selection' },
  { id: 'locateSelectionEnd', label: 'Locate Selection End', command: 'Locate Selection End', group: 'Loop/Locate Selection' },
  { id: 'loopSelection', label: 'Loop Selection', command: 'Loop Selection', group: 'Loop/Locate Selection' },
  { id: 'loopSelectionSolo', label: 'Loop Selection Solo', command: 'Loop Selection Solo', group: 'Loop/Locate Selection' },
  { id: 'locateNextEvent', label: 'Locate Next Event', command: 'Locate Next Event', group: 'Event/Hitpoint Nav' },
  { id: 'locatePreviousEvent', label: 'Locate Previous Event', command: 'Locate Previous Event', group: 'Event/Hitpoint Nav' },
  { id: 'locateNextHitpoint', label: 'Locate Next Hitpoint', command: 'Locate Next Hitpoint', group: 'Event/Hitpoint Nav' },
  { id: 'locatePreviousHitpoint', label: 'Locate Previous Hitpoint', command: 'Locate Previous Hitpoint', group: 'Event/Hitpoint Nav' },
  { id: 'fastRewind', label: 'Fast Rewind', command: 'Fast Rewind', group: 'Transport Extras' },
  { id: 'fastForward', label: 'Fast Forward', command: 'Fast Forward', group: 'Transport Extras' },
  { id: 'gotoEnd', label: 'Goto End', command: 'Goto End', group: 'Transport Extras' },
  { id: 'startStop', label: 'Start/Stop', command: 'StartStop', group: 'Transport Extras' },
  { id: 'startStopPreview', label: 'Start/Stop Preview', command: 'StartStop Preview', group: 'Transport Extras' },
  { id: 'restart', label: 'Restart', command: 'Restart', group: 'Restart/Start Position' },
  { id: 'returnToStartPosition', label: 'Return to Start Position', command: 'Return to Start Position', group: 'Restart/Start Position' },
  { id: 'activateReturnToStartPosition', label: 'Activate Return to Start Position', command: 'Activate Return to Start Position', group: 'Restart/Start Position' },
  { id: 'nudgeCursorRight', label: 'Nudge Cursor Right', command: 'Nudge Cursor Right', group: 'Nudge Cursor' },
  { id: 'nudgeCursorLeft', label: 'Nudge Cursor Left', command: 'Nudge Cursor Left', group: 'Nudge Cursor' },
  { id: 'nudgeCursorMinus5Seconds', label: 'Nudge Cursor -5s', command: 'Nudge Cursor -5 Seconds', group: 'Nudge Cursor' },
  { id: 'nudgeCursorPlus5Seconds', label: 'Nudge Cursor +5s', command: 'Nudge Cursor +5 Seconds', group: 'Nudge Cursor' },
  { id: 'nudgeCursorMinus10Seconds', label: 'Nudge Cursor -10s', command: 'Nudge Cursor -10 Seconds', group: 'Nudge Cursor' },
  { id: 'nudgeCursorPlus10Seconds', label: 'Nudge Cursor +10s', command: 'Nudge Cursor +10 Seconds', group: 'Nudge Cursor' },
  { id: 'nudgeCursorMinus20Seconds', label: 'Nudge Cursor -20s', command: 'Nudge Cursor -20 Seconds', group: 'Nudge Cursor' },
  { id: 'nudgeCursorPlus20Seconds', label: 'Nudge Cursor +20s', command: 'Nudge Cursor +20 Seconds', group: 'Nudge Cursor' },
  { id: 'nudgePlus1Frame', label: 'Nudge +1 Frame', command: 'Nudge +1 Frame', group: 'Nudge Frame/Step' },
  { id: 'nudgeMinus1Frame', label: 'Nudge -1 Frame', command: 'Nudge -1 Frame', group: 'Nudge Frame/Step' },
  { id: 'stepBar', label: 'Step Bar', command: 'Step Bar', group: 'Nudge Frame/Step' },
  { id: 'stepBackBar', label: 'Step Back Bar', command: 'Step Back Bar', group: 'Nudge Frame/Step' },
  { id: 'jogLeft', label: 'Jog Left', command: 'Jog Left', group: 'Jog' },
  { id: 'jogRight', label: 'Jog Right', command: 'Jog Right', group: 'Jog' },
  { id: 'shuttlePlay1x', label: 'Shuttle Play 1x', command: 'Shuttle Play 1x', group: 'Shuttle' },
  { id: 'shuttlePlay2x', label: 'Shuttle Play 2x', command: 'Shuttle Play 2x', group: 'Shuttle' },
  { id: 'shuttlePlay4x', label: 'Shuttle Play 4x', command: 'Shuttle Play 4x', group: 'Shuttle' },
  { id: 'shuttlePlay8x', label: 'Shuttle Play 8x', command: 'Shuttle Play 8x', group: 'Shuttle' },
  { id: 'shuttlePlayHalfX', label: 'Shuttle Play 1/2x', command: 'Shuttle Play 1/2x', group: 'Shuttle' },
  { id: 'shuttlePlayQuarterX', label: 'Shuttle Play 1/4x', command: 'Shuttle Play 1/4x', group: 'Shuttle' },
  { id: 'shuttlePlayEighthX', label: 'Shuttle Play 1/8x', command: 'Shuttle Play 1/8x', group: 'Shuttle' },
  { id: 'shuttlePlayReverse1x', label: 'Shuttle Play Reverse 1x', command: 'Shuttle Play Reverse 1x', group: 'Shuttle' },
  { id: 'shuttlePlayReverse2x', label: 'Shuttle Play Reverse 2x', command: 'Shuttle Play Reverse 2x', group: 'Shuttle' },
  { id: 'shuttlePlayReverse4x', label: 'Shuttle Play Reverse 4x', command: 'Shuttle Play Reverse 4x', group: 'Shuttle' },
  { id: 'shuttlePlayReverse8x', label: 'Shuttle Play Reverse 8x', command: 'Shuttle Play Reverse 8x', group: 'Shuttle' },
  { id: 'shuttlePlayReverseHalfX', label: 'Shuttle Play Reverse 1/2x', command: 'Shuttle Play Reverse 1/2x', group: 'Shuttle' },
  { id: 'shuttlePlayReverseQuarterX', label: 'Shuttle Play Reverse 1/4x', command: 'Shuttle Play Reverse 1/4x', group: 'Shuttle' },
  { id: 'shuttlePlayReverseEighthX', label: 'Shuttle Play Reverse 1/8x', command: 'Shuttle Play Reverse 1/8x', group: 'Shuttle' },
  { id: 'audioRecordMode', label: 'Audio Record Mode', command: 'Audio Record Mode', group: 'Record Modes' },
  { id: 'globalRetrospectiveRecord', label: 'Global Retrospective Record', command: 'Global Retrospective Record', group: 'Record Modes' },
  { id: 'lockRecord', label: 'Lock Record', command: 'Lock Record', group: 'Record Modes' },
  { id: 'midiCycleRecordMode', label: 'MIDI Cycle Record Mode', command: 'MIDI Cycle Record Mode', group: 'Record Modes' },
  { id: 'midiRecordAutoQuantize', label: 'MIDI Record Auto Quantize', command: 'MIDI Record Auto Quantize', group: 'Record Modes' },
  { id: 'midiRecordMode', label: 'MIDI Record Mode', command: 'MIDI Record Mode', group: 'Record Modes' },
  { id: 'reRecordOnOff', label: 'Re-Record On/Off', command: 'Re-Record on/off', group: 'Record Modes' },
  { id: 'startMode', label: 'Start Mode', command: 'Start Mode', group: 'Record Modes' },
  { id: 'startRecordAtLeftLocator', label: 'Start Record at Left Locator', command: 'Start Record at Left Locator', group: 'Record Modes' },
  { id: 'unlockRecord', label: 'Unlock Record', command: 'Unlock Record', group: 'Record Modes' },
  { id: 'midiRetrospectiveRecordEmptyAllBuffers', label: 'MIDI Retro Record: Empty Buffers', command: 'MIDI Retrospective Record: Empty All Buffers', group: 'MIDI Retrospective Record' },
  { id: 'midiRetrospectiveRecordInsertCycle', label: 'MIDI Retro Record: Insert Cycle', command: 'MIDI Retrospective Record: Insert from Track Input as Cycle Recording', group: 'MIDI Retrospective Record' },
  { id: 'midiRetrospectiveRecordInsertLinear', label: 'MIDI Retro Record: Insert Linear', command: 'MIDI Retrospective Record: Insert from Track Input as Linear Recording', group: 'MIDI Retrospective Record' },
  { id: 'inputTempo', label: 'Input Tempo', command: 'Input Tempo', group: 'Tempo/Time' },
  { id: 'inputTimeSignature', label: 'Input Time Signature', command: 'Input Time Signature', group: 'Tempo/Time' },
  { id: 'precountOn', label: 'Precount On', command: 'Precount On', group: 'Pre/Post-Roll & Sync' },
  { id: 'projectSynchronizationSetup', label: 'Project Sync Setup', command: 'Project Synchronization Setup', group: 'Pre/Post-Roll & Sync' },
  { id: 'useExternalSync', label: 'Use External Sync', command: 'Use External Sync', group: 'Pre/Post-Roll & Sync' },
  { id: 'usePostRoll', label: 'Use Post-roll', command: 'Use Post-roll', group: 'Pre/Post-Roll & Sync' },
  { id: 'usePrePostRoll', label: 'Use Pre-/Post-Roll', command: 'Use Pre-/Post-Roll', group: 'Pre/Post-Roll & Sync' },
  { id: 'usePreRoll', label: 'Use Pre-roll', command: 'Use Pre-roll', group: 'Pre/Post-Roll & Sync' },
  { id: 'editMode', label: 'Edit Mode', command: 'Edit Mode', group: 'Setup/Misc' },
  { id: 'exchangeTimeFormats', label: 'Exchange Time Formats', command: 'Exchange Time Formats', group: 'Setup/Misc' },
  { id: 'metronomeSetup', label: 'Metronome Setup', command: 'Metronome Setup', group: 'Setup/Misc' },
  { id: 'panel', label: 'Panel', command: 'Panel', group: 'Setup/Misc' },
  { id: 'tempoTrackRehearsalModeOnOff', label: 'Tempo Track Rehearsal Mode', command: 'Tempo Track Rehearsal Mode On/Off', group: 'Setup/Misc' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "companion-module-cubase" && npx vitest run test/midi/extendedTransportCommands.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/extendedTransportCommands.ts companion-module-cubase/test/midi/extendedTransportCommands.test.ts
git commit -m "feat: add extended transport command table (120 commands)"
```

---

### Task 2: Generate actions from the command table

**Files:**
- Modify: `companion-module-cubase/src/actions.ts`
- Test: `companion-module-cubase/test/actions.test.ts`

**Interfaces:**
- Consumes: `EXTENDED_TRANSPORT_CHANNEL`, `EXTENDED_TRANSPORT_COMMANDS` (from Task 1).
- Produces: 120 new action ids (one per `EXTENDED_TRANSPORT_COMMANDS[i].id`) registered in the `CompanionActionDefinitions` returned by `UpdateActions` — consumed by Task 3 (`presets.ts`).

- [ ] **Step 1: Write the failing tests**

In `companion-module-cubase/test/actions.test.ts`, add this import alongside the existing ones at the top of the file:

```typescript
import { EXTENDED_TRANSPORT_CHANNEL, EXTENDED_TRANSPORT_COMMANDS } from '../src/midi/extendedTransportCommands.js'
```

Update the registration-completeness test's expected array. The current test (from `'registers one action per transport function plus Add Marker'`) ends with a literal array closed by `].sort(),`. Change the array's construction from a single literal to a literal plus the generated ids, so the test becomes:

```typescript
  it('registers one action per transport function plus Add Marker', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    const expectedIds = [
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
      ...EXTENDED_TRANSPORT_COMMANDS.map((c) => c.id),
    ]
    expect(Object.keys(definitions).sort()).toEqual(expectedIds.sort())
  })
```

Then append a new parametrized test at the end of the file, immediately before the closing `})` of the `describe('UpdateActions', ...)` block:

```typescript
  it.each(EXTENDED_TRANSPORT_COMMANDS.map((cmd, index) => [cmd.id, index] as const))(
    'extended transport action %s sends a trigger on EXTENDED_TRANSPORT_CHANNEL, note %i',
    async (id, index) => {
      const self = makeFakeSelf()
      UpdateActions(self as any)
      const definitions = self.setActionDefinitions.mock.calls[0][0]

      await definitions[id].callback({} as any)

      expect(self.midi.sendTrigger).toHaveBeenCalledWith(EXTENDED_TRANSPORT_CHANNEL, index)
    },
  )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "companion-module-cubase" && npx vitest run test/actions.test.ts`
Expected: FAIL — the registration-completeness test's actual definitions object is missing the 120 new ids, and every `extended transport action ...` case fails because `definitions[id]` is `undefined`.

- [ ] **Step 3: Add the import and generation loop to `actions.ts`**

In `companion-module-cubase/src/actions.ts`, the current import line (line 7) reads:

```typescript
import { TransportNote, MarkerNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL } from './midi/protocol.js'
```

Add immediately after it:

```typescript
import { EXTENDED_TRANSPORT_CHANNEL, EXTENDED_TRANSPORT_COMMANDS } from './midi/extendedTransportCommands.js'
```

The current end of the file reads:

```typescript
    autoPunchOut: {
      name: 'Auto Punch Out',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AutoPunchOut),
    },
  }

  self.setActionDefinitions(definitions)
}
```

Replace it with:

```typescript
    autoPunchOut: {
      name: 'Auto Punch Out',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AutoPunchOut),
    },
  }

  // 120 remaining Transport-category key commands, generated from the shared
  // command table rather than hand-written per command -- see
  // docs/superpowers/specs/2026-07-13-cubase-companion-extended-transport-design.md.
  // Note number is always the command's index in EXTENDED_TRANSPORT_COMMANDS.
  EXTENDED_TRANSPORT_COMMANDS.forEach((cmd, index) => {
    definitions[cmd.id] = {
      name: cmd.label,
      options: [],
      callback: async () => self.midi.sendTrigger(EXTENDED_TRANSPORT_CHANNEL, index),
    }
  })

  self.setActionDefinitions(definitions)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "companion-module-cubase" && npx vitest run test/actions.test.ts`
Expected: PASS, all tests including the 120 new parametrized cases.

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/actions.ts companion-module-cubase/test/actions.test.ts
git commit -m "feat: generate extended transport actions from command table"
```

---

### Task 3: Generate presets and preset sections from the command table

**Files:**
- Modify: `companion-module-cubase/src/presets.ts`

**Interfaces:**
- Consumes: `EXTENDED_TRANSPORT_COMMANDS` (from Task 1), action ids produced in Task 2 (identical to `EXTENDED_TRANSPORT_COMMANDS[i].id`), existing `preset(text, actionId)` helper.
- Produces: 120 new preset ids and 18 new `CompanionPresetSection` entries in `UpdatePresets`'s `structure` output, inserted between the existing `'punch'` and `'status'` sections.

No dedicated test file exists for `presets.ts` today (matching current project convention, confirmed in both prior specs' Testing plans); none is added here. Verification is via TypeScript type-checking.

- [ ] **Step 1: Add the import**

In `companion-module-cubase/src/presets.ts`, the current import block (lines 1-3) reads:

```typescript
import type { CompanionPresetDefinitions, CompanionPresetSection, CompanionSimplePresetDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { ModuleLike } from './actions.js'
```

Add immediately after it:

```typescript
import { EXTENDED_TRANSPORT_COMMANDS } from './midi/extendedTransportCommands.js'
```

- [ ] **Step 2: Add the presets and structure generation**

The current end of the file reads:

```typescript
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

  self.setPresetDefinitions(structure, presets)
}
```

Replace it with:

```typescript
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

  // 120 remaining Transport-category commands, generated from the shared
  // command table rather than hand-written per command -- see
  // docs/superpowers/specs/2026-07-13-cubase-companion-extended-transport-design.md.
  EXTENDED_TRANSPORT_COMMANDS.forEach((cmd) => {
    presets[cmd.id] = preset(cmd.label, cmd.id)
  })

  // One preset section per distinct group, in first-appearance order, so
  // Companion's button picker groups the 120 extended commands the same way
  // the design spec's Command table groups them.
  const extendedTransportGroups: string[] = []
  EXTENDED_TRANSPORT_COMMANDS.forEach((cmd) => {
    if (!extendedTransportGroups.includes(cmd.group)) {
      extendedTransportGroups.push(cmd.group)
    }
  })

  const extendedTransportStructure: CompanionPresetSection[] = extendedTransportGroups.map((group) => ({
    id: 'extended-' + group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: group,
    definitions: EXTENDED_TRANSPORT_COMMANDS.filter((cmd) => cmd.group === group).map((cmd) => cmd.id),
  }))

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
    ...extendedTransportStructure,
    {
      id: 'status',
      name: 'Status',
      definitions: ['cubaseConnected'],
    },
  ]

  self.setPresetDefinitions(structure, presets)
}
```

- [ ] **Step 3: Type-check**

Run: `cd "companion-module-cubase" && npx tsc --noEmit -p tsconfig.build.json`
Expected: no errors.

- [ ] **Step 4: Manually verify the generated section ids are sane**

Run: `cd "companion-module-cubase" && node -e "const cmds = require('./dist/midi/extendedTransportCommands.js'); const groups = [...new Set(cmds.EXTENDED_TRANSPORT_COMMANDS.map(c => c.group))]; console.log(groups.map(g => g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-\$)/g, '')));"` (requires `npm run build` to have been run first so `dist/` exists — if it hasn't, run that first).

Expected output: 18 slugs, each a lowercase-hyphenated, non-empty string with no leading/trailing hyphen and no duplicate values (e.g. `locators`, `cycle-markers`, `punch-extra`, `marker-misc`, `selection-playback`, `loop-locate-selection`, `event-hitpoint-nav`, `transport-extras`, `restart-start-position`, `nudge-cursor`, `nudge-frame-step`, `jog`, `shuttle`, `record-modes`, `midi-retrospective-record`, `tempo-time`, `pre-post-roll-sync`, `setup-misc`).

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/presets.ts
git commit -m "feat: generate extended transport presets and sections from command table"
```

---

### Task 4: Add the generated buttons and bindings to the Cubase script

**Files:**
- Modify: `cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js`

**Interfaces:**
- Consumes: nothing from the TypeScript side (separate runtime, no shared module system — this is an existing, accepted project constraint, not new to this task).
- Produces: no exports (ES5 script) — correctness is checked by `node --check` syntax validation and live verification in Task 5.

**Note:** this task's literal JS array of 120 command strings MUST list them in the exact same order as Task 1's `EXTENDED_TRANSPORT_COMMANDS` TypeScript array (both were generated from the same design-spec table and are already in matching order below — do not reorder either one independently).

- [ ] **Step 1: Add the channel constant and command array**

In `cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js`, the current Punch note-constants block ends with (current lines 62-65):

```javascript
var NOTE_SET_PUNCH_IN = 21
var NOTE_SET_PUNCH_OUT = 22
var NOTE_AUTO_PUNCH_IN = 23
var NOTE_AUTO_PUNCH_OUT = 24
```

Insert immediately after it (before the blank line that precedes `// One device driver for the whole project...`):

```javascript

// Extended Transport -- MIDI channel 14, zero-indexed 13. Covers the
// remaining 120 Transport-category key commands not covered by the phases
// above. Data-driven (single array, one loop below) rather than hand-written
// per command -- see
// docs/superpowers/specs/2026-07-13-cubase-companion-extended-transport-design.md.
// Order must exactly match EXTENDED_TRANSPORT_COMMANDS in
// src/midi/extendedTransportCommands.ts -- array index is the MIDI note number.
var EXTENDED_TRANSPORT_CHANNEL = 13
var EXTENDED_TRANSPORT_COMMANDS = [
  'Set Left Locator',
  'Set Right Locator',
  'To Left Locator',
  'To Right Locator',
  'Exchange Locator Positions',
  'Locators to Selection',
  'Input Left Locator',
  'Input Right Locator',
  'Input Locator Duration',
  'Input Position',
  'Insert Cycle Marker',
  'To Cycle Marker 1',
  'To Cycle Marker 2',
  'To Cycle Marker 3',
  'To Cycle Marker 4',
  'To Cycle Marker 5',
  'To Cycle Marker 6',
  'To Cycle Marker 7',
  'To Cycle Marker 8',
  'To Cycle Marker 9',
  'To Cycle Marker X',
  'Recall Cycle Marker 1',
  'Recall Cycle Marker 2',
  'Recall Cycle Marker 3',
  'Recall Cycle Marker 4',
  'Recall Cycle Marker 5',
  'Recall Cycle Marker 6',
  'Recall Cycle Marker 7',
  'Recall Cycle Marker 8',
  'Recall Cycle Marker 9',
  'Recall Cycle Marker X',
  'Input Punch In Position',
  'Input Punch Out Position',
  'Set Punch Points To Selection',
  'Sync Punch To Cycle',
  'To Punch In Position',
  'To Punch Out Position',
  'Play until Next Marker',
  'To Marker X',
  'Toggle: Cycle follows when locating to Markers',
  'Play Selection Range',
  'Play Selection Solo',
  'Play from Selection End',
  'Play from Selection Start',
  'Play until Selection End',
  'Play until Selection Start',
  'Post-roll from Selection End',
  'Post-roll from Selection Start',
  'Pre-roll to Selection End',
  'Pre-roll to Selection Start',
  'Locate Selection',
  'Locate Selection End',
  'Loop Selection',
  'Loop Selection Solo',
  'Locate Next Event',
  'Locate Previous Event',
  'Locate Next Hitpoint',
  'Locate Previous Hitpoint',
  'Fast Rewind',
  'Fast Forward',
  'Goto End',
  'StartStop',
  'StartStop Preview',
  'Restart',
  'Return to Start Position',
  'Activate Return to Start Position',
  'Nudge Cursor Right',
  'Nudge Cursor Left',
  'Nudge Cursor -5 Seconds',
  'Nudge Cursor +5 Seconds',
  'Nudge Cursor -10 Seconds',
  'Nudge Cursor +10 Seconds',
  'Nudge Cursor -20 Seconds',
  'Nudge Cursor +20 Seconds',
  'Nudge +1 Frame',
  'Nudge -1 Frame',
  'Step Bar',
  'Step Back Bar',
  'Jog Left',
  'Jog Right',
  'Shuttle Play 1x',
  'Shuttle Play 2x',
  'Shuttle Play 4x',
  'Shuttle Play 8x',
  'Shuttle Play 1/2x',
  'Shuttle Play 1/4x',
  'Shuttle Play 1/8x',
  'Shuttle Play Reverse 1x',
  'Shuttle Play Reverse 2x',
  'Shuttle Play Reverse 4x',
  'Shuttle Play Reverse 8x',
  'Shuttle Play Reverse 1/2x',
  'Shuttle Play Reverse 1/4x',
  'Shuttle Play Reverse 1/8x',
  'Audio Record Mode',
  'Global Retrospective Record',
  'Lock Record',
  'MIDI Cycle Record Mode',
  'MIDI Record Auto Quantize',
  'MIDI Record Mode',
  'Re-Record on/off',
  'Start Mode',
  'Start Record at Left Locator',
  'Unlock Record',
  'MIDI Retrospective Record: Empty All Buffers',
  'MIDI Retrospective Record: Insert from Track Input as Cycle Recording',
  'MIDI Retrospective Record: Insert from Track Input as Linear Recording',
  'Input Tempo',
  'Input Time Signature',
  'Precount On',
  'Project Synchronization Setup',
  'Use External Sync',
  'Use Post-roll',
  'Use Pre-/Post-Roll',
  'Use Pre-roll',
  'Edit Mode',
  'Exchange Time Formats',
  'Metronome Setup',
  'Panel',
  'Tempo Track Rehearsal Mode On/Off',
]
```

- [ ] **Step 2: Add the button-generation loop**

The current end of the command-binding block reads (current lines 234-238):

```javascript
page.makeCommandBinding(btnSetMarker9.mSurfaceValue, 'Transport', 'Set Marker 9')
page.makeCommandBinding(btnSetPunchIn.mSurfaceValue, 'Transport', 'Set Punch In Position')
page.makeCommandBinding(btnSetPunchOut.mSurfaceValue, 'Transport', 'Set Punch Out Position')
page.makeCommandBinding(btnAutoPunchIn.mSurfaceValue, 'Transport', 'Auto Punch In')
page.makeCommandBinding(btnAutoPunchOut.mSurfaceValue, 'Transport', 'Auto Punch Out')
```

Insert immediately after it:

```javascript

// Extended Transport buttons -- rows 4-13 (12 columns x 10 rows), generated
// rather than 120 hand-written declarations. See
// docs/superpowers/specs/2026-07-13-cubase-companion-extended-transport-design.md.
var EXTENDED_TRANSPORT_GRID_WIDTH = 12
var EXTENDED_TRANSPORT_START_ROW = 4

for (var i = 0; i < EXTENDED_TRANSPORT_COMMANDS.length; i++) {
  var col = i % EXTENDED_TRANSPORT_GRID_WIDTH
  var row = EXTENDED_TRANSPORT_START_ROW + Math.floor(i / EXTENDED_TRANSPORT_GRID_WIDTH)
  var btn = makeButton(col, row)
  btn.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(EXTENDED_TRANSPORT_CHANNEL, i)
  page.makeCommandBinding(btn.mSurfaceValue, 'Transport', EXTENDED_TRANSPORT_COMMANDS[i])
}
```

This loop runs after `var page = deviceDriver.mMapping.makePage('Main')` (needs `page`) and after `midiInput` and `makeButton` are already defined earlier in the file — both are true at this insertion point, since it comes after all the existing hand-written command bindings which already depend on the same three.

- [ ] **Step 3: Verify syntax**

Run: `node --check "cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js"`
Expected: no output, exit code 0.

- [ ] **Step 4: Verify array lengths match**

Run: `node -e "var fs=require('fs'); var src=fs.readFileSync('cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js','utf8'); var m=src.match(/var EXTENDED_TRANSPORT_COMMANDS = \[([\s\S]*?)\]/); var count=(m[1].match(/'/g)||[]).length/2; console.log('entries:', count);"`
Expected: `entries: 120`.

- [ ] **Step 5: Commit**

```bash
git add "cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js"
git commit -m "feat: add extended transport button generation loop to Cubase script"
```

---

### Task 5: Build, deploy, and verify live

**Files:** none (deployment/verification only — no source changes)

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `cd "companion-module-cubase" && npm test`
Expected: all tests PASS (92 existing + 5 new from Task 1 + 121 new from Task 2 [1 updated registration test + 120 parametrized cases] = 218 or more, depending on how Vitest's reporter counts `it.each` — the key check is 0 failures).

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
- Cubase needs a MIDI Remote rescan (or restart) to pick up the new buttons/bindings.
- The Companion connection likely needs deleting and re-adding if it doesn't pick up the new actions/presets automatically.
- Given 120 buttons, exhaustive one-by-one verification isn't practical — ask the project owner to spot-check a representative sample: at least one button from each of the 18 groups, plus the first (`Set Left Locator`, note 0) and last (`Tempo Track Rehearsal Mode On/Off`, note 119) entries and each row boundary (notes 11/12, 23/24, ... i.e. every 12th note) to catch any grid-position or note-number miscalculation. No feedback to check, since none exists for this action set (per design).

Do not mark this task complete until the project owner confirms live verification passed.
