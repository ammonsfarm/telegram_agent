interface CounterRecord {
  count: number;
  expiresAt: number;
}

export class MemoryRateLimiter {
  private readonly counters = new Map<string, CounterRecord>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number
  ) {}

  consume(key: string): boolean {
    const now = Date.now();
    const current = this.counters.get(key);

    if (!current || current.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + this.windowMs });
      return true;
    }

    if (current.count >= this.maxRequests) {
      return false;
    }

    current.count += 1;
    return true;
  }
}

