# ADR-002: Build a dedicated Companion module instead of using the built-in Generic MIDI module

**Status:** Accepted (2026-07-08)

## Context

Companion already ships an official `bitfocus/companion-module-generic-midi` module that can send arbitrary Note/CC messages to any MIDI port (including virtual ports) and has feedbacks driven by incoming MIDI values. The entire Companion side of this project could technically be built with **zero custom module code** — just point Generic MIDI at the virtual port and hand-configure raw note-number actions/feedbacks, with all the real logic living in the Cubase-side script.

That path is faster to ship but produces a worse day-to-day experience: actions show up as "Send Note 60" instead of "Play," every button's note number and colors must be configured by hand, and it isn't a reusable/shareable named module.

## Decision

Build a dedicated `companion-module-cubase` module with named actions ("Play," "Record," …), ready-made presets, and feedbacks that already understand Cubase transport state — at the cost of more code to write and maintain than the zero-code Generic MIDI path.

## Consequences

- **Gained:** named actions/presets/feedbacks that make day-to-day setup and use much friendlier than hand-configured raw MIDI, and a module structured so it can be extended (Mixer, Markers, Track/Macros, Control Room) or eventually shared, without a rewrite.
- **Given up:** the zero-code option's speed. This decision is why Phase 1 required building `src/actions.ts`, `feedbacks.ts`, `presets.ts`, `main.ts`, and the MIDI I/O layer, rather than being done after just writing the Cubase-side script.
- Future phases (Mixer, Markers, Track/Macros, Control Room) inherit this same module rather than needing their own Generic-MIDI-vs-custom-module decision, since the module's actions/feedbacks system already exists.
