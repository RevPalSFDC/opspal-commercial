#!/usr/bin/env node
/**
 * Verify Contact Identities
 *
 * Prevents stale data issues by re-querying Contact IDs from Salesforce before final actions.
 * Fails loudly when Contact ID doesn't match expected name/email.
 *
 * Problem Solved:
 * - Analysis scripts may use cached/intermediate JSON files with stale Contact IDs
 * - Contact ID "0032A00002az0e8QAA" expected to be "Emily Moser" but returned "Kelly Johnston"
 * - Without verification, wrong contacts could be updated/deleted
 *
 * Usage:
 *   node scripts/lib/verify-contact-identities.js <org-alias> <verification-file.json>
 *   node scripts/lib/verify-contact-identities.js <org-alias> --inline '[{...}]'
 *
 * Examples:
 *   # Verify from file
 *   node scripts/lib/verify-contact-identities.js rentable-production contacts-to-verify.json
 *
 *   # Inline verification
 *   node scripts/lib/verify-contact-identities.js rentable-production --inline '[{"contactId":"003...", "expectedName":"John Smith", "expectedEmail":"john@example.com"}]'
 *
 * Input Format (JSON):
 *   [
 *     {
 *       "contactId": "0032A00002az0e8QAA",
 *       "expectedName": "Emily Moser",      // Optional
 *       "expectedEmail": "emily@example.com" // Optional
 *     }
 *   ]
 */

const { execSync } = require('child_process');
const fs = require('fs');

class ContactIdentityVerifier {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.failFast = options.failFast !== false; // Default true
    this.strictMode = options.strictMode !== false; // Default true
  }

  /**
   * Query Salesforce for actual contact details
   */
  queryContacts(contactIds) {
    console.log(`\n🔍 Querying ${contactIds.length} contacts from Salesforce...`);

    const chunks = [];
    const chunkSize = 50; // SOQL IN clause safe limit

    for (let i = 0; i < contactIds.length; i += chunkSize) {
      chunks.push(contactIds.slice(i, i + chunkSize));
    }

    const allContacts = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const idList = chunk.map(id => `'${id}'`).join(',');
      const query = `SELECT Id, FirstName, LastName, Email, Account.Name FROM Contact WHERE Id IN (${idList})`;

      try {
        const result = execSync(
          `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
          { encoding: 'utf-8' }
        );

        const parsed = JSON.parse(result);
        const contacts = parsed.result?.records || [];
        allContacts.push(...contacts);

        console.log(`   Chunk ${i + 1}/${chunks.length}: ${contacts.length} contacts retrieved`);

      } catch (error) {
        console.error(`   ❌ Chunk ${i + 1} query failed: ${error.message}`);
        if (this.failFast) throw error;
      }
    }

    console.log(`   ✅ Total contacts retrieved: ${allContacts.length}`);
    return allContacts;
  }

  /**
   * Normalize name for comparison (handles case, extra spaces, null)
   */
  normalizeName(firstName, lastName) {
    const first = (firstName || '').trim().toLowerCase();
    const last = (lastName || '').trim().toLowerCase();
    return `${first} ${last}`.trim();
  }

  /**
   * Compare expected vs actual contact details
   */
  verifyContact(expected, actual) {
    const issues = [];

    // Check if contact exists
    if (!actual) {
      issues.push({
        type: 'NOT_FOUND',
        severity: 'CRITICAL',
        message: `Contact ID ${expected.contactId} not found in Salesforce`,
        expected: expected.contactId,
        actual: null
      });
      return { valid: false, issues };
    }

    // Verify name if provided
    if (expected.expectedName) {
      const expectedNormalized = this.normalizeName(
        expected.expectedName.split(' ')[0],
        expected.expectedName.split(' ').slice(1).join(' ')
      );
      const actualNormalized = this.normalizeName(actual.FirstName, actual.LastName);

      if (expectedNormalized !== actualNormalized) {
        issues.push({
          type: 'NAME_MISMATCH',
          severity: 'CRITICAL',
          message: `Name mismatch for ${expected.contactId}`,
          expected: expected.expectedName,
          actual: `${actual.FirstName || ''} ${actual.LastName || ''}`.trim()
        });
      }
    }

    // Verify email if provided
    if (expected.expectedEmail) {
      const expectedEmail = expected.expectedEmail.toLowerCase().trim();
      const actualEmail = (actual.Email || '').toLowerCase().trim();

      if (expectedEmail !== actualEmail) {
        issues.push({
          type: 'EMAIL_MISMATCH',
          severity: this.strictMode ? 'CRITICAL' : 'WARNING',
          message: `Email mismatch for ${expected.contactId}`,
          expected: expected.expectedEmail,
          actual: actual.Email
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      contact: actual
    };
  }

  /**
   * Verify all contacts in batch
   */
  verifyAll(expectedContacts) {
    console.log('\n🔐 Contact Identity Verification');
    console.log(`Organization: ${this.orgAlias}`);
    console.log(`Contacts to Verify: ${expectedContacts.length}`);
    console.log(`Mode: ${this.strictMode ? 'STRICT' : 'LENIENT'}`);

    // Step 1: Query all contacts from Salesforce
    const contactIds = expectedContacts.map(c => c.contactId);
    const actualContacts = this.queryContacts(contactIds);

    // Create lookup map
    const contactMap = {};
    actualContacts.forEach(c => {
      contactMap[c.Id] = c;
    });

    // Step 2: Verify each contact
    console.log('\n📋 Verification Results:');
    console.log('='.repeat(80));

    const results = [];
    let criticalCount = 0;
    let warningCount = 0;

    expectedContacts.forEach((expected, idx) => {
      const actual = contactMap[expected.contactId];
      const verification = this.verifyContact(expected, actual);

      results.push({
        contactId: expected.contactId,
        ...verification
      });

      // Print result
      const status = verification.valid ? '✅' : '❌';
      console.log(`\n[${idx + 1}/${expectedContacts.length}] ${status} ${expected.contactId}`);

      if (verification.valid) {
        console.log(`   Name: ${actual.FirstName} ${actual.LastName}`);
        console.log(`   Email: ${actual.Email}`);
        console.log(`   Status: VERIFIED`);
      } else {
        verification.issues.forEach(issue => {
          const icon = issue.severity === 'CRITICAL' ? '🔴' : '⚠️';
          console.log(`   ${icon} ${issue.type}: ${issue.message}`);
          console.log(`      Expected: ${issue.expected}`);
          console.log(`      Actual: ${issue.actual}`);

          if (issue.severity === 'CRITICAL') criticalCount++;
          else warningCount++;
        });
      }
    });

    // Step 3: Summary
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Contacts: ${expectedContacts.length}`);
    console.log(`✅ Verified: ${results.filter(r => r.valid).length}`);
    console.log(`❌ Failed: ${results.filter(r => !r.valid).length}`);
    console.log(`🔴 Critical Issues: ${criticalCount}`);
    console.log(`⚠️  Warnings: ${warningCount}`);
    console.log('='.repeat(80));

    // Step 4: Fail if critical issues found
    const hasCriticalIssues = results.some(r =>
      r.issues?.some(i => i.severity === 'CRITICAL')
    );

    if (hasCriticalIssues && this.failFast) {
      console.error('\n❌ VERIFICATION FAILED - Critical identity mismatches detected');
      console.error('   DO NOT proceed with operations using these Contact IDs');
      console.error('   Re-query Salesforce using email/name patterns to find correct IDs');
      throw new Error('Contact identity verification failed');
    }

    return {
      success: !hasCriticalIssues,
      verified: results.filter(r => r.valid).length,
      failed: results.filter(r => !r.valid).length,
      criticalIssues: criticalCount,
      warnings: warningCount,
      results
    };
  }

  /**
   * Generate verification report
   */
  generateReport(verificationResults, outputFile) {
    const report = {
      org: this.orgAlias,
      timestamp: new Date().toISOString(),
      summary: {
        total: verificationResults.results.length,
        verified: verificationResults.verified,
        failed: verificationResults.failed,
        criticalIssues: verificationResults.criticalIssues,
        warnings: verificationResults.warnings
      },
      details: verificationResults.results
    };

    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${outputFile}`);

    return report;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node verify-contact-identities.js <org-alias> <input-file.json>
   OR: node verify-contact-identities.js <org-alias> --inline '[{...}]'

Options:
  --lenient               Allow email mismatches (warnings instead of errors)
  --continue-on-error     Continue verification even if issues found
  --output <file>         Save verification report to file
  --help                  Show this help message

Input Format (JSON):
  [
    {
      "contactId": "0032A00002az0e8QAA",
      "expectedName": "Emily Moser",          // Optional but recommended
      "expectedEmail": "emily@example.com"     // Optional but recommended
    }
  ]

Examples:
  # Verify from file (strict mode)
  node verify-contact-identities.js rentable-production contacts.json

  # Inline verification
  node verify-contact-identities.js rentable-production --inline '[{"contactId":"003...","expectedName":"John Smith"}]'

  # Lenient mode (email mismatches as warnings)
  node verify-contact-identities.js rentable-production contacts.json --lenient

  # Save report
  node verify-contact-identities.js rentable-production contacts.json --output report.json

Exit Codes:
  0 - All contacts verified successfully
  1 - Critical identity mismatches found (DO NOT proceed)
    `);
    process.exit(0);
  }

  const orgAlias = args[0];
  const inlineMode = args.includes('--inline');
  const options = {
    strictMode: !args.includes('--lenient'),
    failFast: !args.includes('--continue-on-error')
  };

  let expectedContacts;

  if (inlineMode) {
    const jsonString = args[args.indexOf('--inline') + 1];
    expectedContacts = JSON.parse(jsonString);
  } else {
    const inputFile = args[1];
    expectedContacts = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  }

  const verifier = new ContactIdentityVerifier(orgAlias, options);

  try {
    const results = verifier.verifyAll(expectedContacts);

    if (args.includes('--output')) {
      const outputFile = args[args.indexOf('--output') + 1];
      verifier.generateReport(results, outputFile);
    }

    if (results.success) {
      console.log('\n✅ All contacts verified successfully');
      process.exit(0);
    } else {
      console.error('\n❌ Verification failed - see issues above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

module.exports = ContactIdentityVerifier;
