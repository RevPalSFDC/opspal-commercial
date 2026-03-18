const {
  buildImprovementPlanBundle,
  buildTriageItems
} = require('../improvement-plan-builder');

describe('improvement-plan-builder', () => {
  it('builds a strict implementation-ready bundle without Asana or placeholder text in markdown', () => {
    const reflections = [
      { id: 'r1', taxonomy: 'tool-contract', org: 'Client-A' },
      { id: 'r2', taxonomy: 'tool-contract', org: 'Client-A' },
      { id: 'r3', taxonomy: 'config/env', org: 'internal' }
    ];

    const planItems = [
      {
        id: 'plan-tool-contract',
        source_cohort_ids: ['tool-contract'],
        taxonomy: 'tool-contract',
        issue_summary: 'Resolve repeated tool-contract failures in audit template routing',
        evidence: {
          pattern: 'Reflection evidence shows the same audit template mismatch across two tool-contract reflections.',
          reflection_count: 2,
          reflection_ids: ['r1', 'r2'],
          affected_orgs: ['Client-A'],
          recurrence_count: 2
        },
        likely_root_cause: 'The cover-profile selector maps the audit workflow to the wrong template.',
        recommended_fix: 'Update the selector logic in report-service and verify the audit profile path.',
        prevention_safeguard: 'Add a regression test that fails if audit reports resolve to the wrong cover profile.',
        implementation_steps: [
          'Update the audit template selector in report-service.',
          'Add fixture-based regression coverage for the audit profile.'
        ],
        owner_suggestion: 'Platform engineering',
        priority: 'P1',
        success_criteria: [
          'Audit reports render with the correct cover profile.',
          'Regression tests fail when the wrong cover profile is selected.'
        ],
        estimated_effort_hours: 6,
        expected_roi_annual: 12000,
        affected_components: ['plugins/opspal-core/scripts/lib/report-service.js']
      }
    ];

    const triageItems = buildTriageItems(reflections, planItems);
    const bundle = buildImprovementPlanBundle({
      reflections,
      planItems,
      triageItems,
      title: 'Reflection Improvement Plan',
      downstreamTaskSystem: 'asana'
    });

    expect(bundle.data.summary.total_reflections_analyzed).toBe(3);
    expect(bundle.data.summary.implementation_ready_items).toBe(1);
    expect(bundle.data.summary.triage_items).toBe(1);
    expect(bundle.markdown).toContain('Resolve repeated tool-contract failures in audit template routing');
    expect(bundle.markdown).not.toContain('TBD');
    expect(bundle.markdown).not.toContain('Asana');
    expect(bundle.markdown).not.toContain('process-reflections');
  });
});
