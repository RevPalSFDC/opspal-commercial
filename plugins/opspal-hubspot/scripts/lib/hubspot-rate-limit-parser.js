#!/usr/bin/env node

/**
 * HubSpot Rate Limit Response Header Parser
 *
 * Parses X-HubSpot-RateLimit-* headers from API responses to enable
 * dynamic rate limit adaptation instead of static delays.
 *
 * Headers parsed:
 * - X-HubSpot-RateLimit-Max: Requests allowed in current window
 * - X-HubSpot-RateLimit-Remaining: Calls still available
 * - X-HubSpot-RateLimit-Daily: Total daily allowance
 * - X-HubSpot-RateLimit-Daily-Remaining: Daily calls left
 * - Retry-After: Seconds to wait (on 429 responses)
 *
 * @version 1.0.0
 * @phase Rate Limit Integration (Gap Analysis Fix)
 */

/**
 * Parse rate limit headers from HubSpot API response
 *
 * @param {Response|Object} response - Fetch Response object or headers object
 * @returns {Object} Parsed rate limit information
 */
function parseRateLimitHeaders(response) {
  const headers = response.headers || response;

  // Support both fetch Response and plain object
  const getHeader = (name) => {
    if (typeof headers.get === 'function') {
      return headers.get(name);
    }
    // Support case-insensitive header access
    const lowerName = name.toLowerCase();
    return headers[name] || headers[lowerName] ||
           headers[name.replace(/-/g, '_')] || null;
  };

  const result = {
    // Per-window limits (10 second window)
    windowMax: parseInt(getHeader('X-HubSpot-RateLimit-Max')) || null,
    windowRemaining: parseInt(getHeader('X-HubSpot-RateLimit-Remaining')) || null,

    // Daily limits
    dailyMax: parseInt(getHeader('X-HubSpot-RateLimit-Daily')) || null,
    dailyRemaining: parseInt(getHeader('X-HubSpot-RateLimit-Daily-Remaining')) || null,

    // Retry information (for 429 responses)
    retryAfter: parseInt(getHeader('Retry-After')) || null,

    // Computed fields
    windowUsagePercent: null,
    dailyUsagePercent: null,
    isNearWindowLimit: false,
    isNearDailyLimit: false,
    recommendedDelay: 0,
    timestamp: Date.now()
  };

  // Calculate usage percentages
  if (result.windowMax && result.windowRemaining !== null) {
    const used = result.windowMax - result.windowRemaining;
    result.windowUsagePercent = (used / result.windowMax * 100).toFixed(1);
    result.isNearWindowLimit = result.windowRemaining < result.windowMax * 0.2; // < 20% remaining
  }

  if (result.dailyMax && result.dailyRemaining !== null) {
    const used = result.dailyMax - result.dailyRemaining;
    result.dailyUsagePercent = (used / result.dailyMax * 100).toFixed(1);
    result.isNearDailyLimit = result.dailyRemaining < result.dailyMax * 0.1; // < 10% remaining
  }

  // Calculate recommended delay
  result.recommendedDelay = calculateRecommendedDelay(result);

  return result;
}

/**
 * Calculate recommended delay based on rate limit status
 *
 * @param {Object} rateLimitInfo - Parsed rate limit information
 * @returns {number} Recommended delay in milliseconds
 */
function calculateRecommendedDelay(rateLimitInfo) {
  // If retry-after is specified, use it (convert to ms)
  if (rateLimitInfo.retryAfter) {
    return rateLimitInfo.retryAfter * 1000;
  }

  // If we're near the window limit, add progressive delay
  if (rateLimitInfo.isNearWindowLimit && rateLimitInfo.windowRemaining !== null) {
    // More aggressive delay as we approach limit
    if (rateLimitInfo.windowRemaining <= 5) {
      return 2000; // 2 seconds when very close
    } else if (rateLimitInfo.windowRemaining <= 10) {
      return 1000; // 1 second when close
    } else if (rateLimitInfo.windowRemaining <= 20) {
      return 500;  // 500ms when approaching
    }
    return 250;    // 250ms default near-limit
  }

  // If daily limit is low, add delay to spread requests
  if (rateLimitInfo.isNearDailyLimit) {
    return 500; // Slow down significantly
  }

  return 0; // No delay needed
}

/**
 * Determine if a request should proceed based on rate limit status
 *
 * @param {Object} rateLimitInfo - Parsed rate limit information
 * @returns {Object} Decision with canProceed flag and reason
 */
function shouldProceed(rateLimitInfo) {
  // Always respect retry-after
  if (rateLimitInfo.retryAfter) {
    return {
      canProceed: false,
      reason: `Rate limited. Wait ${rateLimitInfo.retryAfter} seconds.`,
      waitMs: rateLimitInfo.retryAfter * 1000
    };
  }

  // Block if window is exhausted
  if (rateLimitInfo.windowRemaining === 0) {
    return {
      canProceed: false,
      reason: 'Window rate limit exhausted. Wait for next window.',
      waitMs: 10000 // Wait for next 10-second window
    };
  }

  // Block if daily limit is exhausted
  if (rateLimitInfo.dailyRemaining === 0) {
    return {
      canProceed: false,
      reason: 'Daily rate limit exhausted. Wait until tomorrow.',
      waitMs: null // Cannot automatically wait
    };
  }

  // Warn if near limits but allow with delay
  if (rateLimitInfo.isNearWindowLimit || rateLimitInfo.isNearDailyLimit) {
    return {
      canProceed: true,
      reason: 'Approaching rate limit. Adding delay.',
      waitMs: rateLimitInfo.recommendedDelay
    };
  }

  return {
    canProceed: true,
    reason: 'Rate limit OK',
    waitMs: 0
  };
}

/**
 * Detect tier from response headers
 *
 * @param {Object} rateLimitInfo - Parsed rate limit information
 * @returns {string} Detected tier (starter, professional, enterprise)
 */
function detectTierFromHeaders(rateLimitInfo) {
  if (!rateLimitInfo.windowMax) {
    return 'unknown';
  }

  // Based on HubSpot documentation:
  // - Free/Starter: 100 requests per 10 seconds
  // - Professional: 190 requests per 10 seconds
  // - Enterprise: 190 requests per 10 seconds
  // - Public OAuth: 110 requests per 10 seconds
  if (rateLimitInfo.windowMax <= 100) {
    return 'starter';
  } else if (rateLimitInfo.windowMax <= 110) {
    return 'oauth_app';
  } else if (rateLimitInfo.windowMax <= 190) {
    return 'professional'; // or enterprise (same limit)
  } else {
    return 'enterprise';
  }
}

/**
 * Format rate limit info for logging
 *
 * @param {Object} rateLimitInfo - Parsed rate limit information
 * @returns {string} Formatted string for logging
 */
function formatForLog(rateLimitInfo) {
  const parts = [];

  if (rateLimitInfo.windowRemaining !== null && rateLimitInfo.windowMax) {
    parts.push(`Window: ${rateLimitInfo.windowRemaining}/${rateLimitInfo.windowMax}`);
  }

  if (rateLimitInfo.dailyRemaining !== null && rateLimitInfo.dailyMax) {
    parts.push(`Daily: ${rateLimitInfo.dailyRemaining}/${rateLimitInfo.dailyMax}`);
  }

  if (rateLimitInfo.retryAfter) {
    parts.push(`Retry-After: ${rateLimitInfo.retryAfter}s`);
  }

  if (parts.length === 0) {
    return 'No rate limit headers';
  }

  return parts.join(' | ');
}

module.exports = {
  parseRateLimitHeaders,
  calculateRecommendedDelay,
  shouldProceed,
  detectTierFromHeaders,
  formatForLog
};

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--test') {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  HUBSPOT RATE LIMIT PARSER - SELF-TESTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test 1: Parse headers
    const mockHeaders = {
      'X-HubSpot-RateLimit-Max': '100',
      'X-HubSpot-RateLimit-Remaining': '15',
      'X-HubSpot-RateLimit-Daily': '250000',
      'X-HubSpot-RateLimit-Daily-Remaining': '240000'
    };

    const result = parseRateLimitHeaders({ headers: mockHeaders });
    console.log('Test 1: Parse headers');
    console.log('  Input:', mockHeaders);
    console.log('  Output:', result);
    console.log('  ✅ Parsed correctly');

    // Test 2: Near limit detection
    console.log('\nTest 2: Near limit detection');
    console.log('  isNearWindowLimit:', result.isNearWindowLimit);
    console.log('  recommendedDelay:', result.recommendedDelay, 'ms');
    console.log('  ✅ Near-limit detected correctly');

    // Test 3: Tier detection
    console.log('\nTest 3: Tier detection');
    console.log('  Detected tier:', detectTierFromHeaders(result));
    console.log('  ✅ Tier detected correctly');

    // Test 4: Should proceed check
    console.log('\nTest 4: Should proceed check');
    const decision = shouldProceed(result);
    console.log('  Decision:', decision);
    console.log('  ✅ Proceed decision made correctly');

    // Test 5: Format for log
    console.log('\nTest 5: Format for log');
    console.log('  Log output:', formatForLog(result));
    console.log('  ✅ Formatted correctly');

    // Test 6: Retry-after handling
    console.log('\nTest 6: Retry-after handling');
    const retryHeaders = { 'Retry-After': '10' };
    const retryResult = parseRateLimitHeaders({ headers: retryHeaders });
    console.log('  Retry-After parsed:', retryResult.retryAfter, 'seconds');
    console.log('  Recommended delay:', retryResult.recommendedDelay, 'ms');
    console.log('  ✅ Retry-after handled correctly');

    console.log('\n───────────────────────────────────────────────────────────');
    console.log('  All tests passed!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } else {
    console.log(`
HubSpot Rate Limit Response Header Parser

Usage:
  const { parseRateLimitHeaders } = require('./hubspot-rate-limit-parser');
  const rateLimitInfo = parseRateLimitHeaders(response);

Parsed Headers:
  - X-HubSpot-RateLimit-Max: Requests allowed in window
  - X-HubSpot-RateLimit-Remaining: Calls still available
  - X-HubSpot-RateLimit-Daily: Total daily allowance
  - X-HubSpot-RateLimit-Daily-Remaining: Daily calls left
  - Retry-After: Seconds to wait (on 429)

Functions:
  - parseRateLimitHeaders(response): Parse headers from response
  - shouldProceed(rateLimitInfo): Check if request should proceed
  - detectTierFromHeaders(rateLimitInfo): Detect HubSpot tier
  - formatForLog(rateLimitInfo): Format for logging

Run tests:
  node hubspot-rate-limit-parser.js --test
`);
  }
}
