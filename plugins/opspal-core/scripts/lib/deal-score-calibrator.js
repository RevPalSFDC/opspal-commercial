#!/usr/bin/env node

'use strict';

/**
 * deal-score-calibrator.js
 *
 * Bayesian calibration engine for deal scoring weights, modeled after
 * okr-outcome-calibrator.js. Records win/loss outcomes, tracks per-factor
 * accuracy, and proposes weight adjustments for the deal scoring model.
 *
 * State stored at: orgs/{org}/platforms/salesforce/deal-score-calibration.json
 *
 * Factors tracked (from revops-deal-scorer):
 *   - stage_velocity (25%)
 *   - engagement_intensity (25%)
 *   - icp_fit (20%)
 *   - deal_qualification (15%)
 *   - competitive_position (15%)
 *
 * Usage:
 *   node deal-score-calibrator.js record <org> <deal-id> <outcome> [--score <N>]
 *   node deal-score-calibrator.js report [org]
 *   node deal-score-calibrator.js propose <org>
 */

const fs = require('fs');
const path = require('path');

// Default scoring weights (from revops-deal-scorer)
const DEFAULT_WEIGHTS = {
  stage_velocity: 0.25,
  engagement_intensity: 0.25,
  icp_fit: 0.20,
  deal_qualification: 0.15,
  competitive_position: 0.15
};

const DEFAULT_SETTINGS = {
  minimum_outcomes_for_calibration: 20,
  minimum_outcomes_for_proposal: 10,
  ema_alpha: 0.3,
  beta_prior: { alpha: 2, beta: 2 },
  max_weight_adjustment: 0.10,
  staleness_days: 90
};

function resolveStorePath(org) {
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  return path.join(projectRoot, 'orgs', org, 'platforms', 'salesforce', 'deal-score-calibration.json');
}

function ensureStoreShape(data) {
  const store = data || {};
  if (!store.outcomes) store.outcomes = [];
  if (!store.factor_accuracy) store.factor_accuracy = {};
  if (!store.current_weights) store.current_weights = { ...DEFAULT_WEIGHTS };
  if (!store.weight_history) store.weight_history = [];
  if (!store.settings) store.settings = { ...DEFAULT_SETTINGS };
  if (!store.last_updated) store.last_updated = null;

  // Ensure all factors have accuracy tracking
  for (const factor of Object.keys(DEFAULT_WEIGHTS)) {
    if (!store.factor_accuracy[factor]) {
      store.factor_accuracy[factor] = {
        beta_prior: { ...DEFAULT_SETTINGS.beta_prior },
        smoothed_accuracy: null,
        sample_count: 0
      };
    }
  }

  return store;
}

function loadStore(org) {
  const storePath = resolveStorePath(org);
  if (!fs.existsSync(storePath)) {
    return ensureStoreShape({});
  }
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    return ensureStoreShape(JSON.parse(raw));
  } catch {
    return ensureStoreShape({});
  }
}

function saveStore(org, store) {
  const storePath = resolveStorePath(org);
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  store.last_updated = new Date().toISOString();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Update Beta prior with a new observation.
 * Score should be 0-1 where 1 = factor was predictive, 0 = factor was wrong.
 */
function updateBetaPrior(prior, score) {
  return {
    alpha: prior.alpha + score,
    beta: prior.beta + (1 - score)
  };
}

/**
 * EMA smoothing for accuracy ratio.
 */
function smoothAccuracy(previous, current, alpha) {
  if (previous === null) return current;
  return alpha * current + (1 - alpha) * previous;
}

/**
 * Record a deal outcome and update factor accuracy.
 *
 * @param {string} org - Organization slug
 * @param {object} outcome - { deal_id, won: bool, predicted_score: 0-100, factor_scores: { stage_velocity: 0-100, ... } }
 */
function recordOutcome(org, outcome) {
  const store = loadStore(org);
  const settings = store.settings;

  // Validate outcome
  if (!outcome.deal_id) throw new Error('deal_id required');
  if (typeof outcome.won !== 'boolean') throw new Error('won (boolean) required');

  // Add timestamp
  outcome.recorded_at = new Date().toISOString();
  outcome.org = org;
  store.outcomes.push(outcome);

  // Update factor accuracy if factor scores provided
  if (outcome.factor_scores && outcome.predicted_score != null) {
    const actual = outcome.won ? 1 : 0;
    const predicted = outcome.predicted_score / 100; // normalize to 0-1

    // For each factor, calculate how predictive it was
    for (const [factor, factorScore] of Object.entries(outcome.factor_scores)) {
      if (!store.factor_accuracy[factor]) continue;

      const normalizedScore = factorScore / 100;
      // Factor accuracy = 1 - |predicted_direction - actual_direction|
      // If factor was high and deal won, or factor was low and deal lost, it was predictive
      const factorAccuracy = 1 - Math.abs(normalizedScore - actual);

      // Update Beta prior
      store.factor_accuracy[factor].beta_prior = updateBetaPrior(
        store.factor_accuracy[factor].beta_prior,
        factorAccuracy
      );

      // Update EMA
      store.factor_accuracy[factor].smoothed_accuracy = smoothAccuracy(
        store.factor_accuracy[factor].smoothed_accuracy,
        factorAccuracy,
        settings.ema_alpha
      );

      store.factor_accuracy[factor].sample_count++;
    }
  }

  saveStore(org, store);

  return {
    outcomes_recorded: store.outcomes.length,
    factors_updated: outcome.factor_scores ? Object.keys(outcome.factor_scores).length : 0
  };
}

/**
 * Calculate weight adjustment proposals based on accumulated accuracy data.
 * Returns proposed weights with justification — requires human approval.
 */
function proposeWeightAdjustments(org) {
  const store = loadStore(org);
  const settings = store.settings;

  const totalOutcomes = store.outcomes.filter(o => o.org === org).length;

  if (totalOutcomes < settings.minimum_outcomes_for_proposal) {
    return {
      status: 'insufficient_data',
      outcomes_recorded: totalOutcomes,
      minimum_required: settings.minimum_outcomes_for_proposal,
      message: `Need ${settings.minimum_outcomes_for_proposal - totalOutcomes} more outcomes before proposing adjustments`
    };
  }

  // Calculate relative accuracy across factors
  const accuracies = {};
  let totalAccuracy = 0;

  for (const [factor, data] of Object.entries(store.factor_accuracy)) {
    if (data.sample_count === 0) continue;

    // Beta distribution mean = alpha / (alpha + beta)
    const betaMean = data.beta_prior.alpha / (data.beta_prior.alpha + data.beta_prior.beta);
    const smoothed = data.smoothed_accuracy || betaMean;

    // Blend Beta mean with EMA (60/40 favoring Beta for statistical robustness)
    accuracies[factor] = 0.6 * betaMean + 0.4 * smoothed;
    totalAccuracy += accuracies[factor];
  }

  if (totalAccuracy === 0) {
    return { status: 'no_accuracy_data', message: 'No factor accuracy data recorded yet' };
  }

  // Propose new weights proportional to accuracy
  const proposedWeights = {};
  for (const factor of Object.keys(DEFAULT_WEIGHTS)) {
    const currentWeight = store.current_weights[factor] || DEFAULT_WEIGHTS[factor];
    const accuracy = accuracies[factor] || 0.5; // neutral if no data
    const idealWeight = accuracy / totalAccuracy;

    // Clamp adjustment to max_weight_adjustment
    const adjustment = Math.max(
      -settings.max_weight_adjustment,
      Math.min(settings.max_weight_adjustment, idealWeight - currentWeight)
    );

    proposedWeights[factor] = Math.round((currentWeight + adjustment) * 1000) / 1000;
  }

  // Normalize to sum to 1.0
  const totalWeight = Object.values(proposedWeights).reduce((s, w) => s + w, 0);
  for (const factor of Object.keys(proposedWeights)) {
    proposedWeights[factor] = Math.round((proposedWeights[factor] / totalWeight) * 1000) / 1000;
  }

  // Build change summary
  const changes = [];
  for (const factor of Object.keys(DEFAULT_WEIGHTS)) {
    const current = store.current_weights[factor] || DEFAULT_WEIGHTS[factor];
    const proposed = proposedWeights[factor];
    const delta = proposed - current;
    if (Math.abs(delta) >= 0.005) {
      changes.push({
        factor,
        current_weight: current,
        proposed_weight: proposed,
        delta: Math.round(delta * 1000) / 1000,
        accuracy: Math.round((accuracies[factor] || 0) * 1000) / 1000,
        samples: store.factor_accuracy[factor]?.sample_count || 0,
        direction: delta > 0 ? 'increase' : 'decrease'
      });
    }
  }

  return {
    status: 'proposal_ready',
    outcomes_analyzed: totalOutcomes,
    current_weights: { ...store.current_weights },
    proposed_weights: proposedWeights,
    changes: changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    requires_approval: true,
    message: changes.length === 0
      ? 'Current weights are well-calibrated — no changes needed'
      : `${changes.length} weight adjustment(s) proposed based on ${totalOutcomes} deal outcomes`
  };
}

/**
 * Apply approved weight adjustments.
 */
function applyWeights(org, approvedWeights, approver) {
  const store = loadStore(org);

  // Record history
  store.weight_history.push({
    timestamp: new Date().toISOString(),
    previous_weights: { ...store.current_weights },
    new_weights: { ...approvedWeights },
    approver: approver || 'unknown',
    outcomes_at_time: store.outcomes.length
  });

  store.current_weights = { ...approvedWeights };
  saveStore(org, store);

  return { status: 'applied', weights: store.current_weights };
}

/**
 * Generate a calibration report for an org.
 */
function calibrationReport(org) {
  const store = loadStore(org);
  const orgOutcomes = store.outcomes.filter(o => o.org === org);

  const wins = orgOutcomes.filter(o => o.won).length;
  const losses = orgOutcomes.filter(o => !o.won).length;

  const report = {
    org,
    total_outcomes: orgOutcomes.length,
    wins,
    losses,
    win_rate: orgOutcomes.length > 0 ? Math.round((wins / orgOutcomes.length) * 100) : null,
    current_weights: store.current_weights,
    factor_accuracy: {},
    weight_history_count: store.weight_history.length,
    last_updated: store.last_updated,
    calibration_ready: orgOutcomes.length >= store.settings.minimum_outcomes_for_proposal
  };

  for (const [factor, data] of Object.entries(store.factor_accuracy)) {
    if (data.sample_count > 0) {
      const betaMean = data.beta_prior.alpha / (data.beta_prior.alpha + data.beta_prior.beta);
      report.factor_accuracy[factor] = {
        beta_mean: Math.round(betaMean * 1000) / 1000,
        smoothed: data.smoothed_accuracy ? Math.round(data.smoothed_accuracy * 1000) / 1000 : null,
        samples: data.sample_count
      };
    }
  }

  return report;
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'record': {
      const org = args[1];
      const dealId = args[2];
      const outcomeStr = args[3]; // 'won' or 'lost'
      if (!org || !dealId || !outcomeStr) {
        console.error('Usage: deal-score-calibrator.js record <org> <deal-id> <won|lost> [--score <N>]');
        process.exit(1);
      }
      const scoreIdx = args.indexOf('--score');
      const score = scoreIdx >= 0 ? parseInt(args[scoreIdx + 1], 10) : null;
      const result = recordOutcome(org, {
        deal_id: dealId,
        won: outcomeStr === 'won',
        predicted_score: score
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'report': {
      const org = args[1] || process.env.ORG_SLUG;
      if (!org) {
        console.error('Usage: deal-score-calibrator.js report <org>');
        process.exit(1);
      }
      console.log(JSON.stringify(calibrationReport(org), null, 2));
      break;
    }
    case 'propose': {
      const org = args[1] || process.env.ORG_SLUG;
      if (!org) {
        console.error('Usage: deal-score-calibrator.js propose <org>');
        process.exit(1);
      }
      console.log(JSON.stringify(proposeWeightAdjustments(org), null, 2));
      break;
    }
    default:
      console.log('deal-score-calibrator.js — Bayesian calibration for deal scoring weights');
      console.log('');
      console.log('Commands:');
      console.log('  record <org> <deal-id> <won|lost> [--score <N>]  Record outcome');
      console.log('  report [org]                                      Calibration report');
      console.log('  propose <org>                                     Propose weight changes');
      process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_WEIGHTS,
  DEFAULT_SETTINGS,
  loadStore,
  saveStore,
  ensureStoreShape,
  recordOutcome,
  proposeWeightAdjustments,
  applyWeights,
  calibrationReport,
  updateBetaPrior,
  smoothAccuracy
};
