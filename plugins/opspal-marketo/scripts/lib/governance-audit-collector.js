#!/usr/bin/env node

/**
 * Governance Audit Collector for Marketo
 *
 * Collects instance inventory via API and runs governance audit:
 * - Programs and tags
 * - Smart campaigns
 * - Manual evidence file
 *
 * @module governance-audit-collector
 * @version 1.0.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { apiRequest, getConfig } from './marketo-auth-manager.js';

const require = createRequire(import.meta.url);
const {
  buildGovernanceReport,
  saveGovernanceReport,
} = require('./governance-audit-runner.js');

const {
  storeAssessment,
} = require('./assessment-history-tracker.js');

const {
  recordAssessment,
} = require('./instance-context-manager.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLUGIN_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_PORTALS_DIR = path.join(PLUGIN_ROOT, 'portals');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { positional: [] };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      parsed[key] = value;
    } else {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }
  return search.toString();
}

async function fetchPaged(endpointBase, params, instanceName, maxRecords) {
  const results = [];
  let offset = 0;
  const maxReturn = Math.min(Number(params.maxReturn) || 200, 200);

  while (true) {
    const query = buildQuery({ ...params, maxReturn, offset });
    const endpoint = `${endpointBase}?${query}`;
    const response = await apiRequest(endpoint, {}, instanceName);

    if (!response.success) {
      const message = response.errors?.[0]?.message || 'Unknown API error';
      throw new Error(`${endpointBase} request failed: ${message}`);
    }

    const batch = response.result || [];
    results.push(...batch);

    if (maxRecords && results.length >= maxRecords) {
      return results.slice(0, maxRecords);
    }

    if (batch.length < maxReturn) {
      return results;
    }

    offset += maxReturn;
  }
}

async function fetchPrograms(instanceName, maxRecords) {
  return fetchPaged('/rest/asset/v1/programs.json', { maxReturn: 200 }, instanceName, maxRecords);
}

async function fetchCampaigns(instanceName, maxRecords) {
  return fetchPaged('/rest/asset/v1/smartCampaigns.json', { maxReturn: 200 }, instanceName, maxRecords);
}

function loadManualEvidence({ evidenceFile, instanceName, portalsDir }) {
  const defaultEvidencePath = path.join(portalsDir, instanceName, 'governance', 'evidence', 'evidence.json');
  const resolvedPath = evidenceFile
    ? path.resolve(process.cwd(), evidenceFile)
    : defaultEvidencePath;

  if (!fs.existsSync(resolvedPath)) {
    return { evidence: {}, evidencePath: null };
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    return { evidence: JSON.parse(content), evidencePath: resolvedPath };
  } catch (error) {
    console.warn(`Warning: failed to read evidence file: ${error.message}`);
    return { evidence: {}, evidencePath: resolvedPath };
  }
}

function saveEvidenceSnapshot({ evidence, instanceName, portalsDir }) {
  if (!evidence || Object.keys(evidence).length === 0) {
    return null;
  }

  const evidenceDir = path.join(portalsDir, instanceName, 'governance', 'evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filepath = path.join(evidenceDir, `evidence-${timestamp}.json`);
  fs.writeFileSync(filepath, JSON.stringify(evidence, null, 2));

  return filepath;
}

function scoreReport(report) {
  const weights = { info: 0, warning: 5, critical: 20 };
  const penalty = report.issues.reduce((sum, issue) => {
    const weight = weights[issue.severity] ?? 0;
    return sum + weight;
  }, 0);

  return Math.max(0, 100 - penalty);
}

async function run() {
  const args = parseArgs();
  const instanceName = args.instance || args.instance_name || args.positional[0] || process.env.MARKETO_INSTANCE_NAME || 'default';
  const mode = (args.mode || 'hybrid').toLowerCase();
  if (!['manual', 'hybrid'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Use \"manual\" or \"hybrid\".`);
  }
  const requiredTags = parseList(args.required_tags || args.requiredTags);
  const maxRecords = args.max_records ? Number(args.max_records) : null;
  const portalsDir = args.portals_dir ? path.resolve(process.cwd(), args.portals_dir) : DEFAULT_PORTALS_DIR;

  const config = getConfig(instanceName);
  const instanceId = instanceName;
  const displayName = config.instanceName || instanceName;
  const instanceLabel = config.munchkinId ? `${displayName} (${config.munchkinId})` : displayName;

  const { evidence, evidencePath } = loadManualEvidence({
    evidenceFile: args.evidence_file,
    instanceName: instanceLabel,
    portalsDir,
  });

  const manualEvidenceSnapshot = saveEvidenceSnapshot({
    evidence,
    instanceName,
    portalsDir,
  });

  let programs = [];
  let campaigns = [];

  if (mode === 'hybrid') {
    programs = await fetchPrograms(instanceName, maxRecords);
    campaigns = await fetchCampaigns(instanceName, maxRecords);
  }

  const report = buildGovernanceReport({
    instanceId,
    instanceName,
    programs,
    campaigns,
    manualEvidence: evidence,
    manualEvidenceSource: manualEvidenceSnapshot || evidencePath,
  }, {
    requiredTags,
  });

  const { jsonPath, mdPath } = saveGovernanceReport(report, portalsDir);

  const score = scoreReport(report);

  const assessmentRecord = storeAssessment(instanceName, 'governance', {
    score,
    metrics: {
      namingCompliancePrograms: report.summary.namingCompliancePrograms,
      namingComplianceCampaigns: report.summary.namingComplianceCampaigns,
      tagCoverageRate: report.summary.tagCoverageRate,
      activeTriggerCount: report.summary.activeTriggerCount,
      manualEvidenceComplete: report.summary.manualEvidenceComplete,
    },
    issues: report.issues,
    recommendations: report.recommendations,
    summary: report.summary,
    reportPath: mdPath,
  }, portalsDir);

  recordAssessment(instanceName, {
    type: 'governance',
    summary: report.summary,
    score,
    issues: report.issues,
    reportPath: mdPath,
    completedBy: 'governance-audit-collector',
  }, portalsDir);

  console.log('Governance audit completed.');
  console.log(`Report (JSON): ${jsonPath}`);
  console.log(`Report (Markdown): ${mdPath}`);
  console.log(`Assessment record: ${assessmentRecord.id}`);
  console.log(`Score: ${score}`);
}

run().catch((error) => {
  console.error(`Governance audit failed: ${error.message}`);
  process.exit(1);
});
