#!/usr/bin/env node

/**
 * Metric Field Resolver
 *
 * Infers field mappings for canonical metrics and requests confirmation when ambiguous.
 * Persists confirmed mappings per org to avoid repeated prompts.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getInstancePath } = require('./path-conventions');
const { appendLogEntry } = require('./metric-semantic-log');

const DEFAULT_DEFINITIONS_PATH = path.join(__dirname, '../../config/metric-definitions.json');
const DEFAULT_MAPPING_FILENAME = 'metric-field-mapping.json';

function resolveWorkspaceRoot() {
  return process.env.WORKSPACE_DIR || process.cwd();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadDefinitions(definitionsPath) {
  const pathToUse = definitionsPath || DEFAULT_DEFINITIONS_PATH;
  if (!fs.existsSync(pathToUse)) {
    throw new Error(`Metric definitions not found: ${pathToUse}`);
  }
  return loadJson(pathToUse);
}

function getMappingPath(org, options = {}) {
  const workspaceRoot = options.workspaceRoot || resolveWorkspaceRoot();
  const instanceDir = getInstancePath('salesforce', org, null, workspaceRoot);
  ensureDir(instanceDir);
  return options.mappingPath || path.join(instanceDir, DEFAULT_MAPPING_FILENAME);
}

function loadMapping(org, options = {}) {
  const mappingPath = getMappingPath(org, options);
  if (!fs.existsSync(mappingPath)) {
    return {
      schemaVersion: '1.0',
      org,
      lastUpdated: new Date().toISOString(),
      metrics: {},
      reportOverrides: {}
    };
  }
  const mapping = loadJson(mappingPath);
  if (!mapping.metrics) mapping.metrics = {};
  if (!mapping.reportOverrides) mapping.reportOverrides = {};
  if (!mapping.schemaVersion) mapping.schemaVersion = '1.0';
  if (!mapping.org) mapping.org = org;
  return mapping;
}

function saveMapping(org, mapping, options = {}) {
  const mappingPath = getMappingPath(org, options);
  mapping.lastUpdated = new Date().toISOString();
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
  return mappingPath;
}

function normalizeFieldList(rawFields) {
  if (!rawFields) return [];
  if (Array.isArray(rawFields)) {
    return rawFields.map(field => {
      if (typeof field === 'string') {
        return { name: field, label: field, type: null, custom: field.endsWith('__c') };
      }
      return {
        name: field.name || field.apiName || field.field || '',
        label: field.label || field.name || '',
        type: field.type || field.dataType || null,
        custom: field.custom === true || (field.name || '').endsWith('__c')
      };
    }).filter(field => field.name);
  }
  return [];
}

function loadFieldsFromMetadataCache(org, baseObject, options = {}) {
  const workspaceRoot = options.workspaceRoot || resolveWorkspaceRoot();
  const candidatePaths = [
    path.join(workspaceRoot, 'instances', 'salesforce', org, '.metadata-cache', 'metadata.json'),
    path.join(workspaceRoot, 'instances', org, '.metadata-cache', 'metadata.json'),
    path.join(__dirname, '../../instances', 'salesforce', org, '.metadata-cache', 'metadata.json'),
    path.join(__dirname, '../../instances', org, '.metadata-cache', 'metadata.json')
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      const cache = loadJson(candidatePath);
      const objectEntry = cache.objects?.[baseObject];
      if (!objectEntry || !objectEntry.fields) continue;
      const fields = Object.entries(objectEntry.fields).map(([name, info]) => ({
        name,
        label: info.label || name,
        type: info.type || null,
        custom: info.custom === true || name.endsWith('__c')
      }));
      return fields;
    } catch (err) {
      continue;
    }
  }

  return [];
}

function scoreField(field, roleDefinition, preferStandard) {
  let score = 0;
  const fieldName = (field.name || '').toLowerCase();
  const fieldLabel = (field.label || '').toLowerCase();

  const preferredFields = roleDefinition.preferredFields || [];
  const labelHints = roleDefinition.labelHints || [];

  preferredFields.forEach(pref => {
    if (pref.toLowerCase() === fieldName) score += 6;
  });

  labelHints.forEach(hint => {
    const hintLower = hint.toLowerCase();
    if (fieldName.includes(hintLower)) score += 3;
    if (fieldLabel.includes(hintLower)) score += 2;
  });

  if (preferStandard && field.custom === false) score += 2;
  if (!preferStandard && field.custom === true) score += 1;

  if (fieldName.endsWith('__c')) score += roleDefinition.preferCustom ? 1 : 0;
  if (roleDefinition.requireNumeric && field.type && ['currency', 'double', 'percent', 'int'].includes(field.type.toLowerCase())) {
    score += 2;
  }

  return score;
}

function buildCandidates(fields, roleDefinition, preferStandard) {
  if (!fields || fields.length === 0) {
    return (roleDefinition.preferredFields || []).map(fieldName => ({
      field: fieldName,
      label: fieldName,
      custom: fieldName.endsWith('__c'),
      score: 1
    }));
  }

  const candidates = fields.map(field => ({
    field: field.name,
    label: field.label || field.name,
    custom: field.custom === true || field.name.endsWith('__c'),
    score: scoreField(field, roleDefinition, preferStandard)
  })).filter(candidate => candidate.score > 0);

  return candidates.sort((a, b) => b.score - a.score);
}

function chooseCandidate(candidates) {
  if (!candidates || candidates.length === 0) {
    return { field: null, confidence: 0, requiresConfirmation: true };
  }

  const [top, second] = candidates;
  const confidence = second ? top.score / (top.score + second.score) : 1;
  const scoreGap = second ? top.score - second.score : top.score;
  const requiresConfirmation = confidence < 0.6 || scoreGap < 2;

  return {
    field: top.field,
    confidence,
    requiresConfirmation
  };
}

async function promptForChoice(roleName, candidates) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = [
    `\nSelect field for role "${roleName}":`,
    ...candidates.map((candidate, index) => `  ${index + 1}. ${candidate.field} (${candidate.label})`),
    '  0. Skip'
  ].join('\n');

  const answer = await new Promise(resolve => {
    rl.question(`${prompt}\nChoice: `, resolve);
  });

  rl.close();

  const choice = parseInt(answer, 10);
  if (!choice || choice < 1 || choice > candidates.length) {
    return null;
  }
  return candidates[choice - 1].field;
}

async function resolveMetricFields({
  metricId,
  definitions,
  mapping,
  baseObject,
  fields,
  preferStandard,
  interactive
}) {
  const metric = definitions.metrics[metricId];
  if (!metric) {
    throw new Error(`Unknown metricId: ${metricId}`);
  }

  const roles = metric.fieldRoles || {};
  const resolved = {};
  const candidatesByRole = {};
  const confirmationsNeeded = [];

  for (const [roleName, roleDefinition] of Object.entries(roles)) {
    const candidates = buildCandidates(fields, roleDefinition, preferStandard);
    candidatesByRole[roleName] = candidates;
    const choice = chooseCandidate(candidates);

    let selectedField = choice.field;
    let requiresConfirmation = choice.requiresConfirmation;

    if (interactive && requiresConfirmation && candidates.length > 0) {
      const manual = await promptForChoice(roleName, candidates);
      if (manual) {
        selectedField = manual;
        requiresConfirmation = false;
      }
    }

    resolved[roleName] = {
      field: selectedField,
      confidence: choice.confidence,
      requiresConfirmation
    };

    if (requiresConfirmation) {
      confirmationsNeeded.push(roleName);
    }
  }

  const requiredRoles = Object.entries(roles)
    .filter(([, role]) => role.required)
    .map(([roleName]) => roleName);

  const unresolvedRequired = requiredRoles.filter(roleName => !resolved[roleName]?.field);
  const overallConfidence = Object.values(resolved).length > 0
    ? Object.values(resolved).reduce((sum, item) => sum + (item.confidence || 0), 0) / Object.values(resolved).length
    : 0;

  return {
    metricId,
    baseObject,
    resolved,
    candidatesByRole,
    confirmationsNeeded,
    unresolvedRequired,
    overallConfidence
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    metricId: null,
    baseObject: null,
    fieldsPath: null,
    reportName: null,
    reportId: null,
    preferStandard: true,
    interactive: false,
    persist: true,
    persistPartial: false,
    log: true,
    mappingPath: null,
    definitionsPath: null
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i += 1;
        break;
      case '--metric':
        options.metricId = next;
        i += 1;
        break;
      case '--base-object':
        options.baseObject = next;
        i += 1;
        break;
      case '--fields-json':
        options.fieldsPath = next;
        i += 1;
        break;
      case '--report-name':
        options.reportName = next;
        i += 1;
        break;
      case '--report-id':
        options.reportId = next;
        i += 1;
        break;
      case '--prefer-custom':
        options.preferStandard = false;
        break;
      case '--interactive':
        options.interactive = true;
        break;
      case '--no-persist':
        options.persist = false;
        break;
      case '--persist-partial':
        options.persistPartial = true;
        break;
      case '--no-log':
        options.log = false;
        break;
      case '--mapping':
        options.mappingPath = next;
        i += 1;
        break;
      case '--definitions':
        options.definitionsPath = next;
        i += 1;
        break;
      case '--help':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return options;
}

function printUsage() {
  console.log(`
Metric Field Resolver

Usage:
  node scripts/lib/metric-field-resolver.js --org <alias> --metric <metricId> [options]

Options:
  --base-object <name>     Override base object
  --fields-json <path>     JSON list of fields (optional)
  --prefer-custom          Prefer custom fields (default: standard first)
  --interactive            Prompt for confirmation when ambiguous
  --no-persist             Do not persist mapping to disk
  --persist-partial         Persist even if required roles are missing
  --report-name <name>     Log report name for traceability
  --report-id <id>         Log report id for traceability
  --mapping <path>         Override mapping file path
  --definitions <path>     Override metric definitions path
  --no-log                 Skip log entry
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.metricId) {
    throw new Error('Missing required argument: --metric <metricId>');
  }

  const definitions = loadDefinitions(options.definitionsPath);
  const metric = definitions.metrics[options.metricId];
  if (!metric) {
    throw new Error(`Unknown metricId: ${options.metricId}`);
  }

  const baseObject = options.baseObject || metric.baseObject;
  let fields = [];

  if (options.fieldsPath) {
    const raw = loadJson(options.fieldsPath);
    fields = normalizeFieldList(raw.fields || raw);
  } else if (options.org) {
    fields = loadFieldsFromMetadataCache(options.org, baseObject);
  }

  const mapping = options.org ? loadMapping(options.org, options) : null;

  const result = await resolveMetricFields({
    metricId: options.metricId,
    definitions,
    mapping,
    baseObject,
    fields,
    preferStandard: options.preferStandard,
    interactive: options.interactive
  });

  const requiredMissing = result.unresolvedRequired.length > 0;
  const shouldPersist = options.persist && options.org &&
    (!requiredMissing || options.persistPartial);

  if (shouldPersist && mapping) {
    const resolvedFields = {};
    Object.entries(result.resolved).forEach(([role, data]) => {
      if (data.field) resolvedFields[role] = data.field;
    });

    mapping.metrics[options.metricId] = {
      baseObject: result.baseObject,
      fields: resolvedFields,
      source: result.confirmationsNeeded.length > 0 ? 'inferred' : 'confirmed',
      confidence: Number(result.overallConfidence.toFixed(2)),
      updatedAt: new Date().toISOString()
    };

    const mappingPath = saveMapping(options.org, mapping, options);
    console.log(`✓ Saved mapping: ${mappingPath}`);
  }

  if (options.log && options.org) {
    appendLogEntry(options.org, {
      type: 'mapping-decision',
      metricId: options.metricId,
      reportName: options.reportName || null,
      reportId: options.reportId || null,
      baseObject: result.baseObject,
      fields: Object.fromEntries(Object.entries(result.resolved).map(([role, data]) => [role, data.field])),
      candidates: result.candidatesByRole,
      confidence: Number(result.overallConfidence.toFixed(2)),
      warnings: result.unresolvedRequired.map(role => ({
        code: 'MISSING_REQUIRED_ROLE',
        message: `Missing required role mapping: ${role}`,
        severity: 'warning'
      })),
      source: 'metric-field-resolver'
    });
  }

  console.log(JSON.stringify({
    metricId: result.metricId,
    baseObject: result.baseObject,
    resolved: result.resolved,
    confirmationsNeeded: result.confirmationsNeeded,
    unresolvedRequired: result.unresolvedRequired,
    overallConfidence: Number(result.overallConfidence.toFixed(2))
  }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  resolveMetricFields,
  loadDefinitions,
  loadMapping,
  saveMapping
};

