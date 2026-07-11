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

const { MidiConnection, TRIGGER_HOLD_MS } = await import('../../src/midi/connection.js')
const { TransportNote, TRANSPORT_CHANNEL, MARKERS_CHANNEL, encodeNoteOn, encodeNoteOff } = await import('../../src/midi/protocol.js')
const { HEARTBEAT_TIMEOUT_MS } = await import('../../src/midi/connectionState.js')

function sendHeartbeat(connection: InstanceType<typeof MidiConnection>): void {
  const fakeInput = (connection as unknown as { input: EventEmitter }).input
  fakeInput.emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Heartbeat))
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
    fakeInput.emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.PlayState))
    expect(connection.getTransportState().playing).toBe(true)

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS + 1000)

    expect(connection.isConnected()).toBe(false)
    expect(connection.getTransportState()).toEqual({
      playing: false,
      recording: false,
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

// Companion's MIDI In/Out point at the same loopMIDI virtual port as the Cubase
// script (see ADR-005), and loopMIDI echoes anything written to a port's output
// back into every listener's input on that same port name -- including the
// sender. So the moment sendTrigger()/sendNoteOn()/sendNoteOff() write a message
// out, that exact message also arrives back on `this.input`'s 'message' event.
// This used to be indistinguishable from genuine state feedback, since
// Play/Record's feedback originally reused their trigger note -- that also
// turned out to be the root cause of a much worse bug (Cubase's own input
// binding re-ingesting its own feedback as a fresh press; see ADR-004), fixed
// by moving feedback onto dedicated *State notes Companion never sends on.
// These tests exercise the suppression mechanism generically with
// TransportNote.RecordState standing in for "some note Companion both sends
// triggers on and tracks state for" -- the mechanism itself doesn't know or
// care which notes are wired to what.
describe('MidiConnection self-echo suppression', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function fakeInputOf(connection: InstanceType<typeof MidiConnection>): EventEmitter {
    return (connection as unknown as { input: EventEmitter }).input
  }

  it('does not apply state from a self-sent trigger looped back on the same note', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)
    // sendTrigger()'s Note Off is sent TRIGGER_HOLD_MS after the Note On (see
    // connection.ts) rather than immediately, so let it actually go out before
    // simulating loopMIDI echoing both back into our own input.
    vi.advanceTimersByTime(TRIGGER_HOLD_MS)
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))
    fakeInputOf(connection).emit('message', 0, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(false)

    connection.close()
  })

  it('applies state from a later genuine echo once the self-sent pair has been consumed', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)
    vi.advanceTimersByTime(TRIGGER_HOLD_MS)
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))
    fakeInputOf(connection).emit('message', 0, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.RecordState))

    // Cubase's real feedback, arriving after its own script-engine round trip.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(true)

    connection.close()
  })

  it('still applies state from messages that were never self-sent', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    // No sendTrigger() call here -- this is Cubase-initiated (e.g. the user
    // pressed Record from Cubase's own transport bar, not from Companion).
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(true)

    connection.close()
  })

  it('stops trusting a pending self-echo once it is older than the suppression window', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)
    vi.advanceTimersByTime(1000)
    // Arrives too late to plausibly be the loopback echo of the send above --
    // treat it as genuine (e.g. a real, independent later Cubase toggle) rather
    // than silently swallowing it forever.
    fakeInputOf(connection).emit('message', 0, encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    expect(connection.getTransportState().recording).toBe(true)

    connection.close()
  })
})

describe('MidiConnection sendTrigger hold gap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends Note On immediately and Note Off only after TRIGGER_HOLD_MS', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendTrigger(TRANSPORT_CHANNEL, TransportNote.RecordState)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.RecordState))

    vi.advanceTimersByTime(TRIGGER_HOLD_MS - 1)
    expect(sendSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy).toHaveBeenNthCalledWith(2, encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.RecordState))

    connection.close()
  })

  it('sends on the given channel, not always TRANSPORT_CHANNEL', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendTrigger(MARKERS_CHANNEL, 0)

    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(MARKERS_CHANNEL, 0))

    connection.close()
  })
})

describe('MidiConnection sendNoteOn/sendNoteOff', () => {
  it('sendNoteOn sends only a Note On, with no matching Note Off', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendNoteOn(TransportNote.Stop)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOn(TRANSPORT_CHANNEL, TransportNote.Stop))

    connection.close()
  })

  it('sendNoteOff sends only a Note Off', () => {
    const connection = new MidiConnection('fake-in', 'fake-out')
    connection.open()
    const sendSpy = vi.spyOn((connection as unknown as { output: { sendMessage: (m: number[]) => void } }).output, 'sendMessage')

    connection.sendNoteOff(TransportNote.Stop)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy).toHaveBeenCalledWith(encodeNoteOff(TRANSPORT_CHANNEL, TransportNote.Stop))

    connection.close()
  })
})
