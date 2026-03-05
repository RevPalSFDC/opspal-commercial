#!/usr/bin/env node
/**
 * Validate OpsPal package layout and enforce canonical documentation paths.
 * - Ensures OPSPAL_PACKAGES.json exists and paths are valid.
 * - Flags legacy plugin/path references in domain docs.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const packagesPath = path.join(repoRoot, '.claude-plugins', 'opspal-core-plugin', 'packages', 'OPSPAL_PACKAGES.json');

const ignoreDirs = new Set([
  'node_modules', '.cache', '.temp', '.backup', '.test-results', 'test-output',
  'coverage', 'logs', '.validation-cache', '.token-cache', '.git', '.svn',
  '.claude', 'report-versions', 'reports', 'output-styles', '.task-graph-backups',
  '.recovery-logs', '.audit-logs', '.agent-decisions', '.flow-context', '.flow-snapshots',
  'test', 'tests', '__tests__', '.test-output'
]);

if (!fs.existsSync(packagesPath)) {
  console.error(`❌ Missing OPSPAL_PACKAGES.json at ${packagesPath}`);
  process.exit(1);
}

let packagesConfig;
try {
  packagesConfig = JSON.parse(fs.readFileSync(packagesPath, 'utf8'));
} catch (error) {
  console.error(`❌ Failed to parse OPSPAL_PACKAGES.json: ${error.message}`);
  process.exit(1);
}

const errors = [];

if (packagesConfig.canonical_layout !== 'packages') {
  errors.push('OPSPAL_PACKAGES.json canonical_layout must be "packages"');
}

const corePath = packagesConfig?.core?.path;
if (!corePath) {
  errors.push('OPSPAL_PACKAGES.json missing core.path');
} else {
  const resolved = path.join(repoRoot, corePath);
  if (!fs.existsSync(resolved)) {
    errors.push(`Core path missing: ${corePath}`);
  }
}

const domains = Array.isArray(packagesConfig.domains) ? packagesConfig.domains : [];
if (!domains.length) {
  errors.push('OPSPAL_PACKAGES.json must include at least one domain');
}

const legacyCommandPattern = /\b(?:node|bash)\s+(?:\.\/)?scripts\//g;
const legacyDotScriptsPattern = /\.\/scripts\//g;
const textExtensions = new Set(['.md', '.json', '.yml', '.yaml', '.txt']);
const maxFileBytes = 1024 * 1024;
const coreLegacyPlugins = ['cross-platform-plugin', 'developer-tools-plugin', 'shared-docs'];

function shouldIgnore(filePath) {
  return filePath.split(path.sep).some(part => ignoreDirs.has(part));
}

function collectTextFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) {
    return files;
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (shouldIgnore(entryPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...collectTextFiles(entryPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!textExtensions.has(ext)) {
        continue;
      }
      try {
        const stat = fs.statSync(entryPath);
        if (stat.size > maxFileBytes) {
          continue;
        }
      } catch (error) {
        continue;
      }
      files.push(entryPath);
    }
  }
  return files;
}

function checkMarkdown(filePath, sourcePlugin) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relative = path.relative(repoRoot, filePath);

  const legacyPluginPattern = new RegExp(`\\.claude-plugins/${sourcePlugin}/`, 'g');
  const legacyCorePattern = new RegExp(`\\.claude-plugins/opspal-core-plugin/(agents|scripts|commands|hooks|runbooks)/${sourcePlugin}/`, 'g');

  if (legacyPluginPattern.test(content)) {
    errors.push(`${relative}: legacy plugin path reference for ${sourcePlugin}`);
  }

  if (legacyCorePattern.test(content)) {
    errors.push(`${relative}: legacy opspal-core-plugin layout reference for ${sourcePlugin}`);
  }

  if (legacyCommandPattern.test(content)) {
    errors.push(`${relative}: legacy scripts/ invocation (use packages path)`);
  }

  if (legacyDotScriptsPattern.test(content)) {
    errors.push(`${relative}: legacy ./scripts/ reference (use packages path)`);
  }
}

function checkPackageLegacyRefs(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relative = path.relative(repoRoot, filePath);
  const legacyPluginPattern = new RegExp(`\\.claude-plugins/(?:${coreLegacyPlugins.join('|')})/`, 'g');
  const legacyCoreLayoutPattern = new RegExp(
    `\\.claude-plugins/opspal-core-plugin/(agents|scripts|commands|hooks|runbooks)/(?:${coreLegacyPlugins.join('|')})/`,
    'g'
  );

  if (legacyPluginPattern.test(content)) {
    errors.push(`${relative}: legacy plugin path reference (use opspal-core package path)`);
  }

  if (legacyCoreLayoutPattern.test(content)) {
    errors.push(`${relative}: legacy opspal-core-plugin layout reference (use packages path)`);
  }
}

for (const domain of domains) {
  if (!domain || !domain.name || !domain.path || !domain.source_plugin) {
    errors.push('Each domain entry must include name, path, and source_plugin');
    continue;
  }

  const domainRoot = path.join(repoRoot, domain.path);
  if (!fs.existsSync(domainRoot)) {
    errors.push(`Domain path missing: ${domain.path}`);
  }

  const pluginRoot = path.join(repoRoot, '.claude-plugins', domain.source_plugin);
  if (!fs.existsSync(pluginRoot)) {
    errors.push(`Domain source plugin missing: ${domain.source_plugin}`);
  }

  for (const root of [domainRoot, pluginRoot]) {
    const files = collectTextFiles(root);
    for (const filePath of files) {
      checkMarkdown(filePath, domain.source_plugin);
    }
  }
}

const packagesRoot = path.join(repoRoot, '.claude-plugins', 'opspal-core-plugin', 'packages');
if (fs.existsSync(packagesRoot)) {
  const packageFiles = collectTextFiles(packagesRoot);
  for (const filePath of packageFiles) {
    checkPackageLegacyRefs(filePath);
  }
}

if (errors.length) {
  console.error('❌ OpsPal package validation errors:');
  errors.forEach(item => console.error(`  - ${item}`));
  process.exit(1);
}

console.log('✅ OpsPal package validation passed');
