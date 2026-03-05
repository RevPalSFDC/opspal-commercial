const { SalesforceApiPolicy } = require('../salesforce-api-policy');

describe('SalesforceApiPolicy', () => {
  it('builds and applies limits snapshot', () => {
    const policy = new SalesforceApiPolicy({ dailySoftLimit: 1000 });
    const applied = policy.applyLimitsSnapshot({
      DailyApiRequests: {
        Max: 100000,
        Remaining: 25000
      }
    });

    expect(applied.max).toBe(100000);
    expect(applied.remaining).toBe(25000);
    expect(applied.used).toBe(75000);
    expect(policy.getStats().salesforceLimits.usagePercent).toBe(75);
  });

  it('executes requests through gateway', async () => {
    const policy = new SalesforceApiPolicy({
      targetCallsPerWindow: 100,
      maxRetries: 1,
      baseBackoffMs: 1,
      maxBackoffMs: 5
    });

    const result = await policy.execute(async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    expect(policy.getStats().stats.successfulRequests).toBe(1);
  });

  it('classifies Salesforce request limit as retryable', () => {
    const policy = new SalesforceApiPolicy();
    const classification = policy.classifyError({ code: 'REQUEST_LIMIT_EXCEEDED', message: 'Too many calls' });

    expect(classification.retryable).toBe(true);
    expect(classification.reason).toBe('salesforce_request_limit_exceeded');
  });
});
