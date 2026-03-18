#!/usr/bin/env node

/**
 * Adaptive Routing Engine
 *
 * Purpose: Learn from Task tool results to optimize agent routing decisions.
 * Consumes metrics from Task results (token_count, tool_uses, duration_ms)
 * to adjust routing weights based on actual performance.
 *
 * Features:
 * - Real performance profiles per agent (tokens, duration, tool efficiency)
 * - Learned routing weights that adjust over time
 * - Confidence-based agent selection
 * - Integration with ROI tracker for validation
 * - Fallback to baseline when confidence is low
 *
 * Usage:
 *   const { AdaptiveRoutingEngine } = require('./adaptive-routing-engine');
 *
 *   const engine = new AdaptiveRoutingEngine();
 *
 *   // Record task completion
 *   engine.recordTaskResult('sfdc-revops-auditor', {
 *     token_count: 15000,
 *     tool_uses: 42,
 *     duration_ms: 180000,
 *     success: true
 *   });
 *
 *   // Get best agent for task
 *   const recommendation = engine.recommendAgent('revops audit');
 *
 * @module adaptive-routing-engine
 * @version 1.0.0
 * @created 2026-02-04
 */

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATA_DIR = path.join(__dirname, '../../data');

// ORG_SLUG-scoped state files: when set, routing learns per-client.
// Without ORG_SLUG, falls back to the shared global state file.
function resolveStateFile(filename) {
  const orgSlug = process.env.ORG_SLUG;
  if (orgSlug) {
    const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
    const orgDir = path.join(projectRoot, 'orgs', orgSlug, 'platforms', 'routing');
    return path.join(orgDir, filename);
  }
  return path.join(DATA_DIR, filename);
}

const STATE_FILE = resolveStateFile('adaptive-routing.json');
const METRICS_FILE = resolveStateFile('agent-metrics.json');

// Minimum samples before trusting learned weights
const MIN_SAMPLES_FOR_CONFIDENCE = 5;

// Weight decay factor (recent results weighted more heavily)
const DECAY_FACTOR = 0.9;

// Performance score weights
const SCORE_WEIGHTS = {
  success_rate: 0.4,        // Most important: did it work?
  token_efficiency: 0.25,   // Lower tokens = better
  time_efficiency: 0.2,     // Faster = better
  tool_efficiency: 0.15     // Fewer tool calls = better
};

// Cost per million tokens by model tier (input + output blended estimate)
const COST_PER_MILLION_TOKENS = {
  haiku: 0.25,
  sonnet: 3.00,
  opus: 15.00
};

// Baseline performance expectations (for new agents)
const BASELINE_EXPECTATIONS = {
  avg_tokens: 20000,
  avg_duration_ms: 300000,  // 5 minutes
  avg_tool_uses: 50,
  success_rate: 0.8
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(filepath, defaultValue) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.warn(`Warning: Could not load ${filepath}: ${e.message}`);
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  ensureDataDir();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

// =============================================================================
// ADAPTIVE ROUTING ENGINE
// =============================================================================

class AdaptiveRoutingEngine {
  constructor(options = {}) {
    this.stateFile = options.stateFile || STATE_FILE;
    this.metricsFile = options.metricsFile || METRICS_FILE;

    // Load persisted state
    this.state = loadJSON(this.stateFile, {
      agents: {},
      routing_keywords: {},
      last_updated: null,
      version: '1.0.0'
    });

    this.metrics = loadJSON(this.metricsFile, {
      task_results: [],
      hourly_aggregates: {},
      daily_aggregates: {}
    });

    // Initialize keyword → agent mapping from existing routing
    this._initializeKeywordMapping();
  }

  /**
   * Initialize keyword to agent mapping
   */
  _initializeKeywordMapping() {
    // Default mappings from CLAUDE.md routing table
    const defaultMappings = {
      'revops': ['sfdc-revops-auditor', 'sfdc-revops-coordinator'],
      'pipeline': ['sfdc-revops-auditor', 'web-viz-generator'],
      'cpq': ['sfdc-cpq-assessor'],
      'quote': ['sfdc-cpq-assessor'],
      'pricing': ['sfdc-cpq-assessor'],
      'automation audit': ['sfdc-automation-auditor'],
      'flow audit': ['sfdc-automation-auditor'],
      'permission': ['sfdc-permission-orchestrator', 'sfdc-permission-assessor'],
      'report': ['sfdc-reports-dashboards', 'revops-reporting-assistant'],
      'dashboard': ['sfdc-reports-dashboards', 'web-viz-generator'],
      'territory': ['sfdc-territory-orchestrator'],
      'deploy': ['sfdc-deployment-manager', 'release-coordinator'],
      'hubspot': ['hubspot-orchestrator', 'hubspot-data-operations-manager'],
      'marketo': ['marketo-orchestrator', 'marketo-automation-orchestrator'],
      'diagram': ['diagram-generator'],
      'data import': ['sfdc-data-operations', 'sfdc-data-import-manager'],
      'data export': ['sfdc-data-operations', 'sfdc-data-export-manager'],
      'upsert': ['sfdc-upsert-orchestrator'],
      'validation rule': ['validation-rule-orchestrator'],
      'trigger': ['trigger-orchestrator'],
      'apex': ['sfdc-apex-developer', 'sfdc-apex']
    };

    // Merge with persisted routing keywords
    this.state.routing_keywords = {
      ...defaultMappings,
      ...this.state.routing_keywords
    };
  }

  /**
   * Record a Task tool result with metrics
   *
   * @param {string} agentName - The agent that executed the task
   * @param {object} metrics - Task result metrics
   * @param {number} metrics.token_count - Tokens used
   * @param {number} metrics.tool_uses - Number of tool invocations
   * @param {number} metrics.duration_ms - Duration in milliseconds
   * @param {boolean} metrics.success - Whether task completed successfully
   * @param {string} [metrics.task_type] - Optional task classification
   */
  recordTaskResult(agentName, metrics) {
    const timestamp = new Date().toISOString();

    // Initialize agent profile if needed
    if (!this.state.agents[agentName]) {
      this.state.agents[agentName] = {
        samples: 0,
        total_tokens: 0,
        total_duration_ms: 0,
        total_tool_uses: 0,
        successes: 0,
        failures: 0,
        avg_tokens: null,
        avg_duration_ms: null,
        avg_tool_uses: null,
        success_rate: null,
        performance_score: null,
        confidence: 0,
        last_used: null,
        history: []
      };
    }

    const agent = this.state.agents[agentName];

    // Update running totals with decay
    if (agent.samples > 0) {
      agent.total_tokens = agent.total_tokens * DECAY_FACTOR + (metrics.token_count || 0);
      agent.total_duration_ms = agent.total_duration_ms * DECAY_FACTOR + (metrics.duration_ms || 0);
      agent.total_tool_uses = agent.total_tool_uses * DECAY_FACTOR + (metrics.tool_uses || 0);
      agent.successes = agent.successes * DECAY_FACTOR + (metrics.success ? 1 : 0);
      agent.failures = agent.failures * DECAY_FACTOR + (metrics.success ? 0 : 1);
    } else {
      agent.total_tokens = metrics.token_count || 0;
      agent.total_duration_ms = metrics.duration_ms || 0;
      agent.total_tool_uses = metrics.tool_uses || 0;
      agent.successes = metrics.success ? 1 : 0;
      agent.failures = metrics.success ? 0 : 1;
    }

    agent.samples++;
    agent.last_used = timestamp;

    // Calculate averages
    const effectiveSamples = Math.min(agent.samples, 1 / (1 - DECAY_FACTOR));
    agent.avg_tokens = Math.round(agent.total_tokens / effectiveSamples);
    agent.avg_duration_ms = Math.round(agent.total_duration_ms / effectiveSamples);
    agent.avg_tool_uses = Math.round(agent.total_tool_uses / effectiveSamples);
    agent.success_rate = (agent.successes / (agent.successes + agent.failures));

    // Calculate confidence (0-1 based on sample size)
    agent.confidence = Math.min(1, agent.samples / MIN_SAMPLES_FOR_CONFIDENCE);

    // Calculate performance score
    agent.performance_score = this._calculatePerformanceScore(agent);

    // Keep limited history (last 20)
    agent.history.push({
      timestamp,
      tokens: metrics.token_count,
      duration_ms: metrics.duration_ms,
      tool_uses: metrics.tool_uses,
      success: metrics.success,
      task_type: metrics.task_type
    });
    if (agent.history.length > 20) {
      agent.history.shift();
    }

    // Calculate estimated cost if model tier is available
    const estimatedCost = metrics.token_count
      ? this.estimateCost(metrics.token_count, metrics.model_tier)
      : null;

    // Record to metrics file for time-series analysis
    this.metrics.task_results.push({
      timestamp,
      agent: agentName,
      estimated_cost: estimatedCost,
      ...metrics
    });

    // Keep last 1000 results
    if (this.metrics.task_results.length > 1000) {
      this.metrics.task_results = this.metrics.task_results.slice(-1000);
    }

    // Update aggregates
    this._updateAggregates(agentName, metrics, timestamp);

    // Persist
    this.state.last_updated = timestamp;
    this._save();

    return {
      agent: agentName,
      new_score: agent.performance_score,
      confidence: agent.confidence,
      samples: agent.samples
    };
  }

  /**
   * Calculate performance score (0-100)
   */
  _calculatePerformanceScore(agent) {
    // Success rate component (0-1)
    const successScore = agent.success_rate || 0;

    // Token efficiency (lower is better, normalized against baseline)
    const tokenScore = agent.avg_tokens
      ? Math.max(0, 1 - (agent.avg_tokens / BASELINE_EXPECTATIONS.avg_tokens - 0.5))
      : 0.5;

    // Time efficiency (lower is better, normalized against baseline)
    const timeScore = agent.avg_duration_ms
      ? Math.max(0, 1 - (agent.avg_duration_ms / BASELINE_EXPECTATIONS.avg_duration_ms - 0.5))
      : 0.5;

    // Tool efficiency (fewer calls is better, normalized against baseline)
    const toolScore = agent.avg_tool_uses
      ? Math.max(0, 1 - (agent.avg_tool_uses / BASELINE_EXPECTATIONS.avg_tool_uses - 0.5))
      : 0.5;

    // Weighted combination
    const score =
      SCORE_WEIGHTS.success_rate * successScore +
      SCORE_WEIGHTS.token_efficiency * tokenScore +
      SCORE_WEIGHTS.time_efficiency * timeScore +
      SCORE_WEIGHTS.tool_efficiency * toolScore;

    return Math.round(score * 100);
  }

  /**
   * Update hourly/daily aggregates
   */
  _updateAggregates(agentName, metrics, timestamp) {
    const date = timestamp.slice(0, 10);
    const hour = timestamp.slice(0, 13);

    // Hourly
    if (!this.metrics.hourly_aggregates[hour]) {
      this.metrics.hourly_aggregates[hour] = {};
    }
    if (!this.metrics.hourly_aggregates[hour][agentName]) {
      this.metrics.hourly_aggregates[hour][agentName] = {
        count: 0, tokens: 0, duration_ms: 0, successes: 0
      };
    }
    const hourly = this.metrics.hourly_aggregates[hour][agentName];
    hourly.count++;
    hourly.tokens += metrics.token_count || 0;
    hourly.duration_ms += metrics.duration_ms || 0;
    hourly.successes += metrics.success ? 1 : 0;

    // Daily
    if (!this.metrics.daily_aggregates[date]) {
      this.metrics.daily_aggregates[date] = {};
    }
    if (!this.metrics.daily_aggregates[date][agentName]) {
      this.metrics.daily_aggregates[date][agentName] = {
        count: 0, tokens: 0, duration_ms: 0, successes: 0
      };
    }
    const daily = this.metrics.daily_aggregates[date][agentName];
    daily.count++;
    daily.tokens += metrics.token_count || 0;
    daily.duration_ms += metrics.duration_ms || 0;
    daily.successes += metrics.success ? 1 : 0;

    // Cleanup old aggregates (keep 7 days)
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const date of Object.keys(this.metrics.daily_aggregates)) {
      if (date < cutoffDate) {
        delete this.metrics.daily_aggregates[date];
      }
    }
    for (const hour of Object.keys(this.metrics.hourly_aggregates)) {
      if (hour.slice(0, 10) < cutoffDate) {
        delete this.metrics.hourly_aggregates[hour];
      }
    }
  }

  /**
   * Get recommended effort level based on complexity score.
   * Maps complexity rubric scores to adaptive thinking effort levels.
   *
   * @param {number} complexityScore - Task complexity score (0-8+)
   * @returns {object} Effort recommendation
   */
  getEffortRecommendation(complexityScore) {
    if (complexityScore <= 2) {
      return { effort: 'low', description: 'Simple tasks - minimal thinking needed', complexity_score: complexityScore };
    } else if (complexityScore <= 4) {
      return { effort: 'medium', description: 'Moderate tasks - balanced thinking', complexity_score: complexityScore };
    } else if (complexityScore <= 6) {
      return { effort: 'high', description: 'Complex tasks - extended thinking recommended', complexity_score: complexityScore };
    } else {
      return { effort: 'max', description: 'Highly complex tasks - maximum thinking required', complexity_score: complexityScore };
    }
  }

  /**
   * Estimate cost for a task based on token count and model tier.
   *
   * @param {number} tokenCount - Total tokens used
   * @param {string} [modelTier='sonnet'] - Model tier: 'haiku', 'sonnet', or 'opus'
   * @returns {number} Estimated cost in USD
   */
  estimateCost(tokenCount, modelTier = 'sonnet') {
    const rate = COST_PER_MILLION_TOKENS[modelTier] || COST_PER_MILLION_TOKENS.sonnet;
    return Math.round((tokenCount / 1_000_000) * rate * 10000) / 10000;
  }

  /**
   * Recommend best agent for a task based on learned performance
   *
   * @param {string} taskDescription - Natural language task description
   * @param {object} [options] - Options
   * @param {boolean} [options.preferConfident=true] - Prefer agents with more samples
   * @returns {object} Recommendation with agent, score, and alternatives
   */
  recommendAgent(taskDescription, options = {}) {
    const { preferConfident = true } = options;

    // Find matching keywords
    const lowerDesc = taskDescription.toLowerCase();
    const matchedAgents = new Set();

    for (const [keyword, agents] of Object.entries(this.state.routing_keywords)) {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        agents.forEach(a => matchedAgents.add(a));
      }
    }

    if (matchedAgents.size === 0) {
      return {
        agent: null,
        score: 0,
        confidence: 0,
        reason: 'No keyword match found',
        alternatives: []
      };
    }

    // Score and rank matched agents
    const scored = Array.from(matchedAgents).map(agentName => {
      const agent = this.state.agents[agentName];

      if (!agent) {
        // No performance data - use baseline
        return {
          agent: agentName,
          score: 50,
          confidence: 0,
          samples: 0,
          reason: 'Baseline (no performance data)'
        };
      }

      let effectiveScore = agent.performance_score;

      // Boost score for high-confidence agents if preferred
      if (preferConfident && agent.confidence > 0.5) {
        effectiveScore = effectiveScore * (1 + 0.1 * agent.confidence);
      }

      // Slight penalty for agents not used recently (> 7 days)
      if (agent.last_used) {
        const daysSinceUse = (Date.now() - new Date(agent.last_used).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUse > 7) {
          effectiveScore *= 0.95;
        }
      }

      return {
        agent: agentName,
        score: Math.round(effectiveScore),
        confidence: agent.confidence,
        samples: agent.samples,
        avg_duration_sec: agent.avg_duration_ms ? Math.round(agent.avg_duration_ms / 1000) : null,
        success_rate: agent.success_rate ? `${Math.round(agent.success_rate * 100)}%` : null,
        reason: agent.confidence >= 0.5 ? 'Learned from performance data' : 'Limited data'
      };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];

    // Estimate effort based on keyword complexity heuristic
    let keywordMatchCount = 0;
    for (const keyword of Object.keys(this.state.routing_keywords)) {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        keywordMatchCount++;
      }
    }
    const estimatedComplexity = Math.min(8, keywordMatchCount * 2);
    const effortRec = this.getEffortRecommendation(estimatedComplexity);

    return {
      agent: best.agent,
      score: best.score,
      confidence: best.confidence,
      reason: best.reason,
      avg_duration_sec: best.avg_duration_sec,
      success_rate: best.success_rate,
      effort: effortRec.effort,
      effort_description: effortRec.description,
      alternatives: scored.slice(1, 4).map(s => ({
        agent: s.agent,
        score: s.score,
        confidence: s.confidence
      }))
    };
  }

  /**
   * Get agent performance profile
   */
  getAgentProfile(agentName) {
    const agent = this.state.agents[agentName];

    if (!agent) {
      return {
        agent: agentName,
        status: 'no_data',
        message: 'No performance data recorded'
      };
    }

    return {
      agent: agentName,
      status: 'active',
      samples: agent.samples,
      confidence: agent.confidence,
      performance_score: agent.performance_score,
      success_rate: agent.success_rate,
      averages: {
        tokens: agent.avg_tokens,
        duration_sec: agent.avg_duration_ms ? Math.round(agent.avg_duration_ms / 1000) : null,
        tool_uses: agent.avg_tool_uses
      },
      last_used: agent.last_used,
      recent_history: agent.history.slice(-5)
    };
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const agents = Object.entries(this.state.agents)
      .map(([name, data]) => ({
        name,
        score: data.performance_score,
        confidence: data.confidence,
        samples: data.samples,
        success_rate: data.success_rate,
        avg_tokens: data.avg_tokens,
        avg_duration_sec: data.avg_duration_ms ? Math.round(data.avg_duration_ms / 1000) : null,
        last_used: data.last_used
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    // Calculate ROI validation metrics
    const totalSamples = agents.reduce((sum, a) => sum + (a.samples || 0), 0);
    const avgScore = agents.length > 0
      ? Math.round(agents.reduce((sum, a) => sum + (a.score || 0), 0) / agents.length)
      : 0;

    // Token savings estimate (compared to baseline)
    const tokensUsed = agents.reduce((sum, a) => sum + ((a.avg_tokens || 0) * (a.samples || 0)), 0);
    const baselineTokens = totalSamples * BASELINE_EXPECTATIONS.avg_tokens;
    const tokenSavings = Math.max(0, baselineTokens - tokensUsed);

    // Time savings estimate
    const timeUsed = agents.reduce((sum, a) => sum + ((a.avg_duration_sec || 0) * (a.samples || 0)), 0);
    const baselineTime = totalSamples * (BASELINE_EXPECTATIONS.avg_duration_ms / 1000);
    const timeSavingsSec = Math.max(0, baselineTime - timeUsed);

    return {
      generated_at: new Date().toISOString(),
      summary: {
        total_agents_tracked: agents.length,
        total_task_samples: totalSamples,
        average_performance_score: avgScore,
        token_savings_estimate: tokenSavings,
        time_savings_estimate_sec: Math.round(timeSavingsSec),
        time_savings_estimate_hours: Math.round(timeSavingsSec / 360) / 10
      },
      top_performers: agents.filter(a => a.confidence >= 0.5).slice(0, 10),
      needs_more_data: agents.filter(a => a.confidence < 0.5 && a.samples > 0),
      all_agents: agents
    };
  }

  /**
   * Generate cost breakdown report by agent and model tier
   */
  generateCostReport() {
    const agentCosts = {};
    const tierTotals = { haiku: 0, sonnet: 0, opus: 0, unknown: 0 };

    for (const result of this.metrics.task_results) {
      const agent = result.agent || 'unknown';
      const tier = result.model_tier || 'sonnet';
      const tokens = result.token_count || 0;
      const cost = result.estimated_cost || this.estimateCost(tokens, tier);

      if (!agentCosts[agent]) {
        agentCosts[agent] = { tasks: 0, tokens: 0, cost: 0, model_tier: tier };
      }
      agentCosts[agent].tasks++;
      agentCosts[agent].tokens += tokens;
      agentCosts[agent].cost += cost;

      if (tierTotals[tier] !== undefined) {
        tierTotals[tier] += cost;
      } else {
        tierTotals.unknown += cost;
      }
    }

    const sortedAgents = Object.entries(agentCosts)
      .map(([name, data]) => ({ name, ...data, cost: Math.round(data.cost * 10000) / 10000 }))
      .sort((a, b) => b.cost - a.cost);

    const totalCost = Object.values(tierTotals).reduce((sum, v) => sum + v, 0);

    return {
      generated_at: new Date().toISOString(),
      total_cost_estimate: Math.round(totalCost * 10000) / 10000,
      cost_by_tier: {
        haiku: Math.round(tierTotals.haiku * 10000) / 10000,
        sonnet: Math.round(tierTotals.sonnet * 10000) / 10000,
        opus: Math.round(tierTotals.opus * 10000) / 10000,
        unknown: Math.round(tierTotals.unknown * 10000) / 10000
      },
      agents_by_cost: sortedAgents.slice(0, 20),
      total_agents: sortedAgents.length,
      total_tasks: this.metrics.task_results.length
    };
  }

  /**
   * Export data for ROI tracker integration
   */
  exportForROI() {
    const report = this.generateReport();

    return {
      timestamp: new Date().toISOString(),
      source: 'adaptive-routing-engine',
      metrics: {
        tasks_completed: report.summary.total_task_samples,
        avg_performance_score: report.summary.average_performance_score,
        token_savings: report.summary.token_savings_estimate,
        time_savings_hours: report.summary.time_savings_estimate_hours
      },
      // Estimate $ value: tokens at ~$0.003/1K, time at $100/hour (consultant rate)
      estimated_value: {
        token_value: Math.round(report.summary.token_savings_estimate * 0.000003 * 100) / 100,
        time_value: Math.round(report.summary.time_savings_estimate_hours * 100),
        total_estimated: Math.round(
          (report.summary.token_savings_estimate * 0.000003) +
          (report.summary.time_savings_estimate_hours * 100)
        )
      },
      top_agents: report.top_performers.slice(0, 5).map(a => ({
        name: a.name,
        score: a.score,
        samples: a.samples
      }))
    };
  }

  /**
   * Persist state to disk
   */
  _save() {
    saveJSON(this.stateFile, this.state);
    saveJSON(this.metricsFile, this.metrics);
  }

  /**
   * Reset all data (use with caution)
   */
  reset() {
    this.state = {
      agents: {},
      routing_keywords: {},
      last_updated: null,
      version: '1.0.0'
    };
    this.metrics = {
      task_results: [],
      hourly_aggregates: {},
      daily_aggregates: {}
    };
    this._initializeKeywordMapping();
    this._save();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance = null;

function getEngine() {
  if (!instance) {
    instance = new AdaptiveRoutingEngine();
  }
  return instance;
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'report';

  const engine = getEngine();

  switch (command) {
    case 'record': {
      // node adaptive-routing-engine.js record <agent> <tokens> <duration_ms> <tool_uses> <success>
      const [, agentName, tokens, duration, tools, success] = args;
      if (!agentName) {
        console.error('Usage: node adaptive-routing-engine.js record <agent> <tokens> <duration_ms> <tool_uses> <success>');
        process.exit(1);
      }
      const result = engine.recordTaskResult(agentName, {
        token_count: parseInt(tokens) || 0,
        duration_ms: parseInt(duration) || 0,
        tool_uses: parseInt(tools) || 0,
        success: success !== 'false' && success !== '0'
      });
      console.log('\nRecorded task result:');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'recommend': {
      // node adaptive-routing-engine.js recommend "task description"
      const description = args.slice(1).join(' ');
      if (!description) {
        console.error('Usage: node adaptive-routing-engine.js recommend "task description"');
        process.exit(1);
      }
      const recommendation = engine.recommendAgent(description);
      console.log('\nAgent recommendation:');
      console.log(JSON.stringify(recommendation, null, 2));
      break;
    }

    case 'profile': {
      // node adaptive-routing-engine.js profile <agent>
      const agentName = args[1];
      if (!agentName) {
        console.error('Usage: node adaptive-routing-engine.js profile <agent>');
        process.exit(1);
      }
      const profile = engine.getAgentProfile(agentName);
      console.log('\nAgent profile:');
      console.log(JSON.stringify(profile, null, 2));
      break;
    }

    case 'report': {
      const report = engine.generateReport();
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('  Adaptive Routing Engine - Performance Report');
      console.log('═══════════════════════════════════════════════════════\n');

      console.log('Summary:');
      console.log(`  Agents tracked:       ${report.summary.total_agents_tracked}`);
      console.log(`  Total task samples:   ${report.summary.total_task_samples}`);
      console.log(`  Avg performance:      ${report.summary.average_performance_score}/100`);
      console.log(`  Token savings:        ${report.summary.token_savings_estimate.toLocaleString()}`);
      console.log(`  Time savings:         ${report.summary.time_savings_estimate_hours} hours`);

      if (report.top_performers.length > 0) {
        console.log('\nTop Performers (confidence >= 50%):');
        report.top_performers.forEach((a, i) => {
          console.log(`  ${i + 1}. ${a.name}`);
          console.log(`     Score: ${a.score}/100 | Success: ${Math.round((a.success_rate || 0) * 100)}% | Samples: ${a.samples}`);
        });
      }

      if (report.needs_more_data.length > 0) {
        console.log('\nNeeds More Data:');
        report.needs_more_data.forEach(a => {
          console.log(`  - ${a.name} (${a.samples} samples, ${Math.round(a.confidence * 100)}% confidence)`);
        });
      }

      console.log('\n═══════════════════════════════════════════════════════\n');
      break;
    }

    case 'cost-report': {
      const costReport = engine.generateCostReport();
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('  Adaptive Routing Engine - Cost Report');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log(`  Total estimated cost: $${costReport.total_cost_estimate}`);
      console.log(`  By tier: Haiku $${costReport.cost_by_tier.haiku} | Sonnet $${costReport.cost_by_tier.sonnet} | Opus $${costReport.cost_by_tier.opus}`);
      if (costReport.agents_by_cost.length > 0) {
        console.log('\n  Top agents by cost:');
        costReport.agents_by_cost.slice(0, 10).forEach((a, i) => {
          console.log(`    ${i + 1}. ${a.name}: $${a.cost} (${a.tasks} tasks, ${a.tokens.toLocaleString()} tokens)`);
        });
      }
      console.log('\n═══════════════════════════════════════════════════════\n');
      break;
    }

    case 'roi': {
      const roiData = engine.exportForROI();
      console.log('\nROI Export Data:');
      console.log(JSON.stringify(roiData, null, 2));
      break;
    }

    case 'reset': {
      engine.reset();
      console.log('All routing data has been reset.');
      break;
    }

    default:
      console.log(`
Adaptive Routing Engine

Learns from Task tool results to optimize agent routing.

Usage: node adaptive-routing-engine.js <command> [args]

Commands:
  report                           Show performance report
  cost-report                      Show cost breakdown by agent/tier
  record <agent> <tokens> <ms> <tools> <success>
                                   Record a task result
  recommend "task description"     Get agent recommendation
  profile <agent>                  Show agent performance profile
  roi                              Export data for ROI tracking
  reset                            Reset all data (caution!)

Examples:
  node adaptive-routing-engine.js report
  node adaptive-routing-engine.js record sfdc-revops-auditor 15000 180000 42 true
  node adaptive-routing-engine.js recommend "run a revops audit"
  node adaptive-routing-engine.js profile sfdc-revops-auditor
`);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  AdaptiveRoutingEngine,
  getEngine,
  SCORE_WEIGHTS,
  BASELINE_EXPECTATIONS,
  MIN_SAMPLES_FOR_CONFIDENCE,
  COST_PER_MILLION_TOKENS
};
