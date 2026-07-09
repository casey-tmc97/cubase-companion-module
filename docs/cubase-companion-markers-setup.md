# Cubase Companion Markers — Setup & Verification

## Setup

1. Companion's MIDI In/Out config is unchanged from Transport — no new port, no new Companion connection. If Transport is already working, Markers reuses that exact same connection.
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/Markers/CubaseCompanion_Markers.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Markers\`.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote, add "CubaseCompanion Markers" as a *second* controller (alongside the existing "CubaseCompanion Transport"), and bind its MIDI In/Out to the same port pair Transport already uses.
4. Rebuild the Companion module: `cd companion-module-cubase && npm run build`, then reload/rescan the module in Companion the same way Transport changes were picked up during Phase 1 (disable/re-enable the connection, or restart Companion if that doesn't pick up the change).

## Verification checklist

- [ ] Add Marker: press in Companion, confirm a new marker appears at the current cursor/playhead position in Cubase.
- [ ] Next Marker / Previous Marker: with at least two markers present, confirm the cursor jumps to the next/previous marker relative to its current position.
- [ ] To Marker 1 through To Marker 9: with markers 1-9 present, confirm each button jumps directly to its corresponding marker.
- [ ] Pressing a To Marker N button for a marker that doesn't exist does not error or crash Cubase (should simply do nothing).
- [ ] Confirm Transport's own actions/feedback (Play, Stop, Record, Cycle, Click, Rewind, Forward, Cubase Connected) still work correctly with both scripts active simultaneously — this is the main risk of sharing one port between two device drivers.
