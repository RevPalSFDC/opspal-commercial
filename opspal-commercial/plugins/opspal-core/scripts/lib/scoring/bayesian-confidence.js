/**
 * BayesianConfidence - Probabilistic confidence scoring using Bayesian reasoning
 *
 * Uses Bayes' theorem to calculate posterior probability that two records
 * represent the same entity given the observed evidence (signals).
 *
 * P(same|evidence) = P(evidence|same) * P(same) / P(evidence)
 *
 * @module scoring/bayesian-confidence
 */

'use strict';

/**
 * Market-specific prior probabilities
 * Higher = more likely that matching names represent the same entity
 * Lower = matching names often represent different entities (common names)
 */
const MARKET_PRIORS = {
  // HIGH PRIORS - Matching names usually are same entity
  franchise: 0.85,           // Franchises with same name = same brand
  retail: 0.80,              // Retail chains with same name = same company
  technology: 0.75,          // Tech companies rarely share names

  // MEDIUM-HIGH PRIORS
  automotive: 0.70,          // Dealerships often unique per market
  'professional-services': 0.65, // Law firms, accounting firms
  insurance: 0.65,           // Insurance agencies
  veterinary: 0.70,          // Vet clinics

  // MEDIUM PRIORS - Context matters more
  'property-management': 0.55, // Some common names ("Sunrise Properties")
  construction: 0.55,        // Regional variations
  staffing: 0.55,            // Many similar names
  'senior-living': 0.60,     // Some common patterns

  // LOW PRIORS - Common names, high false positive risk
  healthcare: 0.35,          // "Memorial Hospital" in every city
  nonprofit: 0.30,           // "First Baptist Church" everywhere
  religious: 0.25,           // Very common names
  education: 0.30,           // "Lincoln Elementary" in many states
  government: 0.20,          // "City Hall", "County Clerk" everywhere
  utilities: 0.40,           // "Electric Co-op" patterns

  // SPECIAL CASES
  'media-broadcasting': 0.50, // Call signs are unique, but names aren't
  legal: 0.45,               // "Smith & Associates" common
  'dental-medical': 0.45,    // "Family Dentistry" common

  // Default for unknown markets
  DEFAULT: 0.50
};

/**
 * Signal likelihood ratios - how much more likely is this signal
 * if records ARE the same entity vs if they're NOT
 *
 * Likelihood Ratio = P(signal|same) / P(signal|different)
 * > 1 means signal supports "same entity"
 * < 1 means signal supports "different entity"
 */
const SIGNAL_LIKELIHOODS = {
  // VERY STRONG positive evidence (>10x more likely if same)
  NPI_MATCH: 50.0,           // NPIs are unique - near certain
  EIN_MATCH: 50.0,           // EINs are unique - near certain
  DUNS_MATCH: 50.0,          // DUNS are unique - near certain
  FCC_CALLSIGN_MATCH: 40.0,  // Call signs are unique
  EXACT_NAME_MATCH: 15.0,    // Exact match very strong

  // STRONG positive evidence (5-10x)
  SHARED_DOMAIN: 8.0,        // Same website = strong signal
  BASE_NAME_MATCH: 6.0,      // Core name matches
  PHONE_MATCH: 7.0,          // Same phone number
  ADDRESS_MATCH: 8.0,        // Same address

  // MODERATE positive evidence (2-5x)
  STORE_NUMBER_PATTERN: 4.0, // Store # patterns
  PARENT_PATTERN: 3.5,       // Parent company detected
  STATE_MATCH: 2.0,          // Same state (weak alone)
  CITY_MATCH: 2.5,           // Same city
  PHONE_AREA_MATCH: 1.8,     // Same area code
  KNOWN_FRANCHISE: 3.0,      // Known franchise brand
  KNOWN_ENTITY: 3.5,         // Configured known entity
  LOCATION_SUFFIX_MATCH: 2.5, // "- Denver" suffixes match

  // WEAK positive evidence (1-2x)
  INDUSTRY_MATCH: 1.5,       // Same industry
  ABBREVIATION_MATCH: 1.8,   // Abbreviation detected
  SYNONYM_MATCH: 1.7,        // Synonym detected

  // NEUTRAL (1x) - doesn't change probability much
  PARTIAL_NAME_MATCH: 1.2,

  // NEGATIVE evidence (<1x) - suggests different entities
  STATE_MISMATCH: 0.3,       // Different states
  CITY_MISMATCH: 0.5,        // Different cities (less severe)
  DIFFERENT_DOMAIN: 0.4,     // Different websites
  PHONE_CONFLICT: 0.3,       // Different phone numbers
  ADDRESS_MISMATCH: 0.35,    // Different addresses
  NPI_MISMATCH: 0.05,        // Different NPIs = definitely different
  EIN_MISMATCH: 0.05,        // Different EINs = definitely different
  DUNS_MISMATCH: 0.05,       // Different DUNS = definitely different
  INDUSTRY_MISMATCH: 0.6,    // Different industries

  // DEFAULT for unknown signals
  DEFAULT: 1.0
};

/**
 * Evidence strength categories for interpretation
 */
const EVIDENCE_STRENGTH = {
  OVERWHELMING: { min: 0.99, label: 'Overwhelming evidence - virtually certain' },
  VERY_STRONG: { min: 0.95, label: 'Very strong evidence' },
  STRONG: { min: 0.85, label: 'Strong evidence' },
  MODERATE: { min: 0.70, label: 'Moderate evidence' },
  WEAK: { min: 0.55, label: 'Weak evidence - needs review' },
  INSUFFICIENT: { min: 0.45, label: 'Insufficient evidence' },
  AGAINST: { min: 0.0, label: 'Evidence against match' }
};

/**
 * Confidence calibration adjustments
 * Prevents overconfidence from limited evidence
 */
const CALIBRATION = {
  // Minimum signals needed for high confidence
  MIN_SIGNALS_FOR_HIGH_CONFIDENCE: 3,

  // Maximum confidence with limited signals
  MAX_CONFIDENCE_WITH_ONE_SIGNAL: 0.75,
  MAX_CONFIDENCE_WITH_TWO_SIGNALS: 0.85,

  // Prior weight (how much to trust prior vs evidence)
  // Higher = trust prior more, lower = trust evidence more
  PRIOR_WEIGHT: 0.3,

  // Evidence diversity bonus - more types of signals = more confidence
  DIVERSITY_BONUS_PER_CATEGORY: 0.02,
  MAX_DIVERSITY_BONUS: 0.10
};

/**
 * Signal categories for diversity assessment
 */
const SIGNAL_CATEGORIES = {
  IDENTIFIER: ['NPI_MATCH', 'EIN_MATCH', 'DUNS_MATCH', 'FCC_CALLSIGN_MATCH',
               'NPI_MISMATCH', 'EIN_MISMATCH', 'DUNS_MISMATCH'],
  NAME: ['EXACT_NAME_MATCH', 'BASE_NAME_MATCH', 'PARTIAL_NAME_MATCH',
         'ABBREVIATION_MATCH', 'SYNONYM_MATCH', 'KNOWN_ENTITY', 'KNOWN_FRANCHISE'],
  LOCATION: ['STATE_MATCH', 'CITY_MATCH', 'ADDRESS_MATCH', 'LOCATION_SUFFIX_MATCH',
             'STATE_MISMATCH', 'CITY_MISMATCH', 'ADDRESS_MISMATCH'],
  CONTACT: ['PHONE_MATCH', 'PHONE_AREA_MATCH', 'PHONE_CONFLICT'],
  DIGITAL: ['SHARED_DOMAIN', 'DIFFERENT_DOMAIN'],
  PATTERN: ['STORE_NUMBER_PATTERN', 'PARENT_PATTERN']
};

class BayesianConfidence {
  /**
   * Create a BayesianConfidence calculator
   * @param {Object} options - Configuration options
   * @param {Object} options.marketPriors - Custom market prior probabilities
   * @param {Object} options.signalLikelihoods - Custom signal likelihood ratios
   * @param {Object} options.calibration - Custom calibration settings
   */
  constructor(options = {}) {
    this.marketPriors = { ...MARKET_PRIORS, ...options.marketPriors };
    this.signalLikelihoods = { ...SIGNAL_LIKELIHOODS, ...options.signalLikelihoods };
    this.calibration = { ...CALIBRATION, ...options.calibration };
    this.signalCategories = options.signalCategories || SIGNAL_CATEGORIES;
  }

  /**
   * Get prior probability for a market
   * @param {string} market - Market identifier
   * @returns {number} Prior probability (0-1)
   */
  getMarketPrior(market) {
    if (!market) return this.marketPriors.DEFAULT;

    const normalizedMarket = market.toLowerCase().replace(/\s+/g, '-');
    return this.marketPriors[normalizedMarket] ?? this.marketPriors.DEFAULT;
  }

  /**
   * Get likelihood ratio for a signal
   * @param {string} signalType - Signal type identifier
   * @returns {number} Likelihood ratio
   */
  getSignalLikelihood(signalType) {
    if (!signalType) return this.signalLikelihoods.DEFAULT;

    const normalized = signalType.toUpperCase().replace(/\s+/g, '_');
    return this.signalLikelihoods[normalized] ?? this.signalLikelihoods.DEFAULT;
  }

  /**
   * Calculate combined likelihood ratio from multiple signals
   * Uses log-odds to prevent numerical overflow/underflow
   * @param {Array} signals - Array of signal objects with 'type' property
   * @returns {number} Combined likelihood ratio
   */
  calculateCombinedLikelihood(signals) {
    if (!signals || signals.length === 0) return 1.0;

    // Convert to log-odds, sum, convert back
    let logOdds = 0;

    for (const signal of signals) {
      const signalType = signal.type || signal.signal || signal;
      const likelihood = this.getSignalLikelihood(signalType);

      // Log of likelihood ratio
      logOdds += Math.log(likelihood);
    }

    // Convert back from log-odds
    return Math.exp(logOdds);
  }

  /**
   * Calculate posterior probability using Bayes' theorem
   * @param {number} prior - Prior probability P(same)
   * @param {number} likelihoodRatio - Combined likelihood ratio
   * @returns {number} Posterior probability P(same|evidence)
   */
  calculatePosterior(prior, likelihoodRatio) {
    // Bayes' theorem in odds form:
    // posterior_odds = prior_odds * likelihood_ratio
    // Then convert back to probability

    const priorOdds = prior / (1 - prior);
    const posteriorOdds = priorOdds * likelihoodRatio;
    const posterior = posteriorOdds / (1 + posteriorOdds);

    return posterior;
  }

  /**
   * Assess diversity of evidence
   * More diverse evidence (from different categories) is stronger
   * @param {Array} signals - Array of signals
   * @returns {Object} Diversity assessment
   */
  assessEvidenceDiversity(signals) {
    if (!signals || signals.length === 0) {
      return { categoriesRepresented: 0, diversityBonus: 0, categories: [] };
    }

    const representedCategories = new Set();

    for (const signal of signals) {
      const signalType = (signal.type || signal.signal || signal).toUpperCase();

      for (const [category, types] of Object.entries(this.signalCategories)) {
        if (types.includes(signalType)) {
          representedCategories.add(category);
          break;
        }
      }
    }

    const numCategories = representedCategories.size;
    const diversityBonus = Math.min(
      numCategories * this.calibration.DIVERSITY_BONUS_PER_CATEGORY,
      this.calibration.MAX_DIVERSITY_BONUS
    );

    return {
      categoriesRepresented: numCategories,
      diversityBonus,
      categories: Array.from(representedCategories)
    };
  }

  /**
   * Apply calibration to prevent overconfidence
   * @param {number} rawPosterior - Raw posterior probability
   * @param {Array} signals - Array of signals used
   * @param {Object} diversity - Diversity assessment
   * @returns {number} Calibrated confidence
   */
  applyCalibration(rawPosterior, signals, diversity) {
    const numSignals = signals ? signals.length : 0;
    let calibrated = rawPosterior;

    // Limit confidence with few signals
    if (numSignals === 1) {
      calibrated = Math.min(calibrated, this.calibration.MAX_CONFIDENCE_WITH_ONE_SIGNAL);
    } else if (numSignals === 2) {
      calibrated = Math.min(calibrated, this.calibration.MAX_CONFIDENCE_WITH_TWO_SIGNALS);
    }

    // Add diversity bonus (only for positive confidence)
    if (calibrated > 0.5 && diversity.diversityBonus > 0) {
      calibrated = Math.min(0.99, calibrated + diversity.diversityBonus);
    }

    // Ensure bounds
    return Math.max(0.01, Math.min(0.99, calibrated));
  }

  /**
   * Interpret evidence strength
   * @param {number} probability - Posterior probability
   * @returns {Object} Evidence strength interpretation
   */
  interpretStrength(probability) {
    for (const [level, { min, label }] of Object.entries(EVIDENCE_STRENGTH)) {
      if (probability >= min) {
        return { level, label, probability };
      }
    }
    return { level: 'AGAINST', label: EVIDENCE_STRENGTH.AGAINST.label, probability };
  }

  /**
   * Calculate Bayesian confidence score
   * Main entry point for the class
   *
   * @param {Object} options - Calculation options
   * @param {Array} options.signals - Array of observed signals
   * @param {string} options.market - Market identifier for prior
   * @param {number} [options.customPrior] - Override market prior
   * @returns {Object} Confidence result
   */
  calculateConfidence(options) {
    const { signals = [], market, customPrior } = options;

    // Get prior
    const prior = customPrior ?? this.getMarketPrior(market);

    // Calculate combined likelihood
    const likelihoodRatio = this.calculateCombinedLikelihood(signals);

    // Calculate raw posterior
    const rawPosterior = this.calculatePosterior(prior, likelihoodRatio);

    // Assess evidence diversity
    const diversity = this.assessEvidenceDiversity(signals);

    // Apply calibration
    const calibratedConfidence = this.applyCalibration(rawPosterior, signals, diversity);

    // Convert to 0-100 scale
    const confidenceScore = Math.round(calibratedConfidence * 100);

    // Interpret strength
    const strength = this.interpretStrength(calibratedConfidence);

    // Identify most influential signals
    const signalContributions = this.calculateSignalContributions(signals);

    return {
      confidence: confidenceScore,
      probability: calibratedConfidence,
      prior,
      market: market || 'DEFAULT',
      rawPosterior,
      likelihoodRatio,
      strength,
      diversity,
      signalContributions,
      signalCount: signals.length,
      interpretation: this.generateInterpretation(calibratedConfidence, signals, diversity)
    };
  }

  /**
   * Calculate individual signal contributions to the result
   * @param {Array} signals - Array of signals
   * @returns {Array} Sorted signal contributions
   */
  calculateSignalContributions(signals) {
    if (!signals || signals.length === 0) return [];

    const contributions = signals.map(signal => {
      const signalType = signal.type || signal.signal || signal;
      const likelihood = this.getSignalLikelihood(signalType);
      const impact = Math.log(likelihood); // Log-odds impact

      return {
        signal: signalType,
        likelihood,
        impact,
        direction: likelihood > 1 ? 'SUPPORTS' : likelihood < 1 ? 'AGAINST' : 'NEUTRAL'
      };
    });

    // Sort by absolute impact (most influential first)
    return contributions.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }

  /**
   * Generate human-readable interpretation
   * @param {number} confidence - Calibrated confidence
   * @param {Array} signals - Array of signals
   * @param {Object} diversity - Diversity assessment
   * @returns {string} Interpretation text
   */
  generateInterpretation(confidence, signals, diversity) {
    const parts = [];

    // Confidence level
    if (confidence >= 0.95) {
      parts.push('Very high confidence that records represent the same entity.');
    } else if (confidence >= 0.85) {
      parts.push('High confidence that records represent the same entity.');
    } else if (confidence >= 0.70) {
      parts.push('Moderate confidence - additional review recommended.');
    } else if (confidence >= 0.55) {
      parts.push('Low confidence - manual verification required.');
    } else if (confidence >= 0.45) {
      parts.push('Insufficient evidence to determine if records match.');
    } else {
      parts.push('Evidence suggests records are different entities.');
    }

    // Signal count
    if (signals.length === 0) {
      parts.push('No signals available for analysis.');
    } else if (signals.length === 1) {
      parts.push('Based on single signal - consider additional verification.');
    } else {
      parts.push(`Based on ${signals.length} signals.`);
    }

    // Diversity note
    if (diversity.categoriesRepresented >= 4) {
      parts.push('Evidence is diverse across multiple categories.');
    } else if (diversity.categoriesRepresented <= 1 && signals.length > 1) {
      parts.push('All evidence is from same category - consider broader verification.');
    }

    return parts.join(' ');
  }

  /**
   * Compare confidence across multiple candidate matches
   * Useful for finding best match among several options
   *
   * @param {Array} candidates - Array of { id, signals, market } objects
   * @returns {Array} Sorted candidates with confidence scores
   */
  rankCandidates(candidates) {
    if (!candidates || candidates.length === 0) return [];

    const ranked = candidates.map(candidate => {
      const result = this.calculateConfidence({
        signals: candidate.signals,
        market: candidate.market
      });

      return {
        ...candidate,
        bayesianResult: result,
        confidence: result.confidence,
        probability: result.probability
      };
    });

    // Sort by confidence descending
    return ranked.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Update prior based on observed data (learning)
   * Returns suggested new prior for future calculations
   *
   * @param {string} market - Market identifier
   * @param {Array} observations - Array of { wasCorrect: boolean, confidence: number }
   * @returns {Object} Suggested prior adjustment
   */
  suggestPriorAdjustment(market, observations) {
    if (!observations || observations.length < 10) {
      return {
        currentPrior: this.getMarketPrior(market),
        suggestedPrior: null,
        reason: 'Insufficient observations (need at least 10)'
      };
    }

    const currentPrior = this.getMarketPrior(market);

    // Calculate empirical match rate
    const matchRate = observations.filter(o => o.wasCorrect).length / observations.length;

    // Blend empirical with current prior
    const blendWeight = Math.min(observations.length / 100, 0.7); // Max 70% weight to empirical
    const suggestedPrior = (1 - blendWeight) * currentPrior + blendWeight * matchRate;

    // Only suggest if significantly different
    const difference = Math.abs(suggestedPrior - currentPrior);

    if (difference < 0.05) {
      return {
        currentPrior,
        suggestedPrior: null,
        reason: 'Current prior is well-calibrated'
      };
    }

    return {
      currentPrior,
      suggestedPrior: Math.round(suggestedPrior * 100) / 100,
      empiricalRate: Math.round(matchRate * 100) / 100,
      observationCount: observations.length,
      reason: suggestedPrior > currentPrior
        ? 'Empirical match rate higher than prior - consider increasing'
        : 'Empirical match rate lower than prior - consider decreasing'
    };
  }
}

module.exports = {
  BayesianConfidence,
  MARKET_PRIORS,
  SIGNAL_LIKELIHOODS,
  EVIDENCE_STRENGTH,
  CALIBRATION,
  SIGNAL_CATEGORIES
};
