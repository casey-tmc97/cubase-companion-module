# Changelog

All notable changes to this project are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/), and versioning follows [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH).

## [Unreleased]

### Changed

- Renamed the project from "Cubase Companion Module" / vendor-model identity `CubaseCompanion`/`Transport` to **Cubanion** throughout: Companion module id/name (`cubase` → `cubanion`), Cubase-side script and vendor/model registration (`CubaseCompanion_Transport.js` → `Cubanion_Transport.js`, vendor `CubaseCompanion` → `Cubanion`), and all forward-facing docs. This project is not a Steinberg product; the new name avoids implying otherwise. See [ADR-008](docs/adr/ADR-008-reuse-transport-registration-slot.md)'s update note — renaming the vendor/model pair was expected to risk breaking Cubase's Local-script discovery on this machine (per that ADR's original finding) but did not; fresh discovery of the new `Cubanion`/`Transport` pair succeeded on 2026-07-13.

## [1.0.0] - 2026-07-11

First complete, scoped release — see [ROADMAP.md](ROADMAP.md).

### Changed

- Scoped the module down to four actions — Play, Stop, Record, Add Marker — as the complete v1.0 feature set. Broader MIDI Remote API coverage (Mixer control, extended transport, extended markers, track/selection, control room) is deferred to a future full-API implementation pass; see the [2026-07-11 scope-trim design spec](docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md) for the full rationale.

### Added

- Action: Add Marker (new since 0.1.0, carried over from the since-trimmed Phase 3 Markers work).
- All four actions (Play, Stop, Record, Add Marker) verified against a real Cubase 15 instance.

### Removed

- Actions: Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward, Next Marker, Previous Marker, To Marker 1-9, Toggle Mute, Toggle Solo, Volume Up, Volume Down, Pan Left, Pan Right.
- Feedbacks: Cycle Active, Click Active, Mute Active, Solo Active, Selected Channel Name.
- Mixer channel control entirely (`mixerState.ts`, MIDI channel 13 protocol, SysEx channel-name feedback).

## [0.1.0] - 2026-07-08

Phase 1: Transport. First working slice — see [ROADMAP.md](ROADMAP.md).

### Added

- Companion module (`companion-module-cubase`) built on `@companion-module/base` + `@julusian/midi`:
  - Actions: Play, Stop, Record, Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward.
  - Feedbacks: Playing, Recording, Stopped, Cycle Active, Click Active, Cubase Connected.
  - Presets pairing each action with its matching feedback.
  - MIDI In/Out port configuration.
  - Heartbeat-based connection status detection (both connect and disconnect).
- Cubase MIDI Remote driver script (`cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`) binding Cubase's transport to the same MIDI note-number contract.
- Fixed MIDI protocol contract on channel 16 (see [ADR-004](docs/adr/ADR-004-fixed-midi-note-contract.md)).
- 42 unit tests covering the pure protocol/state-machine logic (MIDI encode/decode, transport state reducer, connection heartbeat-timeout state machine, actions, feedbacks, and the real `MidiConnection` class's timer behavior).
- Full documentation set: PRD, ARCHITECTURE, ADRs, ROADMAP, CONTRIBUTING, BUILD, DEPLOYMENT.

### Known issues

- Not yet verified against a real Cubase instance, real MIDI hardware, or a real Companion runtime — see [README.md](README.md#known-limitations).
- The Cubase-side script's Return-to-Zero binding uses an unconfirmed Cubase key-command name.
