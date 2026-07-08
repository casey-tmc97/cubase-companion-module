import type { SomeCompanionConfigField, JsonObject, DropdownChoice } from '@companion-module/base'
import { listInputPortNames, listOutputPortNames } from './midi/ports.js'

export interface ModuleConfig extends JsonObject {
  inPortName: string
  outPortName: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
  const inputChoices: DropdownChoice[] = listInputPortNames().map((name) => ({ id: name, label: name }))
  const outputChoices: DropdownChoice[] = listOutputPortNames().map((name) => ({ id: name, label: name }))

  return [
    {
      type: 'dropdown',
      id: 'inPortName',
      label: 'MIDI In',
      width: 6,
      default: inputChoices[0]?.id ?? '',
      choices: inputChoices,
    },
    {
      type: 'dropdown',
      id: 'outPortName',
      label: 'MIDI Out',
      width: 6,
      default: outputChoices[0]?.id ?? '',
      choices: outputChoices,
    },
  ]
}
