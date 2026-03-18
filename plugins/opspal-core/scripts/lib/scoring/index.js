/**
 * Scoring System - Multi-Signal Intelligence for Entity Matching
 *
 * This module provides intelligent scoring for entity matching through
 * three complementary strategies:
 *
 * 1. Signal Correlation - Recognizes synergistic and conflicting signal pairs
 * 2. Contextual Weighting - Adjusts for data completeness and quality
 * 3. Bayesian Confidence - Calculates probabilistic confidence using Bayes' theorem
 *
 * @module scoring
 */

'use strict';

const {
  SignalCorrelationMatrix,
  DEFAULT_SYNERGISTIC_PAIRS,
  DEFAULT_CONFLICTING_PAIRS,
  DEFAULT_SIGNAL_CHAINS
} = require('./signal-correlation-matrix');

const {
  ContextualWeighter,
  FIELD_TIERS,
  TIER_WEIGHTS,
  MARKET_CRITICAL_FIELDS,
  COMPLETENESS_THRESHOLDS,
  COMPLETENESS_FACTORS
} = require('./contextual-weighter');

const {
  BayesianConfidence,
  MARKET_PRIORS,
  SIGNAL_LIKELIHOODS,
  EVIDENCE_STRENGTH,
  CALIBRATION,
  SIGNAL_CATEGORIES
} = require('./bayesian-confidence');

const {
  SmartScorer,
  DEFAULT_CONFIG,
  DECISIONS,
  DECISION_METADATA
} = require('./smart-scorer');

/**
 * Create a configured intelligent scorer
 *
 * @param {Object} options - Configuration options
 * @returns {SmartScorer} Configured smart scorer
 */
function createIntelligentScorer(options = {}) {
  return new SmartScorer(options);
}

module.exports = {
  // Factory
  createIntelligentScorer,

  // Main orchestrator
  SmartScorer,

  // Component classes
  SignalCorrelationMatrix,
  ContextualWeighter,
  BayesianConfidence,

  // Configuration constants
  DEFAULT_CONFIG,
  DECISIONS,
  DECISION_METADATA,

  // Signal correlation constants
  DEFAULT_SYNERGISTIC_PAIRS,
  DEFAULT_CONFLICTING_PAIRS,
  DEFAULT_SIGNAL_CHAINS,

  // Contextual weighter constants
  FIELD_TIERS,
  TIER_WEIGHTS,
  MARKET_CRITICAL_FIELDS,
  COMPLETENESS_THRESHOLDS,
  COMPLETENESS_FACTORS,

  // Bayesian constants
  MARKET_PRIORS,
  SIGNAL_LIKELIHOODS,
  EVIDENCE_STRENGTH,
  CALIBRATION,
  SIGNAL_CATEGORIES
};
