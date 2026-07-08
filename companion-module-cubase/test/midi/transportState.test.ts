import { describe, it, expect } from 'vitest'
import { TransportNote } from '../../src/midi/protocol.js'
import {
  createInitialTransportState,
  applyStateNote,
  isStopped,
} from '../../src/midi/transportState.js'

describe('createInitialTransportState', () => {
  it('starts with everything false', () => {
    expect(createInitialTransportState()).toEqual({
      playing: false,
      recording: false,
      cycleActive: false,
      clickActive: false,
    })
  })
})

describe('applyStateNote', () => {
  it('sets playing true on Play note-on', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, TransportNote.Play, true)
    expect(next.playing).toBe(true)
  })

  it('sets playing false on Play note-off', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.Play, false)
    expect(next.playing).toBe(false)
  })

  it('sets recording independently of playing', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.Record, true)
    expect(next).toEqual({
      playing: true,
      recording: true,
      cycleActive: false,
      clickActive: false,
    })
  })

  it('sets cycleActive on Cycle note', () => {
    const next = applyStateNote(createInitialTransportState(), TransportNote.Cycle, true)
    expect(next.cycleActive).toBe(true)
  })

  it('sets clickActive on Click note', () => {
    const next = applyStateNote(createInitialTransportState(), TransportNote.Click, true)
    expect(next.clickActive).toBe(true)
  })

  it('returns an unchanged state for notes with no persistent state (e.g. Rewind)', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, TransportNote.Rewind, true)
    expect(next).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state = createInitialTransportState()
    applyStateNote(state, TransportNote.Play, true)
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
