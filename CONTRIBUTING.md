# Contributing

This is a personal project (see [PRD.md](PRD.md) — target users: personal use only, not currently published). There's no public issue tracker or external contributor process. This file exists mainly as a note-to-self for working on it consistently across sessions.

## Working process

This project was built using Claude Code's [superpowers](https://github.com/obra/superpowers)-style workflow: brainstorm → design spec → implementation plan → task-by-task implementation with review. Each phase (see [ROADMAP.md](ROADMAP.md)) should follow the same pattern:

1. Brainstorm the phase's design, producing a spec under `docs/superpowers/specs/`.
2. Turn the approved spec into an implementation plan under `docs/superpowers/plans/`.
3. Implement task-by-task, with a fresh review after each task.
4. Update [CHANGELOG.md](CHANGELOG.md), and this project's other docs (ARCHITECTURE.md, ROADMAP.md, and a new ADR under `docs/adr/` for any new significant decision) as part of finishing the phase, not as an afterthought.

## Before trusting a library's API

Three real bugs during Phase 1 came from trusting documentation/training knowledge about `@companion-module/base` and `@julusian/midi` instead of the actually-installed package versions (see `.superpowers/sdd/task-7-report.md`, `task-8-report.md`, `task-9-report.md`, and [ADR entries](docs/adr/) for specifics). Before writing code against either library, check `node_modules/@companion-module/base` or `node_modules/@julusian/midi`'s actual `.d.ts`/source directly — don't assume a remembered API shape is still current.

## Code organization

- Keep pure logic (no I/O) separate from thin I/O adapters, and unit-test the pure logic thoroughly. See `companion-module-cubase/src/midi/`'s split (`protocol.ts`/`transportState.ts`/`connectionState.ts` vs. `ports.ts`/`connection.ts`) as the pattern to follow.
- The Cubase-side script (`cubase-midi-remote/`) cannot be unit-tested — it only runs inside Cubase's embedded engine. Changes to it need manual verification against real Cubase (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Testing

Run the Companion module's test suite before committing any change under `companion-module-cubase/`:

```bash
cd companion-module-cubase
npm test
npx tsc -p tsconfig.build.json --noEmit
```

There's no formal coverage target — the goal is that every pure-logic module (protocol, state reducers, state machines) is thoroughly tested, not a percentage.

## License

By contributing (if this project's scope ever expands beyond personal use), you agree your contributions are licensed under this project's [MIT license](LICENSE).
