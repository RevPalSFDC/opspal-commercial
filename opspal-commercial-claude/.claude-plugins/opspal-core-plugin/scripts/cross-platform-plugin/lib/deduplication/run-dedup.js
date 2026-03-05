#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { DeterministicMatcher } = require('../deterministic-matcher');
const { ProbabilisticMatcher } = require('../probabilistic-matcher');
const { SurvivorshipEngine } = require('../survivorship-engine');
const { GovernanceController, AuditLogger, ACTION_OUTCOME } = require('../governance');

function parseArgs(argv) {
  const options = {
    object: 'Account',
    mode: 'detect',
    threshold: Number(process.env.DEDUP_AUTO_THRESHOLD || 95),
    reviewThreshold: Number(process.env.DEDUP_REVIEW_THRESHOLD || 80),
    input: process.env.DEDUP_INPUT_PATH || null,
    clusterFile: null,
    output: process.env.DEDUP_OUTPUT_PATH || null,
    dryRun: process.env.DEDUP_DRY_RUN === '1',
    limit: null,
    reviewQueue: true,
    reviewQueuePath: process.env.DQ_REVIEW_QUEUE_PATH || null,
    org: 'default'
  };

  const args = [...argv];
  const takeValue = (inline) => (inline !== undefined
    ? inline
    : (args[0] && !args[0].startsWith('--') ? args.shift() : undefined));
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) continue;

    const [flag, inlineValue] = token.split('=');
    const key = flag.replace(/^--/, '');
    const value = takeValue(inlineValue);

    switch (key) {
      case 'object':
        options.object = value || options.object;
        break;
      case 'mode':
        options.mode = value || options.mode;
        break;
      case 'threshold':
        options.threshold = value ? Number(value) : options.threshold;
        break;
      case 'review-threshold':
        options.reviewThreshold = value ? Number(value) : options.reviewThreshold;
        break;
      case 'input':
        options.input = value || options.input;
        break;
      case 'cluster-file':
        options.clusterFile = value || options.clusterFile;
        break;
      case 'output':
        options.output = value || options.output;
        break;
      case 'dry-run':
        options.dryRun = true;
        break;
      case 'limit':
        options.limit = value ? Number(value) : options.limit;
        break;
      case 'no-review-queue':
        options.reviewQueue = false;
        break;
      case 'review-queue':
        options.reviewQueuePath = value || options.reviewQueuePath;
        break;
      case 'org':
        options.org = value || options.org;
        break;
      case 'help':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`\nDeduplication Runner\n\nUsage:\n  node scripts/lib/deduplication/run-dedup.js --input <path> [options]\n\nOptions:\n  --object Account|Contact|Lead       Target object (default: Account)\n  --mode detect|merge|both            Operation mode (default: detect)\n  --threshold 95                      Auto-merge confidence threshold\n  --review-threshold 80               Review queue threshold\n  --cluster-file path                 Use existing cluster file for merge\n  --output path                       Write results to file\n  --dry-run                           Preview merges without applying\n  --limit 500                         Limit records processed\n  --no-review-queue                   Disable review queue output\n  --review-queue path                 Override review queue path\n  --org alias                          Label for org name\n`);
}

function resolveStateDir() {
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  return process.env.DQ_STATE_DIR || path.join(repoRoot, 'reports', 'data-quality');
}

function loadJson(inputPath) {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to load JSON from ${inputPath}: ${error.message}`);
    process.exit(1);
  }
}

function sliceRecords(records, limit) {
  if (!Array.isArray(records)) return [];
  if (!limit || Number.isNaN(limit)) return records;
  return records.slice(0, limit);
}

function getRecordId(record, index) {
  if (!record) return `record-${index}`;
  return record.Id || record.id || record.recordId || record._id || record._dedupIndex || `record-${index}`;
}

function normalizeClusterRecords(cluster) {
  return (cluster.records || []).map(entry => entry.record || entry);
}

function selectRecords(raw, objectType, limit) {
  const data = Array.isArray(raw) ? { records: raw } : (raw || {});
  const normalized = objectType.toLowerCase();
  let records = [];

  if (normalized === 'account' || normalized === 'accounts') {
    records = data.accounts || data.Accounts || [];
  } else if (normalized === 'contact' || normalized === 'contacts') {
    records = data.contacts || data.Contacts || [];
  } else if (normalized === 'lead' || normalized === 'leads') {
    records = data.leads || data.Leads || [];
  } else {
    records = data.records || data.Records || [];
  }

  if (!records || records.length === 0) {
    records = Array.isArray(raw) ? raw : [];
  }

  return sliceRecords(records, limit);
}

function combineClusters(rawClusters) {
  const parent = rawClusters.map((_, idx) => idx);
  const recordIndex = new Map();

  const find = (x) => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };

  const union = (x, y) => {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent[px] = py;
  };

  rawClusters.forEach((cluster, idx) => {
    cluster.recordIds.forEach(recordId => {
      if (recordIndex.has(recordId)) {
        union(idx, recordIndex.get(recordId));
      } else {
        recordIndex.set(recordId, idx);
      }
    });
  });

  const merged = new Map();
  rawClusters.forEach((cluster, idx) => {
    const root = find(idx);
    if (!merged.has(root)) {
      merged.set(root, {
        records: [],
        recordIds: new Set(),
        sources: new Set(),
        confidences: [],
        details: []
      });
    }
    const entry = merged.get(root);
    cluster.records.forEach((record, recordIdx) => {
      const recordId = getRecordId(record, recordIdx);
      if (!entry.recordIds.has(recordId)) {
        entry.records.push(record);
        entry.recordIds.add(recordId);
      }
    });
    entry.sources.add(cluster.source);
    entry.confidences.push(cluster.confidence || 0);
    entry.details.push(cluster.detail);
  });

  return Array.from(merged.values()).map((cluster, idx) => {
    const maxConfidence = Math.max(...cluster.confidences, 0);
    return {
      id: `cluster-${idx + 1}`,
      recordCount: cluster.records.length,
      recordIds: Array.from(cluster.recordIds),
      records: cluster.records,
      confidence: maxConfidence,
      sources: Array.from(cluster.sources),
      details: cluster.details
    };
  });
}

function classifyCluster(cluster, thresholds) {
  if (cluster.confidence >= thresholds.autoMerge) return 'auto_merge';
  if (cluster.confidence >= thresholds.review) return 'needs_review';
  return 'skip';
}

function detectClusters(records, options) {
  const entityType = options.object.toLowerCase();
  records.forEach((record, idx) => {
    if (record && record._dedupIndex === undefined) {
      record._dedupIndex = idx;
    }
  });
  const deterministicMatcher = new DeterministicMatcher({ entityType });
  const deterministic = deterministicMatcher.match(records, { includeUnmatched: false });

  const probabilisticMatcher = new ProbabilisticMatcher({
    entityType,
    thresholds: {
      autoMerge: options.threshold,
      review: options.reviewThreshold
    }
  });
  const probabilistic = probabilisticMatcher.findDuplicates(records, {
    minScore: options.reviewThreshold
  });

  const rawClusters = [];
  deterministic.clusters.forEach(cluster => {
    rawClusters.push({
      source: 'deterministic',
      confidence: cluster.confidence || 0,
      records: normalizeClusterRecords(cluster),
      recordIds: normalizeClusterRecords(cluster).map((record, idx) => getRecordId(record, idx)),
      detail: cluster
    });
  });

  probabilistic.clusters.forEach(cluster => {
    rawClusters.push({
      source: 'probabilistic',
      confidence: cluster.maxScore || 0,
      records: cluster.records || [],
      recordIds: (cluster.records || []).map((record, idx) => getRecordId(record, idx)),
      detail: cluster
    });
  });

  const clusters = combineClusters(rawClusters).map(cluster => {
    const classification = classifyCluster(cluster, {
      autoMerge: options.threshold,
      review: options.reviewThreshold
    });
    return { ...cluster, classification };
  });

  return {
    clusters,
    stats: {
      deterministicClusters: deterministic.clusters.length,
      probabilisticClusters: probabilistic.clusterCount,
      totalClusters: clusters.length,
      autoMerge: clusters.filter(c => c.classification === 'auto_merge').length,
      needsReview: clusters.filter(c => c.classification === 'needs_review').length
    }
  };
}

function resolveQueuePath(explicitPath) {
  if (explicitPath) return explicitPath;
  const stateDir = resolveStateDir();
  return path.join(stateDir, 'review-queue.json');
}

function enqueueReviewItems(items, queuePath) {
  if (!items || items.length === 0) return;

  const resolved = resolveQueuePath(queuePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  let queue = { items: [] };
  if (fs.existsSync(resolved)) {
    try {
      queue = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    } catch (error) {
      queue = { items: [] };
    }
  }

  const now = new Date().toISOString();
  const formatted = items.map(item => ({
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: item,
    context: {},
    confidence: item.confidence || 0,
    requiredApprovers: [],
    status: 'pending',
    createdAt: now,
    approvals: [],
    rejections: []
  }));

  queue.items = queue.items.concat(formatted);
  fs.writeFileSync(resolved, JSON.stringify(queue, null, 2));
}

function saveSnapshots(clusters, stateDir) {
  const snapshotDir = path.join(stateDir, 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });

  return clusters.map(cluster => {
    const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      clusterId: cluster.id,
      records: cluster.records,
      recordIds: cluster.recordIds,
      confidence: cluster.confidence,
      sources: cluster.sources
    };

    const snapshotPath = path.join(snapshotDir, `${snapshotId}.json`);
    fs.writeFileSync(snapshotPath, JSON.stringify(payload, null, 2));
    return { snapshotId, snapshotPath };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const mode = options.mode.toLowerCase();
  const needsDetection = mode === 'detect' || (mode === 'both' && !options.clusterFile) || (mode === 'merge' && !options.clusterFile);

  let clusters = [];
  if (needsDetection) {
    if (!options.input) {
      console.error('❌ Missing input data. Provide --input or set DEDUP_INPUT_PATH.');
      process.exit(1);
    }

    const raw = loadJson(options.input);
    const records = selectRecords(raw, options.object, options.limit);

    if (!records || records.length === 0) {
      console.error('❌ No records found for deduplication.');
      process.exit(1);
    }

    const detection = detectClusters(records, options);
    clusters = detection.clusters;

    console.log(`🔍 Found ${detection.stats.totalClusters} clusters (${detection.stats.autoMerge} auto-merge, ${detection.stats.needsReview} review)`);
  }

  if (options.clusterFile && (mode === 'merge' || mode === 'both')) {
    const clusterData = loadJson(options.clusterFile);
    clusters = clusterData.clusters || clusterData;
    clusters.forEach((cluster, clusterIdx) => {
      (cluster.records || []).forEach((record, idx) => {
        if (record && record._dedupIndex === undefined) {
          record._dedupIndex = clusterIdx * 100000 + idx;
        }
      });
    });
  }

  if (mode === 'detect') {
    const output = { clusters, generatedAt: new Date().toISOString() };
    if (options.output) {
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
      console.log(`✅ Clusters exported to ${options.output}`);
    } else {
      console.log(JSON.stringify(output, null, 2));
    }
    return;
  }

  const governance = new GovernanceController();
  const autoMergeClusters = clusters.filter(cluster => cluster.classification === 'auto_merge');
  const reviewClusters = clusters.filter(cluster => cluster.classification === 'needs_review');

  if (options.reviewQueue && reviewClusters.length > 0) {
    const reviewItems = reviewClusters.map(cluster => ({
      type: 'merge',
      actionType: 'account_merge',
      objectType: options.object,
      clusterId: cluster.id,
      recordIds: cluster.recordIds,
      recordCount: cluster.recordCount,
      confidence: cluster.confidence
    }));
    enqueueReviewItems(reviewItems, options.reviewQueuePath);
  }

  if (autoMergeClusters.length === 0) {
    console.log('ℹ️ No auto-merge clusters found.');
    return;
  }

  const engine = new SurvivorshipEngine({ entityType: options.object.toLowerCase() });
  const mergeResults = [];

  autoMergeClusters.forEach(cluster => {
    const decision = governance.canAutoExecute(
      { type: 'account_merge', recordIds: cluster.recordIds, recordCount: cluster.recordCount },
      cluster.confidence
    );

    if (decision.outcome !== ACTION_OUTCOME.APPROVED) {
      return;
    }

    try {
      const result = engine.buildGoldenRecord(cluster.records, {});
      mergeResults.push({
        clusterId: cluster.id,
        confidence: cluster.confidence,
        masterRecordId: result.masterRecordId,
        goldenRecord: result.goldenRecord,
        fieldLineage: result.fieldLineage,
        mergeStats: result.mergeStats
      });
    } catch (error) {
      mergeResults.push({
        clusterId: cluster.id,
        error: error.message
      });
    }
  });

  const stateDir = resolveStateDir();
  fs.mkdirSync(stateDir, { recursive: true });

  const snapshots = saveSnapshots(autoMergeClusters, stateDir);

  const auditLogger = new AuditLogger({ storagePath: path.join(stateDir, 'audit-logs') });
  const mergeResultMap = new Map(mergeResults.map(result => [result.clusterId, result]));
  autoMergeClusters.forEach(cluster => {
    const mergeResult = mergeResultMap.get(cluster.id);
    const goldenRecord = mergeResult?.goldenRecord || cluster.records[0] || {};
    const fieldLineage = mergeResult?.fieldLineage || {};
    auditLogger.logMerge({
      records: cluster.records,
      confidence: cluster.confidence
    }, goldenRecord, fieldLineage);
  });
  auditLogger.destroy();

  const outputPayload = {
    mode,
    object: options.object,
    dryRun: options.dryRun,
    clusters: autoMergeClusters.length,
    mergeResults,
    snapshots,
    reviewQueued: reviewClusters.length,
    generatedAt: new Date().toISOString()
  };

  if (options.output) {
    fs.writeFileSync(options.output, JSON.stringify(outputPayload, null, 2));
    console.log(`✅ Merge results saved to ${options.output}`);
  } else {
    console.log(JSON.stringify(outputPayload, null, 2));
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Deduplication failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  detectClusters,
  selectRecords
};
