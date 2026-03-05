#!/usr/bin/env node

/**
 * Skill Context Builder - ACE Framework Agent Context Injection
 *
 * Builds formatted skill context for injection into agent prompts.
 * Enables agents to be skill-aware by providing relevant skill information
 * before task execution.
 *
 * Features:
 * - Complexity-gated context depth (LOW/MEDIUM/HIGH)
 * - Two-layer caching (memory + file)
 * - Graceful fallback on Supabase failure
 * - Task-relevant skill matching
 * - Agent-specific skill retrieval
 *
 * Usage:
 *   node skill-context-builder.js --agent sfdc-cpq-assessor --task "Run CPQ assessment" --format text
 *   node skill-context-builder.js --agent sfdc-revops-auditor --complexity 0.8 --format json
 *
 * @version 1.0.0
 * @date 2025-12-13
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Complexity gates determine context depth
  complexityGates: {
    LOW: { maxSkills: 3, includeHistory: false, includeTips: false, threshold: 0.5 },
    MEDIUM: { maxSkills: 5, includeHistory: true, includeTips: false, threshold: 0.7 },
    HIGH: { maxSkills: 8, includeHistory: true, includeTips: true, threshold: 1.0 }
  },

  // Cache settings
  CACHE_TTL: parseInt(process.env.SKILL_CONTEXT_CACHE_TTL) || 300, // 5 minutes
  CACHE_DIR: path.join(os.homedir(), '.claude', 'cache', 'ace-routing'),

  // Timeout for external calls
  MAX_LATENCY_MS: parseInt(process.env.SKILL_CONTEXT_MAX_LATENCY) || 500,

  // Fallback behavior
  FALLBACK_ON_ERROR: true,

  // Skill category keywords for task matching
  categoryKeywords: {
    assessment: ['audit', 'assessment', 'review', 'evaluate', 'analyze', 'check', 'cpq', 'revops'],
    deployment: ['deploy', 'release', 'push', 'publish', 'migrate', 'ship'],
    validation: ['validate', 'verify', 'check', 'pre-deploy', 'lint', 'test'],
    query: ['query', 'soql', 'report', 'dashboard', 'export', 'import', 'data'],
    automation: ['flow', 'trigger', 'workflow', 'process', 'automation', 'rule'],
    configuration: ['field', 'object', 'layout', 'permission', 'profile', 'configure'],
    troubleshooting: ['debug', 'fix', 'error', 'issue', 'troubleshoot', 'diagnose', 'log']
  }
};

// ============================================================================
// SKILL CONTEXT BUILDER CLASS
// ============================================================================

class SkillContextBuilder {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.agent = options.agent;
    this.task = options.task || '';
    this.complexity = parseFloat(options.complexity) || 0.5;
    this.format = options.format || 'text';
    this.category = options.category || this.detectCategory(this.task);

    // Ensure cache directory exists
    if (!fs.existsSync(CONFIG.CACHE_DIR)) {
      fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
    }

    this.log('Initialized', { agent: this.agent, complexity: this.complexity, category: this.category });
  }

  /**
   * Build skill context for injection
   * @returns {Object|string} Skill context (format depends on this.format)
   */
  async build() {
    const startTime = Date.now();

    try {
      // Determine complexity gate
      const gate = this.getComplexityGate();
      this.log(`Using complexity gate: ${gate.name}`, gate);

      // Check cache first
      const cached = this.getFromCache();
      if (cached) {
        this.log('Using cached context');
        return this.formatOutput(cached, startTime);
      }

      // Get agent skills
      const agentSkills = await this.getAgentSkills();
      this.log(`Found ${agentSkills.length} agent skills`);

      // Get task-relevant skills
      const taskSkills = await this.getTaskRelevantSkills();
      this.log(`Found ${taskSkills.length} task-relevant skills`);

      // Merge and dedupe skills
      const allSkills = this.mergeSkills(agentSkills, taskSkills, gate.maxSkills);

      // Build context object
      const context = {
        agentSkills: this.formatSkillsList(agentSkills.slice(0, Math.ceil(gate.maxSkills / 2))),
        taskSkills: this.formatSkillsList(taskSkills.slice(0, Math.ceil(gate.maxSkills / 2))),
        topSkills: allSkills.slice(0, gate.maxSkills),
        agentName: this.agent,
        category: this.category,
        complexity: this.complexity,
        gate: gate.name,
        includeHistory: gate.includeHistory,
        includeTips: gate.includeTips,
        timestamp: new Date().toISOString()
      };

      // Add historical success rate if gate allows
      if (gate.includeHistory && allSkills.length > 0) {
        context.historicalSuccessRate = this.calculateHistoricalSuccessRate(allSkills);
      }

      // Add tips if gate allows (Phase 2 feature)
      if (gate.includeTips) {
        context.tips = await this.getTips(allSkills);
      }

      // Cache the result
      this.saveToCache(context);

      return this.formatOutput(context, startTime);

    } catch (error) {
      this.log(`Error building context: ${error.message}`);

      if (CONFIG.FALLBACK_ON_ERROR) {
        return this.formatOutput(this.fallbackContext(), startTime);
      }
      throw error;
    }
  }

  /**
   * Determine complexity gate based on complexity score
   */
  getComplexityGate() {
    if (this.complexity >= CONFIG.complexityGates.HIGH.threshold - 0.3) {
      return { ...CONFIG.complexityGates.HIGH, name: 'HIGH' };
    } else if (this.complexity >= CONFIG.complexityGates.LOW.threshold) {
      return { ...CONFIG.complexityGates.MEDIUM, name: 'MEDIUM' };
    }
    return { ...CONFIG.complexityGates.LOW, name: 'LOW' };
  }

  /**
   * Detect task category from task description
   */
  detectCategory(task) {
    if (!task) return 'general';

    const taskLower = task.toLowerCase();

    for (const [category, keywords] of Object.entries(CONFIG.categoryKeywords)) {
      if (keywords.some(kw => taskLower.includes(kw))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Get skills for the specified agent
   */
  async getAgentSkills() {
    try {
      const registryPath = path.join(__dirname, 'strategy-registry.js');

      if (!fs.existsSync(registryPath)) {
        this.log('Strategy registry not found');
        return [];
      }

      const output = execSync(
        `node "${registryPath}" for-agent --agent "${this.agent}"`,
        {
          encoding: 'utf-8',
          timeout: CONFIG.MAX_LATENCY_MS,
          env: process.env
        }
      ).trim();

      if (!output) return [];

      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : parsed.skills || [];

    } catch (error) {
      this.log(`Error getting agent skills: ${error.message}`);

      // Try by-agent as fallback
      try {
        const registryPath = path.join(__dirname, 'strategy-registry.js');
        const output = execSync(
          `node "${registryPath}" by-agent --agent "${this.agent}"`,
          {
            encoding: 'utf-8',
            timeout: CONFIG.MAX_LATENCY_MS,
            env: process.env
          }
        ).trim();

        if (output) {
          const parsed = JSON.parse(output);
          return Array.isArray(parsed) ? parsed : parsed.skills || [];
        }
      } catch (fallbackError) {
        this.log(`Fallback also failed: ${fallbackError.message}`);
      }

      return [];
    }
  }

  /**
   * Get skills relevant to the task description
   */
  async getTaskRelevantSkills() {
    if (!this.task) return [];

    try {
      const registryPath = path.join(__dirname, 'strategy-registry.js');

      if (!fs.existsSync(registryPath)) {
        return [];
      }

      // Search by task keywords
      const searchTerms = this.extractSearchTerms(this.task);
      if (searchTerms.length === 0) return [];

      const output = execSync(
        `node "${registryPath}" search --query "${searchTerms.join(' ')}" --limit 10`,
        {
          encoding: 'utf-8',
          timeout: CONFIG.MAX_LATENCY_MS,
          env: process.env
        }
      ).trim();

      if (!output) return [];

      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
      this.log(`Error searching task skills: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract search terms from task description
   */
  extractSearchTerms(task) {
    const stopWords = new Set(['the', 'a', 'an', 'for', 'to', 'in', 'on', 'with', 'and', 'or', 'run', 'do', 'get', 'make']);
    const words = task.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return [...new Set(words)].slice(0, 5);
  }

  /**
   * Merge agent and task skills, dedupe, sort by relevance
   */
  mergeSkills(agentSkills, taskSkills, maxCount) {
    const seen = new Set();
    const merged = [];

    // Helper to add skill if not seen
    const addSkill = (skill) => {
      const id = skill.skill_id || skill.name;
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(skill);
      }
    };

    // Interleave agent and task skills for diversity
    const maxLen = Math.max(agentSkills.length, taskSkills.length);
    for (let i = 0; i < maxLen && merged.length < maxCount * 2; i++) {
      if (taskSkills[i]) addSkill(taskSkills[i]);
      if (agentSkills[i]) addSkill(agentSkills[i]);
    }

    // Sort by success rate (descending)
    merged.sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));

    return merged.slice(0, maxCount);
  }

  /**
   * Format skills list for display
   */
  formatSkillsList(skills) {
    return skills.map(s => ({
      id: s.skill_id || s.name,
      name: s.name,
      description: s.description || '',
      successRate: s.success_rate,
      usageCount: s.usage_count,
      confidence: s.confidence,
      category: s.category
    }));
  }

  /**
   * Calculate historical success rate from skills
   */
  calculateHistoricalSuccessRate(skills) {
    const validSkills = skills.filter(s =>
      typeof s.success_rate === 'number' &&
      typeof s.usage_count === 'number' &&
      s.usage_count > 0
    );

    if (validSkills.length === 0) return null;

    const totalUsage = validSkills.reduce((sum, s) => sum + s.usage_count, 0);
    const weightedSum = validSkills.reduce((sum, s) => sum + (s.success_rate * s.usage_count), 0);

    return totalUsage > 0 ? (weightedSum / totalUsage) : null;
  }

  /**
   * Get actionable tips from skill execution history (Phase 2)
   */
  async getTips(skills) {
    // Phase 2: Will query skill_executions for error patterns
    // For now, return static tips based on category
    const tips = [];

    if (this.category === 'deployment') {
      tips.push('Run validation before deploying to production');
    }
    if (this.category === 'assessment') {
      tips.push('Capture screenshots for evidence');
    }
    if (this.category === 'troubleshooting') {
      tips.push('Check debug logs for detailed error traces');
    }

    return tips;
  }

  /**
   * Format output based on format option
   */
  formatOutput(context, startTime) {
    const latencyMs = Date.now() - startTime;
    context.latencyMs = latencyMs;

    if (this.format === 'json') {
      return JSON.stringify(context, null, 2);
    }

    // Text format for injection
    return this.formatTextOutput(context);
  }

  /**
   * Format context as human-readable text for injection
   */
  formatTextOutput(context) {
    const lines = [];

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('SKILL CONTEXT (ACE Framework)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Relevant skills for task
    if (context.topSkills && context.topSkills.length > 0) {
      lines.push('');
      lines.push('Relevant Skills for this task:');
      for (const skill of context.topSkills.slice(0, 5)) {
        const successPct = skill.success_rate ? `${Math.round(skill.success_rate * 100)}% success` : 'new';
        const usageStr = skill.usage_count ? `${skill.usage_count} uses` : '';
        const statsStr = [successPct, usageStr].filter(Boolean).join(', ');
        lines.push(`  • ${skill.name || skill.skill_id} (${statsStr}) - ${skill.description || skill.category || ''}`);
      }
    }

    // Agent-specific skills
    if (context.agentSkills && context.agentSkills.length > 0) {
      lines.push('');
      lines.push(`Agent Skills (${context.agentName}):`);

      // Categorize by confidence
      const strengths = context.agentSkills.filter(s => (s.confidence || 0) >= 0.7);
      const monitor = context.agentSkills.filter(s => (s.confidence || 0) < 0.7 && (s.confidence || 0) > 0);

      if (strengths.length > 0) {
        const strengthNames = strengths.slice(0, 3).map(s => s.id || s.name).join(', ');
        lines.push(`  • Strengths: ${strengthNames}`);
      }

      if (monitor.length > 0) {
        const monitorItem = monitor[0];
        const confPct = monitorItem.confidence ? Math.round(monitorItem.confidence * 100) : '?';
        lines.push(`  • Monitor: ${monitorItem.id || monitorItem.name} (${confPct}% confidence - proceed carefully)`);
      }
    }

    // Historical success rate
    if (context.includeHistory && context.historicalSuccessRate) {
      lines.push('');
      const pct = Math.round(context.historicalSuccessRate * 100);
      lines.push(`Historical: This task type succeeds ${pct}% of the time with this agent.`);
    }

    // Tips (Phase 2)
    if (context.includeTips && context.tips && context.tips.length > 0) {
      lines.push('');
      lines.push('Tips:');
      for (const tip of context.tips.slice(0, 3)) {
        lines.push(`  → ${tip}`);
      }
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return lines.join('\n');
  }

  /**
   * Return fallback context when errors occur
   */
  fallbackContext() {
    return {
      agentSkills: [],
      taskSkills: [],
      topSkills: [],
      agentName: this.agent,
      category: this.category,
      complexity: this.complexity,
      gate: 'FALLBACK',
      includeHistory: false,
      includeTips: false,
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get cached context if valid
   */
  getFromCache() {
    const cacheKey = this.getCacheKey();
    const cachePath = path.join(CONFIG.CACHE_DIR, `context_${cacheKey}.json`);

    try {
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const stat = fs.statSync(cachePath);
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;

      if (ageSeconds > CONFIG.CACHE_TTL) {
        this.log('Cache expired');
        return null;
      }

      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      cached._cached = true;
      return cached;

    } catch (error) {
      this.log(`Cache read error: ${error.message}`);
      return null;
    }
  }

  /**
   * Save context to cache
   */
  saveToCache(context) {
    const cacheKey = this.getCacheKey();
    const cachePath = path.join(CONFIG.CACHE_DIR, `context_${cacheKey}.json`);

    try {
      fs.writeFileSync(cachePath, JSON.stringify(context, null, 2));
      this.log(`Cached to ${cachePath}`);
    } catch (error) {
      this.log(`Cache write error: ${error.message}`);
    }
  }

  /**
   * Generate cache key from parameters
   */
  getCacheKey() {
    const gate = this.getComplexityGate().name;
    return `${this.agent}_${this.category}_${gate}`.replace(/[^a-z0-9_]/gi, '_');
  }

  /**
   * Log message if verbose
   */
  log(message, data = null) {
    if (this.verbose) {
      if (data) {
        console.error(`[skill-context-builder] ${message}:`, JSON.stringify(data));
      } else {
        console.error(`[skill-context-builder] ${message}`);
      }
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function parseArgs(args) {
  const options = {
    agent: null,
    task: '',
    complexity: 0.5,
    category: null,
    format: 'text',
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--agent' && args[i + 1]) {
      options.agent = args[++i];
    } else if (arg === '--task' && args[i + 1]) {
      options.task = args[++i];
    } else if (arg === '--complexity' && args[i + 1]) {
      options.complexity = parseFloat(args[++i]);
    } else if (arg === '--category' && args[i + 1]) {
      options.category = args[++i];
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Skill Context Builder - ACE Framework Agent Context Injection

Builds formatted skill context for injection into agent prompts.
Enables agents to be skill-aware by providing relevant skill information.

Usage:
  node skill-context-builder.js --agent <name> [options]

Required:
  --agent <name>      Agent name to build context for

Options:
  --task <desc>       Task description for skill matching
  --complexity <n>    Complexity score 0.0-1.0 (default: 0.5)
  --category <name>   Override auto-detected category
  --format <type>     Output format: text (default), json
  --verbose, -v       Show debug output to stderr
  --help, -h          Show this help message

Complexity Gates:
  LOW    (< 0.5)      3 skills, no history, no tips
  MEDIUM (0.5-0.7)    5 skills, history included
  HIGH   (>= 0.7)     8 skills, history + tips

Categories:
  assessment          Audits, reviews, evaluations
  deployment          Deploys, releases, migrations
  validation          Pre-checks, verification
  query               SOQL, reports, dashboards
  automation          Flows, triggers, workflows
  configuration       Fields, objects, layouts
  troubleshooting     Debug, fix, diagnose

Examples:
  # Basic context for agent
  node skill-context-builder.js --agent sfdc-cpq-assessor

  # With task description
  node skill-context-builder.js --agent sfdc-cpq-assessor --task "Run CPQ assessment for hivemq"

  # High complexity (more context)
  node skill-context-builder.js --agent sfdc-revops-auditor --complexity 0.8 --format text

  # JSON output
  node skill-context-builder.js --agent sfdc-metadata-manager --format json

Environment Variables:
  SKILL_CONTEXT_CACHE_TTL    Cache TTL in seconds (default: 300)
  SKILL_CONTEXT_MAX_LATENCY  Max latency in ms (default: 500)
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.agent) {
    console.error('Error: --agent is required');
    console.error('Usage: node skill-context-builder.js --agent <name> [--task "<description>"]');
    process.exit(1);
  }

  try {
    const builder = new SkillContextBuilder(options);
    const output = await builder.build();
    console.log(output);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main();
}

module.exports = { SkillContextBuilder, CONFIG };
