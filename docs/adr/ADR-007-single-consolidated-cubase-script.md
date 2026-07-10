# ADR-007: One consolidated Cubase script for the whole project, per-phase channels within it

**Status:** Accepted (2026-07-09)
**Supersedes:** [ADR-006](ADR-006-channel-per-phase-script.md)

## Context

ADR-006 gave each phase its own Cubase MIDI Remote script (its own `makeDeviceDriver` call), sharing one MIDI port pair across scripts to avoid asking the user to wire up a new virtual MIDI port per phase. Live verification of Phase 3 (Markers) against real Cubase 15 found this doesn't work: Cubase's Studio Setup > MIDI Remote will not bind two separate controllers to the same port pair. Once one script claims a port, that port disappears from the selection list for any other controller — confirmed as a hard restriction in Cubase's own controller-management UI, not a bug in either script or in `MidiConnection`. See the [Markers design spec](../superpowers/specs/2026-07-09-cubase-companion-markers-design.md)'s 2026-07-09 amendment for the live-testing detail.

The project owner also pointed out that this is not how MIDI controllers normally work in the first place: a real (or virtual) controller is typically one device, one script, one port — not several independent scripts contending for the same port.

## Decision

One Cubase MIDI Remote script for the entire project — `cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js` — registered as a single device driver (`makeDeviceDriver('CubaseCompanion', 'Companion', 'companion-module-cubase')`) bound to one MIDI port pair. Every phase's buttons, bindings, and feedback live in this one file.

ADR-006's per-phase **channel** convention is kept: each phase still gets its own dedicated MIDI channel (Transport=15, Markers=14, and so on for future phases), with note numbering starting fresh at 0 within that channel. This still keeps each phase's *protocol* self-contained even though the *script* no longer is — a later phase's note-map documentation still doesn't need to cross-reference what earlier phases claimed. What's dropped is only the one-script-per-phase split; a single script author can trivially avoid channel collisions by hand, which is what made this safe to consolidate.

On the Companion side, nothing changes: `MidiConnection` was already built around one connection with a channel-aware `sendTrigger(channel, note)` (added for exactly this convention, per ADR-006), so `protocol.ts`, `connection.ts`, `actions.ts`, and `presets.ts` needed zero changes for this ADR.

## Consequences

- **Gained:** matches how MIDI controllers are normally set up (one device, one port), eliminates the port-contention failure mode entirely, and removes the need for a second virtual MIDI port per phase.
- **Given up:** the file-level independence ADR-006 gained — `CubaseCompanion.js` will grow as more phases are added, and a change to one phase's bindings means editing the same file every other phase lives in, rather than an isolated per-phase file. Mitigated by keeping the per-channel section boundaries clearly commented within the file, and by the fact that this file has no build step or test harness to break across phases anyway (see [ARCHITECTURE.md](../../ARCHITECTURE.md)) — the risk is readability/mergeability, not correctness.
- The two prior scripts (`CubaseCompanion_Transport.js`, `CubaseCompanion_Markers.js`) and their per-phase folders are retired; their content is merged into `CubaseCompanion.js`. The setup docs (`docs/cubase-companion-transport-setup.md`, `docs/cubase-companion-markers-setup.md`) are consolidated into one setup doc to match.
