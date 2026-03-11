#!/usr/bin/env node
/**
 * OKR Initiative Scorer
 *
 * Scores one or more proposed initiatives using the OKR initiative rubric.
 *
 * Usage:
 *   node okr-initiative-scorer.js score --initiative path/to/initiative.json
 *   node okr-initiative-scorer.js batch-score --input path/to/batch.json
 *   node okr-initiative-scorer.js rank --input path/to/batch.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_RUBRIC_PATH = path.resolve(__dirname, '..', '..', 'config', 'initiative-scoring-rubric.json');
const FUNNEL_STAGE_ORDER = ['visitor', 'signup', 'activated', 'pql', 'sql', 'opportunity', 'proposal', 'closed_won'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumber(value, fallback = null) {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizePercent(value, fallback = 0) {
  const numeric = toNumber(value, fallback);
  if (!isFiniteNumber(numeric)) return fallback;
  if (numeric > 1) return numeric / 100;
  return numeric;
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = toNumber(value);
    if (isFiniteNumber(numeric)) return numeric;
  }
  return null;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function parseArgs(argv) {
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return options;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRubric(rubricPath = DEFAULT_RUBRIC_PATH) {
  return loadJson(rubricPath);
}

function getDimension(rubric, id) {
  return rubric.dimensions.find((dimension) => dimension.id === id);
}

function getStageMultiplier(dimension, stage) {
  return dimension.stage_modifiers?.[stage]?.multiplier || 1;
}

function toStageKey(rawStage) {
  if (!rawStage) return null;
  return String(rawStage)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getFunnelStages(source) {
  if (!source || typeof source !== 'object') return {};
  if (source.stages && typeof source.stages === 'object') return source.stages;
  return source;
}

function getFunnelStageValue(stages, stageKey) {
  if (!stageKey) return null;

  const direct = firstFinite(
    stages[stageKey],
    stages[stageKey.replace(/_/g, '-')],
    stages[stageKey.replace(/_/g, '')]
  );
  if (isFiniteNumber(direct)) return direct;

  const normalizedEntries = Object.entries(stages);
  for (const [key, value] of normalizedEntries) {
    if (toStageKey(key) === stageKey) {
      const numeric = toNumber(value);
      if (isFiniteNumber(numeric)) return numeric;
    }
  }

  return null;
}

function getBooleanSignal(initiative, ...paths) {
  for (const pathParts of paths) {
    let cursor = initiative;
    for (const part of pathParts.split('.')) {
      if (cursor && Object.prototype.hasOwnProperty.call(cursor, part)) {
        cursor = cursor[part];
      } else {
        cursor = undefined;
        break;
      }
    }

    if (typeof cursor === 'boolean') return cursor;
    if (typeof cursor === 'string') {
      const normalized = cursor.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    }
  }

  return false;
}

function buildContext(payload = {}) {
  return {
    company_context: payload.company_context || payload.context || {},
    active_objectives: payload.active_objectives || [],
    sales_funnel: payload.sales_funnel || payload.funnel || {},
    board_priorities: payload.board_priorities || []
  };
}

function getEffortWeeks(initiative) {
  const direct = firstFinite(
    initiative.estimated_effort_weeks,
    initiative.effort_weeks,
    initiative.effort?.weeks
  );
  if (isFiniteNumber(direct)) return direct;

  const effortLabel = String(
    initiative.estimated_effort || initiative.effort_level || initiative.effort || ''
  ).toLowerCase();

  if (effortLabel === 'low') return 2;
  if (effortLabel === 'medium') return 6;
  if (effortLabel === 'high') return 14;
  return 8;
}

function getDependencyCount(initiative) {
  return firstFinite(
    initiative.dependency_count,
    initiative.dependencies?.length,
    initiative.cross_functional_dependencies
  ) || 0;
}

function calculateFunnelLeverage(initiative, context, revenueDimension) {
  const config = revenueDimension.funnel_leverage || {};
  const stageKey = toStageKey(
    initiative.funnel_stage || initiative.target_funnel_stage || initiative.revenue_motion_stage
  );
  const stages = getFunnelStages(initiative.sales_funnel || context.sales_funnel);
  const stageVolume = getFunnelStageValue(stages, stageKey);
  const closedWon = getFunnelStageValue(stages, 'closed_won');
  const expectedLiftPct = clamp(
    normalizePercent(
      initiative.expected_conversion_lift_pct ||
      initiative.expected_lift_pct ||
      initiative.funnel_lift_pct ||
      initiative.funnel_improvement_pct ||
      0
    ),
    0,
    normalizePercent(config.expected_lift_cap_pct || 30)
  );
  const averageContractValue = firstFinite(
    initiative.average_contract_value,
    initiative.avg_contract_value,
    context.company_context.average_contract_value,
    context.company_context.acv,
    config.default_average_contract_value
  ) || 0;

  if (isFiniteNumber(initiative.funnel_leverage_estimate)) {
    const estimate = initiative.funnel_leverage_estimate;
    const thresholds = Array.isArray(config.bonus_thresholds) ? config.bonus_thresholds : [];
    const matched = thresholds.find((threshold) => estimate >= threshold.min_incremental_arr);

    return {
      bonus: matched ? matched.bonus : 0,
      incremental_arr: estimate,
      stage: stageKey,
      basis: 'provided_estimate'
    };
  }

  if (!stageKey || !isFiniteNumber(stageVolume) || stageVolume <= 0 || !isFiniteNumber(closedWon) || closedWon < 0) {
    return {
      bonus: 0,
      incremental_arr: 0,
      stage: stageKey,
      basis: 'insufficient_funnel_data'
    };
  }

  const downstreamConversion = clamp(closedWon / stageVolume, 0, 1);
  const stageWeight = config.stage_weights?.[stageKey] || 1;
  const incrementalWins = stageVolume * expectedLiftPct * downstreamConversion;
  const incrementalArr = incrementalWins * averageContractValue * stageWeight;
  const thresholds = Array.isArray(config.bonus_thresholds) ? config.bonus_thresholds : [];
  const matched = thresholds.find((threshold) => incrementalArr >= threshold.min_incremental_arr);
  const bonus = matched ? matched.bonus : 0;

  return {
    bonus,
    incremental_arr: round(incrementalArr, 0),
    expected_lift_pct: round(expectedLiftPct, 3),
    downstream_conversion: round(downstreamConversion, 3),
    stage: stageKey,
    basis: 'calculated'
  };
}

function scoreRevenueImpact(initiative, context, rubric) {
  const dimension = getDimension(rubric, 'revenue_impact');
  const estimatedArrImpact = firstFinite(
    initiative.estimated_arr_impact,
    initiative.expected_arr_impact,
    initiative.arr_impact,
    initiative.impact?.arr
  ) || 0;
  const timeToImpactMonths = firstFinite(
    initiative.time_to_impact_months,
    initiative.impact_window_months
  ) || 6;

  let baseScore = 2;
  if (estimatedArrImpact >= 2000000) baseScore = 19;
  else if (estimatedArrImpact >= 500000) baseScore = 16;
  else if (estimatedArrImpact >= 100000) baseScore = 12;
  else if (estimatedArrImpact > 0) baseScore = 7;

  if (timeToImpactMonths <= 3) baseScore += 1;
  else if (timeToImpactMonths >= 9) baseScore -= 2;

  const leverage = calculateFunnelLeverage(initiative, context, dimension);
  const raw = clamp(baseScore + leverage.bonus, 0, 20);
  const stage = context.company_context.stage;
  const stageMultiplier = getStageMultiplier(dimension, stage);
  const adjusted = clamp(raw * stageMultiplier, 0, 20);

  return {
    id: dimension.id,
    raw: round(raw),
    adjusted: round(adjusted),
    stage_multiplier: stageMultiplier,
    notes: [
      `Estimated ARR impact: ${Math.round(estimatedArrImpact)}`,
      `Time to impact: ${timeToImpactMonths} month(s)`,
      leverage.bonus > 0
        ? `Funnel leverage bonus: +${leverage.bonus}`
        : 'No incremental funnel leverage bonus applied'
    ],
    metadata: {
      estimated_arr_impact: estimatedArrImpact,
      time_to_impact_months: timeToImpactMonths,
      funnel_leverage: leverage
    }
  };
}

function scoreEffortCost(initiative, context, rubric) {
  const dimension = getDimension(rubric, 'effort_cost');
  const effortWeeks = getEffortWeeks(initiative);
  const dependencyCount = getDependencyCount(initiative);
  const requiresNewInfrastructure = getBooleanSignal(
    initiative,
    'requires_new_infrastructure',
    'delivery.requires_new_infrastructure'
  );
  const estimatedCost = firstFinite(
    initiative.estimated_cost_usd,
    initiative.cost_usd,
    initiative.budget_required_usd
  ) || 0;

  let raw = 12;
  if (effortWeeks > 20 || dependencyCount >= 4 || requiresNewInfrastructure) raw = 4;
  else if (effortWeeks > 10 || dependencyCount >= 3) raw = 8;
  else if (effortWeeks > 4 || dependencyCount >= 2) raw = 12;
  else if (effortWeeks > 1) raw = 16;
  else raw = 19;

  if (estimatedCost >= 250000) raw -= 2;
  else if (estimatedCost >= 100000) raw -= 1;

  raw = clamp(raw, 0, 20);

  const stage = context.company_context.stage;
  const stageMultiplier = getStageMultiplier(dimension, stage);
  const adjusted = clamp(raw * stageMultiplier, 0, 20);

  return {
    id: dimension.id,
    raw: round(raw),
    adjusted: round(adjusted),
    stage_multiplier: stageMultiplier,
    notes: [
      `Estimated effort: ${effortWeeks} week(s)`,
      `Dependencies: ${dependencyCount}`,
      requiresNewInfrastructure ? 'Requires new infrastructure' : 'Uses existing tooling'
    ],
    metadata: {
      effort_weeks: effortWeeks,
      dependency_count: dependencyCount,
      requires_new_infrastructure: requiresNewInfrastructure,
      estimated_cost_usd: estimatedCost
    }
  };
}

function scoreStrategicAlignment(initiative, context, rubric) {
  const dimension = getDimension(rubric, 'strategic_alignment');
  const alignedObjectiveIds = toArray(
    initiative.aligned_objective_ids ||
    initiative.objective_ids ||
    initiative.aligned_objectives
  );
  const activeObjectives = toArray(context.active_objectives);
  const matchedObjectives = activeObjectives.filter((objective) => {
    const objectiveId = objective.id || objective;
    return alignedObjectiveIds.includes(objectiveId);
  });

  const boardPriority = getBooleanSignal(
    initiative,
    'board_priority',
    'signals.board_priority',
    'is_board_priority'
  ) || context.board_priorities.includes(initiative.id) || context.board_priorities.includes(initiative.title);
  const multiObjectiveImpact = firstFinite(
    initiative.multi_objective_impact_count,
    initiative.cross_objective_impact_count,
    matchedObjectives.length
  ) || matchedObjectives.length;

  let raw = 4;
  if (matchedObjectives.length >= 1) raw = 12;
  if (matchedObjectives.length >= 1 && boardPriority) raw = 16;
  if (multiObjectiveImpact >= 2 || getBooleanSignal(initiative, 'critical_company_priority')) raw = 18;

  const stage = context.company_context.stage;
  const stageMultiplier = getStageMultiplier(dimension, stage);
  const adjusted = clamp(raw * stageMultiplier, 0, 20);

  const gtmModel = context.company_context.gtm_model;
  const gtmBonus = calculateGtmBonus(initiative, dimension, gtmModel);

  return {
    id: dimension.id,
    raw: round(raw),
    adjusted: round(adjusted),
    stage_multiplier: stageMultiplier,
    gtm_bonus: gtmBonus,
    notes: [
      `Aligned objectives: ${matchedObjectives.length}`,
      boardPriority ? 'Board priority alignment present' : 'No explicit board priority alignment',
      gtmBonus > 0 ? `GTM bridge bonus: +${gtmBonus}` : 'No GTM bridge bonus applied'
    ],
    metadata: {
      aligned_objective_ids: alignedObjectiveIds,
      matched_objective_count: matchedObjectives.length,
      board_priority: boardPriority,
      multi_objective_impact: multiObjectiveImpact
    }
  };
}

function calculateGtmBonus(initiative, dimension, gtmModel) {
  const modelConfig = dimension.gtm_model_modifiers?.[gtmModel];
  if (!modelConfig) return 0;

  const condition = modelConfig.bonus_if;
  if (condition === 'initiative_involves_product_led_activation') {
    return getBooleanSignal(initiative, 'product_led_activation', 'signals.product_led_activation') ? modelConfig.bonus : 0;
  }

  if (condition === 'initiative_involves_sales_enablement') {
    return getBooleanSignal(initiative, 'sales_enablement', 'signals.sales_enablement') ? modelConfig.bonus : 0;
  }

  if (condition === 'initiative_bridges_plg_and_slg') {
    const bridges = getBooleanSignal(
      initiative,
      'plg_slg_bridge',
      'signals.plg_slg_bridge',
      'bridges_plg_and_slg'
    ) || (
      getBooleanSignal(initiative, 'product_led_activation', 'signals.product_led_activation') &&
      getBooleanSignal(initiative, 'sales_enablement', 'signals.sales_enablement')
    );
    return bridges ? modelConfig.bonus : 0;
  }

  return 0;
}

function scoreTimingSensitivity(initiative, context, rubric) {
  const dimension = getDimension(rubric, 'timing_sensitivity');
  const gongConfig = dimension.gong_signal_integration || {};
  const gongSignals = initiative.gong_signals || initiative.competitive_signals || {};
  const competitiveDelta = normalizePercent(gongSignals.competitive_mentions_delta_pct || gongSignals.competitive_mentions_delta || 0);
  const lossCount = firstFinite(gongSignals.competitive_loss_count, gongSignals.loss_count, initiative.competitive_loss_count) || 0;
  const urgencyMentions = firstFinite(gongSignals.urgent_buying_language_count, gongSignals.urgent_mentions) || 0;
  const seasonalDeadlineDays = firstFinite(initiative.seasonal_deadline_days, initiative.market_window_days_remaining);
  const renewalWindowDays = firstFinite(initiative.renewal_window_days, initiative.contract_renewal_days);

  let raw = 4;
  if (seasonalDeadlineDays !== null && seasonalDeadlineDays <= 90) raw = 9;
  if (renewalWindowDays !== null && renewalWindowDays <= 60) raw = 13;
  if ((seasonalDeadlineDays !== null && seasonalDeadlineDays <= 45) || (renewalWindowDays !== null && renewalWindowDays <= 30)) raw = 16;

  const weights = gongConfig.weights || {};
  const thresholds = gongConfig.thresholds || {};
  let gongUrgency = 0;

  gongUrgency += weightedThresholdScore(
    competitiveDelta,
    thresholds.competitive_mentions_delta_pct,
    weights.competitive_mentions_delta_pct
  );
  gongUrgency += weightedThresholdScore(
    lossCount,
    thresholds.competitive_loss_count,
    weights.competitive_loss_count
  );
  gongUrgency += weightedThresholdScore(
    urgencyMentions,
    thresholds.urgent_buying_language_count,
    weights.urgent_buying_language_count
  );

  raw = clamp(raw + gongUrgency * 8, 0, 20);

  const stage = context.company_context.stage;
  const stageMultiplier = getStageMultiplier(dimension, stage);
  const adjusted = clamp(raw * stageMultiplier, 0, 20);

  return {
    id: dimension.id,
    raw: round(raw),
    adjusted: round(adjusted),
    stage_multiplier: stageMultiplier,
    notes: [
      `Competitive delta: ${round(competitiveDelta * 100)}%`,
      `Competitive losses: ${lossCount}`,
      `Urgency mentions: ${urgencyMentions}`
    ],
    metadata: {
      seasonal_deadline_days: seasonalDeadlineDays,
      renewal_window_days: renewalWindowDays,
      gong_urgency_signal: round(gongUrgency, 3)
    }
  };
}

function weightedThresholdScore(value, thresholdConfig = {}, weight = 0) {
  if (!weight || !isFiniteNumber(value)) return 0;
  if (value >= thresholdConfig.high) return weight;
  if (value >= thresholdConfig.medium) return weight * 0.6;
  return 0;
}

function scoreConfidenceDataQuality(initiative, context, rubric) {
  const dimension = getDimension(rubric, 'confidence_data_quality');
  const queryEvidenceCount = firstFinite(
    initiative.query_evidence_count,
    initiative.evidence?.query_count,
    initiative.supporting_metrics_with_evidence
  ) || 0;
  const benchmarkCoverage = clamp(
    normalizePercent(
      initiative.benchmark_coverage_pct ||
      initiative.benchmark_coverage ||
      initiative.evidence?.benchmark_coverage_pct ||
      0
    ),
    0,
    1
  );
  const historicalAnalogCount = firstFinite(
    initiative.historical_analog_count,
    initiative.historical_analogs,
    initiative.evidence?.historical_analog_count
  ) || 0;
  const dataFreshnessDays = firstFinite(
    initiative.data_freshness_days,
    initiative.evidence?.data_freshness_days
  );

  let raw = 4;
  if (benchmarkCoverage >= 0.25 || queryEvidenceCount >= 1) raw = 9;
  if (benchmarkCoverage >= 0.5 && queryEvidenceCount >= 2) raw = 13;
  if (benchmarkCoverage >= 0.75 && queryEvidenceCount >= 3 && historicalAnalogCount >= 1) raw = 16;
  if (benchmarkCoverage >= 0.85 && queryEvidenceCount >= 4 && historicalAnalogCount >= 2) raw = 19;

  if (isFiniteNumber(dataFreshnessDays) && dataFreshnessDays > 30) raw -= 2;
  if (getBooleanSignal(initiative, 'uses_manual_baseline', 'evidence.uses_manual_baseline')) raw -= 3;

  raw = clamp(raw, 0, 20);

  const stage = context.company_context.stage;
  const stageMultiplier = getStageMultiplier(dimension, stage);
  const adjusted = clamp(raw * stageMultiplier, 0, 20);

  return {
    id: dimension.id,
    raw: round(raw),
    adjusted: round(adjusted),
    stage_multiplier: stageMultiplier,
    notes: [
      `Query evidence count: ${queryEvidenceCount}`,
      `Benchmark coverage: ${round(benchmarkCoverage * 100)}%`,
      `Historical analogs: ${historicalAnalogCount}`
    ],
    metadata: {
      query_evidence_count: queryEvidenceCount,
      benchmark_coverage: round(benchmarkCoverage, 3),
      historical_analog_count: historicalAnalogCount,
      data_freshness_days: dataFreshnessDays
    }
  };
}

function classifyScore(rubric, totalScore) {
  const thresholds = Object.entries(rubric.thresholds || {})
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.min - left.min);

  return thresholds.find((threshold) => totalScore >= threshold.min) || null;
}

function buildScoringBreakdown(dimensions, total) {
  return {
    revenue_impact: dimensions.revenue_impact.adjusted,
    effort_cost: dimensions.effort_cost.adjusted,
    strategic_alignment: dimensions.strategic_alignment.adjusted,
    timing_sensitivity: dimensions.timing_sensitivity.adjusted,
    confidence_data_quality: dimensions.confidence_data_quality.adjusted,
    total
  };
}

function scoreInitiative(initiativePayload, rubric = loadRubric()) {
  const context = buildContext(initiativePayload);
  const initiative = initiativePayload.initiative || initiativePayload;

  const dimensions = {
    revenue_impact: scoreRevenueImpact(initiative, context, rubric),
    effort_cost: scoreEffortCost(initiative, context, rubric),
    strategic_alignment: scoreStrategicAlignment(initiative, context, rubric),
    timing_sensitivity: scoreTimingSensitivity(initiative, context, rubric),
    confidence_data_quality: scoreConfidenceDataQuality(initiative, context, rubric)
  };

  const gtmBonus = dimensions.strategic_alignment.gtm_bonus || 0;
  const subtotal = Object.values(dimensions).reduce((sum, dimension) => sum + dimension.adjusted, 0);
  const total = clamp(round(subtotal + gtmBonus), 0, rubric.total_possible || 100);
  const classification = classifyScore(rubric, total);
  const funnelLeverageEstimate = dimensions.revenue_impact.metadata.funnel_leverage.bonus || 0;

  return {
    initiative: {
      ...initiative,
      priority_score: total,
      funnel_leverage_estimate: funnelLeverageEstimate,
      scoring_breakdown: buildScoringBreakdown(dimensions, total)
    },
    context,
    dimension_details: dimensions,
    bonuses: {
      gtm_model_bonus: gtmBonus
    },
    recommendation: classification,
    score_version: rubric.version,
    composite_formula: rubric.composite_formula
  };
}

function normalizeBatchPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      company_context: {},
      active_objectives: [],
      sales_funnel: {},
      board_priorities: [],
      initiatives: payload
    };
  }

  return {
    company_context: payload.company_context || payload.context || {},
    active_objectives: payload.active_objectives || [],
    sales_funnel: payload.sales_funnel || payload.funnel || {},
    board_priorities: payload.board_priorities || [],
    initiatives: payload.initiatives || []
  };
}

function scoreBatch(payload, rubric = loadRubric()) {
  const batch = normalizeBatchPayload(payload);
  const scored = batch.initiatives.map((initiative) => scoreInitiative({
    company_context: batch.company_context,
    active_objectives: batch.active_objectives,
    sales_funnel: batch.sales_funnel,
    board_priorities: batch.board_priorities,
    initiative
  }, rubric));

  return {
    company_context: batch.company_context,
    initiatives_scored: scored.length,
    scored_initiatives: scored
  };
}

function rankInitiatives(payload, rubric = loadRubric()) {
  const scoredBatch = scoreBatch(payload, rubric);
  const ranked = [...scoredBatch.scored_initiatives]
    .sort((left, right) => right.initiative.priority_score - left.initiative.priority_score)
    .map((entry, index) => ({
      rank: index + 1,
      id: entry.initiative.id || null,
      title: entry.initiative.title || null,
      owner: entry.initiative.owner || null,
      total_score: entry.initiative.priority_score,
      recommendation: entry.recommendation?.label || null,
      funnel_leverage_estimate: entry.initiative.funnel_leverage_estimate
    }));

  return {
    initiatives_ranked: ranked.length,
    ranked_initiatives: ranked,
    scored_initiatives: scoredBatch.scored_initiatives
  };
}

function requireOption(options, key, usage) {
  if (!options[key]) {
    console.error(usage);
    process.exit(1);
  }
}

function runCli() {
  const [, , command, ...rest] = process.argv;
  const options = parseArgs(rest);
  const rubricPath = options.rubric ? path.resolve(options.rubric) : DEFAULT_RUBRIC_PATH;
  const rubric = loadRubric(rubricPath);

  switch (command) {
    case 'score': {
      requireOption(options, 'initiative', 'Usage: okr-initiative-scorer.js score --initiative <file> [--rubric <file>]');
      const payload = loadJson(path.resolve(options.initiative));
      console.log(JSON.stringify(scoreInitiative(payload, rubric), null, 2));
      break;
    }
    case 'batch-score': {
      requireOption(options, 'input', 'Usage: okr-initiative-scorer.js batch-score --input <file> [--rubric <file>]');
      const payload = loadJson(path.resolve(options.input));
      console.log(JSON.stringify(scoreBatch(payload, rubric), null, 2));
      break;
    }
    case 'rank': {
      requireOption(options, 'input', 'Usage: okr-initiative-scorer.js rank --input <file> [--rubric <file>]');
      const payload = loadJson(path.resolve(options.input));
      console.log(JSON.stringify(rankInitiatives(payload, rubric), null, 2));
      break;
    }
    default:
      console.error(
        'Usage: okr-initiative-scorer.js <score|batch-score|rank> ' +
        '[--initiative <file> | --input <file>] [--rubric <file>]'
      );
      process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  DEFAULT_RUBRIC_PATH,
  calculateFunnelLeverage,
  loadRubric,
  rankInitiatives,
  scoreBatch,
  scoreInitiative
};
