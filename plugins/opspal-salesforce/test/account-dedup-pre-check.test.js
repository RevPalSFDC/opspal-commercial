'use strict';

process.emitWarning = () => {};

const assert = require('assert');

const {
  getSearchToken,
  findPotentialDuplicateAccounts
} = require('../scripts/lib/account-dedup-pre-check');

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
  console.log('\n[Tests] account-dedup-pre-check.js\n');

  const results = [];

  results.push(await runTest('Generates a stable search token from company names', async () => {
    assert.strictEqual(getSearchToken('Acme Corporation'), 'Acme');
    assert.strictEqual(getSearchToken('RevPal LLC'), 'RevPal');
  }));

  results.push(await runTest('Flags exact duplicate Account names above the 85% threshold', async () => {
    const resultsForAccounts = findPotentialDuplicateAccounts(
      [
        { Name: 'Acme Corporation', Website: 'https://acme.com' }
      ],
      [
        { Id: '001A', Name: 'Acme Corporation', Website: 'https://acme.com' }
      ],
      { threshold: 85 }
    );

    assert.strictEqual(resultsForAccounts.length, 1);
    assert.strictEqual(resultsForAccounts[0].matches.length, 1, 'Exact duplicates should be returned as matches');
    assert(resultsForAccounts[0].matches[0].confidence >= 85, 'Exact duplicates should exceed the configured threshold');
  }));

  results.push(await runTest('Uses contact email domains for multi-domain duplicate boosts', async () => {
    const resultsForAccounts = findPotentialDuplicateAccounts(
      [
        { Name: 'Acme Corporation', Website: 'https://acme.com' }
      ],
      [
        {
          Id: '001B',
          Name: 'Acme Corporation',
          Website: 'https://acme.co',
          contacts: [
            { Email: 'ops@acme.com' },
            { Email: 'sales@acme.co' }
          ]
        }
      ],
      { threshold: 85 }
    );

    assert.strictEqual(resultsForAccounts.length, 1);
    assert.strictEqual(resultsForAccounts[0].matches.length, 1, 'Related Accounts should match when contact domains overlap');
    assert.strictEqual(resultsForAccounts[0].matches[0].domainMatch, 'MULTI_DOMAIN_MATCH');
    assert(resultsForAccounts[0].matches[0].matchedDomains.includes('acme.com'), 'Shared contact domains should be captured');
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
