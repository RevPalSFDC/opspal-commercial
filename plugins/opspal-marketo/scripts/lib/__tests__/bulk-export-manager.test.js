const {
  validateDateRange,
  splitDateRangeIntoWindows,
  getDateRangeDays
} = require('../bulk-export-manager');

describe('bulk-export-manager date safeguards', () => {
  test('validateDateRange throws when range exceeds 31 days', () => {
    expect(() => {
      validateDateRange('2026-01-01T00:00:00Z', '2026-02-15T00:00:00Z');
    }).toThrow('exceeds maximum of 31 days');
  });

  test('splitDateRangeIntoWindows creates <=31 day windows', () => {
    const windows = splitDateRangeIntoWindows(
      '2026-01-01T00:00:00Z',
      '2026-03-15T00:00:00Z'
    );

    expect(windows.length).toBeGreaterThan(1);

    windows.forEach(window => {
      const days = getDateRangeDays(window.startAt, window.endAt);
      expect(days).toBeLessThanOrEqual(31);
      expect(days).toBeGreaterThanOrEqual(0);
    });
  });

  test('splitDateRangeIntoWindows returns contiguous forward windows', () => {
    const windows = splitDateRangeIntoWindows(
      '2026-01-01T00:00:00Z',
      '2026-02-20T00:00:00Z'
    );

    for (let i = 1; i < windows.length; i++) {
      const prevEnd = new Date(windows[i - 1].endAt).getTime();
      const currentStart = new Date(windows[i].startAt).getTime();
      expect(currentStart).toBeGreaterThan(prevEnd);
    }
  });
});
