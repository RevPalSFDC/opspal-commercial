#!/usr/bin/env node

/**
 * Signal Correlation Matrix
 *
 * Defines and applies relationships between matching signals to produce
 * smarter confidence scores. Some signal combinations are stronger than
 * their sum (synergistic), while others conflict and reduce confidence.
 *
 * Key Concepts:
 * - Synergistic pairs: Signals that together indicate very high certainty
 *   Example: SHARED_DOMAIN + BASE_NAME_MATCH = almost certain same entity
 *
 * - Conflicting pairs: Signals that contradict each other
 *   Example: SHARED_DOMAIN + DIFFERENT_STATE = unusual, reduce confidence
 *
 * - Signal chains: Sequential signals that build confidence
 *   Example: BASE_NAME_MATCH → PARENT_PATTERN → KNOWN_FRANCHISE
 *
 * Usage:
 *   const { SignalCorrelationMatrix } = require('./signal-correlation-matrix');
 *   const matrix = new SignalCorrelationMatrix();
 *
 *   const adjustedScore = matrix.applyCorrelations(signals, baseScore);
 */

'use strict';

// Synergistic signal pairs: [signalA, signalB, multiplier]
// When both signals are present, their combined effect is multiplied
const DEFAULT_SYNERGISTIC_PAIRS = [
  // Very strong synergies (multiplier >= 1.5)
  ['SHARED_DOMAIN', 'BASE_NAME_MATCH', 1.6],      // Domain + name = very strong
  ['SHARED_DOMAIN', 'EXACT_NAME_MATCH', 1.7],     // Domain + exact name = strongest
  ['NPI_MATCH', 'BASE_NAME_MATCH', 1.8],          // NPI + name = definitely same
  ['EIN_MATCH', 'BASE_NAME_MATCH', 1.8],          // EIN + name = definitely same
  ['KNOWN_FRANCHISE', 'STORE_NUMBER_PATTERN', 1.5], // Known franchise + store # = certain

  // Strong synergies (multiplier 1.3-1.49)
  ['STATE_MATCH', 'PHONE_AREA_MATCH', 1.4],       // Same state + area code
  ['STATE_MATCH', 'SAME_CITY', 1.35],             // Same state + city
  ['PARENT_PATTERN', 'BASE_NAME_MATCH', 1.4],     // Location pattern + name
  ['DOMAIN_SAME_OWNER', 'BASE_NAME_MATCH', 1.5],  // Verified owner + name
  ['ABBREVIATION_MATCH', 'STATE_MATCH', 1.3],     // Abbreviation + same state

  // Moderate synergies (multiplier 1.15-1.29)
  ['SAME_CITY', 'PHONE_AREA_MATCH', 1.2],         // City + area code
  ['BASE_NAME_MATCH', 'SAME_INDUSTRY', 1.15],     // Name + industry
  ['DOMAIN_REDIRECT_CHAIN', 'BASE_NAME_MATCH', 1.25], // Redirect + name
  ['DUNS_MATCH', 'STATE_MATCH', 1.3],             // DUNS + state
];

// Conflicting signal pairs: [signalA, signalB, dampening]
// When both signals are present, confidence is dampened
const DEFAULT_CONFLICTING_PAIRS = [
  // Strong conflicts (dampening <= 0.7)
  ['SHARED_DOMAIN', 'STATE_MISMATCH', 0.7],       // Same domain but different state = odd
  ['EXACT_NAME_MATCH', 'DIFFERENT_DOMAIN', 0.65], // Same name but different domain = suspicious
  ['NPI_MATCH', 'STATE_MISMATCH', 0.6],           // Same NPI different state = data error?
  ['EIN_MATCH', 'STATE_MISMATCH', 0.65],          // Same EIN different state = branch?

  // Moderate conflicts (dampening 0.71-0.85)
  ['BASE_NAME_MATCH', 'DIFFERENT_DOMAIN', 0.75],  // Name match but different domain
  ['PHONE_AREA_MATCH', 'STATE_MISMATCH', 0.8],    // Area code match but different state
  ['KNOWN_FRANCHISE', 'DIFFERENT_DOMAIN', 0.8],   // Franchise but different domain

  // Mild conflicts (dampening 0.86-0.95)
  ['SAME_CITY', 'DIFFERENT_DOMAIN', 0.9],         // Same city but different domain
  ['ABBREVIATION_MATCH', 'STATE_MISMATCH', 0.85], // Abbreviation but different state
];

// Signal chains: sequences that build confidence
const DEFAULT_SIGNAL_CHAINS = [
  {
    name: 'CORPORATE_HIERARCHY',
    signals: ['BASE_NAME_MATCH', 'PARENT_PATTERN', 'KNOWN_FRANCHISE'],
    bonus: 15,
    description: 'Corporate parent with location pattern'
  },
  {
    name: 'IDENTITY_VERIFIED',
    signals: ['NPI_MATCH', 'BASE_NAME_MATCH', 'STATE_MATCH'],
    bonus: 20,
    description: 'Identifier plus name and location match'
  },
  {
    name: 'DIGITAL_PRESENCE',
    signals: ['SHARED_DOMAIN', 'DOMAIN_SAME_OWNER', 'BASE_NAME_MATCH'],
    bonus: 18,
    description: 'Strong digital identity match'
  },
  {
    name: 'GEOGRAPHIC_CLUSTER',
    signals: ['STATE_MATCH', 'SAME_CITY', 'PHONE_AREA_MATCH'],
    bonus: 12,
    description: 'Multiple geographic signals align'
  },
  {
    name: 'FRANCHISE_LOCATION',
    signals: ['KNOWN_FRANCHISE', 'STORE_NUMBER_PATTERN', 'STATE_MATCH'],
    bonus: 10,
    description: 'Confirmed franchise with location identifiers'
  }
];

class SignalCorrelationMatrix {
  constructor(options = {}) {
    // Load correlation configurations
    this.synergisticPairs = options.synergisticPairs || DEFAULT_SYNERGISTIC_PAIRS;
    this.conflictingPairs = options.conflictingPairs || DEFAULT_CONFLICTING_PAIRS;
    this.signalChains = options.signalChains || DEFAULT_SIGNAL_CHAINS;

    // Build lookup maps for faster correlation checking
    this._synergisticMap = this._buildPairMap(this.synergisticPairs);
    this._conflictingMap = this._buildPairMap(this.conflictingPairs);

    // Statistics
    this.stats = {
      correlationsApplied: 0,
      synergiesFound: 0,
      conflictsFound: 0,
      chainsCompleted: 0,
      totalAdjustment: 0
    };
  }

  /**
   * Apply all correlations to a set of signals
   * @param {Array} signals - Array of signal objects with type and weight
   * @param {number} baseScore - Base confidence score before correlations
   * @param {Object} options - { market, applyChains }
   * @returns {Object} { adjustedScore, correlations, explanation }
   */
  applyCorrelations(signals, baseScore, options = {}) {
    // Handle both string signals and object signals with type property
    const signalTypes = new Set(signals.map(s => typeof s === 'string' ? s : s.type));
    const correlations = {
      synergies: [],
      conflicts: [],
      chains: []
    };

    let adjustment = 0;
    let multiplier = 1.0;

    // 1. Check for synergistic pairs
    for (const [signalA, signalB, boost] of this.synergisticPairs) {
      if (signalTypes.has(signalA) && signalTypes.has(signalB)) {
        const effectiveBoost = boost - 1.0; // Convert multiplier to bonus
        const bonusPoints = Math.round(baseScore * effectiveBoost * 0.5);

        correlations.synergies.push({
          signals: [signalA, signalB],
          multiplier: boost,
          bonus: bonusPoints
        });

        adjustment += bonusPoints;
        this.stats.synergiesFound++;
      }
    }

    // 2. Check for conflicting pairs
    for (const [signalA, signalB, dampening] of this.conflictingPairs) {
      if (signalTypes.has(signalA) && signalTypes.has(signalB)) {
        const penalty = Math.round(baseScore * (1 - dampening) * 0.5);

        correlations.conflicts.push({
          signals: [signalA, signalB],
          dampening,
          penalty
        });

        adjustment -= penalty;
        this.stats.conflictsFound++;
      }
    }

    // 3. Check for completed signal chains
    if (options.applyChains !== false) {
      for (const chain of this.signalChains) {
        const presentSignals = chain.signals.filter(s => signalTypes.has(s));
        const completeness = presentSignals.length / chain.signals.length;

        if (completeness >= 0.67) { // At least 2/3 of chain present
          const scaledBonus = Math.round(chain.bonus * completeness);

          correlations.chains.push({
            name: chain.name,
            presentSignals,
            totalSignals: chain.signals.length,
            completeness,
            bonus: scaledBonus
          });

          adjustment += scaledBonus;
          if (completeness === 1.0) {
            this.stats.chainsCompleted++;
          }
        }
      }
    }

    // Calculate final adjusted score
    const adjustedScore = Math.max(0, Math.min(100, baseScore + adjustment));

    // Update stats
    this.stats.correlationsApplied++;
    this.stats.totalAdjustment += adjustment;

    return {
      baseScore,
      adjustedScore,
      adjustment,
      correlations,
      explanation: this._generateExplanation(correlations)
    };
  }

  /**
   * Check if two specific signals have a correlation
   * @param {string} signalA - First signal type
   * @param {string} signalB - Second signal type
   * @returns {Object|null} Correlation info or null
   */
  getCorrelation(signalA, signalB) {
    const key = this._pairKey(signalA, signalB);

    if (this._synergisticMap.has(key)) {
      return {
        type: 'SYNERGISTIC',
        ...this._synergisticMap.get(key)
      };
    }

    if (this._conflictingMap.has(key)) {
      return {
        type: 'CONFLICTING',
        ...this._conflictingMap.get(key)
      };
    }

    return null;
  }

  /**
   * Get all correlations involving a specific signal
   * @param {string} signalType - Signal type to look up
   * @returns {Object} { synergies, conflicts }
   */
  getSignalCorrelations(signalType) {
    const synergies = this.synergisticPairs.filter(
      ([a, b]) => a === signalType || b === signalType
    );
    const conflicts = this.conflictingPairs.filter(
      ([a, b]) => a === signalType || b === signalType
    );

    return { synergies, conflicts };
  }

  /**
   * Add a new synergistic pair
   * @param {string} signalA - First signal
   * @param {string} signalB - Second signal
   * @param {number} multiplier - Synergy multiplier (> 1.0)
   */
  addSynergy(signalA, signalB, multiplier) {
    if (multiplier <= 1.0) {
      throw new Error('Synergy multiplier must be > 1.0');
    }

    this.synergisticPairs.push([signalA, signalB, multiplier]);
    this._synergisticMap.set(this._pairKey(signalA, signalB), {
      signalA, signalB, multiplier
    });
  }

  /**
   * Add a new conflicting pair
   * @param {string} signalA - First signal
   * @param {string} signalB - Second signal
   * @param {number} dampening - Dampening factor (< 1.0)
   */
  addConflict(signalA, signalB, dampening) {
    if (dampening >= 1.0) {
      throw new Error('Conflict dampening must be < 1.0');
    }

    this.conflictingPairs.push([signalA, signalB, dampening]);
    this._conflictingMap.set(this._pairKey(signalA, signalB), {
      signalA, signalB, dampening
    });
  }

  /**
   * Add a new signal chain
   * @param {Object} chain - { name, signals, bonus, description }
   */
  addChain(chain) {
    if (!chain.name || !chain.signals || chain.signals.length < 2) {
      throw new Error('Chain requires name and at least 2 signals');
    }

    this.signalChains.push({
      bonus: 10,
      description: '',
      ...chain
    });
  }

  /**
   * Analyze which correlations would apply to a signal set
   * @param {Array} signalTypes - Array of signal type strings
   * @returns {Object} Analysis of applicable correlations
   */
  analyzeSignalSet(signalTypes) {
    const typeSet = new Set(signalTypes);
    const analysis = {
      synergies: [],
      conflicts: [],
      chains: [],
      netEffect: 'NEUTRAL'
    };

    // Find synergies
    for (const [signalA, signalB, multiplier] of this.synergisticPairs) {
      if (typeSet.has(signalA) && typeSet.has(signalB)) {
        analysis.synergies.push({ signalA, signalB, multiplier });
      }
    }

    // Find conflicts
    for (const [signalA, signalB, dampening] of this.conflictingPairs) {
      if (typeSet.has(signalA) && typeSet.has(signalB)) {
        analysis.conflicts.push({ signalA, signalB, dampening });
      }
    }

    // Find chains
    for (const chain of this.signalChains) {
      const present = chain.signals.filter(s => typeSet.has(s));
      if (present.length >= 2) {
        analysis.chains.push({
          name: chain.name,
          completeness: present.length / chain.signals.length,
          presentSignals: present
        });
      }
    }

    // Determine net effect
    if (analysis.synergies.length > analysis.conflicts.length) {
      analysis.netEffect = 'POSITIVE';
    } else if (analysis.conflicts.length > analysis.synergies.length) {
      analysis.netEffect = 'NEGATIVE';
    } else if (analysis.synergies.length > 0) {
      analysis.netEffect = 'MIXED';
    }

    return analysis;
  }

  /**
   * Get statistics
   * @returns {Object} Correlation statistics
   */
  getStats() {
    return {
      ...this.stats,
      configuredSynergies: this.synergisticPairs.length,
      configuredConflicts: this.conflictingPairs.length,
      configuredChains: this.signalChains.length
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      correlationsApplied: 0,
      synergiesFound: 0,
      conflictsFound: 0,
      chainsCompleted: 0,
      totalAdjustment: 0
    };
  }

  // ========== Private Methods ==========

  _buildPairMap(pairs) {
    const map = new Map();
    for (const [signalA, signalB, value] of pairs) {
      map.set(this._pairKey(signalA, signalB), { signalA, signalB, value });
    }
    return map;
  }

  _pairKey(signalA, signalB) {
    // Consistent key regardless of order
    return [signalA, signalB].sort().join('::');
  }

  _generateExplanation(correlations) {
    const parts = [];

    if (correlations.synergies.length > 0) {
      const synList = correlations.synergies
        .map(s => `${s.signals[0]}+${s.signals[1]}`)
        .join(', ');
      parts.push(`Synergies: ${synList}`);
    }

    if (correlations.conflicts.length > 0) {
      const confList = correlations.conflicts
        .map(c => `${c.signals[0]}/${c.signals[1]}`)
        .join(', ');
      parts.push(`Conflicts: ${confList}`);
    }

    if (correlations.chains.length > 0) {
      const chainList = correlations.chains
        .filter(c => c.completeness === 1.0)
        .map(c => c.name)
        .join(', ');
      if (chainList) {
        parts.push(`Chains: ${chainList}`);
      }
    }

    return parts.join('. ') || 'No significant correlations';
  }
}

// Export
module.exports = {
  SignalCorrelationMatrix,
  DEFAULT_SYNERGISTIC_PAIRS,
  DEFAULT_CONFLICTING_PAIRS,
  DEFAULT_SIGNAL_CHAINS
};

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const matrix = new SignalCorrelationMatrix();

  if (args.length === 0) {
    console.log(`
Signal Correlation Matrix CLI

Usage:
  node signal-correlation-matrix.js analyze <signal1,signal2,...>
  node signal-correlation-matrix.js check <signalA> <signalB>
  node signal-correlation-matrix.js list [synergies|conflicts|chains]

Examples:
  node signal-correlation-matrix.js analyze SHARED_DOMAIN,BASE_NAME_MATCH,STATE_MATCH
  node signal-correlation-matrix.js check SHARED_DOMAIN STATE_MISMATCH
  node signal-correlation-matrix.js list synergies
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'analyze') {
    const signals = args[1]?.split(',') || [];
    const analysis = matrix.analyzeSignalSet(signals);

    console.log('\n=== Signal Set Analysis ===\n');
    console.log(`Signals: ${signals.join(', ')}`);
    console.log(`Net Effect: ${analysis.netEffect}`);
    console.log(`\nSynergies: ${analysis.synergies.length}`);
    analysis.synergies.forEach(s => {
      console.log(`  ${s.signalA} + ${s.signalB} (${s.multiplier}x)`);
    });
    console.log(`\nConflicts: ${analysis.conflicts.length}`);
    analysis.conflicts.forEach(c => {
      console.log(`  ${c.signalA} vs ${c.signalB} (${c.dampening}x)`);
    });
    console.log(`\nChains: ${analysis.chains.length}`);
    analysis.chains.forEach(c => {
      console.log(`  ${c.name}: ${(c.completeness * 100).toFixed(0)}% complete`);
    });
    console.log('');

  } else if (command === 'check') {
    const signalA = args[1];
    const signalB = args[2];

    if (!signalA || !signalB) {
      console.error('Usage: check <signalA> <signalB>');
      process.exit(1);
    }

    const correlation = matrix.getCorrelation(signalA, signalB);

    console.log(`\n=== Correlation Check ===\n`);
    console.log(`Signal A: ${signalA}`);
    console.log(`Signal B: ${signalB}`);

    if (correlation) {
      console.log(`Type: ${correlation.type}`);
      if (correlation.type === 'SYNERGISTIC') {
        console.log(`Multiplier: ${correlation.value}`);
      } else {
        console.log(`Dampening: ${correlation.value}`);
      }
    } else {
      console.log('Result: No correlation defined');
    }
    console.log('');

  } else if (command === 'list') {
    const listType = args[1] || 'all';

    console.log('\n=== Correlation Configuration ===\n');

    if (listType === 'all' || listType === 'synergies') {
      console.log('Synergistic Pairs:');
      for (const [a, b, mult] of matrix.synergisticPairs) {
        console.log(`  ${a} + ${b} = ${mult}x`);
      }
      console.log('');
    }

    if (listType === 'all' || listType === 'conflicts') {
      console.log('Conflicting Pairs:');
      for (const [a, b, damp] of matrix.conflictingPairs) {
        console.log(`  ${a} vs ${b} = ${damp}x`);
      }
      console.log('');
    }

    if (listType === 'all' || listType === 'chains') {
      console.log('Signal Chains:');
      for (const chain of matrix.signalChains) {
        console.log(`  ${chain.name}: ${chain.signals.join(' → ')} (+${chain.bonus})`);
      }
      console.log('');
    }

  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
