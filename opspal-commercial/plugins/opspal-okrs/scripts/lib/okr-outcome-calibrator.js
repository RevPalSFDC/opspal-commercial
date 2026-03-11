#!/usr/bin/env node
/**
 * OKR Outcome Calibrator
 *
 * Records KR outcomes when cycles close and computes calibration
 * adjustments for future target-setting based on hit/miss/partial patterns.
 *
 * Usage:
 *   node okr-outcome-calibrator.js record <org> <cycle>      # Record outcomes for closed cycle
 *   node okr-outcome-calibrator.js report [org]              # Show calibration report for org or all orgs
 *   node okr-outcome-calibrator.js adjust <org> <metric-id>  # Get adjustment factor for a metric
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  smoothing_alpha: 0.3,
  minimum_cycles_for_calibration: 4,
  beta_prior_defaults: {
    alpha: 2,
    beta: 2
  }
};

const Z_SCORE_FOR_P10_P90 = 1.28155;

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getOutcomesPath() {
  return path.resolve(__dirname, '..', '..', 'config', 'okr-outcomes.json');
}

function ensureStoreShape(data = {}) {
  return {
    version: data.version || '2.0.0',
    description: data.description || 'Learning store for OKR cycle outcomes and calibration state.',
    settings: {
      ...DEFAULT_SETTINGS,
      ...(data.settings || {}),
      beta_prior_defaults: {
        ...DEFAULT_SETTINGS.beta_prior_defaults,
        ...((data.settings || {}).beta_prior_defaults || {})
      }
    },
    metric_priors: data.metric_priors || {},
    outcomes: Array.isArray(data.outcomes) ? data.outcomes : []
  };
}

function loadOutcomes() {
  const outcomesPath = getOutcomesPath();
  if (!fs.existsSync(outcomesPath)) {
    return ensureStoreShape();
  }
  return ensureStoreShape(JSON.parse(fs.readFileSync(outcomesPath, 'utf8')));
}

function saveOutcomes(data) {
  fs.writeFileSync(getOutcomesPath(), JSON.stringify(ensureStoreShape(data), null, 2));
}

function getOutcomeScore(outcome) {
  if (typeof outcome === 'number') {
    return clamp(outcome, 0, 1);
  }

  const classification = outcome.classification || outcome.outcome;
  if (classification === 'hit') return 1;
  if (classification === 'partial') return 0.5;
  if (classification === 'miss') return 0;

  if (typeof outcome.hit === 'boolean') {
    return outcome.hit ? 1 : 0;
  }

  const attainmentRatio = toNumber(outcome.attainment_ratio, NaN);
  if (Number.isFinite(attainmentRatio)) {
    return clamp(attainmentRatio, 0, 1);
  }

  return 0;
}

function classifyOutcome(attainmentRatio) {
  if (attainmentRatio >= 1) return 'hit';
  if (attainmentRatio >= 0.7) return 'partial';
  return 'miss';
}

function updateBetaPrior(metricState = {}, outcome) {
  const priorAlpha = toNumber(metricState.alpha, DEFAULT_SETTINGS.beta_prior_defaults.alpha);
  const priorBeta = toNumber(metricState.beta, DEFAULT_SETTINGS.beta_prior_defaults.beta);
  const outcomeScore = getOutcomeScore(outcome);

  return {
    alpha: round(priorAlpha + outcomeScore, 4),
    beta: round(priorBeta + (1 - outcomeScore), 4)
  };
}

function smoothAttainmentRatio(previousValue, newValue, smoothingAlpha = DEFAULT_SETTINGS.smoothing_alpha) {
  if (previousValue === null || previousValue === undefined) {
    return newValue;
  }

  return (smoothingAlpha * newValue) + ((1 - smoothingAlpha) * previousValue);
}

function getConfidenceInterval(metric, alpha = 0.1, store = loadOutcomes()) {
  let prior = metric;

  if (typeof metric === 'string') {
    prior = ensureStoreShape(store).metric_priors?.[metric];
  } else if (metric && metric.beta_prior) {
    prior = metric.beta_prior;
  }

  const priorAlpha = toNumber(prior?.alpha, DEFAULT_SETTINGS.beta_prior_defaults.alpha);
  const priorBeta = toNumber(prior?.beta, DEFAULT_SETTINGS.beta_prior_defaults.beta);
  const mean = priorAlpha / (priorAlpha + priorBeta);
  const variance = (priorAlpha * priorBeta) /
    (((priorAlpha + priorBeta) ** 2) * (priorAlpha + priorBeta + 1));
  const standardDeviation = Math.sqrt(Math.max(variance, 0));
  const zScore = alpha === 0.2 ? 0.84162 : Z_SCORE_FOR_P10_P90;

  return {
    p10: round(clamp(mean - (zScore * standardDeviation), 0, 1), 4),
    p50: round(mean, 4),
    p90: round(clamp(mean + (zScore * standardDeviation), 0, 1), 4),
    alpha: priorAlpha,
    beta: priorBeta,
    samples: round(priorAlpha + priorBeta - DEFAULT_SETTINGS.beta_prior_defaults.alpha - DEFAULT_SETTINGS.beta_prior_defaults.beta, 4)
  };
}

function sortOutcomes(metricOutcomes) {
  return [...metricOutcomes].sort((left, right) => {
    const leftDate = new Date(left.recorded_at || 0).getTime();
    const rightDate = new Date(right.recorded_at || 0).getTime();
    return leftDate - rightDate;
  });
}

function getMetricSummary(metricOutcomes, settings = DEFAULT_SETTINGS) {
  const ordered = sortOutcomes(metricOutcomes);
  const cyclesObserved = new Set(ordered.map((outcome) => outcome.cycle)).size;
  const defaultPrior = settings.beta_prior_defaults || DEFAULT_SETTINGS.beta_prior_defaults;

  let smoothedAttainmentRatio = null;
  let betaPrior = {
    alpha: defaultPrior.alpha,
    beta: defaultPrior.beta
  };

  for (const outcome of ordered) {
    const attainmentRatio = toNumber(outcome.attainment_ratio, 0);
    smoothedAttainmentRatio = smoothAttainmentRatio(
      smoothedAttainmentRatio,
      attainmentRatio,
      settings.smoothing_alpha
    );
    betaPrior = updateBetaPrior(betaPrior, outcome);
  }

  const variancePctValues = ordered.map((outcome) => toNumber(outcome.variance_pct, 0));
  const attainmentRatios = ordered.map((outcome) => toNumber(outcome.attainment_ratio, 0));
  const hitCount = ordered.filter((outcome) => outcome.classification === 'hit' || outcome.hit === true).length;
  const partialCount = ordered.filter((outcome) => outcome.classification === 'partial').length;
  const successProbability = betaPrior.alpha / (betaPrior.alpha + betaPrior.beta);
  const adjustmentFactor = smoothedAttainmentRatio === null ? 1 : round(smoothedAttainmentRatio, 2);

  let recommendedAdjustment = 'no_change';
  if (adjustmentFactor < 0.9) {
    recommendedAdjustment = 'lower_targets';
  } else if (adjustmentFactor > 1.1 && successProbability >= 0.6) {
    recommendedAdjustment = 'raise_targets';
  }

  const summary = {
    data_points: ordered.length,
    cycles_observed: cyclesObserved,
    avg_variance_pct: ordered.length > 0
      ? round(variancePctValues.reduce((sum, value) => sum + value, 0) / ordered.length, 1)
      : 0,
    avg_attainment_ratio: ordered.length > 0
      ? round(attainmentRatios.reduce((sum, value) => sum + value, 0) / ordered.length, 3)
      : 0,
    smoothed_attainment_ratio: smoothedAttainmentRatio === null ? null : round(smoothedAttainmentRatio, 3),
    hit_rate: ordered.length > 0 ? round((hitCount / ordered.length) * 100, 0) : 0,
    partial_rate: ordered.length > 0 ? round((partialCount / ordered.length) * 100, 0) : 0,
    beta_prior: betaPrior,
    success_probability: round(successProbability, 4),
    confidence_interval: getConfidenceInterval(betaPrior, 0.1),
    recommended_adjustment: recommendedAdjustment,
    adjustment_factor: adjustmentFactor,
    minimum_cycles_warning: cyclesObserved < settings.minimum_cycles_for_calibration
      ? `Only ${cyclesObserved} cycle(s) observed. Minimum ${settings.minimum_cycles_for_calibration} cycles recommended before calibration meaningfully improves accuracy.`
      : null
  };

  return summary;
}

function rebuildMetricPriors(store) {
  const safeStore = ensureStoreShape(store);
  const byMetric = {};

  for (const outcome of safeStore.outcomes) {
    if (!byMetric[outcome.metric_id]) {
      byMetric[outcome.metric_id] = [];
    }
    byMetric[outcome.metric_id].push(outcome);
  }

  const metricPriors = {};
  for (const [metricId, metricOutcomes] of Object.entries(byMetric)) {
    const summary = getMetricSummary(metricOutcomes, safeStore.settings);
    metricPriors[metricId] = {
      alpha: summary.beta_prior.alpha,
      beta: summary.beta_prior.beta,
      smoothed_attainment_ratio: summary.smoothed_attainment_ratio,
      updated_at: new Date().toISOString()
    };
  }

  return metricPriors;
}

function getCycleDir(org, cycle) {
  return path.resolve(__dirname, '..', '..', '..', '..', 'orgs', org, 'platforms', 'okr', cycle);
}

function recordOutcome(org, cycle) {
  const cycleDir = getCycleDir(org, cycle);
  const approvedFile = path.join(cycleDir, 'approved', `okr-${cycle}.json`);

  if (!fs.existsSync(approvedFile)) {
    console.error(JSON.stringify({ error: `No approved OKR set found at ${approvedFile}` }));
    process.exit(1);
  }

  const okrSet = JSON.parse(fs.readFileSync(approvedFile, 'utf8'));

  if (okrSet.status !== 'active' && okrSet.status !== 'closed') {
    console.error(JSON.stringify({ error: `OKR set is in ${okrSet.status} state, must be active or closed to record outcomes` }));
    process.exit(1);
  }

  const store = loadOutcomes();
  const cycleOutcomes = [];

  for (const objective of okrSet.objectives) {
    for (const kr of objective.key_results) {
      if (kr.current === null || kr.current === undefined) {
        continue;
      }

      const target = toNumber(kr.target, 0);
      const actual = toNumber(kr.current, 0);
      const baseline = toNumber(kr.baseline?.value, 0);
      const attainmentRatio = target !== 0
        ? actual / target
        : actual >= target ? 1 : 0;
      const variancePct = target !== 0
        ? ((actual - target) / target) * 100
        : 0;
      const classification = classifyOutcome(attainmentRatio);

      store.outcomes = store.outcomes.filter((existing) => !(
        existing.org === org &&
        existing.cycle === cycle &&
        existing.kr_id === kr.id
      ));

      const outcome = {
        org,
        cycle,
        objective_id: objective.id,
        kr_id: kr.id,
        metric_id: kr.metric_id,
        baseline,
        target,
        actual,
        attainment_ratio: round(attainmentRatio, 4),
        variance_pct: round(variancePct, 1),
        hit: classification === 'hit',
        classification,
        stance: okrSet.stance,
        company_stage: okrSet.company_context?.stage || null,
        gtm_model: okrSet.company_context?.gtm_model || null,
        recorded_at: new Date().toISOString()
      };

      cycleOutcomes.push(outcome);
      store.outcomes.push(outcome);
    }
  }

  store.metric_priors = rebuildMetricPriors(store);
  saveOutcomes(store);

  const hitCount = cycleOutcomes.filter((outcome) => outcome.classification === 'hit').length;
  const partialCount = cycleOutcomes.filter((outcome) => outcome.classification === 'partial').length;

  const response = {
    success: true,
    cycle,
    krs_recorded: cycleOutcomes.length,
    hit_rate: cycleOutcomes.length > 0 ? `${round((hitCount / cycleOutcomes.length) * 100, 0)}%` : 'N/A',
    hits: hitCount,
    partials: partialCount,
    misses: cycleOutcomes.length - hitCount - partialCount,
    minimum_cycles_warning: new Set(cycleOutcomes.map((outcome) => outcome.cycle)).size < store.settings.minimum_cycles_for_calibration
      ? `Historical calibration improves materially after ${store.settings.minimum_cycles_for_calibration} cycles.`
      : null
  };

  return response;
}

function calibrationReport(org) {
  const store = loadOutcomes();
  const scopedOutcomes = org
    ? store.outcomes.filter((outcome) => outcome.org === org)
    : store.outcomes;

  if (scopedOutcomes.length === 0) {
    return {
      org: org || null,
      scope: org ? 'org' : 'global',
      message: 'No outcomes recorded yet. Complete at least one OKR cycle first.'
    };
  }

  const byMetric = {};
  for (const outcome of scopedOutcomes) {
    if (!byMetric[outcome.metric_id]) {
      byMetric[outcome.metric_id] = [];
    }
    byMetric[outcome.metric_id].push(outcome);
  }

  const calibrations = {};
  for (const [metricId, metricOutcomes] of Object.entries(byMetric)) {
    calibrations[metricId] = getMetricSummary(metricOutcomes, store.settings);
  }

  const cyclesCompleted = new Set(scopedOutcomes.map((outcome) => outcome.cycle)).size;
  const hitCount = scopedOutcomes.filter((outcome) => outcome.classification === 'hit').length;

  return {
    org: org || null,
    scope: org ? 'org' : 'global',
    total_outcomes: scopedOutcomes.length,
    cycles_completed: cyclesCompleted,
    overall_hit_rate: `${round((hitCount / scopedOutcomes.length) * 100, 0)}%`,
    minimum_cycles_for_calibration: store.settings.minimum_cycles_for_calibration,
    learning_warning: cyclesCompleted < store.settings.minimum_cycles_for_calibration
      ? `Only ${cyclesCompleted} cycle(s) recorded. Calibration remains early until ${store.settings.minimum_cycles_for_calibration}+ cycles are observed.`
      : null,
    metric_calibrations: calibrations
  };
}

function getAdjustment(org, metricId) {
  const store = loadOutcomes();
  const metricOutcomes = store.outcomes.filter((outcome) => outcome.org === org && outcome.metric_id === metricId);

  if (metricOutcomes.length === 0) {
    return {
      org,
      metric_id: metricId,
      adjustment_factor: 1.0,
      confidence: 'LOW',
      reason: 'No recorded outcomes yet for this metric.'
    };
  }

  const summary = getMetricSummary(metricOutcomes, store.settings);
  const confidence = summary.cycles_observed >= store.settings.minimum_cycles_for_calibration
    ? 'HIGH'
    : summary.cycles_observed >= 2
      ? 'MEDIUM'
      : 'LOW';

  return {
    org,
    metric_id: metricId,
    adjustment_factor: summary.adjustment_factor,
    recommended_adjustment: summary.recommended_adjustment,
    success_probability: summary.success_probability,
    confidence_interval: summary.confidence_interval,
    data_points: summary.data_points,
    cycles_observed: summary.cycles_observed,
    confidence,
    warning: summary.minimum_cycles_warning,
    interpretation: summary.adjustment_factor > 1
      ? 'Historically exceeds targets; consider raising future targets if evidence remains strong.'
      : summary.adjustment_factor < 1
        ? 'Historically misses targets; consider lowering or de-risking future targets.'
        : 'Historically centered on target.'
  };
}

function runCli() {
  const [, , command, org, extra] = process.argv;

  switch (command) {
    case 'record':
      if (!org || !extra) {
        console.error('Usage: okr-outcome-calibrator.js record <org> <cycle>');
        process.exit(1);
      }
      console.log(JSON.stringify(recordOutcome(org, extra), null, 2));
      break;
    case 'report':
      console.log(JSON.stringify(calibrationReport(org || null), null, 2));
      break;
    case 'adjust':
      if (!org || !extra) {
        console.error('Usage: okr-outcome-calibrator.js adjust <org> <metric-id>');
        process.exit(1);
      }
      console.log(JSON.stringify(getAdjustment(org, extra), null, 2));
      break;
    default:
      console.error('Usage: okr-outcome-calibrator.js <record|report|adjust> [org] [cycle|metric-id]');
      process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  DEFAULT_SETTINGS,
  ensureStoreShape,
  getConfidenceInterval,
  getMetricSummary,
  loadOutcomes,
  recordOutcome,
  calibrationReport,
  getAdjustment,
  saveOutcomes,
  updateBetaPrior
};
