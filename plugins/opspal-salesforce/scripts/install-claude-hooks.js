#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const args = { dryRun: false, force: false, includeToolHooks: false, settingsPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--include-tool-hooks') {
      args.includeToolHooks = true;
    } else if (arg === '--settings') {
      args.settingsPath = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function loadSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  const raw = fs.readFileSync(settingsPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to parse settings JSON: ${error.message}`);
    process.exit(1);
  }
}

function buildHookConfig(includeToolHooks) {
  const pluginRootVar = '${CLAUDE_PLUGIN_ROOT}';
  const hooks = {
    SessionStart: {
      command: `bash ${pluginRootVar}/hooks/session-start-agent-reminder.sh`,
      timeout: 10000,
      description: 'Salesforce session start reminder'
    },
    UserPromptSubmit: {
      command: `HOOK_SCRIPT='${pluginRootVar}/hooks/user-prompt-submit-wrapper.sh' bash ${pluginRootVar}/hooks/hook-circuit-breaker.sh`,
      timeout: 10000,
      description: 'Salesforce prompt routing and pre-task checks'
    }
  };

  if (includeToolHooks) {
    hooks.PreToolUse = {
      command: `bash ${pluginRootVar}/hooks/pre-tool-use.sh`,
      timeout: 10000,
      description: 'Enforce agent tool restrictions'
    };
    hooks.PostToolUse = {
      command: `bash ${pluginRootVar}/hooks/post-sf-query-validation.sh`,
      timeout: 10000,
      description: 'Validate sf data query results'
    };
  }

  return hooks;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const settingsPath = args.settingsPath
    || process.env.CLAUDE_SETTINGS_PATH
    || path.join(os.homedir(), '.claude', 'settings.json');

  const settings = loadSettings(settingsPath);
  settings.hooks = settings.hooks || {};

  const hookConfig = buildHookConfig(args.includeToolHooks);
  const updatedHooks = [];

  Object.entries(hookConfig).forEach(([hookName, config]) => {
    if (!settings.hooks[hookName] || args.force) {
      settings.hooks[hookName] = config;
      updatedHooks.push(hookName);
    }
  });

  if (args.dryRun) {
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  if (updatedHooks.length === 0) {
    console.log('No hook changes applied (use --force to overwrite).');
  } else {
    console.log(`Updated hooks: ${updatedHooks.join(', ')}`);
  }
  console.log(`Settings written to ${settingsPath}`);
}

main();
