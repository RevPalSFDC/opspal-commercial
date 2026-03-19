'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ZERO_SHA = '0000000000000000000000000000000000000000';
const DENYLIST_PATTERNS = [
  /^opspal-release\//,
  /^opspal-license-server\//,
  /^opspal-internal-plugins\//,
  /^Agents\//
];

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--base') {
      args.base = argv[index + 1];
      index += 1;
    } else if (arg === '--head') {
      args.head = argv[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    throw error;
  }
}

function usage() {
  console.log('Usage: node scripts/lib/verify-commercial-repo-boundaries.js [--base <ref>] [--head <ref>]');
}

function resolveHeadRef(headRef) {
  return headRef || 'HEAD';
}

function resolveBaseRef(baseRef, headRef) {
  if (baseRef && baseRef !== ZERO_SHA) {
    return baseRef;
  }

  const fallback = runGit(['rev-parse', `${headRef}^`], { allowFailure: true });
  return fallback || headRef;
}

function listTrackedFiles() {
  const output = runGit(['ls-files']);
  return output ? output.split('\n').filter(Boolean) : [];
}

function listChangedFiles(baseRef, headRef) {
  if (baseRef === headRef) {
    return [];
  }

  const output = runGit(['diff', '--name-only', baseRef, headRef, '--']);
  return output ? output.split('\n').filter(Boolean) : [];
}

function collectViolations(files, label) {
  return files
    .filter((filePath) => DENYLIST_PATTERNS.some((pattern) => pattern.test(filePath)))
    .map((filePath) => ({ label, filePath }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return;
  }

  const headRef = resolveHeadRef(args.head);
  const baseRef = resolveBaseRef(args.base, headRef);

  const trackedViolations = collectViolations(listTrackedFiles(), 'tracked');
  const changedViolations = collectViolations(listChangedFiles(baseRef, headRef), 'changed');
  const violations = [...trackedViolations, ...changedViolations];

  if (violations.length === 0) {
    console.log(`Commercial repo boundary checks passed between ${baseRef} and ${headRef}.`);
    return;
  }

  console.error('Commercial repo boundary violations detected:');
  for (const violation of violations) {
    console.error(`  - [${violation.label}] ${violation.filePath}`);
  }
  console.error('');
  console.error('Commercial must not track or introduce nested workspace paths such as opspal-release/, opspal-license-server/, or opspal-internal-plugins/.');
  process.exit(1);
}

main();
