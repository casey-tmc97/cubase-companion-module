# Roadmap

## Phase 1: Transport — Done, verified against real Cubase 15

Architecture proving ground (see [ADR-003](docs/adr/ADR-003-phased-delivery-transport-first.md)). Implemented, unit-tested, and confirmed working end-to-end against real Cubase 15 (see [ADR-004](docs/adr/ADR-004-fixed-midi-note-contract.md)'s 2026-07-09 amendment for the real-world bugs found and fixed during that verification):

- [x] Companion module scaffold, config, MIDI I/O layer
- [x] Actions: Play, Stop, Record, Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward
- [x] Feedbacks: Playing, Recording, Stopped, Cycle Active, Click Active, Cubase Connected
- [x] Presets pairing each action with its matching feedback
- [x] Cubase MIDI Remote driver script
- [x] Heartbeat-based connection status, correctly detecting both connect *and* disconnect
- [x] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)'s checklist. Fully re-verified against the consolidated script on 2026-07-10, after resolving two deployment issues (script registration reuse and a stale Mapping Page selector — see [ADR-008](docs/adr/ADR-008-reuse-transport-registration-slot.md)).

## Phase 2: Mixer channel control — Done, verified against real Cubase 15

Selected-channel Mute, Solo, Volume (relative step), Pan (relative step), and a Selected Channel Name feedback — see [design spec](docs/superpowers/specs/2026-07-10-cubase-companion-mixer-design.md) and [implementation plan](docs/superpowers/plans/2026-07-10-cubase-companion-mixer.md):

- [x] Actions: Toggle Mute, Toggle Solo, Volume Up, Volume Down, Pan Left, Pan Right
- [x] Feedbacks: Mute Active, Solo Active, Selected Channel Name
- [x] Presets pairing Mute/Solo with their feedback; standalone Volume/Pan/name presets
- [x] Cubase MIDI Remote script: selected-channel bindings on MIDI channel 13, relative-CC volume/pan, SysEx channel-name feedback
- [x] **Verified against a real Cubase 15 instance** — Mute, Solo, Volume, and Pan confirmed working live on 2026-07-10.
- [ ] Read, Write (automation read/write), Record Enable, Monitor, Listen, and Edit Channel Settings — out of scope for this pass, flagged by the project owner during live verification as needed in a follow-up phase. Could extend the same selected-channel pattern (`page.mHostAccess.mTrackSelection.mMixerChannel`) this phase already established: Cubase's MIDI Remote API already exposes `mRecordEnable`, `mMonitorEnable`, `mAutomationRead`, and `mAutomationWrite` directly on `MR_MixerChannelValues` — the same host object Mute/Solo/Volume/Pan already bind to. "Listen" (channel AFL/PFL) and "Edit Channel Settings" (opening the channel's settings/inspector) weren't found in that same object during this phase's API research and need their own lookup when this is picked up.

## Phase 3: Markers & locators — Done, verified against real Cubase 15

- [x] Add Marker, Next/Previous Marker, To Marker 1-9 implemented, unit-tested, and task-reviewed clean — see [design spec](docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md) and [ADR-006](docs/adr/ADR-006-channel-per-phase-script.md)
- [x] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)'s checklist. The port-sharing blocker is resolved by consolidating to one script ([ADR-007](docs/adr/ADR-007-single-consolidated-cubase-script.md)). Fully re-verified on 2026-07-10 after resolving a script-registration and Mapping Page issue (see [ADR-008](docs/adr/ADR-008-reuse-transport-registration-slot.md)) — Add Marker, Next/Previous Marker, To Marker 1-9, the invalid-marker-number case, and non-interference with Transport all confirmed working.
- [ ] Cycle markers, punch in/out points, named marker assignment (`Set Marker N`) — out of scope for this pass, could extend the same pattern later.

## Phase 4: Track/selection & macros — Not started

Select a track, trigger a key command/macro, arm record on a track.

## Phase 5: Control room operations — Not started

Scope not yet defined beyond the name — needs its own requirements-gathering pass when picked up.

## Non-feature work, not yet scheduled

- Public-release readiness (real repository URL, published to the Companion module registry) — currently out of scope per [PRD.md](PRD.md), since this is a personal-use project. Revisit if that changes.
- Cross-platform (macOS/Linux) verification — nothing in the architecture blocks it, but it's untested.
