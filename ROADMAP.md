# Roadmap

## Phase 1: Transport — Done, unverified against real Cubase

Architecture proving ground (see [ADR-003](docs/adr/ADR-003-phased-delivery-transport-first.md)). Implemented and unit-tested (42/42 tests, clean build):

- [x] Companion module scaffold, config, MIDI I/O layer
- [x] Actions: Play, Stop, Record, Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward
- [x] Feedbacks: Playing, Recording, Stopped, Cycle Active, Click Active, Cubase Connected
- [x] Presets pairing each action with its matching feedback
- [x] Cubase MIDI Remote driver script
- [x] Heartbeat-based connection status, correctly detecting both connect *and* disconnect
- [ ] **Verified against a real Cubase 15 instance** — see [DEPLOYMENT.md](DEPLOYMENT.md)'s checklist. This is the next concrete step before Phase 1 can be considered actually done, not just built.

## Phase 2: Mixer channel control — Not started

Per-channel mute, solo, fader volume, pan for specific tracks/channels (e.g. "mute vocal track"). Will need its own spec (design questions: how are channels addressed — by name, by index, by selection? does fader volume need a rotary/relative encoder input, or discrete up/down actions?) before implementation.

## Phase 3: Markers & locators — In progress

- [x] Add Marker, Next/Previous Marker, To Marker 1-9 — see [design spec](docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md) and [ADR-006](docs/adr/ADR-006-channel-per-phase-script.md)
- [ ] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-markers-setup.md](docs/cubase-companion-markers-setup.md)'s checklist.
- [ ] Cycle markers, punch in/out points, named marker assignment (`Set Marker N`) — out of scope for this pass, could extend the same pattern later.

## Phase 4: Track/selection & macros — Not started

Select a track, trigger a key command/macro, arm record on a track.

## Phase 5: Control room operations — Not started

Scope not yet defined beyond the name — needs its own requirements-gathering pass when picked up.

## Non-feature work, not yet scheduled

- Public-release readiness (real repository URL, published to the Companion module registry) — currently out of scope per [PRD.md](PRD.md), since this is a personal-use project. Revisit if that changes.
- Cross-platform (macOS/Linux) verification — nothing in the architecture blocks it, but it's untested.
