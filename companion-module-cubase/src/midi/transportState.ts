import { TransportNote } from './protocol.js'

export interface TransportState {
  playing: boolean
  recording: boolean
  cycleActive: boolean
  clickActive: boolean
}

export function createInitialTransportState(): TransportState {
  return {
    playing: false,
    recording: false,
    cycleActive: false,
    clickActive: false,
  }
}

export function applyStateNote(state: TransportState, note: number, isOn: boolean): TransportState {
  switch (note) {
    case TransportNote.Play:
      return { ...state, playing: isOn }
    case TransportNote.Record:
      return { ...state, recording: isOn }
    case TransportNote.Cycle:
      return { ...state, cycleActive: isOn }
    case TransportNote.Click:
      return { ...state, clickActive: isOn }
    default:
      return state
  }
}

export function isStopped(state: TransportState): boolean {
  return !state.playing && !state.recording
}
