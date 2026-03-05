#!/usr/bin/env node

/**
 * KPI Definition Drift Check
 *
 * Validates that KPI identifiers referenced in templates exist in the
 * RevOps KPI knowledge base. Prevents silent drift between templates
 * and the authoritative KPI definition registry.
 */

const fs = require('fs');
const path = require('path');

const DEFINITIONS_PATH = path.join(__dirname, '..', '..', 'config', 'revops-kpi-definitions.json');
const DEFAULT_TEMPLATES_ROOT = path.resolve(__dirname, '../../..', 'opspal-salesforce', 'templates');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    templatesRoot: DEFAULT_TEMPLATES_ROOT
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--templates-root') {
      options.templatesRoot = next;
      i += 1;
    } else if (arg === '--help') {
      options.help = true;
    }
  }

  return options;
}

function loadDefinitions() {
  const raw = fs.readFileSync(DEFINITIONS_PATH, 'utf8');
  return JSON.parse(raw);
}

function collectKnownIds(definitions) {
  const ids = new Set();

  for (const category of Object.values(definitions.categories || {})) {
    for (const [kpiKey, kpi] of Object.entries(category.kpis || {})) {
      ids.add(kpiKey.toLowerCase());
      if (kpi.id) ids.add(String(kpi.id).toLowerCase());
      if (kpi.abbreviation) ids.add(String(kpi.abbreviation).toLowerCase());
      if (Array.isArray(kpi.aliases)) {
        kpi.aliases.forEach(alias => ids.add(String(alias).toLowerCase()));
      }
    }
  }

  return ids;
}

function collectJsonFiles(rootDir) {
  const files = [];
  if (!fs.existsSync(rootDir)) {
    return files;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  entries.forEach(entry => {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
      return;
    }
    if (entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  });
  return files;
}

function findTemplateKpis(templateJson) {
  if (!templateJson || typeof templateJson !== 'object') return null;
  const kpis = templateJson.kpiDefinitions;
  if (!kpis || typeof kpis !== 'object') return null;
  return Object.keys(kpis);
}

function main() {
  const options = parseArgs();
  if (options.help) {
    console.log('Usage: node kpi-definition-drift-check.js [--templates-root <path>]');
    process.exit(0);
  }

  const definitions = loadDefinitions();
  const knownIds = collectKnownIds(definitions);
  const templateFiles = collectJsonFiles(options.templatesRoot);

  const drift = [];
  templateFiles.forEach(filePath => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      return;
    }
    const kpis = findTemplateKpis(data);
    if (!kpis) return;

    const unknown = kpis.filter(id => !knownIds.has(id.toLowerCase()));
    if (unknown.length > 0) {
      drift.push({
        file: filePath,
        unknown
      });
    }
  });

  if (drift.length > 0) {
    console.error('❌ KPI definition drift detected:');
    drift.forEach(item => {
      console.error(`- ${item.file}`);
      console.error(`  Unknown KPI IDs: ${item.unknown.join(', ')}`);
    });
    process.exit(1);
  }

  console.log(`✅ KPI definition drift check passed (${templateFiles.length} template files scanned).`);
}

if (require.main === module) {
  main();
}
