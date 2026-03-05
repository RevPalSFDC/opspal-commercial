#!/usr/bin/env node

/**
 * Session Context Manager - Cross-Session Context Sharing
 *
 * Provides persistent context storage across Claude Code sessions.
 *
 * Key Features:
 * - Session context storage/retrieval
 * - Context continuity across sessions
 * - Session summary generation
 * - TTL-based expiration
 * - Context search and filtering
 *
 * Addresses: Phase 3.3 - Context continuity issues
 *
 * Prevention Target: Context lost between sessions, repeated work
 *
 * Usage:
 *   const { SessionContextManager } = require('./session-context-manager');
 *   const manager = new SessionContextManager();
 *
 *   // Save context
 *   await manager.saveContext('task-123', {
 *     task: 'Deploy validation rules',
 *     progress: '50%',
 *     nextSteps: ['Test', 'Deploy']
 *   });
 *
 *   // Load context
 *   const context = await manager.loadContext('task-123');
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SessionContextManager {
  constructor(options = {}) {
    this.contextDir = options.contextDir || './.session-context';
    this.ttlDays = options.ttlDays || 7; // Default: 7 days
    this.maxContextSize = options.maxContextSize || 1048576; // 1MB default
  }

  /**
   * Save context for session/task
   *
   * @param {string} contextId - Unique identifier for context
   * @param {Object} context - Context data to save
   * @param {Object} options - Additional options
   * @returns {string} - Context ID
   */
  async saveContext(contextId, context, options = {}) {
    await fs.mkdir(this.contextDir, { recursive: true });

    const contextRecord = {
      id: contextId,
      context,
      timestamp: new Date().toISOString(),
      expiresAt: this._calculateExpiry(options.ttl),
      metadata: {
        type: options.type || 'general',
        priority: options.priority || 'normal',
        tags: options.tags || [],
        sessionId: options.sessionId || this._generateSessionId()
      },
      summary: options.summary || this._generateSummary(context)
    };

    // Validate size
    const contextStr = JSON.stringify(contextRecord);
    if (contextStr.length > this.maxContextSize) {
      throw new Error(`Context size (${contextStr.length}) exceeds maximum (${this.maxContextSize})`);
    }

    const filePath = path.join(this.contextDir, `${contextId}.json`);
    await fs.writeFile(filePath, contextStr);

    return contextId;
  }

  /**
   * Load context by ID
   *
   * @param {string} contextId - Context identifier
   * @returns {Object|null} - Context or null if not found/expired
   */
  async loadContext(contextId) {
    const filePath = path.join(this.contextDir, `${contextId}.json`);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const contextRecord = JSON.parse(data);

      // Check if expired
      if (this._isExpired(contextRecord)) {
        await this._cleanupContext(contextId);
        return null;
      }

      // Update last accessed time
      contextRecord.lastAccessed = new Date().toISOString();
      await fs.writeFile(filePath, JSON.stringify(contextRecord, null, 2));

      return contextRecord.context;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // Context not found
      }
      throw error;
    }
  }

  /**
   * List all contexts
   *
   * @param {Object} filters - Filter criteria
   * @returns {Array} - List of context summaries
   */
  async listContexts(filters = {}) {
    await fs.mkdir(this.contextDir, { recursive: true });

    const files = await fs.readdir(this.contextDir);
    const contexts = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(this.contextDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const contextRecord = JSON.parse(data);

        // Skip expired
        if (this._isExpired(contextRecord)) {
          await this._cleanupContext(contextRecord.id);
          continue;
        }

        // Apply filters
        if (this._matchesFilters(contextRecord, filters)) {
          contexts.push({
            id: contextRecord.id,
            timestamp: contextRecord.timestamp,
            type: contextRecord.metadata.type,
            priority: contextRecord.metadata.priority,
            tags: contextRecord.metadata.tags,
            summary: contextRecord.summary,
            expiresAt: contextRecord.expiresAt
          });
        }
      } catch (error) {
        console.error(`Error reading context ${file}:`, error.message);
      }
    }

    // Sort by timestamp (newest first)
    contexts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return contexts;
  }

  /**
   * Search contexts by keyword
   *
   * @param {string} keyword - Search keyword
   * @returns {Array} - Matching contexts
   */
  async searchContexts(keyword) {
    const allContexts = await this.listContexts();
    const lowerKeyword = keyword.toLowerCase();

    return allContexts.filter(ctx => {
      const searchable = JSON.stringify({
        id: ctx.id,
        summary: ctx.summary,
        tags: ctx.tags
      }).toLowerCase();

      return searchable.includes(lowerKeyword);
    });
  }

  /**
   * Generate context summary from data
   */
  _generateSummary(context) {
    // Extract key information for summary
    const summary = [];

    if (context.task) {
      summary.push(`Task: ${context.task}`);
    }

    if (context.progress) {
      summary.push(`Progress: ${context.progress}`);
    }

    if (context.status) {
      summary.push(`Status: ${context.status}`);
    }

    if (context.nextSteps && Array.isArray(context.nextSteps)) {
      summary.push(`Next: ${context.nextSteps.slice(0, 3).join(', ')}`);
    }

    return summary.join(' | ') || 'No summary available';
  }

  /**
   * Calculate expiry timestamp
   */
  _calculateExpiry(ttl = null) {
    const days = ttl !== null ? ttl : this.ttlDays;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    return expiry.toISOString();
  }

  /**
   * Check if context is expired
   */
  _isExpired(contextRecord) {
    const now = new Date();
    const expiry = new Date(contextRecord.expiresAt);
    return now > expiry;
  }

  /**
   * Check if context matches filters
   */
  _matchesFilters(contextRecord, filters) {
    if (filters.type && contextRecord.metadata.type !== filters.type) {
      return false;
    }

    if (filters.priority && contextRecord.metadata.priority !== filters.priority) {
      return false;
    }

    if (filters.tags && filters.tags.length > 0) {
      const hasTag = filters.tags.some(tag =>
        contextRecord.metadata.tags.includes(tag)
      );
      if (!hasTag) {
        return false;
      }
    }

    if (filters.sessionId && contextRecord.metadata.sessionId !== filters.sessionId) {
      return false;
    }

    return true;
  }

  /**
   * Generate unique session ID
   */
  _generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Delete context
   */
  async deleteContext(contextId) {
    await this._cleanupContext(contextId);
  }

  /**
   * Cleanup context file
   */
  async _cleanupContext(contextId) {
    const filePath = path.join(this.contextDir, `${contextId}.json`);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Cleanup expired contexts
   *
   * @returns {Object} - Cleanup stats
   */
  async cleanupExpired() {
    await fs.mkdir(this.contextDir, { recursive: true});

    const files = await fs.readdir(this.contextDir);
    let removed = 0;
    let errors = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(this.contextDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        const contextRecord = JSON.parse(data);

        if (this._isExpired(contextRecord)) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch (error) {
        errors++;
        console.error(`Error cleaning up ${file}:`, error.message);
      }
    }

    return { removed, errors };
  }

  /**
   * Get statistics
   *
   * @returns {Object} - Context statistics
   */
  async getStatistics() {
    await fs.mkdir(this.contextDir, { recursive: true });

    const files = await fs.readdir(this.contextDir);
    const contexts = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const data = await fs.readFile(path.join(this.contextDir, file), 'utf8');
        const contextRecord = JSON.parse(data);

        if (!this._isExpired(contextRecord)) {
          contexts.push(contextRecord);
        }
      } catch (error) {
        // Skip invalid contexts
      }
    }

    const stats = {
      total: contexts.length,
      byType: {},
      byPriority: {},
      averageAge: 0,
      oldestContext: null,
      newestContext: null
    };

    let totalAge = 0;

    contexts.forEach(ctx => {
      // Type counts
      const type = ctx.metadata.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // Priority counts
      const priority = ctx.metadata.priority || 'unknown';
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

      // Age calculation
      const age = Date.now() - new Date(ctx.timestamp).getTime();
      totalAge += age;

      // Oldest/newest
      if (!stats.oldestContext || ctx.timestamp < stats.oldestContext.timestamp) {
        stats.oldestContext = {
          id: ctx.id,
          timestamp: ctx.timestamp,
          age: Math.floor(age / (1000 * 60 * 60 * 24)) // days
        };
      }

      if (!stats.newestContext || ctx.timestamp > stats.newestContext.timestamp) {
        stats.newestContext = {
          id: ctx.id,
          timestamp: ctx.timestamp,
          age: Math.floor(age / (1000 * 60 * 60 * 24)) // days
        };
      }
    });

    stats.averageAge = contexts.length > 0 ? Math.floor((totalAge / contexts.length) / (1000 * 60 * 60 * 24)) : 0;

    return stats;
  }

  /**
   * Create session summary
   *
   * @param {string} sessionId - Session to summarize
   * @returns {Object} - Session summary
   */
  async createSessionSummary(sessionId) {
    const contexts = await this.listContexts({ sessionId });

    const summary = {
      sessionId,
      contextCount: contexts.length,
      startTime: contexts.length > 0 ? contexts[contexts.length - 1].timestamp : null,
      endTime: contexts.length > 0 ? contexts[0].timestamp : null,
      types: {},
      priorities: {},
      tags: new Set(),
      keyTasks: []
    };

    contexts.forEach(ctx => {
      // Count types
      summary.types[ctx.type] = (summary.types[ctx.type] || 0) + 1;

      // Count priorities
      summary.priorities[ctx.priority] = (summary.priorities[ctx.priority] || 0) + 1;

      // Collect tags
      ctx.tags.forEach(tag => summary.tags.add(tag));

      // Collect key tasks
      if (ctx.priority === 'high' || ctx.type === 'task') {
        summary.keyTasks.push({
          id: ctx.id,
          summary: ctx.summary,
          timestamp: ctx.timestamp
        });
      }
    });

    summary.tags = Array.from(summary.tags);

    return summary;
  }
}

// CLI interface
if (require.main === module) {
  const [,, command, ...args] = process.argv;

  const manager = new SessionContextManager();

  async function main() {
    switch (command) {
      case 'save':
        const contextId = args[0];
        const contextData = JSON.parse(args[1] || '{}');
        await manager.saveContext(contextId, contextData);
        console.log(`Context saved: ${contextId}`);
        break;

      case 'load':
        const id = args[0];
        const context = await manager.loadContext(id);
        if (context) {
          console.log(JSON.stringify(context, null, 2));
        } else {
          console.log('Context not found or expired');
        }
        break;

      case 'list':
        const contexts = await manager.listContexts();
        console.log(JSON.stringify(contexts, null, 2));
        break;

      case 'search':
        const keyword = args[0];
        const results = await manager.searchContexts(keyword);
        console.log(JSON.stringify(results, null, 2));
        break;

      case 'stats':
        const stats = await manager.getStatistics();
        console.log(JSON.stringify(stats, null, 2));
        break;

      case 'cleanup':
        const cleanupResult = await manager.cleanupExpired();
        console.log(`Cleaned up ${cleanupResult.removed} expired contexts (${cleanupResult.errors} errors)`);
        break;

      case 'summary':
        const sessionId = args[0];
        const sessionSummary = await manager.createSessionSummary(sessionId);
        console.log(JSON.stringify(sessionSummary, null, 2));
        break;

      default:
        console.log(`
Session Context Manager

Usage:
  node session-context-manager.js save <id> '<json>'    # Save context
  node session-context-manager.js load <id>             # Load context
  node session-context-manager.js list                  # List all contexts
  node session-context-manager.js search <keyword>      # Search contexts
  node session-context-manager.js stats                 # Show statistics
  node session-context-manager.js cleanup               # Cleanup expired
  node session-context-manager.js summary <session-id>  # Session summary

Examples:
  node session-context-manager.js save task-123 '{"task":"Deploy","progress":"50%"}'
  node session-context-manager.js load task-123
  node session-context-manager.js search "deploy"
  node session-context-manager.js stats
        `);
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { SessionContextManager };
