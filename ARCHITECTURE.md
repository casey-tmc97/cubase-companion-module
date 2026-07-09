# Architecture

## System Overview

**Goals**
- Control Cubase's transport from Companion/Stream Deck with live two-way feedback.
- Avoid depending on Cubase iC Pro's undocumented network protocol.
- Establish an architecture Phase 2+ (Mixer, Markers, Track/Macros, Control Room) can extend without redesign.

**Constraints**
- Cubase's MIDI Remote API (12+) only exposes what its scripting layer exposes — not the full iC Pro feature set.
- No public spec exists for a Companion↔Cubase protocol, so this project defines its own small, fixed MIDI note-number contract instead of conforming to one.
- The Cubase-side script runs inside Cubase's embedded ES5 JavaScript engine — no npm packages, no TypeScript, no test runner available to it.

**Risks**
- The Cubase-side script cannot be automatically tested (no live Cubase in CI or in this dev environment) — see [DEPLOYMENT.md](DEPLOYMENT.md) for the manual verification this requires.
- One binding (`Return to Zero`, via `makeCommandBinding`) uses a Cubase key-command name not confirmed against a real installation.
- Real installed library versions (`@companion-module/base`, `@julusian/midi`) can diverge from whatever documentation/training data informed the original design — this already happened three times during implementation (see [docs/adr/](docs/adr/) and `.superpowers/sdd/` task reports for the specifics) and was caught by verifying against installed package sources, not by trusting assumptions.

**Assumptions**
- The user has a virtual or network MIDI port pair already available (loopMIDI locally, or rtpMIDI/AppleMIDI across machines) — first-time virtual MIDI driver setup is out of scope.
- Cubase 12+ is running with the MIDI Remote script loaded and active.

## Architecture Diagram

### Component diagram

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│   Bitfocus Companion         │         │   Cubase                      │
│                               │         │                                │
│  ┌─────────────────────────┐ │         │  ┌──────────────────────────┐  │
│  │ companion-module-cubase │ │         │  │ MIDI Remote script        │  │
│  │  - actions.ts            │ │         │  │ CubaseCompanion_Transport │  │
│  │  - feedbacks.ts          │ │         │  │  .js                      │  │
│  │  - presets.ts            │ │         │  │  - transport bindings     │  │
│  │  - main.ts (lifecycle)   │ │         │  │  - heartbeat (mOnIdle)    │  │
│  │  - midi/connection.ts    │◄┼─MIDI────┼─►│  - mMidiBinding per note   │  │
│  │  - midi/protocol.ts      │ │  port   │  └──────────────────────────┘  │
│  │  - midi/transportState.ts│ │  pair   │                                │
│  │  - midi/connectionState  │ │         │                                │
│  └─────────────────────────┘ │         │                                │
└─────────────────────────────┘         └──────────────────────────────┘
```

### Data flow diagram

```
Button press (Companion UI)
   │
   ▼
actions.ts callback ──► MidiConnection.sendTrigger(note) ──► Note On + Note Off over MIDI Out
                                                                        │
                                                                        ▼
                                                    Cubase script's mMidiBinding (bound to that note)
                                                                        │
                                                                        ▼
                                                        page.makeValueBinding → real Cubase transport action

Cubase transport state changes (either from the script's own binding or Cubase's UI)
   │
   ▼
Script's mMidiBinding (bidirectional: setInputPort + setOutputPort) sends Note On/Off state ──► MIDI In
                                                                                                    │
                                                                                                    ▼
                                                                          MidiConnection.handleMessage()
                                                                            ├─ Heartbeat note → ConnectionState
                                                                            └─ other state notes → transportState reducer
                                                                                                    │
                                                                                                    ▼
                                                                          emits 'stateChanged' ──► main.ts calls
                                                                                                    checkAllFeedbacks()
                                                                                                    │
                                                                                                    ▼
                                                                          feedbacks.ts callbacks read the new state ──►
                                                                          Companion button re-renders
```

### Deployment diagram

```
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ Machine A                      │        │ Machine B (or same as A)      │
│                                 │        │                                │
│  Bitfocus Companion process     │        │  Cubase process                │
│    └─ companion-module-cubase   │        │    └─ MIDI Remote script       │
│         (Node.js, native        │        │         (embedded ES5 engine)  │
│          @julusian/midi binding)│        │                                │
│                                 │        │                                │
│  Virtual/network MIDI port      │◄──────►│  Virtual/network MIDI port     │
│  (loopMIDI if A=B,              │        │  (same driver, other side)     │
│   rtpMIDI/AppleMIDI if A≠B)     │        │                                │
└───────────────────────────────┘        └───────────────────────────────┘
```

Same-machine and cross-machine topology use identical code on both sides — neither half is aware of which case it's in, since both just open a named MIDI port via the OS.

## MIDI protocol (the informal contract between the two halves)

Fixed on MIDI channel 16 (zero-indexed 15), defined in `companion-module-cubase/src/midi/protocol.ts` and mirrored by convention (not shared code) in the Cubase-side script:

| Function | Note # | Direction |
|---|---|---|
| Play | 0 | both (trigger + state) |
| Stop | 1 | Companion→Cubase |
| Record | 2 | both |
| Return to Zero | 3 | Companion→Cubase |
| Cycle | 4 | both |
| Click | 5 | both |
| Rewind | 6 | Companion→Cubase |
| Forward | 7 | Companion→Cubase |
| Heartbeat | 9 | Cubase→Companion, ~every 2s |

Full rationale for this design in [docs/adr/ADR-004-fixed-midi-note-contract.md](docs/adr/ADR-004-fixed-midi-note-contract.md).

## Folder Structure

```
Cubase Companion Module/
├── README.md
├── PRD.md
├── ARCHITECTURE.md
├── ROADMAP.md
├── CONTRIBUTING.md
├── BUILD.md
├── DEPLOYMENT.md
├── CHANGELOG.md
├── LICENSE
├── docs/
│   ├── adr/                                  # Architecture Decision Records
│   ├── cubase-companion-transport-setup.md   # detailed manual verification checklist
│   └── superpowers/
│       ├── specs/                            # brainstorming-phase design docs
│       └── plans/                            # implementation plans (task-by-task)
├── companion-module-cubase/                  # the Companion module (npm package)
│   ├── companion/                            # Companion manifest + HELP.md
│   ├── src/
│   │   ├── main.ts                           # ModuleInstance — lifecycle wiring
│   │   ├── config.ts                         # MIDI port config fields
│   │   ├── actions.ts / feedbacks.ts / presets.ts
│   │   ├── upgrades.ts
│   │   └── midi/
│   │       ├── protocol.ts                   # pure: note/channel constants, encode/decode
│   │       ├── transportState.ts             # pure: transport state reducer
│   │       ├── connectionState.ts            # pure: heartbeat timeout state machine
│   │       ├── ports.ts                      # thin: list real MIDI port names
│   │       └── connection.ts                 # thin: real MIDI I/O, wires the pure modules together
│   └── test/                                 # Vitest unit tests (42 tests, pure-logic modules only)
└── cubase-midi-remote/
    └── Local/CubaseCompanion/Transport/
        └── CubaseCompanion_Transport.js       # the Cubase-side MIDI Remote driver script
```

**Design principle behind the `midi/` split:** pure logic (`protocol.ts`, `transportState.ts`, `connectionState.ts`) is fully unit-tested and has no I/O. Thin adapters (`ports.ts`, `connection.ts`) own real `@julusian/midi` hardware access and are deliberately not unit-tested — they're covered by manual verification instead, per [DEPLOYMENT.md](DEPLOYMENT.md).
