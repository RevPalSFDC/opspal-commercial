#!/usr/bin/env node

/**
 * Metrics Collector - Central metrics collection and storage
 *
 * Purpose: Collect, store, and query system metrics for observability
 * Coverage:
 * - Agent execution metrics (success/failure, duration)
 * - Hook performance metrics (circuit breaker state, execution time)
 * - API operation metrics (merge operations, safety decisions)
 * - System health metrics (memory, CPU, errors)
 *
 * Usage:
 *   const MetricsCollector = require('./metrics-collector');
 *   const collector = new MetricsCollector();
 *   collector.recordAgentExecution('sfdc-merge-orchestrator', { duration: 1234, success: true });
 *   const metrics = collector.getMetrics({ timeRange: '1h' });
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class MetricsCollector {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(__dirname, '../../.metrics');
    this.retentionDays = options.retentionDays || 30;
    this.flushInterval = options.flushInterval || 60000; // 1 minute

    // In-memory metrics buffer
    this.metricsBuffer = {
      agents: [],
      hooks: [],
      operations: [],
      system: [],
      errors: []
    };

    // Ensure storage directory exists
    this._ensureStorageDir();

    // Start periodic flush
    if (options.autoFlush !== false) {
      this._startAutoFlush();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // METRIC RECORDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record agent execution metrics
   *
   * @param {string} agentName - Agent name
   * @param {Object} data - Execution data
   * @param {number} data.duration - Execution duration in ms
   * @param {boolean} data.success - Whether execution succeeded
   * @param {string} data.error - Error message if failed
   * @param {Object} data.metadata - Additional metadata
   */
  recordAgentExecution(agentName, data) {
    const metric = {
      timestamp: Date.now(),
      type: 'agent_execution',
      agent: agentName,
      duration: data.duration,
      success: data.success,
      error: data.error || null,
      metadata: data.metadata || {}
    };

    this.metricsBuffer.agents.push(metric);

    // Flush if buffer is large
    if (this.metricsBuffer.agents.length > 1000) {
      this.flush();
    }
  }

  /**
   * Record hook execution metrics
   *
   * @param {string} hookName - Hook name
   * @param {Object} data - Execution data
   */
  recordHookExecution(hookName, data) {
    const metric = {
      timestamp: Date.now(),
      type: 'hook_execution',
      hook: hookName,
      duration: data.duration,
      success: data.success,
      circuitBreakerState: data.circuitBreakerState || 'CLOSED',
      bypassed: data.bypassed || false,
      error: data.error || null
    };

    this.metricsBuffer.hooks.push(metric);
  }

  /**
   * Record data operation metrics
   *
   * @param {string} operation - Operation type (merge, analyze, execute)
   * @param {Object} data - Operation data
   */
  recordOperation(operation, data) {
    const metric = {
      timestamp: Date.now(),
      type: 'operation',
      operation: operation,
      duration: data.duration,
      recordCount: data.recordCount || 0,
      successCount: data.successCount || 0,
      failureCount: data.failureCount || 0,
      safetyLevel: data.safetyLevel || 'unknown',
      executionMode: data.executionMode || 'unknown'
    };

    this.metricsBuffer.operations.push(metric);
  }

  /**
   * Record system health metrics
   */
  recordSystemHealth() {
    const metric = {
      timestamp: Date.now(),
      type: 'system_health',
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal
      },
      cpu: {
        loadAverage: os.loadavg(),
        cores: os.cpus().length
      },
      uptime: process.uptime()
    };

    this.metricsBuffer.system.push(metric);
  }

  /**
   * Record error
   *
   * @param {string} source - Error source (agent, hook, operation)
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Error context
   */
  recordError(source, error, context = {}) {
    const metric = {
      timestamp: Date.now(),
      type: 'error',
      source: source,
      message: error.message || error,
      stack: error.stack || null,
      context: context
    };

    this.metricsBuffer.errors.push(metric);
  }

  // ═══════════════════════════════════════════════════════════════
  // METRIC QUERYING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get metrics with optional filters
   *
   * @param {Object} filters - Query filters
   * @param {string} filters.timeRange - Time range (1h, 24h, 7d, 30d)
   * @param {string} filters.type - Metric type
   * @param {string} filters.agent - Agent name filter
   * @param {number} filters.limit - Result limit
   * @returns {Object} Filtered metrics
   */
  getMetrics(filters = {}) {
    const now = Date.now();
    const timeRange = this._parseTimeRange(filters.timeRange || '24h');
    const startTime = now - timeRange;

    // Load persisted metrics
    const persisted = this._loadMetrics(startTime);

    // Combine with buffer
    const allMetrics = {
      agents: [...persisted.agents, ...this.metricsBuffer.agents],
      hooks: [...persisted.hooks, ...this.metricsBuffer.hooks],
      operations: [...persisted.operations, ...this.metricsBuffer.operations],
      system: [...persisted.system, ...this.metricsBuffer.system],
      errors: [...persisted.errors, ...this.metricsBuffer.errors]
    };

    // Filter by time range
    const filtered = {};
    for (const [key, metrics] of Object.entries(allMetrics)) {
      filtered[key] = metrics.filter(m => m.timestamp >= startTime);
    }

    // Apply additional filters
    if (filters.type) {
      const type = filters.type;
      for (const key of Object.keys(filtered)) {
        if (key !== type) {
          filtered[key] = [];
        }
      }
    }

    if (filters.agent) {
      filtered.agents = filtered.agents.filter(m => m.agent === filters.agent);
    }

    if (filters.limit) {
      for (const key of Object.keys(filtered)) {
        filtered[key] = filtered[key].slice(-filters.limit);
      }
    }

    return filtered;
  }

  /**
   * Get aggregated statistics
   *
   * @param {Object} filters - Query filters
   * @returns {Object} Aggregated stats
   */
  getStats(filters = {}) {
    const metrics = this.getMetrics(filters);

    const stats = {
      agents: this._aggregateAgentStats(metrics.agents),
      hooks: this._aggregateHookStats(metrics.hooks),
      operations: this._aggregateOperationStats(metrics.operations),
      system: this._aggregateSystemStats(metrics.system),
      errors: this._aggregateErrorStats(metrics.errors)
    };

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Flush metrics buffer to disk
   */
  flush() {
    const timestamp = Date.now();
    const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `metrics-${date}.jsonl`;
    const filepath = path.join(this.storageDir, filename);

    // Append each metric as JSONL
    const lines = [];

    for (const [type, metrics] of Object.entries(this.metricsBuffer)) {
      for (const metric of metrics) {
        lines.push(JSON.stringify(metric));
      }
    }

    if (lines.length > 0) {
      fs.appendFileSync(filepath, lines.join('\n') + '\n');

      // Clear buffer
      this.metricsBuffer = {
        agents: [],
        hooks: [],
        operations: [],
        system: [],
        errors: []
      };
    }
  }

  /**
   * Load metrics from disk for time range
   *
   * @param {number} startTime - Start timestamp
   * @returns {Object} Loaded metrics
   */
  _loadMetrics(startTime) {
    const metrics = {
      agents: [],
      hooks: [],
      operations: [],
      system: [],
      errors: []
    };

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(startTime);

    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Load each day's metrics
    for (const date of dates) {
      const filename = `metrics-${date}.jsonl`;
      const filepath = path.join(this.storageDir, filename);

      if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;

          try {
            const metric = JSON.parse(line);

            if (metric.timestamp >= startTime) {
              // Route to appropriate bucket
              if (metric.type === 'agent_execution') {
                metrics.agents.push(metric);
              } else if (metric.type === 'hook_execution') {
                metrics.hooks.push(metric);
              } else if (metric.type === 'operation') {
                metrics.operations.push(metric);
              } else if (metric.type === 'system_health') {
                metrics.system.push(metric);
              } else if (metric.type === 'error') {
                metrics.errors.push(metric);
              }
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }
    }

    return metrics;
  }

  /**
   * Clean up old metrics files
   */
  cleanup() {
    const cutoffDate = new Date(Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000));
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const files = fs.readdirSync(this.storageDir);

    for (const file of files) {
      if (file.startsWith('metrics-') && file.endsWith('.jsonl')) {
        const dateStr = file.replace('metrics-', '').replace('.jsonl', '');

        if (dateStr < cutoffDateStr) {
          fs.unlinkSync(path.join(this.storageDir, file));
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // AGGREGATION
  // ═══════════════════════════════════════════════════════════════

  _aggregateAgentStats(metrics) {
    if (metrics.length === 0) {
      return { total: 0, byAgent: {} };
    }

    const byAgent = {};

    for (const metric of metrics) {
      if (!byAgent[metric.agent]) {
        byAgent[metric.agent] = {
          total: 0,
          success: 0,
          failure: 0,
          avgDuration: 0,
          minDuration: Infinity,
          maxDuration: 0,
          durations: []
        };
      }

      const stats = byAgent[metric.agent];
      stats.total++;

      if (metric.success) {
        stats.success++;
      } else {
        stats.failure++;
      }

      stats.durations.push(metric.duration);
      stats.minDuration = Math.min(stats.minDuration, metric.duration);
      stats.maxDuration = Math.max(stats.maxDuration, metric.duration);
    }

    // Calculate averages
    for (const agent of Object.keys(byAgent)) {
      const stats = byAgent[agent];
      stats.avgDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      stats.successRate = stats.success / stats.total;
      delete stats.durations; // Remove raw data
    }

    return {
      total: metrics.length,
      byAgent: byAgent
    };
  }

  _aggregateHookStats(metrics) {
    if (metrics.length === 0) {
      return { total: 0, byHook: {} };
    }

    const byHook = {};

    for (const metric of metrics) {
      if (!byHook[metric.hook]) {
        byHook[metric.hook] = {
          total: 0,
          success: 0,
          failure: 0,
          bypassed: 0,
          avgDuration: 0,
          circuitBreakerStates: { CLOSED: 0, OPEN: 0, HALF_OPEN: 0 },
          durations: []
        };
      }

      const stats = byHook[metric.hook];
      stats.total++;

      if (metric.success) {
        stats.success++;
      } else {
        stats.failure++;
      }

      if (metric.bypassed) {
        stats.bypassed++;
      }

      stats.circuitBreakerStates[metric.circuitBreakerState]++;
      stats.durations.push(metric.duration);
    }

    // Calculate averages
    for (const hook of Object.keys(byHook)) {
      const stats = byHook[hook];
      stats.avgDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      stats.successRate = stats.success / stats.total;
      delete stats.durations;
    }

    return {
      total: metrics.length,
      byHook: byHook
    };
  }

  _aggregateOperationStats(metrics) {
    if (metrics.length === 0) {
      return { total: 0, byOperation: {} };
    }

    const byOperation = {};

    for (const metric of metrics) {
      if (!byOperation[metric.operation]) {
        byOperation[metric.operation] = {
          total: 0,
          totalRecords: 0,
          totalSuccess: 0,
          totalFailure: 0,
          avgDuration: 0,
          durations: []
        };
      }

      const stats = byOperation[metric.operation];
      stats.total++;
      stats.totalRecords += metric.recordCount;
      stats.totalSuccess += metric.successCount;
      stats.totalFailure += metric.failureCount;
      stats.durations.push(metric.duration);
    }

    // Calculate averages
    for (const operation of Object.keys(byOperation)) {
      const stats = byOperation[operation];
      stats.avgDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
      stats.avgRecordsPerOperation = stats.totalRecords / stats.total;
      stats.successRate = stats.totalSuccess / (stats.totalSuccess + stats.totalFailure);
      delete stats.durations;
    }

    return {
      total: metrics.length,
      byOperation: byOperation
    };
  }

  _aggregateSystemStats(metrics) {
    if (metrics.length === 0) {
      return null;
    }

    // Get latest system metrics
    const latest = metrics[metrics.length - 1];

    // Calculate averages over time range
    const avgMemoryUsed = metrics.reduce((sum, m) => sum + m.memory.used, 0) / metrics.length;
    const avgHeapUsed = metrics.reduce((sum, m) => sum + m.memory.heapUsed, 0) / metrics.length;
    const avgLoadAverage = metrics.reduce((sum, m) => sum + m.cpu.loadAverage[0], 0) / metrics.length;

    return {
      current: latest,
      averages: {
        memoryUsed: avgMemoryUsed,
        heapUsed: avgHeapUsed,
        loadAverage: avgLoadAverage
      }
    };
  }

  _aggregateErrorStats(metrics) {
    if (metrics.length === 0) {
      return { total: 0, bySource: {}, recent: [] };
    }

    const bySource = {};

    for (const metric of metrics) {
      if (!bySource[metric.source]) {
        bySource[metric.source] = {
          total: 0,
          errorTypes: {}
        };
      }

      bySource[metric.source].total++;

      const errorType = metric.message.split(':')[0] || 'Unknown';
      if (!bySource[metric.source].errorTypes[errorType]) {
        bySource[metric.source].errorTypes[errorType] = 0;
      }
      bySource[metric.source].errorTypes[errorType]++;
    }

    return {
      total: metrics.length,
      bySource: bySource,
      recent: metrics.slice(-10).reverse()
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  _ensureStorageDir() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  _parseTimeRange(range) {
    const units = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const match = range.match(/^(\d+)([mhd])$/);
    if (!match) {
      throw new Error(`Invalid time range: ${range}. Use format like 1h, 24h, 7d`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    return value * units[unit];
  }

  _startAutoFlush() {
    this.flushIntervalId = setInterval(() => {
      this.flush();
      this.cleanup();
    }, this.flushInterval);

    // Flush on process exit
    process.on('exit', () => {
      this.flush();
    });

    process.on('SIGINT', () => {
      this.flush();
      process.exit(0);
    });
  }

  stopAutoFlush() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
    }
  }
}

// Export singleton instance
let instance = null;

function getInstance(options) {
  if (!instance) {
    instance = new MetricsCollector(options);
  }
  return instance;
}

module.exports = MetricsCollector;
module.exports.getInstance = getInstance;
module.exports.MetricsCollector = MetricsCollector;
