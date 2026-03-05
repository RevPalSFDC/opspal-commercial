#!/usr/bin/env node
/**
 * Duplicate-Aware Update Utility
 *
 * Prevents "DUPLICATES_DETECTED" errors by checking for duplicates BEFORE attempting updates.
 * Automatically triggers merge workflow when duplicate detected.
 *
 * Problem Solved:
 * - Direct email updates fail with "DUPLICATES_DETECTED" when target email already exists
 * - User must manually discover duplicate, then decide on merge vs alternative approach
 * - This utility automates duplicate detection and workflow routing
 *
 * Usage:
 *   node scripts/lib/duplicate-aware-update.js <org-alias> <contact-id> <new-email> [--auto-merge]
 *
 * Examples:
 *   # Check and update (prompt if duplicate found)
 *   node scripts/lib/duplicate-aware-update.js rentable-production 0032A00002az0UPQAY ebedel@hayesgibson.com
 *
 *   # Auto-merge if duplicate found
 *   node scripts/lib/duplicate-aware-update.js rentable-production 0032A00002az0UPQAY ebedel@hayesgibson.com --auto-merge
 *
 *   # Batch mode (via JSON file)
 *   node scripts/lib/duplicate-aware-update.js rentable-production --batch updates.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DuplicateAwareUpdate {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.autoMerge = options.autoMerge || false;
    this.dryRun = options.dryRun || false;
  }

  /**
   * Check if target email already exists on a different contact
   */
  checkForDuplicate(contactId, targetEmail) {
    console.log(`\n🔍 Checking for duplicates: ${targetEmail}`);

    const query = `SELECT Id, FirstName, LastName, Email, Account.Name, CreatedDate FROM Contact WHERE Email = '${targetEmail}' AND Id != '${contactId}'`;

    try {
      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8' }
      );

      const parsed = JSON.parse(result);
      const duplicates = parsed.result?.records || [];

      if (duplicates.length === 0) {
        console.log('   ✅ No duplicates found - safe to update');
        return { hasDuplicate: false, duplicates: [] };
      }

      console.log(`   ⚠️  Found ${duplicates.length} contact(s) with this email:`);
      duplicates.forEach((dup, idx) => {
        console.log(`   ${idx + 1}. ${dup.FirstName} ${dup.LastName} (${dup.Id})`);
        console.log(`      Account: ${dup.Account?.Name || 'No Account'}`);
        console.log(`      Created: ${dup.CreatedDate}`);
      });

      return { hasDuplicate: true, duplicates };

    } catch (error) {
      console.error('   ❌ Duplicate check failed:', error.message);
      throw error;
    }
  }

  /**
   * Get contact details for the record being updated
   */
  getContactDetails(contactId) {
    const query = `SELECT Id, FirstName, LastName, Email, Account.Name, CreatedDate FROM Contact WHERE Id = '${contactId}'`;

    try {
      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8' }
      );

      const parsed = JSON.parse(result);
      const contact = parsed.result?.records?.[0];

      if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
      }

      return contact;
    } catch (error) {
      console.error(`❌ Failed to get contact details: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform direct update (no duplicates detected)
   */
  directUpdate(contactId, newEmail, currentEmail) {
    console.log(`\n📝 Performing direct update...`);
    console.log(`   Contact ID: ${contactId}`);
    console.log(`   Current Email: ${currentEmail}`);
    console.log(`   New Email: ${newEmail}`);

    if (this.dryRun) {
      console.log('   [DRY RUN] Would execute update');
      return { success: true, dryRun: true };
    }

    try {
      execSync(
        `sf data update record --sobject Contact --record-id ${contactId} --values "Email='${newEmail}'" --target-org ${this.orgAlias}`,
        { encoding: 'utf-8' }
      );

      console.log('   ✅ Update successful');

      // Verify update
      const verified = this.verifyUpdate(contactId, newEmail);
      return { success: true, verified };

    } catch (error) {
      console.error('   ❌ Update failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify update was successful
   */
  verifyUpdate(contactId, expectedEmail) {
    try {
      const query = `SELECT Id, Email FROM Contact WHERE Id = '${contactId}'`;
      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8' }
      );

      const parsed = JSON.parse(result);
      const contact = parsed.result?.records?.[0];

      const matches = contact?.Email === expectedEmail;
      console.log(`   ${matches ? '✅' : '❌'} Verification: ${contact?.Email === expectedEmail ? 'Success' : 'Failed'}`);

      return matches;
    } catch (error) {
      console.warn('   ⚠️  Verification failed:', error.message);
      return false;
    }
  }

  /**
   * Trigger merge workflow (duplicates detected)
   */
  async triggerMergeWorkflow(sourceContact, targetContact) {
    console.log(`\n🔀 Duplicate detected - merge workflow required`);
    console.log('\nMerge Decision:');
    console.log(`   KEEP (Master): ${targetContact.Id}`);
    console.log(`     Name: ${targetContact.FirstName} ${targetContact.LastName}`);
    console.log(`     Email: ${targetContact.Email} (correct)`);
    console.log(`     Account: ${targetContact.Account?.Name || 'No Account'}`);
    console.log(`     Created: ${targetContact.CreatedDate}`);
    console.log('');
    console.log(`   DELETE (Duplicate): ${sourceContact.Id}`);
    console.log(`     Name: ${sourceContact.FirstName} ${sourceContact.LastName}`);
    console.log(`     Email: ${sourceContact.Email} (typo)`);
    console.log(`     Account: ${sourceContact.Account?.Name || 'No Account'}`);
    console.log(`     Created: ${sourceContact.CreatedDate}`);

    if (this.autoMerge) {
      console.log('\n⚠️  --auto-merge flag set, but merge requires sfdc-data-operations agent');
      console.log('   Automated merges handle: relationship transfers, field updates, verification');
      console.log('   This utility cannot safely perform merges alone.');
      console.log('\n📋 Recommended Action:');
      console.log(`   Use: sfdc-data-operations agent with merge operation`);
      console.log(`   Master: ${targetContact.Id}`);
      console.log(`   Duplicate: ${sourceContact.Id}`);
      return { action: 'merge_required', master: targetContact.Id, duplicate: sourceContact.Id };
    }

    console.log('\n📋 Next Steps:');
    console.log('   1. Use sfdc-merge-orchestrator or sfdc-data-operations agent');
    console.log('   2. Specify master (keep) and duplicate (delete) contacts');
    console.log('   3. Agent will handle: relationship transfers, backups, verification');

    return { action: 'merge_required', master: targetContact.Id, duplicate: sourceContact.Id };
  }

  /**
   * Main update workflow with duplicate awareness
   */
  async updateEmail(contactId, newEmail) {
    console.log('\n🚀 Duplicate-Aware Update');
    console.log(`Organization: ${this.orgAlias}`);
    console.log(`Contact ID: ${contactId}`);
    console.log(`Target Email: ${newEmail}`);
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);

    try {
      // Step 1: Get current contact details
      console.log('\n📋 Step 1: Get current contact details');
      const contact = this.getContactDetails(contactId);
      console.log(`   Current Email: ${contact.Email}`);
      console.log(`   Name: ${contact.FirstName} ${contact.LastName}`);

      // Step 2: Check for duplicates
      console.log('\n🔍 Step 2: Check for duplicates');
      const { hasDuplicate, duplicates } = this.checkForDuplicate(contactId, newEmail);

      // Step 3: Route to appropriate workflow
      if (!hasDuplicate) {
        console.log('\n✅ Step 3: No duplicates - proceed with direct update');
        const result = this.directUpdate(contactId, newEmail, contact.Email);
        return { workflow: 'direct_update', ...result };
      } else {
        console.log('\n🔀 Step 3: Duplicate detected - merge workflow required');
        const result = await this.triggerMergeWorkflow(contact, duplicates[0]);
        return { workflow: 'merge_required', ...result };
      }

    } catch (error) {
      console.error('\n❌ Update workflow failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Batch update multiple emails
   */
  async batchUpdate(updates) {
    console.log(`\n📦 Batch Update Mode: ${updates.length} operations (parallel processing)`);

    // Parallelize email updates - each update performs its own duplicate checking
    const results = await Promise.all(
      updates.map(async (update, index) => {
        try {
          console.log(`\n[${index + 1}/${updates.length}] Processing: ${update.contactId}`);

          const result = await this.updateEmail(update.contactId, update.newEmail);
          return {
            ...update,
            ...result,
            index: index + 1
          };
        } catch (error) {
          console.error(`\n❌ Update failed for ${update.contactId}:`, error.message);
          return {
            ...update,
            success: false,
            error: error.message,
            index: index + 1
          };
        }
      })
    );

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('BATCH UPDATE SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Operations: ${results.length}`);
    console.log(`Direct Updates: ${results.filter(r => r.workflow === 'direct_update').length}`);
    console.log(`Merge Required: ${results.filter(r => r.workflow === 'merge_required').length}`);
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);
    console.log('='.repeat(80));

    return results;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node duplicate-aware-update.js <org-alias> <contact-id> <new-email> [options]
   OR: node duplicate-aware-update.js <org-alias> --batch <file.json>

Options:
  --auto-merge            Attempt auto-merge if duplicate found (requires agent)
  --dry-run               Preview actions without executing
  --help                  Show this help message

Batch File Format (JSON):
  [
    {"contactId": "0032A00002az0UPQAY", "newEmail": "user@example.com"},
    {"contactId": "0033j000042vEbnAAE", "newEmail": "user2@example.com"}
  ]

Examples:
  # Single update with duplicate check
  node duplicate-aware-update.js rentable-production 0032A00002az0UPQAY ebedel@hayesgibson.com

  # Dry run (preview only)
  node duplicate-aware-update.js rentable-production 0032A00002az0UPQAY ebedel@hayesgibson.com --dry-run

  # Batch update
  node duplicate-aware-update.js rentable-production --batch email-updates.json
    `);
    process.exit(0);
  }

  const orgAlias = args[0];
  const batchMode = args.includes('--batch');
  const options = {
    autoMerge: args.includes('--auto-merge'),
    dryRun: args.includes('--dry-run')
  };

  const updater = new DuplicateAwareUpdate(orgAlias, options);

  if (batchMode) {
    const batchFile = args[args.indexOf('--batch') + 1];
    const updates = JSON.parse(fs.readFileSync(batchFile, 'utf-8'));
    updater.batchUpdate(updates).catch(error => {
      console.error('Batch update failed:', error);
      process.exit(1);
    });
  } else {
    const contactId = args[1];
    const newEmail = args[2];

    if (!contactId || !newEmail) {
      console.error('Error: contact-id and new-email are required');
      process.exit(1);
    }

    updater.updateEmail(contactId, newEmail).catch(error => {
      console.error('Update failed:', error);
      process.exit(1);
    });
  }
}

module.exports = DuplicateAwareUpdate;
