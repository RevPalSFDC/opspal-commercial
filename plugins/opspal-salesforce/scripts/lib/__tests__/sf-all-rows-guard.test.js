const { execSync } = require('child_process');

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const ProcedureAFieldRestoration = require('../procedure-a-field-restoration');
const ProcedureBEntitySeparation = require('../procedure-b-entity-separation');
const ProcedureCQuickUndelete = require('../procedure-c-quick-undelete');

const QUERY_WITH_INLINE_ALL_ROWS = "SELECT Id FROM Account WHERE IsDeleted = true ALL ROWS";
const QUERY_WITHOUT_ALL_ROWS = "SELECT Id FROM Account WHERE IsDeleted = true";

const EXECUTE_CASES = [
  {
    name: 'ProcedureAFieldRestoration',
    create: () => new ProcedureAFieldRestoration('test-org', '001SURVIVOR'),
    execute: (instance, query, includeDeleted) => instance.executeSoqlQuery(query, false, includeDeleted)
  },
  {
    name: 'ProcedureBEntitySeparation',
    create: () => new ProcedureBEntitySeparation('test-org', '001SURVIVOR'),
    execute: (instance, query, includeDeleted) => instance.executeSoqlQuery(query, includeDeleted)
  },
  {
    name: 'ProcedureCQuickUndelete',
    create: () => new ProcedureCQuickUndelete('test-org', '001SURVIVOR'),
    execute: (instance, query, includeDeleted) => instance.executeSoqlQuery(query, includeDeleted)
  }
];

describe('Salesforce ALL ROWS contract guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    execSync.mockReturnValue(JSON.stringify({ status: 0, result: { records: [] } }));
  });

  describe.each(EXECUTE_CASES)('$name executeSoqlQuery', ({ create, execute }) => {
    it('rejects inline ALL ROWS and fails before CLI execution', () => {
      const instance = create();

      expect(() => execute(instance, QUERY_WITH_INLINE_ALL_ROWS, true))
        .toThrow(/Inline "ALL ROWS" is not supported/i);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('uses --all-rows flag when includeDeleted is true', () => {
      const instance = create();

      execute(instance, QUERY_WITHOUT_ALL_ROWS, true);

      expect(execSync).toHaveBeenCalledTimes(1);
      const cmd = execSync.mock.calls[0][0];
      expect(cmd).toContain('sf data query');
      expect(cmd).toContain('--all-rows');
      expect(cmd).toContain('--target-org test-org');
    });
  });

  it('Procedure A deleted-record query excludes inline ALL ROWS', async () => {
    const instance = new ProcedureAFieldRestoration('test-org', '001SURVIVOR');
    instance.executeSoqlQuery = jest.fn().mockReturnValue({
      result: {
        records: [{ Id: '001DEL', Name: 'Deleted Account', LastModifiedDate: '2026-02-10T00:00:00.000Z' }]
      }
    });

    await instance.queryDeletedRecord();

    expect(instance.executeSoqlQuery).toHaveBeenCalledTimes(1);
    const [query, , includeDeleted] = instance.executeSoqlQuery.mock.calls[0];
    expect(query).not.toMatch(/\bALL\s+ROWS\b/i);
    expect(includeDeleted).toBe(true);
  });

  it('Procedure B deleted-record query excludes inline ALL ROWS', async () => {
    const instance = new ProcedureBEntitySeparation('test-org', '001SURVIVOR');
    instance.executeSoqlQuery = jest.fn().mockReturnValue({
      result: {
        records: [{ Id: '001DEL', Name: 'Deleted Account' }]
      }
    });

    await instance.queryDeletedRecord();

    expect(instance.executeSoqlQuery).toHaveBeenCalledTimes(1);
    const [query, includeDeleted] = instance.executeSoqlQuery.mock.calls[0];
    expect(query).not.toMatch(/\bALL\s+ROWS\b/i);
    expect(includeDeleted).toBe(true);
  });

  it('Procedure C recycle-bin query excludes inline ALL ROWS', async () => {
    const instance = new ProcedureCQuickUndelete('test-org', '001SURVIVOR');
    instance.executeSoqlQuery = jest.fn().mockReturnValue({
      result: {
        records: [{ Id: '001DEL', Name: 'Deleted Account', LastModifiedDate: new Date().toISOString() }]
      }
    });

    await instance.checkRecycleBinWindow();

    expect(instance.executeSoqlQuery).toHaveBeenCalledTimes(1);
    const [query, includeDeleted] = instance.executeSoqlQuery.mock.calls[0];
    expect(query).not.toMatch(/\bALL\s+ROWS\b/i);
    expect(includeDeleted).toBe(true);
  });
});
