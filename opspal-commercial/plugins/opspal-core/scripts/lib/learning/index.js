/**
 * Learning Module
 *
 * Provides feedback-driven learning capabilities for entity matching:
 * - FeedbackTracker: Track user decisions on match recommendations
 * - ThresholdOptimizer: Auto-tune confidence thresholds based on feedback
 * - PatternDiscoverer: Discover new patterns from user corrections
 *
 * @module learning
 */

'use strict';

const { FeedbackTracker } = require('./feedback-tracker');
const { ThresholdOptimizer, DEFAULT_THRESHOLDS } = require('./threshold-optimizer');
const { PatternDiscoverer } = require('./pattern-discoverer');

/**
 * Create an integrated learning system
 *
 * @param {Object} options - Configuration options
 * @returns {Object} Integrated learning system with tracker, optimizer, and discoverer
 */
function createLearningSystem(options = {}) {
  const {
    storagePath = null,
    autoOptimize = false,
    optimizeAfterCount = 50,
    market = null
  } = options;

  // Create components
  const tracker = new FeedbackTracker({ storagePath });
  const optimizer = new ThresholdOptimizer();
  const discoverer = new PatternDiscoverer();

  let feedbackCount = 0;

  return {
    tracker,
    optimizer,
    discoverer,

    /**
     * Record feedback for a match result
     *
     * @param {Object} matchResult - The match result from resolution
     * @param {string} userAction - ACCEPT, REJECT, MODIFY, or SPLIT
     * @param {Object} feedbackOptions - Additional feedback context
     */
    recordFeedback(matchResult, userAction, feedbackOptions = {}) {
      tracker.recordFeedback(matchResult, userAction, feedbackOptions);
      feedbackCount++;

      // Auto-optimize if enabled and threshold reached
      if (autoOptimize && feedbackCount >= optimizeAfterCount) {
        const targetMarket = feedbackOptions.market || market || matchResult.market;
        if (targetMarket) {
          const suggestions = this.suggestOptimizations(targetMarket);
          return { recorded: true, suggestions };
        }
      }

      return { recorded: true };
    },

    /**
     * Get accuracy metrics for a market
     *
     * @param {string} targetMarket - Market to analyze
     * @returns {Object} Accuracy metrics
     */
    getAccuracyMetrics(targetMarket) {
      return tracker.calculateAccuracyMetrics(targetMarket);
    },

    /**
     * Suggest threshold optimizations based on feedback
     *
     * @param {string} targetMarket - Market to optimize
     * @returns {Object} Suggested threshold adjustments
     */
    suggestOptimizations(targetMarket) {
      const metrics = tracker.calculateAccuracyMetrics(targetMarket);
      return optimizer.suggestAdjustments(targetMarket, metrics);
    },

    /**
     * Discover new patterns from user corrections
     *
     * @param {string} targetMarket - Market to analyze
     * @returns {Object} Discovered patterns
     */
    discoverPatterns(targetMarket) {
      return discoverer.discoverPatterns(targetMarket);
    },

    /**
     * Get feedback summary
     *
     * @param {Object} summaryOptions - Filter options
     * @returns {Object} Feedback summary
     */
    getSummary(summaryOptions = {}) {
      return tracker.getSummary(summaryOptions);
    },

    /**
     * Save learning state
     *
     * @param {string} basePath - Base path for storage
     */
    save(basePath = null) {
      tracker.save(basePath);
    },

    /**
     * Load learning state
     *
     * @param {string} basePath - Base path for storage
     */
    load(basePath = null) {
      tracker.load(basePath);
    },

    /**
     * Reset feedback count (for testing)
     */
    resetCount() {
      feedbackCount = 0;
    }
  };
}

module.exports = {
  // Core classes
  FeedbackTracker,
  ThresholdOptimizer,
  PatternDiscoverer,

  // Constants
  DEFAULT_THRESHOLDS,

  // Factory
  createLearningSystem
};
