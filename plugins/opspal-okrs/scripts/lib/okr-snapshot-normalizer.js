#!/usr/bin/env node
/**
 * OKR Snapshot Normalizer
 *
 * Normalizes multi-platform data into canonical snapshot format.
 * Handles data from Salesforce, HubSpot, Gong, and Product Analytics.
 *
 * Usage:
 *   node okr-snapshot-normalizer.js normalize <input-dir> <output-file>
 *   node okr-snapshot-normalizer.js validate <snapshot-file>
 *   node okr-snapshot-normalizer.js compare <snapshot-a> <snapshot-b>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const METRIC_CATEGORIES = ['revenue', 'pipeline', 'efficiency', 'retention', 'acquisition', 'plg', 'competitive'];

const REQUIRED_FIELDS = ['value', 'source', 'measured_at'];

function createEmptySnapshot(org) {
  return {
    snapshot_id: `SNAP-${org}-${new Date().toISOString().slice(0, 10)}`,
    org,
    captured_at: new Date().toISOString(),
    platforms_queried: [],
    platforms_unavailable: [],
    company_context: {
      arr_at_start: null,
      nrr_at_start: null,
      grr_at_start: null,
      pipeline_health_score: null,
      pipeline_coverage_ratio: null,
      plg_pql_count: null,
      stage: null,
      gtm_model: null,
      headcount: null,
      acv_tier: null
    },
    metrics: {
      revenue: {},
      pipeline: {},
      efficiency: {},
      retention: {},
      acquisition: {},
      plg: {},
      competitive: {}
    },
    data_quality: {
      metrics_with_evidence: 0,
      metrics_without_evidence: 0,
      platforms_connected: 0,
      platforms_total: 4,
      overall_confidence: 'NONE'
    }
  };
}

function normalizeMetric(raw, source) {
  const metric = {
    value: raw.value,
    source: source || raw.source || 'unknown',
    measured_at: raw.measured_at || new Date().toISOString(),
    query_evidence: raw.query_evidence || raw.query || null,
    confidence: raw.confidence || (raw.query_evidence ? 'HIGH' : 'LOW')
  };

  if (raw.unit) metric.unit = raw.unit;
  if (raw.benchmark_comparison) metric.benchmark_comparison = raw.benchmark_comparison;

  return metric;
}

function calculateDataQuality(snapshot) {
  let withEvidence = 0;
  let withoutEvidence = 0;

  for (const category of METRIC_CATEGORIES) {
    const metrics = snapshot.metrics[category] || {};
    for (const [, metric] of Object.entries(metrics)) {
      if (metric.query_evidence) {
        withEvidence++;
      } else {
        withoutEvidence++;
      }
    }
  }

  const platforms = snapshot.platforms_queried.length;
  let confidence = 'NONE';
  if (platforms >= 3) confidence = 'HIGH';
  else if (platforms >= 2) confidence = 'MEDIUM';
  else if (platforms >= 1) confidence = 'LOW';

  return {
    metrics_with_evidence: withEvidence,
    metrics_without_evidence: withoutEvidence,
    platforms_connected: platforms,
    platforms_total: 4,
    overall_confidence: confidence
  };
}

function validateSnapshot(snapshotFile) {
  if (!fs.existsSync(snapshotFile)) {
    console.error(JSON.stringify({ valid: false, error: `File not found: ${snapshotFile}` }));
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const issues = [];

  if (!snapshot.snapshot_id) issues.push('Missing snapshot_id');
  if (!snapshot.org) issues.push('Missing org');
  if (!snapshot.captured_at) issues.push('Missing captured_at');
  if (!snapshot.company_context) issues.push('Missing company_context');
  if (!snapshot.metrics) issues.push('Missing metrics');

  for (const category of METRIC_CATEGORIES) {
    const metrics = snapshot.metrics[category] || {};
    for (const [name, metric] of Object.entries(metrics)) {
      for (const field of REQUIRED_FIELDS) {
        if (metric[field] === undefined || metric[field] === null) {
          issues.push(`${category}.${name}: missing required field '${field}'`);
        }
      }
    }
  }

  const quality = calculateDataQuality(snapshot);
  const result = {
    valid: issues.length === 0,
    issues,
    data_quality: quality,
    metric_count: quality.metrics_with_evidence + quality.metrics_without_evidence
  };

  console.log(JSON.stringify(result, null, 2));
}

function compareSnapshots(fileA, fileB) {
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) {
    console.error('Both snapshot files must exist');
    process.exit(1);
  }

  const a = JSON.parse(fs.readFileSync(fileA, 'utf8'));
  const b = JSON.parse(fs.readFileSync(fileB, 'utf8'));

  const changes = [];

  for (const category of METRIC_CATEGORIES) {
    const metricsA = a.metrics[category] || {};
    const metricsB = b.metrics[category] || {};

    const allKeys = new Set([...Object.keys(metricsA), ...Object.keys(metricsB)]);

    for (const key of allKeys) {
      const valA = metricsA[key]?.value;
      const valB = metricsB[key]?.value;

      if (valA !== undefined && valB !== undefined && valA !== valB) {
        const pctChange = valA !== 0 ? ((valB - valA) / valA * 100).toFixed(1) : 'N/A';
        changes.push({
          metric: `${category}.${key}`,
          from: valA,
          to: valB,
          change_pct: pctChange,
          direction: valB > valA ? 'up' : 'down'
        });
      } else if (valA === undefined) {
        changes.push({ metric: `${category}.${key}`, status: 'new_in_b', value: valB });
      } else if (valB === undefined) {
        changes.push({ metric: `${category}.${key}`, status: 'removed_in_b', value: valA });
      }
    }
  }

  console.log(JSON.stringify({
    snapshot_a: a.snapshot_id,
    snapshot_b: b.snapshot_id,
    changes_count: changes.length,
    changes
  }, null, 2));
}

// CLI
const [,, command, arg1, arg2] = process.argv;

switch (command) {
  case 'validate':
    if (!arg1) { console.error('Usage: okr-snapshot-normalizer.js validate <snapshot-file>'); process.exit(1); }
    validateSnapshot(arg1);
    break;
  case 'compare':
    if (!arg1 || !arg2) { console.error('Usage: okr-snapshot-normalizer.js compare <snapshot-a> <snapshot-b>'); process.exit(1); }
    compareSnapshots(arg1, arg2);
    break;
  case 'template':
    console.log(JSON.stringify(createEmptySnapshot(arg1 || 'example-org'), null, 2));
    break;
  default:
    console.error('Usage: okr-snapshot-normalizer.js <validate|compare|template> [args]');
    process.exit(1);
}

module.exports = { createEmptySnapshot, normalizeMetric, calculateDataQuality };
