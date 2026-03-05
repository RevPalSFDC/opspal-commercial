#!/usr/bin/env node
/**
 * HubSpot Callback State Manager
 *
 * Purpose: Manage async workflow callback state for Automation Actions V4 API
 * Handles BLOCK execution state with proper expiration tracking and completion.
 *
 * KEY FEATURES:
 * - State persistence for multi-step callbacks
 * - Expiration tracking with ISO 8601 duration support
 * - Callback completion endpoint wrapper
 * - Error handling and retry logic
 * - State recovery after process restart
 *
 * USE CASES:
 * - Long-running external operations (>30 seconds)
 * - Multi-step approval workflows
 * - Async data enrichment
 * - Human-in-the-loop processes
 * - External system polling
 *
 * @version 1.0.0
 * @phase Automation Actions V4 - Callback Management
 */

const fs = require('fs');
const path = require('path');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * Callback states
 */
const CALLBACK_STATES = {
  PENDING: 'PENDING',       // Waiting for completion
  PROCESSING: 'PROCESSING', // Being processed
  COMPLETED: 'COMPLETED',   // Successfully completed
  FAILED: 'FAILED',         // Failed to complete
  EXPIRED: 'EXPIRED',       // Past expiration time
  CANCELLED: 'CANCELLED'    // Manually cancelled
};

/**
 * ISO 8601 duration patterns
 */
const DURATION_PATTERNS = {
  'PT1M': 60 * 1000,           // 1 minute
  'PT5M': 5 * 60 * 1000,       // 5 minutes
  'PT15M': 15 * 60 * 1000,     // 15 minutes
  'PT30M': 30 * 60 * 1000,     // 30 minutes
  'PT1H': 60 * 60 * 1000,      // 1 hour
  'PT2H': 2 * 60 * 60 * 1000,  // 2 hours
  'PT6H': 6 * 60 * 60 * 1000,  // 6 hours
  'PT12H': 12 * 60 * 60 * 1000, // 12 hours
  'P1D': 24 * 60 * 60 * 1000,  // 1 day
  'P7D': 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Default callback expiration (24 hours)
 */
const DEFAULT_EXPIRATION = 'P1D';

/**
 * Callback State Manager
 *
 * Usage:
 * const manager = new CallbackStateManager({
 *   accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *   statePath: './.callback-state'
 * });
 *
 * // Register callback for later completion
 * await manager.registerCallback({
 *   callbackId: 'callback-123',
 *   actionId: 'action-456',
 *   expirationDuration: 'P1D',
 *   metadata: { contactId: '789' }
 * });
 *
 * // Complete callback when ready
 * await manager.completeCallback('callback-123', {
 *   status: 'success',
 *   result_data: 'enriched'
 * });
 */
class CallbackStateManager {
  constructor(options = {}) {
    if (!options.accessToken) {
      throw new Error('CallbackStateManager requires accessToken');
    }

    this.accessToken = options.accessToken;
    this.statePath = options.statePath || path.join(process.cwd(), '.callback-state');
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;

    // Initialize state storage
    this.ensureStateDirectory();
    this.state = this.loadState();

    // Start expiration checker if enabled
    if (options.checkExpirations !== false) {
      this.startExpirationChecker(options.checkInterval || 60000);
    }
  }

  /**
   * Register a callback for later completion
   * @param {Object} config - Callback configuration
   * @param {string} config.callbackId - HubSpot callback ID
   * @param {string} config.actionId - Action definition ID
   * @param {string} config.expirationDuration - ISO 8601 duration (e.g., 'P1D')
   * @param {Object} config.metadata - Custom metadata to store
   * @returns {Object} Registered callback info
   */
  registerCallback(config) {
    const {
      callbackId,
      actionId,
      expirationDuration = DEFAULT_EXPIRATION,
      metadata = {}
    } = config;

    if (!callbackId) {
      throw new Error('callbackId is required');
    }

    const expiresAt = this.calculateExpiration(expirationDuration);

    const callback = {
      callbackId,
      actionId,
      status: CALLBACK_STATES.PENDING,
      registeredAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      expirationDuration,
      metadata,
      attempts: 0,
      lastAttemptAt: null,
      completedAt: null,
      error: null
    };

    this.state.callbacks[callbackId] = callback;
    this.saveState();

    if (this.verbose) {
      console.log(`Registered callback: ${callbackId}`);
      console.log(`  Expires: ${callback.expiresAt}`);
    }

    return callback;
  }

  /**
   * Complete a callback with output fields
   * @param {string} callbackId - Callback ID to complete
   * @param {Object} outputFields - Output field values
   * @returns {Promise<Object>} Completion result
   */
  async completeCallback(callbackId, outputFields = {}) {
    const callback = this.state.callbacks[callbackId];

    if (!callback) {
      throw new Error(`Callback not found: ${callbackId}`);
    }

    if (callback.status === CALLBACK_STATES.COMPLETED) {
      throw new Error(`Callback already completed: ${callbackId}`);
    }

    if (callback.status === CALLBACK_STATES.EXPIRED) {
      throw new Error(`Callback expired: ${callbackId}`);
    }

    // Check if expired
    if (new Date() > new Date(callback.expiresAt)) {
      callback.status = CALLBACK_STATES.EXPIRED;
      this.saveState();
      throw new Error(`Callback expired: ${callbackId}`);
    }

    // Update status
    callback.status = CALLBACK_STATES.PROCESSING;
    callback.attempts++;
    callback.lastAttemptAt = new Date().toISOString();
    this.saveState();

    try {
      // Call HubSpot API to complete callback
      const result = await this.callCompleteEndpoint(callbackId, outputFields);

      // Update state
      callback.status = CALLBACK_STATES.COMPLETED;
      callback.completedAt = new Date().toISOString();
      callback.outputFields = outputFields;
      this.saveState();

      if (this.verbose) {
        console.log(`✓ Callback completed: ${callbackId}`);
      }

      return result;
    } catch (error) {
      callback.status = CALLBACK_STATES.FAILED;
      callback.error = error.message;
      this.saveState();

      throw error;
    }
  }

  /**
   * Complete callback with retry logic
   * @param {string} callbackId - Callback ID
   * @param {Object} outputFields - Output fields
   * @returns {Promise<Object>} Completion result
   */
  async completeCallbackWithRetry(callbackId, outputFields = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.completeCallback(callbackId, outputFields);
      } catch (error) {
        lastError = error;

        // Don't retry certain errors
        if (error.message.includes('expired') ||
            error.message.includes('already completed') ||
            error.message.includes('not found')) {
          throw error;
        }

        if (this.verbose) {
          console.log(`Attempt ${attempt} failed: ${error.message}`);
        }

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Get callback status
   * @param {string} callbackId - Callback ID
   * @returns {Object|null} Callback info or null
   */
  getCallback(callbackId) {
    const callback = this.state.callbacks[callbackId];

    if (callback) {
      // Check if expired
      if (callback.status === CALLBACK_STATES.PENDING &&
          new Date() > new Date(callback.expiresAt)) {
        callback.status = CALLBACK_STATES.EXPIRED;
        this.saveState();
      }
    }

    return callback || null;
  }

  /**
   * Get all pending callbacks
   * @returns {Array} Pending callbacks
   */
  getPendingCallbacks() {
    return Object.values(this.state.callbacks)
      .filter(cb => cb.status === CALLBACK_STATES.PENDING)
      .map(cb => {
        // Check expiration
        if (new Date() > new Date(cb.expiresAt)) {
          cb.status = CALLBACK_STATES.EXPIRED;
          return cb;
        }
        return cb;
      })
      .filter(cb => cb.status === CALLBACK_STATES.PENDING);
  }

  /**
   * Get expired callbacks
   * @returns {Array} Expired callbacks
   */
  getExpiredCallbacks() {
    return Object.values(this.state.callbacks)
      .filter(cb => {
        if (cb.status === CALLBACK_STATES.EXPIRED) return true;
        if (cb.status === CALLBACK_STATES.PENDING &&
            new Date() > new Date(cb.expiresAt)) {
          cb.status = CALLBACK_STATES.EXPIRED;
          this.saveState();
          return true;
        }
        return false;
      });
  }

  /**
   * Cancel a pending callback
   * @param {string} callbackId - Callback ID
   * @param {string} reason - Cancellation reason
   * @returns {Object} Updated callback
   */
  cancelCallback(callbackId, reason = 'Cancelled by user') {
    const callback = this.state.callbacks[callbackId];

    if (!callback) {
      throw new Error(`Callback not found: ${callbackId}`);
    }

    if (callback.status !== CALLBACK_STATES.PENDING) {
      throw new Error(`Cannot cancel callback in ${callback.status} state`);
    }

    callback.status = CALLBACK_STATES.CANCELLED;
    callback.error = reason;
    callback.completedAt = new Date().toISOString();
    this.saveState();

    return callback;
  }

  /**
   * Clean up old callbacks
   * @param {number} maxAge - Max age in milliseconds (default: 7 days)
   * @returns {number} Number of callbacks removed
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = new Date(Date.now() - maxAge);
    let removed = 0;

    Object.keys(this.state.callbacks).forEach(callbackId => {
      const callback = this.state.callbacks[callbackId];
      const completedAt = callback.completedAt || callback.expiresAt;

      if (new Date(completedAt) < cutoff) {
        delete this.state.callbacks[callbackId];
        removed++;
      }
    });

    this.saveState();
    return removed;
  }

  /**
   * Get statistics
   * @returns {Object} Callback statistics
   */
  getStats() {
    const callbacks = Object.values(this.state.callbacks);

    return {
      total: callbacks.length,
      pending: callbacks.filter(cb => cb.status === CALLBACK_STATES.PENDING).length,
      completed: callbacks.filter(cb => cb.status === CALLBACK_STATES.COMPLETED).length,
      failed: callbacks.filter(cb => cb.status === CALLBACK_STATES.FAILED).length,
      expired: callbacks.filter(cb => cb.status === CALLBACK_STATES.EXPIRED).length,
      cancelled: callbacks.filter(cb => cb.status === CALLBACK_STATES.CANCELLED).length
    };
  }

  // ==================== Private Methods ====================

  /**
   * Call HubSpot callback complete endpoint
   */
  async callCompleteEndpoint(callbackId, outputFields) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/actions/callbacks/${callbackId}/complete`;

    const payload = {
      outputFields
    };

    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return { success: true, callbackId };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Callback completion timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Calculate expiration time from ISO 8601 duration
   */
  calculateExpiration(duration) {
    const ms = DURATION_PATTERNS[duration];

    if (ms) {
      return new Date(Date.now() + ms);
    }

    // Parse custom duration (basic support)
    const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);

    if (match) {
      const days = parseInt(match[1] || 0);
      const hours = parseInt(match[2] || 0);
      const minutes = parseInt(match[3] || 0);
      const seconds = parseInt(match[4] || 0);

      const totalMs = (days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds) * 1000;
      return new Date(Date.now() + totalMs);
    }

    // Default to 24 hours
    return new Date(Date.now() + DURATION_PATTERNS['P1D']);
  }

  /**
   * Ensure state directory exists
   */
  ensureStateDirectory() {
    if (!fs.existsSync(this.statePath)) {
      fs.mkdirSync(this.statePath, { recursive: true });
    }
  }

  /**
   * Load state from disk
   */
  loadState() {
    const stateFile = path.join(this.statePath, 'callbacks.json');

    try {
      if (fs.existsSync(stateFile)) {
        return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      }
    } catch (error) {
      if (this.verbose) {
        console.error('Failed to load state:', error.message);
      }
    }

    return { callbacks: {}, version: 1 };
  }

  /**
   * Save state to disk
   */
  saveState() {
    const stateFile = path.join(this.statePath, 'callbacks.json');

    try {
      fs.writeFileSync(stateFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      if (this.verbose) {
        console.error('Failed to save state:', error.message);
      }
    }
  }

  /**
   * Start periodic expiration checker
   */
  startExpirationChecker(interval) {
    this.expirationChecker = setInterval(() => {
      this.checkExpirations();
    }, interval);
  }

  /**
   * Check for expired callbacks
   */
  checkExpirations() {
    const now = new Date();

    Object.values(this.state.callbacks).forEach(callback => {
      if (callback.status === CALLBACK_STATES.PENDING &&
          now > new Date(callback.expiresAt)) {
        callback.status = CALLBACK_STATES.EXPIRED;
      }
    });

    this.saveState();
  }

  /**
   * Stop expiration checker
   */
  stopExpirationChecker() {
    if (this.expirationChecker) {
      clearInterval(this.expirationChecker);
      this.expirationChecker = null;
    }
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export manager and constants
module.exports = CallbackStateManager;
module.exports.CALLBACK_STATES = CALLBACK_STATES;
module.exports.DURATION_PATTERNS = DURATION_PATTERNS;

// CLI usage
if (require.main === module) {
  console.log('CallbackStateManager - HubSpot Async Callback Management');
  console.log('');
  console.log('Manages BLOCK execution state for Automation Actions V4 API');
  console.log('');
  console.log('USAGE:');
  console.log('  const manager = new CallbackStateManager({');
  console.log('    accessToken: process.env.HUBSPOT_ACCESS_TOKEN,');
  console.log('    statePath: "./.callback-state"');
  console.log('  });');
  console.log('');
  console.log('  // Register callback');
  console.log('  manager.registerCallback({');
  console.log('    callbackId: "callback-123",');
  console.log('    expirationDuration: "P1D"');
  console.log('  });');
  console.log('');
  console.log('  // Complete callback');
  console.log('  await manager.completeCallback("callback-123", {');
  console.log('    status: "success"');
  console.log('  });');
  console.log('');
  console.log('DURATION PATTERNS:');
  Object.keys(DURATION_PATTERNS).forEach(pattern => {
    const hours = DURATION_PATTERNS[pattern] / (60 * 60 * 1000);
    console.log(`  ${pattern}: ${hours < 24 ? hours + ' hours' : hours / 24 + ' days'}`);
  });
  console.log('');
  console.log('CALLBACK STATES:');
  Object.keys(CALLBACK_STATES).forEach(state => {
    console.log(`  ${state}`);
  });
}
