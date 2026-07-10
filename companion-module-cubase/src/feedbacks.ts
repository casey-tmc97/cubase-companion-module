import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { isStopped } from './midi/transportState.js'
import type { ModuleLike } from './actions.js'

const activeStyle = { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) }
const connectedStyle = { bgcolor: combineRgb(0, 120, 220), color: combineRgb(255, 255, 255) }

export function UpdateFeedbacks(self: ModuleLike): void {
  const definitions: CompanionFeedbackDefinitions = {
    playing: {
      type: 'boolean',
      name: 'Playing',
      description: "True while Cubase's transport is playing",
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().playing,
    },
    recording: {
      type: 'boolean',
      name: 'Recording',
      description: 'True while Cubase is recording',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().recording,
    },
    stopped: {
      type: 'boolean',
      name: 'Stopped',
      description: 'True when neither Playing nor Recording is true',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => isStopped(self.midi.getTransportState()),
    },
    cycleActive: {
      type: 'boolean',
      name: 'Cycle Active',
      description: 'True when Cycle/Loop is enabled in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().cycleActive,
    },
    clickActive: {
      type: 'boolean',
      name: 'Click Active',
      description: 'True when the Metronome/Click is enabled in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().clickActive,
    },
    cubaseConnected: {
      type: 'boolean',
      name: 'Cubase Connected',
      description: 'True while heartbeats keep arriving from the Cubase MIDI Remote script',
      defaultStyle: connectedStyle,
      options: [],
      callback: async () => self.midi.isConnected(),
    },
    // Mixer (Phase 2) -- see
    // docs/superpowers/specs/2026-07-10-cubase-companion-mixer-design.md.
    muteActive: {
      type: 'boolean',
      name: 'Mute Active',
      description: 'True while the selected channel is muted in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getMixerState().muted,
    },
    soloActive: {
      type: 'boolean',
      name: 'Solo Active',
      description: 'True while the selected channel is soloed in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getMixerState().solo,
    },
    selectedChannelName: {
      type: 'advanced',
      name: 'Selected Channel Name',
      description: "Shows the name of Cubase's currently selected mixer channel",
      options: [],
      callback: async () => ({ text: self.midi.getMixerState().selectedChannelName || 'No Channel Selected' }),
    },
  }

  self.setFeedbackDefinitions(definitions)
}
