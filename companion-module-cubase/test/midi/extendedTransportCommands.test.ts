import { describe, it, expect } from 'vitest'
import { EXTENDED_TRANSPORT_CHANNEL, EXTENDED_TRANSPORT_COMMANDS } from '../../src/midi/extendedTransportCommands.js'

describe('EXTENDED_TRANSPORT_COMMANDS', () => {
  it('uses zero-indexed channel 13 for MIDI channel 14', () => {
    expect(EXTENDED_TRANSPORT_CHANNEL).toBe(13)
  })

  it('has exactly 120 commands', () => {
    expect(EXTENDED_TRANSPORT_COMMANDS).toHaveLength(120)
  })

  it('has unique ids for every command', () => {
    const ids = EXTENDED_TRANSPORT_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spot-checks specific entries against the design spec', () => {
    expect(EXTENDED_TRANSPORT_COMMANDS[0]).toEqual({
      id: 'setLeftLocator',
      label: 'Set Left Locator',
      command: 'Set Left Locator',
      group: 'Locators',
    })
    expect(EXTENDED_TRANSPORT_COMMANDS[59]).toEqual({
      id: 'fastForward',
      label: 'Fast Forward',
      command: 'Fast Forward',
      group: 'Transport Extras',
    })
    expect(EXTENDED_TRANSPORT_COMMANDS[119]).toEqual({
      id: 'tempoTrackRehearsalModeOnOff',
      label: 'Tempo Track Rehearsal Mode',
      command: 'Tempo Track Rehearsal Mode On/Off',
      group: 'Setup/Misc',
    })
  })

  it('has 18 distinct groups matching the design spec group counts', () => {
    const counts: Record<string, number> = {}
    for (const c of EXTENDED_TRANSPORT_COMMANDS) {
      counts[c.group] = (counts[c.group] ?? 0) + 1
    }
    expect(counts).toEqual({
      Locators: 10,
      'Cycle Markers': 21,
      'Punch (Extra)': 6,
      'Marker Misc': 3,
      'Selection Playback': 10,
      'Loop/Locate Selection': 4,
      'Event/Hitpoint Nav': 4,
      'Transport Extras': 5,
      'Restart/Start Position': 3,
      'Nudge Cursor': 8,
      'Nudge Frame/Step': 4,
      Jog: 2,
      Shuttle: 14,
      'Record Modes': 10,
      'MIDI Retrospective Record': 3,
      'Tempo/Time': 2,
      'Pre/Post-Roll & Sync': 6,
      'Setup/Misc': 5,
    })
  })
})
