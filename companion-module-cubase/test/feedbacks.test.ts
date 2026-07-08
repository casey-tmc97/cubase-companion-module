import { describe, it, expect, vi } from 'vitest'
import { UpdateFeedbacks } from '../src/feedbacks.js'

function makeFakeSelf(transportState: {
  playing: boolean
  recording: boolean
  cycleActive: boolean
  clickActive: boolean
}, connected: boolean) {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(() => transportState),
      isConnected: vi.fn(() => connected),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateFeedbacks', () => {
  it('registers the six Phase 1 feedbacks', () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)

    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      ['playing', 'recording', 'stopped', 'cycleActive', 'clickActive', 'cubaseConnected'].sort(),
    )
  })

  it('playing feedback reflects transport state', async () => {
    const self = makeFakeSelf({ playing: true, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.playing.callback({} as any)).toBe(true)
  })

  it('stopped feedback is true when neither playing nor recording', async () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.stopped.callback({} as any)).toBe(true)
  })

  it('stopped feedback is false while recording', async () => {
    const self = makeFakeSelf({ playing: false, recording: true, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.stopped.callback({} as any)).toBe(false)
  })

  it('cubaseConnected feedback reflects connection state', async () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, true)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.cubaseConnected.callback({} as any)).toBe(true)
  })
})
