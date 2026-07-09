# Product Requirements Document

## Application Name

Cubase Companion Module (`companion-module-cubase`)

## Project Type

Plugin — a Bitfocus Companion module, paired with a companion Cubase MIDI Remote API script.

## Purpose

Let Bitfocus Companion (and therefore Stream Deck / other button surfaces) control and reflect Steinberg Cubase's state — starting with the transport (Play, Stop, Record, Return to Zero, Cycle, Click, Rewind, Forward) — with live two-way feedback, without depending on Cubase iC Pro's undocumented network protocol.

## Target Users

Personal use: the project owner, running Cubase and Companion (same machine or across two machines on a local network) for their own music production / streaming setup. Not currently intended for public distribution, though the module is built as a proper named module (not a one-off script) so that could change later without a rewrite.

## Primary Features

1. **Transport control** — Play, Stop, Record, Return to Zero, Rewind, Forward as named Companion actions.
2. **Toggle control with feedback** — Cycle (loop) and Click (metronome) as toggle actions whose Companion buttons reflect Cubase's actual current state.
3. **Live state feedback** — Playing, Recording, Stopped, Cycle Active, Click Active feedbacks that update the instant Cubase's state changes, in either direction (button press or Cubase's own transport bar).
4. **Connection status** — a "Cubase Connected" feedback driven by a heartbeat, so a stale/disconnected bridge is visible rather than silently stuck.
5. **Ready-made presets** — one preset per action, pre-wired to its matching feedback, so setup doesn't require hand-configuring raw MIDI note numbers.

## Non-Functional Requirements

- **Performance:** No formal budget. Actions/feedbacks should feel instantaneous (sub-100ms) for a live-performance control surface; there is no heavy computation anywhere in the path.
- **Security:** Local-trust model. This is a local MIDI bridge between two applications on a trusted local network or single machine — no authentication, no encryption, no exposed network service beyond whatever MIDI transport (loopMIDI/rtpMIDI) the user already runs.
- **Scalability:** N/A — single user, single Cubase instance, single Companion instance. Not designed for multi-tenant or multi-instance use.
- **Offline Support:** Fully offline. No internet connectivity is used or required anywhere in this system.
- **Accessibility:** Delegated to Bitfocus Companion's own UI, which this module plugs into. No custom UI is built by this project.
- **Cross Platform:** Developed and primarily used on Windows. `@julusian/midi` (the MIDI library used) supports macOS and Linux as well, so nothing in the architecture is Windows-only, but macOS/Linux have not been tested.

## Out of Scope (Future Phases)

Four additional feature areas were identified during design but are explicitly out of scope for the current implementation, each planned as its own future spec → plan → implementation cycle, reusing this project's architecture:

- Mixer channel control (mute, solo, fader volume, pan)
- Markers & locators (cycle markers, punch in/out, named markers)
- Track/selection & macros (track select, key command/macro triggers, record-arm)
- Control room operations

See [ROADMAP.md](ROADMAP.md) for status.

## Success Criteria

- Companion actions fire the correct Cubase transport command every time.
- Companion feedbacks reflect Cubase's actual current state, both on button press and when Cubase's own UI changes state.
- Losing the connection to Cubase (quit, script unloaded) is visibly reflected within ~5 seconds, not silently stuck at the last-known state.
- Works whether Companion and Cubase run on the same machine or on separate machines on the same network.
