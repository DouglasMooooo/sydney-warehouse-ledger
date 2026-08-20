export class RateLimitError extends Error { readonly code = 'RATE_LIMITED'; }

export class InMemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  check(key: string, limit: number, windowMs: number, now = Date.now()): void {
    const recent = (this.hits.get(key) ?? []).filter((time) => time > now - windowMs);
    if (recent.length >= limit) throw new RateLimitError('Request rate limit exceeded.');
    recent.push(now); this.hits.set(key, recent);
  }
}

export const expensiveOperationLimiter = new InMemoryRateLimiter();
