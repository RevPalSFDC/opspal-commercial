'use strict';

/**
 * Opt-in structured JSON logger for HubSpot API operations.
 * Enable via HUBSPOT_STRUCTURED_LOG=1 env var or { enabled: true } constructor option.
 * Emits NDJSON to stderr; becomes a no-op when disabled.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

class HubSpotStructuredLogger {
  constructor(options = {}) {
    this._enabled =
      options.enabled === true ||
      process.env.HUBSPOT_STRUCTURED_LOG === '1';
    this._minLevel = LEVELS[options.level] || LEVELS.debug;
    this._correlationId = options.correlationId || null;
  }

  // ── Core emit ──────────────────────────────────────────────────────────────

  _emit(level, event, fields = {}) {
    if (!this._enabled) return;
    if ((LEVELS[level] || 0) < this._minLevel) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      platform: 'hubspot',
      ...(this._correlationId ? { correlationId: this._correlationId } : {}),
      ...fields,
    };

    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  // ── Public log-level helpers ───────────────────────────────────────────────

  debug(event, fields) { this._emit('debug', event, fields); }
  info(event, fields)  { this._emit('info',  event, fields); }
  warn(event, fields)  { this._emit('warn',  event, fields); }
  error(event, fields) { this._emit('error', event, fields); }

  // ── Domain-specific methods ────────────────────────────────────────────────

  /**
   * Log an HTTP request/response cycle.
   * @param {string} method      HTTP verb (GET, POST, …)
   * @param {string} url         Full or partial URL
   * @param {number} status      HTTP status code
   * @param {number} duration    Duration in milliseconds
   * @param {object} [opts]      Optional extra fields (e.g. objectType, recordId)
   */
  logRequest(method, url, status, duration, opts = {}) {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    this._emit(level, 'hubspot.request', {
      method,
      url,
      status,
      duration,
      ...opts,
    });
  }

  /**
   * Log the result of a batch operation.
   * @param {string} operation   e.g. 'batchUpsertContacts'
   * @param {object} stats       e.g. { total, succeeded, failed, duration }
   */
  logBatch(operation, stats = {}) {
    const level = stats.failed > 0 ? 'warn' : 'info';
    this._emit(level, 'hubspot.batch', { operation, ...stats });
  }

  /**
   * Log a rate-limit event.
   * @param {object} info   e.g. { retryAfter, remaining, limit, endpoint }
   */
  logRateLimit(info = {}) {
    this._emit('warn', 'hubspot.rateLimit', info);
  }

  /**
   * Log an error with optional context.
   * @param {Error|string} err     The error object or message
   * @param {object}       [ctx]   Additional context fields
   */
  logError(err, ctx = {}) {
    const details =
      err instanceof Error
        ? { message: err.message, stack: err.stack, code: err.code }
        : { message: String(err) };
    this._emit('error', 'hubspot.error', { error: details, ...ctx });
  }

  // ── Correlation helper ─────────────────────────────────────────────────────

  /** Return a child logger that stamps every entry with the given correlationId. */
  withCorrelationId(correlationId) {
    return new HubSpotStructuredLogger({
      enabled: this._enabled,
      level: Object.keys(LEVELS).find(k => LEVELS[k] === this._minLevel) || 'debug',
      correlationId,
    });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance = null;

/**
 * Return (or create) the shared logger instance.
 * Options are only applied on first call; subsequent calls return the cached instance.
 * @param {object} [options]
 * @param {boolean} [options.enabled]       Override HUBSPOT_STRUCTURED_LOG env var
 * @param {string}  [options.level]         Minimum level: debug|info|warn|error
 * @param {string}  [options.correlationId] Default correlation ID
 * @returns {HubSpotStructuredLogger}
 */
function getLogger(options = {}) {
  if (!_instance) {
    _instance = new HubSpotStructuredLogger(options);
  }
  return _instance;
}

/** Reset singleton (useful in tests). */
function resetLogger() {
  _instance = null;
}

module.exports = { HubSpotStructuredLogger, getLogger, resetLogger };
