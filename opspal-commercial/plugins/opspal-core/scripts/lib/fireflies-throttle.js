#!/usr/bin/env node

/**
 * Fireflies.ai API Rate Limiter (Singleton)
 *
 * Plan-aware throttling:
 *   - Free / Pro  : 50 requests per DAY  (simple daily counter, no per-second bucket)
 *   - Business    : 60 requests per MINUTE (token bucket, 1 token/second refill)
 *   - Enterprise  : 60 requests per MINUTE (same as Business)
 *
 * Daily budget persists to ~/.claude/api-limits/fireflies-daily.json.
 * Hard-blocks at 95% daily usage; warns at 80%.
 * Respects `retryAfter` seconds from `too_many_requests` errors.
 *
 * Usage:
 *   const { getThrottle } = require('./fireflies-throttle');
 *   const throttle = getThrottle();
 *   const result = await throttle.enqueue(() => callFireflies());
 *
 * @module fireflies-throttle
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ── Plan definitions ────────────────────────────────────────────────────────

const PLANS = {
  free: {
    dailyLimit: 50,
    minuteLimit: null,   // no per-minute bucket; enforced by daily counter
    bucketCapacity: null,
    refillRate: null      // tokens/second
  },
  pro: {
    dailyLimit: 50,
    minuteLimit: null,
    bucketCapacity: null,
    refillRate: null
  },
  business: {
    dailyLimit: null,     // no published daily cap; tracked for visibility only
    minuteLimit: 60,
    bucketCapacity: 60,
    refillRate: 1         // 1 token/second → 60/min
  },
  enterprise: {
    dailyLimit: null,
    minuteLimit: 60,
    bucketCapacity: 60,
    refillRate: 1
  }
};

const WARN_THRESHOLD = 0.80;  // 80% daily usage triggers warning
const BLOCK_THRESHOLD = 0.95; // 95% daily usage hard-blocks

const DAILY_FILE_DIR = path.join(process.env.HOME || '/tmp', '.claude', 'api-limits');
const DAILY_FILE = path.join(DAILY_FILE_DIR, 'fireflies-daily.json');

let _instance = null;

// ── Class ────────────────────────────────────────────────────────────────────

class FirefliesThrottle {
  constructor(options = {}) {
    const planName = (options.plan || process.env.FIREFLIES_PLAN || 'free').toLowerCase();
    this.planName = PLANS[planName] ? planName : 'free';
    this.plan = PLANS[this.planName];

    // Token bucket (Business/Enterprise only)
    if (this.plan.bucketCapacity) {
      this.capacity = options.capacity || this.plan.bucketCapacity;
      this.refillRate = options.refillRate || this.plan.refillRate;
      this.tokens = this.capacity;
      this.lastRefill = Date.now();
    }

    // Daily counter (all plans — even Business tracks for visibility)
    this.dailyLimit = options.dailyLimit || this.plan.dailyLimit;
    this.dailyUsed = 0;
    this._loadDailyCounter();

    // Queue
    this.queue = [];
    this.processing = false;
    this.retryAfterUntil = 0;
  }

  // ── Daily counter persistence ─────────────────────────────────────────────

  _loadDailyCounter() {
    try {
      if (fs.existsSync(DAILY_FILE)) {
        const data = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8'));
        const today = new Date().toISOString().slice(0, 10);
        if (data.date === today) {
          this.dailyUsed = data.used || 0;
          return;
        }
      }
    } catch { /* fresh start */ }
    this.dailyUsed = 0;
  }

  _saveDailyCounter() {
    try {
      if (!fs.existsSync(DAILY_FILE_DIR)) {
        fs.mkdirSync(DAILY_FILE_DIR, { recursive: true });
      }
      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(DAILY_FILE, JSON.stringify({
        date: today,
        used: this.dailyUsed,
        limit: this.dailyLimit,
        plan: this.planName,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch { /* non-critical */ }
  }

  // ── Token bucket helpers (Business/Enterprise) ────────────────────────────

  _refillTokens() {
    if (!this.plan.bucketCapacity) return;
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  _waitForToken() {
    if (!this.plan.bucketCapacity) {
      // Free/Pro: no per-second token bucket; check daily limit only
      return Promise.resolve();
    }

    this._refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }

    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    return new Promise(resolve => setTimeout(() => {
      this._refillTokens();
      this.tokens = Math.max(0, this.tokens - 1);
      resolve();
    }, waitMs));
  }

  // ── Daily limit enforcement ───────────────────────────────────────────────

  _checkDailyLimit() {
    if (!this.dailyLimit) return null; // Business/Enterprise — no hard daily cap

    const ratio = this.dailyUsed / this.dailyLimit;

    if (ratio >= BLOCK_THRESHOLD) {
      throw new Error(
        `Fireflies daily API budget exhausted (${this.dailyUsed}/${this.dailyLimit} on ${this.planName} plan). ` +
        `Resets at midnight UTC. Upgrade to Business for higher limits.`
      );
    }

    if (ratio >= WARN_THRESHOLD) {
      // Non-fatal: log warning and continue
      process.stderr.write(
        `[fireflies-throttle] WARNING: Daily usage at ${Math.round(ratio * 100)}% ` +
        `(${this.dailyUsed}/${this.dailyLimit}). Consider upgrading to Business plan.\n`
      );
    }

    return null;
  }

  // ── Queue processor ───────────────────────────────────────────────────────

  async _processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue[0];

      // Respect Retry-After
      const now = Date.now();
      if (this.retryAfterUntil > now) {
        const delay = this.retryAfterUntil - now;
        await new Promise(r => setTimeout(r, delay));
      }

      // Check daily budget (throws on hard block)
      try {
        this._checkDailyLimit();
      } catch (err) {
        this.queue.shift();
        reject(err);
        continue;
      }

      // Acquire token (no-op for Free/Pro)
      await this._waitForToken();

      try {
        const result = await fn();
        this.dailyUsed++;
        this._saveDailyCounter();
        this.queue.shift();
        resolve(result);
      } catch (err) {
        this.queue.shift();
        reject(err);
      }
    }

    this.processing = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Enqueue a function to be rate-limited.
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of fn()
   */
  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Set Retry-After delay (from too_many_requests error).
   * @param {number} seconds - Seconds to wait before next request
   */
  setRetryAfter(seconds) {
    this.retryAfterUntil = Date.now() + (seconds * 1000);
  }

  /**
   * Get current throttle status.
   * @returns {Object} Status object
   */
  getStatus() {
    this._refillTokens();
    const status = {
      plan: this.planName,
      dailyUsed: this.dailyUsed,
      dailyLimit: this.dailyLimit,
      dailyRemaining: this.dailyLimit !== null ? Math.max(0, this.dailyLimit - this.dailyUsed) : null,
      dailyPercent: this.dailyLimit !== null ? Math.round((this.dailyUsed / this.dailyLimit) * 100) : null,
      queueLength: this.queue.length,
      retryAfterUntil: this.retryAfterUntil > Date.now() ? new Date(this.retryAfterUntil).toISOString() : null
    };

    if (this.plan.bucketCapacity) {
      status.minuteBucket = Math.floor(this.tokens);
      status.minuteCapacity = this.capacity;
    }

    return status;
  }

  /**
   * Reset daily counter (for testing).
   */
  resetDaily() {
    this.dailyUsed = 0;
    this._saveDailyCounter();
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────

/**
 * Get singleton throttle instance.
 * @param {Object} [options] - Override options (only applied on first call)
 * @returns {FirefliesThrottle}
 */
function getThrottle(options) {
  if (!_instance) {
    _instance = new FirefliesThrottle(options);
  }
  return _instance;
}

// ── CLI usage ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const arg = process.argv[2];
  const throttle = getThrottle();

  if (arg === '--status' || arg === 'status') {
    console.log(JSON.stringify(throttle.getStatus(), null, 2));
  } else if (arg === '--reset') {
    throttle.resetDaily();
    console.log('Daily counter reset.');
  } else {
    console.log('Usage: fireflies-throttle.js [--status|--reset]');
    console.log('\nCurrent status:');
    console.log(JSON.stringify(throttle.getStatus(), null, 2));
  }
}

module.exports = { FirefliesThrottle, getThrottle };
