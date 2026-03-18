const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ParallelDeploymentPipeline
} = require('../parallel-deployment-pipeline');
const DeploymentSourceValidator = require('../deployment-source-validator');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-salesforce-path-fixes-'));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('resolveDeployTarget uses the object root for object-scoped metadata files', () => {
  const pipeline = new ParallelDeploymentPipeline('test-org', { dryRun: true });
  const file = path.join(
    'force-app',
    'main',
    'default',
    'objects',
    'Account',
    'fields',
    'Customer_Status__c.field-meta.xml'
  );

  const deployTarget = pipeline.resolveDeployTarget(file);

  assert.equal(
    deployTarget.split(path.sep).join('/'),
    'force-app/main/default/objects/Account'
  );
});

test('groupDeployTargets collapses sibling object metadata into one deploy target', () => {
  const pipeline = new ParallelDeploymentPipeline('test-org', { dryRun: true });
  const files = [
    path.join('force-app', 'main', 'default', 'objects', 'Account', 'fields', 'A.field-meta.xml'),
    path.join('force-app', 'main', 'default', 'objects', 'Account', 'validationRules', 'Rule.validationRule-meta.xml'),
    path.join('force-app', 'main', 'default', 'flows', 'MyFlow.flow-meta.xml')
  ];

  const groups = pipeline.groupDeployTargets(files);
  const normalizedTargets = groups.map(group => group.deployTarget.split(path.sep).join('/'));

  assert.equal(groups.length, 2);
  assert.deepEqual(normalizedTargets, [
    'force-app/main/default/objects/Account',
    'force-app/main/default/flows'
  ]);
  assert.deepEqual(groups[0].sourceFiles, files.slice(0, 2));
});

test('validateSourceDir accepts object leaf directories and warns about leaf-only scope', async () => {
  const projectRoot = makeTempDir();
  const leafDir = path.join(
    projectRoot,
    'force-app',
    'main',
    'default',
    'objects',
    'Account',
    'fields'
  );

  writeFile(path.join(projectRoot, 'sfdx-project.json'), '{"packageDirectories":[{"path":"force-app","default":true}],"namespace":"","sourceApiVersion":"61.0"}');
  writeFile(
    path.join(leafDir, 'Customer_Status__c.field-meta.xml'),
    '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"></CustomField>'
  );

  const validator = new DeploymentSourceValidator({ projectRoot });
  const result = await validator.validateSourceDir(leafDir);

  assert.equal(result.valid, true);
  assert.equal(result.metadata.found, true);
  assert.deepEqual(result.metadata.types, [
    {
      folder: 'fields',
      type: 'CustomObject',
      count: 1
    }
  ]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /leaf directory/i);
  assert.match(result.warnings[0], /objects\/Account\//);

  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('deploySingleFile dry run reports the normalized deploy target', async () => {
  const pipeline = new ParallelDeploymentPipeline('test-org', { dryRun: true });
  const file = path.join(
    'force-app',
    'main',
    'default',
    'objects',
    'Contact',
    'recordTypes',
    'Customer.recordType-meta.xml'
  );

  const result = await pipeline.deploySingleFile(file);

  assert.equal(result.success, true);
  assert.equal(
    result.deployTarget.split(path.sep).join('/'),
    'force-app/main/default/objects/Contact'
  );
  assert.deepEqual(result.sourceFiles, [file]);
});
