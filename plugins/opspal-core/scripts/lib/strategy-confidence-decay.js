#!/usr/bin/env node

/**
 * Skill Confidence Decay - ACE Framework
 *
 * Automatically decays confidence scores for skills based on:
 * - Time since last use (staleness decay)
 * - Recent performance degradation
 * - Execution trend analysis
 *
 * Run weekly to maintain skill health and flag skills needing refinement.
 *
 * @version 1.0.0
 * @author ACE Framework
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Decay parameters
  stalenessDecayRate: parseFloat(process.env.SKILL_STALENESS_DECAY || '0.02'),
  performanceDecayRate: parseFloat(process.env.SKILL_PERFORMANCE_DECAY || '0.05'),
  minConfidence: parseFloat(process.env.SKILL_MIN_CONFIDENCE || '0.3'),
  maxConfidence: parseFloat(process.env.SKILL_MAX_CONFIDENCE || '0.99'),

  // Thresholds
  stalenessDays: parseInt(process.env.SKILL_STALENESS_DAYS || '30'),
  performanceDropThreshold: parseFloat(process.env.SKILL_PERFORMANCE_DROP || '0.1'),
  refinementThreshold: parseFloat(process.env.SKILL_REFINEMENT_THRESHOLD || '0.6'),

  // Analysis window
  analysisWindowDays: parseInt(process.env.SKILL_ANALYSIS_WINDOW || '30'),

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,

  // Notifications
  slackWebhook: process.env.SLACK_WEBHOOK_URL,
  enableSlack: process.env.ENABLE_SKILL_DECAY_SLACK !== '0',

  // Output
  verbose: process.env.SKILL_DECAY_VERBOSE === '1',
  reportDir: process.env.SKILL_REPORT_DIR || path.join(
    process.env.HOME || '',
    '.claude/reports/skill-decay'
  )
};

// ============================================================================
// Utility Functions
// ============================================================================

function log(level, message) {
  if (CONFIG.verbose || level === 'ERROR' || level === 'INFO') {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [SkillDecay] [${level}] ${message}`);
  }
}

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// Supabase Client
// ============================================================================

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
  }

  async query(table, params = {}) {
    const queryParts = [];

    if (params.select) {
      queryParts.push(`select=${params.select}`);
    }
    if (params.filter) {
      Object.entries(params.filter).forEach(([key, value]) => {
        queryParts.push(`${key}=${value}`);
      });
    }
    if (params.order) {
      queryParts.push(`order=${params.order}`);
    }
    if (params.limit) {
      queryParts.push(`limit=${params.limit}`);
    }

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const response = await fetch(`${this.url}/rest/v1/${table}${queryString}`, {
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Supabase query failed: ${response.statusText}`);
    }

    return response.json();
  }

  async update(table, id, data) {
    const response = await fetch(`${this.url}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Supabase update failed: ${response.statusText}`);
    }

    return response.json();
  }

  async insert(table, data) {
    const response = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Supabase insert failed: ${response.statusText}`);
    }

    return response.json();
  }
}

// ============================================================================
// Confidence Decay Engine
// ============================================================================

class ConfidenceDecayEngine {
  constructor(options = {}) {
    this.config = { ...CONFIG, ...options };
    this.client = null;
    this.results = {
      processed: 0,
      decayed: 0,
      boosted: 0,
      flaggedForRefinement: 0,
      errors: 0,
      details: []
    };
  }

  async initialize() {
    if (!this.config.supabaseUrl || !this.config.supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    this.client = new SupabaseClient(
      this.config.supabaseUrl,
      this.config.supabaseKey
    );

    log('INFO', 'Confidence decay engine initialized');
  }

  /**
   * Run the full decay analysis
   */
  async runDecay(options = {}) {
    const { dryRun = false } = options;

    log('INFO', `Starting confidence decay analysis (dry-run: ${dryRun})`);

    await this.initialize();

    // Get all active skills
    const skills = await this.client.query('skills', {
      select: '*',
      filter: { status: 'eq.active' }
    });

    log('INFO', `Analyzing ${skills.length} skills`);

    for (const skill of skills) {
      try {
        await this.processSkill(skill, dryRun);
        this.results.processed++;
      } catch (error) {
        log('ERROR', `Failed to process skill ${skill.skill_id}: ${error.message}`);
        this.results.errors++;
      }
    }

    // Generate report
    const report = this.generateReport();

    // Save report
    if (!dryRun) {
      await this.saveReport(report);
    }

    // Send notifications
    if (this.config.enableSlack && this.config.slackWebhook) {
      await this.sendSlackNotification();
    }

    return this.results;
  }

  /**
   * Process a single skill for decay
   */
  async processSkill(skill, dryRun) {
    const skillId = skill.skill_id;
    const currentConfidence = skill.confidence || 0.5;

    // Get recent executions
    const executions = await this.getRecentExecutions(skillId);

    // Calculate decay factors
    const stalenessDecay = this.calculateStalenessDecay(skill);
    const performanceDecay = this.calculatePerformanceDecay(skill, executions);
    const trendAdjustment = this.calculateTrendAdjustment(executions);

    // Calculate new confidence
    let newConfidence = currentConfidence;
    newConfidence -= stalenessDecay;
    newConfidence -= performanceDecay;
    newConfidence += trendAdjustment;

    // Clamp to valid range
    newConfidence = Math.max(this.config.minConfidence, Math.min(this.config.maxConfidence, newConfidence));

    // Round to 3 decimal places
    newConfidence = Math.round(newConfidence * 1000) / 1000;

    // Determine status change
    let newStatus = skill.status;
    if (newConfidence < this.config.refinementThreshold && skill.status === 'active') {
      newStatus = 'needs_refinement';
      this.results.flaggedForRefinement++;
    }

    // Record result
    const change = newConfidence - currentConfidence;
    if (change < -0.001) {
      this.results.decayed++;
    } else if (change > 0.001) {
      this.results.boosted++;
    }

    this.results.details.push({
      skillId,
      name: skill.name,
      previousConfidence: currentConfidence,
      newConfidence,
      change,
      factors: {
        staleness: stalenessDecay,
        performance: performanceDecay,
        trend: trendAdjustment
      },
      statusChange: newStatus !== skill.status ? newStatus : null,
      recentExecutions: executions.length
    });

    // Apply update
    if (!dryRun && (Math.abs(change) > 0.001 || newStatus !== skill.status)) {
      await this.client.update('skills', skill.id, {
        confidence: newConfidence,
        status: newStatus,
        updated_at: new Date().toISOString()
      });

      // Create refinement record if status changed
      if (newStatus === 'needs_refinement' && skill.status !== 'needs_refinement') {
        await this.createRefinementRecord(skill, {
          reason: 'confidence_decay',
          previousConfidence: currentConfidence,
          newConfidence,
          factors: { stalenessDecay, performanceDecay, trendAdjustment }
        });
      }

      log('DEBUG', `Updated ${skillId}: ${currentConfidence.toFixed(3)} -> ${newConfidence.toFixed(3)}`);
    }
  }

  /**
   * Get recent executions for a skill
   */
  async getRecentExecutions(skillId) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.config.analysisWindowDays);

    try {
      return await this.client.query('skill_executions', {
        select: 'success,duration_ms,created_at',
        filter: {
          skill_id: `eq.${skillId}`,
          'created_at': `gte.${windowStart.toISOString()}`
        },
        order: 'created_at.desc',
        limit: 100
      });
    } catch (error) {
      log('WARN', `Failed to get executions for ${skillId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate staleness decay based on time since last use
   */
  calculateStalenessDecay(skill) {
    const lastUsed = skill.last_used_at;
    const daysSinceUse = daysSince(lastUsed);

    if (daysSinceUse <= this.config.stalenessDays) {
      return 0;
    }

    // Linear decay for days beyond threshold
    const daysOverThreshold = daysSinceUse - this.config.stalenessDays;
    const decay = daysOverThreshold * this.config.stalenessDecayRate;

    // Cap maximum staleness decay at 0.2 per cycle
    return Math.min(decay, 0.2);
  }

  /**
   * Calculate performance decay based on recent success rate drop
   */
  calculatePerformanceDecay(skill, executions) {
    if (executions.length < 5) {
      // Not enough data
      return 0;
    }

    const historicalSuccessRate = skill.success_rate || 0.5;
    const recentSuccessRate = executions.filter(e => e.success).length / executions.length;
    const performanceDrop = historicalSuccessRate - recentSuccessRate;

    if (performanceDrop <= this.config.performanceDropThreshold) {
      return 0;
    }

    // Decay proportional to performance drop
    return (performanceDrop - this.config.performanceDropThreshold) * this.config.performanceDecayRate * 10;
  }

  /**
   * Calculate trend adjustment (boost for improving skills)
   */
  calculateTrendAdjustment(executions) {
    if (executions.length < 10) {
      return 0;
    }

    // Split into two halves
    const midpoint = Math.floor(executions.length / 2);
    const recentHalf = executions.slice(0, midpoint);
    const olderHalf = executions.slice(midpoint);

    const recentSuccess = recentHalf.filter(e => e.success).length / recentHalf.length;
    const olderSuccess = olderHalf.filter(e => e.success).length / olderHalf.length;

    const improvement = recentSuccess - olderSuccess;

    // Only boost if improvement is significant
    if (improvement > 0.1) {
      return Math.min(improvement * 0.5, 0.05); // Max boost of 0.05
    }

    return 0;
  }

  /**
   * Create a refinement record for tracking
   */
  async createRefinementRecord(skill, data) {
    try {
      await this.client.insert('skill_refinements', {
        skill_id: skill.skill_id,
        reason: data.reason,
        previous_confidence: data.previousConfidence,
        trigger_data: data.factors,
        status: 'pending',
        created_at: new Date().toISOString()
      });
    } catch (error) {
      log('WARN', `Failed to create refinement record: ${error.message}`);
    }
  }

  /**
   * Generate decay report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        processed: this.results.processed,
        decayed: this.results.decayed,
        boosted: this.results.boosted,
        flaggedForRefinement: this.results.flaggedForRefinement,
        errors: this.results.errors
      },
      configuration: {
        stalenessDecayRate: this.config.stalenessDecayRate,
        performanceDecayRate: this.config.performanceDecayRate,
        stalenessDays: this.config.stalenessDays,
        refinementThreshold: this.config.refinementThreshold,
        analysisWindowDays: this.config.analysisWindowDays
      },
      topDecayed: this.results.details
        .filter(d => d.change < -0.01)
        .sort((a, b) => a.change - b.change)
        .slice(0, 10),
      topBoosted: this.results.details
        .filter(d => d.change > 0.01)
        .sort((a, b) => b.change - a.change)
        .slice(0, 10),
      needsRefinement: this.results.details
        .filter(d => d.statusChange === 'needs_refinement')
    };

    return report;
  }

  /**
   * Save report to file
   */
  async saveReport(report) {
    const reportDir = this.config.reportDir;
    const reportFile = path.join(reportDir, `decay-report-${new Date().toISOString().split('T')[0]}.json`);

    try {
      await fs.promises.mkdir(reportDir, { recursive: true });
      await fs.promises.writeFile(reportFile, JSON.stringify(report, null, 2));
      log('INFO', `Report saved: ${reportFile}`);
    } catch (error) {
      log('ERROR', `Failed to save report: ${error.message}`);
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification() {
    if (!this.config.slackWebhook) return;

    const { decayed, boosted, flaggedForRefinement, processed } = this.results;

    const color = flaggedForRefinement > 0 ? 'warning' : 'good';
    const summary = [
      `*ACE Framework - Skill Confidence Decay*`,
      `Processed ${processed} skills`,
      `- Decayed: ${decayed}`,
      `- Boosted: ${boosted}`,
      `- Flagged for refinement: ${flaggedForRefinement}`
    ].join('\n');

    const payload = {
      attachments: [{
        color,
        text: summary,
        footer: 'ACE Framework v1.0.0',
        ts: Math.floor(Date.now() / 1000)
      }]
    };

    try {
      await fetch(this.config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      log('INFO', 'Slack notification sent');
    } catch (error) {
      log('WARN', `Failed to send Slack notification: ${error.message}`);
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  const engine = new ConfidenceDecayEngine({ verbose: true });

  try {
    switch (command) {
      case 'run': {
        const dryRun = args.includes('--dry-run');
        const results = await engine.runDecay({ dryRun });

        console.log('\n=== Confidence Decay Results ===\n');
        console.log(`Processed: ${results.processed}`);
        console.log(`Decayed:   ${results.decayed}`);
        console.log(`Boosted:   ${results.boosted}`);
        console.log(`Flagged:   ${results.flaggedForRefinement}`);
        console.log(`Errors:    ${results.errors}`);

        if (results.details.filter(d => d.statusChange).length > 0) {
          console.log('\nSkills Flagged for Refinement:');
          results.details
            .filter(d => d.statusChange)
            .forEach(d => {
              console.log(`  - ${d.name}: ${d.previousConfidence.toFixed(3)} -> ${d.newConfidence.toFixed(3)}`);
            });
        }

        console.log(JSON.stringify(results, null, 2));
        break;
      }

      case 'analyze': {
        // Analyze a single skill
        const skillId = args[1];
        if (!skillId) {
          console.error('Usage: skill-confidence-decay.js analyze <skill-id>');
          process.exit(1);
        }

        await engine.initialize();

        const skills = await engine.client.query('skills', {
          select: '*',
          filter: { skill_id: `eq.${skillId}` }
        });

        if (skills.length === 0) {
          console.error(`Skill not found: ${skillId}`);
          process.exit(1);
        }

        const skill = skills[0];
        const executions = await engine.getRecentExecutions(skillId);

        console.log('\n=== Skill Analysis ===\n');
        console.log(`Skill: ${skill.name}`);
        console.log(`Current Confidence: ${skill.confidence}`);
        console.log(`Success Rate: ${skill.success_rate}`);
        console.log(`Usage Count: ${skill.usage_count}`);
        console.log(`Last Used: ${skill.last_used_at}`);
        console.log(`Recent Executions: ${executions.length}`);

        const staleness = engine.calculateStalenessDecay(skill);
        const performance = engine.calculatePerformanceDecay(skill, executions);
        const trend = engine.calculateTrendAdjustment(executions);

        console.log('\nDecay Factors:');
        console.log(`  Staleness: -${staleness.toFixed(4)}`);
        console.log(`  Performance: -${performance.toFixed(4)}`);
        console.log(`  Trend Boost: +${trend.toFixed(4)}`);

        const projected = Math.max(
          CONFIG.minConfidence,
          Math.min(CONFIG.maxConfidence, skill.confidence - staleness - performance + trend)
        );
        console.log(`\nProjected Confidence: ${projected.toFixed(3)}`);
        break;
      }

      case 'history': {
        // Show decay history
        await engine.initialize();

        const refinements = await engine.client.query('skill_refinements', {
          select: 'skill_id,reason,previous_confidence,status,created_at',
          order: 'created_at.desc',
          limit: 20
        });

        console.log('\n=== Recent Refinement Records ===\n');
        refinements.forEach(r => {
          const date = new Date(r.created_at).toLocaleDateString();
          console.log(`${date} | ${r.skill_id} | ${r.reason} | ${r.status} | conf: ${r.previous_confidence}`);
        });
        break;
      }

      default:
        console.log(`
Skill Confidence Decay - ACE Framework v1.0.0

Usage: skill-confidence-decay.js <command> [options]

Commands:
  run [--dry-run]       Run confidence decay analysis
  analyze <skill-id>    Analyze decay factors for a specific skill
  history               Show recent refinement records

Options:
  --dry-run             Simulate without applying changes

Environment Variables:
  SKILL_STALENESS_DECAY      Decay rate per day over threshold (default: 0.02)
  SKILL_PERFORMANCE_DECAY    Decay rate for performance drops (default: 0.05)
  SKILL_STALENESS_DAYS       Days before staleness decay starts (default: 30)
  SKILL_REFINEMENT_THRESHOLD Confidence level to flag for refinement (default: 0.6)
  SKILL_ANALYSIS_WINDOW      Days to analyze for recent performance (default: 30)

Examples:
  skill-confidence-decay.js run
  skill-confidence-decay.js run --dry-run
  skill-confidence-decay.js analyze cpq-preflight-validation
  skill-confidence-decay.js history
`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  ConfidenceDecayEngine,
  CONFIG
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}
