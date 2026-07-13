import { describe, it, expect, vi } from 'vitest'
import { UpdateActions } from '../src/actions.js'
import { TransportNote, MarkerNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL } from '../src/midi/protocol.js'

function makeFakeSelf() {
  return {
    midi: {
      sendTrigger: vi.fn(),
      sendNoteOn: vi.fn(),
      sendNoteOff: vi.fn(),
      getTransportState: vi.fn(),
      isConnected: vi.fn(),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateActions', () => {
  it('registers one action per transport function plus Add Marker', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      [
        'play',
        'stop',
        'record',
        'returnToZero',
        'toggleCycle',
        'toggleClick',
        'rewind',
        'rewindStop',
        'forward',
        'forwardStop',
        'addMarker',
        'nextMarker',
        'previousMarker',
        'toMarker1',
        'toMarker2',
        'toMarker3',
        'toMarker4',
        'toMarker5',
        'toMarker6',
        'toMarker7',
        'toMarker8',
        'toMarker9',
        'setMarker1',
        'setMarker2',
        'setMarker3',
        'setMarker4',
        'setMarker5',
        'setMarker6',
        'setMarker7',
        'setMarker8',
        'setMarker9',
        'setPunchIn',
        'setPunchOut',
        'autoPunchIn',
        'autoPunchOut',
      ].sort(),
    )
  })

  // Cubase's mRewind/mForward host values need a genuine hold (value stays 1
  // while pressed, back to 0 on release) to produce continuous motion -- a
  // Note On immediately followed by Note Off (sendTrigger's shape) never
  // registers as a hold. So rewind/forward send only Note On (start of hold)
  // and rely on a paired rewindStop/forwardStop action -- wired to the preset
  // button's release step -- to send Note Off (end of hold).
  it('rewind action sends Note On (not a full trigger) on the Rewind note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.rewind.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Rewind)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
  })

  it('rewindStop action sends Note Off on the Rewind note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.rewindStop.callback({} as any)

    expect(self.midi.sendNoteOff).toHaveBeenCalledWith(TransportNote.Rewind)
  })

  it('forward action sends Note On (not a full trigger) on the Forward note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.forward.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Forward)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
  })

  it('forwardStop action sends Note Off on the Forward note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.forwardStop.callback({} as any)

    expect(self.midi.sendNoteOff).toHaveBeenCalledWith(TransportNote.Forward)
  })

  it('returnToZero action sends a trigger on TRANSPORT_CHANNEL, ReturnToZero note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.returnToZero.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.ReturnToZero)
  })

  it('toggleCycle action sends a trigger on TRANSPORT_CHANNEL, Cycle note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleCycle.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Cycle)
  })

  it('toggleClick action sends a trigger on TRANSPORT_CHANNEL, Click note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleClick.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Click)
  })

  it('play action sends a trigger on TRANSPORT_CHANNEL, Play note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.play.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Play)
  })

  // mStop is a plain (non-toggle, non-command) value binding in the Cubase
  // script -- every write to it invokes Stop, so a Note On + Note Off pair
  // (sendTrigger's shape) fires Stop twice in the same instant. Cubase treats
  // that the same as a real double-press of Stop while already stopped, which
  // natively returns the cursor to the start position. Sending only Note On
  // avoids the second write entirely.
  it('stop action sends only Note On, not a full trigger', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.stop.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Stop)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
    expect(self.midi.sendNoteOff).not.toHaveBeenCalled()
  })

  // NOTE: sendNoteOn-only was tried here and reverted -- it made Record stop
  // responding entirely, showing Cubase's toggle needs the full press+release
  // pair. Back to sendTrigger pending further investigation.
  it('record action sends a trigger on TRANSPORT_CHANNEL, Record note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.record.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Record)
  })

  // Markers phase (Phase 3): one-shot trigger on MARKERS_CHANNEL, no
  // feedback -- see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
  it('addMarker action sends a trigger on MARKERS_CHANNEL, AddMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.addMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AddMarker)
  })

  it('nextMarker action sends a trigger on MARKERS_CHANNEL, NextMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.nextMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.NextMarker)
  })

  it('previousMarker action sends a trigger on MARKERS_CHANNEL, PreviousMarker note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.previousMarker.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.PreviousMarker)
  })

  it.each([
    [1, 'ToMarker1'],
    [2, 'ToMarker2'],
    [3, 'ToMarker3'],
    [4, 'ToMarker4'],
    [5, 'ToMarker5'],
    [6, 'ToMarker6'],
    [7, 'ToMarker7'],
    [8, 'ToMarker8'],
    [9, 'ToMarker9'],
  ] as const)('toMarker%i action sends a trigger on MARKERS_CHANNEL, %s note', async (n, noteKey) => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions[`toMarker${n}`].callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote[noteKey])
  })

  it.each([
    [1, 'SetMarker1'],
    [2, 'SetMarker2'],
    [3, 'SetMarker3'],
    [4, 'SetMarker4'],
    [5, 'SetMarker5'],
    [6, 'SetMarker6'],
    [7, 'SetMarker7'],
    [8, 'SetMarker8'],
    [9, 'SetMarker9'],
  ] as const)('setMarker%i action sends a trigger on MARKERS_CHANNEL, %s note', async (n, noteKey) => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions[`setMarker${n}`].callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote[noteKey])
  })

  it('setPunchIn action sends a trigger on MARKERS_CHANNEL, SetPunchIn note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.setPunchIn.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.SetPunchIn)
  })

  it('setPunchOut action sends a trigger on MARKERS_CHANNEL, SetPunchOut note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.setPunchOut.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.SetPunchOut)
  })

  it('autoPunchIn action sends a trigger on MARKERS_CHANNEL, AutoPunchIn note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.autoPunchIn.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AutoPunchIn)
  })

  it('autoPunchOut action sends a trigger on MARKERS_CHANNEL, AutoPunchOut note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.autoPunchOut.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote.AutoPunchOut)
  })
})
