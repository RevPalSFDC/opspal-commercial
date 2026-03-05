import test from 'node:test';
import assert from 'node:assert/strict';

import { createPolicyGateway, MarketoPolicyError } from '../src/lib/policy-gateway.js';

test('policy gateway executes requests successfully', async () => {
  const gateway = createPolicyGateway({
    targetCallsPerWindow: 100,
    maxConcurrent: 5,
    maxRetries: 1
  });

  const result = await gateway.execute(async () => ({ ok: true }));
  assert.deepEqual(result, { ok: true });
});

test('policy gateway retries retryable Marketo codes', async () => {
  const gateway = createPolicyGateway({
    targetCallsPerWindow: 100,
    maxConcurrent: 5,
    maxRetries: 3,
    baseBackoffMs: 1,
    maxBackoffMs: 5
  });

  let attempts = 0;
  const result = await gateway.execute(async () => {
    attempts += 1;
    if (attempts < 3) {
      const err = new Error('Marketo API error [606]: Rate limit exceeded');
      err.code = '606';
      throw err;
    }
    return { attempts };
  });

  assert.equal(result.attempts, 3);
});

test('policy gateway does not retry non-retryable 607 errors', async () => {
  const gateway = createPolicyGateway({
    targetCallsPerWindow: 100,
    maxConcurrent: 5,
    maxRetries: 3
  });

  let attempts = 0;
  await assert.rejects(
    async () => {
      await gateway.execute(async () => {
        attempts += 1;
        const err = new Error('Marketo API error [607]: Daily quota reached');
        err.code = '607';
        throw err;
      });
    },
    error => {
      assert.equal(error.code, '607');
      return true;
    }
  );

  assert.equal(attempts, 1);
});

test('policy gateway enforces local daily soft limit', async () => {
  const gateway = createPolicyGateway({
    targetCallsPerWindow: 100,
    maxConcurrent: 5,
    maxRetries: 0,
    dailySoftLimit: 1
  });

  await gateway.execute(async () => ({ ok: true }));

  await assert.rejects(
    async () => {
      await gateway.execute(async () => ({ ok: true }));
    },
    error => {
      assert.ok(error instanceof MarketoPolicyError);
      assert.equal(error.code, '607');
      return true;
    }
  );
});

