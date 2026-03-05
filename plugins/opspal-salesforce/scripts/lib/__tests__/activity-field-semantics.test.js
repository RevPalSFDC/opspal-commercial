/**
 * Tests for Activity Field Semantics Warning
 *
 * Source: Reflection Cohort - data-quality (P0)
 */

const { warnActivityFieldSemantics, validateSOQL } = require('../safe-query-executor');

describe('warnActivityFieldSemantics', () => {
  it('should warn when TaskSubtype is used in WHERE on Task', () => {
    const query = "SELECT Id FROM Task WHERE TaskSubtype = 'Call'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('TaskSubtype filters Gong/CTI-synced records only');
  });

  it('should warn when TaskSubtype is used in WHERE on Event', () => {
    const query = "SELECT Id FROM Event WHERE TaskSubtype = 'Email'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('TaskSubtype');
  });

  it('should warn when TaskSubtype is used in WHERE on Activity', () => {
    const query = "SELECT Id FROM Activity WHERE TaskSubtype = 'Call' AND OwnerId = '005xx'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(1);
  });

  it('should NOT warn when TaskSubtype is only in SELECT (not WHERE)', () => {
    const query = "SELECT Id, TaskSubtype FROM Task WHERE Type = 'Call'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(0);
  });

  it('should NOT warn for non-activity objects', () => {
    const query = "SELECT Id FROM Account WHERE Name = 'Test'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(0);
  });

  it('should NOT warn when Type field is used correctly', () => {
    const query = "SELECT Id FROM Task WHERE Type = 'Call'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(0);
  });

  it('should return empty array for null/empty input', () => {
    expect(warnActivityFieldSemantics(null)).toEqual([]);
    expect(warnActivityFieldSemantics('')).toEqual([]);
    expect(warnActivityFieldSemantics(123)).toEqual([]);
  });

  it('should be case-insensitive for object and field names', () => {
    const query = "SELECT Id FROM task WHERE tasksubtype = 'Call'";
    const warnings = warnActivityFieldSemantics(query);
    expect(warnings).toHaveLength(1);
  });
});

describe('validateSOQL with activity warnings', () => {
  it('should include warnings in validateSOQL result', () => {
    const query = "SELECT Id FROM Task WHERE TaskSubtype = 'Call'";
    const result = validateSOQL(query);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('TaskSubtype');
  });

  it('should return empty warnings array for normal queries', () => {
    const query = "SELECT Id, Name FROM Account WHERE Industry = 'Tech'";
    const result = validateSOQL(query);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('should return both errors and warnings when applicable', () => {
    const query = "SELECT Id, FROM Task WHERE TaskSubtype = 'Call'";
    const result = validateSOQL(query);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(1);
  });
});
