#!/usr/bin/env node

/**
 * Agent Dedup Helper v2 - Using Unified Data Operations API
 *
 * SIMPLIFIED VERSION using the new data-operations-api.js
 * Compare this with agent-dedup-helper.js to see the reduction in complexity.
 *
 * Before (v1): 387 lines with manual executor management
 * After (v2):  ~150 lines with unified API
 *
 * Features (same as v1):
 * - Agent authorization checking
 * - Simplified analysis API
 * - Simplified execution API
 * - Automatic safety recommendations
 * - Context-aware decision-making
 *
 * Key Improvements:
 * - No manual executor instantiation
 * - No configuration complexity
 * - Cleaner error handling
 * - Better defaults
 *
 * Usage:
 *   const AgentDedupHelper = require('./agent-dedup-helper-v2');
 *   const helper = new AgentDedupHelper('sfdc-merge-orchestrator', 'bluerabbit');
 *   const result = await helper.merge(duplicatePairs);
 *
 * @version 2.0.0
 * @phase Phase 2 - Consolidation
 */

const DataOps = require('./data-operations-api');

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

    console.log(`✅ Agent '${agentName}' authorized for dedup operations on '${orgAlias}'`);
  }

  /**
   * Analyze duplicate pairs with safety guardrails
   * Returns categorized results with recommendations
   *
   * SIMPLIFIED: Delegates to unified API
   */
  async analyzePairs(duplicatePairs, options = {}) {
    console.log(`\n📊 Analyzing ${duplicatePairs.length} duplicate pairs...`);

    // Unified API handles all the complexity
    const result = await DataOps.analyze(this.orgAlias, duplicatePairs, {
      safety: options.safety || 'balanced',
      ...options
    });

    // Quality Gate: Validate analysis produced results with summary
    if (!result || !result.summary || typeof result.summary.approved === 'undefined') {
      throw new Error('Analysis failed: No valid summary data returned');
    }

    console.log(`\n✅ Analysis complete:`);
    console.log(`   ✅ Safe to merge: ${result.summary.approved}`);
    console.log(`   ⚠️  Needs review: ${result.summary.review}`);
    console.log(`   ❌ Blocked: ${result.summary.blocked}`);

    return result;
  }

  /**
   * Execute approved merges with safety validation
   *
   * SIMPLIFIED: Delegates to unified API with smart defaults
   */
  async executeMerges(approvedDecisions, options = {}) {
    console.log(`\n🚀 Executing ${approvedDecisions.length} approved merges...`);

    // Unified API handles executor selection, parallelization, etc.
    const result = await DataOps.execute(this.orgAlias, {
      org: this.orgAlias,
      timestamp: new Date().toISOString(),
      decisions: approvedDecisions
    }, {
      execution: options.execution || 'parallel',
      workers: options.maxWorkers || options.workers || 5,
      dryRun: options.dryRun || false,
      autoApprove: options.autoApprove || false,
      batchSize: options.batchSize || 10,
      maxPairs: options.maxPairs || null,
      ...options
    });

    console.log(`\n✅ Execution complete:`);
    console.log(`   Success: ${result.summary.success}`);
    console.log(`   Failed: ${result.summary.failed}`);
    console.log(`   Skipped: ${result.summary.skipped}`);

    return result;
  }

  /**
   * Get dedup recommendations for agent decision-making
   *
   * SAME AS V1: High-level API unchanged
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
   * ONE-STEP MERGE: Analyze + Execute in one call
   *
   * NEW in v2: Simplified workflow for most common case
   */
  async merge(duplicatePairs, options = {}) {
    console.log(`\n🔧 One-step merge: Analyze + Execute`);

    // Use unified API's merge method (handles everything)
    const result = await DataOps.merge(this.orgAlias, duplicatePairs, {
      safety: options.safety || 'balanced',
      execution: options.execution || 'parallel',
      workers: options.workers || 5,
      dryRun: options.dryRun !== undefined ? options.dryRun : false,
      autoApprove: options.autoApprove || false,
      ...options
    });

    return result;
  }

  /**
   * Generate agent-friendly recommendation text
   *
   * UNCHANGED from v1
   */
  generateAgentRecommendation(analysis) {
    const { summary } = analysis;

    if (summary.blocked > 0) {
      return `BLOCKED: ${summary.blocked} pair(s) have critical conflicts. Do not proceed with these pairs. Review manually.`;
    }

    if (summary.review > summary.total * 0.5) {
      return `REVIEW REQUIRED: ${summary.review}/${summary.total} pairs need manual review. Auto-merge only ${summary.approved} approved pairs.`;
    }

    if (summary.approved === summary.total) {
      return `SAFE TO PROCEED: All ${summary.approved} pairs passed safety checks. Recommend automated merge.`;
    }

    if (summary.approved > 0 && summary.review > 0) {
      return `PARTIAL APPROVAL: ${summary.approved}/${summary.total} pairs safe to merge. ${summary.review} require review. Consider processing in two batches.`;
    }

    if (summary.approved === 0) {
      return `NO SAFE MERGES: All ${summary.total} pairs require review or are blocked. Manual intervention needed.`;
    }

    return `MIXED RESULTS: Review individual pair decisions for details.`;
  }

  /**
   * Calculate recommendation confidence
   *
   * UNCHANGED from v1
   */
  calculateRecommendationConfidence(analysis) {
    const { summary } = analysis;

    if (summary.approved === summary.total || summary.blocked === summary.total) {
      return 'HIGH';
    }

    const maxCategory = Math.max(summary.approved, summary.review, summary.blocked);
    if (maxCategory > summary.total * 0.7) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Generate next steps based on analysis
   *
   * UNCHANGED from v1
   */
  generateNextSteps(analysis) {
    const { summary } = analysis;
    const steps = [];

    if (summary.approved > 0) {
      steps.push({
        action: 'EXECUTE_APPROVED',
        description: `Execute ${summary.approved} approved merges using DataOps.execute()`,
        priority: 'HIGH',
        automated: true
      });
    }

    if (summary.review > 0) {
      steps.push({
        action: 'REVIEW_FLAGGED',
        description: `Review ${summary.review} flagged pairs for manual decision`,
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
   *
   * UNCHANGED from v1
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
}

module.exports = AgentDedupHelper;
