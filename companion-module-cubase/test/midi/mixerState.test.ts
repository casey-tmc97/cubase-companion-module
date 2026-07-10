import { describe, it, expect } from 'vitest'
import { MixerNote } from '../../src/midi/protocol.js'
import { createInitialMixerState, applyMixerStateNote, applyChannelName } from '../../src/midi/mixerState.js'

describe('createInitialMixerState', () => {
  it('starts unmuted, not soloed, with no selected channel name', () => {
    expect(createInitialMixerState()).toEqual({
      muted: false,
      solo: false,
      selectedChannelName: null,
    })
  })
})

describe('applyMixerStateNote', () => {
  it('sets muted true on MuteState note-on', () => {
    const state = createInitialMixerState()
    const next = applyMixerStateNote(state, MixerNote.MuteState, true)
    expect(next.muted).toBe(true)
  })

  it('sets muted false on MuteState note-off', () => {
    const state = { ...createInitialMixerState(), muted: true }
    const next = applyMixerStateNote(state, MixerNote.MuteState, false)
    expect(next.muted).toBe(false)
  })

  it('sets solo independently of muted', () => {
    const state = { ...createInitialMixerState(), muted: true }
    const next = applyMixerStateNote(state, MixerNote.SoloState, true)
    expect(next).toEqual({ muted: true, solo: true, selectedChannelName: null })
  })

  it('does not change state for the raw trigger notes', () => {
    const state = createInitialMixerState()
    expect(applyMixerStateNote(state, MixerNote.ToggleMute, true)).toEqual(state)
    expect(applyMixerStateNote(state, MixerNote.ToggleSolo, true)).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state = createInitialMixerState()
    applyMixerStateNote(state, MixerNote.MuteState, true)
    expect(state.muted).toBe(false)
  })
})

describe('applyChannelName', () => {
  it('sets the selected channel name', () => {
    const state = createInitialMixerState()
    const next = applyChannelName(state, 'Vocal')
    expect(next.selectedChannelName).toBe('Vocal')
  })

  it('returns the same object reference when the name is unchanged', () => {
    const state = applyChannelName(createInitialMixerState(), 'Vocal')
    const next = applyChannelName(state, 'Vocal')
    expect(next).toBe(state)
  })

  it('can clear the name back to null', () => {
    const state = applyChannelName(createInitialMixerState(), 'Vocal')
    const next = applyChannelName(state, null)
    expect(next.selectedChannelName).toBeNull()
  })
})
