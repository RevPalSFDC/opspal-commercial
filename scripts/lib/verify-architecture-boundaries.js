#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, discoverRuntimePluginPaths } = require('./plugin-doc-inventory');

const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'architecture-boundaries-baseline.json');
const SCRIPT_EXTENSIONS = new Set(['.sh', '.js', '.cjs', '.mjs', '.py', '.ts', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', '.temp', 'dist', 'build', 'coverage', '__tests__']);

const RULES = {
  CLAUDE_PLUGIN_ROOT_TRAVERSAL: 'claude-plugin-root-traversal',
  CROSS_PLUGIN_PATH_REFERENCE: 'cross-plugin-path-reference'
};

const PLUGIN_PATTERNS = [
  /\.claude-plugins[\\/](opspal-[a-z0-9-]+)/gi,
  /plugins[\\/](opspal-[a-z0-9-]+)/gi,
  /(?:\.\.[\\/])+(opspal-[a-z0-9-]+)/gi,
  /\$\{CLAUDE_PLUGIN_ROOT\}[\\/]\.\.[\\/](opspal-[a-z0-9-]+)/gi
];

const CLAUDE_PLUGIN_ROOT_ESCAPE = /\$\{CLAUDE_PLUGIN_ROOT\}[\\/]\.\.[\\/]/;

function parseArgs(argv) {
  return {
    updateBaseline: argv.includes('--update-baseline')
  };
}

function toPosixRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function signatureFor(violation) {
  return `${violation.rule}|${violation.file}|${violation.line}|${violation.snippet}`;
}

function addViolation(list, rule, file, line, message, snippet) {
  list.push({
    rule,
    file,
    line,
    message,
    snippet: snippet.replace(/\s+/g, ' ').trim()
  });
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCRIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    out.push(fullPath);
  }
  return out;
}

function collectPluginFiles(pluginDir) {
  const files = [];
  const claudePluginDir = path.join(pluginDir, '.claude-plugin');
  const hooksDir = path.join(pluginDir, 'hooks');
  const scriptsDir = path.join(pluginDir, 'scripts');

  for (const dir of [claudePluginDir, hooksDir, scriptsDir]) {
    if (!fs.existsSync(dir)) continue;
    files.push(...walk(dir));
  }

  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function extractReferencedPlugins(line) {
  const matches = [];

  for (const pattern of PLUGIN_PATTERNS) {
    pattern.lastIndex = 0;
    let match = null;
    while ((match = pattern.exec(line)) !== null) {
      matches.push(match[1]);
    }
  }

  return matches;
}

function detectViolationsInFile(pluginName, filePath) {
  const relPath = toPosixRelative(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (CLAUDE_PLUGIN_ROOT_ESCAPE.test(line)) {
      addViolation(
        violations,
        RULES.CLAUDE_PLUGIN_ROOT_TRAVERSAL,
        relPath,
        i + 1,
        'Detected `${CLAUDE_PLUGIN_ROOT}/../...` path traversal.',
        line
      );
    }

    const referencedPlugins = extractReferencedPlugins(line);
    for (const referenced of referencedPlugins) {
      if (referenced === pluginName) continue;
      addViolation(
        violations,
        RULES.CROSS_PLUGIN_PATH_REFERENCE,
        relPath,
        i + 1,
        `Cross-plugin path reference to ${referenced} found in ${pluginName}.`,
        line
      );
    }
  }

  return violations;
}

function collectViolations() {
  const pluginDirs = discoverRuntimePluginPaths();
  const violations = [];

  for (const pluginDir of pluginDirs) {
    const pluginName = path.basename(pluginDir);
    const files = collectPluginFiles(pluginDir);

    for (const filePath of files) {
      violations.push(...detectViolationsInFile(pluginName, filePath));
    }
  }

  return violations.sort((a, b) => {
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    if (a.line !== b.line) return a.line - b.line;
    return a.rule.localeCompare(b.rule);
  });
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { entries: [], signatures: new Set() };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const entries = Array.isArray(parsed.violations) ? parsed.violations : [];
    const signatures = new Set(entries.map((entry) => entry.signature).filter(Boolean));
    return { entries, signatures };
  } catch (error) {
    throw new Error(`Failed to parse baseline at ${toPosixRelative(BASELINE_PATH)}: ${error.message}`);
  }
}

function saveBaseline(violations) {
  const payload = {
    generatedAt: new Date().toISOString(),
    ruleSetVersion: '1.0.0',
    violations: violations.map((violation) => ({
      signature: signatureFor(violation),
      rule: violation.rule,
      file: violation.file,
      line: violation.line,
      message: violation.message,
      snippet: violation.snippet
    }))
  };

  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printViolations(title, violations) {
  if (violations.length === 0) return;

  console.log(`\n${title} (${violations.length})`);
  for (const violation of violations.slice(0, 50)) {
    console.log(`- [${violation.rule}] ${violation.file}:${violation.line}`);
    console.log(`  ${violation.message}`);
  }
  if (violations.length > 50) {
    console.log(`- ... ${violations.length - 50} more`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const violations = collectViolations();

  if (options.updateBaseline) {
    saveBaseline(violations);
    console.log('Architecture Boundary Check');
    console.log('===========================');
    console.log(`Baseline updated: ${toPosixRelative(BASELINE_PATH)}`);
    console.log(`Violations recorded: ${violations.length}`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const current = new Map(violations.map((violation) => [signatureFor(violation), violation]));

  const newViolations = [];
  for (const [signature, violation] of current.entries()) {
    if (!baseline.signatures.has(signature)) {
      newViolations.push(violation);
    }
  }

  const resolvedViolations = [];
  for (const old of baseline.entries) {
    if (!current.has(old.signature)) {
      resolvedViolations.push(old);
    }
  }

  console.log('Architecture Boundary Check');
  console.log('===========================');
  console.log(`Current violations: ${violations.length}`);
  console.log(`Baseline violations: ${baseline.entries.length}`);
  console.log(`New violations: ${newViolations.length}`);
  console.log(`Resolved since baseline: ${resolvedViolations.length}`);

  printViolations('New violations', newViolations);

  if (newViolations.length > 0) {
    console.error('\nArchitecture boundary gate failed due to net-new violations.');
    console.error('If intentional, update baseline with:');
    console.error('  node scripts/lib/verify-architecture-boundaries.js --update-baseline');
    process.exit(1);
  }

  console.log('\nArchitecture boundary gate passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    process.exit(2);
  }
}
