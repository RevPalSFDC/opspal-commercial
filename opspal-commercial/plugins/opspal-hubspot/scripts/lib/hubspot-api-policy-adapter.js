#!/usr/bin/env node
'use strict';

/**
 * HubSpot API Policy Adapter
 *
 * Bridges shared opspal-core API policy controls with the existing
 * HubSpotRequestThrottle singleton.
 */

const { ApiPolicyGateway } = require('../../../opspal-core/scripts/lib/api-policy-gateway');
const { AutomationEventEmitter } = require('../../../opspal-core/scripts/lib/automation-event-emitter');
const { getThrottle } = require('./hubspot-request-throttle');

const WINDOW_LIMIT_BY_TIER = {
  starter: 100,
  professional: 150,
  enterprise: 200,
  oauth_app: 110
};

class HubSpotApiPolicyAdapter {
  constructor(options = {}) {
    this.tier = options.tier || process.env.HUBSPOT_TIER || 'starter';
    this.windowLimit = WINDOW_LIMIT_BY_TIER[this.tier] || WINDOW_LIMIT_BY_TIER.starter;

    this.eventEmitter = options.eventEmitter || new AutomationEventEmitter({
      source: 'opspal-hubspot'
    });

    this.gateway = new ApiPolicyGateway({
      platform: 'hubspot',
      windowMs: 10_000,
      targetCallsPerWindow: Math.max(1, Math.floor(this.windowLimit * 0.8)),
      hardCallsPerWindow: this.windowLimit,
      maxConcurrent: options.maxConcurrent || 12,
      maxRetries: options.maxRetries || 4,
      baseBackoffMs: options.baseBackoffMs || 700,
      maxBackoffMs: options.maxBackoffMs || 15_000,
      dailySoftLimit: options.dailySoftLimit || parseInt(process.env.HUBSPOT_DAILY_SOFT_LIMIT || '500000', 10),
      retryableCodes: ['429', '500', '502', '503', '504', 'ETIMEDOUT', 'ECONNRESET'],
      nonRetryableCodes: ['401', '403', '404']
    });

    this.gateway.onEvent = (eventType, payload) => {
      this.eventEmitter.emitPolicyEvent({
        eventType,
        platform: 'hubspot',
        severity: payload?.severity || 'info',
        status: payload?.status || 'observed',
        details: payload,
        tags: ['hubspot', 'policy-adapter']
      });
    };

    this.throttle = getThrottle({
      tier: this.tier,
      verbose: options.verbose || false
    });
  }

  async execute(requestFn, context = {}) {
    return this.gateway.execute(async ({ attempt }) => {
      return this.throttle.enqueue(async () => {
        const result = await requestFn({ attempt, context });

        if (result && result.headers) {
          this.gateway.recordHeaders(result.headers);
        }

        return result;
      }, {
        priority: context.priority || 'normal'
      });
    }, context);
  }

  classifyError(error) {
    return this.gateway.classifyError(error);
  }

  recordHeaders(headers) {
    this.gateway.recordHeaders(headers);
  }

  getStats() {
    return {
      policy: this.gateway.getStats(),
      throttle: this.throttle.getStats()
    };
  }
}

module.exports = {
  HubSpotApiPolicyAdapter
};
