# Product Requirements Document

## Application Name

Cubase Companion Module (`companion-module-cubase`)

## Project Type

Plugin — a Bitfocus Companion module, paired with a companion Cubase MIDI Remote API script.

## Purpose

Let Bitfocus Companion (and therefore Stream Deck / other button surfaces) control and reflect Steinberg Cubase's state — Play, Stop, Record, and Add Marker — with live two-way feedback, without depending on Cubase iC Pro's undocumented network protocol.

## Target Users

Personal use: the project owner, running Cubase and Companion (same machine or across two machines on a local network) for their own music production / streaming setup. Not currently intended for public distribution, though the module is built as a proper named module (not a one-off script) so that could change later without a rewrite.

## Primary Features

1. **Transport control** — Play, Stop, Record as named Companion actions.
2. **Marker control** — Add Marker as a named Companion action.
3. **Live state feedback** — Playing, Recording, Stopped feedbacks that update the instant Cubase's state changes, in either direction (button press or Cubase's own transport bar).
4. **Connection status** — a "Cubase Connected" feedback driven by a heartbeat, so a stale/disconnected bridge is visible rather than silently stuck.
5. **Ready-made presets** — one preset per action, pre-wired to its matching feedback where applicable, so setup doesn't require hand-configuring raw MIDI note numbers.

## Non-Functional Requirements

- **Performance:** No formal budget. Actions/feedbacks should feel instantaneous (sub-100ms) for a live-performance control surface; there is no heavy computation anywhere in the path.
- **Security:** Local-trust model. This is a local MIDI bridge between two applications on a trusted local network or single machine — no authentication, no encryption, no exposed network service beyond whatever MIDI transport (loopMIDI/rtpMIDI) the user already runs.
- **Scalability:** N/A — single user, single Cubase instance, single Companion instance. Not designed for multi-tenant or multi-instance use.
- **Offline Support:** Fully offline. No internet connectivity is used or required anywhere in this system.
- **Accessibility:** Delegated to Bitfocus Companion's own UI, which this module plugs into. No custom UI is built by this project.
- **Cross Platform:** Developed and primarily used on Windows. `@julusian/midi` (the MIDI library used) supports macOS and Linux as well, so nothing in the architecture is Windows-only, but macOS/Linux have not been tested.

## Out of Scope (Future Phases)

This v1.0 release intentionally covers only Play, Stop, Record, and Add Marker. A broader set of feature areas were built, unit-tested, and (mostly) verified live during earlier development, then deliberately trimmed back out for this release: extended transport (Return to Zero, Cycle, Click, Rewind, Forward), extended markers (Next/Previous Marker, To Marker 1-9, cycle markers, punch in/out), Mixer channel control (mute, solo, fader volume, pan), track/selection & macros, and control room operations. Each is planned as its own future spec → plan → implementation cycle when a full MIDI Remote API implementation is undertaken.

See [ROADMAP.md](ROADMAP.md) for status and the [2026-07-11 scope-trim design spec](docs/superpowers/specs/2026-07-11-cubase-companion-v1-scope-trim-design.md) for why this was trimmed back after already being built.

## Success Criteria

- Companion actions fire the correct Cubase transport command every time.
- Companion feedbacks reflect Cubase's actual current state, both on button press and when Cubase's own UI changes state.
- Losing the connection to Cubase (quit, script unloaded) is visibly reflected within ~5 seconds, not silently stuck at the last-known state.
- Works whether Companion and Cubase run on the same machine or on separate machines on the same network.
