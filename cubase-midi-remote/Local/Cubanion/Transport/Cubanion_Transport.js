var midiremote_api = require('midiremote_api_v1')

// Transport -- MIDI channel 16, zero-indexed 15.
var TRANSPORT_CHANNEL = 15
var NOTE_PLAY = 0
var NOTE_STOP = 1
var NOTE_RECORD = 2
var NOTE_HEARTBEAT = 9
// Dedicated state-feedback notes (Cubase -> Companion only), separate from the
// trigger notes above (Companion -> Cubase). Feedback used to share the same
// note as its trigger, which meant our own midiOutput.sendMidi() calls below
// looped back into THIS SCRIPT's own mMidiBinding input (same shared loopMIDI
// port), re-triggering .setTypeToggle() as if it were a fresh button press --
// confirmed by tracing the raw value seen by mOnProcessValueChange, which kept
// flipping back to 0 on its own a few ms after every real press. Splitting
// feedback onto its own notes means our own output can never match what its
// own input binding is listening for. See ADR-004.
var NOTE_PLAY_STATE = 10
var NOTE_RECORD_STATE = 11
var HEARTBEAT_INTERVAL_MS = 2000

// Markers -- MIDI channel 15, zero-indexed 14. Own dedicated channel per
// phase (ADR-006), kept even though this is now a single consolidated script
// (ADR-007) -- a single script author can trivially avoid note collisions by
// hand, but the per-phase channel still keeps each phase's note range
// self-contained and easy to reason about in isolation.
var MARKERS_CHANNEL = 14
var NOTE_ADD_MARKER = 0

// One device driver for the whole project (ADR-007) -- Cubase's MIDI Remote
// will not bind two separate controllers to the same MIDI port pair, so every
// phase lives in this one script on one port pair, differentiated only by
// channel (see the per-phase channel constants above).
//
// Vendor/model renamed from 'CubaseCompanion'/'Transport' to 'Cubanion'/'Transport'
// on 2026-07-13, at the project owner's explicit request to have all branding read
// "Cubanion" rather than "Cubase Companion"/"Steinberg Cubase" (this is not a
// Steinberg product). ADR-008 documents that this Cubase install could not
// discover ANY new vendor/model pair via fresh Local-script discovery as of
// 2026-07-10 -- if this renamed pair fails to appear in Cubase's MIDI Remote
// Manager / Add Surface list, that is the same unresolved issue, not a bug in
// this rename. The previous working file at
// Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js (vendor
// 'CubaseCompanion', model 'Transport') is intentionally left in place as a
// fallback until this renamed registration is confirmed working live.
var deviceDriver = midiremote_api.makeDeviceDriver('Cubanion', 'Transport', 'Cubanion')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

// Matches the existing "Cubase" loopMIDI port pair already in use (not renamed
// to "Cubanion") -- the virtual MIDI port name is runtime environment
// configuration, not part of this project's own branding, and changing it here
// would require also recreating the loopMIDI port under a new name, adding an
// unrelated variable to an already-risky rename. See the ADR-008 comment above.
deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('Cubase')
  .expectOutputNameEquals('Cubase')

var surface = deviceDriver.mSurface

function makeButton(x, y) {
  return surface.makeButton(x, y, 1, 1)
}

// All four buttons on one row -- the surface grid position here is only
// this script's own local layout and has no effect on Companion's UI (each
// Companion action/button is placed independently in Companion itself), so
// there's no reason to spread Transport/Markers across separate rows now
// that there are only four buttons total.
var btnPlay = makeButton(0, 0)
var btnStop = makeButton(1, 0)
var btnRecord = makeButton(2, 0)
var btnAddMarker = makeButton(3, 0)

// Play/Record are input-only here (no .setOutputPort()) -- Steinberg's
// automatic MIDI-mirror for .setTypeToggle() bindings turned out to send a
// noisy burst of 5-7 redundant, differently-encoded messages (mixed Note
// On/Off velocities plus an undocumented Polyphonic Aftertouch message) per
// single toggle, which the Companion module's simple state tracker can't
// reliably resolve to one clean value. See the explicit
// mOnProcessValueChange feedback below instead, which sends exactly one
// message per real change.
btnPlay.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_PLAY)
btnStop.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_STOP)
btnRecord.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RECORD)

// Add Marker is input-only (no .setOutputPort()) -- a one-shot command
// trigger with no persistent state, so there's nothing to send feedback for
// (see the Markers design spec's Scope section).
btnAddMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_ADD_MARKER)

// One page for everything -- Steinberg MIDI Remote pages are for switching
// between alternate mappings (e.g. banks) and are not all simultaneously
// active by default. Transport and Markers must both always be live at once,
// not toggled between, so they share this single page rather than each
// getting their own.
var page = deviceDriver.mMapping.makePage('Main')

page.makeValueBinding(btnPlay.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStart).setTypeToggle()
page.makeValueBinding(btnStop.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStop)
page.makeValueBinding(btnRecord.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRecord).setTypeToggle()

// Exact Cubase key command name, category 'Transport' -- pulled from this
// Cubase install's own key-command presets (Presets/KeyCommands/*.xml), not
// guessed. 'To Marker N' jumps to an existing marker; 'Set Marker N' (not
// used here) assigns/overwrites one instead -- see the Markers design spec's
// decision log.
page.makeCommandBinding(btnAddMarker.mSurfaceValue, 'Transport', 'Insert Marker')

page.mOnActivate = function (activeDevice) {
  console.log('Cubanion: page activated')
}

// Explicit, single-message state feedback for the two bidirectional
// Transport toggles (Play/Record). Add Marker has no feedback -- see Scope
// in the Markers design spec.
//
// NOTE: a prior version of this bound the callback to the *host* value
// (page.mHostAccess.mTransport.mValue.mX.mOnProcessValueChange) instead of
// the surface value below. Steinberg's own API reference (README_v1.html /
// midiremote_factory_scripts/.api/v1/midiremote_api_v1.d.ts, and the
// ExampleCompany_RealWorldDevice.js factory script, which wires up this exact
// transport-toggle-plus-LED-feedback pattern) only documents
// mOnProcessValueChange on MR_SurfaceElementValue (i.e. mSurfaceValue) -- it
// isn't a real hook on host value objects at all, so that version silently
// did nothing. This is the object the API actually supports.
function bindStateFeedback(surfaceValue, channel, note) {
  surfaceValue.mOnProcessValueChange = function (activeDevice, value) {
    var statusOn = 0x90 | channel
    var statusOff = 0x80 | channel
    if (value >= 0.5) {
      midiOutput.sendMidi(activeDevice, [statusOn, note, 127])
    } else {
      midiOutput.sendMidi(activeDevice, [statusOff, note, 0])
    }
  }
}

bindStateFeedback(btnPlay.mSurfaceValue, TRANSPORT_CHANNEL, NOTE_PLAY_STATE)
bindStateFeedback(btnRecord.mSurfaceValue, TRANSPORT_CHANNEL, NOTE_RECORD_STATE)

var lastHeartbeatSentAt = 0

deviceDriver.mOnIdle = function (activeDevice) {
  var now = Date.now()
  if (now - lastHeartbeatSentAt < HEARTBEAT_INTERVAL_MS) return
  lastHeartbeatSentAt = now

  var statusOn = 0x90 | TRANSPORT_CHANNEL
  var statusOff = 0x80 | TRANSPORT_CHANNEL
  midiOutput.sendMidi(activeDevice, [statusOn, NOTE_HEARTBEAT, 127])
  midiOutput.sendMidi(activeDevice, [statusOff, NOTE_HEARTBEAT, 0])
}
