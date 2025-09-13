'use strict';

const migration = require('../migrations/hubspot/2025-09-08_business_unit.up');

describe('migration plan', () => {
  test('includes base steps', async () => {
    const fakeClient = { get: async () => ({ data: { results: [] } }) };
    const plan = await migration.plan(fakeClient);
    const labels = plan.steps.map(s => s.description);
    expect(labels).toEqual(expect.arrayContaining([
      'Create custom object schema p_business_unit',
      'Create property group business_unit_core',
      'Create property name',
    ]));
  });
});
