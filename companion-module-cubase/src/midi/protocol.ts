export const TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed
// Dedicated channel for the Markers phase script (CubaseCompanion_Markers.js),
// separate from TRANSPORT_CHANNEL so each phase's note numbering is fully
// self-contained -- see ADR-006.
export const MARKERS_CHANNEL = 14 // MIDI channel 15, zero-indexed

// Dedicated channel for the Mixer phase section of the consolidated Cubase
// script -- next available channel per ADR-006's per-phase convention
// (Transport=15, Markers=14).
export const MIXER_CHANNEL = 12 // MIDI channel 13, zero-indexed

export enum TransportNote {
  Play = 0,
  Stop = 1,
  Record = 2,
  ReturnToZero = 3,
  Cycle = 4,
  Click = 5,
  Rewind = 6,
  Forward = 7,
  Heartbeat = 9,
  // Dedicated state-feedback notes (Cubase -> Companion only), separate from
  // the trigger notes above (Companion -> Cubase). ADR-004 originally had
  // Play/Record/Cycle/Click's feedback share the same note as their trigger;
  // that made the Cubase script's own feedback output loop back into its own
  // input binding on the shared loopMIDI port, re-triggering the toggle and
  // making it flip back and forth on its own (confirmed via direct MIDI trace
  // of Cubase's mOnProcessValueChange -- see ADR-004 for detail). Splitting
  // feedback onto its own notes, in the 10+ range ADR-004 reserved for
  // exactly this, means the Cubase script's own output never matches what its
  // input binding is listening for.
  PlayState = 10,
  RecordState = 11,
  CycleState = 12,
  ClickState = 13,
}

// Markers phase (Phase 3) note map, on MARKERS_CHANNEL -- entirely separate
// from TransportNote's channel, so this enum's numbering never needs to
// account for what Transport has already claimed. All one-shot triggers,
// Companion -> Cubase only; no feedback and no heartbeat on this channel
// (connectivity is already tracked via TransportNote.Heartbeat, since both
// scripts share the same underlying MidiConnection). See ADR-006 and
// docs/superpowers/specs/2026-07-09-cubase-companion-markers-design.md.
export enum MarkerNote {
  AddMarker = 0,
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

// Mixer phase (Phase 2) note map, on MIXER_CHANNEL. Mute/Solo are toggles
// with live feedback, so -- per ADR-004's split-note lesson -- each has a
// separate trigger note (Companion -> Cubase) and *State note (Cubase ->
// Companion); they must never share a note, or Cubase's own feedback output
// loops back into its own input binding and re-triggers the toggle.
export enum MixerNote {
  ToggleMute = 0,
  ToggleSolo = 1,
  MuteState = 2,
  SoloState = 3,
}

// Mixer phase relative-CC map, on MIXER_CHANNEL. Volume/Pan are discrete
// relative steps (see the Phase 2 design spec), sent as a single CC message
// per press using Cubase's relative-signed-bit encoding -- see
// encodeRelativeTick below. One-directional (Companion -> Cubase only); no
// level/position readout.
export enum MixerCC {
  VolumeDelta = 0,
  PanDelta = 1,
}

// Relative-signed-bit tick values for a single-detent nudge: 1-63 means
// "increment by that amount," 65-127 means "decrement by (value - 64)." A
// single press/tick always sends a magnitude-1 nudge; Cubase's own binding
// determines how much that actually moves the fader/pan.
const RELATIVE_TICK_UP = 1
const RELATIVE_TICK_DOWN = 65

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

export function encodeControlChange(channel: number, controller: number, value: number): number[] {
  return [0xb0 | channel, controller, value]
}

export function encodeRelativeTick(channel: number, controller: number, direction: 1 | -1): number[] {
  return encodeControlChange(channel, controller, direction === 1 ? RELATIVE_TICK_UP : RELATIVE_TICK_DOWN)
}

// Only TransportNote.Heartbeat/*State notes (TRANSPORT_CHANNEL) and
// MixerNote.MuteState/SoloState (MIXER_CHANNEL) are ever received from
// Cubase -- Markers has nothing incoming to decode (see MarkerNote's doc
// comment), so a message on MARKERS_CHANNEL is correctly rejected here, same
// as any other unrecognized channel. SysEx (channel name feedback) has no
// channel nibble and is decoded separately by decodeChannelNameSysEx, not
// here.
export function decodeMidiMessage(bytes: number[]): DecodedNote | null {
  if (bytes.length < 3) return null

  const status = bytes[0]
  const messageType = status & 0xf0
  const channel = status & 0x0f
  const note = bytes[1]
  const velocity = bytes[2]

  if (channel !== TRANSPORT_CHANNEL && channel !== MIXER_CHANNEL) return null
  if (messageType !== 0x90 && messageType !== 0x80) return null

  const isOn = messageType === 0x90 && velocity > 0
  return { channel, note, velocity: isOn ? velocity : 0, isOn }
}
