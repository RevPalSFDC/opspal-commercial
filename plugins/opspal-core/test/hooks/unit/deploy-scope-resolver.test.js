#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const {
  analyzeDeploymentScope,
  parseDeploymentCommand
} = require(path.join(
  PROJECT_ROOT,
  'plugins/opspal-salesforce/scripts/lib/deploy-scope-resolver.js'
));

function createFixtureProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-scope-resolver-'));
  fs.mkdirSync(path.join(root, 'force-app/main/default/flows'), { recursive: true });
  fs.mkdirSync(path.join(root, 'force-app/main/default/layouts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'force-app/main/default/objects/Account/quickActions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'manifest'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'force-app/main/default/flows/Broken.flow-meta.xml'),
    '<Flow><broken></Flow>',
    'utf8'
  );
  fs.writeFileSync(
    path.join(root, 'force-app/main/default/layouts/Account-Layout.layout-meta.xml'),
    '<Layout xmlns="http://soap.sforce.com/2006/04/metadata"></Layout>',
    'utf8'
  );
  fs.writeFileSync(
    path.join(root, 'force-app/main/default/objects/Account/quickActions/LogCall.quickAction-meta.xml'),
    '<QuickAction xmlns="http://soap.sforce.com/2006/04/metadata"></QuickAction>',
    'utf8'
  );
  fs.writeFileSync(
    path.join(root, 'manifest/package.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
      '  <types>',
      '    <members>Account-Layout</members>',
      '    <name>Layout</name>',
      '  </types>',
      '  <version>61.0</version>',
      '</Package>'
    ].join('\n'),
    'utf8'
  );

  return root;
}

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
  console.log('\n[Tests] deploy-scope-resolver\n');

  const results = [];

  results.push(await runTest('Parses env-prefixed deploy commands and source-dir lists', async () => {
    const parsed = parseDeploymentCommand(
      'SKIP_FLOW_VALIDATION=1 SF_TARGET_ORG=scratch sf project deploy start --source-dir force-app/main/default/layouts,force-app/main/default/objects/Account/quickActions'
    );

    assert.strictEqual(parsed.isDeployCommand, true, 'Should identify sf project deploy commands');
    assert.strictEqual(parsed.envAssignments.SKIP_FLOW_VALIDATION, '1', 'Should capture inline env assignments');
    assert.strictEqual(parsed.envAssignments.SF_TARGET_ORG, 'scratch', 'Should capture inline target org env');
    assert.deepStrictEqual(
      parsed.sourceDirs,
      [
        'force-app/main/default/layouts',
        'force-app/main/default/objects/Account/quickActions'
      ],
      'Should split comma-delimited source directories'
    );
  }));

  results.push(await runTest('Stages only the selected leaf source-dir', async () => {
    const projectRoot = createFixtureProject();
    try {
      const result = analyzeDeploymentScope(
        'sf project deploy start --source-dir force-app/main/default/layouts',
        projectRoot,
        { stage: true }
      );

      assert.strictEqual(result.usedDefaultScope, false, 'Explicit source-dir should not fall back to default scope');
      assert.strictEqual(result.selectedPaths.length, 1, 'Should select only the requested leaf directory');
      assert.strictEqual(result.flowFiles.length, 0, 'Leaf layout deploys should not pull in unrelated flows');
      assert.strictEqual(result.cleanupRequired, true, 'Leaf scopes should be staged into an isolated temp root');
      assert(
        fs.existsSync(path.join(result.scopeRoot, 'force-app/main/default/layouts/Account-Layout.layout-meta.xml')),
        'The staged scope should contain the requested layout metadata'
      );
      assert(
        !fs.existsSync(path.join(result.scopeRoot, 'force-app/main/default/flows/Broken.flow-meta.xml')),
        'The staged scope should exclude unrelated flow metadata'
      );

      fs.rmSync(result.scopeRoot, { recursive: true, force: true });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Resolves manifest deploys to the requested metadata only', async () => {
    const projectRoot = createFixtureProject();
    try {
      const result = analyzeDeploymentScope(
        'SF_TARGET_ORG=qa sf project deploy start --manifest manifest/package.xml',
        projectRoot
      );

      assert.strictEqual(result.targetOrg, 'qa', 'Should use inline target-org env when no flag is present');
      assert.strictEqual(result.flowFiles.length, 0, 'Layout-only manifests should not pull in unrelated flows');
      assert(
        result.selectedPaths.some((selectedPath) => selectedPath.endsWith('Account-Layout.layout-meta.xml')),
        'Should select the layout referenced in the manifest'
      );
      assert(
        result.selectedPaths.every((selectedPath) => !selectedPath.endsWith('Broken.flow-meta.xml')),
        'Should not select unrelated flow metadata from the project tree'
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
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
