#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { EnrichmentPipeline } = require('./enrichment-pipeline');

function parseArgs(argv) {
  const options = {
    object: 'Account',
    fields: null,
    source: 'auto',
    confidence: Number(process.env.ENRICHMENT_CONFIDENCE || 4),
    limit: null,
    input: process.env.ENRICHMENT_INPUT_PATH || null,
    outputDir: process.env.ENRICHMENT_OUTPUT_DIR || null,
    dryRun: process.env.ENRICHMENT_DRY_RUN === '1',
    queueReview: true,
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
      case 'fields':
        options.fields = value || options.fields;
        break;
      case 'source':
        options.source = value ? value.toLowerCase() : options.source;
        break;
      case 'confidence':
        options.confidence = value ? Number(value) : options.confidence;
        break;
      case 'limit':
        options.limit = value ? Number(value) : options.limit;
        break;
      case 'input':
        options.input = value || options.input;
        break;
      case 'output-dir':
        options.outputDir = value || options.outputDir;
        break;
      case 'dry-run':
        options.dryRun = true;
        break;
      case 'org':
        options.org = value || options.org;
        break;
      case 'no-review-queue':
        options.queueReview = false;
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
  console.log(`\nEnrichment Runner\n\nUsage:\n  node scripts/lib/enrichment/run-enrichment.js --input <path> [options]\n\nOptions:\n  --object Account|Contact|Lead       Target object (default: Account)\n  --fields industry,employee_count    Fields to enrich (default from config)\n  --source auto|website|search         Enrichment sources (default: auto)\n  --confidence 4                      Minimum confidence to apply\n  --limit 100                         Limit records processed\n  --output-dir path                   Directory for output files\n  --dry-run                           Preview without writing update payloads\n  --no-review-queue                   Disable review queue output\n  --org alias                          Label for org name\n  --input path                        JSON input data file\n`);
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

function resolveOutputDir(explicitPath) {
  if (explicitPath) return explicitPath;
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  return path.join(repoRoot, 'reports', 'data-quality', 'enrichment');
}

function loadConfig() {
  const configPath = path.resolve(__dirname, '../../..', 'config', 'enrichment-config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    return {};
  }
}

function resolveFields(config, objectType, fieldsArg) {
  if (fieldsArg) {
    return fieldsArg.split(',').map(f => f.trim()).filter(Boolean);
  }

  const bucket = objectType.toLowerCase() === 'contact'
    ? config.biographic_fields
    : config.firmographic_fields;

  if (!bucket) return [];
  return [...(bucket.required || []), ...(bucket.optional || [])];
}

function buildFetchFn(timeoutMs) {
  return async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return await response.text();
    } catch (error) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function buildSearchFn() {
  const apiUrl = process.env.ENRICHMENT_SEARCH_API_URL;
  if (!apiUrl) return null;

  const apiKey = process.env.ENRICHMENT_SEARCH_API_KEY;
  const authHeader = process.env.ENRICHMENT_SEARCH_API_AUTH_HEADER || 'Authorization';

  return async (query) => {
    const url = apiUrl.includes('{query}')
      ? apiUrl.replace('{query}', encodeURIComponent(query))
      : `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}`;

    const headers = {};
    if (apiKey) {
      headers[authHeader] = authHeader.toLowerCase() === 'authorization'
        ? `Bearer ${apiKey}`
        : apiKey;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) return [];

    const data = await response.json();
    const results = data.results || data.items || data.organic_results || [];

    return results.map(result => ({
      url: result.url || result.link || result.source,
      snippet: result.snippet || result.description || result.content || '',
      title: result.title || ''
    }));
  };
}

function buildEnricherOrder(config, sourceArg) {
  const available = ['website', 'search'];
  const configured = config.enrichers?.order || available;

  if (!sourceArg || sourceArg === 'auto') {
    return configured.filter(source => available.includes(source));
  }

  return sourceArg.split(',').map(s => s.trim()).filter(source => available.includes(source));
}

function buildUpdatePayload(record, enrichedRecord, targetFields) {
  const id = record.Id || record.id || record.recordId || record._id;
  if (!id) return null;

  const properties = {};
  targetFields.forEach(field => {
    if (enrichedRecord[field] !== undefined && enrichedRecord[field] !== record[field]) {
      properties[field] = enrichedRecord[field];
    }
  });

  if (Object.keys(properties).length === 0) return null;
  return { id, properties };
}

function resolveReviewQueuePath() {
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  const stateDir = process.env.DQ_STATE_DIR || path.join(repoRoot, 'reports', 'data-quality');
  return process.env.DQ_REVIEW_QUEUE_PATH || path.join(stateDir, 'review-queue.json');
}

function enqueueReviewItems(items) {
  if (!items || items.length === 0) return;

  const queuePath = resolveReviewQueuePath();
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });

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

function updateStatus(outputDir, summary) {
  const statusPath = path.join(outputDir, 'status.json');
  let status = { history: [] };

  if (fs.existsSync(statusPath)) {
    try {
      status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    } catch (error) {
      status = { history: [] };
    }
  }

  status.lastRun = summary;
  status.history = (status.history || []).concat(summary).slice(-50);

  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input) {
    console.error('❌ Missing input data. Provide --input or set ENRICHMENT_INPUT_PATH.');
    process.exit(1);
  }

  const raw = loadJson(options.input);
  const records = selectRecords(raw, options.object, options.limit);

  if (!records || records.length === 0) {
    console.error('❌ No records found for enrichment.');
    process.exit(1);
  }

  const config = loadConfig();
  const targetFields = resolveFields(config, options.object, options.fields);
  const bucket = options.object.toLowerCase() === 'contact'
    ? config.biographic_fields
    : config.firmographic_fields;
  const requiredFields = options.fields ? targetFields : (bucket?.required || []);
  const optionalFields = options.fields ? [] : (bucket?.optional || []);

  if (targetFields.length === 0) {
    console.error('❌ No target fields provided or configured.');
    process.exit(1);
  }

  const enricherOrder = buildEnricherOrder(config, options.source);
  const offline = ['1', 'true', 'yes'].includes((process.env.ENRICHMENT_OFFLINE || '').toLowerCase());
  const searchFn = offline ? null : buildSearchFn();

  if (offline) {
    console.log('⚠️  ENRICHMENT_OFFLINE enabled; network enrichers are disabled.');
  }

  if (options.source.includes('linkedin')) {
    console.log('⚠️  LinkedIn enricher requested but not available in this pipeline.');
  }

  if (options.source.includes('search') && !searchFn) {
    console.log('⚠️  Search enricher requested but ENRICHMENT_SEARCH_API_URL not set.');
  }

  if (enricherOrder.length === 0) {
    console.error('❌ No valid enrichment sources selected.');
    process.exit(1);
  }

  const fetchFn = offline ? async () => null : buildFetchFn(config.enrichers?.timeout_ms?.website || 15000);

  const pipeline = new EnrichmentPipeline({
    confidenceThreshold: options.confidence,
    requiredFields,
    optionalFields,
    protectedFields: config.protected_fields || [],
    enricherOptions: {
      website: { fetchFn },
      search: { searchFn }
    }
  });

  const results = await pipeline.enrichBatch(records, {
    targetFields,
    enricherOrder
  });

  const highConfidence = [];
  const reviewItems = [];
  const updatePayload = [];

  const reviewThreshold = Number(process.env.ENRICHMENT_REVIEW_THRESHOLD || Math.max(1, options.confidence - 1));

  results.forEach((result, idx) => {
    if (!result || !result.enrichedRecord) return;
    const record = records[idx] || {};
    const update = buildUpdatePayload(record, result.enrichedRecord, targetFields);

    if (result.confidence >= options.confidence) {
      if (update) {
        updatePayload.push(update);
        highConfidence.push(result);
      }
    } else if (result.confidence >= reviewThreshold) {
      reviewItems.push({
        type: 'enrichment',
        objectType: options.object,
        recordId: record.Id || record.id,
        fields: targetFields,
        confidence: result.confidence,
        preview: result.enrichedRecord
      });
    }
  });

  const outputDir = resolveOutputDir(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = Date.now();
  const resultsPath = path.join(outputDir, `enrichment-results-${timestamp}.json`);
  const highConfidencePath = path.join(outputDir, `enrichment-high-confidence-${timestamp}.json`);
  const payloadPath = path.join(outputDir, `enrichment-update-payload-${timestamp}.json`);

  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  fs.writeFileSync(highConfidencePath, JSON.stringify(highConfidence, null, 2));

  if (!options.dryRun) {
    fs.writeFileSync(payloadPath, JSON.stringify(updatePayload, null, 2));
  }

  if (options.queueReview && reviewItems.length > 0) {
    enqueueReviewItems(reviewItems);
  }

  const summary = {
    object: options.object,
    recordsProcessed: records.length,
    enriched: highConfidence.length,
    reviewQueued: reviewItems.length,
    dryRun: options.dryRun,
    timestamp: new Date().toISOString(),
    resultsPath,
    payloadPath: options.dryRun ? null : payloadPath
  };

  updateStatus(outputDir, summary);

  console.log(`✅ Enrichment complete. ${highConfidence.length} records ready for update.`);
  console.log(`📄 Results: ${resultsPath}`);
  if (options.dryRun) {
    console.log('🧪 Dry run enabled; update payload not written.');
  } else {
    console.log(`📦 Update payload: ${payloadPath}`);
  }
}

main().catch(error => {
  console.error(`❌ Enrichment failed: ${error.message}`);
  process.exit(1);
});
