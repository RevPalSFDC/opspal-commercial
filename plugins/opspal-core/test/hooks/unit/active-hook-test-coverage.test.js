#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  validateReadWriteHookCoverage,
  validateRequiredPatternCoverage
} = require('../../../../../scripts/validate-active-hook-test-coverage.js');

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'active-hook-coverage-'));
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
  console.log('\n[Tests] validate-active-hook-test-coverage.js\n');

  const results = [];

  results.push(await runTest('Validates read/write hook semantic coverage from configured patterns', async () => {
    const tempRoot = createTempRoot();

    try {
      const testPath = path.join(tempRoot, 'hooks', 'sample-read-write.test.js');
      fs.mkdirSync(path.dirname(testPath), { recursive: true });
      fs.writeFileSync(testPath, `
        test('allows read-only operations', () => {
          assert('Allows read-only HubSpot GET requests');
        });
        test('blocks direct writes', () => {
          assert('Denies mutating HubSpot CRM curl requests in main context');
        });
      `);

      const report = {
        entries: [{
          hookPath: 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh',
          covered: true,
          matchedTests: ['hooks/sample-read-write.test.js']
        }]
      };

      const insufficient = validateReadWriteHookCoverage(report, {
        readWriteHooks: {
          'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh': {
            allowPatterns: ['Allows read-only HubSpot GET requests'],
            blockPatterns: ['Denies mutating HubSpot CRM curl requests in main context'],
            description: 'HubSpot API guard should test both allow and deny paths.'
          }
        }
      }, { baseDir: tempRoot });

      assert.deepStrictEqual(insufficient, [], 'Configured read/write patterns should be satisfied');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Reports missing production and sub-agent pattern coverage', async () => {
    const tempRoot = createTempRoot();

    try {
      const testPath = path.join(tempRoot, 'hooks', 'sample-production.test.js');
      fs.mkdirSync(path.dirname(testPath), { recursive: true });
      fs.writeFileSync(testPath, `
        test('mentions production only once', () => {
          assert('target-org production');
        });
      `);

      const report = {
        entries: [{
          hookPath: 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh',
          covered: true,
          matchedTests: ['hooks/sample-production.test.js']
        }]
      };

      const productionMissing = validateRequiredPatternCoverage(report, 'productionHooks', {
        productionHooks: {
          'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh': {
            requiredPatterns: ['production', 'sfdc-permission-orchestrator'],
            description: 'Production routing should mention operational enforcement.'
          }
        }
      }, { baseDir: tempRoot });

      assert.strictEqual(productionMissing.length, 1, 'Should report the missing production pattern');
      assert.strictEqual(productionMissing[0].missingPatterns[0], 'sfdc-permission-orchestrator');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
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
