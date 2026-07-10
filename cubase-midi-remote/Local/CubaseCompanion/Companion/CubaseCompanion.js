var midiremote_api = require('midiremote_api_v1')

// Transport (Phase 1) -- MIDI channel 16, zero-indexed 15.
var TRANSPORT_CHANNEL = 15
var NOTE_PLAY = 0
var NOTE_STOP = 1
var NOTE_RECORD = 2
var NOTE_RETURN_TO_ZERO = 3
var NOTE_CYCLE = 4
var NOTE_CLICK = 5
var NOTE_REWIND = 6
var NOTE_FORWARD = 7
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
var NOTE_CYCLE_STATE = 12
var NOTE_CLICK_STATE = 13
var HEARTBEAT_INTERVAL_MS = 2000

// Markers (Phase 3) -- MIDI channel 15, zero-indexed 14. Own dedicated channel
// per phase (ADR-006), kept even though all phases now live in one script
// (ADR-007) -- a single script author can trivially avoid note collisions by
// hand, but the per-phase channel still keeps each phase's note range
// self-contained and easy to reason about in isolation.
var MARKERS_CHANNEL = 14
var NOTE_ADD_MARKER = 0
var NOTE_NEXT_MARKER = 1
var NOTE_PREVIOUS_MARKER = 2
var NOTE_TO_MARKER_1 = 3
var NOTE_TO_MARKER_2 = 4
var NOTE_TO_MARKER_3 = 5
var NOTE_TO_MARKER_4 = 6
var NOTE_TO_MARKER_5 = 7
var NOTE_TO_MARKER_6 = 8
var NOTE_TO_MARKER_7 = 9
var NOTE_TO_MARKER_8 = 10
var NOTE_TO_MARKER_9 = 11

// One device driver for the whole project (ADR-007) -- Cubase's MIDI Remote
// will not bind two separate controllers to the same MIDI port pair, so every
// phase lives in this one script on one port pair, differentiated only by
// channel (see the per-phase channel constants above).
var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Companion', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion')
  .expectOutputNameEquals('CubaseCompanion')

var surface = deviceDriver.mSurface

function makeButton(x, y) {
  return surface.makeButton(x, y, 1, 1)
}

// Transport buttons -- row 0.
var btnPlay = makeButton(0, 0)
var btnStop = makeButton(1, 0)
var btnRecord = makeButton(2, 0)
var btnReturnToZero = makeButton(3, 0)
var btnCycle = makeButton(4, 0)
var btnClick = makeButton(5, 0)
var btnRewind = makeButton(6, 0)
var btnForward = makeButton(7, 0)

// Marker buttons -- row 1, so they don't collide with Transport's row-0 grid
// positions now that both phases share one surface.
var btnAddMarker = makeButton(0, 1)
var btnNextMarker = makeButton(1, 1)
var btnPreviousMarker = makeButton(2, 1)
var btnToMarker1 = makeButton(3, 1)
var btnToMarker2 = makeButton(4, 1)
var btnToMarker3 = makeButton(5, 1)
var btnToMarker4 = makeButton(6, 1)
var btnToMarker5 = makeButton(7, 1)
var btnToMarker6 = makeButton(8, 1)
var btnToMarker7 = makeButton(9, 1)
var btnToMarker8 = makeButton(10, 1)
var btnToMarker9 = makeButton(11, 1)

// Play/Record/Cycle/Click are input-only here (no .setOutputPort()) --
// Steinberg's automatic MIDI-mirror for .setTypeToggle() bindings turned out
// to send a noisy burst of 5-7 redundant, differently-encoded messages (mixed
// Note On/Off velocities plus an undocumented Polyphonic Aftertouch message)
// per single toggle, which the Companion module's simple state tracker can't
// reliably resolve to one clean value. See the explicit mOnProcessValueChange
// feedback below instead, which sends exactly one message per real change.
btnPlay.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_PLAY)
btnStop.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_STOP)
btnRecord.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RECORD)
btnReturnToZero.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RETURN_TO_ZERO)
btnCycle.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_CYCLE)
btnClick.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_CLICK)
btnRewind.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_REWIND)
btnForward.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_FORWARD)

// Markers are all input-only (no .setOutputPort()) -- these are one-shot
// command triggers with no persistent state, so there's nothing to send
// feedback for (see the Markers design spec's Scope section).
btnAddMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_ADD_MARKER)
btnNextMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_NEXT_MARKER)
btnPreviousMarker.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_PREVIOUS_MARKER)
btnToMarker1.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_1)
btnToMarker2.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_2)
btnToMarker3.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_3)
btnToMarker4.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_4)
btnToMarker5.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_5)
btnToMarker6.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_6)
btnToMarker7.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_7)
btnToMarker8.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_8)
btnToMarker9.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(MARKERS_CHANNEL, NOTE_TO_MARKER_9)

// One page for everything -- Steinberg MIDI Remote pages are for switching
// between alternate mappings (e.g. banks) and are not all simultaneously
// active by default. Transport and Markers must both always be live at once,
// not toggled between, so they share this single page rather than each
// getting their own.
var page = deviceDriver.mMapping.makePage('Main')

page.makeValueBinding(btnPlay.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStart).setTypeToggle()
page.makeValueBinding(btnStop.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStop)
page.makeValueBinding(btnRecord.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRecord).setTypeToggle()
// Return to Zero has no dedicated mTransport.mValue member (unlike Start/Stop/Record/
// Rewind/Forward/Cycle/Metronome) — it's a Transport menu key command, so it's bound
// via makeCommandBinding to Cubase's built-in "Return to Zero" key command instead.
page.makeCommandBinding(btnReturnToZero.mSurfaceValue, 'Transport', 'Return to Zero')
page.makeValueBinding(btnCycle.mSurfaceValue, page.mHostAccess.mTransport.mValue.mCycleActive).setTypeToggle()
page.makeValueBinding(btnClick.mSurfaceValue, page.mHostAccess.mTransport.mValue.mMetronomeActive).setTypeToggle()
page.makeValueBinding(btnRewind.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRewind)
page.makeValueBinding(btnForward.mSurfaceValue, page.mHostAccess.mTransport.mValue.mForward)

// Exact Cubase key command names, category 'Transport' for all -- pulled from
// this Cubase install's own key-command presets (Presets/KeyCommands/*.xml),
// not guessed. 'To Marker N' jumps to an existing marker; 'Set Marker N'
// (not used here) assigns/overwrites one instead -- see the Markers design
// spec's decision log.
page.makeCommandBinding(btnAddMarker.mSurfaceValue, 'Transport', 'Insert Marker')
page.makeCommandBinding(btnNextMarker.mSurfaceValue, 'Transport', 'Locate Next Marker')
page.makeCommandBinding(btnPreviousMarker.mSurfaceValue, 'Transport', 'Locate Previous Marker')
page.makeCommandBinding(btnToMarker1.mSurfaceValue, 'Transport', 'To Marker 1')
page.makeCommandBinding(btnToMarker2.mSurfaceValue, 'Transport', 'To Marker 2')
page.makeCommandBinding(btnToMarker3.mSurfaceValue, 'Transport', 'To Marker 3')
page.makeCommandBinding(btnToMarker4.mSurfaceValue, 'Transport', 'To Marker 4')
page.makeCommandBinding(btnToMarker5.mSurfaceValue, 'Transport', 'To Marker 5')
page.makeCommandBinding(btnToMarker6.mSurfaceValue, 'Transport', 'To Marker 6')
page.makeCommandBinding(btnToMarker7.mSurfaceValue, 'Transport', 'To Marker 7')
page.makeCommandBinding(btnToMarker8.mSurfaceValue, 'Transport', 'To Marker 8')
page.makeCommandBinding(btnToMarker9.mSurfaceValue, 'Transport', 'To Marker 9')

page.mOnActivate = function (activeDevice) {
  console.log('CubaseCompanion: page activated')
}

// Explicit, single-message state feedback for the four bidirectional Transport
// toggles (Play/Record/Cycle/Click). Markers has no feedback -- see Scope in
// the Markers design spec.
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
function bindStateFeedback(surfaceValue, note) {
  surfaceValue.mOnProcessValueChange = function (activeDevice, value) {
    var statusOn = 0x90 | TRANSPORT_CHANNEL
    var statusOff = 0x80 | TRANSPORT_CHANNEL
    if (value >= 0.5) {
      midiOutput.sendMidi(activeDevice, [statusOn, note, 127])
    } else {
      midiOutput.sendMidi(activeDevice, [statusOff, note, 0])
    }
  }
}

bindStateFeedback(btnPlay.mSurfaceValue, NOTE_PLAY_STATE)
bindStateFeedback(btnRecord.mSurfaceValue, NOTE_RECORD_STATE)
bindStateFeedback(btnCycle.mSurfaceValue, NOTE_CYCLE_STATE)
bindStateFeedback(btnClick.mSurfaceValue, NOTE_CLICK_STATE)

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
