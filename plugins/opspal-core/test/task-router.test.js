const { TaskRouter } = require('../scripts/lib/task-router');

describe('TaskRouter scenario coverage', () => {
  const router = new TaskRouter();

  test('Scenario A routes RevOps assessment to sfdc-revops-auditor', () => {
    const result = router.analyze(
      'Run a comprehensive RevOps assessment for our Salesforce org and produce KPI report'
    );
    expect(result.agentShortName).toBe('sfdc-revops-auditor');
  });

  test('Scenario B routes lifecycle governance to sfdc-revops-auditor', () => {
    const result = router.analyze(
      'We have inconsistent lifecycle stage definitions; audit governance and reconcile lifecycle rules'
    );
    expect(result.agentShortName).toBe('sfdc-revops-auditor');
  });

  test('Scenario C routes implementation planning to implementation-planner', () => {
    const result = router.analyze(
      'Plan an implementation project from a spec and create an Asana plan'
    );
    expect(result.agentShortName).toBe('implementation-planner');
  });

  test('Scenario C2 routes Salesforce implementation planning to sfdc-planner', () => {
    const result = router.analyze(
      'Plan a Salesforce implementation rollout for lead assignment and approvals'
    );
    expect(result.agentShortName).toBe('sfdc-planner');
  });

  test('KPI report requests route to revops-reporting-assistant', () => {
    const result = router.analyze('Generate a KPI report with forecasts and alerts');
    expect(result.agentShortName).toBe('revops-reporting-assistant');
  });

  test('Scenario D routes marketo lead scoring model requests to marketo-lead-scoring-architect', () => {
    const result = router.analyze('Build a lead scoring model in Marketo with MQL threshold and decay');
    expect(result.agentShortName).toBe('marketo-lead-scoring-architect');
    expect(result.complexity.score).toBeGreaterThanOrEqual(0.5);
  });

  test('Scenario E routes revops report prompts to revops-reporting-assistant', () => {
    const result = router.analyze('Generate a RevOps report on pipeline health');
    expect(result.agentShortName).toBe('revops-reporting-assistant');
  });

  test('Scenario F routes scheduled Apex rollup type errors to sfdc-field-analyzer', () => {
    const result = router.analyze(
      'Can you investigate and develop a plan to resolve this error: Scheduled Apex job failed to update rollups. Error: Illegal assignment from Datetime to Date. Review Rollup Summary Schedule Items.'
    );
    expect(result.agentShortName).toBe('sfdc-field-analyzer');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('Scenario G respects HubSpot platform intent for orchestrator requests', () => {
    const result = router.analyze(
      'For HubSpot, orchestrate a complex multi-step operation and propose a safe execution plan'
    );
    expect(result.agentShortName).toBe('hubspot-orchestrator');
  });

  test('Scenario H respects Salesforce platform intent for orchestrator requests', () => {
    const result = router.analyze(
      'For Salesforce, orchestrate a complex multi-step operation and propose a safe execution plan'
    );
    expect(result.agentShortName).toBe('sfdc-orchestrator');
  });
});
