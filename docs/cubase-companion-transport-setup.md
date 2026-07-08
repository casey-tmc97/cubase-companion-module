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

- [ ] Press Play in Companion → Cubase transport starts, and the Companion Play button's "Playing" feedback lights.
- [ ] Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
- [ ] Repeat for Record ("Recording" feedback) and Cycle ("Cycle Active" feedback) and Click ("Click Active" feedback), in both directions.
- [ ] "Stopped" feedback is lit when transport is idle, and turns off the instant Play or Record starts.
- [ ] Fire Return to Zero, Rewind, and Forward from Companion and confirm Cubase responds (no feedback expected on these three).
- [ ] Quit Cubase (or remove the MIDI Remote controller) and confirm "Cubase Connected" flips off within ~5 seconds.
- [ ] Relaunch Cubase / re-add the controller and confirm "Cubase Connected" flips back on and all four stateful feedbacks (Playing/Recording/Cycle/Click) sync to Cubase's actual current state immediately, without needing a state change first.

> **Status: not yet executed.** This checklist has not been run against a real Cubase instance. See the Task 11 verification report for details on what was (and wasn't) checked in the environment that produced this module. A human with a real Cubase 15 install and a real or virtual MIDI port pair must run through every item above and check it off (or fix the relevant code) before this module can be considered verified end-to-end.
