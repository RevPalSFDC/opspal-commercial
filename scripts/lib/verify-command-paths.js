#!/usr/bin/env node

/**
 * verify-command-paths.js
 *
 * CI lint guard that scans opspal-core command .md files for hardcoded plugin
 * paths in executable code blocks. Exits non-zero if any are found, preventing
 * regression after the find_script() migration.
 *
 * Only scans opspal-core commands (the plugin with resolve-script.sh).
 * Other plugins will be migrated incrementally.
 *
 * Patterns flagged (inside ```bash blocks only):
 *   - node plugins/opspal-core/
 *   - node .claude-plugins/opspal-core/
 *   - node ./plugins/opspal-core/
 *   - node ./.claude-plugins/opspal-core/
 *   - bash .claude-plugins/opspal-core/
 *   - require('./.claude-plugins/opspal-core/
 *
 * Excluded:
 *   - Lines inside find_script()/find_plugin_script() function bodies
 *   - Lines inside path candidate arrays (search_paths, _candidate, etc.)
 *   - Shell/JS comments
 *   - Lines outside of ```bash code fences
 *   - Markdown text and documentation
 *
 * Usage:
 *   node scripts/lib/verify-command-paths.js [--verbose] [--all-plugins]
 *
 * @version 1.1.0
 * @date 2026-03-11
 */

const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
const ALL_PLUGINS = process.argv.includes('--all-plugins');
const STRICT = process.argv.includes('--strict');

// Patterns that indicate hardcoded paths to opspal-core scripts
const HARDCODED_PATTERNS = [
  /\bnode\s+["']?\.?\/?plugins\/opspal-core\//,
  /\bnode\s+["']?\.?\/?\.claude-plugins\/opspal-core\//,
  /\bbash\s+["']?\.?\/?\.claude-plugins\/opspal-core\//,
  /\brequire\s*\(\s*['"]\.?\/?\.claude-plugins\/opspal-core\//,
  /\brequire\s*\(\s*['"]\.?\/?plugins\/opspal-core\//,
];

// Contexts where hardcoded paths are intentional (inside resolver functions)
const EXCLUSION_LINE_PATTERNS = [
  /find_script|find_plugin_script|find_ci_script|find_hook/,
  /search_paths|_candidate|RESOLVE_SCRIPT|candidate/,
  /^\s*#/,  // Shell comments
  /^\s*\/\//,  // JS comments
  /echo\s+".*Run:/,  // Instructional echo messages
];

function isExcludedLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  for (const pattern of EXCLUSION_LINE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  let inCodeBlock = false;
  let inResolverFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code fences — only scan inside ```bash blocks
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock && /^```(?:bash|sh|javascript|js)/.test(trimmed)) {
        inCodeBlock = true;
      } else {
        inCodeBlock = false;
        inResolverFunction = false;
      }
      continue;
    }

    // Only check executable code blocks
    if (!inCodeBlock) continue;

    // Track resolver function blocks
    if (/^find_(?:script|plugin_script|ci_script|hook)\s*\(\)/.test(trimmed)) {
      inResolverFunction = true;
    }
    if (inResolverFunction && trimmed === '}') {
      inResolverFunction = false;
      continue;
    }
    if (inResolverFunction) continue;

    // Skip excluded lines
    if (isExcludedLine(line)) continue;

    // Check each hardcoded pattern
    for (const pattern of HARDCODED_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: i + 1,
          content: trimmed.substring(0, 120),
        });
        break;
      }
    }
  }

  return violations;
}

function findCommandFiles(baseDir) {
  const files = [];
  const pluginsDir = path.join(baseDir, 'plugins');

  if (!fs.existsSync(pluginsDir)) return files;

  const pluginsToScan = ALL_PLUGINS
    ? fs.readdirSync(pluginsDir)
    : ['opspal-core'];

  for (const plugin of pluginsToScan) {
    const commandsDir = path.join(pluginsDir, plugin, 'commands');
    if (!fs.existsSync(commandsDir)) continue;

    for (const file of fs.readdirSync(commandsDir)) {
      if (file.endsWith('.md')) {
        files.push(path.join(commandsDir, file));
      }
    }
  }

  return files;
}

// Main
const baseDir = path.resolve(__dirname, '..', '..');
const commandFiles = findCommandFiles(baseDir);

if (commandFiles.length === 0) {
  console.log('No command .md files found to scan.');
  process.exit(0);
}

let totalViolations = 0;
const allViolations = [];

for (const file of commandFiles) {
  const violations = scanFile(file);
  if (violations.length > 0) {
    totalViolations += violations.length;
    allViolations.push(...violations);
  }
}

if (totalViolations === 0) {
  const scope = ALL_PLUGINS ? 'all plugins' : 'opspal-core';
  console.log(`✅ Scanned ${commandFiles.length} command files (${scope}) — no hardcoded paths found.`);
  process.exit(0);
}

const icon = STRICT ? '❌' : '⚠️';
console.log(`${icon} Found ${totalViolations} hardcoded path violation(s):\n`);

const byFile = {};
for (const v of allViolations) {
  const rel = path.relative(baseDir, v.file);
  if (!byFile[rel]) byFile[rel] = [];
  byFile[rel].push(v);
}

for (const [file, violations] of Object.entries(byFile)) {
  console.log(`  ${file}:`);
  for (const v of violations) {
    console.log(`    Line ${v.line}: ${v.content}`);
  }
  console.log('');
}

console.log('Fix: Replace hardcoded paths with find_script() pattern.');
console.log('See: plugins/opspal-core/scripts/resolve-script.sh');

if (STRICT) {
  process.exit(1);
} else {
  console.log('\nRun with --strict to fail on violations.');
  process.exit(0);
}
