import { Input, Output } from '@julusian/midi'

export function listInputPortNames(): string[] {
  const input = new Input()
  try {
    const count = input.getPortCount()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      names.push(input.getPortName(i))
    }
    return names
  } finally {
    input.closePort()
  }
}

export function listOutputPortNames(): string[] {
  const output = new Output()
  try {
    const count = output.getPortCount()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      names.push(output.getPortName(i))
    }
    return names
  } finally {
    output.closePort()
  }
}
