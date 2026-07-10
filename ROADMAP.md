# Roadmap

## Phase 1: Transport — Done, verified against real Cubase 15

Architecture proving ground (see [ADR-003](docs/adr/ADR-003-phased-delivery-transport-first.md)). Implemented, unit-tested, and confirmed working end-to-end against real Cubase 15 (see [ADR-004](docs/adr/ADR-004-fixed-midi-note-contract.md)'s 2026-07-09 amendment for the real-world bugs found and fixed during that verification):

- [x] Companion module scaffold, config, MIDI I/O layer
- [x] Actions: Play, Stop, Record, Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward
- [x] Feedbacks: Playing, Recording, Stopped, Cycle Active, Click Active, Cubase Connected
- [x] Presets pairing each action with its matching feedback
- [x] Cubase MIDI Remote driver script
- [x] Heartbeat-based connection status, correctly detecting both connect *and* disconnect
- [ ] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)'s checklist. Previously verified under the prior two-script architecture; needs re-verification against the consolidated script (see [ADR-007](docs/adr/ADR-007-single-consolidated-cubase-script.md)).

## Phase 2: Mixer channel control — Not started

Per-channel mute, solo, fader volume, pan for specific tracks/channels (e.g. "mute vocal track"). Will need its own spec (design questions: how are channels addressed — by name, by index, by selection? does fader volume need a rotary/relative encoder input, or discrete up/down actions?) before implementation.

## Phase 3: Markers & locators — In progress

- [x] Add Marker, Next/Previous Marker, To Marker 1-9 implemented, unit-tested, and task-reviewed clean — see [design spec](docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md) and [ADR-006](docs/adr/ADR-006-channel-per-phase-script.md)
- [ ] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)'s checklist. The port-sharing blocker is resolved by consolidating to one script ([ADR-007](docs/adr/ADR-007-single-consolidated-cubase-script.md)); pending a live verification pass.
- [ ] Cycle markers, punch in/out points, named marker assignment (`Set Marker N`) — out of scope for this pass, could extend the same pattern later.

## Phase 4: Track/selection & macros — Not started

Select a track, trigger a key command/macro, arm record on a track.

## Phase 5: Control room operations — Not started

Scope not yet defined beyond the name — needs its own requirements-gathering pass when picked up.

## Non-feature work, not yet scheduled

- Public-release readiness (real repository URL, published to the Companion module registry) — currently out of scope per [PRD.md](PRD.md), since this is a personal-use project. Revisit if that changes.
- Cross-platform (macOS/Linux) verification — nothing in the architecture blocks it, but it's untested.
