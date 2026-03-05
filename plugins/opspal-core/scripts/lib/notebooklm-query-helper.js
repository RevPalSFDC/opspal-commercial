#!/usr/bin/env node

/**
 * NotebookLM Query Helper
 *
 * Utility for agents to query client notebooks efficiently.
 * Handles registry lookup, caching, budget tracking, and response parsing.
 *
 * @version 1.0.0
 * @date 2025-01-22
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  cacheTTLSeconds: parseInt(process.env.NOTEBOOKLM_CACHE_TTL || '3600', 10),
  dailyBudget: parseInt(process.env.NOTEBOOKLM_DAILY_QUERY_BUDGET || '50', 10),
  instancesPath: process.env.INSTANCES_PATH || 'instances',
  budgetAllocation: {
    P0: 15, // Assessment context loading
    P1: 10, // Cross-assessment insights
    P2: 15, // On-demand queries
    P3: 5,  // Briefing generation
    reserve: 5
  }
};

/**
 * Main QueryHelper class
 */
class NotebookLMQueryHelper {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.registryPath = this.findRegistryPath();
    this.registry = this.loadRegistry();
    this.cachePath = this.getCachePath();
    this.cache = this.loadCache();
  }

  /**
   * Find the notebook registry for this org
   */
  findRegistryPath() {
    const possiblePaths = [
      path.join(CONFIG.instancesPath, this.orgAlias, 'notebooklm', 'notebook-registry.json'),
      path.join(CONFIG.instancesPath, 'salesforce', this.orgAlias, 'notebooklm', 'notebook-registry.json'),
      path.join('orgs', this.orgAlias, 'notebooklm', 'notebook-registry.json')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Load notebook registry
   */
  loadRegistry() {
    if (!this.registryPath || !fs.existsSync(this.registryPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
    } catch (e) {
      console.error(`Failed to load registry: ${e.message}`);
      return null;
    }
  }

  /**
   * Get cache file path
   */
  getCachePath() {
    if (!this.registryPath) return null;
    return path.join(path.dirname(this.registryPath), 'query-cache.json');
  }

  /**
   * Load query cache
   */
  loadCache() {
    if (!this.cachePath || !fs.existsSync(this.cachePath)) {
      return {
        version: '1.0.0',
        queries: [],
        budget: this.initializeBudget(),
        stats: {
          totalQueries: 0,
          cacheHits: 0,
          cacheMisses: 0
        }
      };
    }

    try {
      const cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
      // Reset budget if new day
      if (this.isNewDay(cache.budget?.date)) {
        cache.budget = this.initializeBudget();
      }
      return cache;
    } catch (e) {
      return {
        version: '1.0.0',
        queries: [],
        budget: this.initializeBudget(),
        stats: { totalQueries: 0, cacheHits: 0, cacheMisses: 0 }
      };
    }
  }

  /**
   * Initialize daily budget
   */
  initializeBudget() {
    return {
      date: new Date().toISOString().split('T')[0],
      used: 0,
      remaining: CONFIG.dailyBudget,
      byPriority: {
        P0: 0,
        P1: 0,
        P2: 0,
        P3: 0
      }
    };
  }

  /**
   * Check if it's a new day
   */
  isNewDay(lastDate) {
    if (!lastDate) return true;
    const today = new Date().toISOString().split('T')[0];
    return lastDate !== today;
  }

  /**
   * Save cache to disk
   */
  saveCache() {
    if (!this.cachePath) return;

    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (e) {
      console.error(`Failed to save cache: ${e.message}`);
    }
  }

  /**
   * Generate cache key for a query
   */
  getCacheKey(question) {
    const normalized = question.toLowerCase().trim();
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Check cache for existing response
   */
  checkCache(question) {
    const key = this.getCacheKey(question);
    const cached = this.cache.queries.find(q => q.key === key);

    if (!cached) return null;

    // Check if expired
    const age = Date.now() - new Date(cached.timestamp).getTime();
    if (age > CONFIG.cacheTTLSeconds * 1000) {
      // Remove expired entry
      this.cache.queries = this.cache.queries.filter(q => q.key !== key);
      return null;
    }

    return cached.response;
  }

  /**
   * Add response to cache
   */
  addToCache(question, response) {
    const key = this.getCacheKey(question);

    // Remove existing entry if present
    this.cache.queries = this.cache.queries.filter(q => q.key !== key);

    // Add new entry
    this.cache.queries.push({
      key,
      question,
      response,
      timestamp: new Date().toISOString()
    });

    // Limit cache size (keep last 100 queries)
    if (this.cache.queries.length > 100) {
      this.cache.queries = this.cache.queries.slice(-100);
    }

    this.saveCache();
  }

  /**
   * Check if budget allows query
   */
  canQuery(priority = 'P2') {
    if (this.cache.budget.remaining <= 0) {
      return { allowed: false, reason: 'Daily budget exhausted' };
    }

    const priorityBudget = CONFIG.budgetAllocation[priority] || 0;
    const priorityUsed = this.cache.budget.byPriority[priority] || 0;

    if (priorityUsed >= priorityBudget) {
      // Check if we can borrow from reserve
      const reserveRemaining = CONFIG.budgetAllocation.reserve -
        (this.cache.budget.byPriority.reserve || 0);
      if (reserveRemaining > 0) {
        return { allowed: true, fromReserve: true };
      }
      return { allowed: false, reason: `${priority} budget exhausted` };
    }

    return { allowed: true, fromReserve: false };
  }

  /**
   * Deduct from budget
   */
  deductBudget(priority = 'P2', fromReserve = false) {
    this.cache.budget.used++;
    this.cache.budget.remaining--;

    if (fromReserve) {
      this.cache.budget.byPriority.reserve =
        (this.cache.budget.byPriority.reserve || 0) + 1;
    } else {
      this.cache.budget.byPriority[priority] =
        (this.cache.budget.byPriority[priority] || 0) + 1;
    }

    this.saveCache();
  }

  /**
   * Get primary notebook ID
   */
  getNotebookId() {
    if (!this.registry || !this.registry.notebooks?.primary) {
      return null;
    }
    return this.registry.notebooks.primary.notebookId;
  }

  /**
   * Query client context
   *
   * @param {string} question - Natural language question
   * @param {Object} options - Query options
   * @returns {Object} Query response with answer and sources
   */
  async queryContext(question, options = {}) {
    const {
      priority = 'P2',
      skipCache = false,
      timeout = 120000
    } = options;

    // Check registry exists
    if (!this.registry) {
      return {
        success: false,
        error: `No notebook registry found for org: ${this.orgAlias}`,
        suggestion: `Run '/notebook-init ${this.orgAlias}' to create a knowledge base`
      };
    }

    // Check cache first (unless skipped)
    if (!skipCache) {
      const cached = this.checkCache(question);
      if (cached) {
        this.cache.stats.cacheHits++;
        this.saveCache();
        return {
          success: true,
          answer: cached.answer,
          sources: cached.sources,
          confidence: cached.confidence,
          fromCache: true,
          cacheAge: this.getCacheAge(question)
        };
      }
    }

    // Check budget
    const budgetCheck = this.canQuery(priority);
    if (!budgetCheck.allowed) {
      return {
        success: false,
        error: budgetCheck.reason,
        suggestion: 'Try again tomorrow or use cached queries',
        budgetStatus: this.getBudgetStatus()
      };
    }

    // Get notebook ID
    const notebookId = this.getNotebookId();
    if (!notebookId) {
      return {
        success: false,
        error: 'No primary notebook configured',
        suggestion: 'Initialize the notebook first'
      };
    }

    // Return query parameters for MCP execution
    // (Actual MCP call will be made by the calling agent)
    this.cache.stats.cacheMisses++;
    this.cache.stats.totalQueries++;
    this.deductBudget(priority, budgetCheck.fromReserve);

    return {
      success: true,
      action: 'execute_query',
      notebookId,
      question,
      timeout,
      priority,
      budgetStatus: this.getBudgetStatus(),
      // Callback to cache the response
      onResponse: (response) => this.handleQueryResponse(question, response)
    };
  }

  /**
   * Handle query response (cache it)
   */
  handleQueryResponse(question, response) {
    if (response && response.answer) {
      this.addToCache(question, {
        answer: response.answer,
        sources: response.sources || [],
        confidence: response.confidence || 0.8
      });
    }
  }

  /**
   * Get cache age for a question
   */
  getCacheAge(question) {
    const key = this.getCacheKey(question);
    const cached = this.cache.queries.find(q => q.key === key);
    if (!cached) return null;

    const ageMs = Date.now() - new Date(cached.timestamp).getTime();
    return Math.round(ageMs / 1000); // Return seconds
  }

  /**
   * Get budget status
   */
  getBudgetStatus() {
    return {
      date: this.cache.budget.date,
      total: CONFIG.dailyBudget,
      used: this.cache.budget.used,
      remaining: this.cache.budget.remaining,
      byPriority: this.cache.budget.byPriority,
      allocation: CONFIG.budgetAllocation
    };
  }

  /**
   * Get query statistics
   */
  getStats() {
    return {
      ...this.cache.stats,
      cacheHitRate: this.cache.stats.totalQueries > 0
        ? (this.cache.stats.cacheHits / this.cache.stats.totalQueries * 100).toFixed(1) + '%'
        : 'N/A',
      cachedQueries: this.cache.queries.length,
      budget: this.getBudgetStatus()
    };
  }

  /**
   * Batch related questions into single query
   */
  batchQuestions(questions) {
    // Combine multiple questions into one comprehensive query
    const combined = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
    return `Please answer the following questions:\n\n${combined}\n\nProvide numbered responses.`;
  }

  /**
   * Parse batched response into individual answers
   */
  parseBatchedResponse(response, questionCount) {
    if (!response || !response.answer) return [];

    const answer = response.answer;
    const answers = [];

    // Try to parse numbered responses
    for (let i = 1; i <= questionCount; i++) {
      const pattern = new RegExp(`${i}\\.\\s*([\\s\\S]*?)(?=${i + 1}\\.|$)`, 'i');
      const match = answer.match(pattern);
      if (match) {
        answers.push({
          questionNumber: i,
          answer: match[1].trim(),
          sources: response.sources || []
        });
      }
    }

    // Fallback: return full answer for all questions
    if (answers.length === 0) {
      for (let i = 1; i <= questionCount; i++) {
        answers.push({
          questionNumber: i,
          answer: answer,
          sources: response.sources || []
        });
      }
    }

    return answers;
  }

  /**
   * Clear cache for this org
   */
  clearCache() {
    this.cache.queries = [];
    this.cache.stats.cacheHits = 0;
    this.cache.stats.cacheMisses = 0;
    this.saveCache();
  }

  /**
   * Pre-warm cache with common questions
   */
  getPreWarmQuestions() {
    return [
      'What are the current top priorities for this client?',
      'What were the key findings from the most recent assessment?',
      'What recommendations have been made but not yet implemented?',
      'What are the known blockers or challenges?',
      'What is the client\'s current state summary?'
    ];
  }
}

/**
 * Factory function to create helper instance
 */
function createQueryHelper(orgAlias) {
  return new NotebookLMQueryHelper(orgAlias);
}

/**
 * Quick query function for simple use cases
 */
async function quickQuery(orgAlias, question, options = {}) {
  const helper = new NotebookLMQueryHelper(orgAlias);
  return helper.queryContext(question, options);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const commands = {
    'query': async () => {
      const orgAlias = args[1];
      const question = args.slice(2).join(' ');

      if (!orgAlias || !question) {
        console.error('Usage: query <org-alias> <question>');
        process.exit(1);
      }

      const helper = new NotebookLMQueryHelper(orgAlias);
      const result = await helper.queryContext(question);
      console.log(JSON.stringify(result, null, 2));
    },

    'status': () => {
      const orgAlias = args[1];

      if (!orgAlias) {
        console.error('Usage: status <org-alias>');
        process.exit(1);
      }

      const helper = new NotebookLMQueryHelper(orgAlias);
      console.log(JSON.stringify(helper.getStats(), null, 2));
    },

    'budget': () => {
      const orgAlias = args[1];

      if (!orgAlias) {
        console.error('Usage: budget <org-alias>');
        process.exit(1);
      }

      const helper = new NotebookLMQueryHelper(orgAlias);
      console.log(JSON.stringify(helper.getBudgetStatus(), null, 2));
    },

    'clear-cache': () => {
      const orgAlias = args[1];

      if (!orgAlias) {
        console.error('Usage: clear-cache <org-alias>');
        process.exit(1);
      }

      const helper = new NotebookLMQueryHelper(orgAlias);
      helper.clearCache();
      console.log(`Cache cleared for ${orgAlias}`);
    },

    'help': () => {
      console.log(`
NotebookLM Query Helper

Commands:
  query <org> <question>    Query client notebook
  status <org>              Show query statistics
  budget <org>              Show budget status
  clear-cache <org>         Clear query cache
  help                      Show this help

Examples:
  node notebooklm-query-helper.js query eta-corp "What were the CPQ findings?"
  node notebooklm-query-helper.js status eta-corp
  node notebooklm-query-helper.js budget eta-corp
`);
    }
  };

  const handler = commands[command] || commands['help'];
  Promise.resolve(handler()).catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}

// Exports
module.exports = {
  NotebookLMQueryHelper,
  createQueryHelper,
  quickQuery,
  CONFIG
};
