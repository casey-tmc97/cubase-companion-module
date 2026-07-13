export const TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed
// Dedicated channel for the Markers phase script (Cubanion_Markers.js),
// separate from TRANSPORT_CHANNEL so each phase's note numbering is fully
// self-contained -- see ADR-006.
export const MARKERS_CHANNEL = 14 // MIDI channel 15, zero-indexed

export enum TransportNote {
  Play = 0,
  Stop = 1,
  Record = 2,
  // Return to Zero/Cycle/Click/Rewind/Forward were built, unit-tested, and
  // (all but Return to Zero) verified live before being trimmed out of the
  // v1.0 release for scope, then restored here -- see the original
  // 2026-07-08 Phase 1 design spec for the full rationale.
  ReturnToZero = 3,
  Cycle = 4,
  Click = 5,
  Rewind = 6,
  Forward = 7,
  Heartbeat = 9,
  // Dedicated state-feedback notes (Cubase -> Companion only), separate from
  // the trigger notes above (Companion -> Cubase). ADR-004 originally had
  // Play/Record's feedback share the same note as their trigger; that made
  // the Cubase script's own feedback output loop back into its own input
  // binding on the shared loopMIDI port, re-triggering the toggle and making
  // it flip back and forth on its own (confirmed via direct MIDI trace of
  // Cubase's mOnProcessValueChange -- see ADR-004 for detail). Splitting
  // feedback onto its own notes, in the 10+ range ADR-004 reserved for
  // exactly this, means the Cubase script's own output never matches what its
  // input binding is listening for. Return to Zero/Rewind/Forward have no
  // state note -- they're one-shot triggers with no persistent on/off state.
  PlayState = 10,
  RecordState = 11,
  CycleState = 12,
  ClickState = 13,
}

// Markers phase note map, on MARKERS_CHANNEL -- entirely separate from
// TransportNote's channel, so this enum's numbering never needs to account
// for what Transport has already claimed. One-shot trigger, Companion ->
// Cubase only; no feedback and no heartbeat on this channel (connectivity is
// already tracked via TransportNote.Heartbeat, since both bindings share the
// same underlying MidiConnection). See ADR-006 and
// docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
export enum MarkerNote {
  AddMarker = 0,
  // Next/Previous Marker and To Marker 1-9 were built, unit-tested, and
  // verified live before being trimmed out of the v1.0 release for scope,
  // then restored here -- see docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
  NextMarker = 1,
  PreviousMarker = 2,
  ToMarker1 = 3,
  ToMarker2 = 4,
  ToMarker3 = 5,
  ToMarker4 = 6,
  ToMarker5 = 7,
  ToMarker6 = 8,
  ToMarker7 = 9,
  ToMarker8 = 10,
  ToMarker9 = 11,
}

export interface DecodedNote {
  channel: number
  note: number
  velocity: number
  isOn: boolean
}

export function encodeNoteOn(channel: number, note: number, velocity = 127): number[] {
  return [0x90 | channel, note, velocity]
}

export function encodeNoteOff(channel: number, note: number): number[] {
  return [0x80 | channel, note, 0]
}

export function encodeTrigger(channel: number, note: number): number[][] {
  return [encodeNoteOn(channel, note), encodeNoteOff(channel, note)]
}

// Only TransportNote.Heartbeat/*State notes (TRANSPORT_CHANNEL) are ever
// received from Cubase -- Markers has nothing incoming to decode (see
// MarkerNote's doc comment), so a message on MARKERS_CHANNEL is correctly
// rejected here, same as any other unrecognized channel.
export function decodeMidiMessage(bytes: number[]): DecodedNote | null {
  if (bytes.length < 3) return null

  const status = bytes[0]
  const messageType = status & 0xf0
  const channel = status & 0x0f
  const note = bytes[1]
  const velocity = bytes[2]

  if (channel !== TRANSPORT_CHANNEL) return null
  if (messageType !== 0x90 && messageType !== 0x80) return null

  const isOn = messageType === 0x90 && velocity > 0
  return { channel, note, velocity: isOn ? velocity : 0, isOn }
}
