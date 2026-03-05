jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn()
}));

const { execSync } = require('child_process');
const { BulkOpsEngine } = require('../bulkops-engine');

describe('BulkOpsEngine safeguards', () => {
  let engine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new BulkOpsEngine({ orgAlias: 'test-org', verbose: false });
  });

  test('normalizes state abbreviations for State fields', async () => {
    const prepared = await engine._prepareRecordsForCsv(
      'insert',
      'Account',
      [{ Id: '001xx0000012345', BillingState: 'VA' }],
      ['Id', 'BillingState']
    );

    expect(prepared[0].BillingState).toBe('Virginia');
  });

  test('preserves existing values when update payload has blank fields', async () => {
    execSync.mockReturnValue(
      Buffer.from(JSON.stringify({
        result: {
          records: [{ Id: '001xx0000012345', Line_of_Business__c: 'Law Enforcement' }]
        }
      }))
    );

    const prepared = await engine._prepareRecordsForCsv(
      'update',
      'Account',
      [{ Id: '001xx0000012345', Line_of_Business__c: '' }],
      ['Id', 'Line_of_Business__c']
    );

    expect(prepared[0].Line_of_Business__c).toBe('Law Enforcement');
  });

  test('supports explicit nulling with __NULL__ sentinel', async () => {
    execSync.mockReturnValue(
      Buffer.from(JSON.stringify({
        result: {
          records: [{ Id: '001xx0000012345', Line_of_Business__c: 'Law Enforcement' }]
        }
      }))
    );

    const prepared = await engine._prepareRecordsForCsv(
      'update',
      'Account',
      [{ Id: '001xx0000012345', Line_of_Business__c: '__NULL__' }],
      ['Id', 'Line_of_Business__c']
    );

    expect(prepared[0].Line_of_Business__c).toBeNull();
  });
});
