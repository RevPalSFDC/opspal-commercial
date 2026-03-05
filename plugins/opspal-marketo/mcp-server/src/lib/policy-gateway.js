/**
 * Marketo Policy Gateway
 *
 * Marketo adapter built on top of the shared opspal-core API policy gateway.
 * Keeps existing exports and Marketo-specific retry semantics for compatibility.
 *
 * @module policy-gateway
 * @version 1.1.0
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  ApiPolicyGateway,
  ApiPolicyError
} = require('../../../../opspal-core/scripts/lib/api-policy-gateway.js');
const { AutomationEventEmitter } = require('../../../../opspal-core/scripts/lib/automation-event-emitter.js');

const DEFAULTS = {
  windowMs: 20_000,
  targetCallsPerWindow: 50,
  hardCallsPerWindow: 100,
  maxConcurrent: 10,
  maxRetries: 4,
  baseBackoffMs: 750,
  maxBackoffMs: 20_000,
  dailySoftLimit: 50_000,
  retryableCodes: ['601', '602', '606', '608', '611', '615', '1029', '429', '500', '502', '503', '504'],
  nonRetryableCodes: ['607', '401', '403']
};

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function resolveConfig(config = {}) {
  return {
    platform: 'marketo',
    windowMs: parseInteger(process.env.MARKETO_POLICY_WINDOW_MS, config.windowMs || DEFAULTS.windowMs),
    targetCallsPerWindow: parseInteger(
      process.env.MARKETO_POLICY_TARGET_CALLS_PER_WINDOW,
      config.targetCallsPerWindow || DEFAULTS.targetCallsPerWindow
    ),
    hardCallsPerWindow: parseInteger(
      process.env.MARKETO_POLICY_HARD_CALLS_PER_WINDOW,
      config.hardCallsPerWindow || DEFAULTS.hardCallsPerWindow
    ),
    maxConcurrent: parseInteger(
      process.env.MARKETO_POLICY_MAX_CONCURRENT,
      config.maxConcurrent || DEFAULTS.maxConcurrent
    ),
    maxRetries: parseInteger(process.env.MARKETO_POLICY_MAX_RETRIES, config.maxRetries || DEFAULTS.maxRetries),
    baseBackoffMs: parseInteger(
      process.env.MARKETO_POLICY_BASE_BACKOFF_MS,
      config.baseBackoffMs || DEFAULTS.baseBackoffMs
    ),
    maxBackoffMs: parseInteger(
      process.env.MARKETO_POLICY_MAX_BACKOFF_MS,
      config.maxBackoffMs || DEFAULTS.maxBackoffMs
    ),
    dailySoftLimit: parseInteger(
      process.env.MARKETO_POLICY_DAILY_SOFT_LIMIT,
      config.dailySoftLimit || DEFAULTS.dailySoftLimit
    ),
    retryableCodes: config.retryableCodes || DEFAULTS.retryableCodes,
    nonRetryableCodes: config.nonRetryableCodes || DEFAULTS.nonRetryableCodes,
    circuitFailureThreshold: parseInteger(
      process.env.MARKETO_POLICY_CIRCUIT_FAILURE_THRESHOLD,
      config.circuitFailureThreshold || 5
    ),
    circuitCooldownMs: parseInteger(
      process.env.MARKETO_POLICY_CIRCUIT_COOLDOWN_MS,
      config.circuitCooldownMs || 60_000
    )
  };
}

export class MarketoPolicyError extends ApiPolicyError {
  constructor(message, code, metadata = {}) {
    super(message, code, metadata);
    this.name = 'MarketoPolicyError';
  }
}

export class PolicyGateway extends ApiPolicyGateway {
  constructor(config = {}) {
    super(resolveConfig(config));

    this.eventEmitter = config.eventEmitter || new AutomationEventEmitter({
      source: 'opspal-marketo-mcp'
    });
  }

  onEvent(eventType, payload) {
    if (!this.eventEmitter) return;

    this.eventEmitter.emitPolicyEvent({
      eventType,
      platform: 'marketo',
      status: payload?.status || 'observed',
      severity: payload?.severity || 'info',
      details: payload,
      metrics: {
        dailyCount: this.dailyCount,
        targetCallsPerWindow: this.config.targetCallsPerWindow
      },
      tags: ['marketo', 'policy-gateway']
    });
  }

  classifyError(error) {
    const base = super.classifyError(error);

    // Preserve Marketo semantics where 607 is non-retryable daily quota.
    if (base.code === '607') {
      return {
        ...base,
        retryable: false,
        reason: 'marketo_daily_quota_exhausted'
      };
    }

    return base;
  }

  async execute(requestFn, context = {}) {
    try {
      return await super.execute(requestFn, {
        platform: 'marketo',
        ...context
      });
    } catch (error) {
      if (error && error.code === 'DAILY_SOFT_LIMIT_REACHED') {
        error.code = '607';
        throw new MarketoPolicyError(
          `Daily API budget reached (${this.dailyCount}/${this.config.dailySoftLimit})`,
          '607',
          {
            dailyCount: this.dailyCount,
            dailySoftLimit: this.config.dailySoftLimit
          }
        );
      }

      throw error;
    }
  }
}

let singleton = null;

export function getPolicyGateway() {
  if (!singleton) {
    singleton = new PolicyGateway();
  }
  return singleton;
}

export function createPolicyGateway(config = {}) {
  return new PolicyGateway(config);
}
