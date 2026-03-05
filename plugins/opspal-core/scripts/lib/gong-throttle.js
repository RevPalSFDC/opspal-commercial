#!/usr/bin/env node

/**
 * Gong API Rate Limiter (Singleton)
 *
 * Token bucket at 3 requests/second with daily budget tracking (10,000/day).
 * Persists daily counter to ~/.claude/api-limits/gong-daily.json.
 *
 * Usage:
 *   const { getThrottle } = require('./gong-throttle');
 *   const throttle = getThrottle();
 *   const result = await throttle.enqueue(() => fetch(url));
 *
 * @module gong-throttle
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const DAILY_LIMIT = 10000;
const BUCKET_CAPACITY = 3;
const REFILL_RATE = 3; // tokens per second
const DAILY_FILE_DIR = path.join(process.env.HOME || '/tmp', '.claude', 'api-limits');
const DAILY_FILE = path.join(DAILY_FILE_DIR, 'gong-daily.json');

let _instance = null;

class GongThrottle {
  constructor(options = {}) {
    this.capacity = options.capacity || BUCKET_CAPACITY;
    this.refillRate = options.refillRate || REFILL_RATE;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.dailyLimit = options.dailyLimit || DAILY_LIMIT;
    this.queue = [];
    this.processing = false;
    this.retryAfterUntil = 0;

    this._loadDailyCounter();
  }

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
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch { /* non-critical */ }
  }

  _refillTokens() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  _waitForToken() {
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

  async _processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue[0];

      // Check Retry-After
      const now = Date.now();
      if (this.retryAfterUntil > now) {
        const delay = this.retryAfterUntil - now;
        await new Promise(r => setTimeout(r, delay));
      }

      // Check daily budget
      if (this.dailyUsed >= this.dailyLimit) {
        this.queue.shift();
        reject(new Error(`Gong daily API budget exhausted (${this.dailyUsed}/${this.dailyLimit}). Resets at midnight UTC.`));
        continue;
      }

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
   * Set Retry-After delay (from 429 response).
   * @param {number} seconds - Seconds to wait
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
    return {
      dailyUsed: this.dailyUsed,
      dailyLimit: this.dailyLimit,
      dailyRemaining: Math.max(0, this.dailyLimit - this.dailyUsed),
      dailyPercent: Math.round((this.dailyUsed / this.dailyLimit) * 100),
      secondBucket: Math.floor(this.tokens),
      queueLength: this.queue.length,
      retryAfterUntil: this.retryAfterUntil > Date.now() ? new Date(this.retryAfterUntil).toISOString() : null
    };
  }

  /**
   * Reset daily counter (for testing).
   */
  resetDaily() {
    this.dailyUsed = 0;
    this._saveDailyCounter();
  }
}

/**
 * Get singleton throttle instance.
 * @param {Object} [options] - Override options
 * @returns {GongThrottle}
 */
function getThrottle(options) {
  if (!_instance) {
    _instance = new GongThrottle(options);
  }
  return _instance;
}

// CLI usage
if (require.main === module) {
  const arg = process.argv[2];
  const throttle = getThrottle();

  if (arg === '--status' || arg === 'status') {
    console.log(JSON.stringify(throttle.getStatus(), null, 2));
  } else if (arg === '--reset') {
    throttle.resetDaily();
    console.log('Daily counter reset.');
  } else {
    console.log('Usage: gong-throttle.js [--status|--reset]');
    console.log('\nCurrent status:');
    console.log(JSON.stringify(throttle.getStatus(), null, 2));
  }
}

module.exports = { GongThrottle, getThrottle };
