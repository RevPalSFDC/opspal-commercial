/**
 * SessionCollector - Auto-capture session context for reflections
 *
 * Captures files edited, tools invoked, errors encountered, and agents used
 * during a Claude Code session. Data is stored in ~/.claude/session-context/
 * and merged into reflections for richer diagnostic data.
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class SessionCollector {
  constructor(options = {}) {
    this.sessionId = options.sessionId || process.env.CLAUDE_SESSION_ID || this._generateSessionId();
    this.contextDir = options.contextDir || path.join(os.homedir(), '.claude', 'session-context');
    this.sessionFile = path.join(this.contextDir, `${this.sessionId}.json`);
    this.maxEvents = options.maxEvents || 1000;
    this.autoFlush = options.autoFlush !== false;
    this.flushInterval = options.flushInterval || 30000; // 30 seconds

    this._data = null;
    this._dirty = false;
    this._flushTimer = null;
  }

  /**
   * Initialize or load existing session
   */
  async initialize() {
    // Ensure context directory exists
    await fs.promises.mkdir(this.contextDir, { recursive: true });

    // Load existing session or create new
    if (fs.existsSync(this.sessionFile)) {
      try {
        const content = await fs.promises.readFile(this.sessionFile, 'utf8');
        this._data = JSON.parse(content);
      } catch (e) {
        console.error(`[SessionCollector] Failed to load session: ${e.message}`);
        this._data = this._createNewSession();
      }
    } else {
      this._data = this._createNewSession();
    }

    // Start auto-flush timer if enabled
    if (this.autoFlush) {
      this._startFlushTimer();
    }

    return this;
  }

  /**
   * Create new session data structure
   */
  _createNewSession() {
    return {
      session_id: this.sessionId,
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      duration_minutes: 0,
      files_edited: [],
      tools_used: {},
      agents_invoked: [],
      errors_captured: [],
      strategies_used: [],
      org_context: null,
      event_count: 0,
      metadata: {
        platform: process.platform,
        node_version: process.version,
        cwd: process.cwd()
      }
    };
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return crypto.randomUUID();
  }

  /**
   * Start auto-flush timer
   */
  _startFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
    }
    this._flushTimer = setInterval(() => {
      if (this._dirty) {
        this.flush().catch(e => console.error(`[SessionCollector] Flush error: ${e.message}`));
      }
    }, this.flushInterval);
  }

  /**
   * Stop auto-flush timer
   */
  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  /**
   * Mark session as dirty and update activity timestamp
   */
  _markDirty() {
    this._dirty = true;
    this._data.last_activity_at = new Date().toISOString();
    this._data.event_count++;
    this._updateDuration();
  }

  /**
   * Update session duration
   */
  _updateDuration() {
    const started = new Date(this._data.started_at);
    const now = new Date();
    this._data.duration_minutes = Math.round((now - started) / 60000);
  }

  /**
   * Capture a file edit operation
   * @param {string} filepath - Path to edited file
   * @param {string} operation - Operation type: CREATE, UPDATE, DELETE
   * @param {number} linesChanged - Number of lines changed
   * @param {object} options - Additional metadata
   */
  captureFileEdit(filepath, operation, linesChanged = 0, options = {}) {
    if (!this._data) {
      console.warn('[SessionCollector] Not initialized');
      return;
    }

    const edit = {
      path: filepath,
      operation: operation.toUpperCase(),
      lines_changed: linesChanged,
      timestamp: new Date().toISOString(),
      ...options
    };

    // Check for duplicate (same file, same operation within 1 second)
    const existing = this._data.files_edited.find(f =>
      f.path === edit.path &&
      f.operation === edit.operation &&
      Math.abs(new Date(f.timestamp) - new Date(edit.timestamp)) < 1000
    );

    if (!existing) {
      this._data.files_edited.push(edit);
      this._trimArray(this._data.files_edited, 200);
      this._markDirty();
    }

    return edit;
  }

  /**
   * Capture a tool invocation
   * @param {string} toolName - Name of the tool invoked
   * @param {object} args - Tool arguments (sanitized)
   * @param {string} result - Result status: success, error, timeout
   * @param {number} durationMs - Execution duration in milliseconds
   */
  captureToolInvocation(toolName, args = {}, result = 'success', durationMs = 0) {
    if (!this._data) {
      console.warn('[SessionCollector] Not initialized');
      return;
    }

    // Sanitize args to remove sensitive data
    const sanitizedArgs = this._sanitizeArgs(args);

    // Aggregate by tool name
    if (!this._data.tools_used[toolName]) {
      this._data.tools_used[toolName] = {
        invocations: 0,
        success_count: 0,
        error_count: 0,
        timeout_count: 0,
        total_duration_ms: 0,
        last_invoked_at: null,
        sample_args: []
      };
    }

    const tool = this._data.tools_used[toolName];
    tool.invocations++;
    tool.total_duration_ms += durationMs;
    tool.last_invoked_at = new Date().toISOString();

    switch (result) {
      case 'success':
        tool.success_count++;
        break;
      case 'error':
        tool.error_count++;
        break;
      case 'timeout':
        tool.timeout_count++;
        break;
    }

    // Keep sample of recent args (max 3)
    if (Object.keys(sanitizedArgs).length > 0) {
      tool.sample_args.push({
        args: sanitizedArgs,
        result,
        timestamp: new Date().toISOString()
      });
      this._trimArray(tool.sample_args, 3);
    }

    this._markDirty();
    return tool;
  }

  /**
   * Capture an error
   * @param {string} errorType - Type of error (e.g., SOQL_SYNTAX, DEPLOYMENT_FAILED)
   * @param {string} message - Error message
   * @param {object} context - Additional context
   */
  captureError(errorType, message, context = {}) {
    if (!this._data) {
      console.warn('[SessionCollector] Not initialized');
      return;
    }

    // Sanitize error message (remove potential PII/secrets)
    const sanitizedMessage = this._sanitizeMessage(message);

    const error = {
      type: errorType,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      context: this._sanitizeArgs(context)
    };

    this._data.errors_captured.push(error);
    this._trimArray(this._data.errors_captured, 50);
    this._markDirty();

    return error;
  }

  /**
   * Capture an agent invocation
   * @param {string} agentName - Name of the agent used
   * @param {string} taskSummary - Brief summary of the task
   * @param {boolean} success - Whether the task succeeded
   * @param {object} options - Additional metadata
   */
  captureAgentUsed(agentName, taskSummary, success = true, options = {}) {
    if (!this._data) {
      console.warn('[SessionCollector] Not initialized');
      return;
    }

    // Find existing agent entry or create new
    let agent = this._data.agents_invoked.find(a => a.agent === agentName);

    if (!agent) {
      agent = {
        agent: agentName,
        task_count: 0,
        success_count: 0,
        tasks: []
      };
      this._data.agents_invoked.push(agent);
    }

    agent.task_count++;
    if (success) {
      agent.success_count++;
    }
    agent.tasks.push({
      summary: taskSummary.substring(0, 200),
      success,
      timestamp: new Date().toISOString(),
      ...options
    });

    this._trimArray(agent.tasks, 10);
    this._markDirty();

    return agent;
  }

  /**
   * Capture strategy usage (from ACE framework)
   * @param {string} strategyId - Strategy ID
   * @param {string} strategyName - Strategy name
   */
  captureStrategyUsed(strategyId, strategyName = null) {
    if (!this._data) {
      console.warn('[SessionCollector] Not initialized');
      return;
    }

    const existing = this._data.strategies_used.find(s => s.id === strategyId);
    if (!existing) {
      this._data.strategies_used.push({
        id: strategyId,
        name: strategyName,
        used_at: new Date().toISOString()
      });
      this._markDirty();
    }
  }

  /**
   * Set org context for the session
   * @param {string} orgAlias - Org alias (e.g., eta-corp, flex-production)
   * @param {string} platform - Platform (salesforce, hubspot, etc.)
   * @param {object} metadata - Additional org metadata
   */
  setOrgContext(orgAlias, platform, metadata = {}) {
    if (!this._data) {
      console.warn('[SessionCollector] Not initialized');
      return;
    }

    this._data.org_context = {
      org_alias: orgAlias,
      platform,
      set_at: new Date().toISOString(),
      ...metadata
    };

    this._markDirty();
    return this._data.org_context;
  }

  /**
   * Generate session summary for reflection
   */
  generateSessionSummary() {
    if (!this._data) {
      return null;
    }

    this._updateDuration();

    const toolStats = Object.entries(this._data.tools_used).map(([name, data]) => ({
      tool: name,
      invocations: data.invocations,
      success_rate: data.invocations > 0
        ? Math.round((data.success_count / data.invocations) * 100)
        : 100,
      avg_duration_ms: data.invocations > 0
        ? Math.round(data.total_duration_ms / data.invocations)
        : 0
    }));

    return {
      session_id: this._data.session_id,
      started_at: this._data.started_at,
      duration_minutes: this._data.duration_minutes,
      files_edited: this._data.files_edited.map(f => ({
        path: f.path,
        operation: f.operation,
        lines_changed: f.lines_changed
      })),
      files_edited_count: this._data.files_edited.length,
      tools_used: toolStats,
      tools_invoked_count: Object.values(this._data.tools_used)
        .reduce((sum, t) => sum + t.invocations, 0),
      agents_invoked: this._data.agents_invoked.map(a => ({
        agent: a.agent,
        task_count: a.task_count,
        success_count: a.success_count
      })),
      errors_captured: this._data.errors_captured.map(e => ({
        type: e.type,
        message: e.message,
        timestamp: e.timestamp
      })),
      errors_captured_count: this._data.errors_captured.length,
      strategies_used: this._data.strategies_used.map(s => s.id),
      org_context: this._data.org_context
    };
  }

  /**
   * Flush session data to disk
   */
  async flush() {
    if (!this._data || !this._dirty) {
      return;
    }

    try {
      await fs.promises.writeFile(
        this.sessionFile,
        JSON.stringify(this._data, null, 2),
        'utf8'
      );
      this._dirty = false;
    } catch (e) {
      console.error(`[SessionCollector] Failed to flush: ${e.message}`);
      throw e;
    }
  }

  /**
   * Close session and cleanup
   */
  async close() {
    this._stopFlushTimer();
    if (this._dirty) {
      await this.flush();
    }
  }

  /**
   * Get raw session data
   */
  getData() {
    return this._data;
  }

  /**
   * Clear session data (for testing)
   */
  async clear() {
    this._data = this._createNewSession();
    this._dirty = true;
    await this.flush();
  }

  /**
   * Sanitize arguments to remove sensitive data
   */
  _sanitizeArgs(args) {
    if (!args || typeof args !== 'object') {
      return {};
    }

    const sensitivePatterns = [
      /password/i, /secret/i, /token/i, /key/i, /credential/i,
      /auth/i, /bearer/i, /api[_-]?key/i
    ];

    const sanitized = {};
    for (const [key, value] of Object.entries(args)) {
      if (sensitivePatterns.some(p => p.test(key))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 500) {
        sanitized[key] = value.substring(0, 500) + '...[truncated]';
      } else if (typeof value === 'object') {
        sanitized[key] = '[object]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize error messages
   */
  _sanitizeMessage(message) {
    if (typeof message !== 'string') {
      return String(message);
    }

    // Remove potential PII patterns
    return message
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      .replace(/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/token[=:]\s*["']?[A-Za-z0-9\-_.~+/]+["']?/gi, 'token=[REDACTED]')
      .substring(0, 1000);
  }

  /**
   * Trim array to max size, keeping most recent
   */
  _trimArray(arr, maxSize) {
    if (arr.length > maxSize) {
      arr.splice(0, arr.length - maxSize);
    }
  }

  /**
   * Load session by ID
   * @param {string} sessionId - Session ID to load
   */
  static async load(sessionId, options = {}) {
    const collector = new SessionCollector({ ...options, sessionId });
    await collector.initialize();
    return collector;
  }

  /**
   * Get current session or create new one
   */
  static async getCurrent(options = {}) {
    const collector = new SessionCollector(options);
    await collector.initialize();
    return collector;
  }

  /**
   * List recent sessions
   * @param {number} limit - Max sessions to return
   */
  static async listSessions(limit = 10) {
    const contextDir = path.join(os.homedir(), '.claude', 'session-context');

    if (!fs.existsSync(contextDir)) {
      return [];
    }

    const files = await fs.promises.readdir(contextDir);
    const sessions = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filepath = path.join(contextDir, file);
        const stat = await fs.promises.stat(filepath);
        const content = await fs.promises.readFile(filepath, 'utf8');
        const data = JSON.parse(content);

        sessions.push({
          session_id: data.session_id,
          started_at: data.started_at,
          duration_minutes: data.duration_minutes,
          files_edited_count: data.files_edited?.length || 0,
          errors_count: data.errors_captured?.length || 0,
          modified_at: stat.mtime.toISOString()
        });
      } catch (e) {
        // Skip invalid files
      }
    }

    // Sort by modified time, newest first
    sessions.sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));

    return sessions.slice(0, limit);
  }

  /**
   * Clean up old sessions
   * @param {number} maxAgeDays - Delete sessions older than this
   */
  static async cleanup(maxAgeDays = 30) {
    const contextDir = path.join(os.homedir(), '.claude', 'session-context');

    if (!fs.existsSync(contextDir)) {
      return { deleted: 0 };
    }

    const files = await fs.promises.readdir(contextDir);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);

    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filepath = path.join(contextDir, file);
        const stat = await fs.promises.stat(filepath);

        if (stat.mtime < cutoff) {
          await fs.promises.unlink(filepath);
          deleted++;
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return { deleted };
  }
}

module.exports = SessionCollector;

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    switch (command) {
      case 'list':
        const sessions = await SessionCollector.listSessions(parseInt(args[1]) || 10);
        console.log(JSON.stringify(sessions, null, 2));
        break;

      case 'cleanup':
        const result = await SessionCollector.cleanup(parseInt(args[1]) || 30);
        console.log(`Cleaned up ${result.deleted} old sessions`);
        break;

      case 'current':
        const collector = await SessionCollector.getCurrent();
        const summary = collector.generateSessionSummary();
        console.log(JSON.stringify(summary, null, 2));
        await collector.close();
        break;

      default:
        console.log(`
SessionCollector CLI

Usage:
  node session-collector.js list [limit]     - List recent sessions
  node session-collector.js cleanup [days]   - Clean up sessions older than N days
  node session-collector.js current          - Show current session summary
        `);
    }
  })().catch(console.error);
}
