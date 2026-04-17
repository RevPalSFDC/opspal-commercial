'use strict';

/**
 * Regression tests for /processreflections Phase 1 plan generator
 *
 * Guard: recommended_fix must be composed per-cohort from only that cohort's
 * own reflections' issue data. The 2026-04-17 plan showed cohorts 1-8 all
 * citing the same CampaignMemberStatus guard-before-destructive-DML text
 * because a single reflection with that fix text appeared in multiple cohorts
 * and the generator broadcast its fix to all of them.
 *
 * These tests drive the fix in:
 *   plugins/opspal-core/scripts/lib/cohort-fix-planner.js
 *   → CohortFixPlanner.generateImprovementPlanItem()
 *   → CohortFixPlanner._extractPerCohortRecommendedFix()
 */

const path = require('path');
const { CohortFixPlanner } = require('../scripts/lib/cohort-fix-planner');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeReflection(id, taxonomy, rootCause, recommendedFix) {
  return {
    id,
    taxonomy,
    root_cause: rootCause,
    // Reflections carry issues_identified in data.issues_identified (Supabase schema)
    data: {
      issues_identified: [
        {
          taxonomy,
          root_cause: rootCause,
          recommended_fix: recommendedFix,
          agnostic_fix: recommendedFix
        }
      ]
    },
    // Also expose issues directly (alternate schema used in some code paths)
    issues: [
      {
        taxonomy,
        root_cause: rootCause,
        recommended_fix: recommendedFix,
        agnostic_fix: recommendedFix
      }
    ]
  };
}

function makeCohortData(taxonomy, reflections) {
  return {
    id: `cohort-${taxonomy}`,
    cohort_id: `cohort-${taxonomy}`,
    taxonomy,
    cohortType: taxonomy.replace(/\//g, '-'),
    reflections,
    root_causes: reflections.map(r => r.root_cause).filter(Boolean),
    root_cause_summary: reflections[0]?.root_cause || '',
    affected_components: ['configuration', 'data'],
    frequency: reflections.length,
    total_roi: 0,
    priority: 'HIGH'
  };
}

// ---------------------------------------------------------------------------
// Two-cohort fixture: data-quality vs config/env
// ---------------------------------------------------------------------------

const R_DATA_QUALITY_1 = makeReflection(
  'dq-r1',
  'data-quality',
  'Hardcoded Territory2 ID in Apex test returns null',
  'Replace hardcoded ID with dynamic query on Territory2'
);

const R_DATA_QUALITY_2 = makeReflection(
  'dq-r2',
  'data-quality',
  'Hardcoded Territory2 ID causes null pointer in bulk test',
  'Replace hardcoded ID with dynamic query on Territory2'
);

const R_CONFIG_ENV_1 = makeReflection(
  'env-r1',
  'config/env',
  'runbook-observer writes to plugin dir not workspace',
  'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse'
);

const R_CONFIG_ENV_2 = makeReflection(
  'env-r2',
  'config/env',
  'hook writes output to wrong directory under CI',
  'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse'
);

// ---------------------------------------------------------------------------
// Helper: run generateImprovementPlanItem for a cohort
// ---------------------------------------------------------------------------

async function generatePlanItem(cohortData) {
  const planner = new CohortFixPlanner();
  return planner.generateImprovementPlanItem(cohortData);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('process-reflections-phase1: per-cohort recommended_fix', () => {

  // Test 1: cohorts with distinct reflections must produce distinct fix text
  test('cohorts have distinct recommended_fix text when reflections differ', async () => {
    const dqCohort = makeCohortData('data-quality', [R_DATA_QUALITY_1, R_DATA_QUALITY_2]);
    const envCohort = makeCohortData('config/env', [R_CONFIG_ENV_1, R_CONFIG_ENV_2]);

    const dqItem = await generatePlanItem(dqCohort);
    const envItem = await generatePlanItem(envCohort);

    // The two cohorts must not share the same recommended_fix
    expect(dqItem.recommended_fix).not.toBe(envItem.recommended_fix);
  }, 15000);

  // Test 2: each cohort's fix text must reference its own root-cause vocabulary
  test('data-quality cohort recommended_fix references territory/hardcoded vocabulary', async () => {
    const dqCohort = makeCohortData('data-quality', [R_DATA_QUALITY_1, R_DATA_QUALITY_2]);
    const dqItem = await generatePlanItem(dqCohort);

    expect(dqItem.recommended_fix.toLowerCase()).toMatch(/territory|hardcoded|dynamic query/);
  }, 15000);

  test('config/env cohort recommended_fix references runbook/workspace/path vocabulary', async () => {
    const envCohort = makeCohortData('config/env', [R_CONFIG_ENV_1, R_CONFIG_ENV_2]);
    const envItem = await generatePlanItem(envCohort);

    expect(envItem.recommended_fix.toLowerCase()).toMatch(/runbook|workspace|claude_project_root|git.?rev.?parse|resolve path/i);
  }, 15000);

  // Test 3: data-quality cohort must NOT contain config/env vocabulary
  test('data-quality cohort recommended_fix does not contain config/env vocabulary', async () => {
    const dqCohort = makeCohortData('data-quality', [R_DATA_QUALITY_1, R_DATA_QUALITY_2]);
    const dqItem = await generatePlanItem(dqCohort);

    expect(dqItem.recommended_fix.toLowerCase()).not.toMatch(/runbook.observer|git.?rev.?parse|claude_project_root/i);
  }, 15000);

  // Test 4: config/env cohort must NOT contain data-quality vocabulary
  test('config/env cohort recommended_fix does not contain data-quality/territory vocabulary', async () => {
    const envCohort = makeCohortData('config/env', [R_CONFIG_ENV_1, R_CONFIG_ENV_2]);
    const envItem = await generatePlanItem(envCohort);

    expect(envItem.recommended_fix.toLowerCase()).not.toMatch(/territory2|hardcoded territory/i);
  }, 15000);

  // Test 5: single-reflection cohort uses that reflection's own fix text verbatim
  test('single-reflection cohort uses that reflection own fix text', async () => {
    const singleReflection = makeReflection(
      'solo-r1',
      'tool-contract',
      'CampaignMemberStatus guard missing before DML delete',
      'Guard before destructive DML: ensure replacement records exist BEFORE delete'
    );
    const cohort = makeCohortData('tool-contract', [singleReflection]);
    const item = await generatePlanItem(cohort);

    // The unique vocabulary from this reflection's fix must appear
    expect(item.recommended_fix.toLowerCase()).toMatch(/guard|delete|replacement|dml/i);
  }, 15000);

  // Test 6: a reflection that spans two taxonomies does not bleed into the wrong cohort
  test('cross-taxonomy reflection fix text does not bleed into unrelated cohort', async () => {
    // This reflection has issues spanning BOTH tool-contract AND config/env
    const crossReflection = {
      id: 'cross-r1',
      taxonomy: 'tool-contract',
      root_cause: 'CampaignMemberStatus guard missing before DML delete',
      data: {
        issues_identified: [
          {
            taxonomy: 'tool-contract',
            root_cause: 'CampaignMemberStatus guard missing',
            recommended_fix: 'Guard before destructive DML: ensure CampaignMemberStatus records exist BEFORE delete',
            agnostic_fix: 'Guard before destructive DML: ensure CampaignMemberStatus records exist BEFORE delete'
          },
          {
            taxonomy: 'config/env',
            root_cause: 'runbook-observer writes to plugin dir',
            recommended_fix: 'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse',
            agnostic_fix: 'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse'
          }
        ]
      },
      issues: [
        {
          taxonomy: 'tool-contract',
          root_cause: 'CampaignMemberStatus guard missing',
          recommended_fix: 'Guard before destructive DML: ensure CampaignMemberStatus records exist BEFORE delete',
          agnostic_fix: 'Guard before destructive DML: ensure CampaignMemberStatus records exist BEFORE delete'
        },
        {
          taxonomy: 'config/env',
          root_cause: 'runbook-observer writes to plugin dir',
          recommended_fix: 'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse',
          agnostic_fix: 'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse'
        }
      ]
    };

    // This plain config/env reflection (no cross-taxonomy issues)
    const pureEnvReflection = makeReflection(
      'env-only-r1',
      'config/env',
      'hook writes output to wrong directory',
      'Resolve path via CLAUDE_PROJECT_ROOT or git rev-parse'
    );

    // config/env cohort contains BOTH the cross-taxonomy reflection and a pure env reflection
    const envCohort = makeCohortData('config/env', [crossReflection, pureEnvReflection]);
    const envItem = await generatePlanItem(envCohort);

    // The config/env cohort fix must NOT contain the tool-contract CampaignMemberStatus text
    // from the cross-taxonomy reflection's OTHER issue
    expect(envItem.recommended_fix.toLowerCase()).not.toMatch(/campaignmemberstatus|guard before destructive dml/i);
  }, 15000);

});
