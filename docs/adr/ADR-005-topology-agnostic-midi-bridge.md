# ADR-005: Support same-machine and cross-machine topology with no protocol-level distinction

**Status:** Accepted (2026-07-08)

## Context

Companion and Cubase might run on the same computer (a local virtual MIDI cable like loopMIDI is enough) or on separate machines on a network (a Stream Deck-connected PC/Mac controlling a separate DAW machine, needing network MIDI like rtpMIDI/AppleMIDI in addition to a local virtual cable on the Cubase side). The project needed to support both without maintaining two implementations.

## Decision

Neither half of the bridge (the Companion module or the Cubase script) contains any code that distinguishes same-machine from cross-machine operation. Both sides just open a named MIDI input/output port via the OS (`@julusian/midi` on the Companion side, `midiremote_api_v1`'s `mPorts` on the Cubase side) and let whatever virtual or network MIDI driver the user has configured handle the actual transport.

## Consequences

- **Gained:** one code path for both topologies — "same machine" vs. "different machine" is purely a question of which MIDI driver the user installs and how they name the ports, not something this project's code needs to branch on.
- **Given up:** no built-in guidance or tooling for setting up loopMIDI/rtpMIDI itself — first-time virtual MIDI driver setup was explicitly scoped out of Phase 1 (the user already had one installed), so [DEPLOYMENT.md](../../DEPLOYMENT.md) assumes a working port pair exists rather than walking through installing one.
- If cross-machine latency or reliability ever becomes a problem specific to network MIDI (vs. local loopback), that would need to be revisited — no such issue is known at this time, since it hasn't yet been tested against real Cubase.
