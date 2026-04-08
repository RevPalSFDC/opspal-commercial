#!/usr/bin/env node

/**
 * Shell Safety Gate
 *
 * Detects risky shell patterns and fails CI on new violations.
 *
 * Rules:
 * - curl-timeout-required: `curl` usage must include `--max-time` or `--connect-timeout`
 * - sf-python-pipe: `sf ... | python` style pipelines are disallowed
 *
 * The gate uses a baseline file so existing legacy debt can be tracked without
 * blocking forward progress. CI fails only on net-new violations.
 *
 * Usage:
 *   node scripts/lib/verify-shell-safety.js
 *   node scripts/lib/verify-shell-safety.js --update-baseline
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts', 'shell-safety-baseline.json');

const EXTENSIONS = new Set(['.sh', '.bash']);
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  '.cache',
  'dist',
  'build',
  '.next'
]);

const RULES = {
  CURL_TIMEOUT_REQUIRED: 'curl-timeout-required',
  SF_PYTHON_PIPE: 'sf-python-pipe'
};

function toPosixRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function shouldSkipDir(entryName) {
  return SKIP_DIRS.has(entryName);
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      walk(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (EXTENSIONS.has(ext)) {
      out.push(fullPath);
    }
  }
  return out;
}

function buildLogicalLines(text) {
  const lines = text.split(/\r?\n/);
  const logical = [];
  let buffer = '';
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (buffer === '') {
      startLine = i + 1;
      buffer = line;
    } else {
      buffer += '\n' + line;
    }

    if (/\\\s*$/.test(line)) {
      continue;
    }

    logical.push({ line: startLine, text: buffer });
    buffer = '';
  }

  if (buffer) {
    logical.push({ line: startLine, text: buffer });
  }

  return logical;
}

function normalizeSnippet(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function signatureFor(violation) {
  return `${violation.rule}|${violation.file}|${normalizeSnippet(violation.snippet)}`;
}

function detectViolationsInFile(filePath) {
  const relPath = toPosixRelative(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const logicalLines = buildLogicalLines(content);
  const violations = [];

  for (const block of logicalLines) {
    const raw = block.text;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Rule 1: curl must have timeout flags.
    // Check each command segment to avoid a single safe segment masking unsafe ones.
    const segments = raw.split(/(?:\|\||&&|[|;])/);
    for (const segmentRaw of segments) {
      const segment = segmentRaw.trim();
      if (!segment || segment.startsWith('#')) continue;
      if (!/\bcurl\b/.test(segment)) continue;
      if (/\bsafe_curl(?:_retry)?\b/.test(segment)) continue;

      const hasTimeout = /\s--max-time(?:\s|=)\S+/.test(segment) || /\s--connect-timeout(?:\s|=)\S+/.test(segment);
      if (!hasTimeout) {
        violations.push({
          rule: RULES.CURL_TIMEOUT_REQUIRED,
          file: relPath,
          line: block.line,
          message: 'curl invocation missing --max-time/--connect-timeout',
          snippet: segment
        });
      }
    }

    // Rule 2: sf | python pipes are brittle in some environments.
    if (/\bsf\b[\s\S]*\|[\s\S]*\bpython(?:3)?\b/.test(raw)) {
      violations.push({
        rule: RULES.SF_PYTHON_PIPE,
        file: relPath,
        line: block.line,
        message: 'Disallowed pipeline pattern: sf ... | python',
        snippet: normalizeSnippet(raw)
      });
    }
  }

  return violations;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { signatures: new Set(), entries: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const entries = Array.isArray(parsed.violations) ? parsed.violations : [];
    const signatures = new Set(entries.map((e) => e.signature).filter(Boolean));
    return { signatures, entries };
  } catch (error) {
    throw new Error(`Failed to parse baseline at ${toPosixRelative(BASELINE_PATH)}: ${error.message}`);
  }
}

function saveBaseline(violations) {
  const baseline = {
    generatedAt: new Date().toISOString(),
    ruleSetVersion: '1.0.0',
    violations: violations
      .map((v) => ({
        signature: signatureFor(v),
        rule: v.rule,
        file: v.file,
        line: v.line,
        snippet: normalizeSnippet(v.snippet)
      }))
      .sort((a, b) => a.signature.localeCompare(b.signature))
  };

  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
}

function printViolations(title, violations) {
  if (violations.length === 0) return;
  console.log(`\n${title} (${violations.length}):`);
  for (const v of violations.slice(0, 50)) {
    console.log(`- [${v.rule}] ${v.file}:${v.line}`);
    console.log(`  ${v.message}`);
  }
  if (violations.length > 50) {
    console.log(`... and ${violations.length - 50} more`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes('--update-baseline');

  const shellFiles = walk(ROOT);
  const allViolations = shellFiles.flatMap((file) => detectViolationsInFile(file));

  if (updateBaseline) {
    saveBaseline(allViolations);
    console.log('Shell Safety Check');
    console.log('==================');
    console.log(`Baseline updated: ${toPosixRelative(BASELINE_PATH)}`);
    console.log(`Files scanned: ${shellFiles.length}`);
    console.log(`Violations recorded: ${allViolations.length}`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const currentBySignature = new Map(allViolations.map((v) => [signatureFor(v), v]));

  const newViolations = [];
  for (const [sig, violation] of currentBySignature.entries()) {
    if (!baseline.signatures.has(sig)) {
      newViolations.push(violation);
    }
  }

  const resolvedViolations = [];
  for (const old of baseline.entries) {
    if (!currentBySignature.has(old.signature)) {
      resolvedViolations.push(old);
    }
  }

  console.log('Shell Safety Check');
  console.log('==================');
  console.log(`Files scanned: ${shellFiles.length}`);
  console.log(`Current violations: ${allViolations.length}`);
  console.log(`Baseline violations: ${baseline.entries.length}`);
  console.log(`New violations: ${newViolations.length}`);
  console.log(`Resolved since baseline: ${resolvedViolations.length}`);

  printViolations('New violations', newViolations);

  if (newViolations.length > 0) {
    console.log('\nShell safety gate failed due to new violations.');
    console.log('If intentional, update baseline with:');
    console.log('  node scripts/lib/verify-shell-safety.js --update-baseline');
    process.exit(1);
  }

  console.log('\nShell safety gate passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    process.exit(2);
  }
}
