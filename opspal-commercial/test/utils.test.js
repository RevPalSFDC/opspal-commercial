/**
 * Utils test suite - Core utility functions
 * Converted from node:test to Jest format for unified testing
 */

const { safeJsonParse } = require('../update-reflection-status.js');
const { maskEmail } = require('../fetch-new-reflections.js');

describe('safeJsonParse', () => {
  test('handles valid JSON', () => {
    const parsed = safeJsonParse('{"ok":true}');
    expect(parsed).toEqual({ ok: true });
  });

  test('returns null for empty string', () => {
    expect(safeJsonParse('')).toBeNull();
  });

  test('returns null for invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeNull();
  });
});

describe('maskEmail', () => {
  test('redacts email by default', () => {
    const redacted = maskEmail('jane.doe@example.com', { includeEmails: false });
    expect(redacted).toBe('j***@example.com');
  });

  test('passes through when includeEmails is true', () => {
    const original = 'jane.doe@example.com';
    expect(maskEmail(original, { includeEmails: true })).toBe(original);
  });
});
