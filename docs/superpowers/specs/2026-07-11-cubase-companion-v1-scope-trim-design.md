# v1.0 Scope Trim — Design

## Context

The project has shipped Phase 1 (Transport), Phase 2 (Mixer), and Phase 3
(Markers), all verified against a real Cubase 15 instance (see
[ROADMAP.md](../../../ROADMAP.md)). The project owner has decided to pull
back the first complete release to a minimal, high-confidence core — Play,
Stop, Record, and Add Marker — and defer everything else (Mixer control,
extended transport, extended markers, and all of unstarted Phase 4/5) to a
later "full MIDI Remote API implementation" pass.

This is a deliberate descope of already-working, already-verified code, not
a bug fix or new feature. Nothing here is being redesigned — it's removal.

## Goal

Ship a v1.0.0 release where the Companion module and the Cubase MIDI Remote
script expose exactly four actions — Play, Stop, Record, Add Marker — plus
the connection-status infrastructure needed to make them usable
(Playing/Recording/Stopped feedback, Cubase Connected feedback), with docs
updated to describe that as the current, complete state of the project.

## What stays

- **Actions:** `play`, `stop`, `record`, `addMarker`
- **Feedbacks:** `playing`, `recording`, `stopped`, `cubaseConnected`
- **Presets:** one preset per action above (Play/Record/Stop paired with
  their feedback per the existing pattern; Add Marker standalone), plus the
  standalone `cubaseConnected` status preset
- **MIDI protocol** (`protocol.ts`):
  - `TRANSPORT_CHANNEL`, with `TransportNote` trimmed to `Play`, `Stop`,
    `Record`, `Heartbeat`, `PlayState`, `RecordState`
  - `MARKERS_CHANNEL`, with `MarkerNote` trimmed to `AddMarker` only
  - `decodeMidiMessage`'s channel filter narrows to `TRANSPORT_CHANNEL` only
    (Markers channel has never carried anything Companion needs to decode —
    Add Marker is one-shot, no feedback)
- **`TransportState`**: trimmed to `{ playing, recording }` (drop
  `cycleActive`, `clickActive`)
- **Cubase script**
  (`cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`):
  same file/device-driver registration (do not touch vendor/model naming —
  see ADR-008, it's load-bearing for Cubase's script re-discovery), trimmed
  to Play/Stop/Record buttons + bindings + state feedback, Add Marker
  button + command binding, and the heartbeat loop
- **Historical docs, untouched:** all ADRs and the Phase 2/3 design specs
  under `docs/superpowers/specs/` stay as-is. They're the record of why
  those features were built the way they were, and are exactly what a
  future "full API implementation" pass will want to read first. This spec
  does not supersede them — it supersedes their *current shipped scope*,
  not their design.

## What gets removed (code, not just docs)

- `companion-module-cubase/src/midi/mixerState.ts` — deleted entirely
- `protocol.ts`: `MixerNote`, `MixerCC`, `MIXER_CHANNEL`, and the
  `RELATIVE_TICK_UP`/`DOWN` constants + `encodeRelativeTick` (only consumer
  was Mixer volume/pan)
- `actions.ts`: `returnToZero`, `toggleCycle`, `toggleClick`, `rewind`,
  `rewindStop`, `forward`, `forwardStop`, `toggleMute`, `toggleSolo`,
  `volumeUp`, `volumeDown`, `panLeft`, `panRight`, `nextMarker`,
  `previousMarker`, `toMarker1`…`toMarker9`
- `feedbacks.ts`: `cycleActive`, `clickActive`, `muteActive`, `soloActive`,
  `selectedChannelName`
- `presets.ts`: presets/structure entries for everything above; drop the
  `mixer` preset section entirely; `transport`/`markers` sections shrink to
  their remaining members
- `ModuleLike` interface (`actions.ts`): drop `getMixerState()` and the
  `cycleActive`/`clickActive` fields from the transport state shape;
  `sendRelativeCC` becomes unused and is removed
- Cubase script: Mixer section (buttons, bindings, state feedback, SysEx
  channel-name feedback), Return to Zero/Cycle/Click/Rewind/Forward buttons
  + bindings + state feedback, Next/Previous/To Marker 1-9 buttons +
  bindings
- Any now-dead tests exercising removed code paths in
  `test/actions.test.ts`, `test/feedbacks.test.ts`,
  `test/midi/protocol.test.ts`, `test/midi/transportState.test.ts`,
  `test/midi/mixerState.test.ts` (file deleted)

## Docs to update

- **ROADMAP.md**: replace the Phase 1-5 breakdown with a description of the
  v1.0.0 scope (Play/Stop/Record/Add Marker, verified) and a "Deferred to
  future full-API pass" section listing everything cut (Mixer, extended
  transport, extended markers, Phase 4/5), so nothing already-learned is
  lost
- **PRD.md**: update feature list to the four actions
- **README.md**: update feature list / usage examples
- **ARCHITECTURE.md**: update anywhere it enumerates the removed
  actions/feedbacks/MIDI channels' contents
- **CHANGELOG.md**: add a `[1.0.0]` entry — "Removed" section listing the
  cut features by name (so the historical record of what existed in 0.1.0
  is preserved in the changelog even after code deletion), "Changed"
  noting the scope decision

## Versioning

- Bump `companion-module-cubase/package.json` from `0.1.0` to `1.0.0`
- `CHANGELOG.md` gets a `[1.0.0] - 2026-07-11` entry
- After code + docs are committed, create an annotated git tag `v1.0.0`

## Out of scope for this pass

- Any new functionality — this is pure removal + doc/version cleanup
- Rewriting or deleting ADRs / old design specs
- Deciding what the "full MIDI Remote API implementation" phase actually
  covers — that's a future brainstorming pass when picked up
