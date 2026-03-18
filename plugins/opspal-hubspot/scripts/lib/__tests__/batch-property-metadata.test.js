const BatchPropertyMetadata = require('../batch-property-metadata');

describe('BatchPropertyMetadata', () => {
  test('routes fetch-all requests through the resilient client and preserves metadata context', async () => {
    const resilientClient = {
      config: {},
      request: jest.fn().mockResolvedValue({
        results: [{ name: 'firstname' }]
      })
    };

    const metadata = BatchPropertyMetadata.withCache({
      accessToken: 'token',
      simulateMode: false,
      resilientClient
    });

    const result = await metadata.getProperties([{
      objectType: 'contacts',
      fetchAllProperties: true,
      context: 'list_membership'
    }]);

    expect(resilientClient.request).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{
      id: undefined,
      objectType: 'contacts',
      context: 'list_membership',
      properties: [{ name: 'firstname' }]
    }]);
    expect(metadata.getStats().transportMode).toBe('resilient-client');
  });

  test('tracks retry telemetry emitted by the resilient client', async () => {
    const resilientClient = {
      config: {},
      request: jest.fn().mockImplementation(async () => {
        resilientClient.config.onRetry({
          attempt: 1,
          maxAttempts: 4,
          delayMs: 1000
        });
        return { results: [] };
      })
    };

    const metadata = new BatchPropertyMetadata({
      accessToken: 'token',
      simulateMode: false,
      resilientClient
    });

    await metadata.getProperties([{
      objectType: 'contacts',
      fetchAllProperties: true
    }]);

    expect(metadata.getStats().retriedRequests).toBe(1);
  });
});
