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
  it('registers exactly Play, Stop, Record, and Add Marker', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(['addMarker', 'play', 'record', 'stop'])
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
})
