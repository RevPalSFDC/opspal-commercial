'use strict';

const {
  DEFAULT_SETTINGS,
  ensureStoreShape,
  getConfidenceInterval,
  getMetricSummary,
  updateBetaPrior
} = require('../okr-outcome-calibrator');

describe('okr-outcome-calibrator', () => {
  test('builds a normalized store shape with defaults', () => {
    const store = ensureStoreShape({ outcomes: [] });

    expect(store.settings.smoothing_alpha).toBe(DEFAULT_SETTINGS.smoothing_alpha);
    expect(store.metric_priors).toEqual({});
    expect(Array.isArray(store.outcomes)).toBe(true);
  });

  test('updates beta priors for hit, partial, and miss outcomes', () => {
    const start = { alpha: 2, beta: 2 };
    const afterHit = updateBetaPrior(start, { classification: 'hit' });
    const afterPartial = updateBetaPrior(afterHit, { classification: 'partial' });
    const afterMiss = updateBetaPrior(afterPartial, { classification: 'miss' });

    expect(afterHit).toEqual({ alpha: 3, beta: 2 });
    expect(afterPartial).toEqual({ alpha: 3.5, beta: 2.5 });
    expect(afterMiss).toEqual({ alpha: 3.5, beta: 3.5 });
  });

  test('returns bounded P10/P50/P90 confidence intervals', () => {
    const interval = getConfidenceInterval({ alpha: 6, beta: 4 });

    expect(interval.p10).toBeLessThan(interval.p50);
    expect(interval.p50).toBeLessThan(interval.p90);
    expect(interval.p10).toBeGreaterThanOrEqual(0);
    expect(interval.p90).toBeLessThanOrEqual(1);
  });

  test('summarizes metric outcomes with smoothing and minimum-cycle warning', () => {
    const summary = getMetricSummary([
      {
        cycle: 'Q1-2026',
        classification: 'miss',
        attainment_ratio: 0.72,
        variance_pct: -28,
        recorded_at: '2026-04-01T00:00:00Z'
      },
      {
        cycle: 'Q2-2026',
        classification: 'partial',
        attainment_ratio: 0.88,
        variance_pct: -12,
        recorded_at: '2026-07-01T00:00:00Z'
      },
      {
        cycle: 'Q3-2026',
        classification: 'hit',
        attainment_ratio: 1.04,
        variance_pct: 4,
        recorded_at: '2026-10-01T00:00:00Z'
      }
    ], DEFAULT_SETTINGS);

    expect(summary.smoothed_attainment_ratio).toBeGreaterThan(0.8);
    expect(summary.recommended_adjustment).toBe('lower_targets');
    expect(summary.minimum_cycles_warning).toContain('Minimum 4 cycles');
  });
});
