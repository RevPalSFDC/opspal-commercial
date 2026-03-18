const { OOOMetadataOperations } = require('../ooo-metadata-operations');

describe('OOOMetadataOperations', () => {
  let operations;

  beforeEach(() => {
    operations = new OOOMetadataOperations('test-org', { verbose: false });
  });

  it('blocks deployments that would exceed the field history tracking limit', async () => {
    operations.describeSObject = jest.fn().mockResolvedValue({
      fields: Array.from({ length: 20 }, (_, index) => ({
        name: `Tracked_Field_${index}__c`,
        type: 'string',
        trackHistory: true
      }))
    });

    const result = await operations.precheckFieldHistoryCapacity('Account', [
      { fullName: 'New_Field__c', trackHistory: true }
    ]);

    expect(result.passed).toBe(false);
    expect(result.issues.join(' ')).toContain('20/20');
    expect(result.issues.join(' ')).toContain('New_Field__c');
  });

  it('fails verification when deployed fields are not queryable through SOQL', async () => {
    operations.runSfDataQuery = jest.fn()
      .mockResolvedValueOnce({
        result: {
          records: [{ QualifiedApiName: 'New_Field__c' }]
        }
      })
      .mockResolvedValueOnce({
        result: {
          records: [{ Field: 'Account.New_Field__c', PermissionsRead: true, PermissionsEdit: true }]
        }
      })
      .mockRejectedValueOnce(new Error('No such column New_Field__c'));

    const result = await operations.verifyFieldsAndFLS('Account', ['New_Field__c'], 'AgentAccess');

    expect(result.success).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SOQL visibility verification failed')
      ])
    );
  });
});
