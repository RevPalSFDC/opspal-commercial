const {
  resolveHistoricalRoutingLogSemantics,
  resolveRoutingSemantics
} = require('../routing-semantics');

describe('routing-semantics', () => {
  it('keeps runtime semantics explicit-only', () => {
    const result = resolveRoutingSemantics({
      output: {
        recommendedAgent: 'opspal-salesforce:sfdc-cpq-assessor',
        action: 'BLOCKED',
        blocked: true
      }
    });

    expect(result.routedAgent).toBeNull();
    expect(result.executionBlockUntilCleared).toBe(false);
    expect(result.guidanceAction).toBe('recommend_specialist');
    expect(result.legacyCompatibilityUsed).toBe(false);
  });

  it('preserves historical log compatibility for legacy routing action records', () => {
    const result = resolveHistoricalRoutingLogSemantics({
      output: {
        agent: 'opspal-core:release-coordinator',
        action: 'BLOCKED',
        blocked: true
      }
    });

    expect(result.routedAgent).toBe('opspal-core:release-coordinator');
    expect(result.executionBlockUntilCleared).toBe(true);
    expect(result.guidanceAction).toBe('require_specialist');
    expect(result.routeKind).toBe('complexity_specialist');
    expect(result.legacyCompatibilityUsed).toBe(true);
    expect(result.legacyFields).toEqual(expect.arrayContaining(['action']));
  });

  it('does not revive recommendedAgent compatibility in historical readers', () => {
    const result = resolveHistoricalRoutingLogSemantics({
      output: {
        recommendedAgent: 'opspal-core:implementation-planner',
        action: 'RECOMMENDED'
      }
    });

    expect(result.routedAgent).toBeNull();
    expect(result.guidanceAction).toBe('recommend_specialist');
    expect(result.legacyFields).toEqual(expect.arrayContaining(['action']));
    expect(result.legacyFields).not.toEqual(expect.arrayContaining(['recommended_agent']));
  });
});
