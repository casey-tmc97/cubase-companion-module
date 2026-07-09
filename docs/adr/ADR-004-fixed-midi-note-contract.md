# ADR-004: Define a fixed MIDI note-number contract on a dedicated channel

**Status:** Accepted (2026-07-08)

## Context

Since there's no public spec for a Companion↔Cubase protocol (see [ADR-001](ADR-001-midi-remote-api-over-ski-remote.md)), the two halves of this system — the Companion module and the Cubase MIDI Remote script — need some agreed-upon convention for what MIDI messages mean. They're written in different languages, run in different processes, and share no code, so the contract exists only "by convention": each side's constants must be kept in sync by hand.

## Decision

Define a small, fixed note-number map on **MIDI channel 16** (zero-indexed 15, chosen to avoid colliding with real instrument channels a user might also have routed through the same virtual port):

| Function | Note # |
|---|---|
| Play | 0 |
| Stop | 1 |
| Record | 2 |
| Return to Zero | 3 |
| Cycle | 4 |
| Click | 5 |
| Rewind | 6 |
| Forward | 7 |
| Heartbeat | 9 |

Trigger notes (Companion→Cubase) are momentary Note On + Note Off pairs. State notes (bidirectional: Play, Record, Cycle, Click) use velocity 127 = on / 0 = off, sent both on change and once on script activation so Companion syncs to Cubase's actual current state immediately. A dedicated Heartbeat note pulses every ~2s so a "Cubase Connected" feedback can detect a dropped connection.

## Consequences

- **Gained:** a protocol simple enough to implement correctly on both the TypeScript side (`companion-module-cubase/src/midi/protocol.ts`, fully unit-tested) and the ES5 JavaScript side (`cubase-midi-remote/.../CubaseCompanion_Transport.js`, which cannot be unit-tested at all — see [ARCHITECTURE.md](../../ARCHITECTURE.md)).
- **Risk accepted:** the two sides can drift out of sync since nothing enforces the contract at compile time across the language/process boundary. Mitigated by keeping the note map small and documenting it in three places (this ADR, `protocol.ts`'s constants, and the Cubase script's constants) rather than relying on memory.
- Note 8 is deliberately skipped (no assigned function) as a small buffer; notes 10+ are free for future phases to extend into before a second channel is needed.
