const {
  validateImprovementPlan,
  planSchema
} = require('../improvement-plan-validator');

function buildValidPlan() {
  return {
    schema_version: planSchema.properties.schema_version.const,
    generated_at: '2026-03-14T00:00:00.000Z',
    title: 'Reflection Improvement Plan',
    summary: {
      total_reflections_analyzed: 4,
      implementation_ready_items: 1,
      triage_items: 1,
      aggregate_roi_annual: 18000,
      estimated_effort_hours: 10
    },
    plan_items: [
      {
        id: 'plan-item-1',
        source_cohort_ids: ['cohort-1'],
        taxonomy: 'config/env',
        issue_summary: 'Guard nested plugin execution before downstream tasking begins',
        evidence: {
          pattern: 'The same nested plugin execution failure appears across multiple config/env reflections.',
          reflection_count: 2,
          reflection_ids: ['r1', 'r2'],
          affected_orgs: ['internal'],
          recurrence_count: 2
        },
        likely_root_cause: 'The update manager does not validate external mode before invoking plugin commands.',
        recommended_fix: 'Add an external-mode preflight guard before any plugin command runs.',
        prevention_safeguard: 'Fail fast during preflight and cover the behavior with a regression test.',
        implementation_steps: [
          'Add the external-mode guard to the update manager entrypoint.',
          'Add a regression test for nested plugin execution.'
        ],
        owner_suggestion: 'OpsPal maintainers',
        priority: 'P1',
        success_criteria: [
          'Nested execution is blocked before any plugin command runs.',
          'Regression coverage proves the guard remains active.'
        ],
        estimated_effort_hours: 10,
        expected_roi_annual: 18000,
        affected_components: ['plugins/opspal-core/scripts/opspal-update-manager.sh']
      }
    ],
    triage_items: [
      {
        cohort_id: 'cohort-2',
        taxonomy: 'external-api',
        status: 'blocked_external_dependency',
        issue_summary: 'External API capability gap requires manual fallback',
        reason: 'The required vendor action is not exposed through the API.',
        required_dependency: 'Vendor confirmation or a documented manual fallback for the missing API action.',
        recommended_next_step: 'Confirm the external limitation and attach the manual runbook before re-planning.',
        reflection_ids: ['r3', 'r4']
      }
    ],
    execution_boundary: {
      planning_complete: true,
      task_creation_is_downstream: true,
      downstream_task_system: 'asana'
    }
  };
}

describe('improvement-plan-validator', () => {
  it('accepts a fully-specified improvement plan', () => {
    const validation = validateImprovementPlan(buildValidPlan());
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('rejects placeholder and vague filler in required plan fields', () => {
    const plan = buildValidPlan();
    plan.plan_items[0].recommended_fix = 'TBD';
    plan.plan_items[0].implementation_steps = ['review required'];

    const validation = validateImprovementPlan(plan);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toContain('placeholder text');
    expect(validation.errors.join('\n')).toContain('vague filler text');
  });

  it('rejects self-referential workflow critique in user-facing plan content', () => {
    const plan = buildValidPlan();
    plan.plan_items[0].recommended_fix = 'This workflow needs orchestration mechanics cleanup before we can do anything else.';

    const validation = validateImprovementPlan(plan);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toContain('self-referential workflow critique');
  });
});
