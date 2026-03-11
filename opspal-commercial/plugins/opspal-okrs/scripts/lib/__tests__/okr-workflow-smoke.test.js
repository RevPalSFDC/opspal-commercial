'use strict';

const fs = require('fs');
const path = require('path');

const { rankInitiatives } = require('../okr-initiative-scorer');
const {
  calibrationReport,
  ensureStoreShape,
  getAdjustment,
  recordOutcome
} = require('../okr-outcome-calibrator');
const {
  createCycle,
  getStatus,
  transitionState
} = require('../okr-state-manager');

const pluginRoot = path.resolve(__dirname, '..', '..', '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');

const outcomesPath = path.join(pluginRoot, 'config', 'okr-outcomes.json');
const okrRoutingPath = path.join(pluginRoot, 'config', 'okr-routing-keywords.json');
const coreRoutingPath = path.join(repoRoot, 'plugins', 'opspal-core', 'config', 'routing-patterns.json');

const originalOutcomes = fs.readFileSync(outcomesPath, 'utf8');
const smokeOrg = `smoke-okrs-phase3-${process.pid}`;
const smokeCycle = 'Q4-2026';
const smokeOrgDir = path.join(repoRoot, 'orgs', smokeOrg);
const smokeCycleDir = path.join(smokeOrgDir, 'platforms', 'okr', smokeCycle);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resetSmokeWorkspace() {
  fs.rmSync(smokeOrgDir, { recursive: true, force: true });
  fs.writeFileSync(
    outcomesPath,
    JSON.stringify(ensureStoreShape({ outcomes: [], metric_priors: {} }), null, 2)
  );
}

describe('okr workflow smoke', () => {
  beforeEach(() => {
    resetSmokeWorkspace();
  });

  afterAll(() => {
    fs.rmSync(smokeOrgDir, { recursive: true, force: true });
    fs.writeFileSync(outcomesPath, originalOutcomes);
  });

  test('wires Phase 3 commands and keyword routes to the expected agents', () => {
    const coreRouting = readJson(coreRoutingPath);
    const okrRouting = readJson(okrRoutingPath);
    const keywordPatterns = Object.fromEntries(
      okrRouting.patterns.map((pattern) => [pattern.pattern_id, pattern])
    );

    expect(coreRouting.exclusiveKeywords.mappings.okr).toBe('opspal-okrs:okr-strategy-orchestrator');
    expect(coreRouting.commandToAgentMapping.mappings['/okr-plg-signals']).toBe('opspal-okrs:okr-plg-specialist');
    expect(coreRouting.commandToAgentMapping.mappings['/okr-retrospective']).toBe('opspal-okrs:okr-learning-engine');
    expect(coreRouting.commandToAgentMapping.mappings['/okr-benchmark']).toBe('opspal-okrs:okr-initiative-evaluator');
    expect(coreRouting.commandToAgentMapping.mappings['/okr-history']).toBe('opspal-okrs:okr-learning-engine');

    expect(keywordPatterns['okr-learning-engine'].agent).toBe('opspal-okrs:okr-learning-engine');
    expect(keywordPatterns['okr-plg-signals'].agent).toBe('opspal-okrs:okr-plg-specialist');
    expect(keywordPatterns['okr-benchmarking'].agent).toBe('opspal-okrs:okr-initiative-evaluator');

    // Phase 4 command→agent mappings
    expect(coreRouting.commandToAgentMapping.mappings['/okr-dashboard']).toBe('opspal-okrs:okr-dashboard-generator');
    expect(coreRouting.commandToAgentMapping.mappings['/okr-cadence']).toBe('opspal-okrs:okr-cadence-manager');
    expect(coreRouting.commandToAgentMapping.mappings['/okr-align-check']).toBe('opspal-okrs:okr-alignment-auditor');

    // Phase 4 keyword→agent patterns
    expect(keywordPatterns['okr-dashboard'].agent).toBe('opspal-okrs:okr-dashboard-generator');
    expect(keywordPatterns['okr-cadence'].agent).toBe('opspal-okrs:okr-cadence-manager');
    expect(keywordPatterns['okr-alignment'].agent).toBe('opspal-okrs:okr-alignment-auditor');
  });

  test('ranks a backlog through the initiative scorer CLI', () => {
    const ranked = rankInitiatives({
      company_context: {
        stage: 'series-b',
        gtm_model: 'hybrid',
        average_contract_value: 55000
      },
      active_objectives: [{ id: 'OBJ-001' }],
      sales_funnel: {
        stages: {
          visitor: 25000,
          signup: 1700,
          pql: 430,
          sql: 160,
          opportunity: 52,
          closed_won: 14
        }
      },
      initiatives: [
        {
          id: 'INIT-HIGH',
          title: 'Tighten PQL to sales acceptance handoff',
          owner: 'revops',
          estimated_arr_impact: 850000,
          time_to_impact_months: 2,
          estimated_effort_weeks: 5,
          dependency_count: 1,
          aligned_objective_ids: ['OBJ-001'],
          board_priority: true,
          plg_slg_bridge: true,
          funnel_stage: 'pql',
          expected_conversion_lift_pct: 12,
          query_evidence_count: 4,
          benchmark_coverage_pct: 0.8,
          historical_analog_count: 2
        },
        {
          id: 'INIT-LOW',
          title: 'Refresh one enablement deck',
          owner: 'sales',
          estimated_arr_impact: 30000,
          time_to_impact_months: 8,
          estimated_effort_weeks: 2,
          dependency_count: 0,
          query_evidence_count: 1,
          benchmark_coverage_pct: 0.1,
          historical_analog_count: 0
        }
      ]
    });

    expect(ranked.initiatives_ranked).toBe(2);
    expect(ranked.ranked_initiatives[0].id).toBe('INIT-HIGH');
    expect(ranked.ranked_initiatives[0].total_score).toBeGreaterThan(ranked.ranked_initiatives[1].total_score);
  });

  test('runs a close-cycle learning flow through the lifecycle and calibration CLIs', () => {
    const created = createCycle(smokeOrg, smokeCycle);
    expect(created.success).toBe(true);
    expect(created.status).toBe('draft');

    for (const nextState of ['scoring', 'approved', 'active', 'closed']) {
      const transition = transitionState(smokeOrg, smokeCycle, nextState);
      expect(transition.success).toBe(true);
      expect(transition.to).toBe(nextState);
    }

    const approvedFile = path.join(smokeCycleDir, 'approved', `okr-${smokeCycle}.json`);
    fs.writeFileSync(approvedFile, JSON.stringify({
      org: smokeOrg,
      cycle: smokeCycle,
      status: 'closed',
      stance: 'base',
      company_context: {
        stage: 'series-b',
        gtm_model: 'hybrid'
      },
      objectives: [
        {
          id: 'OBJ-001',
          key_results: [
            {
              id: 'KR-001',
              metric_id: 'activation_rate',
              target: 0.4,
              current: 0.34,
              baseline: { value: 0.24 }
            },
            {
              id: 'KR-002',
              metric_id: 'pql_to_sql_rate',
              target: 0.25,
              current: 0.29,
              baseline: { value: 0.18 }
            }
          ]
        }
      ]
    }, null, 2));

    const recorded = recordOutcome(smokeOrg, smokeCycle);
    const closedStatus = getStatus(smokeOrg, smokeCycle);
    const history = calibrationReport(smokeOrg);
    const activationAdjustment = getAdjustment(smokeOrg, 'activation_rate');
    const pqlAdjustment = getAdjustment(smokeOrg, 'pql_to_sql_rate');

    expect(closedStatus.status).toBe('closed');
    expect(recorded.success).toBe(true);
    expect(recorded.krs_recorded).toBe(2);
    expect(recorded.hits).toBe(1);
    expect(recorded.partials).toBe(1);
    expect(recorded.misses).toBe(0);

    expect(history.cycles_completed).toBe(1);
    expect(history.metric_calibrations.activation_rate.recommended_adjustment).toBe('lower_targets');
    expect(history.metric_calibrations.pql_to_sql_rate.recommended_adjustment).toBe('raise_targets');
    expect(history.learning_warning).toContain('1 cycle');

    expect(activationAdjustment.recommended_adjustment).toBe('lower_targets');
    expect(activationAdjustment.confidence).toBe('LOW');
    expect(pqlAdjustment.recommended_adjustment).toBe('raise_targets');
    expect(pqlAdjustment.confidence).toBe('LOW');
  });
});
