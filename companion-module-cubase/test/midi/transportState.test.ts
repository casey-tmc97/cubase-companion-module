import { describe, it, expect } from 'vitest'
import { TransportNote } from '../../src/midi/protocol.js'
import { createInitialTransportState, applyStateNote, isStopped } from '../../src/midi/transportState.js'

describe('createInitialTransportState', () => {
  it('starts with everything false', () => {
    expect(createInitialTransportState()).toEqual({
      playing: false,
      recording: false,
    })
  })
})

describe('applyStateNote', () => {
  it('sets playing true on PlayState note-on', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, TransportNote.PlayState, true)
    expect(next.playing).toBe(true)
  })

  it('sets playing false on PlayState note-off', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.PlayState, false)
    expect(next.playing).toBe(false)
  })

  it('sets recording independently of playing', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.RecordState, true)
    expect(next).toEqual({
      playing: true,
      recording: true,
    })
  })

  // The Cubase script's own feedback for a *State note loops back into
  // Companion's input the same way any message on the shared loopMIDI port
  // does (see connection.ts's self-echo suppression), but the raw trigger
  // notes (Play/Record) themselves must NOT drive state anymore. Sending
  // feedback on those notes made Cubase's own input binding re-ingest its
  // own feedback as a fresh button press, causing the toggle to flip back
  // and forth on its own -- see ADR-004's note-map split. Dedicated *State
  // notes (10-11) close that loop; this locks in that the old trigger notes
  // are now inert for state purposes.
  it('does not change state for the raw trigger notes anymore', () => {
    const state = createInitialTransportState()
    expect(applyStateNote(state, TransportNote.Play, true)).toEqual(state)
    expect(applyStateNote(state, TransportNote.Record, true)).toEqual(state)
  })

  it('returns an unchanged state for an unrecognized note number', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, 99, true)
    expect(next).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state = createInitialTransportState()
    applyStateNote(state, TransportNote.PlayState, true)
    expect(state.playing).toBe(false)
  })
})

describe('isStopped', () => {
  it('is true when neither playing nor recording', () => {
    expect(isStopped(createInitialTransportState())).toBe(true)
  })

  it('is false while playing', () => {
    expect(isStopped({ ...createInitialTransportState(), playing: true })).toBe(false)
  })

  it('is false while recording', () => {
    expect(isStopped({ ...createInitialTransportState(), recording: true })).toBe(false)
  })
})
