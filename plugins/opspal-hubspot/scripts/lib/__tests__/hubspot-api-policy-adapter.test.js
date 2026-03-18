const { HubSpotApiPolicyAdapter } = require('../hubspot-api-policy-adapter');
const { HubSpotRequestThrottle } = require('../hubspot-request-throttle');

describe('HubSpotApiPolicyAdapter', () => {
  beforeEach(() => {
    HubSpotRequestThrottle.resetInstance();
  });

  it('executes requests through policy and throttle', async () => {
    const adapter = new HubSpotApiPolicyAdapter({
      tier: 'starter',
      maxRetries: 1,
      baseBackoffMs: 1,
      maxBackoffMs: 5
    });

    const response = await adapter.execute(async () => ({
      ok: true,
      headers: {
        'retry-after': '0'
      }
    }));

    expect(response.ok).toBe(true);

    const stats = adapter.getStats();
    expect(stats.policy.stats.successfulRequests).toBe(1);
    expect(stats.throttle.totalRequests).toBeGreaterThan(0);
  });

  it('classifies rate-limit failures as retryable', () => {
    const adapter = new HubSpotApiPolicyAdapter({ tier: 'starter' });
    const classification = adapter.classifyError({ code: '429', message: 'Too Many Requests' });

    expect(classification.retryable).toBe(true);
  });
});
