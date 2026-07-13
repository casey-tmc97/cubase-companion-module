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
    case TransportNote.PlayState:
      return { ...state, playing: isOn }
    case TransportNote.RecordState:
      return { ...state, recording: isOn }
    case TransportNote.CycleState:
      return { ...state, cycleActive: isOn }
    case TransportNote.ClickState:
      return { ...state, clickActive: isOn }
    default:
      return state
  }
}

export function isStopped(state: TransportState): boolean {
  return !state.playing && !state.recording
}
