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
