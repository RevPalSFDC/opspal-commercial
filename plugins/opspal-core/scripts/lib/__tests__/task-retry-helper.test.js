/**
 * Tests for Task Retry Helper
 *
 * Related reflections: f3a68c5e
 */

const {
  DEFAULT_CONFIG,
  calculateDelay,
  isRetryable,
  sleep,
  executeWithRetry,
  withRetry,
  executeWithFallback,
  createCircuitBreaker
} = require('../task-retry-helper');

describe('Task Retry Helper', () => {
  describe('calculateDelay', () => {
    it('should calculate exponential backoff', () => {
      const delay0 = calculateDelay(0);
      const delay1 = calculateDelay(1);
      const delay2 = calculateDelay(2);

      // Each delay should be roughly 2x the previous (with jitter)
      expect(delay1).toBeGreaterThan(delay0 * 1.5);
      expect(delay2).toBeGreaterThan(delay1 * 1.5);
    });

    it('should respect maxDelayMs cap', () => {
      const delay = calculateDelay(10); // Very high attempt
      expect(delay).toBeLessThanOrEqual(DEFAULT_CONFIG.maxDelayMs);
    });

    it('should add jitter within 20% range', () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculateDelay(1));
      }
      // All delays should be different (jitter)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('isRetryable', () => {
    it('should identify retryable network errors', () => {
      expect(isRetryable('ETIMEDOUT').retryable).toBe(true);
      expect(isRetryable('ECONNRESET').retryable).toBe(true);
      expect(isRetryable('ECONNREFUSED').retryable).toBe(true);
      expect(isRetryable('Connection reset').retryable).toBe(true);
    });

    it('should identify retryable HTTP errors', () => {
      expect(isRetryable('429 Too Many Requests').retryable).toBe(true);
      expect(isRetryable('500 Internal Server Error').retryable).toBe(true);
      expect(isRetryable('502 Bad Gateway').retryable).toBe(true);
      expect(isRetryable('503 Service Unavailable').retryable).toBe(true);
      expect(isRetryable('504 Gateway Timeout').retryable).toBe(true);
    });

    it('should not retry auth errors', () => {
      expect(isRetryable('401 Unauthorized').retryable).toBe(false);
      expect(isRetryable('403 Forbidden').retryable).toBe(false);
      expect(isRetryable('INVALID_SESSION_ID').retryable).toBe(false);
      expect(isRetryable('Permission denied').retryable).toBe(false);
    });

    it('should suggest delay for rate limits', () => {
      const result = isRetryable('429 Too Many Requests');
      expect(result.retryable).toBe(true);
      expect(result.suggestedDelay).toBeGreaterThan(0);
    });

    it('should parse Retry-After header', () => {
      const result = isRetryable('429 Rate limit exceeded. Retry-After: 30');
      expect(result.suggestedDelay).toBe(30000);
    });
  });

  describe('sleep', () => {
    it('should delay for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.totalAttempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const result = await executeWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(2);
    });

    it('should not retry on non-retryable error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));

      const result = await executeWithRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1);
    });

    it('should respect maxRetries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await executeWithRetry(fn, { maxRetries: 2, baseDelayMs: 10 });

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(3); // Initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await executeWithRetry(fn, { maxRetries: 3, baseDelayMs: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });
  });

  describe('withRetry', () => {
    it('should wrap function with retry logic', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const wrappedFn = withRetry(fn);

      const result = await wrappedFn('arg1', 'arg2');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('executeWithFallback', () => {
    it('should use first successful operation', async () => {
      const op1 = jest.fn().mockResolvedValue('result1');
      const op2 = jest.fn().mockResolvedValue('result2');

      const result = await executeWithFallback([op1, op2]);

      expect(result.success).toBe(true);
      expect(result.result).toBe('result1');
      expect(result.successfulOperation).toBe(0);
      expect(op2).not.toHaveBeenCalled();
    });

    it('should fallback to second operation on first failure', async () => {
      const op1 = jest.fn().mockRejectedValue(new Error('401'));
      const op2 = jest.fn().mockResolvedValue('result2');

      const result = await executeWithFallback([op1, op2], { baseDelayMs: 10 });

      expect(result.success).toBe(true);
      expect(result.result).toBe('result2');
      expect(result.successfulOperation).toBe(1);
    });
  });

  describe('createCircuitBreaker', () => {
    it('should start in CLOSED state', () => {
      const fn = jest.fn();
      const cb = createCircuitBreaker(fn);

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getFailures()).toBe(0);
    });

    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const cb = createCircuitBreaker(fn);

      const result = await cb.execute();

      expect(result).toBe('success');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('should open after failure threshold', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const cb = createCircuitBreaker(fn, { failureThreshold: 3 });

      for (let i = 0; i < 3; i++) {
        try {
          await cb.execute();
        } catch (e) {
          // Expected
        }
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('should reject immediately when OPEN', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const cb = createCircuitBreaker(fn, { failureThreshold: 1, recoveryTime: 60000 });

      try {
        await cb.execute();
      } catch (e) {
        // Expected
      }

      await expect(cb.execute()).rejects.toThrow('Circuit breaker OPEN');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset on manual reset', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      const cb = createCircuitBreaker(fn, { failureThreshold: 1 });

      try {
        await cb.execute();
      } catch (e) {
        // Expected
      }

      cb.reset();

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getFailures()).toBe(0);
    });
  });
});
