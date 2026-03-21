#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const { HookMerger } = require(path.join(
  __dirname,
  '../../../scripts/lib/hook-merger.js'
));

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] hook-merger.js\n');

  const results = [];

  results.push(await runTest('Prunes stale Salesforce Bash hooks while retaining dispatcher entries', async () => {
    const merger = new HookMerger({
      projectSettingsPath: path.join(PROJECT_ROOT, '.claude', 'settings.json')
    });
    const salesforceRoot = path.join(PROJECT_ROOT, 'plugins', 'opspal-salesforce');

    const merged = merger.mergeHooks({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash(sf data query*)',
            hooks: [
              {
                type: 'command',
                command: '/home/chris/.claude/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-salesforce/hooks/pre-bash-soql-validator.sh'
              }
            ]
          },
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: '/home/chris/.claude/plugins/cache/revpal-internal-plugins/opspal-salesforce/3.84.3/hooks/pre-bash-dispatcher.sh'
              }
            ]
          }
        ],
        PostToolUse: [
          {
            matcher: 'Bash(sf sobject describe*)',
            hooks: [
              {
                type: 'command',
                command: '/home/chris/.claude/plugins/cache/revpal-internal-plugins/opspal-salesforce/3.84.3/hooks/post-bash-error-handler.sh'
              }
            ]
          },
          {
            matcher: 'Bash',
            hooks: [
              {
                type: 'command',
                command: '/home/chris/.claude/plugins/marketplaces/revpal-internal-plugins/plugins/opspal-salesforce/hooks/post-bash-dispatcher.sh'
              }
            ]
          }
        ]
      }
    }, [
      {
        name: 'opspal-salesforce',
        path: salesforceRoot,
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                {
                  type: 'command',
                  command: '${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash-dispatcher.sh'
                }
              ]
            }
          ],
          PostToolUse: [
            {
              matcher: 'Bash',
              hooks: [
                {
                  type: 'command',
                  command: '${CLAUDE_PLUGIN_ROOT}/hooks/post-bash-dispatcher.sh'
                }
              ]
            }
          ]
        }
      }
    ]);

    const preToolBashGroup = merged.hooks.PreToolUse.find((group) => group.matcher === 'Bash');
    const postToolBashGroup = merged.hooks.PostToolUse.find((group) => group.matcher === 'Bash');

    assert(preToolBashGroup, 'PreToolUse Bash group should remain');
    assert(postToolBashGroup, 'PostToolUse Bash group should remain');
    assert.strictEqual(preToolBashGroup.hooks.length, 1, 'Only the dispatcher should remain for PreToolUse Bash');
    assert.strictEqual(postToolBashGroup.hooks.length, 1, 'Only the dispatcher should remain for PostToolUse Bash');
    assert(
      preToolBashGroup.hooks[0].command.includes('/plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh'),
      'PreToolUse Bash should retain the dispatcher'
    );
    assert(
      postToolBashGroup.hooks[0].command.includes('/plugins/opspal-salesforce/hooks/post-bash-dispatcher.sh'),
      'PostToolUse Bash should retain the dispatcher'
    );
    assert.strictEqual(merger.stats.hooksPruned, 2, 'Two stale Bash hooks should be pruned');
    assert(!JSON.stringify(merged).includes('pre-bash-soql-validator.sh'), 'Stale direct pre-Bash hook should be removed');
    assert(!JSON.stringify(merged).includes('post-bash-error-handler.sh'), 'Stale direct post-Bash hook should be removed');
  }));

  results.push(await runTest('Keeps installed runtime hook roots when merging into a non-repo workspace', async () => {
    const workspaceRoot = '/mnt/c/Users/cnace/RevPal/workspace';
    const runtimeCoreRoot = path.join(PROJECT_ROOT, 'plugins', 'opspal-core');
    const runtimeSalesforceRoot = path.join(PROJECT_ROOT, 'plugins', 'opspal-salesforce');
    const merger = new HookMerger({
      projectSettingsPath: path.join(workspaceRoot, '.claude', 'settings.json')
    });

    const merged = merger.mergeHooks({
      hooks: {
        Stop: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `${workspaceRoot}/plugins/opspal-core/hooks/session-end.sh`
              }
            ]
          }
        ]
      }
    }, [
      {
        name: 'opspal-core',
        path: runtimeCoreRoot,
        hooks: {
          Stop: [
            {
              matcher: '*',
              hooks: [
                {
                  type: 'command',
                  command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-end.sh'
                }
              ]
            }
          ]
        }
      },
      {
        name: 'opspal-salesforce',
        path: runtimeSalesforceRoot,
        hooks: {
          Stop: [
            {
              matcher: 'sfdc-discovery',
              hooks: [
                {
                  type: 'command',
                  command: '${CLAUDE_PLUGIN_ROOT}/hooks/post-discovery-field-dictionary.sh'
                }
              ]
            }
          ]
        }
      }
    ]);

    const stopGroups = merged.hooks.Stop;
    assert.strictEqual(stopGroups.length, 1, 'Stop hooks should collapse into one normalized group');
    assert(
      stopGroups.some((group) => group.hooks.some((hook) => hook.command === `${runtimeCoreRoot}/hooks/session-end.sh`)),
      'Core Stop hooks should resolve to the installed runtime root'
    );
    assert(
      stopGroups.some((group) => group.hooks.some((hook) => hook.command === `${runtimeSalesforceRoot}/hooks/post-discovery-field-dictionary.sh`)),
      'Salesforce Stop hooks should resolve to the installed runtime root'
    );
    assert(!JSON.stringify(merged).includes(`${workspaceRoot}/plugins/opspal-core/hooks/session-end.sh`), 'Workspace plugin paths should not survive in non-repo workspaces');
  }));

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
