#!/usr/bin/env node

/**
 * Agent Dedup Helper - Phase 5 Component
 *
 * Helper library for sub-agents to interact with dedup safety engine.
 * Provides simplified API for common dedup operations with automatic
 * safety validation and execution capabilities.
 *
 * Features:
 * - Agent authorization checking
 * - Simplified analysis API
 * - Simplified execution API
 * - Automatic safety recommendations
 * - Context-aware decision-making
 * - Integration with bulk executor
 *
 * Usage:
 *   const AgentDedupHelper = require('./agent-dedup-helper');
 *   const helper = new AgentDedupHelper('sfdc-merge-orchestrator', 'bluerabbit');
 *   const recommendations = await helper.getRecommendations(duplicatePairs);
 *
 * @version 1.0.0
 * @phase 5
 */

const DedupSafetyEngine = require('./dedup-safety-engine');
const ParallelBulkMergeExecutor = require('./bulk-merge-executor-parallel');
const path = require('path');

class AgentDedupHelper {
  constructor(agentName, orgAlias, options = {}) {
    this.agentName = agentName;
    this.orgAlias = orgAlias;
    this.options = options;

    // Check authorization
    this.isAuthorized = this.checkAuthorization();

    if (!this.isAuthorized) {
      throw new Error(`Agent '${agentName}' not authorized for dedup operations`);
    }

    // Initialize dedup safety engine
    this.engine = new DedupSafetyEngine(orgAlias);

    // Lazy load executor
    this.executor = null;

    console.log(`✅ Agent '${agentName}' authorized for dedup operations on '${orgAlias}'`);
  }

  /**
   * Analyze duplicate pairs with safety guardrails
   * Returns categorized results with recommendations
   */
  async analyzePairs(duplicatePairs, options = {}) {
    console.log(`\n📊 Analyzing ${duplicatePairs.length} duplicate pairs...`);

    const results = await this.engine.analyzeBatch(duplicatePairs);

    const categorized = {
      approved: results.filter(d => d.decision === 'APPROVE'),
      review: results.filter(d => d.decision === 'REVIEW'),
      blocked: results.filter(d => d.decision === 'BLOCK'),
      summary: {
        total: results.length,
        safeToMerge: results.filter(d => d.decision === 'APPROVE').length,
        needsReview: results.filter(d => d.decision === 'REVIEW').length,
        blocked: results.filter(d => d.decision === 'BLOCK').length
      }
    };

    console.log(`\n✅ Analysis complete:`);
    console.log(`   ✅ Safe to merge: ${categorized.summary.safeToMerge}`);
    console.log(`   ⚠️  Needs review: ${categorized.summary.needsReview}`);
    console.log(`   ❌ Blocked: ${categorized.summary.blocked}`);

    return categorized;
  }

  /**
   * Execute approved merges with safety validation
   * Requires explicit approval unless auto-approve is enabled
   */
  async executeMerges(approvedDecisions, options = {}) {
    console.log(`\n🚀 Executing ${approvedDecisions.length} approved merges...`);

    // Double-check all decisions are APPROVE
    const hasNonApproved = approvedDecisions.some(d => d.decision !== 'APPROVE');

    if (hasNonApproved) {
      throw new Error('Cannot execute: All decisions must be APPROVE status');
    }

    // Initialize executor if not already created (using parallel version for 5x speedup)
    if (!this.executor) {
      this.executor = new ParallelBulkMergeExecutor(this.orgAlias, {
        batchSize: options.batchSize || 10,
        maxWorkers: options.maxWorkers || 5,  // Parallel executor config
        dryRun: options.dryRun || false,
        autoApprove: options.autoApprove || false,
        maxPairs: options.maxPairs || null
      });
    }

    // Prepare decisions in the format expected by executor
    const decisionsPayload = {
      org: this.orgAlias,
      timestamp: new Date().toISOString(),
      decisions: approvedDecisions
    };

    // Execute with agent context
    const results = await this.executor.execute(decisionsPayload, {
      agentName: this.agentName,
      ...options
    });

    console.log(`\n✅ Execution complete:`);
    console.log(`   Success: ${results.success}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Skipped: ${results.skipped}`);

    return results;
  }

  /**
   * Get dedup recommendations for agent decision-making
   * Returns high-level recommendations with safety context
   */
  async getRecommendations(duplicatePairs, options = {}) {
    const analysis = await this.analyzePairs(duplicatePairs, options);

    const recommendation = {
      safe_to_auto_merge: analysis.approved,
      requires_human_review: analysis.review,
      do_not_merge: analysis.blocked,
      summary: analysis.summary,
      recommendation_text: this.generateAgentRecommendation(analysis),
      confidence: this.calculateRecommendationConfidence(analysis),
      next_steps: this.generateNextSteps(analysis)
    };

    console.log(`\n💡 Recommendation: ${recommendation.recommendation_text}`);

    return recommendation;
  }

  /**
   * Generate agent-friendly recommendation text
   */
  generateAgentRecommendation(analysis) {
    const { summary } = analysis;

    // BLOCKED scenarios
    if (summary.blocked > 0) {
      return `BLOCKED: ${summary.blocked} pair(s) have critical conflicts. Do not proceed with these pairs. Review manually.`;
    }

    // High review rate scenarios
    if (summary.needsReview > summary.total * 0.5) {
      return `REVIEW REQUIRED: ${summary.needsReview}/${summary.total} pairs need manual review. Auto-merge only ${summary.safeToMerge} approved pairs.`;
    }

    // All approved scenarios
    if (summary.safeToMerge === summary.total) {
      return `SAFE TO PROCEED: All ${summary.safeToMerge} pairs passed safety checks. Recommend automated merge.`;
    }

    // Partial approval scenarios
    if (summary.safeToMerge > 0 && summary.needsReview > 0) {
      return `PARTIAL APPROVAL: ${summary.safeToMerge}/${summary.total} pairs safe to merge. ${summary.needsReview} require review. Consider processing in two batches.`;
    }

    // No approved pairs
    if (summary.safeToMerge === 0) {
      return `NO SAFE MERGES: All ${summary.total} pairs require review or are blocked. Manual intervention needed.`;
    }

    return `MIXED RESULTS: Review individual pair decisions for details.`;
  }

  /**
   * Calculate recommendation confidence
   */
  calculateRecommendationConfidence(analysis) {
    const { summary } = analysis;

    // High confidence: All approved or all blocked
    if (summary.safeToMerge === summary.total || summary.blocked === summary.total) {
      return 'HIGH';
    }

    // Medium confidence: Majority in one category
    const maxCategory = Math.max(summary.safeToMerge, summary.needsReview, summary.blocked);
    if (maxCategory > summary.total * 0.7) {
      return 'MEDIUM';
    }

    // Low confidence: Mixed results
    return 'LOW';
  }

  /**
   * Generate next steps based on analysis
   */
  generateNextSteps(analysis) {
    const { summary } = analysis;
    const steps = [];

    if (summary.safeToMerge > 0) {
      steps.push({
        action: 'EXECUTE_APPROVED',
        description: `Execute ${summary.safeToMerge} approved merges using /dedupe execute`,
        priority: 'HIGH',
        automated: true
      });
    }

    if (summary.needsReview > 0) {
      steps.push({
        action: 'REVIEW_FLAGGED',
        description: `Review ${summary.needsReview} flagged pairs for manual decision`,
        priority: 'MEDIUM',
        automated: false
      });
    }

    if (summary.blocked > 0) {
      steps.push({
        action: 'INVESTIGATE_BLOCKED',
        description: `Investigate ${summary.blocked} blocked pairs - resolve conflicts first`,
        priority: 'HIGH',
        automated: false
      });
    }

    if (steps.length === 0) {
      steps.push({
        action: 'NO_ACTION_NEEDED',
        description: 'No pairs to process',
        priority: 'NONE',
        automated: false
      });
    }

    return steps;
  }

  /**
   * Check if agent is authorized for dedup operations
   */
  checkAuthorization() {
    const authorizedAgents = [
      'sfdc-merge-orchestrator',
      'sfdc-conflict-resolver',
      'sfdc-dedup-safety-copilot',
      'sfdc-data-quality-analyzer',
      'sfdc-revops-auditor'
    ];

    return authorizedAgents.includes(this.agentName);
  }

  /**
   * Get authorized agents list (static method)
   */
  static getAuthorizedAgents() {
    return [
      'sfdc-merge-orchestrator',
      'sfdc-conflict-resolver',
      'sfdc-dedup-safety-copilot',
      'sfdc-data-quality-analyzer',
      'sfdc-revops-auditor'
    ];
  }

  /**
   * Validate agent authorization (static method)
   */
  static isAgentAuthorized(agentName) {
    return AgentDedupHelper.getAuthorizedAgents().includes(agentName);
  }

  /**
   * Get current dedup configuration
   */
  getConfiguration() {
    return this.engine.config;
  }

  /**
   * Get execution log path for tracking
   */
  getExecutionLogPath(executionId) {
    return path.join(process.cwd(), 'execution-logs', `${executionId}.json`);
  }

  /**
   * Load execution log for monitoring
   */
  async loadExecutionLog(executionId) {
    const fs = require('fs');
    const logPath = this.getExecutionLogPath(executionId);

    if (!fs.existsSync(logPath)) {
      throw new Error(`Execution log not found: ${executionId}`);
    }

    return JSON.parse(fs.readFileSync(logPath, 'utf8'));
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId) {
    const log = await this.loadExecutionLog(executionId);

    const processed = log.summary.success + log.summary.failed + log.summary.skipped;
    const percentage = log.summary.total > 0 ? Math.round((processed / log.summary.total) * 100) : 0;

    return {
      execution_id: log.execution_id,
      org: log.org,
      status: log.timestamp_end ? 'COMPLETED' : 'EXECUTING',
      progress: {
        total: log.summary.total,
        processed,
        percentage,
        success: log.summary.success,
        failed: log.summary.failed,
        skipped: log.summary.skipped
      },
      started: log.timestamp_start,
      ended: log.timestamp_end
    };
  }
}

// CLI execution (for testing)
if (require.main === module) {
  const args = process.argv.slice(2);

  const getArg = (name, defaultValue = null) => {
    const index = args.indexOf(`--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
  };

  const agentName = getArg('agent');
  const orgAlias = getArg('org');
  const action = getArg('action', 'test');

  if (!agentName || !orgAlias) {
    console.error('Usage: node agent-dedup-helper.js --agent <name> --org <alias> --action <action>');
    console.error('\nActions:');
    console.error('  test          Test agent authorization');
    console.error('  list          List authorized agents');
    console.error('\nExample:');
    console.error('  node agent-dedup-helper.js --agent sfdc-merge-orchestrator --org bluerabbit --action test');
    process.exit(1);
  }

  if (action === 'list') {
    console.log('Authorized agents:');
    AgentDedupHelper.getAuthorizedAgents().forEach(agent => {
      console.log(`  - ${agent}`);
    });
    process.exit(0);
  }

  if (action === 'test') {
    try {
      const helper = new AgentDedupHelper(agentName, orgAlias);
      console.log(`\n✅ Agent '${agentName}' is authorized and ready`);
      console.log(`\nConfiguration:`);
      console.log(`  Org: ${orgAlias}`);
      console.log(`  Agent: ${agentName}`);
    } catch (error) {
      console.error(`\n❌ ${error.message}`);
      process.exit(1);
    }
  }
}

module.exports = AgentDedupHelper;
