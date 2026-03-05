const {
  ApiPolicyGateway,
  ApiPolicyError,
  parseRetryAfterMs,
  normalizeHeaders
} = require('../api-policy-gateway');

describe('ApiPolicyGateway', () => {
  it('executes successful request path', async () => {
    const gateway = new ApiPolicyGateway({
      platform: 'test',
      targetCallsPerWindow: 100,
      maxConcurrent: 5,
      maxRetries: 1
    });

    const result = await gateway.execute(async () => ({ ok: true }), { op: 'ping' });

    expect(result).toEqual({ ok: true });
    const stats = gateway.getStats();
    expect(stats.stats.successfulRequests).toBe(1);
    expect(stats.dailyCount).toBe(1);
  });

  it('retries retryable errors and eventually succeeds', async () => {
    const gateway = new ApiPolicyGateway({
      platform: 'test',
      targetCallsPerWindow: 100,
      maxRetries: 3,
      baseBackoffMs: 1,
      maxBackoffMs: 5
    });

    let attempts = 0;
    const result = await gateway.execute(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error('HTTP 429');
        err.code = '429';
        throw err;
      }
      return { attempts };
    });

    expect(result.attempts).toBe(3);
    expect(gateway.getStats().stats.retries).toBe(2);
  });

  it('blocks when daily budget is exhausted', async () => {
    const gateway = new ApiPolicyGateway({
      platform: 'test',
      targetCallsPerWindow: 100,
      maxRetries: 0,
      dailySoftLimit: 1
    });

    await gateway.execute(async () => ({ ok: true }));

    await expect(gateway.execute(async () => ({ ok: true }))).rejects.toBeInstanceOf(ApiPolicyError);
  });

  it('records normalized headers', () => {
    const gateway = new ApiPolicyGateway({ platform: 'test' });

    gateway.recordHeaders({
      'Retry-After': '5',
      'X-RateLimit-Remaining': '10'
    });

    const stats = gateway.getStats();
    expect(stats.stats.lastHeaders['retry-after']).toBe('5');
    expect(stats.stats.retryAfterMs).toBe(5000);
  });
});

describe('api-policy-gateway helpers', () => {
  it('parses retry-after values in seconds', () => {
    expect(parseRetryAfterMs('3')).toBe(3000);
  });

  it('normalizes fetch-style headers', () => {
    const headers = new Map([
      ['X-Test', '1'],
      ['Retry-After', '2']
    ]);

    const normalized = normalizeHeaders({
      get(key) {
        return headers.get(key);
      },
      entries() {
        return headers.entries();
      }
    });

    expect(normalized['x-test']).toBe('1');
    expect(normalized['retry-after']).toBe('2');
  });
});
