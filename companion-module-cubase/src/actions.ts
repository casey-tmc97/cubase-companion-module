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
    returnToZero: {
      name: 'Return to Zero',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.ReturnToZero),
    },
    toggleCycle: {
      name: 'Toggle Cycle',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Cycle),
    },
    toggleClick: {
      name: 'Toggle Click',
      options: [],
      callback: async () => self.midi.sendTrigger(TRANSPORT_CHANNEL, TransportNote.Click),
    },
    // Cubase's mRewind/mForward host values need a genuine hold (value stays 1
    // while pressed, back to 0 on release) to produce continuous motion -- a
    // Note On immediately followed by Note Off (sendTrigger's shape) never
    // registers as a hold, so these send only Note On. Presets pair each with
    // its *Stop counterpart (Note Off) wired to the button's release step.
    rewind: {
      name: 'Rewind (Hold)',
      options: [],
      callback: async () => self.midi.sendNoteOn(TransportNote.Rewind),
    },
    rewindStop: {
      name: 'Rewind Stop',
      options: [],
      callback: async () => self.midi.sendNoteOff(TransportNote.Rewind),
    },
    forward: {
      name: 'Forward (Hold)',
      options: [],
      callback: async () => self.midi.sendNoteOn(TransportNote.Forward),
    },
    forwardStop: {
      name: 'Forward Stop',
      options: [],
      callback: async () => self.midi.sendNoteOff(TransportNote.Forward),
    },
    // Markers (Phase 3): one-shot trigger on MARKERS_CHANNEL, no feedback --
    // see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md
    // and ADR-006.
    addMarker: {
      name: 'Add Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AddMarker),
    },
    // Next/Previous Marker and To Marker 1-9 were built, unit-tested, and
    // verified live before being trimmed out of the v1.0 release for scope,
    // then restored here -- see
    // docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
    nextMarker: {
      name: 'Next Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.NextMarker),
    },
    previousMarker: {
      name: 'Previous Marker',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.PreviousMarker),
    },
    toMarker1: {
      name: 'To Marker 1',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker1),
    },
    toMarker2: {
      name: 'To Marker 2',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker2),
    },
    toMarker3: {
      name: 'To Marker 3',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker3),
    },
    toMarker4: {
      name: 'To Marker 4',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker4),
    },
    toMarker5: {
      name: 'To Marker 5',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker5),
    },
    toMarker6: {
      name: 'To Marker 6',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker6),
    },
    toMarker7: {
      name: 'To Marker 7',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker7),
    },
    toMarker8: {
      name: 'To Marker 8',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker8),
    },
    toMarker9: {
      name: 'To Marker 9',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.ToMarker9),
    },
    // Set Marker 1-9 (assign/overwrite marker slot N at the current position)
    // and punch points: one-shot triggers on MARKERS_CHANNEL, no feedback --
    // see docs/superpowers/specs/2026-07-13-cubase-companion-punch-markers-design.md.
    setMarker1: {
      name: 'Set Marker 1',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker1),
    },
    setMarker2: {
      name: 'Set Marker 2',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker2),
    },
    setMarker3: {
      name: 'Set Marker 3',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker3),
    },
    setMarker4: {
      name: 'Set Marker 4',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker4),
    },
    setMarker5: {
      name: 'Set Marker 5',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker5),
    },
    setMarker6: {
      name: 'Set Marker 6',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker6),
    },
    setMarker7: {
      name: 'Set Marker 7',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker7),
    },
    setMarker8: {
      name: 'Set Marker 8',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker8),
    },
    setMarker9: {
      name: 'Set Marker 9',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetMarker9),
    },
    setPunchIn: {
      name: 'Set Punch In Position',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetPunchIn),
    },
    setPunchOut: {
      name: 'Set Punch Out Position',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.SetPunchOut),
    },
    autoPunchIn: {
      name: 'Auto Punch In',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AutoPunchIn),
    },
    autoPunchOut: {
      name: 'Auto Punch Out',
      options: [],
      callback: async () => self.midi.sendTrigger(MARKERS_CHANNEL, MarkerNote.AutoPunchOut),
    },
  }

  self.setActionDefinitions(definitions)
}
