import type { CompanionPresetDefinitions, CompanionPresetSection, CompanionSimplePresetDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { ModuleLike } from './actions.js'

// NOTE: this file intentionally deviates from the task-8 brief's sample code.
// The brief was written against an older @companion-module/base API that
// exported `CompanionButtonPresetDefinition` (preset `type: 'button'`) and a
// single-argument `setPresetDefinitions(presets)`. The version actually
// installed (2.1.1) instead exposes `CompanionSimplePresetDefinition`
// (`type: 'simple'`) and a two-argument `setPresetDefinitions(structure,
// presets)`, where `structure` groups preset ids into named sections. See
// task-8-report.md for details.

function preset(text: string, actionId: string, feedbackId?: string): CompanionSimplePresetDefinition {
  return {
    type: 'simple',
    name: text,
    style: {
      text,
      size: '14',
      color: combineRgb(255, 255, 255),
      bgcolor: combineRgb(0, 0, 0),
    },
    steps: [
      {
        down: [{ actionId, options: {} }],
        up: [],
      },
    ],
    feedbacks: feedbackId ? [{ feedbackId, options: {}, style: {} }] : [],
  }
}

// For hold-style actions (Rewind/Forward -- see actions.ts) where press and
// release must send different MIDI messages (Note On to start, Note Off to
// stop), unlike `preset()`'s buttons which only ever fire on press.
function holdPreset(text: string, downActionId: string, upActionId: string): CompanionSimplePresetDefinition {
  return {
    type: 'simple',
    name: text,
    style: {
      text,
      size: '14',
      color: combineRgb(255, 255, 255),
      bgcolor: combineRgb(0, 0, 0),
    },
    steps: [
      {
        down: [{ actionId: downActionId, options: {} }],
        up: [{ actionId: upActionId, options: {} }],
      },
    ],
    feedbacks: [],
  }
}

const TRANSPORT_PRESET_IDS = [
  'play',
  'stop',
  'record',
  'returnToZero',
  'toggleCycle',
  'toggleClick',
  'rewind',
  'forward',
] as const

const MARKER_PRESET_IDS = [
  'addMarker',
  'nextMarker',
  'previousMarker',
  'toMarker1',
  'toMarker2',
  'toMarker3',
  'toMarker4',
  'toMarker5',
  'toMarker6',
  'toMarker7',
  'toMarker8',
  'toMarker9',
  'setMarker1',
  'setMarker2',
  'setMarker3',
  'setMarker4',
  'setMarker5',
  'setMarker6',
  'setMarker7',
  'setMarker8',
  'setMarker9',
] as const

const PUNCH_PRESET_IDS = ['setPunchIn', 'setPunchOut', 'autoPunchIn', 'autoPunchOut'] as const

export function UpdatePresets(self: ModuleLike): void {
  const presets: CompanionPresetDefinitions = {
    play: preset('Play', 'play', 'playing'),
    stop: preset('Stop', 'stop'),
    record: preset('Record', 'record', 'recording'),
    returnToZero: preset('Return to Zero', 'returnToZero'),
    toggleCycle: preset('Cycle', 'toggleCycle', 'cycleActive'),
    toggleClick: preset('Click', 'toggleClick', 'clickActive'),
    rewind: holdPreset('Rewind', 'rewind', 'rewindStop'),
    forward: holdPreset('Forward', 'forward', 'forwardStop'),
    addMarker: preset('Add Marker', 'addMarker'),
    nextMarker: preset('Next Marker', 'nextMarker'),
    previousMarker: preset('Previous Marker', 'previousMarker'),
    toMarker1: preset('To Marker 1', 'toMarker1'),
    toMarker2: preset('To Marker 2', 'toMarker2'),
    toMarker3: preset('To Marker 3', 'toMarker3'),
    toMarker4: preset('To Marker 4', 'toMarker4'),
    toMarker5: preset('To Marker 5', 'toMarker5'),
    toMarker6: preset('To Marker 6', 'toMarker6'),
    toMarker7: preset('To Marker 7', 'toMarker7'),
    toMarker8: preset('To Marker 8', 'toMarker8'),
    toMarker9: preset('To Marker 9', 'toMarker9'),
    setMarker1: preset('Set Marker 1', 'setMarker1'),
    setMarker2: preset('Set Marker 2', 'setMarker2'),
    setMarker3: preset('Set Marker 3', 'setMarker3'),
    setMarker4: preset('Set Marker 4', 'setMarker4'),
    setMarker5: preset('Set Marker 5', 'setMarker5'),
    setMarker6: preset('Set Marker 6', 'setMarker6'),
    setMarker7: preset('Set Marker 7', 'setMarker7'),
    setMarker8: preset('Set Marker 8', 'setMarker8'),
    setMarker9: preset('Set Marker 9', 'setMarker9'),
    setPunchIn: preset('Set Punch In', 'setPunchIn'),
    setPunchOut: preset('Set Punch Out', 'setPunchOut'),
    autoPunchIn: preset('Auto Punch In', 'autoPunchIn'),
    autoPunchOut: preset('Auto Punch Out', 'autoPunchOut'),
    cubaseConnected: {
      type: 'simple',
      name: 'Cubase Connected',
      style: {
        text: 'Cubase\nConnected',
        size: '14',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(0, 0, 0),
      },
      steps: [{ down: [], up: [] }],
      feedbacks: [{ feedbackId: 'cubaseConnected', options: {}, style: {} }],
    },
  }

  const structure: CompanionPresetSection[] = [
    {
      id: 'transport',
      name: 'Transport',
      definitions: [...TRANSPORT_PRESET_IDS],
    },
    {
      id: 'markers',
      name: 'Markers',
      definitions: [...MARKER_PRESET_IDS],
    },
    {
      id: 'punch',
      name: 'Punch',
      definitions: [...PUNCH_PRESET_IDS],
    },
    {
      id: 'status',
      name: 'Status',
      definitions: ['cubaseConnected'],
    },
  ]

  self.setPresetDefinitions(structure, presets)
}
