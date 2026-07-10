# Cubase Companion — Setup & Verification

## Setup

1. Point your existing virtual/network MIDI port pair so both a "CubaseCompanion" input and output are visible to Cubase and to Node/Companion (loopMIDI locally, or rtpMIDI/AppleMIDI across machines). One port pair carries every phase (Transport, Markers, and future phases) — see [ADR-007](adr/ADR-007-single-consolidated-cubase-script.md).
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/CubaseCompanion.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\`.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote. If you have an older "CubaseCompanion Transport" and/or "CubaseCompanion Markers" controller from a previous version of this setup, remove them — this script registers as a new controller (vendor `CubaseCompanion`, model `Companion`). Add it and bind its MIDI In/Out to your port pair.
4. Build the Companion module: `cd companion-module-cubase && npm install && npm run build`.
5. Load `companion-module-cubase` into a local Companion dev instance and add a Cubase instance, setting MIDI In/Out to the same port pair.

## Verification checklist

### Transport

- [ ] Press Play in Companion → Cubase transport starts, and the Companion Play button's "Playing" feedback lights.
- [ ] Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
- [ ] Repeat for Record ("Recording" feedback) and Cycle ("Cycle Active" feedback) and Click ("Click Active" feedback), triggered from Companion.
- [ ] Same, triggered from Cubase's own UI.
- [ ] "Stopped" feedback is lit when transport is idle, and turns off the instant Play or Record starts.
- [ ] Fire Return to Zero, Rewind, and Forward from Companion and confirm Cubase responds (no feedback expected on these three; Rewind/Forward must be triggered via the preset buttons, whose release step sends the matching Note Off — a manually-built button using only the raw action will not stop on release).
- [ ] Quit Cubase (or remove the MIDI Remote controller) and confirm "Cubase Connected" flips off within ~5 seconds.
- [ ] Relaunch Cubase / re-add the controller and confirm "Cubase Connected" flips back on and all four stateful feedbacks (Playing/Recording/Cycle/Click) sync to Cubase's actual current state immediately, without needing a state change first.

### Markers

- [ ] Add Marker: press in Companion, confirm a new marker appears at the current cursor/playhead position in Cubase.
- [ ] Next Marker / Previous Marker: with at least two markers present, confirm the cursor jumps to the next/previous marker relative to its current position.
- [ ] To Marker 1 through To Marker 9: with markers 1-9 present, confirm each button jumps directly to its corresponding marker.
- [ ] Pressing a To Marker N button for a marker that doesn't exist does not error or crash Cubase (should simply do nothing).

### Both together

- [ ] With Cubase actively playing/recording (Transport feedback lit), fire a Markers action and confirm Transport's feedback state is undisturbed — both phases share one script and one port, so this confirms they don't interfere with each other.

> **Status: not yet verified against this consolidated script.** Both phases were separately verified working under the prior two-script architecture (see git history / ADR-004's and the Markers design spec's amendments for that record) before hitting the port-sharing limitation that prompted this consolidation (ADR-007). This checklist needs a fresh full run against the merged `CubaseCompanion.js` before either phase can be considered verified again.
