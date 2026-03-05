/**
 * In-memory idempotency helper for state-changing MCP operations.
 *
 * Keys are process-local and reset on MCP server restart.
 *
 * @module idempotency-store
 * @version 1.0.0
 */

import { createHash } from 'node:crypto';

const operationCache = new Map();

function normalizeForHashing(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeForHashing(item));
  }

  if (value && typeof value === 'object') {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeForHashing(value[key]);
    }
    return normalized;
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(normalizeForHashing(value));
}

function payloadHash(payload) {
  const input = stableStringify(payload || {});
  return createHash('sha256').update(input).digest('hex');
}

function withIdempotencyMetadata(result, metadata) {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return {
      ...result,
      idempotency: metadata
    };
  }

  return {
    result,
    idempotency: metadata
  };
}

/**
 * Execute an operation with process-local idempotency replay protection.
 *
 * @param {Object} options
 * @param {string} options.key - idempotency key provided by caller
 * @param {string} options.operation - operation identifier
 * @param {Object} options.payload - request payload used for hash consistency checks
 * @param {Function} executor - async function that performs the write call
 * @returns {Promise<Object>}
 */
export async function runWithIdempotency(options, executor) {
  const { key, operation, payload } = options || {};
  if (!key) {
    const result = await executor();
    return withIdempotencyMetadata(result, {
      key: null,
      operation: operation || null,
      replayed: false
    });
  }

  const cacheKey = `${operation}:${key}`;
  const hash = payloadHash(payload);
  const existing = operationCache.get(cacheKey);

  if (existing) {
    if (existing.payloadHash !== hash) {
      throw new Error(
        `Idempotency key conflict for ${operation}. ` +
        'The same key was previously used with a different payload.'
      );
    }

    return withIdempotencyMetadata(existing.result, {
      key,
      operation,
      replayed: true
    });
  }

  const result = await executor();
  operationCache.set(cacheKey, {
    payloadHash: hash,
    result
  });

  return withIdempotencyMetadata(result, {
    key,
    operation,
    replayed: false
  });
}

export function clearIdempotencyCache() {
  operationCache.clear();
}
