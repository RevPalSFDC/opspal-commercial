const PicklistDescriber = require('../picklist-describer');

describe('PicklistDescriber', () => {
  test('introspectBeforeDeploy normalizes existing values and classifies proposed values', async () => {
    const describer = new PicklistDescriber({ orgAlias: 'test-org' });
    jest.spyOn(describer, 'getStandardValueSet').mockResolvedValue({
      values: [
        { value: 'Prospect', label: 'Prospect' },
        { value: 'Customer', label: 'Customer' }
      ]
    });

    const result = await describer.introspectBeforeDeploy('AccountType', [
      { fullName: 'Prospect', label: 'Prospect' },
      { fullName: 'Customer', label: 'Client' },
      { fullName: 'Partner', label: 'Partner' }
    ]);

    expect(result.existing).toEqual([
      { fullName: 'Prospect', label: 'Prospect' },
      { fullName: 'Customer', label: 'Customer' }
    ]);
    expect(result.alreadyPresent).toEqual([
      { fullName: 'Prospect', label: 'Prospect' }
    ]);
    expect(result.toAdd).toEqual([
      { fullName: 'Partner', label: 'Partner' }
    ]);
    expect(result.conflicts).toEqual([
      {
        existing: { fullName: 'Customer', label: 'Customer' },
        proposed: { fullName: 'Customer', label: 'Client' }
      }
    ]);
  });
});
