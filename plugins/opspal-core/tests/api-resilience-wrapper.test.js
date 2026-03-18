const EventEmitter = require('events');

jest.mock('https', () => ({
  request: jest.fn()
}));

const https = require('https');
const {
  createHubSpotClient
} = require('../scripts/lib/api-resilience-wrapper');

describe('api-resilience-wrapper', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('createHubSpotClient applies default authorization headers in executeRequest', async () => {
    https.request.mockImplementation((options, callback) => {
      const response = new EventEmitter();
      response.statusCode = 200;

      process.nextTick(() => {
        callback(response);
        response.emit('data', '{"ok":true}');
        response.emit('end');
      });

      const request = new EventEmitter();
      request.write = jest.fn();
      request.end = jest.fn();
      request.destroy = jest.fn();
      return request;
    });

    const client = createHubSpotClient('secret-token');
    const result = await client.executeRequest('https://api.hubapi.com/crm/v3/properties/contacts', {
      headers: {
        'X-Test': '1'
      }
    });

    expect(result).toEqual({ ok: true });
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(https.request.mock.calls[0][0].headers.Authorization).toBe('Bearer secret-token');
    expect(https.request.mock.calls[0][0].headers['X-Test']).toBe('1');
  });
});
