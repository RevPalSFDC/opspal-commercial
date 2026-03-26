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
const {
  compareAgentMetadataSources,
  normalizeStringArray
} = require(path.join(
  __dirname,
  '..',
  'plugins',
  'opspal-core',
  'scripts',
  'lib',
  'agent-tool-registry.js'
));
const {
  validateRoutingIntegrity
} = require(path.join(
  __dirname,
  '..',
  'plugins',
  'opspal-core',
  'scripts',
  'lib',
  'validate-routing-integrity.js'
));

const repoRoot = path.join(__dirname, '..');
const corePluginRoot = path.join(repoRoot, 'plugins', 'opspal-core');
const defaultConfigPath = path.join(__dirname, 'config', 'runtime-incident-fixtures.json');
let cachedRoutingIntegrityReport = null;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const parsed = {
    _: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      parsed._.push(token);
      continue;
    }

    const [key, inlineValue] = token.slice(2).split('=');
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
      continue;
    }

    parsed[key] = '1';
  }

  return parsed;
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => String(left).localeCompare(String(right)));
}

function formatDetailValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function writeReportFile(reportFile, report) {
  if (!reportFile) {
    return;
  }

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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

function getRoutingIntegrityReport(options = {}) {
  if (options.repoRoutingReport) {
    return options.repoRoutingReport;
  }

  if (!cachedRoutingIntegrityReport) {
    cachedRoutingIntegrityReport = validateRoutingIntegrity();
  }

  return cachedRoutingIntegrityReport;
}

function hasRepoRoutingFailure(report, codes, agent) {
  return (report?.failures || []).some((failure) => {
    if (!codes.includes(failure.code)) {
      return false;
    }

    if (!agent) {
      return true;
    }

    return failure.agent === agent || String(failure.message || '').includes(agent);
  });
}

function classifyProjectionMismatch(analysis, options = {}) {
  const incident = analysis.projectionMismatches[analysis.projectionMismatches.length - 1] ||
    analysis.primaryFailure?.details || {};
  const agent = incident.agent || analysis.routedAgents[analysis.routedAgents.length - 1]?.agent || null;
  const routingIntegrityReport = getRoutingIntegrityReport(options);
  const metadataComparison = agent
    ? compareAgentMetadataSources(agent, corePluginRoot)
    : null;
  const markdownTools = uniqueSorted(normalizeStringArray(metadataComparison?.markdown?.tools || []));
  const routingIndexTools = uniqueSorted(normalizeStringArray(metadataComparison?.routingIndex?.tools || []));
  const expectedTools = uniqueSorted(normalizeStringArray(metadataComparison?.active?.tools || incident.expectedToolsFromLog || []));
  const actualTools = uniqueSorted(normalizeStringArray(incident.actualTools || []));
  const requiredToolsFromLog = uniqueSorted(normalizeStringArray(incident.requiredToolsFromLog || []));
  const requiredTools = requiredToolsFromLog.length > 0
    ? requiredToolsFromLog
    : uniqueSorted([
      ...normalizeStringArray(incident.missingTools || []),
      ...(expectedTools.includes('Bash') ? ['Bash'] : [])
    ]);
  const missingTools = uniqueSorted([
    ...requiredTools.filter((tool) => !actualTools.includes(tool)),
    ...normalizeStringArray(incident.missingTools || [])
  ]);
  const repoSideIndicators = [];

  if (metadataComparison?.mismatches?.some((mismatch) => mismatch.field === 'tools')) {
    repoSideIndicators.push('markdown_index_tool_drift');
  }
  if (requiredTools.includes('Bash') && !markdownTools.includes('Bash')) {
    repoSideIndicators.push('markdown_missing_bash');
  }
  if (requiredTools.includes('Bash') && !routingIndexTools.includes('Bash')) {
    repoSideIndicators.push('routing_index_missing_bash');
  }
  if (hasRepoRoutingFailure(routingIntegrityReport, [
    'routing_metadata_drift',
    'salesforce_agent_missing_declared_bash',
    'salesforce_agent_missing_indexed_bash',
    'salesforce_agent_missing_active_bash',
    'routing_index_stale_agent_metadata'
  ], agent)) {
    repoSideIndicators.push('routing_integrity_validator_failed');
  }

  const incidentClass = repoSideIndicators.length > 0
    ? 'repo_metadata_index_drift'
    : 'external_runtime_projection_loss';
  const sourceOfTruth = repoSideIndicators.length > 0
    ? 'repo-metadata/index'
    : 'host-runtime';
  const summary = repoSideIndicators.length > 0
    ? `Repo metadata/index drift for ${agent || 'unknown agent'}: required tools ${requiredTools.join(', ') || 'unknown'}, markdown=${markdownTools.join(', ') || 'none'}, routing-index=${routingIndexTools.join(', ') || 'none'}.`
    : `Host runtime projection drift for ${agent || 'unknown agent'}: repo expects ${requiredTools.join(', ') || expectedTools.join(', ') || 'unknown'}, runtime exposed ${actualTools.join(', ') || 'no executable tools'} and dropped ${missingTools.join(', ') || 'no required tools'}.`;

  return {
    incidentClass,
    sourceOfTruth,
    summary,
    diagnostics: {
      agent,
      expectedTools,
      requiredTools,
      actualTools,
      missingTools,
      markdownTools,
      routingIndexTools,
      repoSideIndicators,
      routingIntegrityPass: Boolean(routingIntegrityReport?.pass)
    }
  };
}

function classifyRouteProfileMismatch(analysis) {
  const mismatch = analysis.routeProfileMismatches[0] || analysis.primaryFailure?.details || {};
  const selectedAgent = mismatch.selectedAgent || mismatch.suggestedAgent || null;
  const requiredAgent = mismatch.requiredAgent || null;
  const requiredTools = uniqueSorted(normalizeStringArray(mismatch.requiredTools || []));
  const actualTools = uniqueSorted(normalizeStringArray(mismatch.actualTools || []));

  return {
    incidentClass: 'spawn_time_route_profile_mismatch',
    sourceOfTruth: 'routing-enforcement',
    summary: `Spawn-time route/profile mismatch: selected ${selectedAgent || 'unknown agent'} did not satisfy the active route for ${requiredAgent || 'the required specialist'}. Required tools: ${requiredTools.join(', ') || 'none'}. Actual tools: ${actualTools.join(', ') || 'unknown'}.`,
    diagnostics: {
      code: mismatch.code || null,
      requiredAgent,
      selectedAgent,
      suggestedAgent: mismatch.suggestedAgent || null,
      approvedAgents: uniqueSorted(normalizeStringArray(mismatch.approvedAgents || [])),
      requiredTools,
      actualTools,
      requiredCapabilities: uniqueSorted(normalizeStringArray(mismatch.requiredCapabilities || [])),
      allowedActorTypes: uniqueSorted(normalizeStringArray(mismatch.allowedActorTypes || [])),
      routeKind: mismatch.routeKind || null,
      currentAction: mismatch.currentAction || null
    }
  };
}

function classifyRuntimeIncident(analysis, options = {}) {
  if (analysis.primaryFailure?.kind === 'subagent_tool_projection_mismatch') {
    return classifyProjectionMismatch(analysis, options);
  }

  if (
    analysis.primaryFailure?.kind === 'spawn_time_route_profile_mismatch' ||
    analysis.routeProfileMismatches.length > 0
  ) {
    return classifyRouteProfileMismatch(analysis);
  }

  if (analysis.primaryFailure?.kind === 'flow_validation_scope_mismatch') {
    return {
      incidentClass: 'flow_validation_scope_mismatch',
      sourceOfTruth: 'hook-runtime',
      summary: 'Deployment flow validation scope drift: the runtime validated unrelated flows after the deployment manager handoff.',
      diagnostics: {}
    };
  }

  if (analysis.primaryFailure?.kind === 'misrouted_instance_deployer_read') {
    return {
      incidentClass: 'read_path_failure',
      sourceOfTruth: 'hook-runtime',
      summary: 'Runtime attempted an invalid Read path during deploy routing.',
      diagnostics: {}
    };
  }

  if (analysis.readFailures.missingFiles.length > 0 || analysis.readFailures.directories.length > 0) {
    return {
      incidentClass: 'read_path_failure',
      sourceOfTruth: 'hook-runtime',
      summary: 'Runtime replay captured missing-file or directory Read failures.',
      diagnostics: {
        missingFileReads: analysis.readFailures.missingFiles.length,
        directoryReads: analysis.readFailures.directories.length
      }
    };
  }

  return {
    incidentClass: 'runtime_replay_budget_regression',
    sourceOfTruth: 'hook-runtime',
    summary: 'Runtime replay exceeded observability or hook-behavior budgets.',
    diagnostics: {}
  };
}

function evaluateFixture(fixture, configPath = defaultConfigPath, options = {}) {
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
  const classification = classifyRuntimeIncident(analysis, options);
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

  if (fixture.incidentClass !== undefined && classification.incidentClass !== fixture.incidentClass) {
    failures.push(
      `[${label}] Expected incident class "${fixture.incidentClass}", observed "${classification.incidentClass}"`
    );
  }

  if (fixture.sourceOfTruth !== undefined && classification.sourceOfTruth !== fixture.sourceOfTruth) {
    failures.push(
      `[${label}] Expected source-of-truth "${fixture.sourceOfTruth}", observed "${classification.sourceOfTruth}"`
    );
  }

  enforceMinimumFailures(failures, fixture, analysis, label);

  return {
    ok: failures.length === 0,
    label,
    fixturePath,
    limits,
    analysis,
    classification,
    replayFailures,
    failures
  };
}

function validateIncidentFixtures(configPath = defaultConfigPath, options = {}) {
  const fixtures = getConfiguredFixtures(configPath);
  const routingIntegrityReport = getRoutingIntegrityReport(options);
  const results = fixtures.map((fixture) => evaluateFixture(fixture, configPath, {
    ...options,
    repoRoutingReport: routingIntegrityReport
  }));
  const failures = results.flatMap((result) => result.failures);

  return {
    ok: failures.length === 0,
    fixtureCount: results.length,
    routingIntegritySummary: {
      pass: routingIntegrityReport.pass,
      failureCount: routingIntegrityReport.failureCount
    },
    results,
    failures
  };
}

function toSerializableReport(report) {
  return {
    ok: report.ok,
    fixtureCount: report.fixtureCount,
    routingIntegritySummary: report.routingIntegritySummary,
    failures: report.failures,
    fixtures: report.results.map((result) => ({
      label: result.label,
      plainTextHookOutputs: result.analysis.plainTextHookOutputs,
      treeSitterFallbacks: result.analysis.treeSitterFallbacks,
      missingFileReads: result.analysis.readFailures.missingFiles.length,
      directoryReads: result.analysis.readFailures.directories.length,
      maxAgentHookFanout: result.analysis.maxAgentHookFanout,
      primaryFailure: result.analysis.primaryFailure?.kind || null,
      incidentClass: result.classification.incidentClass,
      sourceOfTruth: result.classification.sourceOfTruth,
      summary: result.classification.summary,
      diagnostics: result.classification.diagnostics,
      detectedFailures: result.replayFailures.length
    }))
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args._[0]
    ? path.resolve(args._[0])
    : defaultConfigPath;
  const jsonOutput = args.json === '1' || args.json === true;
  const reportFile = args['report-file']
    ? path.resolve(args['report-file'])
    : '';
  const report = validateIncidentFixtures(configPath);
  const serializableReport = toSerializableReport(report);

  writeReportFile(reportFile, serializableReport);

  if (!report.ok) {
    if (jsonOutput) {
      process.stdout.write(`${JSON.stringify(serializableReport, null, 2)}\n`);
    } else {
      process.stderr.write(`${report.failures.join('\n')}\n`);
      for (const result of report.results.filter((entry) => entry.classification)) {
        process.stderr.write(`[${result.label}] ${result.classification.incidentClass} (${result.classification.sourceOfTruth}): ${result.classification.summary}\n`);
      }
    }
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(serializableReport, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  classifyRuntimeIncident,
  evaluateFixture,
  getConfiguredFixtures,
  validateIncidentFixtures
};
