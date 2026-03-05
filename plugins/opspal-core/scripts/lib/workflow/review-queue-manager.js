/**
 * ReviewQueueManager - Manage review workflow for match decisions
 *
 * Provides a structured queue for human review of uncertain matches:
 * - Queue management (pending, in-progress, completed)
 * - Context gathering for informed decisions
 * - Priority scoring for triage
 * - Assignment and claiming
 * - Persistence support
 *
 * @module workflow/review-queue-manager
 */

'use strict';

const crypto = require('crypto');

/**
 * Review item statuses
 */
const REVIEW_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DEFERRED: 'DEFERRED',
  ESCALATED: 'ESCALATED'
};

/**
 * Suggested actions for reviewers
 */
const SUGGESTED_ACTIONS = {
  MERGE: 'MERGE',
  SKIP: 'SKIP',
  FLAG: 'FLAG',
  INVESTIGATE: 'INVESTIGATE'
};

/**
 * Priority levels
 */
const PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4
};

/**
 * Default priority thresholds
 */
const DEFAULT_PRIORITY_CONFIG = {
  // Confidence ranges that affect priority
  highConfidenceRange: [75, 85],    // Just below auto-merge threshold
  mediumConfidenceRange: [55, 75],  // Moderate uncertainty
  lowConfidenceRange: [45, 55],     // Near tag threshold

  // Markets that elevate priority
  highRiskMarkets: ['healthcare', 'financial', 'government'],

  // Record value indicators
  highValueIndicators: ['enterprise', 'strategic', 'key_account']
};

class ReviewQueueManager {
  /**
   * Create a ReviewQueueManager
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.priorityConfig - Priority calculation configuration
   * @param {Function} options.onItemAdded - Callback when item added
   * @param {Function} options.onItemCompleted - Callback when review completed
   * @param {Object} options.persistence - Persistence adapter (load/save methods)
   */
  constructor(options = {}) {
    this.priorityConfig = { ...DEFAULT_PRIORITY_CONFIG, ...options.priorityConfig };
    this.onItemAdded = options.onItemAdded;
    this.onItemCompleted = options.onItemCompleted;
    this.persistence = options.persistence;

    // Queue structure
    this.queue = {
      pending: new Map(),
      inProgress: new Map(),
      completed: new Map(),
      deferred: new Map(),
      escalated: new Map()
    };

    // Statistics
    this.stats = {
      totalAdded: 0,
      totalCompleted: 0,
      averageReviewTime: 0,
      byMarket: {},
      byDecision: {}
    };

    this._reviewTimes = [];
  }

  /**
   * Add a match result to the review queue
   *
   * @param {Object} matchResult - Match result from scoring system
   * @param {Object} options - Additional options
   * @returns {Object} Created review item
   */
  addToQueue(matchResult, options = {}) {
    const {
      requester = null,
      notes = null,
      tags = [],
      dueDate = null
    } = options;

    const id = this._generateId();
    const context = this.gatherContext(matchResult);
    const priority = this.calculatePriority(matchResult, context);
    const suggestedAction = this.determineSuggestedAction(matchResult);

    const reviewItem = {
      id,
      matchResult,
      context,
      priority,
      suggestedAction,
      status: REVIEW_STATUS.PENDING,
      requester,
      assignee: null,
      notes,
      tags,
      dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      claimedAt: null,
      completedAt: null,
      decision: null,
      reviewerRationale: null
    };

    this.queue.pending.set(id, reviewItem);
    this.stats.totalAdded++;

    // Update market stats
    const market = matchResult.market || 'unknown';
    if (!this.stats.byMarket[market]) {
      this.stats.byMarket[market] = { added: 0, completed: 0 };
    }
    this.stats.byMarket[market].added++;

    // Callback
    if (this.onItemAdded) {
      this.onItemAdded(reviewItem);
    }

    return reviewItem;
  }

  /**
   * Gather context for a match result to help reviewer
   *
   * @param {Object} matchResult - Match result
   * @returns {Object} Context information
   */
  gatherContext(matchResult) {
    const context = {
      signals: this._categorizeSignals(matchResult.signals || []),
      marketPolicy: this._getMarketPolicy(matchResult.market),
      confidenceBreakdown: this._getConfidenceBreakdown(matchResult),
      dataQuality: this._assessDataQuality(matchResult),
      riskFactors: this._identifyRiskFactors(matchResult),
      similarCases: [],  // Would be populated by historical lookup
      recordSummary: this._summarizeRecords(matchResult)
    };

    return context;
  }

  /**
   * Calculate priority for a review item
   *
   * @param {Object} matchResult - Match result
   * @param {Object} context - Gathered context
   * @returns {number} Priority level (1=highest, 4=lowest)
   */
  calculatePriority(matchResult, context) {
    const { confidence, market } = matchResult;
    const { highRiskMarkets, highConfidenceRange } = this.priorityConfig;

    // Critical: High-risk market with borderline confidence
    if (highRiskMarkets.includes(market) &&
        confidence >= highConfidenceRange[0] &&
        confidence < highConfidenceRange[1]) {
      return PRIORITY.CRITICAL;
    }

    // High: Borderline auto-merge confidence or high-value indicators
    if (confidence >= highConfidenceRange[0] && confidence < highConfidenceRange[1]) {
      return PRIORITY.HIGH;
    }

    // High: Multiple risk factors
    if (context.riskFactors && context.riskFactors.length >= 2) {
      return PRIORITY.HIGH;
    }

    // Medium: Standard review case
    const { mediumConfidenceRange } = this.priorityConfig;
    if (confidence >= mediumConfidenceRange[0] && confidence < mediumConfidenceRange[1]) {
      return PRIORITY.MEDIUM;
    }

    // Low: Lower confidence, less urgent
    return PRIORITY.LOW;
  }

  /**
   * Determine suggested action based on match result
   *
   * @param {Object} matchResult - Match result
   * @returns {string} Suggested action
   */
  determineSuggestedAction(matchResult) {
    const { confidence, decision, signals } = matchResult;

    // If scoring system already suggested merge
    if (decision === 'AUTO_MERGE' || confidence >= 85) {
      return SUGGESTED_ACTIONS.MERGE;
    }

    // If very low confidence
    if (confidence < 50) {
      return SUGGESTED_ACTIONS.SKIP;
    }

    // If conflicting signals present
    const hasConflicts = (signals || []).some(s =>
      s.weight < 0 || s.type?.includes('MISMATCH') || s.type?.includes('DIFFERENT')
    );

    if (hasConflicts) {
      return SUGGESTED_ACTIONS.INVESTIGATE;
    }

    // Default for medium confidence
    return confidence >= 70 ? SUGGESTED_ACTIONS.MERGE : SUGGESTED_ACTIONS.FLAG;
  }

  /**
   * Get next items for review (sorted by priority)
   *
   * @param {Object} options - Filter options
   * @returns {Array} Review items sorted by priority
   */
  getNextItems(options = {}) {
    const {
      limit = 10,
      market = null,
      priority = null,
      assignee = null
    } = options;

    let items = Array.from(this.queue.pending.values());

    // Filter by market
    if (market) {
      items = items.filter(item => item.matchResult.market === market);
    }

    // Filter by priority
    if (priority) {
      items = items.filter(item => item.priority === priority);
    }

    // Filter by assignee (null = unassigned)
    if (assignee !== undefined) {
      items = items.filter(item => item.assignee === assignee);
    }

    // Sort by priority (lower number = higher priority), then by date
    items.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    return items.slice(0, limit);
  }

  /**
   * Claim an item for review
   *
   * @param {string} itemId - Item ID
   * @param {string} assignee - User claiming the item
   * @returns {Object} Updated item
   */
  claimItem(itemId, assignee) {
    const item = this.queue.pending.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found in pending queue`);
    }

    item.status = REVIEW_STATUS.IN_PROGRESS;
    item.assignee = assignee;
    item.claimedAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();

    // Move to in-progress queue
    this.queue.pending.delete(itemId);
    this.queue.inProgress.set(itemId, item);

    return item;
  }

  /**
   * Release a claimed item back to pending
   *
   * @param {string} itemId - Item ID
   * @returns {Object} Updated item
   */
  releaseItem(itemId) {
    const item = this.queue.inProgress.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found in in-progress queue`);
    }

    item.status = REVIEW_STATUS.PENDING;
    item.assignee = null;
    item.claimedAt = null;
    item.updatedAt = new Date().toISOString();

    // Move back to pending queue
    this.queue.inProgress.delete(itemId);
    this.queue.pending.set(itemId, item);

    return item;
  }

  /**
   * Complete a review with a decision
   *
   * @param {string} itemId - Item ID
   * @param {Object} reviewResult - Review decision
   * @returns {Object} Completed item
   */
  completeReview(itemId, reviewResult) {
    const {
      decision,
      rationale = null,
      modifiedFields = null
    } = reviewResult;

    // Find item in pending or in-progress
    let item = this.queue.inProgress.get(itemId) || this.queue.pending.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    const startTime = item.claimedAt ? new Date(item.claimedAt) : new Date(item.createdAt);
    const reviewTime = Date.now() - startTime.getTime();

    item.status = REVIEW_STATUS.COMPLETED;
    item.decision = decision;
    item.reviewerRationale = rationale;
    item.modifiedFields = modifiedFields;
    item.completedAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();
    item.reviewTimeMs = reviewTime;

    // Move to completed queue
    this.queue.pending.delete(itemId);
    this.queue.inProgress.delete(itemId);
    this.queue.completed.set(itemId, item);

    // Update stats
    this.stats.totalCompleted++;
    this._reviewTimes.push(reviewTime);
    this.stats.averageReviewTime = this._reviewTimes.reduce((a, b) => a + b, 0) / this._reviewTimes.length;

    const market = item.matchResult.market || 'unknown';
    if (!this.stats.byMarket[market]) {
      this.stats.byMarket[market] = { added: 0, completed: 0 };
    }
    this.stats.byMarket[market].completed++;

    if (!this.stats.byDecision[decision]) {
      this.stats.byDecision[decision] = 0;
    }
    this.stats.byDecision[decision]++;

    // Callback
    if (this.onItemCompleted) {
      this.onItemCompleted(item);
    }

    return item;
  }

  /**
   * Defer an item for later review
   *
   * @param {string} itemId - Item ID
   * @param {Object} deferOptions - Deferral options
   * @returns {Object} Updated item
   */
  deferItem(itemId, deferOptions = {}) {
    const { reason, deferUntil } = deferOptions;

    let item = this.queue.inProgress.get(itemId) || this.queue.pending.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    item.status = REVIEW_STATUS.DEFERRED;
    item.deferReason = reason;
    item.deferUntil = deferUntil;
    item.updatedAt = new Date().toISOString();

    // Move to deferred queue
    this.queue.pending.delete(itemId);
    this.queue.inProgress.delete(itemId);
    this.queue.deferred.set(itemId, item);

    return item;
  }

  /**
   * Escalate an item for senior review
   *
   * @param {string} itemId - Item ID
   * @param {Object} escalateOptions - Escalation options
   * @returns {Object} Updated item
   */
  escalateItem(itemId, escalateOptions = {}) {
    const { reason, escalateTo } = escalateOptions;

    let item = this.queue.inProgress.get(itemId) || this.queue.pending.get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    item.status = REVIEW_STATUS.ESCALATED;
    item.escalateReason = reason;
    item.escalateTo = escalateTo;
    item.priority = PRIORITY.CRITICAL;  // Escalations are always critical
    item.updatedAt = new Date().toISOString();

    // Move to escalated queue
    this.queue.pending.delete(itemId);
    this.queue.inProgress.delete(itemId);
    this.queue.escalated.set(itemId, item);

    return item;
  }

  /**
   * Get item by ID
   *
   * @param {string} itemId - Item ID
   * @returns {Object|null} Review item or null
   */
  getItem(itemId) {
    return this.queue.pending.get(itemId) ||
           this.queue.inProgress.get(itemId) ||
           this.queue.completed.get(itemId) ||
           this.queue.deferred.get(itemId) ||
           this.queue.escalated.get(itemId) ||
           null;
  }

  /**
   * Get queue statistics
   *
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSizes: {
        pending: this.queue.pending.size,
        inProgress: this.queue.inProgress.size,
        completed: this.queue.completed.size,
        deferred: this.queue.deferred.size,
        escalated: this.queue.escalated.size
      },
      averageReviewTimeFormatted: this._formatDuration(this.stats.averageReviewTime)
    };
  }

  /**
   * Get items by status
   *
   * @param {string} status - Status to filter by
   * @returns {Array} Items with that status
   */
  getItemsByStatus(status) {
    const queueMap = {
      [REVIEW_STATUS.PENDING]: this.queue.pending,
      [REVIEW_STATUS.IN_PROGRESS]: this.queue.inProgress,
      [REVIEW_STATUS.COMPLETED]: this.queue.completed,
      [REVIEW_STATUS.DEFERRED]: this.queue.deferred,
      [REVIEW_STATUS.ESCALATED]: this.queue.escalated
    };

    const queue = queueMap[status];
    return queue ? Array.from(queue.values()) : [];
  }

  /**
   * Search items by criteria
   *
   * @param {Object} criteria - Search criteria
   * @returns {Array} Matching items
   */
  searchItems(criteria = {}) {
    const {
      market,
      confidence,
      priority,
      status,
      assignee,
      tags,
      dateRange
    } = criteria;

    let items = [
      ...this.queue.pending.values(),
      ...this.queue.inProgress.values(),
      ...this.queue.completed.values(),
      ...this.queue.deferred.values(),
      ...this.queue.escalated.values()
    ];

    if (market) {
      items = items.filter(i => i.matchResult.market === market);
    }

    if (confidence) {
      const [min, max] = confidence;
      items = items.filter(i => {
        const conf = i.matchResult.confidence;
        return conf >= min && conf <= max;
      });
    }

    if (priority) {
      items = items.filter(i => i.priority === priority);
    }

    if (status) {
      items = items.filter(i => i.status === status);
    }

    if (assignee !== undefined) {
      items = items.filter(i => i.assignee === assignee);
    }

    if (tags && tags.length > 0) {
      items = items.filter(i =>
        i.tags && tags.some(tag => i.tags.includes(tag))
      );
    }

    if (dateRange) {
      const [start, end] = dateRange;
      items = items.filter(i => {
        const created = new Date(i.createdAt);
        return created >= new Date(start) && created <= new Date(end);
      });
    }

    return items;
  }

  /**
   * Export queue state for persistence
   *
   * @returns {Object} Serializable queue state
   */
  exportState() {
    return {
      queue: {
        pending: Array.from(this.queue.pending.entries()),
        inProgress: Array.from(this.queue.inProgress.entries()),
        completed: Array.from(this.queue.completed.entries()),
        deferred: Array.from(this.queue.deferred.entries()),
        escalated: Array.from(this.queue.escalated.entries())
      },
      stats: this.stats,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Import queue state from persistence
   *
   * @param {Object} state - Previously exported state
   */
  importState(state) {
    if (!state || !state.queue) {
      throw new Error('Invalid state format');
    }

    this.queue.pending = new Map(state.queue.pending || []);
    this.queue.inProgress = new Map(state.queue.inProgress || []);
    this.queue.completed = new Map(state.queue.completed || []);
    this.queue.deferred = new Map(state.queue.deferred || []);
    this.queue.escalated = new Map(state.queue.escalated || []);

    if (state.stats) {
      this.stats = { ...this.stats, ...state.stats };
    }
  }

  /**
   * Clear completed items older than specified days
   *
   * @param {number} olderThanDays - Days threshold
   * @returns {number} Number of items cleared
   */
  clearOldCompleted(olderThanDays = 30) {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    let cleared = 0;

    for (const [id, item] of this.queue.completed) {
      if (new Date(item.completedAt).getTime() < cutoff) {
        this.queue.completed.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  // ========== Private Methods ==========

  _generateId() {
    return `rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  _categorizeSignals(signals) {
    const supporting = [];
    const concerning = [];
    const neutral = [];

    for (const signal of signals) {
      if (typeof signal === 'string') {
        neutral.push({ type: signal, weight: 0 });
      } else if (signal.weight > 0) {
        supporting.push(signal);
      } else if (signal.weight < 0) {
        concerning.push(signal);
      } else {
        neutral.push(signal);
      }
    }

    return { supporting, concerning, neutral };
  }

  _getMarketPolicy(market) {
    const policies = {
      healthcare: {
        riskLevel: 'HIGH',
        requiresNPI: true,
        description: 'Healthcare entities require high certainty due to regulatory requirements'
      },
      financial: {
        riskLevel: 'HIGH',
        requiresEIN: true,
        description: 'Financial institutions require strict verification'
      },
      government: {
        riskLevel: 'HIGH',
        description: 'Government entities are typically unique and should not be merged casually'
      },
      franchise: {
        riskLevel: 'LOW',
        description: 'Franchise locations often share names and domains legitimately'
      },
      retail: {
        riskLevel: 'LOW',
        description: 'Retail chains commonly have multiple locations with similar names'
      }
    };

    return policies[market] || {
      riskLevel: 'MEDIUM',
      description: 'Standard review process applies'
    };
  }

  _getConfidenceBreakdown(matchResult) {
    const { confidence, components } = matchResult;

    if (components) {
      return components;
    }

    // Default breakdown if not provided
    return {
      overall: confidence,
      nameMatch: null,
      locationMatch: null,
      domainMatch: null,
      identifierMatch: null
    };
  }

  _assessDataQuality(matchResult) {
    const recordA = matchResult.recordA || {};
    const recordB = matchResult.recordB || {};

    const fieldsToCheck = ['name', 'Name', 'state', 'State', 'domain', 'Domain', 'phone', 'Phone'];

    const filledA = fieldsToCheck.filter(f => recordA[f]).length;
    const filledB = fieldsToCheck.filter(f => recordB[f]).length;

    return {
      recordACompleteness: filledA / fieldsToCheck.length,
      recordBCompleteness: filledB / fieldsToCheck.length,
      overallQuality: (filledA + filledB) / (fieldsToCheck.length * 2)
    };
  }

  _identifyRiskFactors(matchResult) {
    const risks = [];
    const { confidence, market, signals } = matchResult;

    // Borderline confidence
    if (confidence >= 75 && confidence < 85) {
      risks.push({
        type: 'BORDERLINE_CONFIDENCE',
        description: 'Confidence is near auto-merge threshold'
      });
    }

    // High-risk market
    if (['healthcare', 'financial', 'government'].includes(market)) {
      risks.push({
        type: 'HIGH_RISK_MARKET',
        description: `${market} entities require extra scrutiny`
      });
    }

    // Conflicting signals
    const hasConflicts = (signals || []).some(s =>
      (typeof s === 'object' && s.weight < 0)
    );
    if (hasConflicts) {
      risks.push({
        type: 'CONFLICTING_SIGNALS',
        description: 'Some evidence suggests these may be different entities'
      });
    }

    return risks;
  }

  _summarizeRecords(matchResult) {
    const recordA = matchResult.recordA || {};
    const recordB = matchResult.recordB || {};

    const getName = (r) => r.Name || r.name || r.CompanyName || 'Unknown';
    const getLocation = (r) => {
      const parts = [r.City || r.city, r.State || r.state].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : 'Unknown location';
    };

    return {
      recordA: {
        name: getName(recordA),
        location: getLocation(recordA),
        domain: recordA.Domain || recordA.domain || recordA.Website || null
      },
      recordB: {
        name: getName(recordB),
        location: getLocation(recordB),
        domain: recordB.Domain || recordB.domain || recordB.Website || null
      }
    };
  }

  _formatDuration(ms) {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}

module.exports = {
  ReviewQueueManager,
  REVIEW_STATUS,
  SUGGESTED_ACTIONS,
  PRIORITY,
  DEFAULT_PRIORITY_CONFIG
};
