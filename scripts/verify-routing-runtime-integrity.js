#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const {
  formatRoutingIntegrityFailure,
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
const {
  validateIncidentFixtures
} = require(path.join(__dirname, 'validate-runtime-incident-fixtures.js'));

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

function writeReportFile(reportFile, report) {
  if (!reportFile) {
    return;
  }

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function buildCombinedReport() {
  const routingIntegrity = validateRoutingIntegrity();
  const runtimeIncidentFixtures = validateIncidentFixtures();

  return {
    ok: routingIntegrity.pass && runtimeIncidentFixtures.ok,
    routingIntegrity: {
      pass: routingIntegrity.pass,
      failureCount: routingIntegrity.failureCount,
      failures: routingIntegrity.failures
    },
    runtimeIncidentFixtures: {
      ok: runtimeIncidentFixtures.ok,
      fixtureCount: runtimeIncidentFixtures.fixtureCount,
      routingIntegritySummary: runtimeIncidentFixtures.routingIntegritySummary,
      failures: runtimeIncidentFixtures.failures,
      fixtures: runtimeIncidentFixtures.results.map((result) => ({
        label: result.label,
        primaryFailure: result.analysis.primaryFailure?.kind || null,
        incidentClass: result.classification.incidentClass,
        sourceOfTruth: result.classification.sourceOfTruth,
        summary: result.classification.summary,
        diagnostics: result.classification.diagnostics,
        detectedFailures: result.replayFailures.length
      }))
    }
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const jsonOutput = args.json === '1' || args.json === true;
  const reportFile = args['report-file']
    ? path.resolve(args['report-file'])
    : '';
  const report = buildCombinedReport();

  writeReportFile(reportFile, report);

  if (jsonOutput || report.ok) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stderr.write(`Routing/runtime integrity failed\n`);

    for (const failure of report.routingIntegrity.failures) {
      process.stderr.write(`- ${formatRoutingIntegrityFailure(failure)}\n`);
    }

    for (const failure of report.runtimeIncidentFixtures.failures) {
      process.stderr.write(`- ${failure}\n`);
    }

    for (const fixture of report.runtimeIncidentFixtures.fixtures) {
      process.stderr.write(`- ${fixture.label}: ${fixture.incidentClass} (${fixture.sourceOfTruth}) ${fixture.summary}\n`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCombinedReport
};
