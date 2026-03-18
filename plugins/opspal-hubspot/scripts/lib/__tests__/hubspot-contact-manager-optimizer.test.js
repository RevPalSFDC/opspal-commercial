jest.mock('../batch-property-metadata', () => ({
  withCache: jest.fn()
}));

const BatchPropertyMetadata = require('../batch-property-metadata');
const HubSpotContactManagerOptimizer = require('../hubspot-contact-manager-optimizer');

describe('HubSpotContactManagerOptimizer', () => {
  beforeEach(() => {
    BatchPropertyMetadata.withCache.mockReset();
  });

  test('wires an injected resilient client into BatchPropertyMetadata', () => {
    const batchMetadata = {
      getStats: jest.fn(() => ({ retriedRequests: 0 })),
      resetStats: jest.fn()
    };
    BatchPropertyMetadata.withCache.mockReturnValue(batchMetadata);
    const resilientClient = { config: {} };

    const optimizer = new HubSpotContactManagerOptimizer({
      accessToken: 'token',
      resilientClient
    });
    expect(BatchPropertyMetadata.withCache).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'token',
      resilientClient,
      simulateMode: undefined
    }));
    expect(optimizer.resilientClient).toBe(resilientClient);
  });

  test('surfaces retry counts from BatchPropertyMetadata stats', () => {
    const batchMetadata = {
      getStats: jest.fn(() => ({ retriedRequests: 3 })),
      resetStats: jest.fn()
    };
    BatchPropertyMetadata.withCache.mockReturnValue(batchMetadata);

    const optimizer = new HubSpotContactManagerOptimizer({ accessToken: 'token' });
    optimizer._updateStats(25);

    expect(optimizer.getStats().retriedRequests).toBe(3);
  });
});
