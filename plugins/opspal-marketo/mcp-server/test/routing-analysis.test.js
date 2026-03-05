import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActivitySummary,
  detectFieldOscillation,
  detectLoopCandidates,
  selectCanonicalLead
} from '../src/lib/routing-analysis.js';

test('selectCanonicalLead returns single record without duplicate risk', () => {
  const input = [{ id: 100, email: 'a@example.com', updatedAt: '2026-02-10T10:00:00Z' }];
  const result = selectCanonicalLead(input, 'email');

  assert.equal(result.canonicalLead.id, 100);
  assert.equal(result.duplicateRisk, false);
  assert.equal(result.duplicates.length, 0);
});

test('selectCanonicalLead uses most_recent_update for non-id lookups', () => {
  const input = [
    { id: 10, email: 'dup@example.com', updatedAt: '2026-02-10T10:00:00Z' },
    { id: 11, email: 'dup@example.com', updatedAt: '2026-02-10T12:00:00Z' }
  ];
  const result = selectCanonicalLead(input, 'email');

  assert.equal(result.canonicalLead.id, 11);
  assert.equal(result.duplicateRisk, true);
  assert.equal(result.method, 'most_recent_update');
});

test('detectFieldOscillation computes flips and oscillation flag', () => {
  const leadChanges = [
    {
      activityDate: '2026-02-12T10:00:00Z',
      fields: [{ name: 'leadStatus', oldValue: 'New', newValue: 'Working' }]
    },
    {
      activityDate: '2026-02-12T10:02:00Z',
      fields: [{ name: 'leadStatus', oldValue: 'Working', newValue: 'New' }]
    },
    {
      activityDate: '2026-02-12T10:04:00Z',
      fields: [{ name: 'leadStatus', oldValue: 'New', newValue: 'Working' }]
    },
    {
      activityDate: '2026-02-12T10:06:00Z',
      fields: [{ name: 'leadStatus', oldValue: 'Working', newValue: 'New' }]
    }
  ];

  const result = detectFieldOscillation(leadChanges, 'leadStatus');
  assert.equal(result.flips, 3);
  assert.equal(result.isOscillating, true);
});

test('detectLoopCandidates marks oscillating fields', () => {
  const leadChanges = [
    {
      activityDate: '2026-02-12T10:00:00Z',
      fields: [{ name: 'segment', oldValue: 'A', newValue: 'B' }]
    },
    {
      activityDate: '2026-02-12T10:01:00Z',
      fields: [{ name: 'segment', oldValue: 'B', newValue: 'A' }]
    },
    {
      activityDate: '2026-02-12T10:02:00Z',
      fields: [{ name: 'segment', oldValue: 'A', newValue: 'B' }]
    },
    {
      activityDate: '2026-02-12T10:03:00Z',
      fields: [{ name: 'segment', oldValue: 'B', newValue: 'A' }]
    }
  ];

  const result = detectLoopCandidates(leadChanges, ['segment']);
  assert.equal(result.hasLoopSignal, true);
  assert.equal(result.oscillatingFields.length, 1);
  assert.equal(result.oscillatingFields[0].field, 'segment');
});

test('buildActivitySummary returns count and type map', () => {
  const activities = [
    { activityTypeId: 101, activityDate: '2026-02-12T10:00:00Z' },
    { activityTypeId: 101, activityDate: '2026-02-12T10:01:00Z' },
    { activityTypeId: 102, activityDate: '2026-02-12T10:02:00Z' }
  ];

  const summary = buildActivitySummary(activities);
  assert.equal(summary.total, 3);
  assert.equal(summary.byType[101], 2);
  assert.equal(summary.byType[102], 1);
  assert.equal(summary.windowStart, '2026-02-12T10:00:00.000Z');
  assert.equal(summary.windowEnd, '2026-02-12T10:02:00.000Z');
});

