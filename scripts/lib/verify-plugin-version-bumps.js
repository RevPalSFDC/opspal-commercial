#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');

function run(command, options = {}) {
  return execSync(command, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function runSafe(command, options = {}) {
  try {
    return run(command, options);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = {
    base: null,
    head: null,
    verbose: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--base' && argv[i + 1]) {
      args.base = argv[i + 1];
      i += 1;
    } else if (token === '--head' && argv[i + 1]) {
      args.head = argv[i + 1];
      i += 1;
    } else if (token === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

function splitLines(value) {
  if (!value) return [];
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function uniq(items) {
  return [...new Set(items)];
}

function isZeroSha(value) {
  return String(value || '') === '0000000000000000000000000000000000000000';
}

function resolveLocalMode(options) {
  return !process.env.CI && !options.base && !options.head;
}

function resolveRefs(options) {
  const localMode = resolveLocalMode(options);

  if (localMode) {
    return {
      mode: 'local-worktree',
      baseRef: 'HEAD',
      headRef: null
    };
  }

  const headRef = options.head || 'HEAD';

  let baseRef = options.base;
  if (!baseRef) {
    if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_BASE_REF) {
      baseRef = `origin/${process.env.GITHUB_BASE_REF}`;
    } else if (process.env.GITHUB_EVENT_BEFORE && !isZeroSha(process.env.GITHUB_EVENT_BEFORE)) {
      baseRef = process.env.GITHUB_EVENT_BEFORE;
    } else {
      baseRef = 'HEAD~1';
    }
  }

  return {
    mode: 'git-range',
    baseRef,
    headRef
  };
}

function getMergeBase(baseRef, headRef) {
  return runSafe(`git merge-base ${baseRef} ${headRef}`) || baseRef;
}

function getChangedFiles(refs) {
  if (refs.mode === 'local-worktree') {
    const trackedDiff = splitLines(runSafe('git diff --name-only --diff-filter=ACMR HEAD') || '');
    const untracked = splitLines(runSafe('git ls-files --others --exclude-standard') || '');
    return uniq([...trackedDiff, ...untracked]);
  }

  const startRef = getMergeBase(refs.baseRef, refs.headRef);
  const diff = runSafe(`git diff --name-only --diff-filter=ACMR ${startRef}..${refs.headRef}`);
  if (diff === null) {
    throw new Error(
      `Unable to compute git diff for range ${startRef}..${refs.headRef}. ` +
      'Ensure refs are available locally (for CI, use checkout fetch-depth: 0).'
    );
  }

  return splitLines(diff);
}

function parsePluginName(filePath) {
  const match = filePath.match(/^plugins\/(opspal-[^/]+)\//);
  return match ? match[1] : null;
}

function isIgnoredPluginPath(filePath) {
  return (
    /^plugins\/opspal-[^/]+\/instances\//.test(filePath) ||
    /^plugins\/opspal-[^/]+\/portals\/\.token-cache\//.test(filePath)
  );
}

function collectPluginChanges(changedFiles) {
  const byPlugin = new Map();

  for (const filePath of changedFiles) {
    if (isIgnoredPluginPath(filePath)) continue;

    const pluginName = parsePluginName(filePath);
    if (!pluginName) continue;

    if (!byPlugin.has(pluginName)) {
      byPlugin.set(pluginName, {
        pluginName,
        files: [],
        manifestPath: `plugins/${pluginName}/.claude-plugin/plugin.json`
      });
    }

    byPlugin.get(pluginName).files.push(filePath);
  }

  return byPlugin;
}

function readManifestVersionFromGit(ref, manifestPath) {
  const raw = runSafe(`git show ${ref}:${manifestPath}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw).version || null;
  } catch {
    return null;
  }
}

function readManifestVersionFromWorkingTree(manifestPath) {
  const fullPath = path.join(REPO_ROOT, manifestPath);
  if (!fs.existsSync(fullPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8')).version || null;
  } catch {
    return null;
  }
}

function parseSemver(version) {
  if (!version || typeof version !== 'string') return null;
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10)
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function evaluatePlugin(entry, refs) {
  const manifestChanged = entry.files.includes(entry.manifestPath);

  let oldVersion;
  let newVersion;

  if (refs.mode === 'local-worktree') {
    oldVersion = readManifestVersionFromGit(refs.baseRef, entry.manifestPath);
    newVersion = readManifestVersionFromWorkingTree(entry.manifestPath);
  } else {
    const compareBase = getMergeBase(refs.baseRef, refs.headRef);
    oldVersion = readManifestVersionFromGit(compareBase, entry.manifestPath);
    newVersion = readManifestVersionFromGit(refs.headRef, entry.manifestPath);
  }

  const result = {
    pluginName: entry.pluginName,
    fileCount: entry.files.length,
    manifestPath: entry.manifestPath,
    manifestChanged,
    oldVersion,
    newVersion,
    ok: true,
    reason: 'version_bumped'
  };

  if (!manifestChanged) {
    result.ok = false;
    result.reason = 'manifest_not_touched';
    return result;
  }

  if (oldVersion == null && newVersion == null) {
    result.ok = false;
    result.reason = 'manifest_missing';
    return result;
  }

  if (oldVersion == null && newVersion != null) {
    result.ok = true;
    result.reason = 'new_plugin_manifest';
    return result;
  }

  if (oldVersion != null && newVersion == null) {
    result.ok = true;
    result.reason = 'plugin_removed';
    return result;
  }

  if (oldVersion === newVersion) {
    result.ok = false;
    result.reason = 'version_unchanged';
    return result;
  }

  const oldSemver = parseSemver(oldVersion);
  const newSemver = parseSemver(newVersion);
  if (oldSemver && newSemver && compareSemver(newSemver, oldSemver) <= 0) {
    result.ok = false;
    result.reason = 'version_not_incremented';
    return result;
  }

  return result;
}

function formatReason(reason) {
  switch (reason) {
    case 'manifest_not_touched':
      return 'plugin files changed but manifest was not updated';
    case 'manifest_missing':
      return 'plugin manifest missing or unreadable';
    case 'version_unchanged':
      return 'manifest updated but version stayed the same';
    case 'version_not_incremented':
      return 'manifest version must be higher than previous version';
    case 'new_plugin_manifest':
      return 'new plugin manifest with version';
    case 'plugin_removed':
      return 'plugin removed';
    default:
      return reason;
  }
}

function printReport(refs, results, errors) {
  console.log('Plugin Version Bump Check');
  console.log('=========================');

  if (refs.mode === 'local-worktree') {
    console.log('Mode: local worktree diff against HEAD');
  } else {
    const compareBase = getMergeBase(refs.baseRef, refs.headRef);
    console.log(`Mode: git range (${compareBase}..${refs.headRef})`);
    console.log(`Input refs: base=${refs.baseRef} head=${refs.headRef}`);
  }

  console.log(`Plugins with source changes: ${results.length}`);

  if (results.length > 0) {
    console.log('');
    for (const result of results) {
      const status = result.ok ? 'PASS' : 'FAIL';
      const versionText = `${result.oldVersion || '-'} -> ${result.newVersion || '-'}`;
      console.log(`- [${status}] ${result.pluginName}: ${versionText} (${formatReason(result.reason)})`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length})`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const refs = resolveRefs(options);
  const changedFiles = getChangedFiles(refs);

  const pluginChanges = collectPluginChanges(changedFiles);
  const results = [...pluginChanges.values()]
    .sort((a, b) => a.pluginName.localeCompare(b.pluginName))
    .map((entry) => evaluatePlugin(entry, refs));

  const errors = [];
  for (const result of results) {
    if (!result.ok) {
      errors.push(
        `${result.pluginName}: ${formatReason(result.reason)} (old=${result.oldVersion || '-'}, new=${result.newVersion || '-'})`
      );
    }
  }

  printReport(refs, results, errors);

  if (errors.length > 0) {
    process.exit(1);
  }

  console.log('\nPlugin version bump gate passed.');
}

main();
