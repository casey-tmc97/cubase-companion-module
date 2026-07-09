# Cubase Companion Module

Control Steinberg Cubase's transport from [Bitfocus Companion](https://bitfocus.io/companion) / Stream Deck, with live two-way feedback, via Cubase's official MIDI Remote API — no reverse-engineering, no undocumented protocol.

**Status:** Phase 1 (Transport) implemented and unit-tested. **Not yet verified against a real Cubase instance** — see [Known Limitations](#known-limitations) below.

## What this is

Two independent pieces connected by a plain MIDI port pair:

```
Companion (companion-module-cubase)  <--MIDI-->  virtual/network MIDI port  <--MIDI-->  Cubase (MIDI Remote script)
```

- **`companion-module-cubase/`** — a Bitfocus Companion module (TypeScript, `@companion-module/base` + `@julusian/midi`) with named actions, presets, and feedbacks for Play, Stop, Record, Return to Zero, Cycle, Click, Rewind, and Forward.
- **`cubase-midi-remote/`** — a JavaScript driver script for Cubase's documented MIDI Remote API (12+), placed in Cubase's Driver Scripts folder.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the two halves talk to each other, and [DEPLOYMENT.md](DEPLOYMENT.md) for how to install and run it.

## Why this exists instead of using Cubase iC Pro's protocol

Cubase iC Pro talks to Cubase over an undocumented protocol (via the "Steinberg SKI Remote" extension). Building against it would mean reverse-engineering captured network traffic. This project uses Cubase's officially documented MIDI Remote API instead — see [docs/adr/ADR-001-midi-remote-api-over-ski-remote.md](docs/adr/ADR-001-midi-remote-api-over-ski-remote.md) for the full reasoning.

## Documentation

- [PRD.md](PRD.md) — what this is, who it's for, what it does
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, folder structure
- [docs/adr/](docs/adr/) — why the major decisions were made
- [ROADMAP.md](ROADMAP.md) — what's done, what's next
- [BUILD.md](BUILD.md) — building the Companion module from source
- [DEPLOYMENT.md](DEPLOYMENT.md) — installing and running it against real Cubase
- [CONTRIBUTING.md](CONTRIBUTING.md) — this is a personal project; read before sending changes anyway
- [CHANGELOG.md](CHANGELOG.md) — version history

## Known Limitations

This has been built and unit-tested (42/42 tests passing, clean TypeScript build) entirely in a sandboxed dev environment with **no live Cubase instance, no real MIDI hardware, and no virtual MIDI driver available**. Everything beyond `npm run build` / `npm test` / `tsc --noEmit` is unverified. Before relying on this:

1. Walk through [DEPLOYMENT.md](DEPLOYMENT.md)'s verification checklist against a real Cubase 15 install.
2. In particular, the Cubase-side script's Return-to-Zero binding (`page.makeCommandBinding(..., 'Transport', 'Return to Zero')`) uses a Cubase key-command name that hasn't been confirmed against a real Cubase Key Commands dialog — check it, and fix the category/name if it doesn't match your version.

## License

MIT — see [LICENSE](LICENSE).
