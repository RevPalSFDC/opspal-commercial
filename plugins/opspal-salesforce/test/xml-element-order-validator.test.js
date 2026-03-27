'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  validateFile,
  autofixFile
} = require('../scripts/lib/xml-element-order-validator');

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
  console.log('\n[Tests] xml-element-order-validator.js\n');

  const results = [];

  results.push(await runTest('Detects out-of-order metadata elements', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-order-test-'));
    const filePath = path.join(tempDir, 'Custom.permissionset-meta.xml');
    try {
      fs.writeFileSync(
        filePath,
        `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions>
        <enabled>true</enabled>
        <name>ViewSetup</name>
    </userPermissions>
    <label>Custom Permission Set</label>
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>false</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>false</modifyAllRecords>
        <object>Account</object>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>
</PermissionSet>
`,
        'utf8'
      );

      const result = await validateFile(filePath);
      assert.strictEqual(result.valid, false, 'Out-of-order XML should fail validation');
      assert.strictEqual(result.changed, true, 'Validator should report a canonical ordering change');
      assert.strictEqual(result.orderedKeys[0], 'label', 'Canonical order should place label first');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Autofix rewrites metadata files into canonical order', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xml-order-test-'));
    const filePath = path.join(tempDir, 'Custom.permissionset-meta.xml');
    try {
      fs.writeFileSync(
        filePath,
        `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <userPermissions>
        <enabled>true</enabled>
        <name>ViewSetup</name>
    </userPermissions>
    <label>Custom Permission Set</label>
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>false</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>false</modifyAllRecords>
        <object>Account</object>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>
</PermissionSet>
`,
        'utf8'
      );

      const result = await autofixFile(filePath);
      const updatedXml = fs.readFileSync(filePath, 'utf8');

      assert.strictEqual(result.changed, true, 'Autofix should rewrite out-of-order files');
      assert(
        updatedXml.indexOf('<label>Custom Permission Set</label>') < updatedXml.indexOf('<objectPermissions>'),
        'Label should move before objectPermissions'
      );
      assert(
        updatedXml.indexOf('<objectPermissions>') < updatedXml.indexOf('<userPermissions>'),
        'objectPermissions should move before userPermissions'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
