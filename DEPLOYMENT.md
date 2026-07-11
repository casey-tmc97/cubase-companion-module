# Deployment Guide

"Deployment" here means installing both halves of the bridge for real use — this is a local tool, not a hosted service, so there's no server/cloud deployment involved. See [ARCHITECTURE.md](ARCHITECTURE.md) for what's being installed and why there are two separate pieces.

## Prerequisites

- Cubase 12 or later (developed against Cubase 15).
- Bitfocus Companion installed.
- A virtual or network MIDI port pair already set up (loopMIDI if Companion and Cubase run on the same machine, rtpMIDI/AppleMIDI if they run on separate machines). Setting one up for the first time is not covered here — see loopMIDI's or rtpMIDI's own documentation.
- Node.js >= 18, if building from source (see [BUILD.md](BUILD.md)).

## Install the Cubase-side script

1. Copy `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js` into your Cubase MIDI Remote Driver Scripts folder, preserving the folder structure:
   - Windows: `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Transport\`
   - macOS: `~/Documents/Steinberg/Cubase/MIDI Remote/Driver Scripts/Local/CubaseCompanion/Transport/`
2. In Cubase: **Studio → Studio Setup → MIDI Remote**, add "CubaseCompanion Transport" as a controller, and bind its input/output to your MIDI port pair.
3. Open the MIDI Remote Script Console and confirm no errors are logged, and the activation log line appears.
4. **Verify the Add Marker binding specifically** — it uses a Cubase key-command name (`'Transport'` / `'Insert Marker'`) via `makeCommandBinding`, the one binding in this script not driven by a direct host value. If it errors or doesn't fire, check Cubase's own **Edit → Key Commands** dialog for the real category/name of the "insert marker" command and update the script's `makeCommandBinding` call to match.

## Install the Companion module

1. Build it from source (see [BUILD.md](BUILD.md)):
   ```bash
   cd companion-module-cubase
   npm install
   npm run build
   ```
2. Load `companion-module-cubase` into your Companion instance (as a dev/local module — this project isn't published to the Companion module registry, per [PRD.md](PRD.md)'s personal-use scope).
3. Add a Cubase instance in Companion, and set its MIDI In / MIDI Out config fields to the same port pair the Cubase-side script is bound to.

## Verify

Run through the full manual verification checklist in [docs/cubase-companion-transport-setup.md](docs/cubase-companion-transport-setup.md). **This has not yet been executed against a real Cubase instance** — treat the module as unverified until you've gone through every item.

## Updating

There's no update mechanism — this isn't distributed via the Companion module registry. To pick up a new version: pull the latest source, rebuild (`npm run build`), and reload the module in Companion. If the Cubase-side script changed, re-copy it into the Driver Scripts folder and reload it in Studio Setup.
