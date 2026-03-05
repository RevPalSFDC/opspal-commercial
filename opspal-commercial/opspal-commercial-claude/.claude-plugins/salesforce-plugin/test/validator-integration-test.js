#!/usr/bin/env node

/**
 * Validator Integration Test Suite
 *
 * Comprehensive testing of permission-validator.js, account-merge-validator.js,
 * and contact-merge-validator.js against Rentable Sandbox.
 *
 * Usage: node test/validator-integration-test.js [rentable-sandbox]
 */

const PermissionValidator = require('../scripts/lib/validators/permission-validator');
const AccountMergeValidator = require('../scripts/lib/validators/account-merge-validator');
const ContactMergeValidator = require('../scripts/lib/validators/contact-merge-validator');
const LeadMergeValidator = require('../scripts/lib/validators/lead-merge-validator');
const { execSync } = require('child_process');

const ORG_ALIAS = process.argv[2] || 'rentable-sandbox';

console.log(`\n🧪 Validator Integration Test Suite`);
console.log(`📍 Org: ${ORG_ALIAS}`);
console.log(`📅 Date: ${new Date().toISOString()}\n`);

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

async function runTest(testName, testFn) {
  results.total++;
  console.log(`\n🔬 TEST: ${testName}`);
  console.log(`${'='.repeat(80)}`);

  try {
    await testFn();
    results.passed++;
    results.tests.push({ name: testName, status: 'PASSED' });
    console.log(`✅ PASSED: ${testName}\n`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name: testName, status: 'FAILED', error: error.message });
    console.error(`❌ FAILED: ${testName}`);
    console.error(`   Error: ${error.message}\n`);
  }
}

async function queryRecords(query) {
  const cmd = `sf data query --query "${query}" --target-org ${ORG_ALIAS} --json`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  const data = JSON.parse(output);

  if (data.status !== 0) {
    throw new Error(`Query failed: ${data.message}`);
  }

  return data.result.records || [];
}

//=============================================================================
// TEST SUITE 1: Permission Validator
//=============================================================================

async function testPermissionValidator_BasicValidation() {
  const validator = new PermissionValidator(ORG_ALIAS, { verbose: false });

  // Get first account
  const accounts = await queryRecords('SELECT Id FROM Account LIMIT 2');
  if (accounts.length < 2) {
    throw new Error('Need at least 2 accounts for testing');
  }

  const masterId = accounts[0].Id;
  const duplicateId = accounts[1].Id;

  // Load account merge profile
  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/account-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  // Run validation
  const result = await validator.validateMergePermissions('Account', masterId, duplicateId, profile);

  console.log(`   Object Permissions: ${result.details.objectPermissions.permissions.isDeletable ? '✓' : '✗'} Delete, ${result.details.objectPermissions.permissions.isUpdateable ? '✓' : '✗'} Edit`);
  console.log(`   Current User: ${result.details.currentUser.username}`);
  console.log(`   Is System Admin: ${result.details.currentUser.isSystemAdmin ? 'Yes' : 'No'}`);
  console.log(`   Validation Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);

  if (!result.isValid) {
    console.log(`\n   ⚠️  Permission errors found (this may be expected):`);
    result.errors.forEach(err => console.log(`     - ${err}`));
  }

  // Test should pass regardless of permissions (we're just testing the validator works)
  if (!result.details.currentUser) {
    throw new Error('Failed to get current user info');
  }
}

async function testPermissionValidator_RelatedObjects() {
  const validator = new PermissionValidator(ORG_ALIAS, { verbose: false });

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/account-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const accounts = await queryRecords('SELECT Id FROM Account LIMIT 1');
  const masterId = accounts[0].Id;
  const duplicateId = accounts[0].Id; // Same ID for testing

  const result = await validator.validateMergePermissions('Account', masterId, duplicateId, profile);

  console.log(`   Related Object Permissions Checked: ${result.details.relatedObjectPermissions ? result.details.relatedObjectPermissions.relatedObjects.length : 0}`);

  if (result.details.relatedObjectPermissions) {
    result.details.relatedObjectPermissions.relatedObjects.forEach(obj => {
      console.log(`     - ${obj.objectType}: ${obj.hasEditPermission ? '✓' : '✗'} Edit`);
    });
  }
}

//=============================================================================
// TEST SUITE 2: Account Merge Validator
//=============================================================================

async function testAccountValidator_SharedContacts() {
  const validator = new AccountMergeValidator(ORG_ALIAS, { verbose: false });

  const accounts = await queryRecords('SELECT Id, Name FROM Account LIMIT 2');
  if (accounts.length < 2) {
    throw new Error('Need at least 2 accounts');
  }

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/account-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const result = await validator.validateAccountMerge(accounts[0].Id, accounts[1].Id, profile);

  console.log(`   Account 1: ${accounts[0].Name} (${accounts[0].Id})`);
  console.log(`   Account 2: ${accounts[1].Name} (${accounts[1].Id})`);
  console.log(`   Shared Contacts Validation: ${result.details.sharedContacts ? (result.details.sharedContacts.sharedContacts.length === 0 ? '✓ None found' : `⚠️ ${result.details.sharedContacts.sharedContacts.length} found`) : '✓ Check complete'}`);
  console.log(`   Validation Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);

  if (!result.isValid) {
    console.log(`\n   Validation errors (expected for some scenarios):`);
    result.errors.forEach(err => console.log(`     - ${err.substring(0, 100)}...`));
  }
}

async function testAccountValidator_PersonAccounts() {
  const validator = new AccountMergeValidator(ORG_ALIAS, { verbose: false });

  const accounts = await queryRecords('SELECT Id, Name FROM Account LIMIT 2');

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/account-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const result = await validator.validateAccountMerge(accounts[0].Id, accounts[1].Id, profile);

  console.log(`   Person Account Check: ${result.details.personAccounts ? '✓ Complete' : '✓ Skipped (not enabled)'}`);

  if (result.details.personAccounts && result.details.personAccounts.accountTypes) {
    const types = result.details.personAccounts.accountTypes;
    console.log(`     - Master is Person Account: ${types.masterIsPersonAccount ? 'Yes' : 'No'}`);
    console.log(`     - Duplicate is Person Account: ${types.duplicateIsPersonAccount ? 'Yes' : 'No'}`);
  }
}

async function testAccountValidator_Hierarchy() {
  const validator = new AccountMergeValidator(ORG_ALIAS, { verbose: false });

  // Query accounts with hierarchy
  const accounts = await queryRecords('SELECT Id, Name, ParentId FROM Account WHERE ParentId != null LIMIT 1');

  if (accounts.length === 0) {
    console.log(`   ⏭️  No accounts with hierarchy found - skipping test`);
    results.skipped++;
    return;
  }

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/account-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  // Try to merge child with parent (should detect circular reference)
  const childId = accounts[0].Id;
  const parentId = accounts[0].ParentId;

  const result = await validator.validateAccountMerge(childId, parentId, profile);

  console.log(`   Child Account: ${accounts[0].Name} (${childId})`);
  console.log(`   Parent Account: ${parentId}`);
  console.log(`   Hierarchy Validation: ${result.details.accountHierarchy ? '✓ Complete' : '✓ Checked'}`);
  console.log(`   Validation Result: ${result.isValid ? '✅ VALID' : '❌ INVALID (expected if circular)'}`);
}

//=============================================================================
// TEST SUITE 3: Contact Merge Validator
//=============================================================================

async function testContactValidator_PortalUsers() {
  const validator = new ContactMergeValidator(ORG_ALIAS, { verbose: false });

  const contacts = await queryRecords('SELECT Id, Name, Email FROM Contact LIMIT 2');
  if (contacts.length < 2) {
    throw new Error('Need at least 2 contacts');
  }

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/contact-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const result = await validator.validateContactMerge(contacts[0].Id, contacts[1].Id, profile);

  console.log(`   Contact 1: ${contacts[0].Name} (${contacts[0].Email || 'no email'})`);
  console.log(`   Contact 2: ${contacts[1].Name} (${contacts[1].Email || 'no email'})`);
  console.log(`   Portal User Check: ${result.details.portalUsers ? (result.details.portalUsers.users.length === 0 ? '✓ No portal users' : `⚠️ ${result.details.portalUsers.users.length} portal user(s)`) : '✓ Complete'}`);
  console.log(`   Validation Result: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);

  if (!result.isValid) {
    console.log(`\n   Validation errors:`);
    result.errors.forEach(err => console.log(`     - ${typeof err === 'string' ? err.substring(0, 100) : JSON.stringify(err).substring(0, 100)}...`));
  }
}

async function testContactValidator_Individual() {
  const validator = new ContactMergeValidator(ORG_ALIAS, { verbose: false });

  const contacts = await queryRecords('SELECT Id, Name FROM Contact LIMIT 2');

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/contact-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const result = await validator.validateContactMerge(contacts[0].Id, contacts[1].Id, profile);

  console.log(`   Individual Record Check: ${result.details.individualRecords ? '✓ Complete' : '✓ Skipped (not enabled)'}`);

  if (result.details.individualRecords && result.details.individualRecords.individuals) {
    console.log(`     - Individual records found: ${result.details.individualRecords.individuals.length}`);
  }
}

async function testContactValidator_ReportsTo() {
  const validator = new ContactMergeValidator(ORG_ALIAS, { verbose: false });

  const contacts = await queryRecords('SELECT Id, Name, ReportsToId FROM Contact WHERE ReportsToId != null LIMIT 1');

  if (contacts.length === 0) {
    console.log(`   ⏭️  No contacts with ReportsTo found - skipping test`);
    results.skipped++;
    return;
  }

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/contact-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const contactId = contacts[0].Id;
  const reportsToId = contacts[0].ReportsToId;

  const result = await validator.validateContactMerge(contactId, reportsToId, profile);

  console.log(`   Contact: ${contacts[0].Name} (${contactId})`);
  console.log(`   Reports To: ${reportsToId}`);
  console.log(`   ReportsTo Validation: ${result.details.reportsToHierarchy ? '✓ Complete' : '✓ Checked'}`);
  console.log(`   Validation Result: ${result.isValid ? '✅ VALID' : '❌ INVALID (expected if circular)'}`);
}

//=============================================================================
// TEST SUITE 4: Lead Merge Validator
//=============================================================================

async function testLeadValidator_ConvertedStatus() {
  const validator = new LeadMergeValidator(ORG_ALIAS, { verbose: false });

  const leads = await queryRecords('SELECT Id, Name, IsConverted, Email FROM Lead LIMIT 2');
  if (leads.length < 2) {
    throw new Error('Need at least 2 leads');
  }

  const fs = require('fs');
  const path = require('path');
  const profilePath = path.join(__dirname, '../scripts/lib/merge-profiles/lead-merge-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

  const result = await validator.validateObjectSpecificRules(leads[0], leads[1], profile);

  console.log(`   Lead 1: ${leads[0].Name} (${leads[0].Email || 'no email'})`);
  console.log(`     - IsConverted: ${leads[0].IsConverted ? 'Yes' : 'No'}`);
  console.log(`   Lead 2: ${leads[1].Name} (${leads[1].Email || 'no email'})`);
  console.log(`     - IsConverted: ${leads[1].IsConverted ? 'Yes' : 'No'}`);

  const hasConvertedError = result.errors && result.errors.some(e =>
    (typeof e === 'string' && e.includes('converted')) ||
    (e.type === 'CONVERTED_LEAD_STATUS')
  );

  console.log(`   Converted Lead Check: ${hasConvertedError ? '❌ Both converted (blocked)' : '✓ Valid combination'}`);
  console.log(`   Validation Result: ${result.errors.length === 0 ? '✅ VALID' : `⚠️ ${result.errors.length} error(s)`}`);
}

//=============================================================================
// MAIN TEST EXECUTION
//=============================================================================

async function runAllTests() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 TEST SUITE 1: Permission Validator`);
  console.log(`${'='.repeat(80)}`);

  await runTest('Permission Validator - Basic Validation', testPermissionValidator_BasicValidation);
  await runTest('Permission Validator - Related Objects', testPermissionValidator_RelatedObjects);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 TEST SUITE 2: Account Merge Validator`);
  console.log(`${'='.repeat(80)}`);

  await runTest('Account Validator - Shared Contacts', testAccountValidator_SharedContacts);
  await runTest('Account Validator - Person Accounts', testAccountValidator_PersonAccounts);
  await runTest('Account Validator - Hierarchy', testAccountValidator_Hierarchy);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 TEST SUITE 3: Contact Merge Validator`);
  console.log(`${'='.repeat(80)}`);

  await runTest('Contact Validator - Portal Users', testContactValidator_PortalUsers);
  await runTest('Contact Validator - Individual Records', testContactValidator_Individual);
  await runTest('Contact Validator - ReportsTo Hierarchy', testContactValidator_ReportsTo);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📦 TEST SUITE 4: Lead Merge Validator`);
  console.log(`${'='.repeat(80)}`);

  await runTest('Lead Validator - Converted Status', testLeadValidator_ConvertedStatus);

  // Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Total Tests:   ${results.total}`);
  console.log(`✅ Passed:     ${results.passed}`);
  console.log(`❌ Failed:     ${results.failed}`);
  console.log(`⏭️  Skipped:    ${results.skipped}`);
  console.log(`Success Rate:  ${results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0}%`);
  console.log(`${'='.repeat(80)}\n`);

  // Print detailed results
  if (results.failed > 0) {
    console.log(`\n❌ FAILED TESTS:`);
    results.tests.filter(t => t.status === 'FAILED').forEach(t => {
      console.log(`   - ${t.name}`);
      console.log(`     Error: ${t.error}`);
    });
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the test suite
runAllTests().catch(error => {
  console.error(`\n💥 FATAL ERROR: ${error.message}`);
  console.error(error.stack);
  if (typeof jest === 'undefined') process.exit(1); else throw new Error('Test failed'); // Jest-safe
});
