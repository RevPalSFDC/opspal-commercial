/**
 * TraceLogger - Auditable execution trace logging
 *
 * Provides:
 * - Structured trace event logging
 * - Execution timeline reconstruction
 * - Performance metrics
 * - Audit trail generation
 * - Export to various formats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TraceLogger {
  constructor(options = {}) {
    this.options = {
      logDir: options.logDir || null,
      includeTimestamps: options.includeTimestamps ?? true,
      includeStackTraces: options.includeStackTraces || false,
      maxEventsInMemory: options.maxEventsInMemory || 10000,
      ...options
    };

    // Generate trace ID
    this.traceId = options.traceId || this.generateTraceId();
    this.sessionId = options.sessionId || this.traceId;

    // Events storage
    this.events = [];
    this.spans = new Map();

    // Metadata
    this.metadata = {
      trace_id: this.traceId,
      session_id: this.sessionId,
      started_at: new Date().toISOString(),
      ended_at: null,
      environment: process.env.NODE_ENV || 'development',
      hostname: require('os').hostname(),
      ...options.metadata
    };

    // Counters for statistics
    this.counters = {
      events: 0,
      errors: 0,
      warnings: 0,
      tasks_started: 0,
      tasks_completed: 0,
      tasks_failed: 0
    };
  }

  /**
   * Generate a unique trace ID
   * @private
   */
  generateTraceId() {
    return `trace-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Log an event
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} category - Event category
   * @param {string} message - Event message
   * @param {Object} data - Additional event data
   * @returns {Object} The logged event
   */
  log(level, category, message, data = {}) {
    const event = {
      id: `evt-${++this.counters.events}`,
      trace_id: this.traceId,
      level,
      category,
      message,
      data,
      timestamp: this.options.includeTimestamps ? new Date().toISOString() : undefined
    };

    // Update counters
    if (level === 'error') this.counters.errors++;
    if (level === 'warn') this.counters.warnings++;

    // Store event
    this.events.push(event);

    // Trim if over limit
    if (this.events.length > this.options.maxEventsInMemory) {
      this.events = this.events.slice(-this.options.maxEventsInMemory);
    }

    // Write to file if configured
    if (this.options.logDir) {
      this.appendToFile(event);
    }

    return event;
  }

  // Convenience methods for different log levels
  info(category, message, data) { return this.log('info', category, message, data); }
  warn(category, message, data) { return this.log('warn', category, message, data); }
  error(category, message, data) { return this.log('error', category, message, data); }
  debug(category, message, data) { return this.log('debug', category, message, data); }

  /**
   * Log task lifecycle events
   */
  taskStart(taskId, taskSpec) {
    this.counters.tasks_started++;
    return this.log('info', 'task', `Task ${taskId} started`, {
      task_id: taskId,
      title: taskSpec.title,
      domain: taskSpec.domain,
      risk_level: taskSpec.risk_level,
      event_type: 'task_start'
    });
  }

  taskComplete(taskId, result) {
    this.counters.tasks_completed++;
    return this.log('info', 'task', `Task ${taskId} completed`, {
      task_id: taskId,
      status: result.status,
      files_changed: result.files_changed?.length || 0,
      event_type: 'task_complete'
    });
  }

  taskFailed(taskId, error) {
    this.counters.tasks_failed++;
    return this.log('error', 'task', `Task ${taskId} failed: ${error}`, {
      task_id: taskId,
      error: error.message || error,
      stack: this.options.includeStackTraces ? error.stack : undefined,
      event_type: 'task_failed'
    });
  }

  /**
   * Log scheduling events
   */
  scheduleEvent(eventType, data) {
    return this.log('info', 'scheduler', `Scheduler: ${eventType}`, {
      event_type: eventType,
      ...data
    });
  }

  /**
   * Log verification events
   */
  verificationStart(taskId) {
    return this.log('info', 'verification', `Verification started for ${taskId}`, {
      task_id: taskId,
      event_type: 'verification_start'
    });
  }

  verificationComplete(taskId, passed) {
    return this.log(passed ? 'info' : 'warn', 'verification',
      `Verification ${passed ? 'passed' : 'failed'} for ${taskId}`, {
        task_id: taskId,
        passed,
        event_type: 'verification_complete'
      });
  }

  /**
   * Log tool usage events
   */
  toolCall(toolName, args, taskId = null) {
    return this.log('debug', 'tool', `Tool call: ${toolName}`, {
      tool: toolName,
      args: this.sanitizeArgs(args),
      task_id: taskId,
      event_type: 'tool_call'
    });
  }

  toolResult(toolName, success, taskId = null) {
    return this.log(success ? 'debug' : 'warn', 'tool',
      `Tool ${toolName} ${success ? 'succeeded' : 'failed'}`, {
        tool: toolName,
        success,
        task_id: taskId,
        event_type: 'tool_result'
      });
  }

  /**
   * Start a span (for timing operations)
   * @param {string} name - Span name
   * @param {Object} data - Span data
   * @returns {string} Span ID
   */
  startSpan(name, data = {}) {
    const spanId = `span-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    this.spans.set(spanId, {
      id: spanId,
      name,
      data,
      start_time: Date.now(),
      events: []
    });

    this.log('debug', 'span', `Span started: ${name}`, { span_id: spanId, ...data });

    return spanId;
  }

  /**
   * End a span
   * @param {string} spanId - Span ID to end
   * @param {Object} result - Span result data
   * @returns {Object} Completed span
   */
  endSpan(spanId, result = {}) {
    const span = this.spans.get(spanId);
    if (!span) {
      this.warn('span', `Unknown span: ${spanId}`);
      return null;
    }

    span.end_time = Date.now();
    span.duration_ms = span.end_time - span.start_time;
    span.result = result;

    this.log('debug', 'span', `Span ended: ${span.name}`, {
      span_id: spanId,
      duration_ms: span.duration_ms,
      ...result
    });

    return span;
  }

  /**
   * Add event to a span
   * @param {string} spanId - Span ID
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   */
  addSpanEvent(spanId, eventName, data = {}) {
    const span = this.spans.get(spanId);
    if (span) {
      span.events.push({
        name: eventName,
        timestamp: Date.now(),
        data
      });
    }
  }

  /**
   * Sanitize sensitive data from args
   * @private
   */
  sanitizeArgs(args) {
    if (!args) return args;
    if (typeof args !== 'object') return args;

    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'auth'];
    const sanitized = { ...args };

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Append event to log file
   * @private
   */
  appendToFile(event) {
    const logDir = this.options.logDir;
    if (!logDir) return;

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${this.traceId}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(event) + '\n');
  }

  /**
   * Get events filtered by criteria
   * @param {Object} filter - Filter criteria
   * @returns {Array<Object>} Filtered events
   */
  getEvents(filter = {}) {
    let events = [...this.events];

    if (filter.level) {
      events = events.filter(e => e.level === filter.level);
    }

    if (filter.category) {
      events = events.filter(e => e.category === filter.category);
    }

    if (filter.task_id) {
      events = events.filter(e => e.data?.task_id === filter.task_id);
    }

    if (filter.since) {
      events = events.filter(e => new Date(e.timestamp) >= new Date(filter.since));
    }

    if (filter.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  /**
   * Get execution timeline
   * @returns {Array<Object>} Timeline entries
   */
  getTimeline() {
    return this.events
      .filter(e => e.data?.event_type)
      .map(e => ({
        timestamp: e.timestamp,
        event: e.data.event_type,
        task_id: e.data.task_id,
        message: e.message
      }))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const taskEvents = this.events.filter(e =>
      e.category === 'task' && e.data?.event_type
    );

    const taskDurations = [];
    const taskStarts = new Map();

    for (const event of taskEvents) {
      const taskId = event.data.task_id;

      if (event.data.event_type === 'task_start') {
        taskStarts.set(taskId, new Date(event.timestamp));
      } else if (event.data.event_type === 'task_complete' ||
                 event.data.event_type === 'task_failed') {
        const startTime = taskStarts.get(taskId);
        if (startTime) {
          const duration = new Date(event.timestamp) - startTime;
          taskDurations.push(duration);
        }
      }
    }

    return {
      total_events: this.counters.events,
      errors: this.counters.errors,
      warnings: this.counters.warnings,
      tasks: {
        started: this.counters.tasks_started,
        completed: this.counters.tasks_completed,
        failed: this.counters.tasks_failed,
        success_rate: this.counters.tasks_started > 0
          ? (this.counters.tasks_completed / this.counters.tasks_started * 100).toFixed(1) + '%'
          : 'N/A'
      },
      timing: {
        avg_task_duration_ms: taskDurations.length > 0
          ? Math.round(taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length)
          : 0,
        max_task_duration_ms: taskDurations.length > 0
          ? Math.max(...taskDurations)
          : 0,
        total_duration_ms: this.metadata.ended_at
          ? new Date(this.metadata.ended_at) - new Date(this.metadata.started_at)
          : Date.now() - new Date(this.metadata.started_at)
      },
      spans: {
        total: this.spans.size,
        completed: Array.from(this.spans.values()).filter(s => s.end_time).length
      }
    };
  }

  /**
   * Generate audit report
   * @returns {Object} Audit report
   */
  generateAuditReport() {
    this.metadata.ended_at = new Date().toISOString();

    return {
      metadata: this.metadata,
      metrics: this.getMetrics(),
      timeline: this.getTimeline(),
      errors: this.getEvents({ level: 'error' }),
      warnings: this.getEvents({ level: 'warn' }),
      spans: Array.from(this.spans.values()),
      summary: {
        total_events: this.counters.events,
        task_success_rate: this.counters.tasks_started > 0
          ? `${this.counters.tasks_completed}/${this.counters.tasks_started}`
          : 'N/A',
        had_errors: this.counters.errors > 0,
        had_warnings: this.counters.warnings > 0
      }
    };
  }

  /**
   * Export trace to file
   * @param {string} filePath - Output file path
   * @param {string} format - Export format (json, jsonl, markdown)
   */
  export(filePath, format = 'json') {
    const report = this.generateAuditReport();

    switch (format) {
      case 'json':
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        break;

      case 'jsonl':
        const lines = this.events.map(e => JSON.stringify(e)).join('\n');
        fs.writeFileSync(filePath, lines);
        break;

      case 'markdown':
        fs.writeFileSync(filePath, this.toMarkdown(report));
        break;

      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  /**
   * Convert report to markdown
   * @private
   */
  toMarkdown(report) {
    const lines = [];

    lines.push(`# Execution Trace Report`);
    lines.push(`\n## Metadata`);
    lines.push(`- **Trace ID**: ${report.metadata.trace_id}`);
    lines.push(`- **Started**: ${report.metadata.started_at}`);
    lines.push(`- **Ended**: ${report.metadata.ended_at}`);
    lines.push(`- **Environment**: ${report.metadata.environment}`);

    lines.push(`\n## Metrics`);
    lines.push(`- **Total Events**: ${report.metrics.total_events}`);
    lines.push(`- **Errors**: ${report.metrics.errors}`);
    lines.push(`- **Warnings**: ${report.metrics.warnings}`);
    lines.push(`- **Tasks**: ${report.metrics.tasks.completed}/${report.metrics.tasks.started} completed`);
    lines.push(`- **Success Rate**: ${report.metrics.tasks.success_rate}`);

    if (report.errors.length > 0) {
      lines.push(`\n## Errors`);
      for (const error of report.errors) {
        lines.push(`- [${error.timestamp}] ${error.message}`);
      }
    }

    lines.push(`\n## Timeline`);
    for (const entry of report.timeline) {
      lines.push(`- [${entry.timestamp}] ${entry.event}: ${entry.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = [];
    this.spans.clear();
    this.counters = {
      events: 0,
      errors: 0,
      warnings: 0,
      tasks_started: 0,
      tasks_completed: 0,
      tasks_failed: 0
    };
  }
}

module.exports = { TraceLogger };
