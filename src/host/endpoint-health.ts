/**
 * Endpoint health tracker inspired by Antigravity-Manager.
 *
 * Maintains a sliding observation window (default 60s). Failing endpoints are
 * demoted to the tail of the priority list until their observation window expires
 * or a subsequent call succeeds.
 *
 * IMPORTANT (AM Issue #3506 parity): Keep this tracker scoped strictly to the
 * quota service — never share state with the inference/adapter execution path.
 */
export class EndpointHealthTracker {
  private readonly failures = new Map<string, number>()

  constructor(private readonly windowMs = 60_000) {}

  markSuccess(url: string): void {
    this.failures.delete(url)
  }

  markFailure(url: string, now = Date.now()): void {
    this.failures.set(url, now)
  }

  isHealthy(url: string, now = Date.now()): boolean {
    const failedAt = this.failures.get(url)
    if (failedAt === undefined) return true
    return now - failedAt > this.windowMs
  }

  /**
   * Sort endpoints: healthy endpoints first (preserving configured order),
   * followed by currently degraded/failing endpoints.
   */
  order(urls: readonly string[], now = Date.now()): string[] {
    const healthy: string[] = []
    const failing: string[] = []

    for (const url of urls) {
      if (this.isHealthy(url, now)) {
        healthy.push(url)
      } else {
        failing.push(url)
      }
    }

    return [...healthy, ...failing]
  }

  getSnapshot(now = Date.now()): Record<string, { healthy: boolean; failedAt?: number }> {
    const snapshot: Record<string, { healthy: boolean; failedAt?: number }> = {}
    for (const [url, time] of this.failures.entries()) {
      snapshot[url] = {
        healthy: now - time > this.windowMs,
        failedAt: time,
      }
    }
    return snapshot
  }
}
