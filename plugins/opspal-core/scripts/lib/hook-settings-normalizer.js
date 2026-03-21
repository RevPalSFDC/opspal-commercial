'use strict';

const path = require('path');

const IGNORED_MATCHER_EVENTS = new Set(['UserPromptSubmit', 'SessionStart', 'Stop']);
const PRETASK_CONTEXT_BASENAMES = new Set([
  'pre-task-runbook-reminder.sh',
  'pre-task-template-injector.sh',
  'pre-task-field-dictionary-injector.sh',
  'pre-task-work-context.sh'
]);
const ARGUMENT_MATCHER_CONFIG = {
  'Bash(sf project deploy*)': { matcher: 'Bash', type: 'bash', pattern: 'sf project deploy' },
  'Bash(sf data query*)': { matcher: 'Bash', type: 'bash', pattern: 'sf data query' },
  'Bash(*jq*)': { matcher: 'Bash', type: 'bash', pattern: 'jq' },
  'Bash(*awk*)': { matcher: 'Bash', type: 'bash', pattern: 'awk' },
  'Bash(*sed*)': { matcher: 'Bash', type: 'bash', pattern: 'sed' },
  'Bash(sf sobject describe*)': { matcher: 'Bash', type: 'bash', pattern: 'sf sobject describe' },
  'Write(*SESSION_REFLECTION*)': { matcher: 'Write', type: 'write', pattern: 'SESSION_REFLECTION' },
  'Task(*)': { matcher: 'Agent', type: 'task' },
  'Agent(*)': { matcher: 'Agent', type: 'task' },
  Task: { matcher: 'Agent', type: 'task' }
};
const LEGACY_BASH_DENY_RULE_PATTERNS = [
  /^Bash$/,
  /^Bash\*$/,
  /^Bash\.\*$/
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeForDoubleQuotedScript(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function rewriteCommandPaths(command, projectRoot) {
  if (typeof command !== 'string' || command.trim() === '') {
    return command;
  }

  const projectName = path.basename(projectRoot);
  const normalizedRoot = path.resolve(projectRoot);
  const absoluteRootPattern = new RegExp(`/home/[^/'"\\s]+/Desktop/RevPal/Agents/(?:[^/'"\\s]+/)?${escapeRegExp(projectName)}`, 'g');
  const homeRootPattern = new RegExp(`\\$HOME/Desktop/RevPal/Agents/(?:[^/'"\\s]+/)?${escapeRegExp(projectName)}`, 'g');

  let rewritten = command
    .replace(absoluteRootPattern, normalizedRoot)
    .replace(homeRootPattern, normalizedRoot);

  rewritten = rewritten
    .replace(
      /\/home\/[^/'"\s]+\/\.claude\/plugins\/marketplaces\/[^/'"\s]+\/plugins\/([^/'"\s]+)/g,
      `${normalizedRoot}/plugins/$1`
    )
    .replace(
      /\$HOME\/\.claude\/plugins\/marketplaces\/[^/'"\s]+\/plugins\/([^/'"\s]+)/g,
      `${normalizedRoot}/plugins/$1`
    )
    .replace(
      /\/home\/[^/'"\s]+\/\.claude\/plugins\/cache\/[^/'"\s]+\/([^/'"\s]+)\/[^/'"\s]+/g,
      `${normalizedRoot}/plugins/$1`
    )
    .replace(
      /\$HOME\/\.claude\/plugins\/cache\/[^/'"\s]+\/([^/'"\s]+)\/[^/'"\s]+/g,
      `${normalizedRoot}/plugins/$1`
    );

  const wrongDeveloperToolsRoot = `${normalizedRoot}/plugins/developer-tools-plugin`;
  const correctDeveloperToolsRoot = `${normalizedRoot}/dev-tools/developer-tools-plugin`;
  rewritten = rewritten.replace(new RegExp(escapeRegExp(wrongDeveloperToolsRoot), 'g'), correctDeveloperToolsRoot);

  return rewritten;
}

function extractScriptPath(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    return null;
  }

  const bashMatch = command.match(/bash\s+(?:-c\s+)?["']?([^"'\s;]+\.sh)/);
  if (bashMatch) {
    return bashMatch[1];
  }

  const nodeMatch = command.match(/node\s+["']?([^"'\s;]+\.js)/);
  if (nodeMatch) {
    return nodeMatch[1];
  }

  const quotedMatch = command.match(/["']([^"']+\.(?:sh|js))["']/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  if (command.endsWith('.sh') || command.endsWith('.js')) {
    return command.split(' ')[0];
  }

  return null;
}

function extractScriptBasename(command) {
  const scriptPath = extractScriptPath(command);
  return scriptPath ? path.basename(scriptPath) : null;
}

function normalizeGlobMatcher(matcher) {
  if (typeof matcher !== 'string' || matcher === '') {
    return matcher;
  }

  if (matcher === '*') {
    return matcher;
  }

  let normalized = '';
  for (let index = 0; index < matcher.length; index += 1) {
    const current = matcher[index];
    const previous = matcher[index - 1];

    if (current === '*' && previous !== '.' && previous !== '\\') {
      normalized += '.*';
      continue;
    }

    normalized += current;
  }

  return normalized;
}

function normalizeMatcher(eventType, matcher) {
  if (matcher === undefined || matcher === null || matcher === '') {
    return undefined;
  }

  const argumentMatcher = ARGUMENT_MATCHER_CONFIG[matcher];
  if (argumentMatcher) {
    return argumentMatcher.matcher;
  }

  if (IGNORED_MATCHER_EVENTS.has(eventType)) {
    return undefined;
  }

  return normalizeGlobMatcher(matcher);
}

function buildGuardedBashCommand(command, pattern) {
  const escapedCommand = escapeForDoubleQuotedScript(command);
  const escapedPattern = escapeForDoubleQuotedScript(pattern);
  return 'bash -c "INPUT=\\"${CLAUDE_TOOL_INPUT:-${HOOK_TOOL_INPUT:-${TOOL_INPUT:-}}}\\"; ' +
    `if [[ \\"$INPUT\\" == *\\"${escapedPattern}\\"* ]]; then ${escapedCommand}; fi"`;
}

function buildGuardedWriteCommand(command, pattern) {
  const escapedCommand = escapeForDoubleQuotedScript(command);
  const escapedPattern = escapeForDoubleQuotedScript(pattern);
  return 'bash -c "INPUT_PATH=\\"${CLAUDE_TOOL_INPUT_PATH:-${HOOK_TOOL_INPUT_PATH:-${TOOL_INPUT_PATH:-}}}\\"; ' +
    'INPUT=\\"${CLAUDE_TOOL_INPUT:-${HOOK_TOOL_INPUT:-${TOOL_INPUT:-}}}\\"; ' +
    `if echo \\"$INPUT_PATH $INPUT\\" | grep -q \\"${escapedPattern}\\"; then ${escapedCommand}; fi"`;
}

function normalizeHookCommand(command, eventType, originalMatcher, projectRoot) {
  const rewritten = rewriteCommandPaths(command, projectRoot);
  const matcherConfig = ARGUMENT_MATCHER_CONFIG[originalMatcher];

  if (!matcherConfig) {
    return rewritten;
  }

  if (matcherConfig.type === 'bash') {
    return buildGuardedBashCommand(rewritten, matcherConfig.pattern);
  }

  if (matcherConfig.type === 'write') {
    return buildGuardedWriteCommand(rewritten, matcherConfig.pattern);
  }

  return rewritten;
}

function shouldDropStopGroup(eventType, matcher, hooks, subagentStopCommands) {
  if (eventType !== 'Stop' || !matcher || matcher === '*' || hooks.length === 0) {
    return false;
  }

  return hooks.every((hook) => {
    const basename = extractScriptBasename(hook.command);
    return basename && subagentStopCommands.has(basename);
  });
}

function appendNormalizedHook(groupsByMatcher, matcherOrder, matcher, hook) {
  const key = matcher === undefined ? '' : matcher;
  let group = groupsByMatcher.get(key);

  if (!group) {
    group = { hooks: [], seen: new Set() };
    if (matcher !== undefined) {
      group.matcher = matcher;
    }
    groupsByMatcher.set(key, group);
    matcherOrder.push(key);
  }

  if (group.seen.has(hook.command)) {
    return;
  }

  group.hooks.push(hook);
  group.seen.add(hook.command);
}

function isLegacyBashDenyRule(rule) {
  if (typeof rule === 'string') {
    return LEGACY_BASH_DENY_RULE_PATTERNS.some((pattern) => pattern.test(rule.trim()));
  }

  if (!rule || typeof rule !== 'object') {
    return false;
  }

  const toolName = typeof rule.toolName === 'string' ? rule.toolName.trim() : '';
  const ruleContent = typeof rule.ruleContent === 'string' ? rule.ruleContent.trim() : '';
  if (toolName !== 'Bash') {
    return false;
  }

  return ruleContent === '' || ruleContent === '*' || ruleContent === '.*';
}

function sanitizeSettingsPermissions(settings) {
  if (!settings || typeof settings !== 'object' || !settings.permissions || typeof settings.permissions !== 'object') {
    return {
      settings,
      changed: false,
      removedBashDenyRules: 0
    };
  }

  const denyRules = Array.isArray(settings.permissions.deny) ? settings.permissions.deny : null;
  if (!denyRules) {
    return {
      settings,
      changed: false,
      removedBashDenyRules: 0
    };
  }

  const sanitizedDenyRules = denyRules.filter((rule) => !isLegacyBashDenyRule(rule));
  const removedBashDenyRules = denyRules.length - sanitizedDenyRules.length;

  if (removedBashDenyRules > 0) {
    settings.permissions.deny = sanitizedDenyRules;
  }

  return {
    settings,
    changed: removedBashDenyRules > 0,
    removedBashDenyRules
  };
}

function normalizeProjectHookSettings(settings, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const cloned = JSON.parse(JSON.stringify(settings || {}));
  sanitizeSettingsPermissions(cloned);
  const hooks = cloned.hooks && typeof cloned.hooks === 'object' ? cloned.hooks : {};
  const normalizedHooks = {};
  const subagentStopCommands = new Set();

  for (const group of Array.isArray(hooks.SubagentStop) ? hooks.SubagentStop : []) {
    for (const hook of Array.isArray(group?.hooks) ? group.hooks : []) {
      const basename = extractScriptBasename(rewriteCommandPaths(hook.command, projectRoot));
      if (basename) {
        subagentStopCommands.add(basename);
      }
    }
  }

  for (const [eventType, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      continue;
    }

    const groupsByMatcher = new Map();
    const matcherOrder = [];

    for (const group of groups) {
      const hookList = Array.isArray(group?.hooks) ? group.hooks : [];
      if (hookList.length === 0) {
        continue;
      }

      const originalMatcher = typeof group.matcher === 'string' ? group.matcher : undefined;
      const normalizedMatcher = normalizeMatcher(eventType, originalMatcher);
      const normalizedHookList = [];

      for (const hook of hookList) {
        if (!hook || typeof hook !== 'object' || typeof hook.command !== 'string') {
          continue;
        }

        const basename = extractScriptBasename(hook.command);
        if (
          eventType === 'PreToolUse' &&
          (
            originalMatcher === 'Task(*)' ||
            originalMatcher === 'Task' ||
            originalMatcher === 'Agent(*)' ||
            originalMatcher === 'Agent'
          ) &&
          PRETASK_CONTEXT_BASENAMES.has(basename)
        ) {
          continue;
        }

        normalizedHookList.push({
          ...hook,
          command: normalizeHookCommand(hook.command, eventType, originalMatcher, projectRoot)
        });
      }

      if (normalizedHookList.length === 0) {
        continue;
      }

      if (shouldDropStopGroup(eventType, originalMatcher, normalizedHookList, subagentStopCommands)) {
        continue;
      }

      for (const hook of normalizedHookList) {
        appendNormalizedHook(groupsByMatcher, matcherOrder, normalizedMatcher, hook);
      }
    }

    const eventGroups = matcherOrder.map((key) => {
      const group = groupsByMatcher.get(key);
      const normalizedGroup = {
        hooks: group.hooks
      };
      if (group.matcher !== undefined) {
        normalizedGroup.matcher = group.matcher;
      }
      return normalizedGroup;
    }).filter((group) => group.hooks.length > 0);

    if (eventGroups.length > 0) {
      normalizedHooks[eventType] = eventGroups;
    }
  }

  return {
    ...cloned,
    hooks: normalizedHooks
  };
}

module.exports = {
  ARGUMENT_MATCHER_CONFIG,
  PRETASK_CONTEXT_BASENAMES,
  extractScriptBasename,
  isLegacyBashDenyRule,
  normalizeProjectHookSettings,
  sanitizeSettingsPermissions,
  rewriteCommandPaths
};
