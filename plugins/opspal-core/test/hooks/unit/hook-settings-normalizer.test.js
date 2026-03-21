#!/usr/bin/env node

/**
 * Unit Tests for hook-settings-normalizer.js
 *
 * Validates stale root repair, duplicate cleanup, and matcher normalization
 * for project-level Claude hook settings.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');

const {
  normalizeProjectHookSettings
} = require('../../../scripts/lib/hook-settings-normalizer');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] hook-settings-normalizer.js Tests\n');

  const results = [];
  const projectRoot = '/tmp/opspal-release/opspal-internal-plugins';
  const legacyRoot = '/home/chris/Desktop/RevPal/Agents/opspal-internal-plugins';

  results.push(await runTest('Rewrites stale roots, corrects developer-tools paths, and drops duplicate stop hooks', async () => {
    const normalized = normalizeProjectHookSettings({
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/unified-router.sh`
              }
            ]
          },
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/unified-router.sh`
              },
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/routing-context-refresher.sh`
              }
            ]
          }
        ],
        Stop: [
          {
            matcher: 'sfdc-discovery',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-salesforce/hooks/post-discovery-field-dictionary.sh`
              }
            ]
          },
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/stop-session-silent-failure-summary.sh`
              }
            ]
          }
        ],
        SubagentStop: [
          {
            matcher: 'sfdc-discovery',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-salesforce/hooks/post-discovery-field-dictionary.sh`
              }
            ]
          }
        ],
        SessionStart: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/developer-tools-plugin/hooks/pre-session-dev-mode-check.sh`
              }
            ]
          }
        ]
      }
    }, { projectRoot });

    const userPromptGroups = normalized.hooks.UserPromptSubmit;
    assert.strictEqual(userPromptGroups.length, 1, 'UserPromptSubmit duplicates should collapse into one group');
    assert.strictEqual(userPromptGroups[0].hooks.length, 2, 'UserPromptSubmit should retain the unique routing hooks');
    assert(!Object.prototype.hasOwnProperty.call(userPromptGroups[0], 'matcher'), 'Ignored UserPromptSubmit matchers should be removed');
    assert.strictEqual(
      userPromptGroups[0].hooks[0].command,
      `${projectRoot}/plugins/opspal-core/hooks/unified-router.sh`,
      'UserPromptSubmit command should use the current project root'
    );

    const stopGroups = normalized.hooks.Stop;
    assert.strictEqual(stopGroups.length, 1, 'Stop hooks duplicated in SubagentStop should be removed');
    assert(!Object.prototype.hasOwnProperty.call(stopGroups[0], 'matcher'), 'Ignored Stop matcher should be removed');
    assert.strictEqual(
      stopGroups[0].hooks[0].command,
      `${projectRoot}/plugins/opspal-core/hooks/stop-session-silent-failure-summary.sh`,
      'Stop hook should use the current project root'
    );

    const sessionStartGroups = normalized.hooks.SessionStart;
    assert.strictEqual(sessionStartGroups.length, 1, 'SessionStart should retain one normalized group');
    assert(!Object.prototype.hasOwnProperty.call(sessionStartGroups[0], 'matcher'), 'Ignored SessionStart matcher should be removed');
    assert.strictEqual(
      sessionStartGroups[0].hooks[0].command,
      `${projectRoot}/dev-tools/developer-tools-plugin/hooks/pre-session-dev-mode-check.sh`,
      'Developer tools hooks should be rewritten to dev-tools/'
    );
  }));

  results.push(await runTest('Normalizes invalid argument-style matchers and drops migrated Task context hooks', async () => {
    const normalized = normalizeProjectHookSettings({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Task(*)',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/pre-task-agent-validator.sh`
              },
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/pre-task-template-injector.sh`
              }
            ]
          },
          {
            matcher: 'Bash(sf data query*)',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-salesforce/hooks/pre-bash-soql-validator.sh`
              }
            ]
          },
          {
            matcher: 'Agent',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/pre-task-runbook-reminder.sh`
              }
            ]
          }
        ],
        PostToolUse: [
          {
            matcher: 'Write(*SESSION_REFLECTION*)',
            hooks: [
              {
                type: 'command',
                command: `${legacyRoot}/plugins/opspal-core/hooks/post-reflect-strategy-update.sh`
              }
            ]
          }
        ]
      }
    }, { projectRoot });

    const preToolAgentGroup = normalized.hooks.PreToolUse.find((group) => group.matcher === 'Agent');
    assert(preToolAgentGroup, 'Legacy Task(*) should normalize to the live Agent matcher');
    assert.strictEqual(preToolAgentGroup.hooks.length, 1, 'Migrated agent context hooks should be removed from PreToolUse');
    assert(preToolAgentGroup.hooks[0].command.endsWith('/pre-task-agent-validator.sh'), 'Agent validator should remain');

    const preToolBashGroup = normalized.hooks.PreToolUse.find((group) => group.matcher === 'Bash');
    assert(preToolBashGroup, 'Argument-style Bash matcher should normalize to Bash');
    assert(preToolBashGroup.hooks[0].command.includes('sf data query'), 'Bash guard should inspect the original command text');
    assert(preToolBashGroup.hooks[0].command.includes('pre-bash-soql-validator.sh'), 'Guarded Bash command should still call the validator');

    const postToolWriteGroup = normalized.hooks.PostToolUse.find((group) => group.matcher === 'Write');
    assert(postToolWriteGroup, 'Write(*SESSION_REFLECTION*) should normalize to Write');
    assert(postToolWriteGroup.hooks[0].command.includes('SESSION_REFLECTION'), 'Write guard should inspect reflection paths');
    assert(postToolWriteGroup.hooks[0].command.includes('post-reflect-strategy-update.sh'), 'Guarded Write command should still call the reflect strategy hook');
  }));

  results.push(await runTest('Removes legacy persisted Bash deny rules from effective settings', async () => {
    const normalized = normalizeProjectHookSettings({
      permissions: {
        deny: [
          'Bash*',
          'Read',
          { toolName: 'Bash', ruleContent: '*' },
          { toolName: 'Write', ruleContent: 'SESSION_REFLECTION' }
        ]
      },
      hooks: {}
    }, { projectRoot });

    assert.deepStrictEqual(
      normalized.permissions.deny,
      [
        'Read',
        { toolName: 'Write', ruleContent: 'SESSION_REFLECTION' }
      ],
      'Legacy blanket Bash deny rules should be removed while preserving unrelated policy'
    );
  }));

  results.push(await runTest('Rewrites marketplace and cache plugin roots before Bash deduplication', async () => {
    const normalized = normalizeProjectHookSettings({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash(sf data query*)',
            hooks: [
              {
                type: 'command',
                command: '/home/chris/.claude/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-salesforce/hooks/pre-bash-soql-validator.sh'
              },
              {
                type: 'command',
                command: '/home/chris/.claude/plugins/cache/revpal-internal-plugins/opspal-salesforce/3.84.3/hooks/pre-bash-soql-validator.sh'
              }
            ]
          }
        ]
      }
    }, { projectRoot });

    const preToolBashGroup = normalized.hooks.PreToolUse.find((group) => group.matcher === 'Bash');
    assert(preToolBashGroup, 'Bash group should remain after normalization');
    assert.strictEqual(preToolBashGroup.hooks.length, 1, 'Equivalent marketplace/cache hooks should collapse into one normalized command');
    assert(
      preToolBashGroup.hooks[0].command.includes(`${projectRoot}/plugins/opspal-salesforce/hooks/pre-bash-soql-validator.sh`),
      'Normalized hook command should point to the current project plugin root'
    );
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const result of results.filter((entry) => !entry.passed)) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
