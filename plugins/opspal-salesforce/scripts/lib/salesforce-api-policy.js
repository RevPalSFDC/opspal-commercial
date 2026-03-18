#!/usr/bin/env node
'use strict';

/**
 * Salesforce API Policy
 *
 * Shared policy wrapper for Salesforce API workflows using opspal-core
 * gateway semantics plus Salesforce limits snapshot support.
 */

const { ApiPolicyGateway } = require('../../../opspal-core/scripts/lib/api-policy-gateway');
const { AutomationEventEmitter } = require('../../../opspal-core/scripts/lib/automation-event-emitter');

class SalesforceApiPolicy {
  constructor(options = {}) {
    this.eventEmitter = options.eventEmitter || new AutomationEventEmitter({
      source: 'opspal-salesforce'
    });

    this.limitsSnapshot = null;

    this.gateway = new ApiPolicyGateway({
      platform: 'salesforce',
      windowMs: options.windowMs || 20_000,
      targetCallsPerWindow: options.targetCallsPerWindow || 75,
      hardCallsPerWindow: options.hardCallsPerWindow || 100,
      maxConcurrent: options.maxConcurrent || 10,
      maxRetries: options.maxRetries || 4,
      baseBackoffMs: options.baseBackoffMs || 700,
      maxBackoffMs: options.maxBackoffMs || 20_000,
      dailySoftLimit: options.dailySoftLimit || parseInt(process.env.SALESFORCE_DAILY_SOFT_LIMIT || '90000', 10),
      retryableCodes: ['429', '500', '502', '503', '504', 'REQUEST_LIMIT_EXCEEDED', 'SERVER_UNAVAILABLE'],
      nonRetryableCodes: ['401', '403', 'INVALID_SESSION_ID']
    });

    this.gateway.onEvent = (eventType, payload) => {
      this.eventEmitter.emitPolicyEvent({
        eventType,
        platform: 'salesforce',
        status: payload?.status || 'observed',
        severity: payload?.severity || 'info',
        details: payload,
        metrics: this.limitsSnapshot || {},
        tags: ['salesforce', 'policy']
      });
    };
  }

  static buildLimitsSnapshot(limitsResponse = {}) {
    const apiBlock = limitsResponse?.DailyApiRequests || limitsResponse?.dailyApiRequests || null;
    if (!apiBlock || typeof apiBlock !== 'object') {
      return null;
    }

    const max = Number(apiBlock.Max || apiBlock.max || 0);
    const remaining = Number(apiBlock.Remaining || apiBlock.remaining || 0);

    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(remaining)) {
      return null;
    }

    const used = Math.max(0, max - remaining);
    const usagePercent = max > 0 ? Math.round((used / max) * 100) : 0;

    return {
      max,
      remaining,
      used,
      usagePercent
    };
  }

  applyLimitsSnapshot(limitsResponse = {}) {
    const snapshot = SalesforceApiPolicy.buildLimitsSnapshot(limitsResponse);
    if (!snapshot) {
      return null;
    }

    this.limitsSnapshot = snapshot;

    // Keep a 10% reserve by default for interactive operations.
    const reserve = Math.max(500, Math.floor(snapshot.max * 0.1));
    const dynamicSoftLimit = Math.max(1, snapshot.max - reserve);
    this.gateway.config.dailySoftLimit = dynamicSoftLimit;

    return {
      ...snapshot,
      reserve,
      dailySoftLimit: dynamicSoftLimit
    };
  }

  async execute(requestFn, context = {}) {
    return this.gateway.execute(requestFn, {
      platform: 'salesforce',
      ...context
    });
  }

  classifyError(error) {
    const classified = this.gateway.classifyError(error);

    if (classified.code === 'REQUEST_LIMIT_EXCEEDED') {
      return {
        ...classified,
        retryable: true,
        reason: 'salesforce_request_limit_exceeded'
      };
    }

    return classified;
  }

  recordHeaders(headers) {
    this.gateway.recordHeaders(headers);
  }

  getStats() {
    return {
      ...this.gateway.getStats(),
      salesforceLimits: this.limitsSnapshot
    };
  }
}

module.exports = {
  SalesforceApiPolicy
};
