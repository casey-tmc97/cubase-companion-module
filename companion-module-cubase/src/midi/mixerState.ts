import { MixerNote } from './protocol.js'

export interface MixerState {
  muted: boolean
  solo: boolean
  selectedChannelName: string | null
}

export function createInitialMixerState(): MixerState {
  return {
    muted: false,
    solo: false,
    selectedChannelName: null,
  }
}

export function applyMixerStateNote(state: MixerState, note: number, isOn: boolean): MixerState {
  switch (note) {
    case MixerNote.MuteState:
      return { ...state, muted: isOn }
    case MixerNote.SoloState:
      return { ...state, solo: isOn }
    default:
      return state
  }
}

export function applyChannelName(state: MixerState, name: string | null): MixerState {
  if (name === state.selectedChannelName) return state
  return { ...state, selectedChannelName: name }
}
