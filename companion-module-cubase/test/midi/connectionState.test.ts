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
