#!/usr/bin/env node

/**
 * Unit Tests for pre-picklist-dependency-validation.sh
 *
 * Verifies the hook loads and skips when not invoked as a deployment command.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { HookTester } = require('../runner');

const HOOK_PATH = 'plugins/opspal-salesforce/hooks/pre-picklist-dependency-validation.sh';

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

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
  console.log('\n[Tests] pre-picklist-dependency-validation.sh Tests\n');

  const tester = createTester();
  const results = [];
  const hookPath = tester.hookPath;

  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  results.push(await runTest('Skips when not a deployment command', async () => {
    const result = await tester.run({
      input: {}
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
  }));

  results.push(await runTest('Validates standard picklist deployment', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-picklist-'));
    const deployDir = path.join(tempRoot, 'force-app', 'main', 'default');
    const manifestDir = path.join(tempRoot, 'manifest');
    const fieldDir = path.join(deployDir, 'objects', 'Account', 'fields');
    fs.mkdirSync(fieldDir, { recursive: true });
    fs.mkdirSync(manifestDir, { recursive: true });

    const fieldPath = path.join(fieldDir, 'Test__c.field-meta.xml');
    fs.writeFileSync(
      fieldPath,
      [
        '<CustomField xmlns=\"http://soap.sforce.com/2006/04/metadata\">',
        '  <fullName>Test__c</fullName>',
        '  <label>Test</label>',
        '  <type>picklist</type>',
        '  <valueSet>',
        '    <valueSetDefinition>',
        '      <value>',
        '        <fullName>One</fullName>',
        '        <default>false</default>',
        '        <label>One</label>',
        '      </value>',
        '    </valueSetDefinition>',
        '  </valueSet>',
        '</CustomField>',
        ''
      ].join('\n'),
      'utf8'
    );

    const manifestPath = path.join(manifestDir, 'package.xml');
    fs.writeFileSync(
      manifestPath,
      [
        '<?xml version=\"1.0\" encoding=\"UTF-8\"?>',
        '<Package xmlns=\"http://soap.sforce.com/2006/04/metadata\">',
        '  <types>',
        '    <name>CustomField</name>',
        '    <members>Account.Test__c</members>',
        '  </types>',
        '  <version>62.0</version>',
        '</Package>',
        ''
      ].join('\n'),
      'utf8'
    );

    const runHook = () => new Promise((resolve, reject) => {
      const proc = spawn('bash', [
        hookPath,
        'sf project deploy start',
        '--manifest',
        manifestPath,
        '--source-dir',
        deployDir,
        '--target-org',
        'sandbox'
      ], {
        env: {
          ...process.env,
          HOOK_TEST_MODE: '1'
        }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });

      proc.on('close', code => resolve({ code, stdout, stderr }));
      proc.on('error', err => reject(err));
    });

    try {
      const result = await runHook();
      assert.strictEqual(result.code, 0, 'Should exit with 0');
      assert(
        result.stdout.includes('Picklist fields detected'),
        'Should detect picklist fields'
      );
      assert(
        result.stdout.includes('All picklist dependency validations passed'),
        'Should report successful validation'
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
