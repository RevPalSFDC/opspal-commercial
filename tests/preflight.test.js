'use strict';

const nock = require('nock');
const { preflight } = require('../scripts/hubspot/preflight');

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v; }
  return fn().finally(() => { for (const [k, v] of Object.entries(prev)) { process.env[k] = v; } });
}

describe('preflight', () => {
  const base = 'https://api.hubapi.com';

  beforeAll(() => {
    const n = require('nock');
    n.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('PASS when custom objects supported and scopes present', async () => {
    await withEnv({ HUBSPOT_CLIENT_ID: 'id', HUBSPOT_CLIENT_SECRET: 'sec', HUBSPOT_REFRESH_TOKEN: 'ref' }, async () => {
      // Token refresh
      nock(base).post('/oauth/v1/token').reply(200, { access_token: 't', expires_in: 1800 });
      // Access token introspect
      nock(base).get('/oauth/v1/access-tokens/t').reply(200, { hub_id: 1, scopes: ['crm.objects.schemas.read','crm.objects.schemas.write'] });
      // Schemas check
      nock(base).get('/crm/v3/schemas').query(true).reply(200, { results: [] });

      const out = await preflight();
      expect(out.status).toBe('PASS');
    });
  });

  test('FAIL when scopes missing', async () => {
    await withEnv({ HUBSPOT_CLIENT_ID: 'id', HUBSPOT_CLIENT_SECRET: 'sec', HUBSPOT_REFRESH_TOKEN: 'ref' }, async () => {
      nock(base).post('/oauth/v1/token').reply(200, { access_token: 't', expires_in: 1800 });
      nock(base).get('/oauth/v1/access-tokens/t').reply(200, { hub_id: 1, scopes: [] });
      nock(base).get('/crm/v3/schemas').query(true).reply(200, { results: [] });

      const out = await preflight();
      expect(out.status).toBe('FAIL');
      expect(out.blockers.find(b => b.code === 'MISSING_SCOPES')).toBeTruthy();
    });
  });
});
