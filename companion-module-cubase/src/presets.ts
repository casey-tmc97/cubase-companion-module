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

export function UpdatePresets(self: ModuleLike): void {
  const presets: CompanionPresetDefinitions = {
    play: preset('Play', 'play', 'playing'),
    stop: preset('Stop', 'stop'),
    record: preset('Record', 'record', 'recording'),
    returnToZero: preset('Return to Zero', 'returnToZero'),
    toggleCycle: preset('Cycle', 'toggleCycle', 'cycleActive'),
    toggleClick: preset('Click', 'toggleClick', 'clickActive'),
    rewind: preset('Rewind', 'rewind'),
    forward: preset('Forward', 'forward'),
    cubaseConnected: {
      type: 'simple',
      name: 'Cubase Connected',
      style: {
        text: 'Cubase\\nConnected',
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
      id: 'status',
      name: 'Status',
      definitions: ['cubaseConnected'],
    },
  ]

  self.setPresetDefinitions(structure, presets)
}
