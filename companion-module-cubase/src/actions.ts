import type {
  CompanionActionDefinitions,
  CompanionFeedbackDefinitions,
  CompanionPresetDefinitions,
  CompanionPresetSection,
} from '@companion-module/base'
import { TransportNote, MarkerNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL } from './midi/protocol.js'

export interface ModuleLike {
  midi: {
    sendTrigger(channel: number, note: number): void
    sendNoteOn(note: number): void
    sendNoteOff(note: number): void
    getTransportState(): { playing: boolean; recording: boolean }
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
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Play),
    },
    // mStop is a plain (non-toggle, non-command) value binding in the Cubase
    // script, so every write to it invokes Stop -- sendTrigger's Note On +
    // Note Off pair would fire Stop twice in the same instant, which Cubase
    // treats the same as a real double-press of Stop while already stopped
    // (natively returns the cursor to the start position). Sending only Note
    // On avoids the second write.
    stop: {
      name: 'Stop',
      options: [],
      callback: async () => self.midi.sendNoteOn(TransportNote.Stop),
    },
    // NOTE: previously changed to sendNoteOn-only under the hypothesis that
    // .setTypeToggle() reacts to both MIDI edges and self-cancels. Reverted --
    // that made Record stop responding at all, showing Cubase's toggle needs
    // the full Note On + Note Off pair to register at all. Root cause of the
    // "doesn't latch" symptom is still open; see connection.ts's self-echo
    // suppression comment for the investigation so far.
    record: {
      name: 'Record',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Record),
    },
    // Markers (Phase 3): one-shot trigger on MARKERS_CHANNEL, no feedback --
    // see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md
    // and ADR-006.
    addMarker: {
      name: 'Add Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker),
    },
  }

  self.setActionDefinitions(definitions)
}
