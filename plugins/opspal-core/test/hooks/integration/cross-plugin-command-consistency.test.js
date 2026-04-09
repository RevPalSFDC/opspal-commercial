'use strict';

const fs = require('fs');
const path = require('path');

const { HookTester } = require('../runner');
const { RoutingIndexBuilder } = require('../../../scripts/lib/routing-index-builder');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGINS_ROOT = path.join(PROJECT_ROOT, 'plugins');

const HOOKS = {
  sfDispatcher: 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh',
  hubspotCurl: 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh',
  marketoCurl: 'plugins/opspal-marketo/hooks/pre-bash-marketo-api.sh',
  sfGovernance: 'plugins/opspal-salesforce/hooks/universal-agent-governance.sh',
  hsGovernance: 'plugins/opspal-hubspot/hooks/universal-agent-governance.sh',
  mkGovernance: 'plugins/opspal-marketo/hooks/universal-agent-governance.sh',
  monGovernance: 'plugins/opspal-monday/hooks/universal-agent-governance.sh'
};

const BASE_ENV = { HOOK_TEST_MODE: '1' };

const EXPECTED_COMMAND_COLLISIONS = [
  ['asana-link', ['opspal-core:asana-link', 'opspal-salesforce:asana-link']],
  ['asana-update', ['opspal-core:asana-update', 'opspal-salesforce:asana-update']],
  ['checkdependencies', [
    'opspal-core:checkdependencies',
    'opspal-hubspot:checkdependencies',
    'opspal-salesforce:checkdependencies'
  ]],
  ['dedup-companies', ['opspal-core:dedup-companies']],
  ['initialize', ['opspal-core:initialize', 'opspal-hubspot:initialize', 'opspal-salesforce:initialize']]
];

const REDIRECTED_CORE_COMMANDS = new Set([
  'asana-link',
  'asana-update',
  'checkdependencies',
  'initialize'
]);

const EXPECTED_HIGH_SIGNAL_KEYWORD_COLLISIONS = [
  ['sfdc hubspot dedup', [
    'opspal-core:sfdc-hubspot-dedup-orchestrator'
  ]]
];

jest.setTimeout(120000);

function hookExists(key) {
  const hookPath = HOOKS[key];
  const fullPath = path.isAbsolute(hookPath) ? hookPath : path.join(PROJECT_ROOT, hookPath);
  return fs.existsSync(fullPath);
}

function createTester(key) {
  return new HookTester(HOOKS[key], { timeout: 15000 });
}

function maybeTest(key, name, fn) {
  const runner = hookExists(key) ? test : test.skip;
  runner(name, fn);
}

function expectNotDenied(result, message) {
  expect(result.exitCode).toBe(0);
  const decision = result.output?.hookSpecificOutput?.permissionDecision
    || result.hookSpecificOutput?.permissionDecision;
  expect(decision).not.toBe('deny');
  if (result.parseError) {
    throw new Error(`${message}: ${result.parseError}`);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectCommandCollisions() {
  const commands = new Map();

  for (const plugin of fs.readdirSync(PLUGINS_ROOT).sort()) {
    const commandsDir = path.join(PLUGINS_ROOT, plugin, 'commands');
    if (!fs.existsSync(commandsDir)) {
      continue;
    }

    for (const file of fs.readdirSync(commandsDir).filter(name => name.endsWith('.md')).sort()) {
      const shortName = path.basename(file, '.md');
      const entries = commands.get(shortName) || [];
      entries.push({
        plugin,
        shortName,
        fullName: `${plugin}:${shortName}`,
        filePath: path.join(commandsDir, file)
      });
      commands.set(shortName, entries);
    }
  }

  return [...commands.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([shortName, entries]) => [
      shortName,
      entries.sort((a, b) => a.fullName.localeCompare(b.fullName))
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function buildRoutingIndexQuietly() {
  const builder = new RoutingIndexBuilder();
  const originalLog = console.log;
  const originalError = console.error;

  console.log = () => {};
  console.error = () => {};

  try {
    builder.build(PLUGINS_ROOT);
    return builder.getIndex();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function collectHighSignalKeywordCollisions(minWords = 3) {
  const routingIndex = buildRoutingIndexQuietly();

  return Object.entries(routingIndex.byKeywordFull)
    .map(([keyword, refs]) => [keyword, [...new Set(refs)].sort()])
    .filter(([keyword, refs]) => {
      const wordCount = keyword.trim().split(/\s+/).filter(Boolean).length;
      const pluginCount = new Set(
        refs.map(ref => ref.replace(/^command:/, '').split(':')[0])
      ).size;
      return wordCount >= minWords && pluginCount > 1;
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function toComparableCommandCollisions(collisions) {
  return collisions.map(([shortName, entries]) => [
    shortName,
    entries.map(entry => entry.fullName).sort()
  ]);
}

describe('Cross-plugin command consistency', () => {
  describe('hook isolation', () => {
    const deployCommand = 'sf project deploy start --source-dir force-app --target-org prod';
    const genericCommand = 'echo "hello world" | wc -l';
    const hsAgentInput = {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'opspal-hubspot:hubspot-contact-manager',
        prompt: 'Update contacts'
      }
    };
    const sfAgentInput = {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'sfdc-deployment-manager',
        prompt: 'Deploy metadata'
      }
    };

    maybeTest('hubspotCurl', 'SF deploy commands no-op against the HubSpot curl hook', async () => {
      const result = await createTester('hubspotCurl').run({
        input: { tool_name: 'Bash', tool_input: { command: deployCommand } },
        env: BASE_ENV
      });
      expectNotDenied(result, 'HubSpot curl hook should not evaluate Salesforce deploy commands');
    });

    maybeTest('marketoCurl', 'SF deploy commands no-op against the Marketo curl hook', async () => {
      const result = await createTester('marketoCurl').run({
        input: { tool_name: 'Bash', tool_input: { command: deployCommand } },
        env: BASE_ENV
      });
      expectNotDenied(result, 'Marketo curl hook should not evaluate Salesforce deploy commands');
    });

    maybeTest('sfDispatcher', 'HubSpot curl mutations no-op against the Salesforce dispatcher', async () => {
      const result = await createTester('sfDispatcher').run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d \'{}\''
          }
        },
        env: BASE_ENV
      });
      expectNotDenied(result, 'Salesforce dispatcher should not evaluate HubSpot curl mutations');
    });

    maybeTest('sfDispatcher', 'Marketo curl mutations no-op against the Salesforce dispatcher', async () => {
      const result = await createTester('sfDispatcher').run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d \'{"input":[]}\''
          }
        },
        env: BASE_ENV
      });
      expectNotDenied(result, 'Salesforce dispatcher should not evaluate Marketo curl mutations');
    });

    for (const [key, name] of [['sfDispatcher', 'Salesforce'], ['hubspotCurl', 'HubSpot'], ['marketoCurl', 'Marketo']]) {
      maybeTest(key, `Generic shell commands pass through the ${name} hook`, async () => {
        const result = await createTester(key).run({
          input: { tool_name: 'Bash', tool_input: { command: genericCommand } },
          env: BASE_ENV
        });
        expectNotDenied(result, `${name} hook should pass through generic shell commands`);
      });
    }

    maybeTest('sfGovernance', 'HubSpot agent spawns no-op against Salesforce governance', async () => {
      const result = await createTester('sfGovernance').run({
        input: hsAgentInput,
        env: BASE_ENV
      });
      expectNotDenied(result, 'Salesforce governance should pass through HubSpot agent spawns');
    });

    maybeTest('monGovernance', 'HubSpot agent spawns no-op against Monday governance', async () => {
      const result = await createTester('monGovernance').run({
        input: hsAgentInput,
        env: BASE_ENV
      });
      expectNotDenied(result, 'Monday governance should pass through HubSpot agent spawns');
    });

    for (const [key, name] of [['hsGovernance', 'HubSpot'], ['mkGovernance', 'Marketo'], ['monGovernance', 'Monday']]) {
      maybeTest(key, `Salesforce agent spawns no-op against ${name} governance`, async () => {
        const result = await createTester(key).run({
          input: sfAgentInput,
          env: BASE_ENV
        });
        expectNotDenied(result, `${name} governance should pass through Salesforce agent spawns`);
      });
    }
  });

  describe('registry consistency', () => {
    let commandCollisions;
    let highSignalKeywordCollisions;

    beforeAll(() => {
      commandCollisions = collectCommandCollisions();
      highSignalKeywordCollisions = collectHighSignalKeywordCollisions();
    });

    test('keeps short command collisions limited to the documented compatibility set', () => {
      expect(toComparableCommandCollisions(commandCollisions)).toEqual(EXPECTED_COMMAND_COLLISIONS);

      for (const [commandName, entries] of commandCollisions) {
        if (REDIRECTED_CORE_COMMANDS.has(commandName)) {
          for (const entry of entries.filter(item => item.plugin !== 'opspal-core')) {
            expect(readText(entry.filePath)).toContain(`/opspal-core:${commandName}`);
          }
          continue;
        }

        if (commandName === 'dedup-companies') {
          for (const entry of entries) {
            expect(readText(entry.filePath)).toContain('sfdc-hubspot-dedup-orchestrator');
          }
        }
      }
    });

    test('keeps exact high-signal runtime keyword collisions limited to the shared dedup alias', () => {
      expect(highSignalKeywordCollisions).toEqual(EXPECTED_HIGH_SIGNAL_KEYWORD_COLLISIONS);
    });
  });
});
