'use strict';

const assert = require('assert');

const QuickActionManager = require('../scripts/lib/quick-action-manager');

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
  console.log('\n[Tests] quick-action-manager.js\n');

  const results = [];
  const manager = new QuickActionManager({ stage: 'test' });

  results.push(await runTest('Requires targetParentField for child-object Create actions', async () => {
    assert.throws(() => {
      manager.buildQuickActionXml({
        isGlobal: false,
        objectName: 'Account',
        namespacePrefix: null,
        developerName: 'Create_Opportunity',
        label: 'Create Opportunity',
        description: '',
        actionType: 'Create',
        targetObject: 'Opportunity',
        fields: []
      });
    }, /targetParentField/, 'Child-object Create actions should require targetParentField');
  }));

  results.push(await runTest('Includes targetParentField when provided', async () => {
    const xml = manager.buildQuickActionXml({
      isGlobal: false,
      objectName: 'Account',
      namespacePrefix: null,
      developerName: 'Create_Opportunity',
      label: 'Create Opportunity',
      description: '',
      actionType: 'Create',
      targetObject: 'Opportunity',
      targetParentField: 'AccountId',
      fields: []
    });

    assert(
      xml.includes('<targetParentField>AccountId</targetParentField>'),
      'Generated XML should include the targetParentField tag'
    );
    assert(
      xml.includes('<targetObject>Opportunity</targetObject>'),
      'Generated XML should retain the target object'
    );
  }));

  const passed = results.filter(result => result.passed).length;
  const failed = results.filter(result => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
