# Cubanion — Extended Transport Commands Design

**Date:** 2026-07-13
**Status:** Design approved, not yet implemented.

## Goal

Add Companion buttons for every remaining command in Cubase's `Transport` key-command category that isn't already covered by the shipped Transport/Markers/Punch feature sets — 120 commands, pulled directly from this Cubase install's own `%AppData%\Steinberg\Cubase 15_64\Key Commands.xml` (the same authoritative source used for every prior phase), not guessed and not scraped from the public docs page that prompted this (that page turned out to only show illustrative examples, not an exhaustive list — the real list lives in Cubase's own key-command data).

## Background

The `Transport` category in `Key Commands.xml` has 153 total command entries. 33 are already implemented across the shipped Transport, Markers, and Punch feature sets (Play/Stop/Record, Return to Zero, Cycle, Rewind/Forward, Metronome On, Insert/Next/Previous/To Marker 1-9, Set Marker 1-9, Auto Punch In/Out, Set Punch In/Out Position). This spec covers the remaining 120.

## Scope decision: data-driven, not hand-written-per-command

Every prior phase (Transport, Markers, Punch) hand-wrote one block per command in each of `protocol.ts`, `actions.ts`, `presets.ts`, and the Cubase script. That pattern doesn't scale cleanly to 120 commands — four files × ~120 near-identical blocks each is a lot of surface area for a single mistyped Cubase command string (which fails silently at runtime; Cubase does not validate command names at script load time) to slip through unnoticed.

Instead, this batch is **data-driven**: one array is the single source of truth for the 120 commands' ids, display labels, and exact Cubase command strings. `actions.ts` and `presets.ts` both iterate it rather than repeating a block per command. The Cubase script (which cannot `import` the TypeScript array — it's a separate ES5 runtime with no shared module system between the two runtimes, an existing project constraint, not new to this spec) gets its own literal array of the same 120 entries and a loop that builds all 120 buttons/bindings, rather than 120 individually copy-pasted `var btnX = makeButton(...)` blocks.

This is a deliberate architecture change from the prior three phases, scoped to this batch only — it doesn't require touching the existing hand-written Transport/Markers/Punch code, which stays as-is.

## Scope

All 120 commands, one-shot triggers (Note On + Note Off), **no feedback** — none of these have a Cubase host-value MIDI Remote can bind to for state (same constraint as every prior no-feedback action in this project).

## Architecture

One new dedicated channel, `EXTENDED_TRANSPORT_CHANNEL = 13` (zero-indexed — distinct from `TRANSPORT_CHANNEL` = 15 and `MARKERS_CHANNEL` = 14), carrying all 120 commands as MIDI notes 0-119 (comfortably under the 128-note-per-channel ceiling). No new Companion connection, no new virtual MIDI port — same shared loopMIDI port pair and single `MidiConnection` used by every existing feature.

## Companion module changes (`companion-module-cubase`)

### New file: `src/midi/extendedTransportCommands.ts`

Exports:

```typescript
export const EXTENDED_TRANSPORT_CHANNEL = 13 // MIDI channel 14, zero-indexed

export interface ExtendedTransportCommand {
  id: string
  label: string
  command: string
  group: string
}

export const EXTENDED_TRANSPORT_COMMANDS: ExtendedTransportCommand[] = [
  /* full 120-entry table, see "Command table" below -- note number is the array index */
]
```

The array's index *is* the MIDI note number on `EXTENDED_TRANSPORT_CHANNEL` — no separate enum. This is a deliberate simplification versus the `TransportNote`/`MarkerNote` enum pattern: with 120 sequential, never-reordered entries, an index-based note number is exactly as unambiguous as an enum member and avoids a 120-line enum that would just restate the array's order.

### `src/actions.ts`

After the existing hand-written action block, add a generated block built by iterating `EXTENDED_TRANSPORT_COMMANDS`:

```typescript
for (const cmd of EXTENDED_TRANSPORT_COMMANDS) {
  definitions[cmd.id] = {
    name: cmd.label,
    options: [],
    callback: async () => self.midi.sendTrigger(EXTENDED_TRANSPORT_CHANNEL, EXTENDED_TRANSPORT_COMMANDS.indexOf(cmd)),
  }
}
```

(Exact implementation detail -- e.g. whether to use `indexOf` or a plain `for` loop with an index variable -- is left to the implementation plan; the requirement is that the note number sent always equals the command's index in `EXTENDED_TRANSPORT_COMMANDS`.)

### `src/presets.ts`

One preset per command, generated the same way, using the existing no-feedback `preset()` helper. Presets are grouped into Companion preset sections by each command's `group` field (18 sections — see Command table below for the full group list and membership), inserted after the existing `"punch"` section and before `"status"`.

### `src/midi/connection.ts`, config, feedbacks

Unchanged — `sendTrigger` is already channel-aware; no new feedback, no new config fields.

## Cubase MIDI Remote script (`Cubanion_Transport.js`)

New literal array (ES5, in the script itself, no import):

```javascript
var EXTENDED_TRANSPORT_CHANNEL = 13
var EXTENDED_TRANSPORT_COMMANDS = [
  // 120 literal strings, one per command, in the exact same order as
  // extendedTransportCommands.ts's EXTENDED_TRANSPORT_COMMANDS -- array
  // index is the MIDI note number, must stay in lockstep with the
  // TypeScript array. See the Command table below for the full list.
  'Set Left Locator',
  'Set Right Locator',
  // ... (118 more)
]
```

New button-generation loop, replacing what would otherwise be 120 hand-written `var btnX = makeButton(...)` blocks:

```javascript
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

This must run after `var page = deviceDriver.mMapping.makePage('Main')` (needs `page` and `makeButton` already defined) and after `midiInput` is assigned. 120 commands at 12 columns = 10 rows, occupying grid rows 4-13 (rows 0-3 are already used by Transport/Markers/Set-Marker/Punch).

## Command table

120 commands across 18 groups. `id` (used in `actions.ts`/`presets.ts`), `label` (Companion action/button display name), `command` (exact Cubase key-command string, category `Transport`), `group` (Companion preset section). Note number = row's position in this table, 0-indexed, read top to bottom (row 1 below = note 0, row 2 = note 1, ... row 120 = note 119). **This table is the single source of truth for both the TypeScript array and the Cubase script array — both must list commands in this exact order.**

| # | id | label | command | group |
|---|---|---|---|---|
| 0 | setLeftLocator | Set Left Locator | Set Left Locator | Locators |
| 1 | setRightLocator | Set Right Locator | Set Right Locator | Locators |
| 2 | toLeftLocator | To Left Locator | To Left Locator | Locators |
| 3 | toRightLocator | To Right Locator | To Right Locator | Locators |
| 4 | exchangeLocatorPositions | Exchange Locator Positions | Exchange Locator Positions | Locators |
| 5 | locatorsToSelection | Locators to Selection | Locators to Selection | Locators |
| 6 | inputLeftLocator | Input Left Locator | Input Left Locator | Locators |
| 7 | inputRightLocator | Input Right Locator | Input Right Locator | Locators |
| 8 | inputLocatorDuration | Input Locator Duration | Input Locator Duration | Locators |
| 9 | inputPosition | Input Position | Input Position | Locators |
| 10 | insertCycleMarker | Insert Cycle Marker | Insert Cycle Marker | Cycle Markers |
| 11 | toCycleMarker1 | To Cycle Marker 1 | To Cycle Marker 1 | Cycle Markers |
| 12 | toCycleMarker2 | To Cycle Marker 2 | To Cycle Marker 2 | Cycle Markers |
| 13 | toCycleMarker3 | To Cycle Marker 3 | To Cycle Marker 3 | Cycle Markers |
| 14 | toCycleMarker4 | To Cycle Marker 4 | To Cycle Marker 4 | Cycle Markers |
| 15 | toCycleMarker5 | To Cycle Marker 5 | To Cycle Marker 5 | Cycle Markers |
| 16 | toCycleMarker6 | To Cycle Marker 6 | To Cycle Marker 6 | Cycle Markers |
| 17 | toCycleMarker7 | To Cycle Marker 7 | To Cycle Marker 7 | Cycle Markers |
| 18 | toCycleMarker8 | To Cycle Marker 8 | To Cycle Marker 8 | Cycle Markers |
| 19 | toCycleMarker9 | To Cycle Marker 9 | To Cycle Marker 9 | Cycle Markers |
| 20 | toCycleMarkerX | To Cycle Marker X | To Cycle Marker X | Cycle Markers |
| 21 | recallCycleMarker1 | Recall Cycle Marker 1 | Recall Cycle Marker 1 | Cycle Markers |
| 22 | recallCycleMarker2 | Recall Cycle Marker 2 | Recall Cycle Marker 2 | Cycle Markers |
| 23 | recallCycleMarker3 | Recall Cycle Marker 3 | Recall Cycle Marker 3 | Cycle Markers |
| 24 | recallCycleMarker4 | Recall Cycle Marker 4 | Recall Cycle Marker 4 | Cycle Markers |
| 25 | recallCycleMarker5 | Recall Cycle Marker 5 | Recall Cycle Marker 5 | Cycle Markers |
| 26 | recallCycleMarker6 | Recall Cycle Marker 6 | Recall Cycle Marker 6 | Cycle Markers |
| 27 | recallCycleMarker7 | Recall Cycle Marker 7 | Recall Cycle Marker 7 | Cycle Markers |
| 28 | recallCycleMarker8 | Recall Cycle Marker 8 | Recall Cycle Marker 8 | Cycle Markers |
| 29 | recallCycleMarker9 | Recall Cycle Marker 9 | Recall Cycle Marker 9 | Cycle Markers |
| 30 | recallCycleMarkerX | Recall Cycle Marker X | Recall Cycle Marker X | Cycle Markers |
| 31 | inputPunchInPosition | Input Punch In Position | Input Punch In Position | Punch (Extra) |
| 32 | inputPunchOutPosition | Input Punch Out Position | Input Punch Out Position | Punch (Extra) |
| 33 | setPunchPointsToSelection | Set Punch Points To Selection | Set Punch Points To Selection | Punch (Extra) |
| 34 | syncPunchToCycle | Sync Punch To Cycle | Sync Punch To Cycle | Punch (Extra) |
| 35 | toPunchInPosition | To Punch In Position | To Punch In Position | Punch (Extra) |
| 36 | toPunchOutPosition | To Punch Out Position | To Punch Out Position | Punch (Extra) |
| 37 | playUntilNextMarker | Play until Next Marker | Play until Next Marker | Marker Misc |
| 38 | toMarkerX | To Marker X | To Marker X | Marker Misc |
| 39 | toggleCycleFollowsMarkers | Toggle Cycle Follows Markers | Toggle: Cycle follows when locating to Markers | Marker Misc |
| 40 | playSelectionRange | Play Selection Range | Play Selection Range | Selection Playback |
| 41 | playSelectionSolo | Play Selection Solo | Play Selection Solo | Selection Playback |
| 42 | playFromSelectionEnd | Play from Selection End | Play from Selection End | Selection Playback |
| 43 | playFromSelectionStart | Play from Selection Start | Play from Selection Start | Selection Playback |
| 44 | playUntilSelectionEnd | Play until Selection End | Play until Selection End | Selection Playback |
| 45 | playUntilSelectionStart | Play until Selection Start | Play until Selection Start | Selection Playback |
| 46 | postRollFromSelectionEnd | Post-roll from Selection End | Post-roll from Selection End | Selection Playback |
| 47 | postRollFromSelectionStart | Post-roll from Selection Start | Post-roll from Selection Start | Selection Playback |
| 48 | preRollToSelectionEnd | Pre-roll to Selection End | Pre-roll to Selection End | Selection Playback |
| 49 | preRollToSelectionStart | Pre-roll to Selection Start | Pre-roll to Selection Start | Selection Playback |
| 50 | locateSelection | Locate Selection | Locate Selection | Loop/Locate Selection |
| 51 | locateSelectionEnd | Locate Selection End | Locate Selection End | Loop/Locate Selection |
| 52 | loopSelection | Loop Selection | Loop Selection | Loop/Locate Selection |
| 53 | loopSelectionSolo | Loop Selection Solo | Loop Selection Solo | Loop/Locate Selection |
| 54 | locateNextEvent | Locate Next Event | Locate Next Event | Event/Hitpoint Nav |
| 55 | locatePreviousEvent | Locate Previous Event | Locate Previous Event | Event/Hitpoint Nav |
| 56 | locateNextHitpoint | Locate Next Hitpoint | Locate Next Hitpoint | Event/Hitpoint Nav |
| 57 | locatePreviousHitpoint | Locate Previous Hitpoint | Locate Previous Hitpoint | Event/Hitpoint Nav |
| 58 | fastRewind | Fast Rewind | Fast Rewind | Transport Extras |
| 59 | fastForward | Fast Forward | Fast Forward | Transport Extras |
| 60 | gotoEnd | Goto End | Goto End | Transport Extras |
| 61 | startStop | Start/Stop | StartStop | Transport Extras |
| 62 | startStopPreview | Start/Stop Preview | StartStop Preview | Transport Extras |
| 63 | restart | Restart | Restart | Restart/Start Position |
| 64 | returnToStartPosition | Return to Start Position | Return to Start Position | Restart/Start Position |
| 65 | activateReturnToStartPosition | Activate Return to Start Position | Activate Return to Start Position | Restart/Start Position |
| 66 | nudgeCursorRight | Nudge Cursor Right | Nudge Cursor Right | Nudge Cursor |
| 67 | nudgeCursorLeft | Nudge Cursor Left | Nudge Cursor Left | Nudge Cursor |
| 68 | nudgeCursorMinus5Seconds | Nudge Cursor -5s | Nudge Cursor -5 Seconds | Nudge Cursor |
| 69 | nudgeCursorPlus5Seconds | Nudge Cursor +5s | Nudge Cursor +5 Seconds | Nudge Cursor |
| 70 | nudgeCursorMinus10Seconds | Nudge Cursor -10s | Nudge Cursor -10 Seconds | Nudge Cursor |
| 71 | nudgeCursorPlus10Seconds | Nudge Cursor +10s | Nudge Cursor +10 Seconds | Nudge Cursor |
| 72 | nudgeCursorMinus20Seconds | Nudge Cursor -20s | Nudge Cursor -20 Seconds | Nudge Cursor |
| 73 | nudgeCursorPlus20Seconds | Nudge Cursor +20s | Nudge Cursor +20 Seconds | Nudge Cursor |
| 74 | nudgePlus1Frame | Nudge +1 Frame | Nudge +1 Frame | Nudge Frame/Step |
| 75 | nudgeMinus1Frame | Nudge -1 Frame | Nudge -1 Frame | Nudge Frame/Step |
| 76 | stepBar | Step Bar | Step Bar | Nudge Frame/Step |
| 77 | stepBackBar | Step Back Bar | Step Back Bar | Nudge Frame/Step |
| 78 | jogLeft | Jog Left | Jog Left | Jog |
| 79 | jogRight | Jog Right | Jog Right | Jog |
| 80 | shuttlePlay1x | Shuttle Play 1x | Shuttle Play 1x | Shuttle |
| 81 | shuttlePlay2x | Shuttle Play 2x | Shuttle Play 2x | Shuttle |
| 82 | shuttlePlay4x | Shuttle Play 4x | Shuttle Play 4x | Shuttle |
| 83 | shuttlePlay8x | Shuttle Play 8x | Shuttle Play 8x | Shuttle |
| 84 | shuttlePlayHalfX | Shuttle Play 1/2x | Shuttle Play 1/2x | Shuttle |
| 85 | shuttlePlayQuarterX | Shuttle Play 1/4x | Shuttle Play 1/4x | Shuttle |
| 86 | shuttlePlayEighthX | Shuttle Play 1/8x | Shuttle Play 1/8x | Shuttle |
| 87 | shuttlePlayReverse1x | Shuttle Play Reverse 1x | Shuttle Play Reverse 1x | Shuttle |
| 88 | shuttlePlayReverse2x | Shuttle Play Reverse 2x | Shuttle Play Reverse 2x | Shuttle |
| 89 | shuttlePlayReverse4x | Shuttle Play Reverse 4x | Shuttle Play Reverse 4x | Shuttle |
| 90 | shuttlePlayReverse8x | Shuttle Play Reverse 8x | Shuttle Play Reverse 8x | Shuttle |
| 91 | shuttlePlayReverseHalfX | Shuttle Play Reverse 1/2x | Shuttle Play Reverse 1/2x | Shuttle |
| 92 | shuttlePlayReverseQuarterX | Shuttle Play Reverse 1/4x | Shuttle Play Reverse 1/4x | Shuttle |
| 93 | shuttlePlayReverseEighthX | Shuttle Play Reverse 1/8x | Shuttle Play Reverse 1/8x | Shuttle |
| 94 | audioRecordMode | Audio Record Mode | Audio Record Mode | Record Modes |
| 95 | globalRetrospectiveRecord | Global Retrospective Record | Global Retrospective Record | Record Modes |
| 96 | lockRecord | Lock Record | Lock Record | Record Modes |
| 97 | midiCycleRecordMode | MIDI Cycle Record Mode | MIDI Cycle Record Mode | Record Modes |
| 98 | midiRecordAutoQuantize | MIDI Record Auto Quantize | MIDI Record Auto Quantize | Record Modes |
| 99 | midiRecordMode | MIDI Record Mode | MIDI Record Mode | Record Modes |
| 100 | reRecordOnOff | Re-Record On/Off | Re-Record on/off | Record Modes |
| 101 | startMode | Start Mode | Start Mode | Record Modes |
| 102 | startRecordAtLeftLocator | Start Record at Left Locator | Start Record at Left Locator | Record Modes |
| 103 | unlockRecord | Unlock Record | Unlock Record | Record Modes |
| 104 | midiRetrospectiveRecordEmptyAllBuffers | MIDI Retro Record: Empty Buffers | MIDI Retrospective Record: Empty All Buffers | MIDI Retrospective Record |
| 105 | midiRetrospectiveRecordInsertCycle | MIDI Retro Record: Insert Cycle | MIDI Retrospective Record: Insert from Track Input as Cycle Recording | MIDI Retrospective Record |
| 106 | midiRetrospectiveRecordInsertLinear | MIDI Retro Record: Insert Linear | MIDI Retrospective Record: Insert from Track Input as Linear Recording | MIDI Retrospective Record |
| 107 | inputTempo | Input Tempo | Input Tempo | Tempo/Time |
| 108 | inputTimeSignature | Input Time Signature | Input Time Signature | Tempo/Time |
| 109 | precountOn | Precount On | Precount On | Pre/Post-Roll & Sync |
| 110 | projectSynchronizationSetup | Project Sync Setup | Project Synchronization Setup | Pre/Post-Roll & Sync |
| 111 | useExternalSync | Use External Sync | Use External Sync | Pre/Post-Roll & Sync |
| 112 | usePostRoll | Use Post-roll | Use Post-roll | Pre/Post-Roll & Sync |
| 113 | usePrePostRoll | Use Pre-/Post-Roll | Use Pre-/Post-Roll | Pre/Post-Roll & Sync |
| 114 | usePreRoll | Use Pre-roll | Use Pre-roll | Pre/Post-Roll & Sync |
| 115 | editMode | Edit Mode | Edit Mode | Setup/Misc |
| 116 | exchangeTimeFormats | Exchange Time Formats | Exchange Time Formats | Setup/Misc |
| 117 | metronomeSetup | Metronome Setup | Metronome Setup | Setup/Misc |
| 118 | panel | Panel | Panel | Setup/Misc |
| 119 | tempoTrackRehearsalModeOnOff | Tempo Track Rehearsal Mode | Tempo Track Rehearsal Mode On/Off | Setup/Misc |

## Testing plan

- **`extendedTransportCommands.ts`**: a test asserting `EXTENDED_TRANSPORT_COMMANDS.length === 120`, that every `id` is unique, and that the array's `command` values exactly match the table above (spot-checked programmatically, e.g. asserting specific indices against specific expected strings, not manually re-typing all 120 as a duplicate literal in the test).
- **`actions.ts`**: a single parametrized test (`it.each(EXTENDED_TRANSPORT_COMMANDS)`) iterating the shared array itself (imported from the same source file, not re-typed) confirming `definitions[cmd.id].callback()` sends `sendTrigger(EXTENDED_TRANSPORT_CHANNEL, index)` for every entry — one test definition covers all 120 cases. The registration-completeness test's expected id array is built by concatenating the existing hand-written list with `EXTENDED_TRANSPORT_COMMANDS.map(c => c.id)`, not by manually retyping 120 ids.
- **`presets.ts`**: no dedicated test file, matching existing project convention.
- **Cubase script**: not unit-testable (documented limitation, same as every prior phase). Verified live: build, deploy, rescan/reconnect, spot-check a representative sample across groups (not necessarily all 120 individually) plus every button whose grid position could plausibly be miscalculated (first, last, and each row boundary).

## Out of scope

- The 33 already-implemented Transport-category commands (unchanged).
- Any command outside the `Transport` category (Edit, Mixer, Zoom, etc.) — this spec is scoped to finishing out `Transport` specifically, per the original request.

## Decision log

- **Data-driven architecture for this batch only, not a retroactive rewrite of Transport/Markers/Punch** — the existing hand-written code works, is already live-verified, and rewriting it carries risk for no benefit; the data-driven pattern is adopted only where its 10x scale advantage actually pays for the added indirection.
- **New dedicated channel (`EXTENDED_TRANSPORT_CHANNEL` = 13), not reusing `TRANSPORT_CHANNEL`'s free note range** — `TRANSPORT_CHANNEL` only has ~114 free note numbers before the note-space gets tight against MIDI's 128-note ceiling once you count in any future Transport-adjacent work; a dedicated channel keeps this batch self-contained and leaves both existing channels' remaining headroom untouched.
- **Array index as note number, no enum** — with 120 sequential, order-significant entries, a hand-maintained enum would just restate the array's order redundantly; the array itself is the single source of truth for both content and position.
- **Full 120 commands, not a curated subset** — explicit project owner choice ("all commands") after being shown the grouped breakdown of what remained.
