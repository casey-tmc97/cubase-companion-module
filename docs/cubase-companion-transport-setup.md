# Cubase Companion Transport — Setup & Verification

## Setup

1. Point your existing virtual/network MIDI port pair so both a "CubaseCompanion Transport" input and output are visible to Cubase and to Node/Companion (loopMIDI locally, or rtpMIDI/AppleMIDI across machines).
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Transport\`.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote, add "CubaseCompanion Transport", and bind it to your port pair.
4. Build the Companion module: `cd companion-module-cubase && npm install && npm run build`.
5. Load `companion-module-cubase` into a local Companion dev instance and add a Cubase instance, setting MIDI In/Out to the same port pair.

## Verification checklist

- [x] Press Play in Companion → Cubase transport starts, and the Companion Play button's "Playing" feedback lights.
- [ ] Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
- [x] Repeat for Record ("Recording" feedback) and Cycle ("Cycle Active" feedback) and Click ("Click Active" feedback), triggered from Companion.
- [ ] Same, triggered from Cubase's own UI.
- [ ] "Stopped" feedback is lit when transport is idle, and turns off the instant Play or Record starts.
- [x] Fire Return to Zero, Rewind, and Forward from Companion and confirm Cubase responds (no feedback expected on these three; Rewind/Forward must be triggered via the preset buttons, whose release step sends the matching Note Off — a manually-built button using only the raw action will not stop on release).
- [ ] Quit Cubase (or remove the MIDI Remote controller) and confirm "Cubase Connected" flips off within ~5 seconds.
- [ ] Relaunch Cubase / re-add the controller and confirm "Cubase Connected" flips back on and all four stateful feedbacks (Playing/Recording/Cycle/Click) sync to Cubase's actual current state immediately, without needing a state change first.

> **Status: verified for the Companion-triggered direction.** All eight transport actions (Play/Stop/Record/Return to Zero/Cycle/Click/Rewind/Forward) and the Play/Record/Cycle/Click feedback were confirmed working end-to-end against a real Cubase 15 instance, triggered from Companion. Getting there required real fixes beyond the original design — see ADR-004's 2026-07-09 amendment for the root causes (Stop's double-invoke, Rewind/Forward's hold semantics, and the state-feedback note split that fixed Cubase's own output looping back into its own input binding). The Cubase-initiated direction (pressing transport controls in Cubase's own UI and watching Companion react) and the disconnect/reconnect resync behavior are implemented and unit-tested but not yet manually verified against real Cubase — still open per the unchecked items above.
