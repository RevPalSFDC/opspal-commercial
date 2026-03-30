'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createTempSalesforceProject } = require('../temp-salesforce-project');
const FLSAwareFieldDeployer = require('../fls-aware-field-deployer');
const FlowDeploymentManager = require('../flow-deployment-manager');
const FieldDeploymentManager = require('../field-deployment-manager');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-salesforce-temp-project-test-'));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFakeSf(t, stdout) {
  const fakeBinDir = makeTempDir();
  const logPath = path.join(fakeBinDir, 'sf-invocation.json');
  const fakeSfPath = path.join(fakeBinDir, 'sf');
  const previousPath = process.env.PATH;
  const previousLog = process.env.FAKE_SF_LOG;
  const previousStdout = process.env.FAKE_SF_STDOUT;
  const previousStderr = process.env.FAKE_SF_STDERR;
  const previousExitCode = process.env.FAKE_SF_EXIT_CODE;

  const script = `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function walk(rootDir, currentDir = rootDir, results = []) {
  if (!fs.existsSync(currentDir)) {
    return results;
  }
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walk(rootDir, absolutePath, results);
      return;
    }
    if (entry.isFile()) {
      results.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
    }
  });
  return results;
}

const logPayload = {
  cwd: process.cwd(),
  args: process.argv.slice(2),
  files: walk(process.cwd())
};

const projectFile = path.join(process.cwd(), 'sfdx-project.json');
if (fs.existsSync(projectFile)) {
  logPayload.projectConfig = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
}

fs.writeFileSync(process.env.FAKE_SF_LOG, JSON.stringify(logPayload, null, 2));
process.stdout.write(process.env.FAKE_SF_STDOUT || '');
process.stderr.write(process.env.FAKE_SF_STDERR || '');
process.exit(Number(process.env.FAKE_SF_EXIT_CODE || 0));
`;

  writeFile(fakeSfPath, script);
  fs.chmodSync(fakeSfPath, 0o755);

  process.env.PATH = `${fakeBinDir}${path.delimiter}${previousPath}`;
  process.env.FAKE_SF_LOG = logPath;
  process.env.FAKE_SF_STDOUT = stdout;
  process.env.FAKE_SF_STDERR = '';
  process.env.FAKE_SF_EXIT_CODE = '0';

  t.after(() => {
    process.env.PATH = previousPath;

    if (previousLog === undefined) {
      delete process.env.FAKE_SF_LOG;
    } else {
      process.env.FAKE_SF_LOG = previousLog;
    }

    if (previousStdout === undefined) {
      delete process.env.FAKE_SF_STDOUT;
    } else {
      process.env.FAKE_SF_STDOUT = previousStdout;
    }

    if (previousStderr === undefined) {
      delete process.env.FAKE_SF_STDERR;
    } else {
      process.env.FAKE_SF_STDERR = previousStderr;
    }

    if (previousExitCode === undefined) {
      delete process.env.FAKE_SF_EXIT_CODE;
    } else {
      process.env.FAKE_SF_EXIT_CODE = previousExitCode;
    }

    fs.rmSync(fakeBinDir, { recursive: true, force: true });
  });

  return {
    readInvocation() {
      return JSON.parse(fs.readFileSync(logPath, 'utf8'));
    }
  };
}

test('createTempSalesforceProject writes a force-app package directory scaffold', () => {
  const project = createTempSalesforceProject('unit-test');

  try {
    const fieldPath = project.writeMetadataFile(
      path.join('objects', 'Account', 'fields', 'Customer_Status__c.field-meta.xml'),
      '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"></CustomField>'
    );
    const config = JSON.parse(fs.readFileSync(project.projectFile, 'utf8'));

    assert.deepEqual(config.packageDirectories, [{ path: 'force-app', default: true }]);
    assert.equal(config.sourceApiVersion, '62.0');
    assert.ok(fs.existsSync(fieldPath));
    assert.ok(project.listFiles().includes('force-app/main/default/objects/Account/fields/Customer_Status__c.field-meta.xml'));
  } finally {
    project.cleanup();
  }
});

test('FLSAwareFieldDeployer deploys from a temp Salesforce project rooted at force-app', async (t) => {
  const fakeSf = createFakeSf(
    t,
    JSON.stringify({
      status: 0,
      result: {
        id: '0Af-test',
        deployedSource: [{ fullName: 'Account.Customer_Status__c' }]
      }
    })
  );

  const deployer = new FLSAwareFieldDeployer({
    orgAlias: 'test-org',
    verbose: false
  });

  const result = await deployer.deployBundled(
    'Account',
    { fullName: 'Customer_Status__c', type: 'Text', length: 255 },
    '<?xml version="1.0" encoding="UTF-8"?><CustomField xmlns="http://soap.sforce.com/2006/04/metadata"></CustomField>',
    '<?xml version="1.0" encoding="UTF-8"?><PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata"></PermissionSet>'
  );

  const invocation = fakeSf.readInvocation();

  assert.equal(result.success, true);
  assert.deepEqual(invocation.projectConfig.packageDirectories, [{ path: 'force-app', default: true }]);
  assert.deepEqual(invocation.args.slice(0, 7), [
    'project',
    'deploy',
    'start',
    '--source-dir',
    'force-app',
    '--target-org',
    'test-org'
  ]);
  assert.ok(invocation.files.includes('force-app/main/default/objects/Account/fields/Customer_Status__c.field-meta.xml'));
  assert.ok(invocation.files.includes('force-app/main/default/permissionsets/AgentAccess.permissionset-meta.xml'));
});

test('FieldDeploymentManager deploys field metadata from a temp Salesforce project', async (t) => {
  const fakeSf = createFakeSf(
    t,
    JSON.stringify({
      status: 0,
      result: {
        id: '0Af-field-test'
      }
    })
  );

  const manager = new FieldDeploymentManager({
    orgAlias: 'test-org',
    verbose: false
  });

  const result = await manager.deployFieldMetadata('Market__c', {
    fullName: 'State__c',
    type: 'Text',
    length: 80
  });

  const invocation = fakeSf.readInvocation();

  assert.equal(result.success, true);
  assert.deepEqual(invocation.projectConfig.packageDirectories, [{ path: 'force-app', default: true }]);
  assert.deepEqual(invocation.args.slice(0, 7), [
    'project',
    'deploy',
    'start',
    '--source-dir',
    'force-app',
    '--target-org',
    'test-org'
  ]);
  assert.ok(invocation.files.includes('force-app/main/default/objects/Market__c/fields/State__c.field-meta.xml'));
});

test('FlowDeploymentManager stages a flow inside a temp Salesforce project before deploy', async (t) => {
  const fakeSf = createFakeSf(t, 'deployment ok');
  const tempDir = makeTempDir();
  const flowPath = path.join(tempDir, 'Deploy_State_Flow.flow-meta.xml');

  writeFile(
    flowPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
  <apiVersion>62.0</apiVersion>
  <label>Deploy State Flow</label>
  <processType>AutoLaunchedFlow</processType>
  <status>Draft</status>
</Flow>`
  );

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const manager = new FlowDeploymentManager('test-org', {
    verbose: false,
    workingDir: tempDir
  });

  const result = await manager.executeDeploy(flowPath, {
    activateOnDeploy: false,
    runTests: true
  });

  const invocation = fakeSf.readInvocation();

  assert.equal(result.success, true);
  assert.deepEqual(invocation.projectConfig.packageDirectories, [{ path: 'force-app', default: true }]);
  assert.deepEqual(invocation.args.slice(0, 9), [
    'project',
    'deploy',
    'start',
    '--source-dir',
    'force-app',
    '--target-org',
    'test-org',
    '--test-level',
    'RunLocalTests'
  ]);
  assert.ok(invocation.files.includes('force-app/main/default/flows/Deploy_State_Flow.flow-meta.xml'));
});
