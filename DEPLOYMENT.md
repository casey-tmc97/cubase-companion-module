# Deployment Guide

"Deployment" here means installing both halves of the bridge for real use — this is a local tool, not a hosted service, so there's no server/cloud deployment involved. See [ARCHITECTURE.md](ARCHITECTURE.md) for what's being installed and why there are two separate pieces.

## Prerequisites

- Cubase 12 or later (developed against Cubase 15).
- Bitfocus Companion installed.
- A virtual or network MIDI port pair already set up (loopMIDI if Companion and Cubase run on the same machine, rtpMIDI/AppleMIDI if they run on separate machines). Setting one up for the first time is not covered here — see loopMIDI's or rtpMIDI's own documentation.
- Node.js >= 18, if building from source (see [BUILD.md](BUILD.md)).

## Install the Cubase-side script

1. Copy `cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js` into your Cubase MIDI Remote Driver Scripts folder, preserving the folder structure:
   - Windows: `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\Cubanion\Transport\`
   - macOS: `~/Documents/Steinberg/Cubase/MIDI Remote/Driver Scripts/Local/Cubanion/Transport/`
2. In Cubase: **Studio → Studio Setup → MIDI Remote**, add "Cubanion Transport" as a controller, and bind its input/output to your MIDI port pair. If Cubase's Local-script discovery doesn't pick up a new vendor/model pair on your install, see [ADR-008](docs/adr/ADR-008-reuse-transport-registration-slot.md) — this was a real, reproducible problem on this project's original dev machine before being confirmed fixed later (see that ADR's Update note).
3. Open the MIDI Remote Script Console and confirm no errors are logged, and the activation log line appears.
4. **Verify the Add Marker binding specifically** — it uses a Cubase key-command name (`'Transport'` / `'Insert Marker'`) via `makeCommandBinding`, the one binding in this script not driven by a direct host value. If it errors or doesn't fire, check Cubase's own **Edit → Key Commands** dialog for the real category/name of the "insert marker" command and update the script's `makeCommandBinding` call to match.

## Install the Companion module

1. Build it from source (see [BUILD.md](BUILD.md)):
   ```bash
   cd companion-module-cubase
   npm install
   npm run build
   ```
2. Load `companion-module-cubase` into your Companion instance (as a dev/local module — this project isn't published to the Companion module registry, per [PRD.md](PRD.md)'s personal-use scope). Companion's local/dev-module loader resolves the module's entrypoint by looking for `main.js` directly at the module folder's root — if you deploy `dist/` as a nested subfolder instead of flattening its contents to the module root, Companion will fail with `Module entrypoint "<path>\main.js" does not exist` even though `manifest.json`'s `runtime.entrypoint` field correctly points at `../dist/main.js`. `npm run build` produces `dist/` as documented in [BUILD.md](BUILD.md); when copying to a Companion dev-modules folder, copy `dist/`'s *contents* (not the `dist/` folder itself) alongside `companion/`, `node_modules/`, and `package.json`.
3. Add a "Cubanion" instance in Companion, and set its MIDI In / MIDI Out config fields to the same port pair the Cubase-side script is bound to.

## Verify

Run through the full manual verification checklist in [docs/cubase-companion-setup.md](docs/cubase-companion-setup.md) — already completed once for v1.0 (Play/Stop/Record/Add Marker), see [ROADMAP.md](ROADMAP.md).

## Updating

There's no update mechanism — this isn't distributed via the Companion module registry. To pick up a new version: pull the latest source, rebuild (`npm run build`), and reload the module in Companion. If the Cubase-side script changed, re-copy it into the Driver Scripts folder and reload it in Studio Setup.
