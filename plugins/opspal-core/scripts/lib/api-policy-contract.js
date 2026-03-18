#!/usr/bin/env node
'use strict';

/**
 * API Policy Contract
 *
 * Shared contract primitives for policy gateways used across platform plugins.
 */

const DEFAULT_POLICY_CONFIG = {
  platform: 'generic',
  windowMs: 20_000,
  targetCallsPerWindow: 80,
  hardCallsPerWindow: 100,
  maxConcurrent: 10,
  maxRetries: 3,
  baseBackoffMs: 750,
  maxBackoffMs: 20_000,
  dailySoftLimit: 50_000,
  retryableCodes: ['429', '500', '502', '503', '504', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'],
  nonRetryableCodes: ['401', '403']
};

const POLICY_EVENT_TYPES = {
  REQUEST_START: 'request_start',
  REQUEST_SUCCESS: 'request_success',
  REQUEST_FAILURE: 'request_failure',
  RETRY_SCHEDULED: 'retry_scheduled',
  WINDOW_WAIT: 'window_wait',
  POLICY_BLOCK: 'policy_block',
  CIRCUIT_OPEN: 'circuit_open',
  HEADER_RECORDED: 'header_recorded'
};

class ApiPolicyError extends Error {
  constructor(message, code, metadata = {}) {
    super(message);
    this.name = 'ApiPolicyError';
    this.code = String(code || 'POLICY_ERROR');
    this.metadata = metadata;
  }
}

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeConfig(overrides = {}, env = process.env) {
  const config = {
    ...DEFAULT_POLICY_CONFIG,
    ...overrides
  };

  if (env.OPSPAL_POLICY_WINDOW_MS) {
    config.windowMs = normalizeInteger(env.OPSPAL_POLICY_WINDOW_MS, config.windowMs);
  }
  if (env.OPSPAL_POLICY_TARGET_CALLS_PER_WINDOW) {
    config.targetCallsPerWindow = normalizeInteger(
      env.OPSPAL_POLICY_TARGET_CALLS_PER_WINDOW,
      config.targetCallsPerWindow
    );
  }
  if (env.OPSPAL_POLICY_HARD_CALLS_PER_WINDOW) {
    config.hardCallsPerWindow = normalizeInteger(
      env.OPSPAL_POLICY_HARD_CALLS_PER_WINDOW,
      config.hardCallsPerWindow
    );
  }
  if (env.OPSPAL_POLICY_MAX_CONCURRENT) {
    config.maxConcurrent = normalizeInteger(env.OPSPAL_POLICY_MAX_CONCURRENT, config.maxConcurrent);
  }
  if (env.OPSPAL_POLICY_MAX_RETRIES) {
    config.maxRetries = normalizeInteger(env.OPSPAL_POLICY_MAX_RETRIES, config.maxRetries);
  }
  if (env.OPSPAL_POLICY_BASE_BACKOFF_MS) {
    config.baseBackoffMs = normalizeInteger(env.OPSPAL_POLICY_BASE_BACKOFF_MS, config.baseBackoffMs);
  }
  if (env.OPSPAL_POLICY_MAX_BACKOFF_MS) {
    config.maxBackoffMs = normalizeInteger(env.OPSPAL_POLICY_MAX_BACKOFF_MS, config.maxBackoffMs);
  }
  if (env.OPSPAL_POLICY_DAILY_SOFT_LIMIT) {
    config.dailySoftLimit = normalizeInteger(env.OPSPAL_POLICY_DAILY_SOFT_LIMIT, config.dailySoftLimit);
  }

  return config;
}

module.exports = {
  ApiPolicyError,
  DEFAULT_POLICY_CONFIG,
  POLICY_EVENT_TYPES,
  normalizeConfig,
  normalizeInteger
};
