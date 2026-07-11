import { TransportNote } from './protocol.js'

export interface TransportState {
  playing: boolean
  recording: boolean
}

export function createInitialTransportState(): TransportState {
  return {
    playing: false,
    recording: false,
  }
}

export function applyStateNote(state: TransportState, note: number, isOn: boolean): TransportState {
  switch (note) {
    case TransportNote.PlayState:
      return { ...state, playing: isOn }
    case TransportNote.RecordState:
      return { ...state, recording: isOn }
    default:
      return state
  }
}

export function isStopped(state: TransportState): boolean {
  return !state.playing && !state.recording
}
