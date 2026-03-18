#!/usr/bin/env node
'use strict';

/**
 * API Policy Gateway
 *
 * Shared reliability gateway used by platform adapters (Marketo/HubSpot/Salesforce).
 * Enforces throughput, retries, concurrency, and daily soft-limit budget controls.
 */

const {
  ApiPolicyError,
  DEFAULT_POLICY_CONFIG,
  POLICY_EVENT_TYPES,
  normalizeConfig
} = require('./api-policy-contract');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function currentDateUtc() {
  return new Date().toISOString().slice(0, 10);
}

function extractCode(error) {
  if (!error) return null;

  if (error.code) return String(error.code);

  if (error.status) return String(error.status);

  if (error.response && error.response.status) {
    return String(error.response.status);
  }

  const message = error.message || '';
  const bracketMatch = message.match(/\[(\d{3,4})\]/);
  if (bracketMatch) return bracketMatch[1];

  const plainMatch = message.match(/\b(\d{3,4})\b/);
  return plainMatch ? plainMatch[1] : null;
}

function normalizeHeaders(headers) {
  if (!headers) return {};

  if (typeof headers.get === 'function') {
    const entries = {};
    for (const [key, value] of headers.entries()) {
      entries[String(key).toLowerCase()] = value;
    }
    return entries;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[String(key).toLowerCase()] = value;
  }
  return normalized;
}

function parseRetryAfterMs(value) {
  if (!value) return 0;

  const numericSeconds = Number.parseInt(value, 10);
  if (!Number.isNaN(numericSeconds)) {
    return Math.max(0, numericSeconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return 0;
}

function toBackoffDelayMs(attempt, baseBackoffMs, maxBackoffMs) {
  const exponential = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return exponential + jitter;
}

class ApiPolicyGateway {
  constructor(config = {}) {
    this.config = normalizeConfig(config);
    this.platform = this.config.platform || DEFAULT_POLICY_CONFIG.platform;

    this.retryableCodes = new Set((this.config.retryableCodes || DEFAULT_POLICY_CONFIG.retryableCodes).map(String));
    this.nonRetryableCodes = new Set((this.config.nonRetryableCodes || DEFAULT_POLICY_CONFIG.nonRetryableCodes).map(String));

    this.inFlight = 0;
    this.waitQueue = [];
    this.windowTimestamps = [];
    this.dailyDate = currentDateUtc();
    this.dailyCount = 0;

    this.circuit = {
      state: 'CLOSED',
      consecutiveFailures: 0,
      openedAt: null,
      cooldownMs: this.config.circuitCooldownMs || 60_000,
      maxConsecutiveFailures: this.config.circuitFailureThreshold || 5
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      policyBlocks: 0,
      windowWaitEvents: 0,
      circuitOpenEvents: 0,
      lastErrorCode: null,
      lastHeaders: null,
      retryAfterMs: 0
    };
  }

  onEvent(_eventType, _payload) {
    // Optional extension point. Adapters can override.
  }

  emitEvent(eventType, payload = {}) {
    try {
      this.onEvent(eventType, {
        timestamp: new Date().toISOString(),
        platform: this.platform,
        ...payload
      });
    } catch {
      // Never fail policy execution due to telemetry hooks.
    }
  }

  resetDailyIfNeeded() {
    const today = currentDateUtc();
    if (today !== this.dailyDate) {
      this.dailyDate = today;
      this.dailyCount = 0;
    }
  }

  pruneWindow(now = Date.now()) {
    const cutoff = now - this.config.windowMs;
    while (this.windowTimestamps.length > 0 && this.windowTimestamps[0] < cutoff) {
      this.windowTimestamps.shift();
    }
  }

  async acquireConcurrencySlot() {
    if (this.inFlight < this.config.maxConcurrent) {
      this.inFlight += 1;
      return;
    }

    await new Promise(resolve => {
      this.waitQueue.push(resolve);
    });

    this.inFlight += 1;
  }

  releaseConcurrencySlot() {
    this.inFlight = Math.max(0, this.inFlight - 1);

    const next = this.waitQueue.shift();
    if (next) next();
  }

  async enforceRateWindow() {
    while (true) {
      const now = Date.now();
      this.pruneWindow(now);

      if (this.windowTimestamps.length < this.config.targetCallsPerWindow) {
        this.windowTimestamps.push(now);
        return;
      }

      const oldestTimestamp = this.windowTimestamps[0] || now;
      const waitMs = Math.max(50, this.config.windowMs - (now - oldestTimestamp));
      this.stats.windowWaitEvents += 1;
      this.emitEvent(POLICY_EVENT_TYPES.WINDOW_WAIT, {
        waitMs,
        callsInWindow: this.windowTimestamps.length,
        targetCallsPerWindow: this.config.targetCallsPerWindow
      });
      await sleep(waitMs);
    }
  }

  assertDailyBudget() {
    this.resetDailyIfNeeded();

    if (this.dailyCount >= this.config.dailySoftLimit) {
      this.stats.policyBlocks += 1;
      const error = new ApiPolicyError(
        `Daily API budget reached (${this.dailyCount}/${this.config.dailySoftLimit})`,
        'DAILY_SOFT_LIMIT_REACHED',
        {
          dailyCount: this.dailyCount,
          dailySoftLimit: this.config.dailySoftLimit,
          platform: this.platform
        }
      );

      this.emitEvent(POLICY_EVENT_TYPES.POLICY_BLOCK, {
        reason: 'daily_soft_limit',
        dailyCount: this.dailyCount,
        dailySoftLimit: this.config.dailySoftLimit
      });

      throw error;
    }
  }

  assertCircuitState() {
    if (this.circuit.state !== 'OPEN') {
      return;
    }

    const elapsed = Date.now() - (this.circuit.openedAt || 0);
    if (elapsed >= this.circuit.cooldownMs) {
      this.circuit.state = 'HALF_OPEN';
      return;
    }

    this.stats.policyBlocks += 1;
    const error = new ApiPolicyError(
      `Circuit breaker open for ${this.platform}. Retry after cooldown.`,
      'CIRCUIT_OPEN',
      {
        platform: this.platform,
        cooldownMs: this.circuit.cooldownMs,
        elapsedMs: elapsed
      }
    );

    this.emitEvent(POLICY_EVENT_TYPES.POLICY_BLOCK, {
      reason: 'circuit_open',
      cooldownMs: this.circuit.cooldownMs,
      elapsedMs: elapsed
    });

    throw error;
  }

  recordRequestStart(context = {}) {
    this.resetDailyIfNeeded();
    this.dailyCount += 1;
    this.stats.totalRequests += 1;

    this.emitEvent(POLICY_EVENT_TYPES.REQUEST_START, {
      dailyCount: this.dailyCount,
      context
    });
  }

  markSuccess(context = {}) {
    this.stats.successfulRequests += 1;
    this.circuit.consecutiveFailures = 0;
    this.circuit.state = 'CLOSED';

    this.emitEvent(POLICY_EVENT_TYPES.REQUEST_SUCCESS, {
      context
    });
  }

  markFailure(error, context = {}) {
    this.stats.failedRequests += 1;
    this.stats.lastErrorCode = extractCode(error);
    this.circuit.consecutiveFailures += 1;

    if (this.circuit.consecutiveFailures >= this.circuit.maxConsecutiveFailures) {
      this.circuit.state = 'OPEN';
      this.circuit.openedAt = Date.now();
      this.stats.circuitOpenEvents += 1;
      this.emitEvent(POLICY_EVENT_TYPES.CIRCUIT_OPEN, {
        consecutiveFailures: this.circuit.consecutiveFailures,
        threshold: this.circuit.maxConsecutiveFailures
      });
    }

    this.emitEvent(POLICY_EVENT_TYPES.REQUEST_FAILURE, {
      errorCode: this.stats.lastErrorCode,
      errorMessage: error?.message,
      context
    });
  }

  classifyError(error) {
    const code = extractCode(error);

    if (code && this.nonRetryableCodes.has(code)) {
      return { retryable: false, code, reason: 'non_retryable_code' };
    }

    if (code && this.retryableCodes.has(code)) {
      return { retryable: true, code, reason: 'retryable_code' };
    }

    if (error && error.name === 'TypeError') {
      return { retryable: true, code: code || 'TYPE_ERROR', reason: 'network_type_error' };
    }

    if (error && error.status && Number(error.status) >= 500) {
      return { retryable: true, code: String(error.status), reason: 'server_error_status' };
    }

    return { retryable: false, code, reason: 'default_non_retryable' };
  }

  recordHeaders(headers) {
    const normalized = normalizeHeaders(headers);
    this.stats.lastHeaders = normalized;

    const retryAfterMs = parseRetryAfterMs(normalized['retry-after']);
    if (retryAfterMs > 0) {
      this.stats.retryAfterMs = retryAfterMs;
    }

    this.emitEvent(POLICY_EVENT_TYPES.HEADER_RECORDED, {
      headers: normalized,
      retryAfterMs: this.stats.retryAfterMs
    });
  }

  async execute(requestFn, context = {}) {
    let attempt = 0;
    let lastError = null;

    while (attempt <= this.config.maxRetries) {
      attempt += 1;
      await this.acquireConcurrencySlot();

      try {
        this.assertCircuitState();
        this.assertDailyBudget();
        await this.enforceRateWindow();
        this.recordRequestStart(context);

        const result = await requestFn({
          attempt,
          context,
          gateway: this
        });

        this.markSuccess(context);
        return result;
      } catch (error) {
        lastError = error;
        this.markFailure(error, context);

        const classification = this.classifyError(error);
        if (!classification.retryable || attempt > this.config.maxRetries) {
          throw error;
        }

        this.stats.retries += 1;

        let delayMs = 0;
        const retryAfterFromError = parseRetryAfterMs(error?.retryAfter || error?.retry_after);
        if (retryAfterFromError > 0) {
          delayMs = retryAfterFromError;
        } else if (this.stats.retryAfterMs > 0) {
          delayMs = this.stats.retryAfterMs;
        } else {
          delayMs = toBackoffDelayMs(attempt, this.config.baseBackoffMs, this.config.maxBackoffMs);
        }

        this.emitEvent(POLICY_EVENT_TYPES.RETRY_SCHEDULED, {
          attempt,
          delayMs,
          classification
        });

        await sleep(delayMs);
      } finally {
        this.releaseConcurrencySlot();
      }
    }

    throw lastError || new Error(`Policy execution failed for ${this.platform}`);
  }

  getStats() {
    this.resetDailyIfNeeded();
    this.pruneWindow(Date.now());

    return {
      platform: this.platform,
      inFlight: this.inFlight,
      queued: this.waitQueue.length,
      callsInCurrentWindow: this.windowTimestamps.length,
      targetCallsPerWindow: this.config.targetCallsPerWindow,
      hardCallsPerWindow: this.config.hardCallsPerWindow,
      dailyCount: this.dailyCount,
      dailySoftLimit: this.config.dailySoftLimit,
      dailyDate: this.dailyDate,
      circuit: {
        state: this.circuit.state,
        consecutiveFailures: this.circuit.consecutiveFailures,
        openedAt: this.circuit.openedAt
      },
      stats: { ...this.stats }
    };
  }
}

function createApiPolicyGateway(config = {}) {
  return new ApiPolicyGateway(config);
}

module.exports = {
  ApiPolicyError,
  ApiPolicyGateway,
  createApiPolicyGateway,
  extractCode,
  normalizeHeaders,
  parseRetryAfterMs,
  toBackoffDelayMs
};
