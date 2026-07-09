# Build Instructions

This covers building `companion-module-cubase` (the Companion module) from source. The Cubase-side script (`cubase-midi-remote/`) is plain JavaScript with no build step — see [DEPLOYMENT.md](DEPLOYMENT.md) for how to install it.

## Prerequisites

- Node.js >= 18 (see `companion-module-cubase/package.json`'s `engines` field)
- npm

## Build

```bash
cd companion-module-cubase
npm install
npm run build
```

This runs `rimraf dist && tsc -p tsconfig.build.json`, producing compiled JavaScript under `companion-module-cubase/dist/`, with `dist/main.js` as the entrypoint (matching `companion/manifest.json`'s `runtime.entrypoint`).

## Test

```bash
cd companion-module-cubase
npm test
```

Runs the Vitest suite (42 tests as of Phase 1: MIDI protocol encode/decode, transport state reducer, connection heartbeat-timeout state machine, actions, feedbacks, and the real `MidiConnection` class's timer behavior via mocked MIDI ports). See [ARCHITECTURE.md](ARCHITECTURE.md) for which modules are unit-tested and why some (real MIDI I/O, the module lifecycle, the Cubase script) deliberately aren't.

Watch mode: `npm run test:watch`.

## Typecheck

```bash
cd companion-module-cubase
npx tsc -p tsconfig.build.json --noEmit   # source only
npx tsc -p tsconfig.json --noEmit         # source + tests
```

## Full verification (what CI would run, if this project had CI)

```bash
cd companion-module-cubase
npm install
npx tsc -p tsconfig.json --noEmit
npm test
npm run build
```

All four steps should complete with no errors before considering a change done.
