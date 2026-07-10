# Cubase Companion Module — Markers (Phase 3) Design

**Date:** 2026-07-09
**Status:** Companion-side implementation complete (Tasks 1-4, all reviewed clean) and unaffected by the amendment below. Cubase-side script (Task 5) is being merged into one consolidated script per [ADR-007](../../adr/ADR-007-single-consolidated-cubase-script.md) — see the 2026-07-09 amendment. Live verification (Task 8) pending that merge.

## Goal

Add marker navigation to the Cubase Companion control surface: insert a marker at the current position, jump to the next/previous marker, and jump directly to any of Cubase's nine numbered markers — the start of Phase 3 ("Markers & locators") from [ROADMAP.md](../../../ROADMAP.md).

## Background

Phase 1 (Transport) is now verified end-to-end against real Cubase 15. Getting there surfaced lessons this design carries forward — see [ADR-004](../../adr/ADR-004-fixed-midi-note-contract.md)'s 2026-07-09 amendment for the full writeup:

- Cubase's `.setTypeToggle()` value bindings can misbehave badly if a script's own feedback output shares a note with its own input binding, on the same shared loopMIDI port — the script re-ingests its own feedback as a fresh button press. Markers sidesteps this entirely by having no feedback at all (see Scope).
- `sendTrigger`'s Note On + Note Off pair needs a real gap (`TRIGGER_HOLD_MS`, currently 40ms) rather than firing back-to-back, to look like a genuine press-hold-release to Cubase's binding logic.
- Cubase's own factory MIDI Remote scripts and API reference (`midiremote_factory_scripts/.api/v1/midiremote_api_v1.d.ts` and `README_v1.html`, bundled with the Cubase install) are authoritative and were used directly during Phase 1 debugging in preference to guessing at API behavior. Same approach here — the exact Cubase key command names below were pulled from `Presets/KeyCommands/*.xml` in the Cubase install, not guessed.

## Scope

**This spec covers marker insertion and navigation only** — 12 actions:

- Add Marker (Cubase command: `Insert Marker`)
- Next Marker / Previous Marker (`Locate Next Marker` / `Locate Previous Marker`)
- To Marker 1 through To Marker 9 (`To Marker 1` .. `To Marker 9`)

All twelve are one-shot triggers with **no Companion-side feedback** — unlike Play/Record/Cycle/Click, none of these have a persistent on/off state to reflect (confirmed with the project owner during design). This is the same pattern already used for Return to Zero in Phase 1.

Explicitly out of scope for this spec: cycle markers (`Insert Cycle Marker`, `To Cycle Marker N`), punch in/out points, marker renaming, and the `Set Marker N` family (which *assigns* a marker at a specific slot, a different operation from jumping to one). These can extend the same pattern in a later spec if wanted.

## Architecture

No new Companion connection, no new virtual MIDI port, no new heartbeat. The existing `companion-module-cubase` Companion instance and its single `MidiConnection` (already open to the shared loopMIDI port) gain 12 new actions. On the Cubase side, a **second, independent MIDI Remote device-driver script** is added — `CubaseCompanion_Markers.js` — bound to the *same* physical MIDI port pair as the existing Transport script, running alongside it as its own controller entry in Cubase's Studio Setup.

```
Companion (companion-module-cubase, one MidiConnection)
        |
        v
   [shared loopMIDI/network port pair]
        |
        +--> Cubase: CubaseCompanion_Transport.js (channel 15, notes 0-13)
        +--> Cubase: CubaseCompanion_Markers.js   (channel 14, notes 0-11)
```

Each phase gets its own script file and, per this spec, **its own dedicated MIDI channel** rather than continuing to share Transport's channel 15. This is a small extra step now that keeps every phase's protocol self-contained — a later phase's script can be read and reasoned about without cross-referencing what earlier phases already claimed, and there's no bookkeeping risk of two phase scripts ever claiming the same channel+note pair. Connectivity status ("Cubase Connected") continues to come entirely from Transport's existing heartbeat; Markers doesn't need its own, since it shares Transport's underlying connection.

## MIDI mapping

New dedicated channel, **15 (zero-indexed 14)**, separate from Transport's channel 16 (zero-indexed 15):

| Function | Note # | Cubase command (category: Transport) |
|---|---|---|
| Add Marker | 0 | `Insert Marker` |
| Next Marker | 1 | `Locate Next Marker` |
| Previous Marker | 2 | `Locate Previous Marker` |
| To Marker 1 | 3 | `To Marker 1` |
| To Marker 2 | 4 | `To Marker 2` |
| To Marker 3 | 5 | `To Marker 3` |
| To Marker 4 | 6 | `To Marker 4` |
| To Marker 5 | 7 | `To Marker 5` |
| To Marker 6 | 8 | `To Marker 6` |
| To Marker 7 | 9 | `To Marker 7` |
| To Marker 8 | 10 | `To Marker 8` |
| To Marker 9 | 11 | `To Marker 9` |

All one-way, Companion→Cubase, momentary trigger (Note On, then Note Off `TRIGGER_HOLD_MS` later) — same shape as Return to Zero in Phase 1. Nothing is sent Cubase→Companion on this channel; there is no feedback and no per-phase heartbeat.

## Companion module changes (`companion-module-cubase`)

- **`src/midi/protocol.ts`**: generalize `encodeNoteOn`, `encodeNoteOff`, and `encodeTrigger` to take an explicit `channel` parameter (currently hardcoded to `TRANSPORT_CHANNEL`) — a breaking signature change, all existing Transport call sites updated to pass `TRANSPORT_CHANNEL` explicitly. `decodeMidiMessage` stays Transport-only (still checks against `TRANSPORT_CHANNEL`); Markers has nothing incoming to decode. Add `MARKERS_CHANNEL = 14` and a `MarkerNote` enum (`AddMarker`, `NextMarker`, `PreviousMarker`, `ToMarker1`..`ToMarker9`) alongside the existing `TransportNote` enum — `protocol.ts` remains the single source of truth for the whole wire protocol, not just Transport.
- **`src/midi/connection.ts`**: only `sendTrigger` becomes channel-aware (`sendTrigger(channel, note)` instead of `sendTrigger(note)`), since it's the only `MidiConnection` method Markers calls — all 12 new actions are plain triggers. `sendNoteOn`/`sendNoteOff` are unchanged (still implicitly `TRANSPORT_CHANNEL`); Markers doesn't need hold-style or Note-On-only sends, and generalizing methods nothing calls with a different channel isn't justified by this spec. Self-echo suppression (`consumeSelfEcho`) needs no changes — it compares raw bytes regardless of channel, so it works for Markers' self-echoes the same way it already does for Transport's.
- **`src/actions.ts`**: 12 new actions (`addMarker`, `nextMarker`, `previousMarker`, `toMarker1`..`toMarker9`), each calling `self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.X)`.
- **`src/presets.ts`**: 12 new presets using the existing no-feedback `preset()` helper (same shape as `returnToZero`), grouped under a new `"Markers"` section in the preset structure — shows up as its own category in Companion's UI, separate from `"Transport"`.
- **Config, feedbacks**: unchanged. No new config fields (same MIDI In/Out port pair), no new feedbacks.

## Cubase MIDI Remote script (`CubaseCompanion_Markers.js`)

New file: `cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js`, structurally parallel to the Transport script but simpler — no toggles, no feedback, no heartbeat:

- `midiremote_api.makeDeviceDriver('CubaseCompanion', 'Markers', 'companion-module-cubase')` — its own device driver, distinct from Transport's `'CubaseCompanion', 'Transport', ...`.
- Its own `midiInput`/`midiOutput` via `mPorts.makeMidiInput()`/`makeMidiOutput()`, with a detection hint of `'CubaseCompanion Transport'` (same string as the Transport script) — both scripts share the same physical port regardless of what it's literally named, and this project's actual setup uses a manually-assigned port name anyway (the hint is a convenience for auto-detection, not a hard requirement — already proven non-blocking in Phase 1).
- 12 buttons, each with `mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_X)` (input-only, no `.setOutputPort()`, no `.setTypeToggle()`) and `page.makeCommandBinding(btnX.mSurfaceValue, 'Transport', '<exact command name>')` from the table above.
- No `mOnIdle`, no `mOnActivate` feedback push — nothing to keep alive or sync, since there's no state.

## Testing plan

- **`protocol.ts`**: unit tests for the now channel-aware `encodeNoteOn`/`encodeNoteOff`/`encodeTrigger`, and for the new `MARKERS_CHANNEL`/`MarkerNote` constants.
- **`connection.ts`**: existing `sendTrigger`-related tests updated for its new channel parameter; no new suppression logic to test since the mechanism is already channel-agnostic.
- **`actions.ts`**: one test per new action, confirming it sends the right channel + note (matching the existing `play`/`record` test pattern).
- **`presets.ts`**: no dedicated test file exists for it today (matching current project convention); none added here either.
- **Cubase script**: not unit-testable (ES5, no test harness — same documented limitation as Transport; see [ARCHITECTURE.md](../../../ARCHITECTURE.md)). Verified live against real Cubase 15, same process used for Transport: build, deploy both the Companion module and the new Cubase script, rescan in Cubase, press each of the 12 buttons in Companion, confirm Cubase responds. No feedback to verify since none exists for this action set.

## Out of scope (follow-on work)

- Cycle markers, punch in/out points, marker renaming, `Set Marker N` (assign rather than jump) — could reuse this same pattern in a later spec.
- Phases 2, 4, 5 (Mixer, Track/Macros, Control Room) per [ROADMAP.md](../../../ROADMAP.md) — each gets its own spec, its own script file, and (per this spec's precedent) its own dedicated MIDI channel.

## Decision log

- **Separate script per phase, not one consolidated script** — explicit project owner preference at design time. **Reversed — see 2026-07-09 amendment and [ADR-007](../../adr/ADR-007-single-consolidated-cubase-script.md).**
- **Shared MIDI port pair across phase scripts, not a new port per phase** — avoids asking the user to create and wire up a new virtual MIDI port for every phase; one Companion connection continues to carry all phases' traffic. **Invalidated — see 2026-07-09 amendment below.**
- **Dedicated MIDI channel per phase script (channel 14 for Markers), not continuing Transport's channel 15** — small extra step now, avoids any note-collision bookkeeping across phases as more are added later.
- **No feedback for any marker action** — none of the twelve have a persistent boolean state the way Play/Record/Cycle/Click do; confirmed with the project owner rather than assumed.
- **`To Marker N`, not `Set Marker N`** — the former jumps to an existing marker, the latter assigns/overwrites one; jumping is what "Go to Marker" means here.

## Amendment (2026-07-09): shared MIDI port pair does not work in Cubase

Tasks 1-8 were implemented, unit-tested, and each passed task-level review exactly as this spec describes. Live verification against real Cubase 15 (Task 8, Step 2) found that **Cubase's Studio Setup > MIDI Remote will not bind two separate controllers to the same MIDI port pair** — once "CubaseCompanion Transport" claims a port, that port disappears entirely from the selection dropdown for any other controller, including "CubaseCompanion Markers". Removing Transport's binding frees the port for Markers to claim, but then Transport can no longer be re-added to it — confirmed as an exclusive, one-controller-per-port restriction in Cubase's own UI, not a bug in either script or in `MidiConnection`. The underlying loopMIDI port itself supports multiple simultaneous listeners (this is what made the Phase 1 self-echo bug possible in the first place — see ADR-004), but Cubase's own controller-management layer does not allow two of *its own* device drivers to share one port pair regardless.

This invalidates this spec's Architecture section and the "Shared MIDI port pair across phase scripts" decision above. **Superseded by [ADR-007](../../adr/ADR-007-single-consolidated-cubase-script.md):** rather than giving Markers its own port and a second `MidiConnection` (the dual-connection plan originally drafted here — discarded, see ADR-007's Context for why), the project moves to **one consolidated Cubase script for the whole project**, retiring the separate-script-per-phase idea entirely while keeping the per-phase-channel convention. All of Tasks 1-4's Companion-side code (the channel-aware protocol/connection/actions/presets changes) needed *zero* changes for this — it was already built around one connection with a channel parameter, per ADR-006. Only the Cubase side changes: `CubaseCompanion_Transport.js` and `CubaseCompanion_Markers.js` (Task 5) are merged into one `CubaseCompanion.js`, one device driver, one port pair, still split internally by channel (Transport=15, Markers=14). See ADR-007 for the full decision and consequences.
