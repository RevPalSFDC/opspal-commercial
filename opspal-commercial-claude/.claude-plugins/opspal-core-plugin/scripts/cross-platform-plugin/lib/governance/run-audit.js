#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  FieldTelemetryAnalyzer,
  DataHealthReporter,
  AnomalyDetectionEngine,
  RelationshipInferenceService,
  GovernanceController,
  AuditLogger,
  ACTION_OUTCOME
} = require('./index');

const { DeterministicMatcher } = require('../deterministic-matcher');
const { ProbabilisticMatcher } = require('../probabilistic-matcher');

const DEFAULT_FORMAT = process.env.DQ_AUDIT_FORMAT || 'markdown';
const DEFAULT_SCOPE = process.env.DQ_AUDIT_SCOPE || 'quick';

function parseArgs(argv) {
  const options = {
    object: 'all',
    scope: DEFAULT_SCOPE,
    output: 'report',
    format: DEFAULT_FORMAT,
    org: 'default',
    input: process.env.DQ_INPUT_PATH || null,
    fields: null,
    limit: null,
    enqueueReview: process.env.DQ_ENQUEUE_REVIEW === '1'
  };

  const args = [...argv];
  const takeValue = (inline) => (inline !== undefined
    ? inline
    : (args[0] && !args[0].startsWith('--') ? args.shift() : undefined));
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) {
      continue;
    }

    const [flag, inlineValue] = token.split('=');
    const key = flag.replace(/^--/, '');
    const value = takeValue(inlineValue);

    switch (key) {
      case 'object':
        options.object = value || options.object;
        break;
      case 'scope':
        options.scope = value ? value.toLowerCase() : options.scope;
        break;
      case 'output':
        options.output = value ? value.toLowerCase() : options.output;
        break;
      case 'format':
        options.format = value ? value.toLowerCase() : options.format;
        break;
      case 'org':
        options.org = value || options.org;
        break;
      case 'input':
        options.input = value || options.input;
        break;
      case 'fields':
        options.fields = value || null;
        break;
      case 'limit':
        options.limit = value ? Number(value) : null;
        break;
      case 'enqueue-review':
        options.enqueueReview = true;
        break;
      case 'no-enqueue-review':
        options.enqueueReview = false;
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
  console.log(`\nData Quality Audit\n\nUsage:\n  node scripts/lib/governance/run-audit.js --input <path> [options]\n\nOptions:\n  --object Account|Contact|Lead|all   Target object type (default: all)\n  --scope full|quick                  Audit depth (default: ${DEFAULT_SCOPE})\n  --output report|actions|both        Output format (default: report)\n  --format markdown|json|csv          Report format (default: ${DEFAULT_FORMAT})\n  --fields name,email,phone           Comma-separated fields to analyze\n  --limit 500                         Limit records analyzed\n  --enqueue-review                    Push review items to queue\n  --no-enqueue-review                 Disable review queue writes\n  --org alias                          Label for org name\n  --input path                         JSON input data file\n`);
}

function loadJson(inputPath) {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to load input data from ${inputPath}: ${error.message}`);
    process.exit(1);
  }
}

function normalizeData(raw) {
  if (Array.isArray(raw)) {
    return { records: raw };
  }
  return raw || {};
}

function sliceRecords(records, limit) {
  if (!Array.isArray(records)) return [];
  if (!limit || Number.isNaN(limit)) return records;
  return records.slice(0, limit);
}

function pickRecords(data, objectName, limit) {
  const normalized = objectName.toLowerCase();
  let records = [];

  if (normalized === 'account' || normalized === 'accounts') {
    records = data.accounts || data.Accounts || data.account || [];
  } else if (normalized === 'contact' || normalized === 'contacts') {
    records = data.contacts || data.Contacts || data.contact || [];
  } else if (normalized === 'lead' || normalized === 'leads') {
    records = data.leads || data.Leads || data.lead || [];
  } else if (normalized === 'all') {
    records = [].concat(
      data.accounts || data.Accounts || [],
      data.contacts || data.Contacts || [],
      data.leads || data.Leads || [],
      data.records || data.Records || []
    );
  } else {
    records = data.records || data.Records || [];
  }

  if ((!records || records.length === 0) && Array.isArray(data.records)) {
    records = data.records;
  }

  return sliceRecords(records, limit);
}

function collectFields(records) {
  const fieldSet = new Set();
  (records || []).forEach(record => {
    if (!record || typeof record !== 'object') return;
    Object.keys(record).forEach(key => fieldSet.add(key));
  });
  return Array.from(fieldSet);
}

async function buildFieldAnalysis(analyzer, objectName, records, fields) {
  const selectedFields = fields && fields.length > 0 ? fields : collectFields(records);
  const fieldAnalysis = {};

  const tasks = selectedFields.map(async field => {
    const analysis = await analyzer.analyzeFieldHealth(objectName, field, { records });
    fieldAnalysis[field] = analysis;
  });

  await Promise.all(tasks);
  return fieldAnalysis;
}

function detectDuplicates(records, objectName, thresholds) {
  if (!records || records.length < 2) {
    return {
      deterministic: { clusters: [], stats: { clustersCreated: 0 } },
      probabilistic: { clusters: [], clusterCount: 0 },
      summary: { clusters: 0, records: 0, autoMerge: 0, needsReview: 0 }
    };
  }

  const entityType = objectName.toLowerCase();
  const deterministicMatcher = new DeterministicMatcher({ entityType });
  const deterministic = deterministicMatcher.match(records, { includeUnmatched: false });

  const probabilisticMatcher = new ProbabilisticMatcher({
    entityType,
    thresholds: {
      autoMerge: thresholds.autoMerge,
      review: thresholds.review
    }
  });
  const probabilistic = probabilisticMatcher.findDuplicates(records, {
    minScore: thresholds.review
  });

  const autoMerge = probabilistic.clusters.filter(c => c.classification === 'auto_merge').length;
  const needsReview = probabilistic.clusters.filter(c => c.classification === 'needs_review').length;

  return {
    deterministic,
    probabilistic,
    summary: {
      clusters: deterministic.clusters.length + probabilistic.clusterCount,
      records: records.length,
      autoMerge,
      needsReview
    }
  };
}

function buildActions(options) {
  const actions = {
    pendingActions: [],
    reviewRequired: [],
    blocked: []
  };

  const governance = new GovernanceController();

  (options.dedupSummary || []).forEach(entry => {
    const confidence = Math.round(entry.confidence || 90);
    const action = {
      type: 'account_merge',
      recordCount: entry.recordCount || 0,
      recordIds: entry.recordIds || []
    };
    const decision = governance.canAutoExecute(action, confidence);
    const item = {
      type: 'merge',
      target: entry.objectType,
      clusters: entry.clusterCount,
      recordCount: entry.recordCount,
      confidence
    };

    if (decision.outcome === ACTION_OUTCOME.PENDING_REVIEW) {
      actions.reviewRequired.push(item);
    } else if (decision.outcome === ACTION_OUTCOME.BLOCKED) {
      actions.blocked.push({ ...item, reason: decision.reason });
    } else {
      actions.pendingActions.push(item);
    }
  });

  (options.enrichmentGaps || []).forEach(gap => {
    const confidence = 85;
    const action = {
      type: 'enrichment',
      recordCount: gap.recordCount,
      fields: [gap.field]
    };
    const decision = governance.canAutoExecute(action, confidence);
    const item = {
      type: 'enrichment',
      target: gap.objectType,
      field: gap.field,
      recordCount: gap.recordCount,
      confidence
    };

    if (decision.outcome === ACTION_OUTCOME.PENDING_REVIEW) {
      actions.reviewRequired.push(item);
    } else if (decision.outcome === ACTION_OUTCOME.BLOCKED) {
      actions.blocked.push({ ...item, reason: decision.reason });
    } else {
      actions.pendingActions.push(item);
    }
  });

  return actions;
}

function resolveStateDir() {
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  return process.env.DQ_STATE_DIR || path.join(repoRoot, 'reports', 'data-quality');
}

function enqueueReviewItems(items) {
  if (!items || items.length === 0) return;

  const stateDir = resolveStateDir();
  const queuePath = process.env.DQ_REVIEW_QUEUE_PATH || path.join(stateDir, 'review-queue.json');
  const queueDir = path.dirname(queuePath);
  fs.mkdirSync(queueDir, { recursive: true });

  let queue = { items: [] };
  if (fs.existsSync(queuePath)) {
    try {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
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
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

function computeEnrichmentGaps(records, objectType) {
  const configPath = path.resolve(__dirname, '../../..', 'config', 'enrichment-config.json');
  if (!fs.existsSync(configPath)) {
    return [];
  }

  let config = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    return [];
  }

  const bucket = objectType.toLowerCase() === 'contact'
    ? config.biographic_fields
    : config.firmographic_fields;

  if (!bucket) return [];

  const fields = [...(bucket.required || []), ...(bucket.optional || [])];
  const gaps = [];

  fields.forEach(field => {
    let missing = 0;
    records.forEach(record => {
      const value = record[field] || record[field.toLowerCase()] || record[field.toUpperCase()];
      if (value === null || value === undefined || value === '') {
        missing += 1;
      }
    });

    if (missing > 0) {
      gaps.push({
        objectType,
        field,
        recordCount: missing
      });
    }
  });

  return gaps;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input) {
    console.error('❌ Missing input data. Provide --input or set DQ_INPUT_PATH.');
    process.exit(1);
  }

  const raw = loadJson(options.input);
  const data = normalizeData(raw);

  const objectName = options.object;
  const normalizedObject = objectName.toLowerCase();
  const isAllObjects = normalizedObject === 'all';
  const records = pickRecords(data, objectName, options.limit);
  const fields = options.fields ? options.fields.split(',').map(f => f.trim()).filter(Boolean) : [];

  if (!records || records.length === 0) {
    console.error(`❌ No records found for ${objectName}. Check input data.`);
    process.exit(1);
  }

  const analyzer = new FieldTelemetryAnalyzer();
  const fieldAnalysis = await buildFieldAnalysis(analyzer, objectName, records, fields);

  const anomalyEngine = new AnomalyDetectionEngine();
  const anomaliesResult = await anomalyEngine.detectAll({
    accounts: data.accounts || data.Accounts || [],
    contacts: data.contacts || data.Contacts || [],
    records: records
  });

  const reporter = new DataHealthReporter({ orgName: options.org });

  const reportInput = {
    fieldAnalysis,
    anomalies: anomaliesResult.anomalies || [],
    totalRecords: records.length
  };

  const report = options.scope === 'full'
    ? reporter.generateDetailedReport(reportInput)
    : reporter.generateScorecard(reportInput);

  const formattedReport = reporter.formatReport(report, options.format);

  const dedup = options.scope === 'full' && !isAllObjects
    ? detectDuplicates(records, objectName, {
        autoMerge: Number(process.env.DEDUP_AUTO_THRESHOLD || 95),
        review: Number(process.env.DEDUP_REVIEW_THRESHOLD || 80)
      })
    : null;

  const relationships = options.scope === 'full'
    ? new RelationshipInferenceService().inferParentChildRelationships(data.accounts || data.Accounts || [])
    : null;

  const enrichmentGaps = isAllObjects
    ? [].concat(
        computeEnrichmentGaps(data.accounts || data.Accounts || [], 'Account'),
        computeEnrichmentGaps(data.contacts || data.Contacts || [], 'Contact')
      )
    : computeEnrichmentGaps(records, objectName);

  const actions = buildActions({
    dedupSummary: dedup
      ? [{
          objectType: objectName,
          clusterCount: dedup.summary.clusters,
          recordCount: dedup.summary.records,
          confidence: Math.max(dedup.summary.autoMerge ? 95 : 80, 80)
        }]
      : [],
    enrichmentGaps
  });

  if (options.enqueueReview && actions.reviewRequired.length > 0) {
    enqueueReviewItems(actions.reviewRequired);
  }

  const outputMode = options.output.toLowerCase();

  if (outputMode === 'report' || outputMode === 'both') {
    console.log(formattedReport);
  }

  if (outputMode === 'actions' || outputMode === 'both') {
    if (outputMode === 'both') {
      console.log('\n---\n');
    }
    console.log(JSON.stringify(actions, null, 2));
  }

  if (dedup) {
    const stateDir = resolveStateDir();
    fs.mkdirSync(stateDir, { recursive: true });
    const auditLogger = new AuditLogger({
      storagePath: path.join(stateDir, 'audit-logs')
    });
    auditLogger.logAction({
      type: 'data_quality_audit',
      recordIds: records.map(r => r.Id || r.id).filter(Boolean),
      metadata: {
        objectType: objectName,
        clusters: dedup.summary.clusters,
        autoMerge: dedup.summary.autoMerge,
        needsReview: dedup.summary.needsReview
      }
    });
    auditLogger.destroy();
  }

  if (options.scope === 'full' && relationships) {
    console.log(`\nRelationship Suggestions: ${relationships.summary.totalSuggestions}`);
  }
}

main().catch(error => {
  console.error(`❌ Audit failed: ${error.message}`);
  process.exit(1);
});
