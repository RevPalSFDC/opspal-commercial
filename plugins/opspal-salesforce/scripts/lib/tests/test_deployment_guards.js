#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ParallelDeploymentPipeline = require('../parallel-deployment-pipeline');
const DeploymentSourceValidator = require('../deployment-source-validator');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-commercial-deploy-'));
}

async function testResolveDeployTarget() {
  const pipeline = new ParallelDeploymentPipeline('test-org', { dryRun: true });

  const objectFieldFile = '/tmp/force-app/main/default/objects/Account/fields/Test__c.field-meta.xml';
  const layoutFile = '/tmp/force-app/main/default/layouts/Account-Test.layout-meta.xml';

  assert.strictEqual(
    pipeline.resolveDeployTarget(objectFieldFile),
    '/tmp/force-app/main/default/objects/Account'
  );
  assert.strictEqual(
    pipeline.resolveDeployTarget(layoutFile),
    '/tmp/force-app/main/default/layouts'
  );
}

async function testGroupDeployTargets() {
  const pipeline = new ParallelDeploymentPipeline('test-org', { dryRun: true });
  const files = [
    '/tmp/force-app/main/default/objects/Account/fields/A.field-meta.xml',
    '/tmp/force-app/main/default/objects/Account/fields/B.field-meta.xml',
    '/tmp/force-app/main/default/layouts/Account-Test.layout-meta.xml'
  ];

  const grouped = pipeline.groupDeployTargets(files);

  assert.strictEqual(grouped.length, 2);
  const accountTarget = grouped.find((entry) => entry.deployTarget.endsWith('/objects/Account'));
  assert.ok(accountTarget);
  assert.strictEqual(accountTarget.sourceFiles.length, 2);
}

async function testSourceWarnings() {
  const tempDir = makeTempDir();
  const objectRoot = path.join(tempDir, 'force-app', 'main', 'default', 'objects', 'Account');
  const objectLeaf = path.join(objectRoot, 'fields');
  const fieldsFile = path.join(objectLeaf, 'Test__c.field-meta.xml');
  const projectFile = path.join(tempDir, 'sfdx-project.json');

  fs.mkdirSync(objectLeaf, { recursive: true });
  fs.writeFileSync(projectFile, JSON.stringify({ packageDirectories: [] }, null, 2));
  fs.writeFileSync(fieldsFile, '<CustomField xmlns="http://soap.sforce.com/2006/04/metadata"></CustomField>');

  const validator = new DeploymentSourceValidator({ projectRoot: tempDir });

  const leafResult = await validator.validateSourceDir(objectLeaf);
  assert.strictEqual(leafResult.valid, true);
  assert.ok(leafResult.warnings.some((warning) => warning.includes('objects/Account/')));

  const rootResult = await validator.validateSourceDir(objectRoot);
  assert.strictEqual(rootResult.valid, true);
  assert.ok(rootResult.warnings.every((warning) => !warning.includes('objects/Account/')));
}

async function main() {
  await testResolveDeployTarget();
  await testGroupDeployTargets();
  await testSourceWarnings();
  console.log('OK: deployment guard tests passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
