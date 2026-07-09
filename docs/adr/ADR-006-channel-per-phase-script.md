# ADR-006: Dedicated MIDI channel per phase script

**Status:** Accepted (2026-07-09)

## Context

Phase 1 (Transport) established one Cubase MIDI Remote script on one dedicated
MIDI channel (16, zero-indexed 15). Phase 3 (Markers) is the first phase to add
a second, independent script ([ADR-003](ADR-003-phased-delivery-transport-first.md)
already called for one script per phase, a project owner preference). Both
scripts need to share the same underlying MIDI port pair, since asking the user
to wire up a new virtual MIDI port for every phase doesn't scale.

## Decision

Each phase's Cubase script gets its **own dedicated MIDI channel**, with its own
note numbering starting fresh at 0 — not a continuation of whatever notes earlier
phases already claimed on a shared channel. Markers uses channel 15 (zero-indexed
14); later phases (Mixer, Track/Macros, Control Room) claim their own channel the
same way when they're built.

## Consequences

- **Gained:** every phase script's protocol is fully self-contained. A later
  phase's script (and its note-map documentation) can be read and reasoned about
  without cross-referencing what earlier phases already claimed on the same
  channel — there's no shared note-numbering ledger to keep in sync across
  phases, unlike [ADR-004](ADR-004-fixed-midi-note-contract.md)'s single-channel
  Transport note map, which does require that bookkeeping within Transport itself.
- **Given up:** MIDI channels are a limited resource (16 total, one already used
  by Transport, one by Markers). At 14 channels remaining and one phase per
  channel, this comfortably covers the remaining four planned phases (Mixer,
  Track/Macros, Control Room, plus one spare) without needing multi-channel
  phases — but a phase requiring more scope than a single 128-note channel can
  hold, or more phases than channels remain, would need to revisit this.
- `MidiConnection.sendTrigger` (`companion-module-cubase/src/midi/connection.ts`)
  takes an explicit `channel` argument for exactly this reason — one shared
  connection, multiple phase-specific channels.
