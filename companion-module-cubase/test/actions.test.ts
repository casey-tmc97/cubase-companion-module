import { describe, it, expect, vi } from 'vitest'
import { UpdateActions } from '../src/actions.js'
import { TransportNote, MarkerNote, MixerNote, MixerCC, TRANSPORT_CHANNEL, MARKERS_CHANNEL, MIXER_CHANNEL } from '../src/midi/protocol.js'

function makeFakeSelf() {
  return {
    midi: {
      sendTrigger: vi.fn(),
      sendNoteOn: vi.fn(),
      sendNoteOff: vi.fn(),
      sendRelativeCC: vi.fn(),
      getTransportState: vi.fn(),
      getMixerState: vi.fn(),
      isConnected: vi.fn(),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateActions', () => {
  it('registers one action per transport function plus the marker actions', () => {
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
        'toggleMute',
        'toggleSolo',
        'volumeUp',
        'volumeDown',
        'panLeft',
        'panRight',
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

  it('play action sends a trigger on TRANSPORT_CHANNEL, Play note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.play.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.Play)
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

  it('returnToZero action sends a trigger on TRANSPORT_CHANNEL, ReturnToZero note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.returnToZero.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TRANSPORT_CHANNEL, TransportNote.ReturnToZero)
  })

  // mStop is a plain (non-toggle, non-command) value binding in the Cubase
  // script -- every write to it invokes Stop, so a Note On + Note Off pair
  // (sendTrigger's shape) fires Stop twice in the same instant. Cubase treats
  // that the same as a real double-press of Stop while already stopped, which
  // natively returns the cursor to the start position. Sending only Note On
  // (like the Rewind/Forward press) avoids the second write entirely.
  it('stop action sends only Note On, not a full trigger', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.stop.callback({} as any)

    expect(self.midi.sendNoteOn).toHaveBeenCalledWith(TransportNote.Stop)
    expect(self.midi.sendTrigger).not.toHaveBeenCalled()
    expect(self.midi.sendNoteOff).not.toHaveBeenCalled()
  })

  // Markers phase (Phase 3): all one-shot triggers on MARKERS_CHANNEL, no
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

  const numberedMarkers: Array<[string, keyof typeof MarkerNote]> = [
    ['toMarker1', 'ToMarker1'],
    ['toMarker2', 'ToMarker2'],
    ['toMarker3', 'ToMarker3'],
    ['toMarker4', 'ToMarker4'],
    ['toMarker5', 'ToMarker5'],
    ['toMarker6', 'ToMarker6'],
    ['toMarker7', 'ToMarker7'],
    ['toMarker8', 'ToMarker8'],
    ['toMarker9', 'ToMarker9'],
  ]

  it.each(numberedMarkers)('%s action sends a trigger on MARKERS_CHANNEL, %s note', async (actionId, noteKey) => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions[actionId].callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MARKERS_CHANNEL, MarkerNote[noteKey])
  })

  it('toggleMute action sends a trigger on MIXER_CHANNEL, ToggleMute note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleMute.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MIXER_CHANNEL, MixerNote.ToggleMute)
  })

  it('toggleSolo action sends a trigger on MIXER_CHANNEL, ToggleSolo note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.toggleSolo.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(MIXER_CHANNEL, MixerNote.ToggleSolo)
  })

  it('volumeUp action sends an "up" relative tick on the Volume CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.volumeUp.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)
  })

  it('volumeDown action sends a "down" relative tick on the Volume CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.volumeDown.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.VolumeDelta, -1)
  })

  it('panLeft action sends a "down" relative tick on the Pan CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.panLeft.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.PanDelta, -1)
  })

  it('panRight action sends an "up" relative tick on the Pan CC', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.panRight.callback({} as any)

    expect(self.midi.sendRelativeCC).toHaveBeenCalledWith(MIXER_CHANNEL, MixerCC.PanDelta, 1)
  })
})
