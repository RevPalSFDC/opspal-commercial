/**
 * Tests for Query Completeness Checker
 *
 * Source: Reflection Cohort - schema/parse (P1)
 */

const { checkQueryCompleteness, getRecordCount } = require('../safe-query-executor');

// Mock execSync for tests
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const { execSync } = require('child_process');

describe('checkQueryCompleteness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return complete=true when record count is below thresholds', () => {
    const result = { records: new Array(500) };
    const completeness = checkQueryCompleteness(
      'SELECT Id FROM Account',
      result,
      'my-org',
      { quiet: true }
    );

    expect(completeness.complete).toBe(true);
    expect(completeness.truncated).toBe(false);
    expect(completeness.returnedCount).toBe(500);
    expect(completeness.totalCount).toBe(500);
  });

  it('should detect truncation at 2000 records', () => {
    const result = { records: new Array(2000) };

    // Mock the COUNT() query
    execSync.mockReturnValue(JSON.stringify({
      status: 0,
      result: { totalSize: 15000, records: [] }
    }));

    const completeness = checkQueryCompleteness(
      'SELECT Id FROM Account WHERE Industry = \'Tech\'',
      result,
      'my-org',
      { quiet: true }
    );

    expect(completeness.complete).toBe(false);
    expect(completeness.truncated).toBe(true);
    expect(completeness.returnedCount).toBe(2000);
    expect(completeness.totalCount).toBe(15000);
  });

  it('should detect truncation at 50000 records', () => {
    const result = { records: new Array(50000) };

    execSync.mockReturnValue(JSON.stringify({
      status: 0,
      result: { totalSize: 87680, records: [] }
    }));

    const completeness = checkQueryCompleteness(
      'SELECT Id FROM AccountTeamMember',
      result,
      'my-org',
      { quiet: true }
    );

    expect(completeness.complete).toBe(false);
    expect(completeness.truncated).toBe(true);
    expect(completeness.returnedCount).toBe(50000);
    expect(completeness.totalCount).toBe(87680);
  });

  it('should return complete=true when COUNT matches returned count', () => {
    const result = { records: new Array(2000) };

    execSync.mockReturnValue(JSON.stringify({
      status: 0,
      result: { totalSize: 2000, records: [] }
    }));

    const completeness = checkQueryCompleteness(
      'SELECT Id FROM Account',
      result,
      'my-org',
      { quiet: true }
    );

    expect(completeness.complete).toBe(true);
    expect(completeness.truncated).toBe(false);
  });

  it('should handle COUNT query failure gracefully', () => {
    const result = { records: new Array(2000) };

    execSync.mockImplementation(() => {
      throw new Error('Query failed');
    });

    const completeness = checkQueryCompleteness(
      'SELECT Id FROM Account',
      result,
      'my-org',
      { quiet: true }
    );

    // Should not throw, returns as-is
    expect(completeness.returnedCount).toBe(2000);
  });

  it('should include WHERE clause in COUNT query', () => {
    const result = { records: new Array(2000) };

    execSync.mockReturnValue(JSON.stringify({
      status: 0,
      result: { totalSize: 2000, records: [] }
    }));

    checkQueryCompleteness(
      "SELECT Id FROM Account WHERE Industry = 'Tech' AND AnnualRevenue > 1000000",
      result,
      'my-org',
      { quiet: true }
    );

    // Verify the COUNT query includes the WHERE clause
    const countCall = execSync.mock.calls[0][0];
    expect(countCall).toContain('COUNT()');
    expect(countCall).toContain("Industry = 'Tech'");
    expect(countCall).toContain('AnnualRevenue > 1000000');
  });

  it('should handle null/empty results', () => {
    const completeness = checkQueryCompleteness(
      'SELECT Id FROM Account',
      { records: [] },
      'my-org',
      { quiet: true }
    );

    expect(completeness.complete).toBe(true);
    expect(completeness.returnedCount).toBe(0);
  });

  it('should handle query without FROM clause', () => {
    const result = { records: new Array(2000) };
    const completeness = checkQueryCompleteness(
      'INVALID QUERY',
      result,
      'my-org',
      { quiet: true }
    );

    // Can't extract object name, returns as-is
    expect(completeness.returnedCount).toBe(2000);
  });
});
