# Cubase Companion Module — Mixer channel control (Phase 2) Design

**Date:** 2026-07-10
**Status:** Approved, ready for implementation planning

## Goal

Add mixer channel control to the Cubase Companion control surface: mute, solo, volume, and pan for whatever track is currently selected in Cubase — the start of Phase 2 ("Mixer channel control") from [ROADMAP.md](../../../ROADMAP.md).

## Background

Phase 1 (Transport) and Phase 3 (Markers) are both implemented and verified against real Cubase 15. ROADMAP.md flagged Phase 2 as needing its own design pass before implementation, specifically: how channels are addressed (by name, by index, or by selection), and whether fader volume needs a rotary/relative encoder input or discrete up/down actions. Both questions are resolved below.

Two lessons carried forward from earlier phases (see [ADR-004](../../adr/ADR-004-fixed-midi-note-contract.md)'s 2026-07-09 amendment):

- A toggle's trigger and its state feedback must never share a MIDI note on the same shared loopMIDI port — Cubase's own feedback output loops back into its own input binding and re-triggers the toggle. Mute/Solo follow the same split-note pattern already used for Play/Record/Cycle/Click.
- `sendTrigger`'s Note On + Note Off pair needs a real gap (`TRIGGER_HOLD_MS`) to read as a genuine press-hold-release to Cubase's binding logic. Mute/Solo triggers reuse the existing `sendTrigger` unchanged.

## Scope

**This spec covers selected-channel mixer control only** — six actions:

- Toggle Mute, Toggle Solo (toggle, with live feedback)
- Volume Up, Volume Down (discrete relative step)
- Pan Left, Pan Right (discrete relative step)

Plus one feedback with no matching action: **Selected Channel Name**, showing which track the above six actions currently target.

**Channel addressing — selected channel, not a fixed bank.** All six actions target `mHostAccess.mTrackSelection.mMixerChannel` — whatever track is currently selected in Cubase (by clicking it in Cubase's own UI, or via a future Phase 4 "select track" action) — rather than a fixed bank of N channel strips (Mackie-Control style, via `MixConsole.makeMixerBankZone()`/`makeMixerBankChannel()`). Confirmed with the project owner during design: this is simpler (no fixed channel count to choose, no bank-paging actions needed) and matches a natural click-then-press workflow for a single-user setup. A fixed-bank model remains available as a later extension if a persistent multi-channel grid is ever wanted; it would be a separate, additive design, not a revision of this one.

**Volume/Pan are discrete relative steps, not absolute values.** Volume Up/Down and Pan Left/Right each nudge by one relative "tick" per press — no "set to exact dB/pan value" actions. Confirmed this works with Stream Deck+ dials too: Companion's Rotate Left/Right button triggers can be assigned to any regular action (no special encoder action type needed at the module level), so Volume Up → Rotate Right / Volume Down → Rotate Left (and similarly for Pan) gives touch-dial-style control for free.

**Mute/Solo are toggles with live feedback**, matching Cycle/Click from Phase 1 — the button reflects Cubase's actual current state and updates in either direction (Companion press or Cubase's own mixer).

Explicitly out of scope for this spec: absolute volume/pan value actions, a fixed bank of N channel strips, VU meters, EQ, sends, record-enable, monitor-enable, and Unicode-safe channel name encoding (see the SysEx section below). These can extend this pattern in later specs if wanted.

## Architecture

No new Companion connection, no new virtual MIDI port, no new heartbeat — same pattern as Markers. The existing `companion-module-cubase` Companion instance and its single `MidiConnection` gain six new actions and three new feedbacks. On the Cubase side, the Mixer phase is a new section within the one consolidated `CubaseCompanion.js` script ([ADR-007](../../adr/ADR-007-single-consolidated-cubase-script.md)), bound to `page.mHostAccess.mTrackSelection.mMixerChannel`.

```
Companion (companion-module-cubase, one MidiConnection)
        |
        v
   [shared loopMIDI/network port pair]
        |
        v
   Cubase: CubaseCompanion.js (one device driver)
        +-- Transport section (channel 15, notes 0-13)
        +-- Markers section   (channel 14, notes 0-11)
        +-- Mixer section     (channel 13, new)
```

Per [ADR-006](../../adr/ADR-006-channel-per-phase-script.md)'s per-phase-channel convention (kept even after ADR-007 consolidated the script itself), Mixer claims the next channel down from Markers: **13 (zero-indexed 12)**, with note/CC numbering starting fresh at 0.

## MIDI mapping

Two message shapes are new to this project — Transport and Markers only ever used plain Note On/Off triggers and toggle state notes.

### Mute/Solo — note-based toggle (same split-note pattern as Play/Record/Cycle/Click)

| Function | Note # | Direction |
|---|---|---|
| Toggle Mute | 0 | Companion→Cubase (trigger) |
| Toggle Solo | 1 | Companion→Cubase (trigger) |
| Mute State | 2 | Cubase→Companion (feedback) |
| Solo State | 3 | Cubase→Companion (feedback) |

Trigger notes are momentary Note On + Note Off pairs via the existing `sendTrigger(channel, note)`, unchanged from Transport/Markers. State notes follow ADR-004's velocity convention (127 = on, 0 = off), sent on change and once on `mOnActivate`/selection change.

### Volume/Pan — relative CC, new pattern

Cubase's MIDI Remote API supports `MR_MidiBindingToControlChange.setTypeRelativeSignedBit()`: a CC value of `1`–`63` means "increment by that amount," `65`–`127` means "decrement by (value − 64)." Companion sends a single relative tick (`1` for up/right, `65` for down/left) per press or dial detent — Cubase's own binding determines how much that tick actually moves the fader/pan, matching standard relative-encoder hardware behavior.

| Function | CC # |
|---|---|
| Volume delta | 0 |
| Pan delta | 1 |

One-directional (Companion→Cubase only) — no volume/pan level readout, per Scope.

### Selected Channel Name — SysEx, new pattern

Plain Note/CC messages carry only 0–127 numeric values, not text. Cubase's mixer-channel object fires `mOnTitleChange` with the track's name, and `MR_DeviceMidiOutput.sendMidi()` accepts an arbitrary byte array, so the channel name is sent as a SysEx message: `[0xF0, 0x7D, <ASCII bytes>, 0xF7]` (`0x7D` is the MIDI spec's reserved "non-commercial/educational" manufacturer ID). Names are **ASCII-only, truncated to 32 characters**, with non-ASCII characters replaced by `?`. A full Unicode-safe encoding (e.g. splitting each byte into two 7-bit nibbles to stay SysEx-data-byte-clean) is deliberately not built — track names in this project's actual use are ASCII, and the added complexity isn't justified by a case that likely won't occur. If it does, this is an isolated, additive change to `encodeChannelNameSysEx`/`decodeChannelNameSysEx` only.

Sent whenever the selected channel's title changes, and once on `mOnActivate`/selection change so Companion syncs to whatever's already selected rather than waiting for the next change — same "push current state on activate" precedent Transport established.

## Companion module changes (`companion-module-cubase`)

- **`src/midi/protocol.ts`**: add `MIXER_CHANNEL = 12`; `MixerNote` enum (`ToggleMute`, `ToggleSolo`, `MuteState`, `SoloState`) and `MixerCC` enum (`VolumeDelta`, `PanDelta`), alongside the existing `TransportNote`/`MarkerNote` enums. Add `encodeControlChange(channel, cc, value)` and a relative-tick helper (`encodeRelativeTick(channel, cc, direction)` sending value `1` or `65`). Add `encodeChannelNameSysEx(name: string): number[]` and `decodeChannelNameSysEx(bytes: number[]): string | null` implementing the ASCII-only/truncation rule above. Generalize `decodeMidiMessage`: today it hardcodes `channel !== TRANSPORT_CHANNEL → return null` and only recognizes Note On/Off (`0x90`/`0x80`) — it needs to also accept note messages on `MIXER_CHANNEL` (for Mute/Solo state) and route SysEx (`0xF0`, which has no channel nibble and can't go through the existing channel-voice-message parsing) to a separate decode path, likely splitting today's single function into a channel-voice-message decoder and a SysEx decoder called from `connection.ts`.
- **`src/midi/mixerState.ts`** (new file, mirrors `transportState.ts`): a pure, fully unit-tested `MixerState { muted: boolean, solo: boolean, selectedChannelName: string | null }` plus reducer-style functions (`applyMixerStateNote`, an equivalent for the SysEx name update) — same pure-core-vs-thin-IO-adapter split the project already follows (see [ARCHITECTURE.md](../../../ARCHITECTURE.md)).
- **`src/midi/connection.ts`**: add `sendRelativeCC(channel, cc, direction: 1 | -1): void` (encodes and sends a single relative-tick CC message, no self-echo bookkeeping needed since nothing echoes it back). `handleMessage` gains handling for `MixerNote.MuteState`/`SoloState` (updates `MixerState`, mirroring how `TransportNote` state notes already update `TransportState`) and for incoming SysEx (updates `selectedChannelName`), emitting `'stateChanged'` the same way. `sendTrigger(MIXER_CHANNEL, ...)` is reused unchanged for Toggle Mute/Solo — no connection.ts changes needed there beyond what Markers already made it channel-aware for.
- **`src/actions.ts`**: six new actions — `toggleMute`, `toggleSolo` (via `sendTrigger`), `volumeUp`, `volumeDown`, `panLeft`, `panRight` (via `sendRelativeCC`).
- **`src/feedbacks.ts`**: `Mute Active`, `Solo Active` (boolean, same shape as Cycle/Click Active), `Selected Channel Name` (text/advanced feedback rendering `MixerState.selectedChannelName`, falling back to a placeholder like "No Channel Selected" when null).
- **`src/presets.ts`**: new "Mixer" section — Toggle Mute + Mute Active paired, Toggle Solo + Solo Active paired (same paired-preset pattern as Play/Record/Cycle/Click), Volume Up/Down and Pan Left/Right as standalone momentary presets with no feedback (same pattern as Rewind/Forward), plus one preset displaying the Selected Channel Name feedback on its own.

## Cubase MIDI Remote script (`CubaseCompanion.js`)

New section within the existing consolidated script, bound to `page.mHostAccess.mTrackSelection.mMixerChannel` (channel 13, zero-indexed 12):

- Mute/Solo: `.mValue.mMute` / `.mValue.mSolo`, each with a `.setTypeToggle()` binding split across a trigger note (input-only) and a feedback note (output-only) — same split-note construction already used for Record/Cycle/Click, per ADR-004's amendment.
- Volume/Pan: `.mValue.mVolume` / `.mValue.mPan`, each bound via `mMidiBinding.bindToControlChange(MIXER_CHANNEL, cc).setTypeRelativeSignedBit()`, input-only (no `.setOutputPort()` — Companion never needs volume/pan feedback per Scope).
- Channel name: an `mOnTitleChange` callback on the mixer channel that calls `midiOutput.sendMidi()` with the ASCII/truncated SysEx byte array from the mapping above.
- `mOnActivate` (or equivalently, on selection change): push current Mute/Solo state and the current channel name immediately, so Companion syncs to whatever's already selected/muted/soloed without waiting for the next change — same precedent as Transport's `mOnActivate` push.

## Testing plan

- **`protocol.ts`**: unit tests for `MIXER_CHANNEL`/`MixerNote`/`MixerCC` constants, `encodeControlChange`/relative-tick encoding, `encodeChannelNameSysEx`/`decodeChannelNameSysEx` (including the ASCII-truncation and non-ASCII-replacement edge cases), and the generalized `decodeMidiMessage`/new SysEx decoder correctly handling `MIXER_CHANNEL` note messages and SysEx alongside the existing Transport-only behavior.
- **`mixerState.ts`**: unit tests for `MixerState` reducers, mirroring `transportState.test.ts`'s existing pattern.
- **`connection.ts`**: unit tests for `sendRelativeCC`, and `handleMessage` tests covering Mute/Solo state notes and SysEx name updates emitting `stateChanged` correctly.
- **`actions.ts`**: one test per new action, confirming it sends the right channel + note/CC (matching the existing `play`/`record`/marker test pattern).
- **Cubase script**: not unit-testable (ES5, no test harness — same documented limitation as Transport/Markers). Verified live against real Cubase 15: select a track, toggle Mute/Solo from both Companion and Cubase's own mixer and confirm feedback tracks correctly in both directions with no self-echo flicker (the failure mode ADR-004 documents); press Volume Up/Down and Pan Left/Right and confirm the fader/pan actually moves; change the selected track in Cubase and confirm the Selected Channel Name feedback updates promptly; confirm non-interference with Transport and Markers (all three sections active simultaneously).

## Out of scope (follow-on work)

- Absolute volume/pan value actions (jump to an exact dB/pan value) — Volume/Pan here are relative-step only.
- A fixed bank of N channel strips (Mackie-Control style, via `MixConsole.makeMixerBankZone()`) — selected-channel only for this spec; a bank model would be a separate, additive design.
- VU meters, EQ, sends, record-enable, monitor-enable — none of these were asked for; could extend this same section later if wanted.
- Unicode-safe channel name encoding — ASCII-only for now; see the SysEx section above for why and how this could be extended later.
- Phases 4, 5 (Track/Macros, Control Room) per [ROADMAP.md](../../../ROADMAP.md) — each gets its own spec.

## Decision log

Key choices made during design, for context if they're revisited later:

- **Selected-channel addressing, not a fixed bank of N channel strips** — simpler (no channel count to pick, no bank-paging actions), matches a natural click-in-Cubase-then-press-in-Companion workflow for a single-user setup. Confirmed with the project owner rather than assumed.
- **Discrete relative-step Volume/Pan, not absolute value actions** — confirmed this still works with Stream Deck+ dials via Companion's own Rotate Left/Right button triggers, which can be assigned to any regular action without special encoder support at the module level.
- **Mute/Solo as toggles with live feedback**, matching Cycle/Click — confirmed with the project owner, unlike Markers' triggers (which have no persistent state to reflect).
- **Selected Channel Name feedback added** — without it, Mute/Solo/Volume/Pan act on whatever's selected in Cubase with no on-button indication of what that is; confirmed the project owner wants this visibility rather than relying on glancing at Cubase's own UI.
- **SysEx for channel name, ASCII-only** — the only way to carry text over plain MIDI; ASCII-only trades away Unicode support for significantly simpler encoding, justified by this being a personal project where track names are realistically ASCII.
- **MIDI channel 13 (zero-indexed 12)** — next available channel per ADR-006's per-phase convention, following Transport (15) and Markers (14).
