import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

// connection.ts talks to real MIDI hardware via @julusian/midi's native bindings
// (Input/Output), which is why the file otherwise has no unit tests. The
// timer-driven disconnect-detection logic added for the "heartbeat timeout is
// never detected" fix, however, lives entirely in MidiConnection itself and only
// needs `open()` to believe a port is open — it doesn't need a real device. So
// instead of testing the extracted logic in isolation (which would leave open()/
// close()'s wiring of the timer untested), we mock @julusian/midi with a minimal
// fake that reports ports as open and lets us emit synthetic 'message' events, and
// exercise the real, unmodified MidiConnection class end-to-end with fake timers.
vi.mock('@julusian/midi', async () => {
  // vi.mock factories are hoisted above this file's top-level imports, so they
  // can't close over the `EventEmitter` bound by the `import` statement below
  // (referencing it throws "Cannot access '...' before initialization"). Import
  // it fresh inside the factory instead.
  const { EventEmitter: FakeEventEmitter } = await import('node:events')

  class FakeInput extends FakeEventEmitter {
    private open = false
    openPortByName(_name: string): void {
      this.open = true
    }
    isPortOpen(): boolean {
      return this.open
    }
    closePort(): void {
      this.open = false
    }
  }

  class FakeOutput {
    private open = false
    openPortByName(_name: string): void {
      this.open = true
    }
    isPortOpen(): boolean {
      return this.open
    }
    closePort(): void {
      this.open = false
    }
    sendMessage(_message: number[]): void {
      // no-op
    }
  }

  return { Input: FakeInput, Output: FakeOutput }
})

const { MidiConnection } = await import('../../src/midi/connection.js')
const { TransportNote, encodeNoteOn } = await import('../../src/midi/protocol.js')
const { HEARTBEAT_TIMEOUT_MS } = await import('../../src/midi/connectionState.js')

function sendHeartbeat(connection: InstanceType<typeof MidiConnection>): void {
  const fakeInput = (connection as unknown as { input: EventEmitter }).input
  fakeInput.emit('message', 0, encodeNoteOn(TransportNote.Heartbeat))
}

describe('MidiConnection heartbeat-timeout disconnect detection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('becomes connected once a heartbeat arrives, and reports disconnected before any heartbeat', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    expect(connection.isConnected()).toBe(false)

    sendHeartbeat(connection)

    expect(connection.isConnected()).toBe(true)

    connection.close()
  })

  it('emits stateChanged and flips isConnected() to false once the heartbeat timeout elapses with no further heartbeats', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    const stateChangedSpy = vi.fn()
    connection.on('stateChanged', stateChangedSpy)
    connection.open()

    sendHeartbeat(connection)
    expect(connection.isConnected()).toBe(true)
    stateChangedSpy.mockClear()

    // Advance past the heartbeat timeout with no further heartbeats arriving.
    // Nothing else is going to call handleMessage() to re-check the connection
    // state, so this only flips because the periodic timer added by the fix does.
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1000)

    expect(connection.isConnected()).toBe(false)
    expect(stateChangedSpy).toHaveBeenCalled()

    connection.close()
  })

  it('resets transport state back to initial once a heartbeat timeout is detected', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    sendHeartbeat(connection)
    const fakeInput = (connection as unknown as { input: EventEmitter }).input
    fakeInput.emit('message', 0, encodeNoteOn(TransportNote.Play))
    expect(connection.getTransportState().playing).toBe(true)

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1000)

    expect(connection.isConnected()).toBe(false)
    expect(connection.getTransportState()).toEqual({
      playing: false,
      recording: false,
      cycleActive: false,
      clickActive: false,
    })

    connection.close()
  })

  it('does not emit a redundant stateChanged while still within the timeout window', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    sendHeartbeat(connection)

    const stateChangedSpy = vi.fn()
    connection.on('stateChanged', stateChangedSpy)

    // Several periodic checks fire here, but connectedness never actually flips.
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS - 1000)

    expect(connection.isConnected()).toBe(true)
    expect(stateChangedSpy).not.toHaveBeenCalled()

    connection.close()
  })

  it('clears the periodic timer on close() so no interval keeps the process alive', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    expect(vi.getTimerCount()).toBeGreaterThan(0)

    connection.close()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not leak a second timer if open() is called again after a prior open() on the same instance', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const countAfterFirstOpen = vi.getTimerCount()

    connection.open()
    const countAfterSecondOpen = vi.getTimerCount()

    expect(countAfterSecondOpen).toBe(countAfterFirstOpen)

    connection.close()
    expect(vi.getTimerCount()).toBe(0)
  })
})
