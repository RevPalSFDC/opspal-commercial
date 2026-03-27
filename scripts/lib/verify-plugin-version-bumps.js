'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ZERO_SHA = '0000000000000000000000000000000000000000';
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

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
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return '';
    }
    throw error;
  }
}

function usage() {
  console.log('Usage: node scripts/lib/verify-plugin-version-bumps.js [--base <ref>] [--head <ref>]');
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

function getChangedFiles(baseRef, headRef) {
  if (baseRef === headRef) {
    return [];
  }

  const output = runGit(['diff', '--name-only', '--diff-filter=ACMR', baseRef, headRef, '--']);
  return output ? output.split('\n').filter(Boolean) : [];
}

function getChangedPlugins(changedFiles) {
  return [...new Set(
    changedFiles
      .map((filePath) => {
        const match = /^plugins\/([^/]+)\//.exec(filePath);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  )].sort();
}

function isVersionedPlugin(pluginName, headRef) {
  return Boolean(readJsonAtRef(headRef, manifestPathFor(pluginName)));
}

function readJsonAtRef(ref, filePath) {
  const content = runGit(['show', `${ref}:${filePath}`], { allowFailure: true });

  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON at ${ref}:${filePath} (${error.message})`);
  }
}

function parseSemver(version) {
  const match = SEMVER_PATTERN.exec(version || '');

  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (leftNumeric) {
    return -1;
  }

  if (rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
}

function compareSemver(leftVersion, rightVersion) {
  const left = parseSemver(leftVersion);
  const right = parseSemver(rightVersion);

  if (!left || !right) {
    throw new Error(`Cannot compare non-semver versions: "${leftVersion}" vs "${rightVersion}"`);
  }

  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) {
      return left[field] - right[field];
    }
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }

  if (left.prerelease.length === 0) {
    return 1;
  }

  if (right.prerelease.length === 0) {
    return -1;
  }

  const longest = Math.max(left.prerelease.length, right.prerelease.length);

  for (let index = 0; index < longest; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];

    if (leftIdentifier === undefined) {
      return -1;
    }

    if (rightIdentifier === undefined) {
      return 1;
    }

    const comparison = compareIdentifiers(leftIdentifier, rightIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function manifestPathFor(pluginName) {
  return path.posix.join('plugins', pluginName, '.claude-plugin', 'plugin.json');
}

function validateChangedPlugin(pluginName, baseRef, headRef, changedFiles) {
  const manifestPath = manifestPathFor(pluginName);
  const baseManifest = readJsonAtRef(baseRef, manifestPath);
  const headManifest = readJsonAtRef(headRef, manifestPath);
  const pluginChanges = changedFiles
    .filter((filePath) => filePath.startsWith(`plugins/${pluginName}/`))
    .sort();

  if (!headManifest) {
    return {
      pluginName,
      skipped: true,
      reason: 'plugin removed or manifest missing in head',
      pluginChanges
    };
  }

  if (!headManifest.version || !parseSemver(headManifest.version)) {
    return {
      pluginName,
      error: `Head manifest version must be semver-like: ${manifestPath}`,
      pluginChanges
    };
  }

  if (!baseManifest) {
    return {
      pluginName,
      created: true,
      newVersion: headManifest.version,
      pluginChanges
    };
  }

  if (!baseManifest.version || !parseSemver(baseManifest.version)) {
    return {
      pluginName,
      error: `Base manifest version must be semver-like: ${manifestPath}`,
      pluginChanges
    };
  }

  if (headManifest.version === baseManifest.version) {
    return {
      pluginName,
      error: `Plugin changed but version did not move (${headManifest.version})`,
      previousVersion: baseManifest.version,
      newVersion: headManifest.version,
      pluginChanges
    };
  }

  if (compareSemver(headManifest.version, baseManifest.version) <= 0) {
    return {
      pluginName,
      error: `Plugin version must increase (${baseManifest.version} -> ${headManifest.version})`,
      previousVersion: baseManifest.version,
      newVersion: headManifest.version,
      pluginChanges
    };
  }

  return {
    pluginName,
    previousVersion: baseManifest.version,
    newVersion: headManifest.version,
    pluginChanges
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return;
  }

  const headRef = resolveHeadRef(args.head);
  const baseRef = resolveBaseRef(args.base, headRef);
  const changedFiles = getChangedFiles(baseRef, headRef);
  const changedPlugins = getChangedPlugins(changedFiles)
    .filter((pluginName) => isVersionedPlugin(pluginName, headRef));

  if (changedPlugins.length === 0) {
    console.log(`No plugin directory changes detected between ${baseRef} and ${headRef}.`);
    return;
  }

  const results = changedPlugins.map((pluginName) => (
    validateChangedPlugin(pluginName, baseRef, headRef, changedFiles)
  ));

  const failures = results.filter((result) => result.error);

  console.log(`Checked ${results.length} changed plugin(s) between ${baseRef} and ${headRef}.`);

  for (const result of results) {
    if (result.error) {
      console.error(`FAIL ${result.pluginName}: ${result.error}`);
      for (const filePath of result.pluginChanges) {
        console.error(`  - ${filePath}`);
      }
      continue;
    }

    if (result.created) {
      console.log(`OK   ${result.pluginName}: new plugin introduced at ${result.newVersion}`);
      continue;
    }

    if (result.skipped) {
      console.log(`SKIP ${result.pluginName}: ${result.reason}`);
      continue;
    }

    console.log(`OK   ${result.pluginName}: ${result.previousVersion} -> ${result.newVersion}`);
  }

  if (failures.length > 0) {
    console.error('');
    console.error('Every tracked plugin change under plugins/<plugin>/ must include a manifest version bump.');
    process.exit(1);
  }

  console.log('Plugin version bump checks passed.');
}

main();
