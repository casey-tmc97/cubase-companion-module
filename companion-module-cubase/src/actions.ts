import type {
  CompanionActionDefinitions,
  CompanionFeedbackDefinitions,
  CompanionPresetDefinitions,
  CompanionPresetSection,
} from '@companion-module/base'
import { TransportNote } from './midi/protocol.js'

export interface ModuleLike {
  midi: {
    sendTrigger(note: number): void
    getTransportState(): { playing: boolean; recording: boolean; cycleActive: boolean; clickActive: boolean }
    isConnected(): boolean
  }
  setActionDefinitions(definitions: CompanionActionDefinitions): void
  setFeedbackDefinitions(definitions: CompanionFeedbackDefinitions): void
  setPresetDefinitions(structure: CompanionPresetSection[], definitions: CompanionPresetDefinitions): void
  checkFeedbacks(...feedbackIds: string[]): void
}

export function UpdateActions(self: ModuleLike): void {
  const definitions: CompanionActionDefinitions = {
    play: {
      name: 'Play',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Play),
    },
    stop: {
      name: 'Stop',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Stop),
    },
    record: {
      name: 'Record',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Record),
    },
    returnToZero: {
      name: 'Return to Zero',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.ReturnToZero),
    },
    toggleCycle: {
      name: 'Toggle Cycle',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Cycle),
    },
    toggleClick: {
      name: 'Toggle Click',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Click),
    },
    rewind: {
      name: 'Rewind',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Rewind),
    },
    forward: {
      name: 'Forward',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Forward),
    },
  }

  self.setActionDefinitions(definitions)
}
