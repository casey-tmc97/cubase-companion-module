# Cubase Companion Module — Transport (Phase 1) Design

**Date:** 2026-07-08
**Status:** Approved, ready for implementation planning

## Goal

Let Bitfocus Companion (and therefore Stream Deck / button surfaces) control and reflect Steinberg Cubase's transport — Play, Stop, Record, Return to Zero, Cycle, Click, Rewind, Forward — with live two-way feedback, as the first working slice of a larger Cubase control surface.

## Background

The original ask was to control Cubase "the way Cubase iC uses it," via the Steinberg SKI Remote. Research established:

- **SKI Remote** is a real, official Steinberg extension that lets the Cubase iC Pro mobile app discover and control Cubase over Wi-Fi (via Bonjour/mDNS for discovery). It runs on the Cubase machine and appears as an addable device in Cubase's Devices menu.
- **Its wire protocol is not publicly documented.** No spec, SDK, or API reference exists. This is corroborated by [bitfocus/companion-module-requests#724](https://github.com/bitfocus/companion-module-requests/issues/724), a standing request for a Cubase Companion module that has stalled specifically for lack of documentation. Building against it would mean reverse-engineering captured network traffic — fragile, and could break silently on any Steinberg update.
- **Cubase 12+ ships an official, documented MIDI Remote API** — a JavaScript scripting layer that receives MIDI over a virtual port and maps it to real Cubase actions (transport, track/channel select, mixer parameters, etc.). It doesn't expose 100% of what iC Pro does, but it's stable, supported, and needs zero reverse-engineering.

Decision: build on the **MIDI Remote API**, not SKI Remote. See [decision log](#decision-log) for how this and other choices were made.

## Scope

The full control surface spans five feature areas the user wants eventually: **Transport**, **Mixer channel control**, **Markers & locators**, **Track/selection & macros**, and **Control room operations**. That's too much for one spec, so the work is phased — each area gets its own spec → plan → implementation cycle, reusing the architecture this document establishes.

**This spec covers Phase 1: Transport only.** It is the proving ground for the whole architecture (Companion module ↔ virtual MIDI ↔ Cubase MIDI Remote script, with live feedback). Mixer, Markers, Track/Macros, and Control Room are explicitly out of scope here and will extend the same pattern in later specs.

**Target Cubase version:** Cubase 15 (current release) is the primary target. The MIDI Remote API requires Cubase 12+; nothing in this design intentionally uses a 15-only API, but no compatibility testing against 12–14 is planned for Phase 1.

**Topology:** Must work both with Companion and Cubase on the same machine, and with Companion running on a separate machine/Stream Deck host on the network. The user already has a virtual MIDI driver installed, so first-time virtual MIDI setup (e.g. installing loopMIDI) is out of scope for this phase — the design just needs to work against whatever MIDI port pair the user points it at, whether that's a local loopback (loopMIDI) or a network MIDI link (rtpMIDI/AppleMIDI).

## Architecture

Two independent pieces, connected by a plain OS-level MIDI port — no custom networking code in either half:

```
Companion (custom module)  <--MIDI-->  [virtual/network MIDI port pair]  <--MIDI-->  Cubase 15 (MIDI Remote script)
```

- **Cubase side**: a JavaScript file dropped into Cubase's MIDI Remote Scripts folder. Cubase's MIDI Remote API (12+) loads it automatically and it shows up as an addable controller under Studio → Studio Setup → MIDI Remote.
- **Companion side**: a new Companion module, `companion-module-cubase`, built on `@companion-module/base` + `@julusian/midi` — the same MIDI library the official bundled Generic MIDI module uses.
- **The bridge**: whatever virtual or network MIDI port pair the user has set up (loopMIDI locally, rtpMIDI/AppleMIDI across machines). Neither side needs to know which — both just open a named MIDI in/out port via the OS. This is why same-machine vs. different-machine topology needs no separate code path.

### Why a dedicated custom module instead of the existing Generic MIDI module

Companion already ships an official `bitfocus/companion-module-generic-midi` module that can send arbitrary Note/CC messages to any MIDI port and has feedbacks driven by incoming MIDI values. The Companion side of this project could technically be built with zero custom code by pointing Generic MIDI at the virtual port and hand-configuring raw note numbers.

That path was rejected in favor of a dedicated module: Generic MIDI would surface actions as "Send Note 60" rather than "Play," require hand-configuring every button's note number and colors, and wouldn't be reusable/shareable as a proper named module. The dedicated `companion-module-cubase` costs more code up front but matches the original goal and gives named actions, ready-made presets, and feedbacks that already understand Cubase state.

## MIDI mapping (the informal "protocol" between the two halves)

Since there's no public spec to conform to, this defines a small fixed contract on a dedicated channel (**16**, to avoid collisions with real instrument channels) that both halves agree on:

| Function | Note # | Direction |
|---|---|---|
| Play | 0 | Companion→Cubase (trigger), Cubase→Companion (state) |
| Stop | 1 | Companion→Cubase (trigger) |
| Record | 2 | both |
| Return to Zero | 3 | Companion→Cubase (trigger) |
| Cycle toggle | 4 | both |
| Click toggle | 5 | both |
| Rewind | 6 | Companion→Cubase (trigger) |
| Forward | 7 | Companion→Cubase (trigger) |
| Heartbeat | 9 | Cubase→Companion, every ~2s |

- **Trigger notes** (Companion→Cubase): Companion sends Note On (velocity 127) immediately followed by Note Off — a momentary press, matching how a physical transport button behaves.
- **State notes** (Cubase→Companion): Cubase sends Note On velocity 127 = active/on, velocity 0 = inactive/off. Sent both on change and once immediately on script activation (`mOnActivate`), so Companion syncs to whatever state Cubase is already in rather than waiting for the next change.
- **Heartbeat**: Cubase sends a Note 9 pulse roughly every 2 seconds for as long as the MIDI Remote script is active. Companion treats the connection as live as long as heartbeats keep arriving, and as disconnected after 5 seconds of silence.

## Companion module (`companion-module-cubase`)

- **Config**: MIDI In port, MIDI Out port — dropdowns populated from `@julusian/midi`'s port list, same pattern as the bundled Generic MIDI module.
- **Actions** (named, not raw MIDI): Play, Stop, Record, Return to Zero, Toggle Cycle, Toggle Click, Rewind, Forward.
- **Feedbacks**:

  | Feedback | Type | Source | Description |
  |---|---|---|---|
  | Playing | boolean | Note 0 state from Cubase | True while Cubase transport is playing |
  | Recording | boolean | Note 2 state from Cubase | True while Cubase is recording |
  | Stopped | boolean | derived (Companion-side) | True when neither Playing nor Recording is true — computed locally, no separate note |
  | Cycle Active | boolean | Note 4 state from Cubase | True when Cycle/Loop is enabled in Cubase |
  | Click Active | boolean | Note 5 state from Cubase | True when Metronome/Click is enabled in Cubase |
  | Cubase Connected | boolean | Note 9 heartbeat | True while heartbeats arrive at least every ~2s; flips false after 5s of silence |

  Rewind and Forward intentionally have no feedback: in the MIDI Remote API these are momentary trigger bindings with no persistent lit/state value, matching the real Cubase transport bar (those buttons don't stay lit either).

- **Presets**: one preset per action, paired with its matching feedback where one exists (Play, Record, Cycle, Click), plus a standalone "Cubase Connected" preset for a status-indicator button. Sensible default icons/colors (e.g. green for active-state feedbacks).
- **Lifecycle**: open the configured MIDI in/out ports on init. If a configured port isn't found, log an error and surface the disconnected state rather than failing silently.

## Cubase MIDI Remote script

- Registers device manufacturer/model info so it's selectable under Studio → Studio Setup → MIDI Remote.
- Binds a hidden control surface to the channel-16 note map using `mDefaults` transport bindings (`getTransportPlayValue()`, `getTransportRecordValue()`, `getTransportRewindValue()`, etc.) for the standard transport functions, plus custom value bindings with an `mOnValueChange` callback for pushing feedback state back out over MIDI.
- Sends the heartbeat note (9) on a repeating ~2s timer for as long as the script is active.
- On `mOnActivate`, immediately pushes current transport/cycle/click state so Companion doesn't have to wait for a change to sync.

## Testing plan

This depends on live Cubase plus real or virtual MIDI ports, so testing here is manual, not automated:

1. Confirm the existing virtual MIDI port pair is visible to both Cubase and the Companion dev harness.
2. Load the MIDI Remote script into Cubase and add it as a controller in Studio Setup.
3. Configure the Companion module against the same port pair.
4. Walk through each action/feedback pair in both directions:
   - Press Play in Companion → Cubase transport starts, and the Companion Play button lights via the Playing feedback.
   - Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
   - Repeat for Record, Cycle, Click.
   - Fire Return to Zero, Rewind, Forward and confirm Cubase responds (no feedback expected on these).
5. Verify heartbeat/disconnect behavior: quit Cubase (or unload the script) and confirm the Companion module's "Cubase Connected" feedback flips to disconnected within ~5 seconds.

## Out of scope (follow-on phases)

Each of these gets its own spec → plan → implementation cycle later, reusing this architecture and MIDI-channel convention (extending the note map on channel 16, or introducing additional channels if the note space is exhausted):

- Mixer channel control (mute, solo, fader volume, pan per track/channel)
- Markers & locators (cycle markers, punch in/out, named markers/cue points)
- Track/selection & macros (track select, key command/macro triggers, record-arm)
- Control room operations

## Decision log

Key choices made during design, for context if they're revisited later:

- **MIDI Remote API over SKI Remote reverse-engineering** — avoids building against an undocumented, breakage-prone protocol.
- **Live two-way feedback, not one-way control** — buttons must reflect real Cubase state, not just fire commands.
- **Phased delivery, Transport first** — five feature areas is too much for one spec; Transport proves the architecture before it's extended.
- **Dedicated custom Companion module over the built-in Generic MIDI module** — matches the original ask (named actions/presets) at the cost of more code to write and maintain.
- **Both same-machine and cross-machine topology must work** — no code path assumes Companion and Cubase share a machine.
- **Virtual MIDI driver setup is out of scope** — the user already has one installed; the design only needs to consume whatever port pair is configured.
