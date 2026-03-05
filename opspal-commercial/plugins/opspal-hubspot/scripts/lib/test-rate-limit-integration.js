#!/usr/bin/env node

/**
 * Rate Limit Integration Test Suite
 *
 * Tests the integration of:
 * - hubspot-rate-limit-parser.js
 * - hubspot-request-throttle.js
 * - Batch wrappers (batch-update-wrapper, batch-upsert-helper, batch-associations-v4)
 *
 * Run: node scripts/lib/test-rate-limit-integration.js
 *
 * @version 1.0.0
 * @phase Rate Limit Integration Verification
 */

const { parseRateLimitHeaders, shouldProceed, detectTierFromHeaders, formatForLog } = require('./hubspot-rate-limit-parser');
const { HubSpotRequestThrottle, getThrottle } = require('./hubspot-request-throttle');
const BatchUpdateWrapper = require('./batch-update-wrapper');
const BatchUpsertHelper = require('./batch-upsert-helper');
const BatchAssociationsV4 = require('./batch-associations-v4');

let passed = 0;
let failed = 0;

function test(name, testFn) {
  try {
    testFn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(`Expected truthy value. ${message}`);
  }
}

function assertFalse(value, message = '') {
  if (value) {
    throw new Error(`Expected falsy value. ${message}`);
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  RATE LIMIT INTEGRATION TEST SUITE');
console.log('═══════════════════════════════════════════════════════════\n');

// ============================================
// hubspot-rate-limit-parser.js Tests
// ============================================
console.log('📦 Testing hubspot-rate-limit-parser.js\n');

test('parseRateLimitHeaders - parses window limits', () => {
  const headers = {
    'X-HubSpot-RateLimit-Max': '100',
    'X-HubSpot-RateLimit-Remaining': '85'
  };
  const result = parseRateLimitHeaders({ headers });
  assertEqual(result.windowMax, 100);
  assertEqual(result.windowRemaining, 85);
});

test('parseRateLimitHeaders - parses daily limits', () => {
  const headers = {
    'X-HubSpot-RateLimit-Daily': '250000',
    'X-HubSpot-RateLimit-Daily-Remaining': '200000'
  };
  const result = parseRateLimitHeaders({ headers });
  assertEqual(result.dailyMax, 250000);
  assertEqual(result.dailyRemaining, 200000);
});

test('parseRateLimitHeaders - calculates near-limit status', () => {
  const headers = {
    'X-HubSpot-RateLimit-Max': '100',
    'X-HubSpot-RateLimit-Remaining': '15' // < 20%
  };
  const result = parseRateLimitHeaders({ headers });
  assertTrue(result.isNearWindowLimit, 'Should detect near window limit');
});

test('parseRateLimitHeaders - parses Retry-After', () => {
  const headers = { 'Retry-After': '10' };
  const result = parseRateLimitHeaders({ headers });
  assertEqual(result.retryAfter, 10);
  assertEqual(result.recommendedDelay, 10000); // 10s in ms
});

test('shouldProceed - blocks on exhausted window', () => {
  const info = { windowRemaining: 0, retryAfter: null };
  const decision = shouldProceed(info);
  assertFalse(decision.canProceed, 'Should not proceed when window exhausted');
});

test('shouldProceed - allows with delay when near limit', () => {
  const info = {
    windowRemaining: 10,
    windowMax: 100,
    isNearWindowLimit: true,
    retryAfter: null,
    recommendedDelay: 500
  };
  const decision = shouldProceed(info);
  assertTrue(decision.canProceed, 'Should proceed with delay');
  assertTrue(decision.waitMs > 0, 'Should have wait time');
});

test('detectTierFromHeaders - detects starter tier', () => {
  const info = { windowMax: 100 };
  assertEqual(detectTierFromHeaders(info), 'starter');
});

test('detectTierFromHeaders - detects professional tier', () => {
  const info = { windowMax: 190 };
  assertEqual(detectTierFromHeaders(info), 'professional');
});

test('formatForLog - formats correctly', () => {
  const info = { windowRemaining: 85, windowMax: 100, dailyRemaining: 200000, dailyMax: 250000 };
  const log = formatForLog(info);
  assertTrue(log.includes('Window: 85/100'), 'Should include window info');
  assertTrue(log.includes('Daily: 200000/250000'), 'Should include daily info');
});

// ============================================
// hubspot-request-throttle.js Tests
// ============================================
console.log('\n📦 Testing hubspot-request-throttle.js\n');

// Reset singleton for tests
HubSpotRequestThrottle.resetInstance();

test('Singleton pattern - same instance returned', () => {
  const t1 = HubSpotRequestThrottle.getInstance({ tier: 'starter' });
  const t2 = HubSpotRequestThrottle.getInstance();
  assertTrue(t1 === t2, 'Should return same instance');
});

test('getStatus - returns valid status object', () => {
  const throttle = getThrottle();
  const status = throttle.getStatus();
  assertTrue(status.tier !== undefined, 'Should have tier');
  assertTrue(status.activeRequests !== undefined, 'Should have activeRequests');
  assertTrue(status.maxConcurrent !== undefined, 'Should have maxConcurrent');
  assertTrue(status.circuitBreaker !== undefined, 'Should have circuitBreaker state');
});

test('Circuit breaker - opens after failures', () => {
  HubSpotRequestThrottle.resetInstance();
  const throttle = getThrottle({ tier: 'starter' });

  // Simulate 3 consecutive 429s
  throttle.handleRateLimitError({ status: 429 });
  throttle.handleRateLimitError({ status: 429 });
  throttle.handleRateLimitError({ status: 429 });

  assertEqual(throttle.circuitBreaker.state, 'OPEN', 'Circuit breaker should be OPEN');
});

test('Circuit breaker - resets correctly', () => {
  const throttle = getThrottle();
  throttle.resetCircuitBreaker();
  assertEqual(throttle.circuitBreaker.state, 'CLOSED', 'Circuit breaker should be CLOSED');
});

// ============================================
// Batch Wrapper Integration Tests
// ============================================
console.log('\n📦 Testing Batch Wrapper Integration\n');

test('BatchUpdateWrapper - initializes throttle by default', () => {
  HubSpotRequestThrottle.resetInstance();
  const wrapper = new BatchUpdateWrapper('test-token', { verbose: false });
  assertTrue(wrapper.useThrottle, 'Should use throttle by default');
  assertTrue(wrapper.throttle !== undefined, 'Should have throttle instance');
});

test('BatchUpdateWrapper - throttle can be disabled', () => {
  HubSpotRequestThrottle.resetInstance();
  const wrapper = new BatchUpdateWrapper('test-token', { useThrottle: false });
  assertFalse(wrapper.useThrottle, 'Should not use throttle when disabled');
});

test('BatchUpdateWrapper - tracks rate limit hits in stats', () => {
  HubSpotRequestThrottle.resetInstance();
  const wrapper = new BatchUpdateWrapper('test-token');
  assertTrue('rateLimitHits' in wrapper.stats, 'Should track rateLimitHits');
});

test('BatchUpdateWrapper - has getAdaptiveDelay method', () => {
  const wrapper = new BatchUpdateWrapper('test-token');
  assertTrue(typeof wrapper.getAdaptiveDelay === 'function', 'Should have getAdaptiveDelay');
  assertTrue(wrapper.getAdaptiveDelay() >= 100, 'Should return minimum delay');
});

test('BatchUpsertHelper - initializes throttle by default', () => {
  HubSpotRequestThrottle.resetInstance();
  const helper = new BatchUpsertHelper('test-token', { verbose: false });
  assertTrue(helper.useThrottle, 'Should use throttle by default');
  assertTrue(helper.throttle !== undefined, 'Should have throttle instance');
});

test('BatchUpsertHelper - tracks rate limit hits in stats', () => {
  HubSpotRequestThrottle.resetInstance();
  const helper = new BatchUpsertHelper('test-token');
  assertTrue('rateLimitHits' in helper.stats, 'Should track rateLimitHits');
});

test('BatchAssociationsV4 - initializes throttle by default', () => {
  HubSpotRequestThrottle.resetInstance();
  const wrapper = new BatchAssociationsV4('test-token', { verbose: false });
  assertTrue(wrapper.useThrottle, 'Should use throttle by default');
  assertTrue(wrapper.throttle !== undefined, 'Should have throttle instance');
});

test('BatchAssociationsV4 - tracks rate limit hits in stats', () => {
  HubSpotRequestThrottle.resetInstance();
  const wrapper = new BatchAssociationsV4('test-token');
  assertTrue('rateLimitHits' in wrapper.stats, 'Should track rateLimitHits');
});

// ============================================
// Shared Throttle Tests
// ============================================
console.log('\n📦 Testing Shared Throttle Coordination\n');

test('All wrappers share same throttle instance', () => {
  HubSpotRequestThrottle.resetInstance();

  const update = new BatchUpdateWrapper('test-token');
  const upsert = new BatchUpsertHelper('test-token');
  const assoc = new BatchAssociationsV4('test-token');

  assertTrue(update.throttle === upsert.throttle, 'Update and upsert should share throttle');
  assertTrue(upsert.throttle === assoc.throttle, 'Upsert and associations should share throttle');
});

test('Stats includes throttle status', () => {
  HubSpotRequestThrottle.resetInstance();
  const wrapper = new BatchUpdateWrapper('test-token');
  wrapper.stats.startTime = Date.now();
  wrapper.stats.endTime = Date.now() + 1000;

  const stats = wrapper.getStats();
  assertTrue('throttleStatus' in stats, 'Stats should include throttleStatus');
});

// ============================================
// Summary
// ============================================
console.log('\n───────────────────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

// Cleanup
HubSpotRequestThrottle.resetInstance();

process.exit(failed > 0 ? 1 : 0);
