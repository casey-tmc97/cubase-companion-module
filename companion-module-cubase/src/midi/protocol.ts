export const TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed

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
}

export interface DecodedNote {
  channel: number
  note: number
  velocity: number
  isOn: boolean
}

export function encodeNoteOn(note: number, velocity = 127): number[] {
  return [0x90 | TRANSPORT_CHANNEL, note, velocity]
}

export function encodeNoteOff(note: number): number[] {
  return [0x80 | TRANSPORT_CHANNEL, note, 0]
}

export function encodeTrigger(note: number): number[][] {
  return [encodeNoteOn(note), encodeNoteOff(note)]
}

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
