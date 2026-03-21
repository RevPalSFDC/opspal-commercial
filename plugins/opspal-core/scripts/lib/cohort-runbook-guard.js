#!/usr/bin/env node

/**
 * Cohort Runbook Guard
 *
 * Shared guardrail logic for unresolved reflection cohorts. This module:
 * - detects cohort signals in task prompts or outputs
 * - maps cohorts to required runbook/tooling artifacts
 * - checks artifact availability in the workspace
 * - verifies whether sub-agent output contains runbook evidence
 */

'use strict';

const fs = require('fs');
const path = require('path');

const COHORT_RUNBOOK_REQUIREMENTS = {
  'data-quality': [
    'plugins/opspal-salesforce/docs/runbooks/data-quality-operations/README.md',
    'plugins/opspal-hubspot/docs/runbooks/data-quality/README.md',
    'plugins/opspal-marketo/docs/runbooks/lead-management/lead-quality-maintenance.md'
  ],
  'config/env': [
    'plugins/opspal-salesforce/docs/runbooks/environment-configuration/README.md'
  ],
  'auth/permissions': [
    'plugins/opspal-salesforce/contexts/metadata-manager/fls-field-deployment.md',
    'plugins/opspal-salesforce/docs/PERMISSION_SET_USER_GUIDE.md'
  ],
  'prompt-mismatch': [
    'plugins/opspal-salesforce/docs/runbooks/automation-feasibility/README.md',
    'plugins/opspal-salesforce/docs/AUTO_AGENT_ROUTING.md',
    'docs/routing-help.md'
  ],
  'schema/parse': [
    'plugins/opspal-salesforce/docs/runbooks/territory-management/03-territory2-object-relationships.md',
    'plugins/opspal-salesforce/docs/runbooks/territory-management/10-troubleshooting-guide.md'
  ],
  'tool-contract': [
    'plugins/opspal-salesforce/docs/CLI_COMMAND_VALIDATOR_USAGE.md',
    'plugins/opspal-core/scripts/lib/tool-contract-validator.js',
    'plugins/opspal-core/scripts/lib/api-capability-checker.js'
  ]
};

const COHORT_PATTERNS = {
  'data-quality': [
    /\bdata quality\b/i,
    /\bdedup(lication)?\b/i,
    /\bduplicate(s)?\b/i,
    /\bhygiene\b/i,
    /\benrich(ment)?\b/i,
    /\bnull\b/i,
    /\bmissing field(s)?\b/i
  ],
  'config/env': [
    /\bconfig(uration)?\b/i,
    /\benvironment\b/i,
    /\benv\b/i,
    /\bsetup\b/i,
    /\bcredential(s)?\b/i,
    /\btoken\b/i,
    /\binstance\b/i
  ],
  'auth/permissions': [
    /\bpermission(s)?\b/i,
    /\bprofile(s)?\b/i,
    /\bfls\b/i,
    /\bfield[- ]level security\b/i,
    /\binsufficient_access\b/i,
    /\bunauthorized\b/i,
    /\bforbidden\b/i,
    /\bsharing\b/i
  ],
  'prompt-mismatch': [
    /\bprompt mismatch\b/i,
    /\bmis[- ]?rout(ing|ed)?\b/i,
    /\bwrong agent\b/i,
    /\bsub[- ]?agent\b/i,
    /\brout(ing|er)\b/i,
    /\bdark agent(s)?\b/i,
    /\bkeyword index\b/i
  ],
  'schema/parse': [
    /\bschema\b/i,
    /\bparse\b/i,
    /\bsoql\b/i,
    /\bno such column\b/i,
    /\binvalid field\b/i,
    /\bobjectterritory2association\b/i,
    /\bmalformed\b/i,
    /\bwsdl\b/i,
    /\bdescribe call\b/i
  ],
  'tool-contract': [
    /\btool contract\b/i,
    /\bcontract violation\b/i,
    /\bvalidator\b/i,
    /\bexit code\b/i,
    /\bcli\b/i,
    /\bcommand\b/i,
    /\bparameter(s)?\b/i,
    /\bargument(s)?\b/i,
    /\bapi contract\b/i
  ]
};

const GENERIC_EVIDENCE_PATTERNS = [
  /\brunbook\b/i,
  /\bplaybook\b/i,
  /\bdocs\/runbooks\//i,
  /\brunbook_requirements\b/i,
  /\brunbook policy\b/i
];

const IGNORE_TOKENS = new Set([
  'plugins',
  'docs',
  'runbooks',
  'scripts',
  'lib',
  'contexts',
  'readme',
  'md',
  'js',
  'yaml',
  'yml',
  'json',
  'opspal',
  'core',
  'salesforce',
  'hubspot',
  'marketo',
  'agent',
  'routing',
  'auto',
  'help',
  'guide'
]);

function getWorkspaceRoot(candidateRoot) {
  if (candidateRoot && typeof candidateRoot === 'string') {
    return path.resolve(candidateRoot);
  }
  return process.cwd();
}

function parseInputJson(raw) {
  if (!raw || !raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function detectCohortMatches(text) {
  const raw = String(text || '');
  if (!raw.trim()) {
    return [];
  }

  const matches = [];
  for (const [cohort, patterns] of Object.entries(COHORT_PATTERNS)) {
    const matchedPatterns = patterns
      .filter(pattern => pattern.test(raw))
      .map(pattern => pattern.source);

    if (matchedPatterns.length > 0) {
      matches.push({
        cohort,
        score: matchedPatterns.length,
        matched_patterns: matchedPatterns
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.cohort.localeCompare(b.cohort));
  return matches;
}

function extractArtifactTokens(artifactPath) {
  const segments = artifactPath
    .split('/')
    .flatMap(segment => segment.split(/[-_.]/g))
    .map(token => token.trim().toLowerCase())
    .filter(token => token.length >= 4)
    .filter(token => !IGNORE_TOKENS.has(token))
    .filter(token => !/^\d+$/.test(token));

  return unique(segments);
}

function resolveArtifactsForCohorts(cohorts, workspaceRoot) {
  const normalizedRoot = getWorkspaceRoot(workspaceRoot);
  const entries = [];

  for (const cohort of cohorts) {
    const artifacts = COHORT_RUNBOOK_REQUIREMENTS[cohort] || [];
    for (const relPath of artifacts) {
      const absolutePath = path.resolve(normalizedRoot, relPath);
      entries.push({
        cohort,
        path: relPath,
        absolute_path: absolutePath,
        exists: fs.existsSync(absolutePath),
        evidence_tokens: extractArtifactTokens(relPath)
      });
    }
  }

  return entries;
}

function buildGuidanceLines(cohorts, artifacts, missingArtifacts) {
  if (!cohorts.length) {
    return [];
  }

  const lines = [];
  lines.push(`Cohorts detected: ${cohorts.join(', ')}`);
  lines.push('Review required runbook/tooling artifacts before execution:');

  for (const artifact of artifacts) {
    const marker = artifact.exists ? '[OK]' : '[MISSING]';
    lines.push(`- ${marker} (${artifact.cohort}) ${artifact.absolute_path || artifact.path}`);
  }

  if (missingArtifacts.length > 0) {
    lines.push('Missing artifacts must be remediated before strict execution.');
  }

  lines.push('Use the canonical runtime paths above. If any path is missing or uncertain, use LS or Glob before Read instead of guessing workspace-relative plugin paths.');
  lines.push('Cite runbook evidence in the final sub-agent response.');
  return lines;
}

function assessTask(taskInput, options = {}) {
  const input = taskInput && typeof taskInput === 'object' ? taskInput : {};
  const workspaceRoot = getWorkspaceRoot(options.workspaceRoot);
  const prompt = String(input.prompt || input.description || input.task || '');
  const agent = String(input.subagent_type || '');
  const combined = [prompt, agent].filter(Boolean).join('\n');

  const cohortMatches = detectCohortMatches(combined);
  const matchedCohorts = cohortMatches.map(entry => entry.cohort);
  const requiredArtifacts = resolveArtifactsForCohorts(matchedCohorts, workspaceRoot);
  const missingArtifacts = requiredArtifacts.filter(entry => !entry.exists);
  const guidance = buildGuidanceLines(matchedCohorts, requiredArtifacts, missingArtifacts);

  return {
    matched_cohorts: matchedCohorts,
    cohort_matches: cohortMatches,
    required_artifacts: requiredArtifacts,
    missing_artifacts: missingArtifacts,
    requires_runbook_review: matchedCohorts.length > 0,
    strict_block_recommended: missingArtifacts.length > 0,
    guidance,
    guidance_text: guidance.join('\n')
  };
}

function verifyOutput(outputText, options = {}) {
  const raw = String(outputText || '');
  const workspaceRoot = getWorkspaceRoot(options.workspaceRoot);
  const detectedMatches = detectCohortMatches(raw);
  const expectedCohorts = unique(options.expectedCohorts && options.expectedCohorts.length > 0
    ? options.expectedCohorts
    : detectedMatches.map(entry => entry.cohort));

  const requiredArtifacts = resolveArtifactsForCohorts(expectedCohorts, workspaceRoot);
  const missingArtifacts = requiredArtifacts.filter(entry => !entry.exists);
  const hasGenericEvidence = GENERIC_EVIDENCE_PATTERNS.some(pattern => pattern.test(raw));
  const normalizedOutput = raw.toLowerCase();

  const evidenceByCohort = {};

  for (const cohort of expectedCohorts) {
    const cohortArtifacts = requiredArtifacts.filter(entry => entry.cohort === cohort);
    const pathHits = cohortArtifacts.filter(entry =>
      normalizedOutput.includes(entry.path.toLowerCase()) ||
      normalizedOutput.includes(path.basename(entry.path).toLowerCase())
    ).map(entry => entry.path);

    const tokenHits = unique(
      cohortArtifacts.flatMap(entry => entry.evidence_tokens)
        .filter(token => token.length >= 6)
        .filter(token => normalizedOutput.includes(token))
    );

    const hasEvidence = hasGenericEvidence || pathHits.length > 0;
    evidenceByCohort[cohort] = {
      has_evidence: hasEvidence,
      generic_evidence: hasGenericEvidence,
      matched_paths: pathHits,
      matched_tokens: tokenHits
    };
  }

  const missingEvidenceCohorts = expectedCohorts.filter(
    cohort => !evidenceByCohort[cohort]?.has_evidence
  );

  return {
    matched_cohorts: expectedCohorts,
    detected_cohorts: detectedMatches.map(entry => entry.cohort),
    required_artifacts: requiredArtifacts,
    missing_artifacts: missingArtifacts,
    evidence_by_cohort: evidenceByCohort,
    missing_evidence_cohorts: missingEvidenceCohorts,
    has_generic_evidence: hasGenericEvidence,
    verified: missingEvidenceCohorts.length === 0
  };
}

function parseArgs(argv) {
  const args = {
    command: argv[0] || 'help',
    workspaceRoot: process.cwd(),
    cohorts: []
  };

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--workspace-root' && argv[i + 1]) {
      args.workspaceRoot = argv[i + 1];
      i += 1;
    } else if (token === '--cohorts' && argv[i + 1]) {
      args.cohorts = argv[i + 1].split(',').map(value => value.trim()).filter(Boolean);
      i += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Cohort Runbook Guard

Usage:
  node cohort-runbook-guard.js assess-task [--workspace-root <path>] < input.json
  node cohort-runbook-guard.js verify-output [--workspace-root <path>] [--cohorts <list>] < output.txt

Commands:
  assess-task   Detect cohort signals in Task payload and resolve required artifacts
  verify-output Verify runbook evidence coverage in sub-agent output
  help          Show this help
  `);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stdin = fs.readFileSync(0, 'utf8');

  if (args.command === 'assess-task') {
    const input = parseInputJson(stdin);
    const result = assessTask(input, { workspaceRoot: args.workspaceRoot });
    console.log(JSON.stringify(result));
    return;
  }

  if (args.command === 'verify-output') {
    const result = verifyOutput(stdin, {
      workspaceRoot: args.workspaceRoot,
      expectedCohorts: args.cohorts
    });
    console.log(JSON.stringify(result));
    return;
  }

  printHelp();
}

module.exports = {
  COHORT_RUNBOOK_REQUIREMENTS,
  COHORT_PATTERNS,
  assessTask,
  verifyOutput,
  detectCohortMatches,
  resolveArtifactsForCohorts
};

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
