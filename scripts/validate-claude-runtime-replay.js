#!/usr/bin/env node
'use strict';

const path = require('path');

const {
  analyzeClaudeDebugLogFile
} = require(path.join(__dirname, 'lib', 'claude-debug-log-analyzer.js'));

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const [key, inlineValue] = token.slice(2).split('=');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
      continue;
    }

    args[key] = '1';
  }

  return args;
}

function toNumber(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validateAnalysis(analysis, thresholds = {}) {
  const failures = [];
  const limits = {
    maxPlainTextHookOutputs: toNumber(thresholds.maxPlainTextHookOutputs, 0),
    maxSkillsAttached: toNumber(thresholds.maxSkillsAttached, 80),
    maxAgentHookFanout: toNumber(thresholds.maxAgentHookFanout, 3),
    maxMissingFileReads: toNumber(thresholds.maxMissingFileReads, 0),
    maxDirectoryReads: toNumber(thresholds.maxDirectoryReads, 0)
  };

  if (analysis.plainTextHookOutputs > limits.maxPlainTextHookOutputs) {
    failures.push(
      `Plain-text hook outputs exceeded budget: ${analysis.plainTextHookOutputs} > ${limits.maxPlainTextHookOutputs}`
    );
  }

  if (analysis.skillsAttachedMax > limits.maxSkillsAttached) {
    failures.push(
      `Attached skills exceeded budget: ${analysis.skillsAttachedMax} > ${limits.maxSkillsAttached}`
    );
  }

  if (analysis.maxAgentHookFanout > limits.maxAgentHookFanout) {
    failures.push(
      `PreToolUse:Agent hook fanout exceeded budget: ${analysis.maxAgentHookFanout} > ${limits.maxAgentHookFanout}`
    );
  }

  if (analysis.readFailures.missingFiles.length > limits.maxMissingFileReads) {
    const first = analysis.readFailures.missingFiles[0];
    failures.push(
      `Missing-file Read failures detected: ${analysis.readFailures.missingFiles.length} (first at line ${first.lineNumber}, cwd=${first.cwd})`
    );
  }

  if (analysis.readFailures.directories.length > limits.maxDirectoryReads) {
    const first = analysis.readFailures.directories[0];
    failures.push(
      `Directory Read failures detected: ${analysis.readFailures.directories.length} (first at line ${first.lineNumber}, path=${first.path})`
    );
  }

  if (analysis.primaryFailure) {
    failures.push(
      `Primary runtime failure detected: ${analysis.primaryFailure.kind} at line ${analysis.primaryFailure.lineNumber}`
    );
  }

  return { failures, limits };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = args._[0];

  if (!filePath) {
    process.stderr.write('Usage: node scripts/validate-claude-runtime-replay.js <debug-log-file> [--max-skills-attached N] [--max-agent-hook-fanout N]\n');
    process.exit(1);
  }

  const analysis = analyzeClaudeDebugLogFile(filePath);
  const { failures, limits } = validateAnalysis(analysis, {
    maxPlainTextHookOutputs: args['max-plain-text-hook-outputs'],
    maxSkillsAttached: args['max-skills-attached'],
    maxAgentHookFanout: args['max-agent-hook-fanout'],
    maxMissingFileReads: args['max-missing-file-reads'],
    maxDirectoryReads: args['max-directory-reads']
  });

  if (failures.length === 0) {
    process.stdout.write(JSON.stringify({
      ok: true,
      limits,
      summary: {
        plainTextHookOutputs: analysis.plainTextHookOutputs,
        skillsAttachedMax: analysis.skillsAttachedMax,
        maxAgentHookFanout: analysis.maxAgentHookFanout,
        missingFileReads: analysis.readFailures.missingFiles.length,
        directoryReads: analysis.readFailures.directories.length
      }
    }, null, 2) + '\n');
    return;
  }

  process.stderr.write(failures.map((failure) => `- ${failure}`).join('\n') + '\n');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateAnalysis
};
