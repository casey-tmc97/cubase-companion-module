import { describe, it, expect, vi } from 'vitest'
import { UpdateActions } from '../src/actions.js'
import { TransportNote } from '../src/midi/protocol.js'

function makeFakeSelf() {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(),
      isConnected: vi.fn(),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateActions', () => {
  it('registers one action per transport function', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      ['play', 'stop', 'record', 'returnToZero', 'toggleCycle', 'toggleClick', 'rewind', 'forward'].sort(),
    )
  })

  it('play action sends a trigger on the Play note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.play.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TransportNote.Play)
  })

  it('record action sends a trigger on the Record note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.record.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TransportNote.Record)
  })
})
