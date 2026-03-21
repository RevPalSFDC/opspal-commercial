#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  analyzeClaudeDebugLogFile
} = require(path.join(__dirname, 'lib', 'claude-debug-log-analyzer.js'));
const {
  validateAnalysis
} = require(path.join(__dirname, 'validate-claude-runtime-replay.js'));

const repoRoot = path.join(__dirname, '..');
const defaultConfigPath = path.join(__dirname, 'config', 'runtime-incident-fixtures.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getConfiguredFixtures(configPath = defaultConfigPath) {
  const config = readJson(configPath);
  return Array.isArray(config.fixtures) ? config.fixtures : [];
}

function validateFixtureShape(fixture, configPath) {
  if (!fixture || typeof fixture !== 'object') {
    throw new Error(`Invalid fixture entry in ${configPath}`);
  }

  if (typeof fixture.path !== 'string' || fixture.path.trim() === '') {
    throw new Error(`Fixture entry in ${configPath} is missing a non-empty path`);
  }

  if (!fixture.expect || !['pass', 'fail'].includes(fixture.expect)) {
    throw new Error(`Fixture ${fixture.path} must declare expect=pass|fail`);
  }
}

function appendFailures(target, label, failures) {
  failures.forEach((failure) => {
    target.push(`[${label}] ${failure}`);
  });
}

function enforceMinimumFailures(collectedFailures, fixture, analysis, label) {
  const minimumChecks = [
    ['minPlainTextHookOutputs', analysis.plainTextHookOutputs, 'plain-text hook outputs'],
    ['minTreeSitterFallbacks', analysis.treeSitterFallbacks, 'tree-sitter fallbacks'],
    ['minMissingFileReads', analysis.readFailures.missingFiles.length, 'missing-file Read failures'],
    ['minDirectoryReads', analysis.readFailures.directories.length, 'directory Read failures'],
    ['minAgentHookFanout', analysis.maxAgentHookFanout, 'Agent hook fanout']
  ];

  minimumChecks.forEach(([key, actual, description]) => {
    const minimum = fixture[key];
    if (minimum === undefined) {
      return;
    }
    if (actual < minimum) {
      collectedFailures.push(
        `[${label}] Expected at least ${minimum} ${description}, observed ${actual}`
      );
    }
  });
}

function evaluateFixture(fixture, configPath = defaultConfigPath) {
  validateFixtureShape(fixture, configPath);

  const label = fixture.label || fixture.path;
  const fixturePath = path.join(repoRoot, fixture.path);
  if (!fs.existsSync(fixturePath)) {
    return {
      ok: false,
      label,
      failures: [`[${label}] Fixture file not found: ${fixture.path}`]
    };
  }

  const analysis = analyzeClaudeDebugLogFile(fixturePath);
  const { failures: replayFailures, limits } = validateAnalysis(
    analysis,
    fixture.thresholds || {}
  );
  const failures = [];

  if (fixture.expect === 'pass') {
    if (replayFailures.length > 0) {
      appendFailures(failures, label, replayFailures);
    }
  } else if (replayFailures.length === 0) {
    failures.push(`[${label}] Expected replay validation to fail, but it passed`);
  }

  (fixture.failureSubstrings || []).forEach((fragment) => {
    if (!replayFailures.some((failure) => failure.includes(fragment))) {
      failures.push(
        `[${label}] Expected failure containing "${fragment}", observed ${replayFailures.length} failure(s)`
      );
    }
  });

  if (fixture.primaryFailureKind !== undefined) {
    const actualPrimaryFailure = analysis.primaryFailure?.kind || null;
    if (actualPrimaryFailure !== fixture.primaryFailureKind) {
      failures.push(
        `[${label}] Expected primary failure "${fixture.primaryFailureKind}", observed "${actualPrimaryFailure}"`
      );
    }
  }

  enforceMinimumFailures(failures, fixture, analysis, label);

  return {
    ok: failures.length === 0,
    label,
    fixturePath,
    limits,
    analysis,
    replayFailures,
    failures
  };
}

function validateIncidentFixtures(configPath = defaultConfigPath) {
  const fixtures = getConfiguredFixtures(configPath);
  const results = fixtures.map((fixture) => evaluateFixture(fixture, configPath));
  const failures = results.flatMap((result) => result.failures);

  return {
    ok: failures.length === 0,
    fixtureCount: results.length,
    results,
    failures
  };
}

function main() {
  const configPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : defaultConfigPath;
  const report = validateIncidentFixtures(configPath);

  if (!report.ok) {
    process.stderr.write(`${report.failures.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    fixtureCount: report.fixtureCount,
    fixtures: report.results.map((result) => ({
      label: result.label,
      plainTextHookOutputs: result.analysis.plainTextHookOutputs,
      treeSitterFallbacks: result.analysis.treeSitterFallbacks,
      missingFileReads: result.analysis.readFailures.missingFiles.length,
      directoryReads: result.analysis.readFailures.directories.length,
      maxAgentHookFanout: result.analysis.maxAgentHookFanout,
      primaryFailure: result.analysis.primaryFailure?.kind || null,
      detectedFailures: result.replayFailures.length
    }))
  }, null, 2) + '\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateFixture,
  getConfiguredFixtures,
  validateIncidentFixtures
};
