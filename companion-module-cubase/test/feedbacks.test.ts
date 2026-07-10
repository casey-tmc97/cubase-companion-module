import { describe, it, expect, vi } from 'vitest'
import { UpdateFeedbacks } from '../src/feedbacks.js'

function makeFakeSelf(
  transportState: {
    playing: boolean
    recording: boolean
    cycleActive: boolean
    clickActive: boolean
  },
  connected: boolean,
  mixerState: { muted: boolean; solo: boolean; selectedChannelName: string | null } = {
    muted: false,
    solo: false,
    selectedChannelName: null,
  },
) {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(() => transportState),
      getMixerState: vi.fn(() => mixerState),
      isConnected: vi.fn(() => connected),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateFeedbacks', () => {
  it('registers the six Phase 1 feedbacks plus the three Mixer feedbacks', () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)

    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      ['playing', 'recording', 'stopped', 'cycleActive', 'clickActive', 'cubaseConnected', 'muteActive', 'soloActive', 'selectedChannelName'].sort(),
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

  it('muteActive feedback reflects mixer state', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: true, solo: false, selectedChannelName: null },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.muteActive.callback({} as any)).toBe(true)
  })

  it('soloActive feedback reflects mixer state', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: false, solo: true, selectedChannelName: null },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.soloActive.callback({} as any)).toBe(true)
  })

  it('selectedChannelName feedback returns the channel name as button text', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: false, solo: false, selectedChannelName: 'Vocal' },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.selectedChannelName.callback({} as any)).toEqual({ text: 'Vocal' })
  })

  it('selectedChannelName feedback falls back to a placeholder when nothing is selected', async () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.selectedChannelName.callback({} as any)).toEqual({ text: 'No Channel Selected' })
  })

  it('selectedChannelName feedback falls back to a placeholder when the channel name is an empty string', async () => {
    const self = makeFakeSelf(
      { playing: false, recording: false, cycleActive: false, clickActive: false },
      false,
      { muted: false, solo: false, selectedChannelName: '' },
    )
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.selectedChannelName.callback({} as any)).toEqual({ text: 'No Channel Selected' })
  })
})
