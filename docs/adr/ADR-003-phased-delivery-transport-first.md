# ADR-003: Phase delivery, with Transport as the architecture proving ground

**Status:** Accepted (2026-07-08)

## Context

The full desired scope spans five feature areas: Transport, Mixer channel control, Markers & locators, Track/selection & macros, and Control room operations. Designing and building all five together would mean specifying five subsystems' worth of MIDI mappings, actions, and feedbacks before any of it could be tested end-to-end — a large amount of up-front design risk with no working software until the very end.

## Decision

Build in phases. Phase 1 establishes the full architecture (Companion module ↔ virtual MIDI ↔ Cubase MIDI Remote script, with live feedback) using **Transport** as the proving ground — it's the smallest feature area that still exercises every architectural piece (actions, toggle feedbacks, derived feedbacks, connection-status heartbeat). Mixer, Markers, Track/Macros, and Control Room follow as separate phases, each with its own spec → plan → implementation cycle, reusing this phase's architecture and MIDI-channel convention.

## Consequences

- **Gained:** a working, testable, end-to-end system after Phase 1 alone, and a validated architecture (MIDI bridge, note-map contract, pure/testable core vs. thin I/O adapters) that later phases can extend rather than re-derive.
- **Given up:** none of the other four feature areas exist yet. See [ROADMAP.md](../../ROADMAP.md) for their status.
- Later phases will likely need to extend the channel-16 note map (currently notes 0-9, with 8 free and 10+ unused) or introduce additional MIDI channels if the single-channel note space is exhausted — this is expected and was anticipated in the Phase 1 design, not a surprise to be solved from scratch.
