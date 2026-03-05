/**
 * Workflow Module
 *
 * Provides human-in-the-loop workflow capabilities for entity matching:
 * - Review queue management for uncertain matches
 * - Human-readable explanations for match decisions
 * - Audit trail for compliance and analysis
 *
 * @module workflow
 */

'use strict';

const {
  ReviewQueueManager,
  REVIEW_STATUS,
  SUGGESTED_ACTIONS,
  PRIORITY,
  DEFAULT_PRIORITY_CONFIG
} = require('./review-queue-manager');

const {
  ExplanationGenerator,
  SIGNAL_TEMPLATES,
  MARKET_DESCRIPTIONS,
  CONFIDENCE_LEVELS,
  DECISION_DESCRIPTIONS
} = require('./explanation-generator');

const {
  AuditTrail,
  AUDIT_EVENTS,
  DECISION_ACTIONS,
  DEFAULT_RETENTION_DAYS
} = require('./audit-trail');

/**
 * Create an integrated workflow system
 *
 * @param {Object} options - Configuration options
 * @returns {Object} Integrated workflow with queue, explainer, and audit
 */
function createWorkflowSystem(options = {}) {
  const {
    storagePath = null,
    priorityConfig = {},
    retentionDays = DEFAULT_RETENTION_DAYS,
    enableIntegrityCheck = true,
    outputFormat = 'markdown',
    onReviewAdded = null,
    onReviewCompleted = null,
    onAuditEvent = null
  } = options;

  // Create components
  const auditTrail = new AuditTrail({
    storagePath,
    retentionDays,
    enableIntegrityCheck,
    onAuditEvent
  });

  const explanationGenerator = new ExplanationGenerator({
    outputFormat
  });

  const reviewQueue = new ReviewQueueManager({
    priorityConfig,
    onItemAdded: (item) => {
      // Audit the addition
      auditTrail.logDecision(item.matchResult, 'QUEUED_FOR_REVIEW', {
        reviewItemId: item.id,
        automated: true
      });
      if (onReviewAdded) onReviewAdded(item);
    },
    onItemCompleted: (item) => {
      // Audit the completion
      auditTrail.logDecision(item.matchResult, item.decision, {
        user: item.assignee || 'system',
        rationale: item.reviewerRationale,
        reviewItemId: item.id,
        automated: false
      });
      if (onReviewCompleted) onReviewCompleted(item);
    }
  });

  return {
    queue: reviewQueue,
    explainer: explanationGenerator,
    audit: auditTrail,

    /**
     * Process a match result through the workflow
     *
     * @param {Object} matchResult - Match result from scoring system
     * @param {Object} processOptions - Processing options
     * @returns {Object} Workflow result
     */
    processMatchResult(matchResult, processOptions = {}) {
      const { autoMergeThreshold = 85, reviewThreshold = 65 } = processOptions;
      const { confidence, decision } = matchResult;

      let workflowAction;
      let reviewItem = null;

      if (decision === 'AUTO_MERGE' || confidence >= autoMergeThreshold) {
        // Auto-merge: log and proceed
        workflowAction = 'AUTO_MERGE';
        auditTrail.logDecision(matchResult, DECISION_ACTIONS.AUTO_MERGE, {
          automated: true
        });
      } else if (confidence >= reviewThreshold) {
        // Send to review queue
        workflowAction = 'REVIEW';
        reviewItem = reviewQueue.addToQueue(matchResult, processOptions);
      } else {
        // Auto-skip: log and skip
        workflowAction = 'AUTO_SKIP';
        auditTrail.logDecision(matchResult, DECISION_ACTIONS.AUTO_SKIP, {
          automated: true
        });
      }

      return {
        workflowAction,
        reviewItem,
        explanation: explanationGenerator.explainBrief(matchResult),
        confidence,
        originalDecision: decision
      };
    },

    /**
     * Get explanation for a match result
     *
     * @param {Object} matchResult - Match result
     * @param {Object} explainOptions - Explanation options
     * @returns {string} Human-readable explanation
     */
    explain(matchResult, explainOptions = {}) {
      return explanationGenerator.explain(matchResult, explainOptions);
    },

    /**
     * Complete a review and log it
     *
     * @param {string} reviewItemId - Review item ID
     * @param {Object} reviewResult - Review decision
     * @returns {Object} Completed review item
     */
    completeReview(reviewItemId, reviewResult) {
      const item = reviewQueue.completeReview(reviewItemId, reviewResult);

      // If merge decision, log the merge
      if (reviewResult.decision === DECISION_ACTIONS.MERGE) {
        auditTrail.logMerge({
          masterId: item.matchResult.recordA?.Id || item.matchResult.recordA?.id,
          survivorIds: [item.matchResult.recordB?.Id || item.matchResult.recordB?.id],
          mergedFields: reviewResult.modifiedFields,
          originalRecords: [item.matchResult.recordA, item.matchResult.recordB]
        }, {
          user: item.assignee || 'system'
        });
      }

      return item;
    },

    /**
     * Process a batch of match results
     *
     * @param {Array} matchResults - Array of match results
     * @param {Object} batchOptions - Batch options
     * @returns {Object} Batch processing summary
     */
    processBatch(matchResults, batchOptions = {}) {
      const startTime = Date.now();
      const summary = {
        total: matchResults.length,
        autoMerged: 0,
        sentToReview: 0,
        autoSkipped: 0,
        results: []
      };

      for (const matchResult of matchResults) {
        const result = this.processMatchResult(matchResult, batchOptions);
        summary.results.push(result);

        switch (result.workflowAction) {
          case 'AUTO_MERGE':
            summary.autoMerged++;
            break;
          case 'REVIEW':
            summary.sentToReview++;
            break;
          case 'AUTO_SKIP':
            summary.autoSkipped++;
            break;
        }
      }

      summary.processingTime = Date.now() - startTime;

      // Log batch processing
      auditTrail.logBatchProcess({
        totalRecords: summary.total,
        matches: matchResults.length,
        autoMerged: summary.autoMerged,
        sentToReview: summary.sentToReview,
        skipped: summary.autoSkipped,
        processingTime: summary.processingTime
      });

      return summary;
    },

    /**
     * Get dashboard data for review workflow
     *
     * @returns {Object} Dashboard data
     */
    getDashboardData() {
      const queueStats = reviewQueue.getStats();
      const auditStats = auditTrail.getStats();

      return {
        queue: {
          pending: queueStats.queueSizes.pending,
          inProgress: queueStats.queueSizes.inProgress,
          completed: queueStats.queueSizes.completed,
          escalated: queueStats.queueSizes.escalated,
          averageReviewTime: queueStats.averageReviewTimeFormatted
        },
        decisions: auditStats.byAction,
        markets: auditStats.byMarket,
        users: auditStats.byUser,
        totalEvents: auditStats.totalEvents,
        pendingByPriority: this._getPendingByPriority()
      };
    },

    /**
     * Export compliance report
     *
     * @param {Object} exportOptions - Export options
     * @returns {Object} Compliance report
     */
    exportComplianceReport(exportOptions = {}) {
      const auditExport = auditTrail.exportLog(exportOptions);
      const integrityCheck = auditTrail.verifyIntegrity();

      return {
        ...auditExport,
        integrityCheck,
        queueStatus: reviewQueue.getStats(),
        generatedAt: new Date().toISOString()
      };
    },

    /**
     * Save workflow state
     *
     * @param {string} [basePath] - Base path for storage
     */
    save(basePath = null) {
      const queueState = reviewQueue.exportState();
      const queuePath = basePath
        ? `${basePath}/review-queue-state.json`
        : null;

      if (queuePath) {
        const fs = require('fs');
        const path = require('path');
        const dir = path.dirname(queuePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(queuePath, JSON.stringify(queueState, null, 2));
      }

      auditTrail.save(basePath ? `${basePath}/audit-trail.json` : null);
    },

    /**
     * Load workflow state
     *
     * @param {string} [basePath] - Base path for storage
     */
    load(basePath = null) {
      const fs = require('fs');

      const queuePath = basePath ? `${basePath}/review-queue-state.json` : null;
      if (queuePath && fs.existsSync(queuePath)) {
        const queueState = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
        reviewQueue.importState(queueState);
      }

      auditTrail.load(basePath ? `${basePath}/audit-trail.json` : null);
    },

    // Private helper
    _getPendingByPriority() {
      const pending = reviewQueue.getItemsByStatus(REVIEW_STATUS.PENDING);
      const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };

      for (const item of pending) {
        switch (item.priority) {
          case PRIORITY.CRITICAL:
            byPriority.critical++;
            break;
          case PRIORITY.HIGH:
            byPriority.high++;
            break;
          case PRIORITY.MEDIUM:
            byPriority.medium++;
            break;
          case PRIORITY.LOW:
            byPriority.low++;
            break;
        }
      }

      return byPriority;
    }
  };
}

module.exports = {
  // Core classes
  ReviewQueueManager,
  ExplanationGenerator,
  AuditTrail,

  // Constants - Review Queue
  REVIEW_STATUS,
  SUGGESTED_ACTIONS,
  PRIORITY,
  DEFAULT_PRIORITY_CONFIG,

  // Constants - Explanation
  SIGNAL_TEMPLATES,
  MARKET_DESCRIPTIONS,
  CONFIDENCE_LEVELS,
  DECISION_DESCRIPTIONS,

  // Constants - Audit
  AUDIT_EVENTS,
  DECISION_ACTIONS,
  DEFAULT_RETENTION_DAYS,

  // Factory
  createWorkflowSystem
};
