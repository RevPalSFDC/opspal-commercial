'use strict';

const nock = require('nock');
const { TokenManager } = require('../src/lib/oauth/tokenManager');

describe('TokenManager', () => {
  const tokenURL = 'https://api.hubapi.com';

  afterEach(() => {
    nock.cleanAll();
  });

  test('refreshes token and caches expiry', async () => {
    nock(tokenURL)
      .post('/oauth/v1/token')
      .reply(200, { access_token: 'abc123', expires_in: 1800 });

    const tm = new TokenManager({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'refresh',
    });
    const token = await tm.getAccessToken();
    expect(token).toBe('abc123');
  });
});

