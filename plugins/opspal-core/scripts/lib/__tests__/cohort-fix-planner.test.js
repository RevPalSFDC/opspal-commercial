const { CohortFixPlanner } = require('../cohort-fix-planner');
const { validateImprovementPlan, planSchema } = require('../improvement-plan-validator');

describe('cohort-fix-planner improvement-plan item generation', () => {
  it('generates a validator-compliant implementation item for a cohort', async () => {
    const planner = new CohortFixPlanner();
    const planItem = await planner.generateImprovementPlanItem({
      id: 'config-env',
      cohortType: 'config-env',
      taxonomy: 'config/env',
      priority: 'HIGH',
      total_roi: 9000,
      frequency: 2,
      root_causes: ['The update manager invokes plugin commands without an external-mode guard.'],
      affected_components: ['plugins/opspal-core/scripts/opspal-update-manager.sh'],
      reflections: [
        { id: 'r1', org: 'internal' },
        { id: 'r2', org: 'Client-A' }
      ]
    });

    const validation = validateImprovementPlan({
      schema_version: planSchema.properties.schema_version.const,
      generated_at: '2026-03-14T00:00:00.000Z',
      title: 'Reflection Improvement Plan',
      summary: {
        total_reflections_analyzed: 2,
        implementation_ready_items: 1,
        triage_items: 0,
        aggregate_roi_annual: planItem.expected_roi_annual,
        estimated_effort_hours: planItem.estimated_effort_hours
      },
      plan_items: [planItem],
      triage_items: [],
      execution_boundary: {
        planning_complete: true,
        task_creation_is_downstream: true,
        downstream_task_system: 'asana'
      }
    });

    expect(validation.valid).toBe(true);
    expect(planItem.recommended_fix).not.toMatch(/TBD|to be determined/i);
    expect(planItem.recommended_fix).not.toMatch(/Asana|Phase 2/i);
  });
});
