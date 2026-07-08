# Cubase Companion Transport (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Transport slice of `companion-module-cubase`: a Bitfocus Companion module and a companion Cubase MIDI Remote script that together give Companion buttons two-way control over Cubase's transport (Play, Stop, Record, Return to Zero, Cycle, Click, Rewind, Forward), including live feedback.

**Architecture:** Two independent halves talk over a plain OS MIDI port pair, on a dedicated MIDI channel 16, using a small fixed note-number contract. The Companion module (`companion-module-cubase/`) is a TypeScript package on `@companion-module/base` + `@julusian/midi`. The Cubase side (`cubase-midi-remote/`) is a single JavaScript file using Steinberg's documented MIDI Remote API (`midiremote_api_v1`), placed in Cubase's Driver Scripts folder.

**Tech Stack:** TypeScript, Node.js 18+, `@companion-module/base` ^2.0.0, `@julusian/midi` ^3.6.1, Vitest for unit tests, `midiremote_api_v1` (ES5 JavaScript, Cubase's embedded scripting engine) for the Cubase-side script.

## Global Constraints

- MIDI channel for all protocol messages is **16**, which is `15` (zero-indexed) in every API call below (`@julusian/midi` message bytes and Steinberg's `bindToNote(channel, note)` both use zero-indexed channels).
- Note-number contract (fixed, from the approved spec): Play=0, Stop=1, Record=2, ReturnToZero=3, Cycle=4, Click=5, Rewind=6, Forward=7, Heartbeat=9.
- Heartbeat timeout for "Cubase Connected" feedback is **5000ms** of silence; Cubase sends a heartbeat pulse roughly every **2000ms**.
- Only pure logic (MIDI byte encode/decode, transport state reducers, connection-timeout state) gets unit tests in this plan. Anything that opens a real `@julusian/midi` port or runs inside Cubase's script engine cannot be unit tested and is instead covered by the manual end-to-end test in Task 10.
- Package manager: npm. Node engines field: `>=18.0.0`.
- All new source files use `.ts` + ESM (`"type": "module"` in package.json, `.js` extension in relative imports per TypeScript's `NodeNext` module resolution).

---

## File Structure

```
companion-module-cubase/
  package.json
  tsconfig.json
  tsconfig.build.json
  companion/
    manifest.json
    HELP.md
  src/
    main.ts                    # ModuleInstance — wires everything together
    config.ts                  # GetConfigFields + ModuleConfig type
    upgrades.ts                # empty UpgradeScripts array (required by runEntrypoint)
    actions.ts                 # UpdateActions(self)
    feedbacks.ts                # UpdateFeedbacks(self)
    presets.ts                  # UpdatePresets(self)
    midi/
      protocol.ts               # pure: note/channel constants, encode/decode
      transportState.ts         # pure: transport state reducer + isStopped()
      connectionState.ts        # pure: heartbeat timeout state machine
      ports.ts                  # thin: list MIDI port names via @julusian/midi
      connection.ts             # thin: opens real ports, wires protocol+state, emits events
  test/
    midi/
      protocol.test.ts
      transportState.test.ts
      connectionState.test.ts
    actions.test.ts
    feedbacks.test.ts

cubase-midi-remote/
  Local/
    CubaseCompanion/
      Transport/
        CubaseCompanion_Transport.js   # the actual MIDI Remote driver script

docs/
  cubase-companion-transport-setup.md  # human setup instructions (Task 11)
```

- `midi/protocol.ts`, `midi/transportState.ts`, `midi/connectionState.ts` are pure and fully unit tested — they carry the actual "protocol" logic.
- `midi/ports.ts` and `midi/connection.ts` are thin adapters over `@julusian/midi` — no unit tests, covered by manual testing.
- `actions.ts` / `feedbacks.ts` depend only on a small `MidiConnection` interface (not the real class), so they're unit tested against a fake.

---

### Task 1: Scaffold the Companion module package

**Files:**
- Create: `companion-module-cubase/package.json`
- Create: `companion-module-cubase/tsconfig.json`
- Create: `companion-module-cubase/tsconfig.build.json`
- Create: `companion-module-cubase/companion/manifest.json`
- Create: `companion-module-cubase/companion/HELP.md`
- Create: `companion-module-cubase/src/upgrades.ts`
- Create: `companion-module-cubase/.gitignore`

**Interfaces:**
- Produces: an npm package that later tasks add files to; `npm run build` and `npm test` must both succeed after this task (build produces nothing interesting yet beyond `upgrades.js`, test suite is empty but passes).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "companion-module-cubase",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "main": "dist/main.js",
  "scripts": {
    "build": "rimraf dist && tsc -p tsconfig.build.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@companion-module/base": "^2.0.0",
    "@julusian/midi": "^3.6.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "rimraf": "^6.1.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": ["test"]
}
```

- [ ] **Step 4: Create `companion/manifest.json`**

```json
{
  "id": "cubase",
  "name": "Steinberg Cubase",
  "shortname": "cubase",
  "description": "Control Cubase transport via the MIDI Remote API",
  "version": "0.1.0",
  "license": "MIT",
  "repository": "https://github.com/example/companion-module-cubase.git",
  "bugs": "https://github.com/example/companion-module-cubase/issues",
  "manufacturer": "Steinberg",
  "products": ["Cubase 12+"],
  "keywords": ["daw", "midi", "transport"],
  "runtime": {
    "type": "node18",
    "api": "1.1.0",
    "entrypoint": "main.js"
  },
  "legacyIds": []
}
```

- [ ] **Step 5: Create `companion/HELP.md`**

```markdown
# Cubase

Controls Steinberg Cubase's transport (Play, Stop, Record, Return to Zero,
Cycle, Click, Rewind, Forward) with live feedback, via Cubase's MIDI Remote
API.

## Setup

1. Install the companion Cubase MIDI Remote script (see
   `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`
   in this repo) into your Cubase MIDI Remote Driver Scripts folder, and add
   it as a controller under Studio > Studio Setup > MIDI Remote.
2. Point this module's MIDI In / MIDI Out config fields at the same virtual
   or network MIDI port pair the script is bound to.
3. The "Cubase Connected" feedback lights up once the script's heartbeat is
   received; if it stays off, double check the port names match on both
   sides and that the script is active in Studio Setup.
```

- [ ] **Step 6: Create `src/upgrades.ts`**

```typescript
import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = []
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 8: Install dependencies**

Run: `cd companion-module-cubase && npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 9: Commit**

```bash
git add companion-module-cubase/package.json companion-module-cubase/tsconfig.json companion-module-cubase/tsconfig.build.json companion-module-cubase/companion/manifest.json companion-module-cubase/companion/HELP.md companion-module-cubase/src/upgrades.ts companion-module-cubase/.gitignore
git commit -m "chore: scaffold companion-module-cubase package"
```

---

### Task 2: MIDI protocol encode/decode (pure, TDD)

**Files:**
- Create: `companion-module-cubase/src/midi/protocol.ts`
- Test: `companion-module-cubase/test/midi/protocol.test.ts`

**Interfaces:**
- Produces: `TRANSPORT_CHANNEL: number`, `TransportNote` enum (`Play=0, Stop=1, Record=2, ReturnToZero=3, Cycle=4, Click=5, Rewind=6, Forward=7, Heartbeat=9`), `encodeNoteOn(note: number, velocity?: number): number[]`, `encodeNoteOff(note: number): number[]`, `encodeTrigger(note: number): number[][]`, `interface DecodedNote { channel: number; note: number; velocity: number; isOn: boolean }`, `decodeMidiMessage(bytes: number[]): DecodedNote | null`.

- [ ] **Step 1: Write the failing tests**

```typescript
// companion-module-cubase/test/midi/protocol.test.ts
import { describe, it, expect } from 'vitest'
import {
  TRANSPORT_CHANNEL,
  TransportNote,
  encodeNoteOn,
  encodeNoteOff,
  encodeTrigger,
  decodeMidiMessage,
} from '../../src/midi/protocol.js'

describe('protocol constants', () => {
  it('uses zero-indexed channel 15 for MIDI channel 16', () => {
    expect(TRANSPORT_CHANNEL).toBe(15)
  })
})

describe('encodeNoteOn', () => {
  it('encodes a Note On with default full velocity', () => {
    expect(encodeNoteOn(TransportNote.Play)).toEqual([0x9f, 0, 127])
  })

  it('encodes a Note On with a custom velocity', () => {
    expect(encodeNoteOn(TransportNote.Record, 100)).toEqual([0x9f, 2, 100])
  })
})

describe('encodeNoteOff', () => {
  it('encodes a Note Off with velocity 0', () => {
    expect(encodeNoteOff(TransportNote.Stop)).toEqual([0x8f, 1, 0])
  })
})

describe('encodeTrigger', () => {
  it('produces a Note On followed by a Note Off for the same note', () => {
    expect(encodeTrigger(TransportNote.Rewind)).toEqual([
      [0x9f, 6, 127],
      [0x8f, 6, 0],
    ])
  })
})

describe('decodeMidiMessage', () => {
  it('decodes a Note On as isOn: true', () => {
    expect(decodeMidiMessage([0x9f, 0, 127])).toEqual({
      channel: 15,
      note: 0,
      velocity: 127,
      isOn: true,
    })
  })

  it('decodes a Note On with velocity 0 as isOn: false (running status off)', () => {
    expect(decodeMidiMessage([0x9f, 2, 0])).toEqual({
      channel: 15,
      note: 2,
      velocity: 0,
      isOn: false,
    })
  })

  it('decodes a Note Off as isOn: false', () => {
    expect(decodeMidiMessage([0x8f, 4, 0])).toEqual({
      channel: 15,
      note: 4,
      velocity: 0,
      isOn: false,
    })
  })

  it('returns null for messages on a different channel', () => {
    expect(decodeMidiMessage([0x90, 0, 127])).toBeNull()
  })

  it('returns null for non Note On/Off status bytes', () => {
    expect(decodeMidiMessage([0xbf, 1, 127])).toBeNull()
  })

  it('returns null for malformed (too short) messages', () => {
    expect(decodeMidiMessage([0x9f, 0])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd companion-module-cubase && npx vitest run test/midi/protocol.test.ts`
Expected: FAIL — `Cannot find module '../../src/midi/protocol.js'`

- [ ] **Step 3: Implement `src/midi/protocol.ts`**

```typescript
export const TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed

export enum TransportNote {
  Play = 0,
  Stop = 1,
  Record = 2,
  ReturnToZero = 3,
  Cycle = 4,
  Click = 5,
  Rewind = 6,
  Forward = 7,
  Heartbeat = 9,
}

export interface DecodedNote {
  channel: number
  note: number
  velocity: number
  isOn: boolean
}

export function encodeNoteOn(note: number, velocity = 127): number[] {
  return [0x90 | TRANSPORT_CHANNEL, note, velocity]
}

export function encodeNoteOff(note: number): number[] {
  return [0x80 | TRANSPORT_CHANNEL, note, 0]
}

export function encodeTrigger(note: number): number[][] {
  return [encodeNoteOn(note), encodeNoteOff(note)]
}

export function decodeMidiMessage(bytes: number[]): DecodedNote | null {
  if (bytes.length < 3) return null

  const status = bytes[0]
  const messageType = status & 0xf0
  const channel = status & 0x0f
  const note = bytes[1]
  const velocity = bytes[2]

  if (channel !== TRANSPORT_CHANNEL) return null
  if (messageType !== 0x90 && messageType !== 0x80) return null

  const isOn = messageType === 0x90 && velocity > 0
  return { channel, note, velocity: isOn ? velocity : 0, isOn }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd companion-module-cubase && npx vitest run test/midi/protocol.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/protocol.ts companion-module-cubase/test/midi/protocol.test.ts
git commit -m "feat: add MIDI protocol encode/decode for transport note map"
```

---

### Task 3: Transport state reducer (pure, TDD)

**Files:**
- Create: `companion-module-cubase/src/midi/transportState.ts`
- Test: `companion-module-cubase/test/midi/transportState.test.ts`

**Interfaces:**
- Consumes: `TransportNote` from `./protocol.js` (Task 2).
- Produces: `interface TransportState { playing: boolean; recording: boolean; cycleActive: boolean; clickActive: boolean }`, `createInitialTransportState(): TransportState`, `applyStateNote(state: TransportState, note: number, isOn: boolean): TransportState`, `isStopped(state: TransportState): boolean`.

- [ ] **Step 1: Write the failing tests**

```typescript
// companion-module-cubase/test/midi/transportState.test.ts
import { describe, it, expect } from 'vitest'
import { TransportNote } from '../../src/midi/protocol.js'
import {
  createInitialTransportState,
  applyStateNote,
  isStopped,
} from '../../src/midi/transportState.js'

describe('createInitialTransportState', () => {
  it('starts with everything false', () => {
    expect(createInitialTransportState()).toEqual({
      playing: false,
      recording: false,
      cycleActive: false,
      clickActive: false,
    })
  })
})

describe('applyStateNote', () => {
  it('sets playing true on Play note-on', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, TransportNote.Play, true)
    expect(next.playing).toBe(true)
  })

  it('sets playing false on Play note-off', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.Play, false)
    expect(next.playing).toBe(false)
  })

  it('sets recording independently of playing', () => {
    const state = { ...createInitialTransportState(), playing: true }
    const next = applyStateNote(state, TransportNote.Record, true)
    expect(next).toEqual({
      playing: true,
      recording: true,
      cycleActive: false,
      clickActive: false,
    })
  })

  it('sets cycleActive on Cycle note', () => {
    const next = applyStateNote(createInitialTransportState(), TransportNote.Cycle, true)
    expect(next.cycleActive).toBe(true)
  })

  it('sets clickActive on Click note', () => {
    const next = applyStateNote(createInitialTransportState(), TransportNote.Click, true)
    expect(next.clickActive).toBe(true)
  })

  it('returns an unchanged state for notes with no persistent state (e.g. Rewind)', () => {
    const state = createInitialTransportState()
    const next = applyStateNote(state, TransportNote.Rewind, true)
    expect(next).toEqual(state)
  })

  it('does not mutate the input state', () => {
    const state = createInitialTransportState()
    applyStateNote(state, TransportNote.Play, true)
    expect(state.playing).toBe(false)
  })
})

describe('isStopped', () => {
  it('is true when neither playing nor recording', () => {
    expect(isStopped(createInitialTransportState())).toBe(true)
  })

  it('is false while playing', () => {
    expect(isStopped({ ...createInitialTransportState(), playing: true })).toBe(false)
  })

  it('is false while recording', () => {
    expect(isStopped({ ...createInitialTransportState(), recording: true })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd companion-module-cubase && npx vitest run test/midi/transportState.test.ts`
Expected: FAIL — `Cannot find module '../../src/midi/transportState.js'`

- [ ] **Step 3: Implement `src/midi/transportState.ts`**

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd companion-module-cubase && npx vitest run test/midi/transportState.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/transportState.ts companion-module-cubase/test/midi/transportState.test.ts
git commit -m "feat: add transport state reducer"
```

---

### Task 4: Connection (heartbeat timeout) state machine (pure, TDD)

**Files:**
- Create: `companion-module-cubase/src/midi/connectionState.ts`
- Test: `companion-module-cubase/test/midi/connectionState.test.ts`

**Interfaces:**
- Produces: `HEARTBEAT_TIMEOUT_MS: number` (5000), `class ConnectionState { constructor(now?: () => number); recordHeartbeat(): void; isConnected(): boolean }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// companion-module-cubase/test/midi/connectionState.test.ts
import { describe, it, expect } from 'vitest'
import { ConnectionState, HEARTBEAT_TIMEOUT_MS } from '../../src/midi/connectionState.js'

describe('ConnectionState', () => {
  it('is disconnected before any heartbeat is recorded', () => {
    const state = new ConnectionState(() => 0)
    expect(state.isConnected()).toBe(false)
  })

  it('is connected immediately after a heartbeat', () => {
    let now = 1000
    const state = new ConnectionState(() => now)
    state.recordHeartbeat()
    expect(state.isConnected()).toBe(true)
  })

  it('stays connected while within the timeout window', () => {
    let now = 1000
    const state = new ConnectionState(() => now)
    state.recordHeartbeat()
    now += HEARTBEAT_TIMEOUT_MS - 1
    expect(state.isConnected()).toBe(true)
  })

  it('becomes disconnected once the timeout window elapses', () => {
    let now = 1000
    const state = new ConnectionState(() => now)
    state.recordHeartbeat()
    now += HEARTBEAT_TIMEOUT_MS + 1
    expect(state.isConnected()).toBe(false)
  })

  it('a later heartbeat resets the timeout window', () => {
    let now = 1000
    const state = new ConnectionState(() => now)
    state.recordHeartbeat()
    now += HEARTBEAT_TIMEOUT_MS - 1
    state.recordHeartbeat()
    now += HEARTBEAT_TIMEOUT_MS - 1
    expect(state.isConnected()).toBe(true)
  })

  it('defaults to Date.now when no clock is injected', () => {
    const state = new ConnectionState()
    state.recordHeartbeat()
    expect(state.isConnected()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd companion-module-cubase && npx vitest run test/midi/connectionState.test.ts`
Expected: FAIL — `Cannot find module '../../src/midi/connectionState.js'`

- [ ] **Step 3: Implement `src/midi/connectionState.ts`**

```typescript
export const HEARTBEAT_TIMEOUT_MS = 5000

export class ConnectionState {
  private lastHeartbeatAt: number | null = null
  private readonly now: () => number

  constructor(now: () => number = Date.now) {
    this.now = now
  }

  recordHeartbeat(): void {
    this.lastHeartbeatAt = this.now()
  }

  isConnected(): boolean {
    if (this.lastHeartbeatAt === null) return false
    return this.now() - this.lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd companion-module-cubase && npx vitest run test/midi/connectionState.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add companion-module-cubase/src/midi/connectionState.ts companion-module-cubase/test/midi/connectionState.test.ts
git commit -m "feat: add heartbeat-based connection state machine"
```

---

### Task 5: MIDI port listing helper

**Files:**
- Create: `companion-module-cubase/src/midi/ports.ts`

**Interfaces:**
- Consumes: `@julusian/midi`'s `Input`/`Output` classes (`getPortCount()`, `getPortName(index)`).
- Produces: `listInputPortNames(): string[]`, `listOutputPortNames(): string[]` — used by `config.ts` (Task 6).

No unit test for this task: it only exists to enumerate real OS MIDI ports, which requires the actual `@julusian/midi` native binding and whatever MIDI ports/drivers are present on the machine. It's covered by the manual end-to-end test in Task 10 (the config dropdowns must show real port names).

- [ ] **Step 1: Implement `src/midi/ports.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd companion-module-cubase && npx tsc -p tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/src/midi/ports.ts
git commit -m "feat: add MIDI port name listing helper"
```

---

### Task 6: Module config fields

**Files:**
- Create: `companion-module-cubase/src/config.ts`

**Interfaces:**
- Consumes: `listInputPortNames`, `listOutputPortNames` from `./midi/ports.js` (Task 5).
- Produces: `interface ModuleConfig extends JsonObject { inPortName: string; outPortName: string }`, `GetConfigFields(): SomeCompanionConfigField[]` — used by `main.ts` (Task 9).

- [ ] **Step 1: Implement `src/config.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd companion-module-cubase && npx tsc -p tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/src/config.ts
git commit -m "feat: add module config fields for MIDI in/out ports"
```

---

### Task 7: Real MIDI connection wrapper

**Files:**
- Create: `companion-module-cubase/src/midi/connection.ts`

**Interfaces:**
- Consumes: `@julusian/midi`'s `Input`/`Output`; `TransportNote`, `encodeTrigger`, `decodeMidiMessage` from `./protocol.js` (Task 2); `TransportState`, `createInitialTransportState`, `applyStateNote` from `./transportState.js` (Task 3); `ConnectionState` from `./connectionState.js` (Task 4).
- Produces: `class MidiConnection extends EventEmitter` with:
  - `constructor(inPortName: string, outPortName: string)`
  - `open(): void` — opens both ports; if either port name isn't found, catches the throw from `@julusian/midi`, emits `'error'` with a message, and leaves the connection in its default disconnected state (no silent failure, per spec)
  - `close(): void`
  - `sendTrigger(note: number): void`
  - `getTransportState(): TransportState`
  - `isConnected(): boolean`
  - emits `'stateChanged'` (no payload) whenever `getTransportState()` or `isConnected()` would return something new, and `'error'` (with a `string` message) when a configured port can't be opened — `actions.ts` (Task 8) calls `sendTrigger`; `feedbacks.ts`/`main.ts` (Tasks 8, 9) read `getTransportState()`/`isConnected()` and listen for `'stateChanged'`/`'error'`.

No unit test for this task: it owns the real `Input`/`Output` port objects, which only work against actual OS MIDI ports. Covered by the manual end-to-end test in Task 10.

- [ ] **Step 1: Implement `src/midi/connection.ts`**

```typescript
import { EventEmitter } from 'node:events'
import { Input, Output } from '@julusian/midi'
import { TransportNote, encodeTrigger, decodeMidiMessage } from './protocol.js'
import { TransportState, createInitialTransportState, applyStateNote } from './transportState.js'
import { ConnectionState } from './connectionState.js'

export class MidiConnection extends EventEmitter {
  private readonly input = new Input()
  private readonly output = new Output()
  private transportState: TransportState = createInitialTransportState()
  private readonly connectionState = new ConnectionState()

  constructor(
    private readonly inPortName: string,
    private readonly outPortName: string,
  ) {
    super()
  }

  open(): void {
    this.input.on('message', (_deltaTime: number, message: number[]) => this.handleMessage(message))
    try {
      this.input.openPortByName(this.inPortName)
      this.output.openPortByName(this.outPortName)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.emit('error', `Could not open configured MIDI port(s): ${message}`)
    }
  }

  close(): void {
    this.input.closePort()
    this.output.closePort()
  }

  sendTrigger(note: number): void {
    for (const message of encodeTrigger(note)) {
      this.output.sendMessage(message)
    }
  }

  getTransportState(): TransportState {
    return this.transportState
  }

  isConnected(): boolean {
    return this.connectionState.isConnected()
  }

  private handleMessage(message: number[]): void {
    const decoded = decodeMidiMessage(message)
    if (!decoded) return

    if (decoded.note === TransportNote.Heartbeat) {
      const wasConnected = this.connectionState.isConnected()
      this.connectionState.recordHeartbeat()
      if (!wasConnected) this.emit('stateChanged')
      return
    }

    const next = applyStateNote(this.transportState, decoded.note, decoded.isOn)
    if (next !== this.transportState) {
      this.transportState = next
      this.emit('stateChanged')
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd companion-module-cubase && npx tsc -p tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add companion-module-cubase/src/midi/connection.ts
git commit -m "feat: add real MIDI connection wrapper wiring protocol and state"
```

---

### Task 8: Actions, feedbacks, and presets (TDD against a fake connection)

**Files:**
- Create: `companion-module-cubase/src/actions.ts`
- Create: `companion-module-cubase/src/feedbacks.ts`
- Create: `companion-module-cubase/src/presets.ts`
- Test: `companion-module-cubase/test/actions.test.ts`
- Test: `companion-module-cubase/test/feedbacks.test.ts`

**Interfaces:**
- Consumes: `TransportNote` from `./midi/protocol.js` (Task 2); `isStopped` from `./midi/transportState.js` (Task 3). Both files depend only on a `ModuleLike` shape (`{ midi: { sendTrigger, getTransportState, isConnected }, setActionDefinitions, setFeedbackDefinitions, checkFeedbacks }`) so tests can pass a fake instead of a real `ModuleInstance`.
- Produces: `UpdateActions(self: ModuleLike): void`, `UpdateFeedbacks(self: ModuleLike): void`, `UpdatePresets(self: ModuleLike): void` — all three consumed by `main.ts` (Task 9).

- [ ] **Step 1: Write the failing action tests**

```typescript
// companion-module-cubase/test/actions.test.ts
import { describe, it, expect, vi } from 'vitest'
import { UpdateActions } from '../src/actions.js'
import { TransportNote } from '../src/midi/protocol.js'

function makeFakeSelf() {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(),
      isConnected: vi.fn(),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateActions', () => {
  it('registers one action per transport function', () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)

    const definitions = self.setActionDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      ['play', 'stop', 'record', 'returnToZero', 'toggleCycle', 'toggleClick', 'rewind', 'forward'].sort(),
    )
  })

  it('play action sends a trigger on the Play note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.play.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TransportNote.Play)
  })

  it('record action sends a trigger on the Record note', async () => {
    const self = makeFakeSelf()
    UpdateActions(self as any)
    const definitions = self.setActionDefinitions.mock.calls[0][0]

    await definitions.record.callback({} as any)

    expect(self.midi.sendTrigger).toHaveBeenCalledWith(TransportNote.Record)
  })
})
```

- [ ] **Step 2: Run action tests to verify they fail**

Run: `cd companion-module-cubase && npx vitest run test/actions.test.ts`
Expected: FAIL — `Cannot find module '../src/actions.js'`

- [ ] **Step 3: Implement `src/actions.ts`**

```typescript
import type {
  CompanionActionDefinitions,
  CompanionFeedbackDefinitions,
  CompanionButtonPresetDefinition,
} from '@companion-module/base'
import { TransportNote } from './midi/protocol.js'

export interface ModuleLike {
  midi: {
    sendTrigger(note: number): void
    getTransportState(): { playing: boolean; recording: boolean; cycleActive: boolean; clickActive: boolean }
    isConnected(): boolean
  }
  setActionDefinitions(definitions: CompanionActionDefinitions): void
  setFeedbackDefinitions(definitions: CompanionFeedbackDefinitions): void
  setPresetDefinitions(definitions: Record<string, CompanionButtonPresetDefinition>): void
  checkFeedbacks(...feedbackIds: string[]): void
}

export function UpdateActions(self: ModuleLike): void {
  const definitions: CompanionActionDefinitions = {
    play: {
      name: 'Play',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Play),
    },
    stop: {
      name: 'Stop',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Stop),
    },
    record: {
      name: 'Record',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Record),
    },
    returnToZero: {
      name: 'Return to Zero',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.ReturnToZero),
    },
    toggleCycle: {
      name: 'Toggle Cycle',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Cycle),
    },
    toggleClick: {
      name: 'Toggle Click',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Click),
    },
    rewind: {
      name: 'Rewind',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Rewind),
    },
    forward: {
      name: 'Forward',
      options: [],
      callback: async () => self.midi.sendTrigger(TransportNote.Forward),
    },
  }

  self.setActionDefinitions(definitions)
}
```

- [ ] **Step 4: Run action tests to verify they pass**

Run: `cd companion-module-cubase && npx vitest run test/actions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing feedback tests**

```typescript
// companion-module-cubase/test/feedbacks.test.ts
import { describe, it, expect, vi } from 'vitest'
import { UpdateFeedbacks } from '../src/feedbacks.js'

function makeFakeSelf(transportState: {
  playing: boolean
  recording: boolean
  cycleActive: boolean
  clickActive: boolean
}, connected: boolean) {
  return {
    midi: {
      sendTrigger: vi.fn(),
      getTransportState: vi.fn(() => transportState),
      isConnected: vi.fn(() => connected),
    },
    setActionDefinitions: vi.fn(),
    setFeedbackDefinitions: vi.fn(),
    checkFeedbacks: vi.fn(),
  }
}

describe('UpdateFeedbacks', () => {
  it('registers the six Phase 1 feedbacks', () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)

    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]
    expect(Object.keys(definitions).sort()).toEqual(
      ['playing', 'recording', 'stopped', 'cycleActive', 'clickActive', 'cubaseConnected'].sort(),
    )
  })

  it('playing feedback reflects transport state', async () => {
    const self = makeFakeSelf({ playing: true, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.playing.callback({} as any)).toBe(true)
  })

  it('stopped feedback is true when neither playing nor recording', async () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.stopped.callback({} as any)).toBe(true)
  })

  it('stopped feedback is false while recording', async () => {
    const self = makeFakeSelf({ playing: false, recording: true, cycleActive: false, clickActive: false }, false)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.stopped.callback({} as any)).toBe(false)
  })

  it('cubaseConnected feedback reflects connection state', async () => {
    const self = makeFakeSelf({ playing: false, recording: false, cycleActive: false, clickActive: false }, true)
    UpdateFeedbacks(self as any)
    const definitions = self.setFeedbackDefinitions.mock.calls[0][0]

    expect(await definitions.cubaseConnected.callback({} as any)).toBe(true)
  })
})
```

- [ ] **Step 6: Run feedback tests to verify they fail**

Run: `cd companion-module-cubase && npx vitest run test/feedbacks.test.ts`
Expected: FAIL — `Cannot find module '../src/feedbacks.js'`

- [ ] **Step 7: Implement `src/feedbacks.ts`**

```typescript
import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { isStopped } from './midi/transportState.js'
import type { ModuleLike } from './actions.js'

const activeStyle = { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) }
const connectedStyle = { bgcolor: combineRgb(0, 120, 220), color: combineRgb(255, 255, 255) }

export function UpdateFeedbacks(self: ModuleLike): void {
  const definitions: CompanionFeedbackDefinitions = {
    playing: {
      type: 'boolean',
      name: 'Playing',
      description: "True while Cubase's transport is playing",
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().playing,
    },
    recording: {
      type: 'boolean',
      name: 'Recording',
      description: 'True while Cubase is recording',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().recording,
    },
    stopped: {
      type: 'boolean',
      name: 'Stopped',
      description: 'True when neither Playing nor Recording is true',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => isStopped(self.midi.getTransportState()),
    },
    cycleActive: {
      type: 'boolean',
      name: 'Cycle Active',
      description: 'True when Cycle/Loop is enabled in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().cycleActive,
    },
    clickActive: {
      type: 'boolean',
      name: 'Click Active',
      description: 'True when the Metronome/Click is enabled in Cubase',
      defaultStyle: activeStyle,
      options: [],
      callback: async () => self.midi.getTransportState().clickActive,
    },
    cubaseConnected: {
      type: 'boolean',
      name: 'Cubase Connected',
      description: 'True while heartbeats keep arriving from the Cubase MIDI Remote script',
      defaultStyle: connectedStyle,
      options: [],
      callback: async () => self.midi.isConnected(),
    },
  }

  self.setFeedbackDefinitions(definitions)
}
```

- [ ] **Step 8: Run feedback tests to verify they pass**

Run: `cd companion-module-cubase && npx vitest run test/feedbacks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Implement `src/presets.ts`** (no test — pure declarative data, exercised visually in Task 10)

```typescript
import type { CompanionButtonPresetDefinition } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import type { ModuleLike } from './actions.js'

function preset(
  text: string,
  actionId: string,
  feedbackId?: string,
): CompanionButtonPresetDefinition {
  return {
    type: 'button',
    category: 'Transport',
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
    feedbacks: feedbackId ? [{ feedbackId, options: {} }] : [],
  }
}

export function UpdatePresets(self: ModuleLike): void {
  const presets: Record<string, CompanionButtonPresetDefinition> = {
    play: preset('Play', 'play', 'playing'),
    stop: preset('Stop', 'stop'),
    record: preset('Record', 'record', 'recording'),
    returnToZero: preset('Return to Zero', 'returnToZero'),
    toggleCycle: preset('Cycle', 'toggleCycle', 'cycleActive'),
    toggleClick: preset('Click', 'toggleClick', 'clickActive'),
    rewind: preset('Rewind', 'rewind'),
    forward: preset('Forward', 'forward'),
    cubaseConnected: {
      type: 'button',
      category: 'Status',
      name: 'Cubase Connected',
      style: {
        text: 'Cubase\\nConnected',
        size: '14',
        color: combineRgb(255, 255, 255),
        bgcolor: combineRgb(0, 0, 0),
      },
      steps: [{ down: [], up: [] }],
      feedbacks: [{ feedbackId: 'cubaseConnected', options: {} }],
    },
  }

  self.setPresetDefinitions(presets)
}
```

- [ ] **Step 10: Verify it compiles**

Run: `cd companion-module-cubase && npx tsc -p tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add companion-module-cubase/src/actions.ts companion-module-cubase/src/feedbacks.ts companion-module-cubase/src/presets.ts companion-module-cubase/test/actions.test.ts companion-module-cubase/test/feedbacks.test.ts
git commit -m "feat: add transport actions, feedbacks, and presets"
```

---

### Task 9: Wire it together in `main.ts`

**Files:**
- Create: `companion-module-cubase/src/main.ts`

**Interfaces:**
- Consumes: `GetConfigFields`, `ModuleConfig` from `./config.js` (Task 6); `MidiConnection` from `./midi/connection.js` (Task 7); `UpdateActions`, `UpdateFeedbacks`, `UpdatePresets` from `./actions.js`/`./feedbacks.js`/`./presets.js` (Task 8); `UpgradeScripts` from `./upgrades.js` (Task 1).
- Produces: the module's actual entrypoint (`dist/main.js`, per `manifest.json`'s `runtime.entrypoint` from Task 1).

No unit test for this task: `InstanceBase` lifecycle wiring can only be meaningfully exercised by Companion's own runtime. Covered by the manual end-to-end test in Task 10.

- [ ] **Step 1: Implement `src/main.ts`**

```typescript
import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import { GetConfigFields, ModuleConfig } from './config.js'
import { MidiConnection } from './midi/connection.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'

class ModuleInstance extends InstanceBase<ModuleConfig> {
  config: ModuleConfig = { inPortName: '', outPortName: '' }
  midi!: MidiConnection

  async init(config: ModuleConfig): Promise<void> {
    this.config = config
    this.updateStatus(InstanceStatus.Connecting)
    this.openMidi()
    this.updateActions()
    this.updateFeedbacks()
    this.updatePresets()
  }

  async configUpdated(config: ModuleConfig): Promise<void> {
    this.config = config
    this.midi?.close()
    this.openMidi()
  }

  async destroy(): Promise<void> {
    this.midi?.close()
  }

  getConfigFields() {
    return GetConfigFields()
  }

  updateActions(): void {
    UpdateActions(this)
  }

  updateFeedbacks(): void {
    UpdateFeedbacks(this)
  }

  updatePresets(): void {
    UpdatePresets(this)
  }

  private openMidi(): void {
    this.midi = new MidiConnection(this.config.inPortName, this.config.outPortName)
    this.midi.on('stateChanged', () => {
      this.updateStatus(this.midi.isConnected() ? InstanceStatus.Ok : InstanceStatus.Disconnected)
      this.checkFeedbacks()
    })
    this.midi.on('error', (message: string) => {
      this.log('error', message)
      this.updateStatus(InstanceStatus.Disconnected)
    })
    this.midi.open()
  }
}

runEntrypoint(ModuleInstance, UpgradeScripts)
```

- [ ] **Step 2: Build the whole package**

Run: `cd companion-module-cubase && npm run build`
Expected: `dist/main.js` and the rest of `dist/` produced, no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd companion-module-cubase && npm test`
Expected: PASS — all protocol/transportState/connectionState/actions/feedbacks tests green (34 tests total).

- [ ] **Step 4: Commit**

```bash
git add companion-module-cubase/src/main.ts
git commit -m "feat: wire ModuleInstance lifecycle to MIDI connection and action/feedback/preset definitions"
```

---

### Task 10: Cubase MIDI Remote script

**Files:**
- Create: `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`

**Interfaces:**
- Consumes: Steinberg's `midiremote_api_v1` module (`makeDeviceDriver`, `mPorts.makeMidiInput/makeMidiOutput`, `makeDetectionUnit().detectPortPair(...).expectInputNameEquals(...).expectOutputNameEquals(...)`, `mSurface.makeButton`, `mSurfaceValue.mMidiBinding.setInputPort(...).setOutputPort(...).bindToNote(channel, note)`, `page.makeValueBinding(surfaceValue, hostValue).setTypeToggle()`, `page.makeCommandBinding(surfaceValue, category, name)`, `page.mHostAccess.mTransport.mValue.{mStart,mStop,mRecord,mRewind,mForward,mCycleActive,mMetronomeActive}`, `page.mOnActivate`, `deviceDriver.mOnIdle`, `midiOutput.sendMidi(activeDevice, message)`).
- Produces: nothing consumed by other tasks — this is the other half of the bridge, matched against the note map from Task 2's `protocol.ts` by convention (channel 16 / zero-indexed 15, notes 0–9).

This file cannot be unit tested — it runs inside Cubase's embedded ES5 JavaScript engine and requires a live Cubase instance to execute at all. It's covered entirely by the manual end-to-end test in Task 11.

- [ ] **Step 1: Implement the driver script**

```javascript
// cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js
var midiremote_api = require('midiremote_api_v1')

var TRANSPORT_CHANNEL = 15 // MIDI channel 16, zero-indexed
var NOTE_PLAY = 0
var NOTE_STOP = 1
var NOTE_RECORD = 2
var NOTE_RETURN_TO_ZERO = 3
var NOTE_CYCLE = 4
var NOTE_CLICK = 5
var NOTE_REWIND = 6
var NOTE_FORWARD = 7
var NOTE_HEARTBEAT = 9
var HEARTBEAT_INTERVAL_MS = 2000

var deviceDriver = midiremote_api.makeDeviceDriver('CubaseCompanion', 'Transport', 'companion-module-cubase')

var midiInput = deviceDriver.mPorts.makeMidiInput()
var midiOutput = deviceDriver.mPorts.makeMidiOutput()

deviceDriver
  .makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameEquals('CubaseCompanion Transport')
  .expectOutputNameEquals('CubaseCompanion Transport')

var surface = deviceDriver.mSurface

function makeTransportButton(x) {
  return surface.makeButton(x, 0, 1, 1)
}

var btnPlay = makeTransportButton(0)
var btnStop = makeTransportButton(1)
var btnRecord = makeTransportButton(2)
var btnReturnToZero = makeTransportButton(3)
var btnCycle = makeTransportButton(4)
var btnClick = makeTransportButton(5)
var btnRewind = makeTransportButton(6)
var btnForward = makeTransportButton(7)

btnPlay.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_PLAY)
btnStop.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_STOP)
btnRecord.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_RECORD)
btnReturnToZero.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_RETURN_TO_ZERO)
btnCycle.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_CYCLE)
btnClick.mSurfaceValue.mMidiBinding.setInputPort(midiInput).setOutputPort(midiOutput).bindToNote(TRANSPORT_CHANNEL, NOTE_CLICK)
btnRewind.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_REWIND)
btnForward.mSurfaceValue.mMidiBinding.setInputPort(midiInput).bindToNote(TRANSPORT_CHANNEL, NOTE_FORWARD)

var page = deviceDriver.mMapping.makePage('Transport')

page.makeValueBinding(btnPlay.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStart).setTypeToggle()
page.makeValueBinding(btnStop.mSurfaceValue, page.mHostAccess.mTransport.mValue.mStop)
page.makeValueBinding(btnRecord.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRecord).setTypeToggle()
// Return to Zero has no dedicated mTransport.mValue member (unlike Start/Stop/Record/
// Rewind/Forward/Cycle/Metronome) — it's a Transport menu key command, so it's bound
// via makeCommandBinding to Cubase's built-in "Return to Zero" key command instead.
page.makeCommandBinding(btnReturnToZero.mSurfaceValue, 'Transport', 'Return to Zero')
page.makeValueBinding(btnCycle.mSurfaceValue, page.mHostAccess.mTransport.mValue.mCycleActive).setTypeToggle()
page.makeValueBinding(btnClick.mSurfaceValue, page.mHostAccess.mTransport.mValue.mMetronomeActive).setTypeToggle()
page.makeValueBinding(btnRewind.mSurfaceValue, page.mHostAccess.mTransport.mValue.mRewind)
page.makeValueBinding(btnForward.mSurfaceValue, page.mHostAccess.mTransport.mValue.mForward)

page.mOnActivate = function (activeDevice) {
  console.log('CubaseCompanion Transport: page activated')
}

var lastHeartbeatSentAt = 0

deviceDriver.mOnIdle = function (activeDevice) {
  var now = Date.now()
  if (now - lastHeartbeatSentAt < HEARTBEAT_INTERVAL_MS) return
  lastHeartbeatSentAt = now

  var statusOn = 0x90 | TRANSPORT_CHANNEL
  var statusOff = 0x80 | TRANSPORT_CHANNEL
  midiOutput.sendMidi(activeDevice, [statusOn, NOTE_HEARTBEAT, 127])
  midiOutput.sendMidi(activeDevice, [statusOff, NOTE_HEARTBEAT, 0])
}
```

- [ ] **Step 2: Manual smoke-check in Cubase's Script Console**

This step cannot be automated — it requires Cubase itself:

1. Copy `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js` into
   `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Transport\` (Windows path; the file must keep this exact relative structure).
2. Open Cubase, go to Studio > Studio Setup > MIDI Remote, and confirm "CubaseCompanion Transport" appears as an addable controller.
3. Add it, pointing its input/output at your existing virtual MIDI port pair.
4. Open the MIDI Remote Script Console and confirm no errors are logged and `"CubaseCompanion Transport: page activated"` appears once the page activates.
5. Specifically check the console for a "command not found" or similar error on the `makeCommandBinding(..., 'Transport', 'Return to Zero')` line — this is the one binding in this file not backed by a directly-observed API example, and Cubase's exact key-command string ("Return to Zero" under the "Transport" category, as listed in Cubase's own Key Commands dialog) must be confirmed against your installed Cubase version. If it errors or the category/name differs, open Cubase's Key Commands dialog (Edit > Key Commands), find the real category/name for the "return to project start" command, and update the `makeCommandBinding` call to match.

Expected: script loads with no console errors, controller is selectable, activation log line appears, and pressing the Return to Zero button in Companion actually returns the Cubase project cursor to zero.

- [ ] **Step 3: Commit**

```bash
git add "cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js"
git commit -m "feat: add Cubase MIDI Remote transport driver script"
```

---

### Task 11: End-to-end manual verification and setup docs

**Files:**
- Create: `docs/cubase-companion-transport-setup.md`

**Interfaces:**
- Consumes: everything from Tasks 1–10. This task has no code deliverable — it's the spec's manual testing plan, executed for real, plus the write-up a future user (or you) needs to repeat it.

- [ ] **Step 1: Write the setup/test doc**

```markdown
# Cubase Companion Transport — Setup & Verification

## Setup

1. Point your existing virtual/network MIDI port pair so both a "CubaseCompanion Transport" input and output are visible to Cubase and to Node/Companion (loopMIDI locally, or rtpMIDI/AppleMIDI across machines).
2. Install the driver script: copy
   `cubase-midi-remote/Local/CubaseCompanion/Transport/CubaseCompanion_Transport.js`
   into `Documents\Steinberg\Cubase\MIDI Remote\Driver Scripts\Local\CubaseCompanion\Transport\`.
3. In Cubase, go to Studio > Studio Setup > MIDI Remote, add "CubaseCompanion Transport", and bind it to your port pair.
4. Build the Companion module: `cd companion-module-cubase && npm install && npm run build`.
5. Load `companion-module-cubase` into a local Companion dev instance and add a Cubase instance, setting MIDI In/Out to the same port pair.

## Verification checklist

- [ ] Press Play in Companion → Cubase transport starts, and the Companion Play button's "Playing" feedback lights.
- [ ] Press Play on Cubase's own transport bar → the Companion Play button lights without any Companion-side press.
- [ ] Repeat for Record ("Recording" feedback) and Cycle ("Cycle Active" feedback) and Click ("Click Active" feedback), in both directions.
- [ ] "Stopped" feedback is lit when transport is idle, and turns off the instant Play or Record starts.
- [ ] Fire Return to Zero, Rewind, and Forward from Companion and confirm Cubase responds (no feedback expected on these three).
- [ ] Quit Cubase (or remove the MIDI Remote controller) and confirm "Cubase Connected" flips off within ~5 seconds.
- [ ] Relaunch Cubase / re-add the controller and confirm "Cubase Connected" flips back on and all four stateful feedbacks (Playing/Recording/Cycle/Click) sync to Cubase's actual current state immediately, without needing a state change first.
```

- [ ] **Step 2: Walk through the verification checklist for real**

Run through every checkbox in the doc above against a real Cubase 15 instance and a real (or virtual) MIDI port pair. Check off each item as it passes; if any item fails, fix the relevant task's code before proceeding.

- [ ] **Step 3: Commit**

```bash
git add docs/cubase-companion-transport-setup.md
git commit -m "docs: add Cubase Companion transport setup and verification checklist"
```
