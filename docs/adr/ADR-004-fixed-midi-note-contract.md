# ADR-004: Define a fixed MIDI note-number contract on a dedicated channel

**Status:** Accepted (2026-07-08)

## Context

Since there's no public spec for a Companion↔Cubase protocol (see [ADR-001](ADR-001-midi-remote-api-over-ski-remote.md)), the two halves of this system — the Companion module and the Cubase MIDI Remote script — need some agreed-upon convention for what MIDI messages mean. They're written in different languages, run in different processes, and share no code, so the contract exists only "by convention": each side's constants must be kept in sync by hand.

## Decision

Define a small, fixed note-number map on **MIDI channel 16** (zero-indexed 15, chosen to avoid colliding with real instrument channels a user might also have routed through the same virtual port):

| Function | Note # |
|---|---|
| Play (trigger) | 0 |
| Stop (trigger) | 1 |
| Record (trigger) | 2 |
| Return to Zero (trigger) | 3 |
| Cycle (trigger) | 4 |
| Click (trigger) | 5 |
| Rewind (hold: Note On = start, Note Off = stop) | 6 |
| Forward (hold: Note On = start, Note Off = stop) | 7 |
| Heartbeat | 9 |
| Play state (feedback) | 10 |
| Record state (feedback) | 11 |
| Cycle state (feedback) | 12 |
| Click state (feedback) | 13 |

Trigger notes (Companion→Cubase) are momentary Note On + Note Off pairs, except Stop (Note On only — see below) and Rewind/Forward (Note On on press, Note Off on release, for genuine hold behavior). A dedicated Heartbeat note pulses every ~2s so a "Cubase Connected" feedback can detect a dropped connection.

**Amendment (2026-07-09):** state feedback for Play/Record/Cycle/Click originally shared the same note as its trigger (bidirectional, velocity 127 = on / 0 = off, sent both on change and once on script activation). In practice this broke Record/Cycle/Click: the Cubase script's own `midiOutput.sendMidi()` feedback call looped back, over the same shared loopMIDI port, into the *same script's own* `mMidiBinding` input for that note — Cubase's engine re-ingested its own feedback as a fresh button press and re-triggered `.setTypeToggle()`, causing the toggle to flip back off a few milliseconds after every real press. Confirmed by tracing the raw value seen by `mOnProcessValueChange` directly over MIDI (Cubase's own script console could not be located in this install). Play appeared unaffected only because `mStart` has no real "write 0 to stop playback" semantics, making it incidentally immune. State feedback now uses the dedicated notes 10–13 (see table above) so the Cubase script's own output can never match what its own input binding listens for. `TransportState.applyStateNote` only recognizes the *State notes; the original trigger notes (0, 2, 4, 5) no longer carry any state meaning, even though they're still used one-way as triggers.

Also amended: `sendTrigger()` (`companion-module-cubase/src/midi/connection.ts`) delays its Note Off by `TRIGGER_HOLD_MS` (40ms) instead of sending it back-to-back with zero gap, giving Cubase's toggle handling a more realistic press-hold-release shape. And `Stop` sends Note On only (no Note Off) — `mStop` is a plain, non-toggle value binding where every write invokes the command, so the old Note On + Note Off pair fired Stop twice in the same instant, which Cubase's native "press Stop while already stopped → return to start" behavior interpreted as a real double-press.

## Consequences

- **Gained:** a protocol simple enough to implement correctly on both the TypeScript side (`companion-module-cubase/src/midi/protocol.ts`, fully unit-tested) and the ES5 JavaScript side (`cubase-midi-remote/.../CubaseCompanion_Transport.js`, which cannot be unit-tested at all — see [ARCHITECTURE.md](../../ARCHITECTURE.md)).
- **Risk accepted:** the two sides can drift out of sync since nothing enforces the contract at compile time across the language/process boundary. Mitigated by keeping the note map small and documenting it in three places (this ADR, `protocol.ts`'s constants, and the Cubase script's constants) rather than relying on memory.
- Note 8 is deliberately skipped (no assigned function) as a small buffer; notes 14+ are free for future phases to extend into before a second channel is needed.
