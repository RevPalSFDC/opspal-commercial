#!/usr/bin/env node
'use strict';

const fs = require('fs');

function createEvent(kind, lineNumber, line) {
  return { kind, lineNumber, line };
}

function normalizeToolList(fragment) {
  return Array.from(new Set(
    String(fragment || '')
      .split(/[\/,]/)
      .flatMap((item) => item.split(/\band\b/i))
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function extractProjectionMismatchDetails(line, lineNumber, routedAgent) {
  if (
    !/only has Read\/Write tools/i.test(line) &&
    !/couldn't execute.*no Bash/i.test(line) &&
    !/lacks Bash/i.test(line) &&
    !/ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH/i.test(line)
  ) {
    return null;
  }

  const details = {
    kind: 'subagent_tool_projection_mismatch',
    lineNumber,
    line,
    agent: routedAgent || null,
    actualTools: [],
    expectedToolsFromLog: [],
    requiredToolsFromLog: [],
    missingTools: []
  };
  const clearedAgentMatch = line.match(/cleared to '([^']+)'/i);
  const onlyHasMatch = line.match(/only has ([A-Za-z0-9_\/,\s-]+) tools/i);
  const requiredToolsMatch = line.match(/Required tools: ([^.]+)\./i);
  const expectedToolsMatch = line.match(/Loaded tools for cleared specialist: ([^.]+)\./i);

  if (clearedAgentMatch) {
    details.agent = clearedAgentMatch[1];
  }

  if (onlyHasMatch) {
    details.actualTools = normalizeToolList(onlyHasMatch[1]);
  }

  if (requiredToolsMatch) {
    details.requiredToolsFromLog = normalizeToolList(requiredToolsMatch[1]);
  }

  if (expectedToolsMatch) {
    details.expectedToolsFromLog = normalizeToolList(expectedToolsMatch[1]);
  }

  if (/no Bash|lacks Bash/i.test(line)) {
    details.missingTools.push('Bash');
  }

  return details;
}

function parseRouteProfileMismatch(line, lineNumber) {
  const requiredProfileMatch = line.match(
    /ROUTING_REQUIRED_PROFILE_MISMATCH: Pending route requires ([^ ]+) and the selected agent '([^']+)' does not satisfy the active route profile\. Required tools: ([^.]+)\. Actual tools: ([^.]+)\. Required capabilities: ([^.]+)\. Eligible actor types: ([^.]+)\./
  );

  if (requiredProfileMatch) {
    return {
      kind: 'spawn_time_route_profile_mismatch',
      code: 'ROUTING_REQUIRED_PROFILE_MISMATCH',
      lineNumber,
      line,
      requiredAgent: requiredProfileMatch[1],
      selectedAgent: requiredProfileMatch[2],
      requiredTools: normalizeToolList(requiredProfileMatch[3]),
      actualTools: normalizeToolList(requiredProfileMatch[4]),
      requiredCapabilities: normalizeToolList(requiredProfileMatch[5]),
      allowedActorTypes: normalizeToolList(requiredProfileMatch[6])
    };
  }

  const autoDelegationMatch = line.match(
    /ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH: Pending ([^ ]+) route attempted auto-delegation to '([^']+)', but that agent does not satisfy the active route profile\. Required tools: ([^.]+)\. Actual tools: ([^.]+)\. Required capabilities: ([^.]+)\. Eligible actor types: ([^.]+)\./
  );

  if (autoDelegationMatch) {
    return {
      kind: 'spawn_time_route_profile_mismatch',
      code: 'ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH',
      lineNumber,
      line,
      routeKind: autoDelegationMatch[1],
      selectedAgent: autoDelegationMatch[2],
      requiredTools: normalizeToolList(autoDelegationMatch[3]),
      actualTools: normalizeToolList(autoDelegationMatch[4]),
      requiredCapabilities: normalizeToolList(autoDelegationMatch[5]),
      allowedActorTypes: normalizeToolList(autoDelegationMatch[6])
    };
  }

  const requiredAgentMatch = line.match(
    /ROUTING_REQUIRED_AGENT_MISMATCH: Pending route requires ([^.]+)\. Use the Agent tool with subagent_type='([^']+)' or another approved family member: ([^.]+)\. Current action=([^.]+)\./
  );

  if (requiredAgentMatch) {
    return {
      kind: 'spawn_time_route_profile_mismatch',
      code: 'ROUTING_REQUIRED_AGENT_MISMATCH',
      lineNumber,
      line,
      requiredAgent: requiredAgentMatch[1],
      suggestedAgent: requiredAgentMatch[2],
      approvedAgents: normalizeToolList(requiredAgentMatch[3]),
      currentAction: requiredAgentMatch[4]
    };
  }

  return null;
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
  let lastRoutedAgent = null;
  const readFailures = {
    missingFiles: [],
    directories: []
  };
  const routedAgents = [];
  const projectionMismatches = [];
  const routeProfileMismatches = [];
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

    const routedAgentMatch = line.match(/Routed to ([A-Za-z0-9-]+:[A-Za-z0-9-]+)/);
    if (routedAgentMatch) {
      lastRoutedAgent = routedAgentMatch[1];
      routedAgents.push({
        agent: lastRoutedAgent,
        lineNumber,
        line
      });
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

    if (
      /only has Read\/Write tools/i.test(line) ||
      /couldn't execute.*no Bash/i.test(line) ||
      /lacks Bash/i.test(line) ||
      /ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH/i.test(line)
    ) {
      recordEvent('subagentToolProjectionMismatch', lineNumber, line);
      const details = extractProjectionMismatchDetails(line, lineNumber, lastRoutedAgent);
      if (details) {
        projectionMismatches.push(details);
      }
    }

    const routeProfileMismatch = parseRouteProfileMismatch(line, lineNumber);
    if (routeProfileMismatch) {
      routeProfileMismatches.push(routeProfileMismatch);
      recordEvent(routeProfileMismatch.code, lineNumber, line);
    }
  });

  let primaryFailure = null;
  const flowValidationAfterDeploymentManager = events.deploymentManagerInvocation
    ? (eventOccurrences.flowValidationDenied || []).find((event) => (
      event.lineNumber > events.deploymentManagerInvocation.lineNumber
    ))
    : null;

  if (
    events.subagentToolProjectionMismatch
  ) {
    primaryFailure = {
      kind: 'subagent_tool_projection_mismatch',
      lineNumber: events.subagentToolProjectionMismatch.lineNumber,
      line: events.subagentToolProjectionMismatch.line,
      details: projectionMismatches[0] || null
    };
  } else if (routeProfileMismatches.length > 0) {
    primaryFailure = {
      kind: 'spawn_time_route_profile_mismatch',
      lineNumber: routeProfileMismatches[0].lineNumber,
      line: routeProfileMismatches[0].line,
      details: routeProfileMismatches[0]
    };
  } else if (
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
    events.subagentToolProjectionMismatch,
    routeProfileMismatches[0] ? createEvent(routeProfileMismatches[0].code, routeProfileMismatches[0].lineNumber, routeProfileMismatches[0].line) : null,
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
    routedAgents,
    projectionMismatches,
    routeProfileMismatches,
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
