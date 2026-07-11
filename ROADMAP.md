# Roadmap

## v1.0.0 — Done, verified against real Cubase 15

The complete first release. Four actions, matching feedback/status, verified live:

- [x] Actions: Play, Stop, Record, Add Marker
- [x] Feedbacks: Playing, Recording, Stopped, Cubase Connected
- [x] Presets pairing each transport action with its matching feedback; standalone Add Marker and Cubase Connected presets
- [x] Cubase MIDI Remote driver script (Play/Stop/Record bindings + Add Marker command binding + heartbeat)
- [x] Heartbeat-based connection status, correctly detecting both connect *and* disconnect
- [x] **Verified against a real Cubase 15 instance** — see [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md)

## Deferred to a future full-API implementation pass

Everything below was built, unit-tested, and (except where noted) verified against real Cubase 15 during earlier development, then deliberately trimmed out of v1.0 to ship a minimal, high-confidence core first (see the [2026-07-11 scope-trim design spec](docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md)). Nothing here is abandoned — it's a known-working reference for whenever this phase is picked back up:

- **Extended transport** — Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward
- **Extended markers** — Next/Previous Marker, To Marker 1-9, cycle markers, punch in/out points, named marker assignment
- **Mixer channel control** — Mute, Solo, Volume, Pan, Selected Channel Name, plus Read/Write (automation), Record Enable, Monitor, Listen, and Edit Channel Settings (never implemented — see the API research note below)
- **Track/selection & macros** — select a track, trigger a key command/macro, arm record on a track
- **Control room operations** — scope not yet defined

Prior API research, still valid when this is picked back up: Cubase's MIDI Remote API exposes `mRecordEnable`, `mMonitorEnable`, `mAutomationRead`, and `mAutomationWrite` directly on `MR_MixerChannelValues` — the same host object Mute/Solo/Volume/Pan bound to. "Listen" (channel AFL/PFL) and "Edit Channel Settings" weren't found on that same object and need their own lookup.

## Non-feature work, not yet scheduled

- Public-release readiness (real repository URL, published to the Companion module registry) — currently out of scope per [PRD.md](PRD.md), since this is a personal-use project. Revisit if that changes.
- Cross-platform (macOS/Linux) verification — nothing in the architecture blocks it, but it's untested.
- Deciding the scope of the future full-API implementation pass — needs its own brainstorming/requirements pass when picked up.
