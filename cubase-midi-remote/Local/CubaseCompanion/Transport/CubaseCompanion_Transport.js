// cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js
var midiremote_api = require('midiremote_api_v1')

var TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed
var NOTE_PLAY = 0
var NOTE_STOP = 1
var NOTE_RECORD = 2
var NOTE_RETURN_TO_ZERO = 3
var NOTE_CYCLE = 4
var NOTE_CLICK = 5
var NOTE_REWIND = 6
var NOTE_FORWARD = 7
var NOTE_HEARTBEAT = 9
var HEARTBEAT_INTERVAL_MS = 2000

var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Transport', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion Transport')
  .expectOutputNameEquals('CubaseCompanion Transport')

var surface = deviceDriver.mSurface

function makeTransportButton(x) {
  return surface.makeButton(x, 0, 1, 1)
}

var btnPlay = makeTransportButton(0)
var btnStop = makeTransportButton(1)
var btnRecord = makeTransportButton(2)
var btnReturnToZero = makeTransportButton(3)
var btnCycle = makeTransportButton(4)
var btnClick = makeTransportButton(5)
var btnRewind = makeTransportButton(6)
var btnForward = makeTransportButton(7)

btnPlay.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_PLAY)
btnStop.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_STOP)
btnRecord.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_RECORD)
btnReturnToZero.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RETURN_TO_ZERO)
btnCycle.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_CYCLE)
btnClick.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_CLICK)
btnRewind.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_REWIND)
btnForward.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_FORWARD)

var page = deviceDriver.mMapping.makePage('Transport')

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

page.mOnActivate = function (activeDevice) {
  console.log('CubaseCompanion Transport: page activated')
}

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
