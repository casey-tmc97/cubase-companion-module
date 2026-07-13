# Cubanion — Punch Points & Named Marker Assignment Design

**Date:** 2026-07-13
**Status:** Design approved, not yet implemented.

## Goal

Extend the Markers control surface with two feature groups that were explicitly out of scope for the original [Markers (Phase 3) design](2026-07-09-cubase-companion-markers-design.md):

- **Named marker assignment** — assign/overwrite marker slots 1-9 at the current playhead position (`Set Marker N`), the counterpart to the already-shipped `To Marker N` (jump to slot N).
- **Punch points** — set the punch-in/punch-out recording points at the current playhead position, and toggle Cubase's automatic punch-in/punch-out recording on and off.

## Background

The original Markers spec explicitly deferred these: "punch in/out points, marker renaming, and the `Set Marker N` family... could reuse this same pattern in a later spec if wanted." Transport and Markers-navigation (Add/Next/Previous/To Marker 1-9) are both verified live as of this session. This spec covers the next increment.

"Named marker assignment" here means `Set Marker 1`..`Set Marker 9` — assigning/overwriting a marker slot at the current position. It does **not** mean typing a text name onto a marker: Cubase has no MIDI Remote-triggerable command for that (it requires the Cubase UI's own text entry), so free-text marker naming is not part of this spec.

Exact command names were pulled from this Cubase install's own `Key Commands.xml` (`%AppData%\Steinberg\Cubase 15_64\Key Commands.xml`), not guessed — same approach used for every prior phase.

## Scope

**13 new one-shot trigger actions**, all Companion→Cubase only, **no feedback** — consistent with every existing Marker action and Return to Zero. None of these have a persistent on/off host-value Cubase exposes to MIDI Remote (`mTransport.mValue` has no punch or marker-slot properties), so — same as Return to Zero — all 13 are wired via `makeCommandBinding`, not a value binding. This includes the two "Auto Punch" toggles: even though they toggle a real on/off state inside Cubase, MIDI Remote has no host value to bind for that state, so there is nothing for `mOnProcessValueChange` to report.

| Function | Cubase command (category: Transport) |
|---|---|
| Set Marker 1 .. Set Marker 9 | `Set Marker 1` .. `Set Marker 9` |
| Set Punch In Position | `Set Punch In Position` |
| Set Punch Out Position | `Set Punch Out Position` |
| Auto Punch In | `Auto Punch In` |
| Auto Punch Out | `Auto Punch Out` |

Explicitly out of scope (unchanged from the original Markers spec): cycle markers (`Insert Cycle Marker`, `To/Recall Cycle Marker N`), free-text marker renaming, `To Punch In/Out Position` (locating to the punch points, as opposed to setting them).

## Architecture

No new port, no new connection, no new channel. All 13 actions extend the existing `MarkerNote` enum on `MARKERS_CHANNEL` (14, zero-indexed) already used by Add/Next/Previous/To Marker 1-9 — these are all part of the same "Markers & Locators" feature area (per [ROADMAP.md](../../../ROADMAP.md) Phase 3), so a new dedicated channel isn't warranted the way it was for splitting Markers from Transport in the first place ([ADR-006](../../adr/ADR-006-channel-per-phase-script.md)). The one consolidated Cubase script ([ADR-007](../../adr/ADR-007-single-consolidated-cubase-script.md)) gains 13 more buttons.

## MIDI mapping

New notes on `MARKERS_CHANNEL` (14), continuing after the existing 0-11:

| Function | Note # | Cubase command |
|---|---|---|
| Set Marker 1 | 12 | `Set Marker 1` |
| Set Marker 2 | 13 | `Set Marker 2` |
| Set Marker 3 | 14 | `Set Marker 3` |
| Set Marker 4 | 15 | `Set Marker 4` |
| Set Marker 5 | 16 | `Set Marker 5` |
| Set Marker 6 | 17 | `Set Marker 6` |
| Set Marker 7 | 18 | `Set Marker 7` |
| Set Marker 8 | 19 | `Set Marker 8` |
| Set Marker 9 | 20 | `Set Marker 9` |
| Set Punch In Position | 21 | `Set Punch In Position` |
| Set Punch Out Position | 22 | `Set Punch Out Position` |
| Auto Punch In | 23 | `Auto Punch In` |
| Auto Punch Out | 24 | `Auto Punch Out` |

All one-way, Companion→Cubase, momentary trigger (Note On, then Note Off `TRIGGER_HOLD_MS` later) — same shape as every existing Marker action.

## Companion module changes (`companion-module-cubase`)

- **`src/midi/protocol.ts`**: extend the existing `MarkerNote` enum with `SetMarker1`..`SetMarker9 = 12..20`, `SetPunchIn = 21`, `SetPunchOut = 22`, `AutoPunchIn = 23`, `AutoPunchOut = 24`. No changes to `MARKERS_CHANNEL`, `TransportNote`, or any encode/decode function — this is a pure enum extension, the same shape as the Next/Previous/To Marker 1-9 restoration.
- **`src/actions.ts`**: 13 new actions (`setMarker1`..`setMarker9`, `setPunchIn`, `setPunchOut`, `autoPunchIn`, `autoPunchOut`), each `self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.X)` — identical shape to `addMarker`/`nextMarker`/etc.
- **`src/presets.ts`**: 13 new presets using the existing no-feedback `preset()` helper. `setMarker1`..`setMarker9` join the existing `"Markers"` preset section (`MARKER_PRESET_IDS`). `setPunchIn`, `setPunchOut`, `autoPunchIn`, `autoPunchOut` form a **new `"Punch"` preset section** (`PUNCH_PRESET_IDS`) — a new `CompanionPresetSection` entry in `UpdatePresets`'s `structure` array, positioned after `"Markers"` and before `"Status"`. This is a UI-only grouping choice (keeps Companion's button picker organized by function); the underlying MIDI channel is unchanged.
- **Config, feedbacks, connection.ts**: unchanged. No new config fields, no new feedbacks, no channel-parameter changes needed (`sendTrigger` is already channel-aware from the original Markers work).

## Cubase MIDI Remote script (`Cubanion_Transport.js`)

Same file, same device driver, same pattern as the existing Marker buttons — 13 new buttons on new grid rows so they don't collide with the existing row-1 Marker buttons (which run `x=0..11`):

- Row 2 (`y=2`): `btnSetMarker1`..`btnSetMarker9` at `x=0..8`.
- Row 3 (`y=3`): `btnSetPunchIn`, `btnSetPunchOut`, `btnAutoPunchIn`, `btnAutoPunchOut` at `x=0..3`.

Each button: `mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_X)` (input-only, no `.setOutputPort()`) and `page.makeCommandBinding(btnX.mSurfaceValue, 'Transport', '<exact command name>')` from the table above. No feedback binding, no `mOnIdle`/`mOnActivate` changes — nothing new to keep alive or sync.

## Testing plan

- **`protocol.ts`**: no dedicated test needed beyond what already exists — `protocol.test.ts`'s existing structure/exports assertions will need updating if it enumerates `MarkerNote` keys exhaustively (check current test content before implementing; extend if so).
- **`actions.ts`**: one test per new action (13 total), confirming each sends `MARKERS_CHANNEL` + the right `MarkerNote` value — same pattern as the existing `addMarker`/`nextMarker`/`toMarker1`..`9` tests. The registration-completeness test (`Object.keys(definitions).sort()`) gets the 13 new action ids added.
- **`presets.ts`**: no dedicated test file exists for it today (matching current project convention); none added here either.
- **Cubase script**: not unit-testable (ES5, no test harness — same documented limitation as every prior phase). Verified live against real Cubase 15: build, deploy both the Companion module and the updated Cubase script, confirm the module reloads, press each of the 13 buttons in Companion, confirm Cubase responds (marker slots reassign at the playhead; punch points move; Auto Punch In/Out toggles visibly in Cubase's transport panel). No feedback to verify since none exists for this action set.

## Out of scope (follow-on work)

- Cycle markers (`Insert Cycle Marker`, `To/Recall Cycle Marker N`) — same pattern, could be a later spec.
- Free-text marker renaming — not achievable via MIDI Remote key-command triggers; would require a different mechanism entirely (e.g. Cubase's Project Logical Editor / macro scripting, or manual renaming in Cubase's own Marker window). Out of scope unless the project owner wants to explore that separately.
- `To Punch In Position` / `To Punch Out Position` (locating to the punch points, as opposed to setting them) — deliberately excluded per the "Set + Toggle" scope decision; can be added later using the same pattern if wanted.

## Decision log

- **Set Marker 1-9 means "assign at current position," not "type a text name"** — confirmed with the project owner; Cubase's MIDI Remote API has no text-entry-capable command for marker renaming.
- **Punch scope is Set + Toggle (4 actions), not just Set (2) or Set+Toggle+Locate (6)** — explicit project owner choice among the three options presented.
- **All 13 new actions share `MARKERS_CHANNEL`, no new dedicated channel** — they're part of the same Markers & Locators feature area as the already-shipped marker-navigation actions; a new channel per this spec's narrower feature slice wasn't judged to add clarity the way the original Transport/Markers split did.
- **`"Punch"` gets its own Companion preset section, separate from `"Markers"`**, despite sharing a MIDI channel — a UI organization choice for Companion's button picker, independent of the wire protocol.
- **No feedback for any of the 13 actions** — none has a Cubase host-value MIDI Remote can bind to for state; same constraint and same no-feedback precedent as Return to Zero and every existing Marker action.
