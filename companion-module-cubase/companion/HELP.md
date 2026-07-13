# Cubanion

Controls Steinberg Cubase's transport (Play, Stop, Record) and markers (Add
Marker) with live feedback, via Cubase's MIDI Remote API.

## Setup

1. Install the Cubanion Cubase MIDI Remote script (see
   `cubase-midi-remote/Local/Cubanion/Transport/Cubanion_Transport.js`
   in this repo) into your Cubase MIDI Remote Driver Scripts folder, and add
   it as a controller under Studio > Studio Setup > MIDI Remote.
2. Point this module's MIDI In / MIDI Out config fields at the same virtual
   or network MIDI port pair the script is bound to.
3. The "Cubase Connected" feedback lights up once the script's heartbeat is
   received; if it stays off, double check the port names match on both
   sides and that the script is active in Studio Setup.
