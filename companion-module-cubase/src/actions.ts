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
  // `any` here (rather than the default-generic bare `CompanionPresetSection`/
  // `CompanionPresetDefinitions`, i.e. `<InstanceTypes>`) is intentional: the real
  // `InstanceBase<TManifest>.setPresetDefinitions` is parameterized by the module's
  // own manifest type (see src/main.ts's `ModuleSchema`), which is a *different*
  // (structurally incompatible, since it narrows `config` to `ModuleConfig`) type
  // from the `InstanceTypes` default. Preset definitions embed their manifest type
  // deep in nested action/condition entries, so method bivariance doesn't paper over
  // the mismatch the way it does for setActionDefinitions/setFeedbackDefinitions.
  // `ModuleLike` only needs structural duck-typing for tests, not manifest-accurate
  // typing, so `any` here is the simplest fix that keeps `ModuleInstance` (main.ts)
  // assignable to `ModuleLike` without weakening runtime behavior.
  setPresetDefinitions(structure: CompanionPresetSection<any>[], definitions: CompanionPresetDefinitions<any>): void
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
