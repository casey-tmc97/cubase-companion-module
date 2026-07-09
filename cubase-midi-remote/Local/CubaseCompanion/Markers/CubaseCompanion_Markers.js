var midiremote_api = require('midiremote_api_v1')

var MARKERS_CHANNEL = 14 // MIDI channel 15, zero-indexed -- see ADR-006
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

var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Markers', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

// Shares the same physical/virtual port pair as CubaseCompanion_Transport.js
// (see the Markers design spec's Architecture section) -- the detection hint
// below intentionally matches Transport's, since both scripts are meant to be
// bound to the same port regardless of what it's actually named. This project's
// own setup uses a manually-assigned port name, so the hint is a convenience,
// not a requirement (already proven non-blocking for Transport).
deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion Transport')
  .expectOutputNameEquals('CubaseCompanion Transport')

var surface = deviceDriver.mSurface

function makeMarkerButton(x) {
  return surface.makeButton(x, 0, 1, 1)
}

var btnAddMarker = makeMarkerButton(0)
var btnNextMarker = makeMarkerButton(1)
var btnPreviousMarker = makeMarkerButton(2)
var btnToMarker1 = makeMarkerButton(3)
var btnToMarker2 = makeMarkerButton(4)
var btnToMarker3 = makeMarkerButton(5)
var btnToMarker4 = makeMarkerButton(6)
var btnToMarker5 = makeMarkerButton(7)
var btnToMarker6 = makeMarkerButton(8)
var btnToMarker7 = makeMarkerButton(9)
var btnToMarker8 = makeMarkerButton(10)
var btnToMarker9 = makeMarkerButton(11)

// All input-only (no .setOutputPort()) -- these are one-shot command
// triggers with no persistent state, so there's nothing to send feedback
// for (see the design spec's Scope section: no feedback for any marker
// action, confirmed with the project owner rather than assumed).
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

var page = deviceDriver.mMapping.makePage('Markers')

// Exact Cubase key command names, category 'Transport' for all -- pulled from
// this Cubase install's own key-command presets (Presets/KeyCommands/*.xml),
// not guessed. 'To Marker N' jumps to an existing marker; 'Set Marker N'
// (not used here) assigns/overwrites one instead -- see the design spec's
// decision log.
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
  console.log('CubaseCompanion Markers: page activated')
}
