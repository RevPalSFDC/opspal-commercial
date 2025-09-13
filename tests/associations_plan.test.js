'use strict';

const nock = require('nock');
const axios = require('axios');
const migration = require('../migrations/hubspot/2025-09-08_business_unit.up');

describe('associations plan', () => {
  const base = 'https://api.hubapi.com';

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('plans creation only for missing labels', async () => {
    // contact labels already exist
    nock(base)
      .get('/crm/v4/associations/p_business_unit/0-1/labels')
      .reply(200, { results: [{ name: 'business_unit_to_contact', label: 'Business Unit to Contact' }] });
    // company missing
    nock(base)
      .get('/crm/v4/associations/p_business_unit/0-2/labels')
      .reply(200, { results: [] });
    // deal missing
    nock(base)
      .get('/crm/v4/associations/p_business_unit/0-3/labels')
      .reply(200, { results: [] });
    // ticket missing
    nock(base)
      .get('/crm/v4/associations/p_business_unit/0-5/labels')
      .reply(200, { results: [] });

    const client = axios.create({ baseURL: base, timeout: 1000 });
    const plan = await migration.plan(client);
    const stepDescriptions = plan.steps.map(s => s.description);
    expect(stepDescriptions).toEqual(expect.arrayContaining([
      "Skip existing association label 'business_unit_to_contact'",
      "Create association label 'business_unit_to_company' between p_business_unit and 0-2",
      "Create association label 'business_unit_to_deal' between p_business_unit and 0-3",
      "Create association label 'business_unit_to_ticket' between p_business_unit and 0-5",
    ]));
  });
});

