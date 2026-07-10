import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_CHANNEL,
  MARKERS_CHANNEL,
  MIXER_CHANNEL,
  TransportNote,
  MarkerNote,
  MixerCC,
  encodeNoteOn,
  encodeNoteOff,
  encodeTrigger,
  encodeControlChange,
  encodeRelativeTick,
  decodeMidiMessage,
} from '../../src/midi/protocol.js'

describe('protocol constants', () => {
  it('uses zero-indexed channel 15 for MIDI channel 16 (Transport)', () => {
    expect(TRANSPORT_CHANNEL).toBe(15)
  })

  it('uses zero-indexed channel 14 for MIDI channel 15 (Markers)', () => {
    expect(MARKERS_CHANNEL).toBe(14)
  })
})

describe('encodeNoteOn', () => {
  it('encodes a Note On with default full velocity', () => {
    expect(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Play)).toEqual([0x9f, 0, 127])
  })

  it('encodes a Note On with a custom velocity', () => {
    expect(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Record, 100)).toEqual([0x9f, 2, 100])
  })

  it('encodes a Note On on the Markers channel', () => {
    expect(encodeNoteOn(MARKERS_CHANNEL, MarkerNote.AddMarker)).toEqual([0x9e, 0, 127])
  })
})

describe('encodeNoteOff', () => {
  it('encodes a Note Off with velocity 0', () => {
    expect(encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.Stop)).toEqual([0x8f, 1, 0])
  })

  it('encodes a Note Off on the Markers channel', () => {
    expect(encodeNoteOff(MARKERS_CHANNEL, MarkerNote.ToMarker9)).toEqual([0x8e, 11, 0])
  })
})

describe('encodeTrigger', () => {
  it('produces a Note On followed by a Note Off for the same note', () => {
    expect(encodeTrigger(TRANSPORT_CHANNEL, TransportNote.Rewind)).toEqual([
      [0x9f, 6, 127],
      [0x8f, 6, 0],
    ])
  })

  it('produces a Note On followed by a Note Off on the Markers channel', () => {
    expect(encodeTrigger(MARKERS_CHANNEL, MarkerNote.NextMarker)).toEqual([
      [0x9e, 1, 127],
      [0x8e, 1, 0],
    ])
  })
})

describe('decodeMidiMessage', () => {
  it('decodes a Note On as isOn: true', () => {
    expect(decodeMidiMessage([0x9f, 0, 127])).toEqual({
      channel: 15,
      note: 0,
      velocity: 127,
      isOn: true,
    })
  })

  it('decodes a Note On with velocity 0 as isOn: false (running status off)', () => {
    expect(decodeMidiMessage([0x9f, 2, 0])).toEqual({
      channel: 15,
      note: 2,
      velocity: 0,
      isOn: false,
    })
  })

  it('decodes a Note Off as isOn: false', () => {
    expect(decodeMidiMessage([0x8f, 4, 0])).toEqual({
      channel: 15,
      note: 4,
      velocity: 0,
      isOn: false,
    })
  })

  it('returns null for messages on a different channel', () => {
    expect(decodeMidiMessage([0x90, 0, 127])).toBeNull()
  })

  it('returns null for messages on the Markers channel (decode is Transport-only; Markers has no incoming state)', () => {
    expect(decodeMidiMessage([0x9e, 0, 127])).toBeNull()
  })

  it('returns null for non Note On/Off status bytes', () => {
    expect(decodeMidiMessage([0xbf, 1, 127])).toBeNull()
  })

  it('returns null for malformed (too short) messages', () => {
    expect(decodeMidiMessage([0x9f, 0])).toBeNull()
  })
})

describe('Mixer protocol constants', () => {
  it('uses zero-indexed channel 12 for MIDI channel 13 (Mixer)', () => {
    expect(MIXER_CHANNEL).toBe(12)
  })
})

describe('encodeControlChange', () => {
  it('encodes a Control Change message', () => {
    expect(encodeControlChange(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)).toEqual([0xbc, 0, 1])
  })
})

describe('encodeRelativeTick', () => {
  it('encodes an "up" tick as value 1', () => {
    expect(encodeRelativeTick(MIXER_CHANNEL, MixerCC.VolumeDelta, 1)).toEqual([0xbc, 0, 1])
  })

  it('encodes a "down" tick as value 65', () => {
    expect(encodeRelativeTick(MIXER_CHANNEL, MixerCC.PanDelta, -1)).toEqual([0xbc, 1, 65])
  })
})
