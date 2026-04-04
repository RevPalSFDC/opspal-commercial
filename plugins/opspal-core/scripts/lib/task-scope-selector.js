#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { TaskKeywordExtractor } = require('./task-keyword-extractor');

const DEFAULT_STATE_FILE = path.join(os.homedir(), '.claude', 'session-context', 'task-scope.json');
const ROUTING_STATE_DIR = path.join(os.homedir(), '.claude', 'routing-state');
const MAX_CONTEXT_ASSET_NAMES = 6;

/**
 * Read active routing state for a session to prevent scope suppression
 * of the plugin family that routing enforcement requires.
 *
 * Previously this only checked pending_clearance state, which missed cases
 * where routing had already resolved (cleared/bypassed) but still referenced
 * a required agent. Any non-expired routing state with a required_agent should
 * protect that agent's plugin from scope suppression.
 */
function readPendingRoutingState(sessionKey) {
  if (!sessionKey) return null;
  const sanitized = String(sessionKey).replace(/[^A-Za-z0-9._-]+/g, '_');
  const stateFile = path.join(ROUTING_STATE_DIR, `${sanitized}.json`);
  try {
    if (!fs.existsSync(stateFile)) return null;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (state.expires_at && now >= state.expires_at) return null;
    // Return any non-expired state that references a required agent —
    // regardless of clearance status. This prevents the deadlock where
    // scope selector suppresses the plugin that a PreToolUse governance
    // hook (e.g. deploy-agent-context-check) will later require.
    if (state.required_agent || state.last_resolved_agent) return state;
    return null;
  } catch (_e) {
    return null;
  }
}

const PLUGIN_POLICIES = {
  'opspal-core': {
    alwaysInclude: true,
    priority: 1000,
    maxSkills: 8,
    maxCommands: 8,
    keywords: [
      'hook', 'routing', 'context', 'runbook', 'workspace', 'project', 'analysis',
      'read', 'path', 'prompt', 'skill', 'scope', 'deployment'
    ],
    agentPatterns: [/^opspal-core:/, /^instance-deployer$/]
  },
  'opspal-salesforce': {
    priority: 900,
    maxSkills: 12,
    maxCommands: 10,
    keywords: [
      'salesforce', 'sfdc', 'apex', 'flow', 'validation rule', 'quick action', 'soql',
      'lwc', 'territory', 'cpq', 'quote', 'record type', 'metadata', 'force-app',
      'deploy', 'target-org', 'source-dir', 'metadata-dir', 'sf project', 'sandbox',
      'staging', 'production org', 'permission set', 'field-level security'
    ],
    agentPatterns: [
      /^opspal-salesforce:/, /^sfdc-/, /^salesforce-/, /^flow-/, /^validation-rule-/,
      /^territory-/, /^report-/, /^upsert-/, /^trigger-/
    ]
  },
  'opspal-hubspot': {
    priority: 700,
    maxSkills: 10,
    maxCommands: 8,
    keywords: ['hubspot', 'portal', 'cms', 'sales hub', 'marketing hub', 'service hub'],
    agentPatterns: [/^opspal-hubspot:/, /^hubspot-/]
  },
  'opspal-marketo': {
    priority: 650,
    maxSkills: 10,
    maxCommands: 8,
    keywords: ['marketo', 'mql', 'smart campaign', 'lead score', 'engagement program'],
    agentPatterns: [/^opspal-marketo:/, /^marketo-/]
  },
  'opspal-okrs': {
    priority: 600,
    maxSkills: 6,
    maxCommands: 6,
    keywords: ['okr', 'okrs', 'objective', 'key result', 'initiative'],
    agentPatterns: [/^opspal-okrs:/, /^okr-/]
  },
  'opspal-gtm-planning': {
    priority: 580,
    maxSkills: 6,
    maxCommands: 6,
    keywords: ['gtm', 'go-to-market', 'quota', 'capacity', 'arr', 'mrr', 'market size'],
    agentPatterns: [/^opspal-gtm-planning:/, /^gtm-/]
  },
  'opspal-ai-consult': {
    priority: 500,
    maxSkills: 4,
    maxCommands: 4,
    keywords: ['ai consult', 'ai strategy', 'consulting', 'strategy assessment'],
    agentPatterns: [/^opspal-ai-consult:/]
  },
  'opspal-mcp-client': {
    priority: 450,
    maxSkills: 4,
    maxCommands: 4,
    keywords: ['benchmark', 'compute', 'scorecard', 'scoring'],
    agentPatterns: [/^opspal-mcp-client:/]
  },
  'opspal-monday': {
    priority: 400,
    maxSkills: 4,
    maxCommands: 4,
    keywords: ['monday', 'board', 'kanban', 'work management'],
    agentPatterns: [/^opspal-monday:/, /^monday-/]
  }
};

const ALL_PLUGINS = Object.keys(PLUGIN_POLICIES);

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeAgentName(agentName = '') {
  return String(agentName || '').trim();
}

function normalizeText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(Boolean);
}

function parseCliArgs(argv) {
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

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function extractTaskFromHookPayload(payload = {}) {
  return normalizeText(
    payload.user_message ||
    payload.userPrompt ||
    payload.prompt ||
    payload.userMessage ||
    payload.message ||
    payload.tool_input?.prompt ||
    payload.tool_input?.description ||
    payload.description ||
    ''
  );
}

function extractAgentFromHookPayload(payload = {}) {
  return normalizeAgentName(
    payload.agent_type ||
    payload.subagent_type ||
    payload.agentName ||
    payload.tool_input?.subagent_type ||
    ''
  );
}

function extractSessionKey(payload = {}) {
  const sessionKey = payload.session_key ||
    payload.sessionKey ||
    payload.session_id ||
    payload.sessionId ||
    payload.context?.session_key ||
    payload.context?.sessionKey ||
    process.env.CLAUDE_SESSION_ID ||
    'default-session';

  return String(sessionKey);
}

function resolvePluginsRoot(options = {}) {
  if (options.pluginsRoot) {
    return path.resolve(options.pluginsRoot);
  }
  return path.resolve(__dirname, '../../..');
}

function buildInventoryItem(itemPath, kind) {
  const relativePath = itemPath.replace(/\\/g, '/');
  const baseName = kind === 'skill'
    ? path.basename(path.dirname(itemPath))
    : path.basename(itemPath, path.extname(itemPath));

  return {
    kind,
    path: relativePath,
    name: baseName,
    tokens: tokenize(baseName)
  };
}

function listDirectoryEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }
}

function listPluginInventory(pluginName, options = {}) {
  const pluginsRoot = resolvePluginsRoot(options);
  const pluginDir = path.join(pluginsRoot, pluginName);
  const commandsDir = path.join(pluginDir, 'commands');
  const skillsDir = path.join(pluginDir, 'skills');

  const commands = listDirectoryEntries(commandsDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => buildInventoryItem(path.join(commandsDir, entry.name), 'command'));

  const skills = listDirectoryEntries(skillsDir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, 'SKILL.md'))
    .filter((skillPath) => fs.existsSync(skillPath))
    .map((skillPath) => buildInventoryItem(skillPath, 'skill'));

  return { commands, skills };
}

function pluginMatchesAgent(pluginName, agentName) {
  if (!agentName) {
    return false;
  }

  const policy = PLUGIN_POLICIES[pluginName];
  if (!policy) {
    return false;
  }

  return (policy.agentPatterns || []).some((pattern) => pattern.test(agentName));
}

function pluginKeywordHits(pluginName, taskText) {
  const policy = PLUGIN_POLICIES[pluginName];
  if (!policy) {
    return 0;
  }

  return (policy.keywords || []).reduce((score, keyword) => (
    taskText.includes(keyword) ? score + 1 : score
  ), 0);
}

function getSelectionCaps(keywordSummary) {
  const platformCount = keywordSummary.platforms.filter((platform) => (
    ['salesforce', 'hubspot', 'marketo', 'okrs', 'gtm', 'monday'].includes(platform)
  )).length;
  const multiPlatform = keywordSummary.signals.includes('multi-platform') || platformCount > 1;

  return {
    maxPlugins: multiPlatform ? 4 : 3,
    maxSkillsTotal: multiPlatform ? 30 : 24,
    maxCommandsTotal: multiPlatform ? 24 : 18
  };
}

function selectPlugins(taskText, agentName, keywordSummary) {
  const normalizedTask = normalizeText(taskText).toLowerCase();
  const caps = getSelectionCaps(keywordSummary);
  const scored = ALL_PLUGINS.map((pluginName) => {
    const policy = PLUGIN_POLICIES[pluginName];
    let score = policy.alwaysInclude ? policy.priority : 0;

    if (pluginMatchesAgent(pluginName, agentName)) {
      score += 250;
    }

    score += pluginKeywordHits(pluginName, normalizedTask) * 40;

    if (pluginName === 'opspal-ai-consult' && normalizedTask.includes('consult')) {
      score += 120;
    }

    if (pluginName === 'opspal-mcp-client' && normalizedTask.includes('benchmark')) {
      score += 80;
    }

    if (pluginName === 'opspal-core' && keywordSummary.platforms.length === 0) {
      score += 40;
    }

    return { pluginName, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((left, right) => right.score - left.score);

  const selected = [];
  scored.forEach((entry) => {
    if (entry.pluginName === 'opspal-core') {
      if (!selected.includes(entry.pluginName)) {
        selected.push(entry.pluginName);
      }
      return;
    }

    if (selected.length >= caps.maxPlugins) {
      return;
    }

    if (!selected.includes(entry.pluginName)) {
      selected.push(entry.pluginName);
    }
  });

  if (!selected.includes('opspal-core')) {
    selected.unshift('opspal-core');
  }

  return selected;
}

function scoreAsset(asset, taskTokens, agentTokens, keywordSummary, pluginName) {
  const assetTokenSet = new Set(asset.tokens);
  let score = 0;

  taskTokens.forEach((token) => {
    if (assetTokenSet.has(token)) {
      score += 20;
    }
  });

  agentTokens.forEach((token) => {
    if (assetTokenSet.has(token)) {
      score += 25;
    }
  });

  keywordSummary.operations.forEach((token) => {
    if (assetTokenSet.has(token)) {
      score += 18;
    }
  });

  keywordSummary.domains.forEach((token) => {
    if (assetTokenSet.has(token)) {
      score += 18;
    }
  });

  const pluginPolicy = PLUGIN_POLICIES[pluginName];
  (pluginPolicy.keywords || []).forEach((keyword) => {
    if (keyword.includes(' ')) {
      return;
    }
    if (assetTokenSet.has(keyword)) {
      score += 10;
    }
  });

  if (pluginName === 'opspal-core' && /hook|routing|context|runbook|path/.test(asset.name)) {
    score += 12;
  }

  return score;
}

function selectAssets(selectedPlugins, taskText, agentName, keywordSummary, options = {}) {
  const caps = getSelectionCaps(keywordSummary);
  const taskTokens = keywordSummary.taskWords;
  const agentTokens = tokenize(agentName.replace(/^[^:]+:/, ''));
  let totalSkills = 0;
  let totalCommands = 0;

  const selectedAssets = {};

  selectedPlugins.forEach((pluginName) => {
    const policy = PLUGIN_POLICIES[pluginName];
    const inventory = listPluginInventory(pluginName, options);

    const scoredSkills = inventory.skills
      .map((asset) => ({
        ...asset,
        score: scoreAsset(asset, taskTokens, agentTokens, keywordSummary, pluginName)
      }))
      .sort((left, right) => right.score - left.score);

    const scoredCommands = inventory.commands
      .map((asset) => ({
        ...asset,
        score: scoreAsset(asset, taskTokens, agentTokens, keywordSummary, pluginName)
      }))
      .sort((left, right) => right.score - left.score);

    const remainingSkills = Math.max(caps.maxSkillsTotal - totalSkills, 0);
    const remainingCommands = Math.max(caps.maxCommandsTotal - totalCommands, 0);

    const skills = scoredSkills.slice(0, remainingSkills > 0 ? Math.min(policy.maxSkills, remainingSkills) : 0);
    const commands = scoredCommands.slice(0, remainingCommands > 0 ? Math.min(policy.maxCommands, remainingCommands) : 0);

    totalSkills += skills.length;
    totalCommands += commands.length;

    selectedAssets[pluginName] = {
      skills,
      commands,
      inventoryCounts: {
        skills: inventory.skills.length,
        commands: inventory.commands.length
      }
    };
  });

  return {
    selectedAssets,
    totals: {
      skills: totalSkills,
      commands: totalCommands,
      assets: totalSkills + totalCommands
    },
    caps
  };
}

function flattenTopAssetNames(selectedAssets) {
  const assets = [];
  Object.entries(selectedAssets).forEach(([pluginName, pluginAssets]) => {
    pluginAssets.skills.forEach((asset) => {
      assets.push({ pluginName, name: asset.name, score: asset.score });
    });
    pluginAssets.commands.forEach((asset) => {
      assets.push({ pluginName, name: asset.name, score: asset.score });
    });
  });

  return assets
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CONTEXT_ASSET_NAMES)
    .map((asset) => `${asset.pluginName}:${asset.name}`);
}

function buildScopeSummary(scope) {
  const selected = scope.selectedPlugins.join(', ');
  const suppressed = scope.suppressedPlugins.slice(0, 6).join(', ');
  const topAssets = flattenTopAssetNames(scope.selectedAssets);

  const userPromptContext = [
    `Context: Active plugins for this session: ${selected}.`,
    suppressed ? `Other plugins (${suppressed}) available if needed.` : '',
    topAssets.length > 0 ? `Relevant assets: ${topAssets.join(', ')}.` : ''
  ].filter(Boolean).join(' ');

  const subagentContext = [
    `Context: Active plugins: ${selected}.`,
    suppressed ? `Other plugins (${suppressed}) available if the task requires them.` : '',
    topAssets.length > 0 ? `Relevant: ${topAssets.join(', ')}.` : ''
  ].filter(Boolean).join(' ');

  return {
    userPromptContext,
    subagentContext
  };
}

function buildScope(input = {}, options = {}) {
  const task = normalizeText(input.task);
  const agentName = normalizeAgentName(input.agentName);
  const cwd = input.cwd || process.cwd();
  const sessionKey = input.sessionKey || 'default-session';
  const stateFile = options.stateFile || DEFAULT_STATE_FILE;
  const keywordSummary = new TaskKeywordExtractor(task, agentName).extract();
  const selectedPlugins = selectPlugins(task, agentName, keywordSummary);

  // Session stickiness: retain plugins from previous scope selection.
  // This prevents the catch-22 where:
  //   Turn 1: "deploy to staging" → includes opspal-salesforce
  //   Turn 2: "go ahead" → no SF keywords → drops opspal-salesforce → deadlock
  // Previously-selected plugins stay in scope until session ends or the user
  // explicitly changes topic to a different platform domain.
  const STICKY_EXPIRY_SECONDS = toNumber(process.env.TASK_SCOPE_STICKY_TTL, 600);
  try {
    const previousScope = loadScope(stateFile);
    if (previousScope && Array.isArray(previousScope.selectedPlugins)) {
      const prevTimestamp = previousScope.timestamp ? new Date(previousScope.timestamp).getTime() : 0;
      const ageSeconds = prevTimestamp > 0 ? (Date.now() - prevTimestamp) / 1000 : Infinity;

      if (ageSeconds < STICKY_EXPIRY_SECONDS) {
        for (const prevPlugin of previousScope.selectedPlugins) {
          if (prevPlugin !== 'opspal-core' && !selectedPlugins.includes(prevPlugin)) {
            selectedPlugins.push(prevPlugin);
          }
        }
      }
    }
  } catch (_e) {
    // Previous scope missing or corrupt — proceed without stickiness
  }

  // Respect routing enforcement — never suppress the plugin family that
  // routing requires. This prevents deadlocks where task-scope-selector
  // suppresses a plugin while a routing/governance hook requires an agent
  // from it (e.g. deploy-agent-context-check → sfdc-deployment-manager).
  const pendingRoute = readPendingRoutingState(sessionKey);
  if (pendingRoute) {
    const routeAgents = [
      pendingRoute.required_agent,
      pendingRoute.last_resolved_agent,
      ...(pendingRoute.clearance_agents || [])
    ].filter(Boolean);

    for (const agent of routeAgents) {
      const colonIdx = agent.indexOf(':');
      if (colonIdx !== -1) {
        const enforcedPlugin = agent.slice(0, colonIdx);
        if (enforcedPlugin && !selectedPlugins.includes(enforcedPlugin)) {
          selectedPlugins.push(enforcedPlugin);
        }
      }
    }
  }

  const suppressedPlugins = ALL_PLUGINS.filter((pluginName) => !selectedPlugins.includes(pluginName));
  const { selectedAssets, totals, caps } = selectAssets(selectedPlugins, task, agentName, keywordSummary, options);

  const scope = {
    version: 1,
    timestamp: new Date().toISOString(),
    cwd,
    sessionKey,
    task,
    agentName,
    keywords: keywordSummary,
    selectedPlugins,
    suppressedPlugins,
    selectedAssets,
    budgets: caps,
    totals
  };

  scope.summary = buildScopeSummary(scope);
  return scope;
}

function saveScope(scope, stateFile = DEFAULT_STATE_FILE) {
  ensureParentDir(stateFile);
  fs.writeFileSync(stateFile, JSON.stringify(scope, null, 2));
  return stateFile;
}

function clearScope(stateFile = DEFAULT_STATE_FILE) {
  if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }
}

function loadScope(stateFile = DEFAULT_STATE_FILE) {
  if (!fs.existsSync(stateFile)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}

function buildInputFromHookPayload(payload, args = {}) {
  return {
    task: args.task || extractTaskFromHookPayload(payload),
    agentName: args.agent || extractAgentFromHookPayload(payload),
    cwd: args.cwd || payload.cwd || process.cwd(),
    sessionKey: args['session-key'] || extractSessionKey(payload)
  };
}

function formatScope(scope, format) {
  switch (format) {
    case 'userprompt-context':
      return `${scope.summary.userPromptContext}\n`;
    case 'subagent-context':
      return `${scope.summary.subagentContext}\n`;
    case 'summary':
      return `${scope.summary.userPromptContext}\n`;
    case 'json':
    default:
      return `${JSON.stringify(scope, null, 2)}\n`;
  }
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const command = args._[0] || 'select';
  const stateFile = args['state-file'] || DEFAULT_STATE_FILE;

  if (command === 'clear') {
    clearScope(stateFile);
    process.stdout.write('{}\n');
    return;
  }

  if (command === 'load') {
    const scope = loadScope(stateFile);
    process.stdout.write(`${JSON.stringify(scope || {}, null, 2)}\n`);
    return;
  }

  let input;
  if (command === 'from-hook') {
    const payload = JSON.parse(readStdin() || '{}');
    input = buildInputFromHookPayload(payload, args);
  } else {
    input = {
      task: args.task || '',
      agentName: args.agent || '',
      cwd: args.cwd || process.cwd(),
      sessionKey: args['session-key'] || 'default-session'
    };
  }

  if (!input.task && !input.agentName) {
    process.stdout.write(command === 'select' ? '{}\n' : '\n');
    return;
  }

  const scope = buildScope(input, {
    pluginsRoot: args['plugins-root'],
    stateFile
  });

  if (args.save === '1' || args.save === 'true') {
    saveScope(scope, stateFile);
  }

  process.stdout.write(formatScope(scope, args.format || 'json'));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[task-scope-selector] ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_STATE_FILE,
  PLUGIN_POLICIES,
  buildScope,
  buildInputFromHookPayload,
  clearScope,
  loadScope,
  saveScope,
  selectPlugins
};
