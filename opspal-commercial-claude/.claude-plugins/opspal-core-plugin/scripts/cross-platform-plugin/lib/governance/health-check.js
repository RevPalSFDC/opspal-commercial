#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { FieldTelemetryAnalyzer, DataHealthReporter } = require('./index');

const DEFAULT_FORMAT = process.env.DQ_HEALTH_FORMAT || 'markdown';

function parseArgs(argv) {
  const options = {
    object: 'all',
    format: DEFAULT_FORMAT,
    input: process.env.DQ_INPUT_PATH || null,
    org: 'default',
    withTrends: false,
    limit: null
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
      case 'format':
        options.format = value || options.format;
        break;
      case 'input':
        options.input = value || options.input;
        break;
      case 'org':
        options.org = value || options.org;
        break;
      case 'with-trends':
        options.withTrends = true;
        break;
      case 'limit':
        options.limit = value ? Number(value) : null;
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
  console.log(`\nData Health Check\n\nUsage:\n  node scripts/lib/governance/health-check.js --input <path> [options]\n\nOptions:\n  --object Account|Contact|Lead|all   Target object type (default: all)\n  --format markdown|json|csv          Output format (default: ${DEFAULT_FORMAT})\n  --org alias                          Label for org name\n  --with-trends                       Persist history for trend analysis\n  --limit 500                         Limit records analyzed\n  --input path                        JSON input data file\n`);
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

async function buildFieldAnalysis(analyzer, objectName, records) {
  const fields = collectFields(records);
  const fieldAnalysis = {};

  const tasks = fields.map(async field => {
    const analysis = await analyzer.analyzeFieldHealth(objectName, field, { records });
    fieldAnalysis[field] = analysis;
  });

  await Promise.all(tasks);
  return fieldAnalysis;
}

function resolveStateDir() {
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  return process.env.DQ_STATE_DIR || path.join(repoRoot, 'reports', 'data-quality');
}

function loadHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return [];
  try {
    const content = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    return Array.isArray(content) ? content : content.history || [];
  } catch (error) {
    return [];
  }
}

function saveHistory(historyPath, history) {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify({ history }, null, 2));
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
  const records = pickRecords(data, options.object, options.limit);

  if (!records || records.length === 0) {
    console.error(`❌ No records found for ${options.object}. Check input data.`);
    process.exit(1);
  }

  const analyzer = new FieldTelemetryAnalyzer();
  const fieldAnalysis = await buildFieldAnalysis(analyzer, options.object, records);

  const reporter = new DataHealthReporter({ orgName: options.org });

  if (options.withTrends) {
    const historyPath = process.env.DQ_HEALTH_HISTORY_PATH || path.join(resolveStateDir(), 'health-history.json');
    reporter._history = loadHistory(historyPath);

    const report = reporter.generateScorecard({
      fieldAnalysis,
      anomalies: [],
      totalRecords: records.length
    });

    saveHistory(historyPath, reporter._history);
    console.log(reporter.formatReport(report, options.format));
    return;
  }

  const report = reporter.generateScorecard({
    fieldAnalysis,
    anomalies: [],
    totalRecords: records.length
  });

  console.log(reporter.formatReport(report, options.format));
}

main().catch(error => {
  console.error(`❌ Health check failed: ${error.message}`);
  process.exit(1);
});
