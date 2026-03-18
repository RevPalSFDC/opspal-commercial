import test from 'node:test';
import assert from 'node:assert/strict';

import { clearIdempotencyCache, runWithIdempotency } from '../src/lib/idempotency-store.js';

test('runWithIdempotency replays same key and payload', async () => {
  clearIdempotencyCache();
  let executions = 0;

  const first = await runWithIdempotency(
    {
      key: 'abc-123',
      operation: 'campaign_request',
      payload: { campaignId: 100, input: { leads: [{ id: 1 }] } }
    },
    async () => {
      executions += 1;
      return { success: true, executed: executions };
    }
  );

  const second = await runWithIdempotency(
    {
      key: 'abc-123',
      operation: 'campaign_request',
      payload: { campaignId: 100, input: { leads: [{ id: 1 }] } }
    },
    async () => {
      executions += 1;
      return { success: true, executed: executions };
    }
  );

  assert.equal(first.idempotency.replayed, false);
  assert.equal(second.idempotency.replayed, true);
  assert.equal(executions, 1);
});

test('runWithIdempotency rejects key reuse with different payload', async () => {
  clearIdempotencyCache();

  await runWithIdempotency(
    {
      key: 'dup-key',
      operation: 'lead_update',
      payload: { input: [{ id: 1, leadStatus: 'MQL' }] }
    },
    async () => ({ success: true })
  );

  await assert.rejects(
    async () => {
      await runWithIdempotency(
        {
          key: 'dup-key',
          operation: 'lead_update',
          payload: { input: [{ id: 1, leadStatus: 'SQL' }] }
        },
        async () => ({ success: true })
      );
    },
    /Idempotency key conflict/
  );
});

