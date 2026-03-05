#!/usr/bin/env node

/**
 * Trace Context System
 *
 * Provides distributed tracing capabilities:
 * - Generate trace IDs at session start
 * - Propagate through all operations via TRACE_ID env var
 * - Support parent/child spans for nested operations
 * - Export to JSONL for analysis
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: Infrastructure gap (unified logging & tracing)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TraceContext {
    constructor(options = {}) {
        this.traceId = options.traceId || TraceContext.generateTraceId();
        this.spanId = options.spanId || TraceContext.generateSpanId();
        this.parentSpanId = options.parentSpanId || null;
        this.serviceName = options.serviceName || 'claude-code';
        this.startTime = Date.now();

        // Trace storage
        this.logDir = options.logDir || path.join(process.env.HOME || '/tmp', '.claude', 'logs');
        this.traceFile = path.join(this.logDir, 'traces.jsonl');

        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        // Span tracking
        this.spans = [];
        this.activeSpans = new Map();
    }

    /**
     * Generate a unique trace ID (128-bit hex string)
     * @returns {string} Trace ID
     */
    static generateTraceId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Generate a unique span ID (64-bit hex string)
     * @returns {string} Span ID
     */
    static generateSpanId() {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Get trace context from environment
     * @returns {TraceContext|null} Trace context if available
     */
    static getFromEnv() {
        const traceId = process.env.TRACE_ID || process.env.CLAUDE_TRACE_ID;
        const spanId = process.env.SPAN_ID || process.env.CLAUDE_SPAN_ID;
        const parentSpanId = process.env.PARENT_SPAN_ID;

        if (traceId) {
            return new TraceContext({
                traceId,
                spanId: spanId || TraceContext.generateSpanId(),
                parentSpanId
            });
        }

        return null;
    }

    /**
     * Get or create trace context
     * @returns {TraceContext} Trace context
     */
    static getOrCreate() {
        const existing = TraceContext.getFromEnv();
        if (existing) {
            return existing;
        }
        return new TraceContext();
    }

    /**
     * Create a child span
     * @param {string} name - Span name/operation
     * @param {Object} attributes - Optional attributes
     * @returns {Object} Span object with end() method
     */
    createSpan(name, attributes = {}) {
        const spanId = TraceContext.generateSpanId();
        const span = {
            traceId: this.traceId,
            spanId,
            parentSpanId: this.spanId,
            name,
            serviceName: this.serviceName,
            startTime: Date.now(),
            endTime: null,
            duration: null,
            status: 'IN_PROGRESS',
            attributes,
            events: [],

            // Add event to span
            addEvent: (eventName, eventAttributes = {}) => {
                span.events.push({
                    name: eventName,
                    timestamp: Date.now(),
                    attributes: eventAttributes
                });
            },

            // Set status
            setStatus: (status, message = null) => {
                span.status = status;
                if (message) {
                    span.statusMessage = message;
                }
            },

            // Set attribute
            setAttribute: (key, value) => {
                span.attributes[key] = value;
            },

            // End the span
            end: (endAttributes = {}) => {
                span.endTime = Date.now();
                span.duration = span.endTime - span.startTime;
                span.status = span.status === 'IN_PROGRESS' ? 'OK' : span.status;
                Object.assign(span.attributes, endAttributes);

                // Remove from active spans
                this.activeSpans.delete(spanId);

                // Add to completed spans
                this.spans.push(span);

                // Log span
                this._logSpan(span);

                return span;
            }
        };

        // Track as active span
        this.activeSpans.set(spanId, span);

        return span;
    }

    /**
     * Create a child trace context for nested operations
     * @param {string} operationName - Name of the operation
     * @returns {TraceContext} Child trace context
     */
    createChildContext(operationName) {
        return new TraceContext({
            traceId: this.traceId,
            parentSpanId: this.spanId,
            serviceName: operationName,
            logDir: this.logDir
        });
    }

    /**
     * Convert trace context to HTTP headers
     * @returns {Object} Headers for trace propagation
     */
    toHeaders() {
        return {
            'X-Trace-Id': this.traceId,
            'X-Span-Id': this.spanId,
            'X-Parent-Span-Id': this.parentSpanId || '',
            'traceparent': `00-${this.traceId}-${this.spanId}-01`
        };
    }

    /**
     * Convert trace context to environment variables
     * @returns {Object} Environment variables
     */
    toEnv() {
        return {
            TRACE_ID: this.traceId,
            CLAUDE_TRACE_ID: this.traceId,
            SPAN_ID: this.spanId,
            CLAUDE_SPAN_ID: this.spanId,
            PARENT_SPAN_ID: this.parentSpanId || ''
        };
    }

    /**
     * Export environment variables to shell format
     * @returns {string} Shell export commands
     */
    toShellExport() {
        const env = this.toEnv();
        return Object.entries(env)
            .map(([key, value]) => `export ${key}="${value}"`)
            .join('\n');
    }

    /**
     * Get trace summary
     * @returns {Object} Summary of trace
     */
    getSummary() {
        const totalDuration = Date.now() - this.startTime;
        const completedSpans = this.spans.length;
        const activeSpans = this.activeSpans.size;

        const statusCounts = {
            OK: 0,
            ERROR: 0,
            IN_PROGRESS: activeSpans
        };

        for (const span of this.spans) {
            if (statusCounts[span.status] !== undefined) {
                statusCounts[span.status]++;
            }
        }

        return {
            traceId: this.traceId,
            serviceName: this.serviceName,
            totalDuration,
            completedSpans,
            activeSpans,
            statusCounts,
            startTime: new Date(this.startTime).toISOString()
        };
    }

    /**
     * Log a span to the trace file
     * @private
     */
    _logSpan(span) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'span',
            ...span
        };

        try {
            fs.appendFileSync(this.traceFile, JSON.stringify(entry) + '\n');
        } catch (error) {
            // Silently fail - don't break operations for logging issues
        }
    }

    /**
     * Log trace start
     */
    logStart() {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'trace_start',
            traceId: this.traceId,
            spanId: this.spanId,
            serviceName: this.serviceName
        };

        try {
            fs.appendFileSync(this.traceFile, JSON.stringify(entry) + '\n');
        } catch (error) {
            // Silently fail
        }
    }

    /**
     * Log trace end
     */
    logEnd(status = 'OK') {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'trace_end',
            traceId: this.traceId,
            spanId: this.spanId,
            serviceName: this.serviceName,
            status,
            duration: Date.now() - this.startTime,
            summary: this.getSummary()
        };

        try {
            fs.appendFileSync(this.traceFile, JSON.stringify(entry) + '\n');
        } catch (error) {
            // Silently fail
        }
    }

    /**
     * Wrap an async function with tracing
     * @param {string} operationName - Name of the operation
     * @param {Function} fn - Async function to wrap
     * @returns {Function} Wrapped function
     */
    wrapAsync(operationName, fn) {
        const ctx = this;

        return async function traced(...args) {
            const span = ctx.createSpan(operationName, {
                args: args.length > 0 ? JSON.stringify(args).substring(0, 200) : undefined
            });

            try {
                const result = await fn.apply(this, args);
                span.setStatus('OK');
                span.end({ hasResult: result !== undefined });
                return result;
            } catch (error) {
                span.setStatus('ERROR', error.message);
                span.setAttribute('error.type', error.name);
                span.setAttribute('error.message', error.message);
                span.end();
                throw error;
            }
        };
    }

    /**
     * Wrap a sync function with tracing
     * @param {string} operationName - Name of the operation
     * @param {Function} fn - Sync function to wrap
     * @returns {Function} Wrapped function
     */
    wrapSync(operationName, fn) {
        const ctx = this;

        return function traced(...args) {
            const span = ctx.createSpan(operationName, {
                args: args.length > 0 ? JSON.stringify(args).substring(0, 200) : undefined
            });

            try {
                const result = fn.apply(this, args);
                span.setStatus('OK');
                span.end({ hasResult: result !== undefined });
                return result;
            } catch (error) {
                span.setStatus('ERROR', error.message);
                span.setAttribute('error.type', error.name);
                span.setAttribute('error.message', error.message);
                span.end();
                throw error;
            }
        };
    }
}

/**
 * Structured logger with trace context support
 */
class TracedLogger {
    constructor(traceContext, options = {}) {
        this.ctx = traceContext || TraceContext.getOrCreate();
        this.logFile = options.logFile || path.join(
            process.env.HOME || '/tmp',
            '.claude', 'logs', 'structured.jsonl'
        );

        // Ensure directory exists
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * Log a message with trace context
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    log(level, message, data = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            trace_id: this.ctx.traceId,
            span_id: this.ctx.spanId,
            parent_span_id: this.ctx.parentSpanId,
            service: this.ctx.serviceName,
            ...data
        };

        try {
            fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
        } catch (error) {
            // Silently fail
        }

        return entry;
    }

    info(message, data = {}) {
        return this.log('INFO', message, data);
    }

    warn(message, data = {}) {
        return this.log('WARN', message, data);
    }

    error(message, data = {}) {
        return this.log('ERROR', message, data);
    }

    debug(message, data = {}) {
        return this.log('DEBUG', message, data);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'generate':
            const ctx = new TraceContext();
            console.log(JSON.stringify({
                traceId: ctx.traceId,
                spanId: ctx.spanId,
                env: ctx.toEnv(),
                headers: ctx.toHeaders()
            }, null, 2));
            break;

        case 'export':
            const exportCtx = TraceContext.getOrCreate();
            console.log(exportCtx.toShellExport());
            break;

        case 'from-env':
            const envCtx = TraceContext.getFromEnv();
            if (envCtx) {
                console.log(JSON.stringify({
                    traceId: envCtx.traceId,
                    spanId: envCtx.spanId,
                    parentSpanId: envCtx.parentSpanId
                }, null, 2));
            } else {
                console.log('No trace context found in environment');
                process.exit(1);
            }
            break;

        case 'summary':
            const traceFile = path.join(process.env.HOME || '/tmp', '.claude', 'logs', 'traces.jsonl');
            if (!fs.existsSync(traceFile)) {
                console.log('No trace file found');
                process.exit(1);
            }

            const lines = fs.readFileSync(traceFile, 'utf-8').trim().split('\n');
            const traces = new Map();

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    const traceId = entry.traceId;

                    if (!traces.has(traceId)) {
                        traces.set(traceId, { spans: [], start: null, end: null });
                    }

                    const trace = traces.get(traceId);

                    if (entry.type === 'trace_start') {
                        trace.start = entry;
                    } else if (entry.type === 'trace_end') {
                        trace.end = entry;
                    } else if (entry.type === 'span') {
                        trace.spans.push(entry);
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }

            console.log(`Total traces: ${traces.size}`);
            console.log(`\nRecent traces:`);

            const recent = Array.from(traces.entries()).slice(-5);
            for (const [traceId, trace] of recent) {
                console.log(`\n  Trace: ${traceId.substring(0, 16)}...`);
                console.log(`    Spans: ${trace.spans.length}`);
                if (trace.end) {
                    console.log(`    Duration: ${trace.end.duration}ms`);
                    console.log(`    Status: ${trace.end.status}`);
                }
            }
            break;

        default:
            console.log(`
Trace Context System - Distributed tracing for Claude Code

Usage:
  trace-context generate      Generate new trace context
  trace-context export        Export trace context as shell exports
  trace-context from-env      Get trace context from environment
  trace-context summary       Show summary of recent traces

Environment Variables:
  TRACE_ID / CLAUDE_TRACE_ID       Current trace ID
  SPAN_ID / CLAUDE_SPAN_ID         Current span ID
  PARENT_SPAN_ID                   Parent span ID (for child spans)

Examples:
  # Generate and export trace context
  eval $(node trace-context.js export)

  # Check current trace
  node trace-context.js from-env

  # View trace summary
  node trace-context.js summary
            `);
    }
}

module.exports = { TraceContext, TracedLogger };
