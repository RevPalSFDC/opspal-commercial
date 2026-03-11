'use strict';

const {
  calculateFunnelLeverage,
  loadRubric,
  rankInitiatives,
  scoreInitiative
} = require('../okr-initiative-scorer');

describe('okr-initiative-scorer', () => {
  const rubric = loadRubric();

  test('applies funnel leverage and hybrid GTM bonus for bridge initiatives', () => {
    const result = scoreInitiative({
      company_context: {
        stage: 'series-b',
        gtm_model: 'hybrid',
        average_contract_value: 50000
      },
      active_objectives: [{ id: 'OBJ-001' }, { id: 'OBJ-002' }],
      sales_funnel: {
        stages: {
          visitor: 20000,
          signup: 1800,
          pql: 420,
          sql: 150,
          opportunity: 45,
          closed_won: 12
        }
      },
      initiative: {
        id: 'INIT-001',
        title: 'Tighten PQL handoff for enterprise expansion',
        owner: 'revops',
        estimated_arr_impact: 900000,
        time_to_impact_months: 2,
        estimated_effort_weeks: 5,
        dependency_count: 1,
        aligned_objective_ids: ['OBJ-001', 'OBJ-002'],
        board_priority: true,
        plg_slg_bridge: true,
        funnel_stage: 'pql',
        expected_conversion_lift_pct: 12,
        gong_signals: {
          competitive_mentions_delta_pct: 0.22,
          competitive_loss_count: 3,
          urgent_buying_language_count: 4
        },
        query_evidence_count: 4,
        benchmark_coverage_pct: 0.8,
        historical_analog_count: 2
      }
    }, rubric);

    expect(result.initiative.priority_score).toBeGreaterThanOrEqual(70);
    expect(result.bonuses.gtm_model_bonus).toBe(4);
    expect(result.initiative.funnel_leverage_estimate).toBeGreaterThan(0);
    expect(result.dimension_details.revenue_impact.metadata.funnel_leverage.bonus).toBeGreaterThan(0);
  });

  test('seed companies receive stronger revenue-impact stage multiplier', () => {
    const commonInitiative = {
      initiative: {
        id: 'INIT-002',
        title: 'Automate expansion propensity alerts',
        owner: 'cs',
        estimated_arr_impact: 250000,
        time_to_impact_months: 4,
        estimated_effort_weeks: 3,
        dependency_count: 1,
        query_evidence_count: 2,
        benchmark_coverage_pct: 0.45,
        historical_analog_count: 0
      }
    };

    const seed = scoreInitiative({
      ...commonInitiative,
      company_context: { stage: 'seed', gtm_model: 'slg' }
    }, rubric);

    const scale = scoreInitiative({
      ...commonInitiative,
      company_context: { stage: 'scale', gtm_model: 'slg' }
    }, rubric);

    expect(seed.dimension_details.revenue_impact.adjusted).toBeGreaterThan(scale.dimension_details.revenue_impact.adjusted);
  });

  test('rank returns initiatives sorted by descending score', () => {
    const ranked = rankInitiatives({
      company_context: {
        stage: 'series-b',
        gtm_model: 'slg'
      },
      initiatives: [
        {
          id: 'INIT-LOW',
          title: 'Refresh one enablement deck',
          owner: 'sales',
          estimated_arr_impact: 25000,
          time_to_impact_months: 8,
          estimated_effort_weeks: 2,
          dependency_count: 0,
          query_evidence_count: 1,
          benchmark_coverage_pct: 0.1,
          historical_analog_count: 0
        },
        {
          id: 'INIT-HIGH',
          title: 'Rescue enterprise renewals with targeted expansion plays',
          owner: 'cs',
          estimated_arr_impact: 1200000,
          time_to_impact_months: 2,
          estimated_effort_weeks: 4,
          dependency_count: 1,
          board_priority: true,
          aligned_objective_ids: ['OBJ-001'],
          query_evidence_count: 3,
          benchmark_coverage_pct: 0.7,
          historical_analog_count: 1,
          renewal_window_days: 25,
          competitive_loss_count: 2
        }
      ],
      active_objectives: [{ id: 'OBJ-001' }]
    }, rubric);

    expect(ranked.ranked_initiatives[0].id).toBe('INIT-HIGH');
    expect(ranked.ranked_initiatives[0].total_score).toBeGreaterThan(ranked.ranked_initiatives[1].total_score);
  });

  test('supports provided funnel leverage estimates when funnel data is unavailable', () => {
    const leverage = calculateFunnelLeverage({
      funnel_leverage_estimate: 800000
    }, { company_context: {} }, rubric.dimensions[0]);

    expect(leverage.basis).toBe('provided_estimate');
    expect(leverage.bonus).toBeGreaterThan(0);
  });
});
