#!/usr/bin/env node

/**
 * Runtime Monitors for Silent Failure Detection
 *
 * Purpose: Track silent failure indicators DURING a session
 *
 * Monitors:
 * - ValidationSkipTracker: Counts validation skips and alerts at threshold
 * - CacheHitMissMonitor: Tracks stale cache hits and fallbacks
 * - HookFailureCounter: Counts silent vs explicit hook failures
 *
 * Usage:
 *   const { RuntimeMonitorManager } = require('./runtime-monitors');
 *
 *   const manager = new RuntimeMonitorManager();
 *   manager.start();
 *
 *   // Record events
 *   manager.recordValidationSkip('PreToolUse', 'env_bypass');
 *   manager.recordCacheFallback('api-cache', new Error('API timeout'));
 *   manager.recordHookFailure('pre-commit', new Error('Failed'), true);
 *
 *   // Get session summary
 *   const summary = manager.getSummary();
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// =============================================================================
// Constants
// =============================================================================

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

// Load config if available
let CONFIG;
try {
  const configPath = path.join(__dirname, '..', '..', '..', 'config', 'silent-failure-detection.json');
  if (fs.existsSync(configPath)) {
    CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch {
  // Use defaults
}

const DEFAULT_THRESHOLDS = {
  validationSkips: 5,
  cacheStaleHits: 10,
  hookFailures: 3,
  cacheFallbacks: 3
};

// =============================================================================
// Validation Skip Tracker
// =============================================================================

/**
 * Tracks validation skips during a session
 */
class ValidationSkipTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.threshold = options.threshold ||
      CONFIG?.runtime?.thresholds?.validationSkips ||
      DEFAULT_THRESHOLDS.validationSkips;
    this.skips = [];
    this.sessionSkipCount = 0;
    this.byType = new Map();
    this.thresholdExceeded = false;
  }

  /**
   * Record a validation skip
   * @param {Object} context - Skip context
   * @param {string} context.toolName - Tool that was validated
   * @param {string} context.reason - Why validation was skipped
   * @param {string} context.skipType - Type of skip (env, circuit, timeout)
   */
  recordSkip(context) {
    this.sessionSkipCount++;

    const skip = {
      timestamp: new Date().toISOString(),
      tool: context.toolName || 'unknown',
      reason: context.reason || 'unspecified',
      skipType: context.skipType || 'unknown'
    };

    this.skips.push(skip);

    // Track by type
    const typeCount = this.byType.get(skip.skipType) || 0;
    this.byType.set(skip.skipType, typeCount + 1);

    // Emit event for each skip
    this.emit('skip', skip);

    // Alert if threshold exceeded
    if (this.sessionSkipCount >= this.threshold && !this.thresholdExceeded) {
      this.thresholdExceeded = true;
      this.emit('threshold_exceeded', {
        count: this.sessionSkipCount,
        threshold: this.threshold,
        recentSkips: this.skips.slice(-5)
      });
    }

    return skip;
  }

  /**
   * Get session statistics
   */
  getStats() {
    return {
      totalSkips: this.sessionSkipCount,
      threshold: this.threshold,
      thresholdExceeded: this.thresholdExceeded,
      byType: Object.fromEntries(this.byType),
      recentSkips: this.skips.slice(-10)
    };
  }

  /**
   * Reset tracker for new session
   */
  reset() {
    this.skips = [];
    this.sessionSkipCount = 0;
    this.byType.clear();
    this.thresholdExceeded = false;
  }
}

// =============================================================================
// Cache Hit/Miss Monitor
// =============================================================================

/**
 * Monitors cache operations for stale data and fallbacks
 */
class CacheHitMissMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.staleThreshold = options.staleThreshold ||
      CONFIG?.runtime?.thresholds?.cacheStaleHits ||
      DEFAULT_THRESHOLDS.cacheStaleHits;
    this.fallbackThreshold = options.fallbackThreshold ||
      CONFIG?.runtime?.thresholds?.cacheFallbacks ||
      DEFAULT_THRESHOLDS.cacheFallbacks;

    this.hits = 0;
    this.misses = 0;
    this.staleHits = 0;
    this.fallbacks = 0;
    this.events = [];
  }

  /**
   * Record a cache hit
   * @param {string} cacheType - Type of cache (api-cache, field-dictionary, etc.)
   * @param {boolean} isStale - Whether the cached data is stale
   */
  recordHit(cacheType, isStale = false) {
    this.hits++;

    if (isStale) {
      this.staleHits++;
      const event = {
        type: 'stale_hit',
        cacheType,
        timestamp: Date.now()
      };
      this.events.push(event);
      this.emit('stale_hit', event);

      if (this.staleHits >= this.staleThreshold) {
        this.emit('stale_threshold_exceeded', {
          count: this.staleHits,
          threshold: this.staleThreshold
        });
      }
    }
  }

  /**
   * Record a cache miss
   * @param {string} cacheType - Type of cache
   */
  recordMiss(cacheType) {
    this.misses++;
    this.events.push({
      type: 'miss',
      cacheType,
      timestamp: Date.now()
    });
  }

  /**
   * Record a fallback to cache after API failure
   * @param {string} cacheType - Type of cache
   * @param {Error} error - The error that caused the fallback
   */
  recordFallback(cacheType, error) {
    this.fallbacks++;

    const event = {
      type: 'fallback',
      cacheType,
      error: error?.message || String(error),
      timestamp: Date.now()
    };

    this.events.push(event);
    this.emit('cache_fallback', event);

    if (this.fallbacks >= this.fallbackThreshold) {
      this.emit('fallback_threshold_exceeded', {
        count: this.fallbacks,
        threshold: this.fallbackThreshold
      });
    }
  }

  /**
   * Calculate a health score based on cache performance
   * @returns {number} Score from 0-100
   */
  getHealthScore() {
    const total = this.hits + this.misses;
    if (total === 0) return 100;

    // Penalize stale hits and fallbacks
    const staleRatio = this.staleHits / Math.max(this.hits, 1);
    const fallbackRatio = this.fallbacks / Math.max(this.misses, 1);

    let score = 100;
    score -= staleRatio * 30;  // Up to -30 for stale hits
    score -= fallbackRatio * 40;  // Up to -40 for fallbacks

    return Math.max(0, Math.round(score));
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      staleHits: this.staleHits,
      fallbacks: this.fallbacks,
      hitRate: this.hits / Math.max(this.hits + this.misses, 1),
      healthScore: this.getHealthScore(),
      recentEvents: this.events.slice(-20)
    };
  }

  /**
   * Reset monitor for new session
   */
  reset() {
    this.hits = 0;
    this.misses = 0;
    this.staleHits = 0;
    this.fallbacks = 0;
    this.events = [];
  }
}

// =============================================================================
// Hook Failure Counter
// =============================================================================

/**
 * Counts and categorizes hook failures
 */
class HookFailureCounter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.threshold = options.threshold ||
      CONFIG?.runtime?.thresholds?.hookFailures ||
      DEFAULT_THRESHOLDS.hookFailures;

    this.failures = new Map();  // hookName -> { count, errors, silent }
    this.silentFailures = new Map();
    this.totalFailures = 0;
    this.totalSilentFailures = 0;
  }

  /**
   * Record a hook failure
   * @param {string} hookName - Name of the hook that failed
   * @param {Error} error - The error that occurred
   * @param {boolean} isSilent - Whether the failure was silent (exit 0 but bad output)
   */
  recordFailure(hookName, error, isSilent = false) {
    const target = isSilent ? this.silentFailures : this.failures;

    const existing = target.get(hookName) || { count: 0, errors: [] };
    existing.count++;
    existing.errors.push({
      timestamp: Date.now(),
      message: error?.message || String(error),
      stack: error?.stack?.split('\n').slice(0, 3).join('\n')
    });

    // Keep only last 10 errors per hook
    if (existing.errors.length > 10) {
      existing.errors = existing.errors.slice(-10);
    }

    target.set(hookName, existing);

    if (isSilent) {
      this.totalSilentFailures++;
    } else {
      this.totalFailures++;
    }

    // Emit event
    const event = {
      hook: hookName,
      count: existing.count,
      isSilent,
      error: error?.message || String(error),
      timestamp: Date.now()
    };
    this.emit('failure', event);

    // Emit pattern alert if threshold exceeded
    if (existing.count >= this.threshold) {
      this.emit('hook_failure_pattern', {
        hook: hookName,
        count: existing.count,
        isSilent,
        severity: isSilent ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        recentErrors: existing.errors.slice(-3)
      });
    }

    return event;
  }

  /**
   * Get failure summary
   */
  getSummary() {
    return {
      totalFailures: this.totalFailures,
      totalSilentFailures: this.totalSilentFailures,
      threshold: this.threshold,
      byHook: Object.fromEntries(this.failures),
      silentByHook: Object.fromEntries(this.silentFailures),
      problematicHooks: this.getProblematicHooks()
    };
  }

  /**
   * Get hooks that have exceeded the failure threshold
   */
  getProblematicHooks() {
    const problematic = [];

    for (const [hookName, data] of this.failures) {
      if (data.count >= this.threshold) {
        problematic.push({ hookName, count: data.count, isSilent: false });
      }
    }

    for (const [hookName, data] of this.silentFailures) {
      if (data.count >= this.threshold) {
        problematic.push({ hookName, count: data.count, isSilent: true });
      }
    }

    return problematic.sort((a, b) => b.count - a.count);
  }

  /**
   * Reset counter for new session
   */
  reset() {
    this.failures.clear();
    this.silentFailures.clear();
    this.totalFailures = 0;
    this.totalSilentFailures = 0;
  }
}

// =============================================================================
// Runtime Monitor Manager
// =============================================================================

/**
 * Manages all runtime monitors and provides unified interface
 */
class RuntimeMonitorManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.validationSkipTracker = new ValidationSkipTracker(options);
    this.cacheMonitor = new CacheHitMissMonitor(options);
    this.hookFailureCounter = new HookFailureCounter(options);

    this.sessionId = options.sessionId || this.generateSessionId();
    this.startTime = null;
    this.isRunning = false;

    // Forward events from child monitors
    this.setupEventForwarding();
  }

  setupEventForwarding() {
    // Forward validation skip events
    this.validationSkipTracker.on('threshold_exceeded', (data) => {
      this.emit('alert', {
        type: 'validation_skip_threshold',
        severity: SEVERITY.HIGH,
        ...data
      });
    });

    // Forward cache events
    this.cacheMonitor.on('fallback_threshold_exceeded', (data) => {
      this.emit('alert', {
        type: 'cache_fallback_threshold',
        severity: SEVERITY.HIGH,
        ...data
      });
    });

    this.cacheMonitor.on('stale_threshold_exceeded', (data) => {
      this.emit('alert', {
        type: 'cache_stale_threshold',
        severity: SEVERITY.MEDIUM,
        ...data
      });
    });

    // Forward hook failure events
    this.hookFailureCounter.on('hook_failure_pattern', (data) => {
      this.emit('alert', {
        type: 'hook_failure_pattern',
        ...data
      });
    });
  }

  /**
   * Start monitoring
   */
  start() {
    this.startTime = Date.now();
    this.isRunning = true;
    this.emit('started', { sessionId: this.sessionId, startTime: this.startTime });
  }

  /**
   * Stop monitoring and return summary
   */
  stop() {
    this.isRunning = false;
    const summary = this.getSummary();
    this.emit('stopped', summary);
    return summary;
  }

  /**
   * Record a validation skip
   */
  recordValidationSkip(toolName, reason, skipType = 'unknown') {
    if (!this.isRunning) this.start();
    return this.validationSkipTracker.recordSkip({ toolName, reason, skipType });
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(cacheType, isStale = false) {
    if (!this.isRunning) this.start();
    return this.cacheMonitor.recordHit(cacheType, isStale);
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(cacheType) {
    if (!this.isRunning) this.start();
    return this.cacheMonitor.recordMiss(cacheType);
  }

  /**
   * Record a cache fallback
   */
  recordCacheFallback(cacheType, error) {
    if (!this.isRunning) this.start();
    return this.cacheMonitor.recordFallback(cacheType, error);
  }

  /**
   * Record a hook failure
   */
  recordHookFailure(hookName, error, isSilent = false) {
    if (!this.isRunning) this.start();
    return this.hookFailureCounter.recordFailure(hookName, error, isSilent);
  }

  /**
   * Get comprehensive session summary
   */
  getSummary() {
    const duration = this.startTime ? Date.now() - this.startTime : 0;

    return {
      sessionId: this.sessionId,
      duration,
      durationFormatted: this.formatDuration(duration),
      startTime: this.startTime ? new Date(this.startTime).toISOString() : null,
      endTime: new Date().toISOString(),
      metrics: {
        validationSkips: this.validationSkipTracker.getStats(),
        cache: this.cacheMonitor.getStats(),
        hookFailures: this.hookFailureCounter.getSummary()
      },
      healthScore: this.calculateOverallHealthScore(),
      alerts: this.getActiveAlerts()
    };
  }

  /**
   * Calculate overall health score
   */
  calculateOverallHealthScore() {
    const cacheScore = this.cacheMonitor.getHealthScore();
    const skipStats = this.validationSkipTracker.getStats();
    const hookStats = this.hookFailureCounter.getSummary();

    let score = 100;

    // Penalize validation skips
    if (skipStats.thresholdExceeded) {
      score -= 30;
    } else {
      score -= Math.min(skipStats.totalSkips * 5, 20);
    }

    // Factor in cache health
    score = (score + cacheScore) / 2;

    // Penalize hook failures
    score -= Math.min(hookStats.totalFailures * 3, 15);
    score -= Math.min(hookStats.totalSilentFailures * 5, 25);

    return Math.max(0, Math.round(score));
  }

  /**
   * Get active alerts based on current state
   */
  getActiveAlerts() {
    const alerts = [];
    const skipStats = this.validationSkipTracker.getStats();
    const hookStats = this.hookFailureCounter.getSummary();

    if (skipStats.thresholdExceeded) {
      alerts.push({
        type: 'validation_skips',
        severity: SEVERITY.HIGH,
        message: `${skipStats.totalSkips} validation skips (threshold: ${skipStats.threshold})`
      });
    }

    for (const hook of hookStats.problematicHooks) {
      alerts.push({
        type: 'hook_failures',
        severity: hook.isSilent ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        message: `Hook "${hook.hookName}" failed ${hook.count} times${hook.isSilent ? ' (silent)' : ''}`
      });
    }

    if (this.cacheMonitor.fallbacks >= this.cacheMonitor.fallbackThreshold) {
      alerts.push({
        type: 'cache_fallbacks',
        severity: SEVERITY.HIGH,
        message: `${this.cacheMonitor.fallbacks} cache fallbacks indicate API connectivity issues`
      });
    }

    return alerts;
  }

  /**
   * Reset all monitors
   */
  reset() {
    this.validationSkipTracker.reset();
    this.cacheMonitor.reset();
    this.hookFailureCounter.reset();
    this.sessionId = this.generateSessionId();
    this.startTime = null;
    this.isRunning = false;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// =============================================================================
// Singleton Instance for Session-Wide Monitoring
// =============================================================================

let globalMonitor = null;

function getGlobalMonitor() {
  if (!globalMonitor) {
    globalMonitor = new RuntimeMonitorManager();
  }
  return globalMonitor;
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  const monitor = getGlobalMonitor();

  switch (command) {
    case 'status':
      console.log(JSON.stringify(monitor.getSummary(), null, 2));
      break;

    case 'reset':
      monitor.reset();
      console.log('Monitor reset');
      break;

    case 'simulate':
      // Simulate some events for testing
      monitor.start();
      monitor.recordValidationSkip('Bash', 'SKIP_VALIDATION set', 'env');
      monitor.recordValidationSkip('Write', 'SKIP_VALIDATION set', 'env');
      monitor.recordCacheFallback('api-cache', new Error('API timeout'));
      monitor.recordHookFailure('pre-commit', new Error('Syntax error'), false);
      monitor.recordHookFailure('pre-tool', new Error('Empty output'), true);
      console.log(JSON.stringify(monitor.getSummary(), null, 2));
      break;

    default:
      console.log('Usage: node runtime-monitors.js [status|reset|simulate]');
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  RuntimeMonitorManager,
  ValidationSkipTracker,
  CacheHitMissMonitor,
  HookFailureCounter,
  getGlobalMonitor,
  SEVERITY
};
