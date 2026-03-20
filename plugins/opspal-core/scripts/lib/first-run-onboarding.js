#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { getLicenseFirstRunState } = require('./license-first-run');

const WORKSPACE_MARKERS = [
  { type: 'claude_md', relativePath: 'CLAUDE.md' },
  { type: 'claude_settings', relativePath: '.claude/settings.json' },
  { type: 'claude_local_settings', relativePath: '.claude/settings.local.json' }
];

function readJsonStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) {
      return {};
    }

    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? [...argv] : [];
  let action = 'status';

  if (args[0] && !args[0].startsWith('--')) {
    action = args.shift();
  }

  const options = {
    action,
    cwd: '',
    format: 'json'
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];

    if (token === '--cwd' && next && !next.startsWith('--')) {
      options.cwd = next;
      index += 1;
      continue;
    }

    if (token === '--format' && next && !next.startsWith('--')) {
      options.format = next;
      index += 1;
    }
  }

  return options;
}

function shellQuote(value) {
  const normalized = typeof value === 'string' ? value : '';
  return `'${normalized.replace(/'/g, `'\\''`)}'`;
}

function appendEnvVar(name, value) {
  if (!process.env.CLAUDE_ENV_FILE || !name) {
    return;
  }

  fs.appendFileSync(
    process.env.CLAUDE_ENV_FILE,
    `export ${name}=${shellQuote(String(value))}\n`,
    'utf8'
  );
}

function resolveSearchRoots(startCwd) {
  const resolved = path.resolve(startCwd || process.cwd());
  const roots = [];
  let current = resolved;

  while (!roots.includes(current)) {
    roots.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return roots;
}

function detectWorkspaceInitialization(startCwd) {
  const searchStart = path.resolve(startCwd || process.cwd());
  const searchRoots = resolveSearchRoots(searchStart);

  for (const root of searchRoots) {
    for (const marker of WORKSPACE_MARKERS) {
      const markerPath = path.join(root, marker.relativePath);
      if (fs.existsSync(markerPath)) {
        return {
          initialized: true,
          marker_type: marker.type,
          marker_path: markerPath,
          workspace_root: root,
          search_start: searchStart
        };
      }
    }
  }

  return {
    initialized: false,
    marker_type: '',
    marker_path: '',
    workspace_root: '',
    search_start: searchStart
  };
}

function buildSetupMode({ activationRequired, initializationRequired }) {
  if (activationRequired && initializationRequired) {
    return 'needs_activation_and_initialization';
  }

  if (activationRequired) {
    return 'needs_activation';
  }

  if (initializationRequired) {
    return 'needs_initialization';
  }

  return 'ready';
}

function buildVisibleMessage(state) {
  const steps = [];

  if (state.activation_required) {
    steps.push('run /activate-license <email> <license-key>');
  }

  if (state.initialization_required) {
    steps.push('run /initialize in this workspace');
  }

  if (steps.length === 0) {
    return '';
  }

  return `OpsPal setup is incomplete. Next: ${steps.join(', then ')}. Use /opspalfirst for a guided checklist.`;
}

function buildPromptContext(state) {
  if (state.mode === 'ready') {
    return '';
  }

  const stepList = state.next_steps.map((step, index) => `${index + 1}. ${step.label}`).join(' ');
  const workspaceNote = state.workspace.initialized
    ? `The workspace is already initialized at ${state.workspace.marker_path}.`
    : `No OpsPal workspace marker was found from ${state.workspace.search_start}; after activation, guide the user to run /initialize in the current workspace.`;

  return [
    `OpsPal onboarding is incomplete (mode=${state.mode}, license_status=${state.license.status}).`,
    `Before handling normal OpsPal work, guide the user through these setup steps in order: ${stepList}.`,
    workspaceNote,
    'If the user asks for unrelated work, reply with setup guidance first and do not begin normal OpsPal platform work until onboarding is complete.',
    'If they already provided activation inputs, help them use /activate-license. Once activation is valid, guide them to /initialize if the workspace is not initialized.'
  ].join(' ');
}

function buildNextSteps(activationRequired, initializationRequired) {
  const steps = [];

  if (activationRequired) {
    steps.push({
      id: 'activate_license',
      command: '/activate-license <email> <license-key>',
      label: 'Activate this machine with /activate-license <email> <license-key>.'
    });
  }

  if (initializationRequired) {
    steps.push({
      id: 'initialize_workspace',
      command: '/initialize',
      label: 'Initialize the current workspace with /initialize.'
    });
  }

  return steps;
}

function getOnboardingState(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const license = getLicenseFirstRunState();
  const workspace = detectWorkspaceInitialization(cwd);
  const activationRequired = license.mode !== 'already_activated';
  const initializationRequired = !workspace.initialized;
  const mode = buildSetupMode({ activationRequired, initializationRequired });
  const nextSteps = buildNextSteps(activationRequired, initializationRequired);

  return {
    mode,
    ready: mode === 'ready',
    activation_required: activationRequired,
    initialization_required: initializationRequired,
    visible_message: buildVisibleMessage({
      activation_required: activationRequired,
      initialization_required: initializationRequired
    }),
    prompt_context: '',
    next_steps: nextSteps,
    license,
    workspace
  };
}

function enrichState(state) {
  const enriched = {
    ...state,
    prompt_context: buildPromptContext(state)
  };

  return enriched;
}

function persistEnvironment(state) {
  appendEnvVar('OPSPAL_FIRST_RUN_MODE', state.mode);
  appendEnvVar('OPSPAL_FIRST_RUN_READY', state.ready ? '1' : '0');
  appendEnvVar('OPSPAL_LICENSE_STATUS', state.license.status || '');
  appendEnvVar('OPSPAL_LICENSE_ACTIVE', state.activation_required ? '0' : '1');
  appendEnvVar('OPSPAL_WORKSPACE_INITIALIZED', state.workspace.initialized ? '1' : '0');
  appendEnvVar('OPSPAL_WORKSPACE_MARKER_PATH', state.workspace.marker_path || '');
}

function buildSessionStartHookOutput(state, hookInput = {}) {
  const source = typeof hookInput.source === 'string' ? hookInput.source : '';

  if (source === 'clear' || source === 'compact' || state.ready) {
    return {};
  }

  return {
    suppressOutput: true,
    systemMessage: state.visible_message,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: state.prompt_context
    }
  };
}

function buildUserPromptHookOutput(state) {
  if (state.ready) {
    return {};
  }

  return {
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: state.prompt_context
    }
  };
}

function renderText(state) {
  const lines = [];

  lines.push('OpsPal First-Run Status');
  lines.push('=======================');
  lines.push(`Mode: ${state.mode}`);
  lines.push(`License status: ${state.license.status}`);

  if (state.license.mode === 'already_activated') {
    lines.push(`Activated tier: ${state.license.tier}`);
    if (state.license.organization) {
      lines.push(`Organization: ${state.license.organization}`);
    }
  } else {
    lines.push('License activation is required on this machine.');
  }

  if (state.workspace.initialized) {
    lines.push(`Workspace initialized: yes (${state.workspace.marker_path})`);
  } else {
    lines.push(`Workspace initialized: no (searched from ${state.workspace.search_start})`);
  }

  lines.push('');

  if (state.next_steps.length === 0) {
    lines.push('OpsPal is ready to use.');
  } else {
    lines.push('Next steps:');
    for (const step of state.next_steps) {
      lines.push(`- ${step.label}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const hookInput = options.action.startsWith('hook-') ? readJsonStdin() : {};
  const cwd = options.cwd || hookInput.cwd || process.cwd();
  const state = enrichState(getOnboardingState({ cwd }));

  if (options.action === 'hook-session-start') {
    persistEnvironment(state);
    process.stdout.write(JSON.stringify(buildSessionStartHookOutput(state, hookInput)));
    return;
  }

  if (options.action === 'hook-user-prompt') {
    process.stdout.write(JSON.stringify(buildUserPromptHookOutput(state)));
    return;
  }

  if (options.action === 'render' || options.format === 'text') {
    process.stdout.write(renderText(state));
    return;
  }

  process.stdout.write(`${JSON.stringify(state)}\n`);
}

module.exports = {
  WORKSPACE_MARKERS,
  buildPromptContext,
  buildSessionStartHookOutput,
  buildUserPromptHookOutput,
  detectWorkspaceInitialization,
  enrichState,
  getOnboardingState,
  renderText
};

if (require.main === module) {
  main();
}
