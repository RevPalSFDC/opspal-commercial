#!/usr/bin/env node
'use strict';

const fs = require('fs');

function createEvent(kind, lineNumber, line) {
  return { kind, lineNumber, line };
}

function analyzeClaudeDebugLog(content) {
  const lines = String(content || '').split(/\r?\n/);
  const hookFanout = {};
  const events = {};
  const eventOccurrences = {};
  let plainTextHookOutputs = 0;
  let treeSitterFallbacks = 0;
  let skillsAttachedMax = 0;
  let enabledPlugins = 0;
  let loadedPluginCommands = 0;
  let loadedPluginSkills = 0;
  const readFailures = {
    missingFiles: [],
    directories: []
  };
  let pendingHookLookup = null;

  function recordEvent(kind, lineNumber, line) {
    const event = createEvent(kind, lineNumber, line);
    if (!events[kind]) {
      events[kind] = event;
    }
    if (!eventOccurrences[kind]) {
      eventOccurrences[kind] = [];
    }
    eventOccurrences[kind].push(event);
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    const hookLookupMatch = line.match(/Getting matching hook commands for ([A-Za-z]+) with query: (.+)$/);
    if (hookLookupMatch) {
      pendingHookLookup = {
        eventType: hookLookupMatch[1],
        query: hookLookupMatch[2]
      };
    }

    const hookCountMatch = line.match(/Matched (\d+) unique hooks for query "([^"]+)"/);
    if (hookCountMatch) {
      const count = Number(hookCountMatch[1]);
      const query = hookCountMatch[2];
      const eventType = pendingHookLookup && pendingHookLookup.query === query
        ? pendingHookLookup.eventType
        : 'Unknown';
      const key = `${eventType}:${query}`;
      hookFanout[key] = Math.max(hookFanout[key] || 0, count);
    }

    if (line.includes('Hook output does not start with {, treating as plain text')) {
      plainTextHookOutputs += 1;
    }

    if (line.includes('tree-sitter unavailable, using legacy shell-quote path')) {
      treeSitterFallbacks += 1;
    }

    const missingFileMatch = line.match(/Read tool error \(\d+ms\): File does not exist\. Note: your current working directory is (.+)\.$/);
    if (missingFileMatch) {
      readFailures.missingFiles.push({
        lineNumber,
        line,
        cwd: missingFileMatch[1]
      });
    }

    const directoryReadMatch = line.match(/Read tool error \(\d+ms\): EISDIR: illegal operation on a directory, read '([^']+)'/);
    if (directoryReadMatch) {
      readFailures.directories.push({
        lineNumber,
        line,
        path: directoryReadMatch[1]
      });
    }

    const attachedSkillsMatch = line.match(/Sending (\d+) skills via attachment/);
    if (attachedSkillsMatch) {
      skillsAttachedMax = Math.max(skillsAttachedMax, Number(attachedSkillsMatch[1]));
    }

    const enabledPluginsMatch = line.match(/Processing (\d+) enabled plugins/);
    if (enabledPluginsMatch) {
      enabledPlugins = Number(enabledPluginsMatch[1]);
    }

    const commandsMatch = line.match(/Total plugin commands loaded: (\d+)/);
    if (commandsMatch) {
      loadedPluginCommands = Number(commandsMatch[1]);
    }

    const skillsMatch = line.match(/Total plugin skills loaded: (\d+)/);
    if (skillsMatch) {
      loadedPluginSkills = Number(skillsMatch[1]);
    }

    if (line.includes('DEPLOY BLOCKED: sf project deploy must be run through a deployment agent.')) {
      recordEvent('directDeployBlocked', lineNumber, line);
    }

    if (line.includes('opspal-core:instance-deployer')) {
      recordEvent('instanceDeployerMisroute', lineNumber, line);
    }

    if (line.includes('EISDIR: illegal operation on a directory')) {
      recordEvent('instanceDeployerEISDIR', lineNumber, line);
    }

    if (line.includes('"subagent_type":"opspal-salesforce:sfdc-deployment-manager"')) {
      recordEvent('deploymentManagerInvocation', lineNumber, line);
    }

    if (line.includes('NO FLOWS are being deployed')) {
      recordEvent('noFlowsDeployIntent', lineNumber, line);
    }

    if (line.includes('Flow validation failed:')) {
      recordEvent('flowValidationDenied', lineNumber, line);
    }

    if (line.includes('PostToolUse:Agent hook error')) {
      recordEvent('postToolUseAgentError', lineNumber, line);
    }

    if (line.includes('PostToolUse:Bash hook error')) {
      recordEvent('postToolUseBashError', lineNumber, line);
    }
  });

  let primaryFailure = null;
  const flowValidationAfterDeploymentManager = events.deploymentManagerInvocation
    ? (eventOccurrences.flowValidationDenied || []).find((event) => (
      event.lineNumber > events.deploymentManagerInvocation.lineNumber
    ))
    : null;

  if (
    events.deploymentManagerInvocation &&
    events.noFlowsDeployIntent &&
    flowValidationAfterDeploymentManager
  ) {
    primaryFailure = {
      kind: 'flow_validation_scope_mismatch',
      lineNumber: flowValidationAfterDeploymentManager.lineNumber,
      line: flowValidationAfterDeploymentManager.line
    };
  } else if (events.instanceDeployerEISDIR) {
    primaryFailure = {
      kind: 'misrouted_instance_deployer_read',
      lineNumber: events.instanceDeployerEISDIR.lineNumber,
      line: events.instanceDeployerEISDIR.line
    };
  } else if (events.directDeployBlocked) {
    primaryFailure = {
      kind: 'direct_deploy_guard',
      lineNumber: events.directDeployBlocked.lineNumber,
      line: events.directDeployBlocked.line
    };
  }

  const secondaryFailures = [
    events.instanceDeployerEISDIR,
    events.postToolUseAgentError,
    events.postToolUseBashError
  ].filter(Boolean).map((event) => ({
    kind: event.kind,
    lineNumber: event.lineNumber,
    line: event.line
  }));

  const maxAgentHookFanout = Object.entries(hookFanout).reduce((max, [key, value]) => {
    const query = key.split(':').slice(1).join(':');
    if (query === 'Agent') {
      return Math.max(max, value);
    }
    return max;
  }, 0);

  return {
    plainTextHookOutputs,
    treeSitterFallbacks,
    skillsAttachedMax,
    enabledPlugins,
    loadedPluginCommands,
    loadedPluginSkills,
    maxAgentHookFanout,
    hookFanout,
    events,
    eventOccurrences,
    readFailures,
    primaryFailure,
    secondaryFailures
  };
}

function analyzeClaudeDebugLogFile(filePath) {
  return analyzeClaudeDebugLog(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('Usage: node claude-debug-log-analyzer.js <debug-log-file>\n');
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(analyzeClaudeDebugLogFile(filePath), null, 2)}\n`);
}

module.exports = {
  analyzeClaudeDebugLog,
  analyzeClaudeDebugLogFile
};
