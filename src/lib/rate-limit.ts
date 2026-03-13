/**
 * In-memory sliding-window rate limiter.
 *
 * Each limiter tracks request timestamps per key (IP, email, etc.) and rejects
 * requests that exceed the configured threshold within the window.
 *
 * Note: This is per-process. In a multi-instance deployment, replace with a
 * Redis-backed implementation.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;

    // Periodically prune stale entries to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), this.windowMs * 2);
    // Allow the process to exit without waiting for this timer
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check whether the key is allowed to proceed.
   * Returns { allowed: true } or { allowed: false, retryAfterMs }.
   */
  check(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
    }

    entry.timestamps.push(now);
    return { allowed: true };
  }

  private cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// ── Pre-configured limiters for OTP endpoints ──────────────────────────

/** Max 5 OTP send requests per IP per 15 minutes */
export const otpSendIpLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

/** Max 3 OTP send requests per email per 15 minutes */
export const otpSendEmailLimiter = new RateLimiter({
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
});

/** Max 5 OTP verify attempts per IP per 15 minutes */
export const otpVerifyIpLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

/** Max 5 OTP verify attempts per email per 15 minutes */
export const otpVerifyEmailLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});
