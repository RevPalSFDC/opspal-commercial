#!/usr/bin/env node
/**
 * Deduplication Association Verifier
 *
 * Purpose: Verify and repair HubSpot association types after deduplication operations.
 * Critical for preventing "missing primary association" issues discovered in production.
 *
 * Key Discovery (Rentable cleanup, Oct 2025):
 * - 96.8% of contacts needed PRIMARY association after duplicate removal
 * - HubSpot allows multiple association types on same contact-company relationship
 * - Removing Type 279 (Unlabeled) without verifying Type 1 (Primary) leaves contacts orphaned
 *
 * Features:
 * - Fetch all association types for contact-company relationships
 * - Verify PRIMARY (Type 1) association exists
 * - Auto-repair: add PRIMARY if missing
 * - Batch verification for efficiency
 * - Real-time reporting
 *
 * Usage:
 *   const AssociationVerifier = require('./dedup-association-verifier');
 *   const verifier = new AssociationVerifier(config);
 *   await verifier.verifyAndRepair(contactId, companyId);
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// HubSpot Association Type IDs
const ASSOCIATION_TYPES = {
  PRIMARY_COMPANY: 1,        // Type 1: Primary Company (REQUIRED for reports/automation)
  UNLABELED: 279,            // Type 279: Unlabeled/Secondary (often from imports/forms)
  BILLING: 27,               // Type 27: Billing Company
  SHIPPING: 28               // Type 28: Shipping Company
};

class AssociationVerifier {
  constructor(config) {
    this.config = config;
    this.hubspot = config.hubspot;
    this.stats = {
      contactsVerified: 0,
      hadPrimary: 0,
      missingPrimary: 0,
      repaired: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Get all association types for a contact-company relationship
   * @param {string} contactId - HubSpot contact ID
   * @param {string} companyId - HubSpot company ID
   * @returns {Promise<Array>} Array of association type objects
   */
  async getAllAssociationTypes(contactId, companyId) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.hubapi.com',
        path: `/crm/v4/objects/contacts/${contactId}/associations/companies`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.hubspot.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      let data = '';
      const req = https.request(options, (res) => {
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              // Filter to associations with specific company
              const associations = parsed.results || [];
              const companyAssociations = associations
                .filter(assoc => assoc.toObjectId?.toString() === companyId.toString())
                .map(assoc => ({
                  toObjectId: assoc.toObjectId,
                  associationTypes: assoc.associationTypes || []
                }));

              resolve(companyAssociations.length > 0 ? companyAssociations[0].associationTypes : []);
            } catch (err) {
              reject(new Error(`Parse error: ${err.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Check if PRIMARY association exists
   * @param {string} contactId - HubSpot contact ID
   * @param {string} companyId - HubSpot company ID
   * @returns {Promise<boolean>} True if PRIMARY exists
   */
  async hasPrimaryAssociation(contactId, companyId) {
    try {
      const types = await this.getAllAssociationTypes(contactId, companyId);
      return types.some(type =>
        type.typeId === ASSOCIATION_TYPES.PRIMARY_COMPANY ||
        type.associationTypeId === ASSOCIATION_TYPES.PRIMARY_COMPANY
      );
    } catch (error) {
      console.error(`  ⚠️  Error checking primary for contact ${contactId}: ${error.message}`);
      return false; // Assume missing on error (will attempt repair)
    }
  }

  /**
   * Add PRIMARY association
   * @param {string} contactId - HubSpot contact ID
   * @param {string} companyId - HubSpot company ID
   * @returns {Promise<object>} Result object
   */
  async addPrimaryAssociation(contactId, companyId) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.hubapi.com',
        path: `/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.hubspot.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const body = JSON.stringify([{
        associationCategory: 'HUBSPOT_DEFINED',
        associationTypeId: ASSOCIATION_TYPES.PRIMARY_COMPANY
      }]);

      let data = '';
      const req = https.request(options, (res) => {
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              success: true,
              statusCode: res.statusCode,
              data: data ? JSON.parse(data) : null
            });
          } else {
            resolve({
              success: false,
              statusCode: res.statusCode,
              error: data
            });
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Verify and repair a single contact-company association
   * @param {string} contactId - HubSpot contact ID
   * @param {string} companyId - HubSpot company ID
   * @param {object} context - Additional context for logging
   * @returns {Promise<object>} Verification result
   */
  async verifyAndRepair(contactId, companyId, context = {}) {
    this.stats.contactsVerified++;

    const result = {
      contactId,
      companyId,
      hadPrimary: false,
      repaired: false,
      error: null,
      ...context
    };

    try {
      // Check if PRIMARY association exists
      const hasPrimary = await this.hasPrimaryAssociation(contactId, companyId);

      if (hasPrimary) {
        this.stats.hadPrimary++;
        result.hadPrimary = true;
        return result;
      }

      // PRIMARY missing - attempt repair
      this.stats.missingPrimary++;
      console.log(`  🔧 Repairing: Contact ${contactId} → Company ${companyId} (missing PRIMARY)`);

      const addResult = await this.addPrimaryAssociation(contactId, companyId);

      if (addResult.success) {
        this.stats.repaired++;
        result.repaired = true;
        console.log(`    ✅ PRIMARY association added`);
      } else {
        this.stats.failed++;
        result.error = addResult.error;
        console.log(`    ❌ Failed to add PRIMARY: ${addResult.error}`);
        this.stats.errors.push({
          contactId,
          companyId,
          error: addResult.error
        });
      }

      return result;

    } catch (error) {
      this.stats.failed++;
      result.error = error.message;
      console.error(`  ❌ Verification error: ${error.message}`);
      this.stats.errors.push({
        contactId,
        companyId,
        error: error.message
      });
      return result;
    }
  }

  /**
   * Verify and repair batch of contact-company associations
   * @param {Array} associations - Array of {contactId, companyId, context} objects
   * @param {number} rateLimit - Milliseconds between API calls (default: 100)
   * @returns {Promise<Array>} Array of verification results
   */
  async verifyAndRepairBatch(associations, rateLimit = 100) {
    console.log(`\n🔍 Verifying ${associations.length} contact-company associations...`);

    const results = [];

    for (let i = 0; i < associations.length; i++) {
      const { contactId, companyId, context } = associations[i];
      const progress = i + 1;

      if (progress % 50 === 0 || progress === associations.length) {
        console.log(`  Progress: ${progress}/${associations.length} (${((progress/associations.length)*100).toFixed(1)}%)`);
      }

      const result = await this.verifyAndRepair(contactId, companyId, context);
      results.push(result);

      // Rate limiting
      if (i < associations.length - 1) {
        await this.sleep(rateLimit);
      }
    }

    return results;
  }

  /**
   * Verify all contacts for a company
   * @param {string} companyId - HubSpot company ID
   * @param {Array} contactIds - Array of contact IDs
   * @returns {Promise<object>} Verification summary
   */
  async verifyCompanyContacts(companyId, contactIds) {
    console.log(`\n🏢 Verifying ${contactIds.length} contacts for company ${companyId}...`);

    const associations = contactIds.map(contactId => ({
      contactId,
      companyId,
      context: { company: companyId }
    }));

    const results = await this.verifyAndRepairBatch(associations);

    const summary = {
      companyId,
      totalContacts: contactIds.length,
      verified: results.length,
      hadPrimary: results.filter(r => r.hadPrimary).length,
      repaired: results.filter(r => r.repaired).length,
      failed: results.filter(r => r.error).length
    };

    return summary;
  }

  /**
   * Get verification statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.contactsVerified > 0
        ? ((this.stats.repaired / this.stats.missingPrimary) * 100).toFixed(1)
        : 0,
      primaryMissingRate: this.stats.contactsVerified > 0
        ? ((this.stats.missingPrimary / this.stats.contactsVerified) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Print verification summary
   */
  printSummary() {
    const stats = this.getStats();

    console.log('\n' + '='.repeat(70));
    console.log('📊 ASSOCIATION VERIFICATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Contacts Verified: ${stats.contactsVerified}`);
    console.log(`Had PRIMARY: ${stats.hadPrimary} (${((stats.hadPrimary/stats.contactsVerified)*100).toFixed(1)}%)`);
    console.log(`Missing PRIMARY: ${stats.missingPrimary} (${stats.primaryMissingRate}%)`);
    console.log(`Repaired: ${stats.repaired} (${stats.successRate}% success)`);
    console.log(`Failed: ${stats.failed}`);

    if (stats.failed > 0) {
      console.log(`\n❌ Errors: ${stats.errors.length}`);
      stats.errors.slice(0, 5).forEach(err => {
        console.log(`  - Contact ${err.contactId} → Company ${err.companyId}: ${err.error}`);
      });
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more`);
      }
    }

    console.log('='.repeat(70));
  }

  /**
   * Save verification results to file
   * @param {string} outputPath - Path to save results
   */
  saveResults(outputPath) {
    const results = {
      timestamp: new Date().toISOString(),
      statistics: this.getStats(),
      errors: this.stats.errors
    };

    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI Usage
if (require.main === module) {
  const ConfigLoader = require('./dedup-config-loader');

  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Deduplication Association Verifier

Usage:
  node dedup-association-verifier.js <config-file> <operation> [options]

Operations:
  verify-single <contactId> <companyId>  - Verify single association
  verify-batch <associations-file>       - Verify batch from JSON file
  verify-company <companyId> <contacts-file> - Verify all contacts for company

Options:
  --rate-limit <ms>    Rate limit between API calls (default: 100ms)
  --output <file>      Save results to file
  --help               Show this help message

Examples:
  # Verify single association
  node dedup-association-verifier.js ./config.json verify-single 12345 67890

  # Verify batch from file
  node dedup-association-verifier.js ./config.json verify-batch ./associations.json

  # Verify company contacts
  node dedup-association-verifier.js ./config.json verify-company 67890 ./contacts.json

Association File Format (JSON):
  [
    { "contactId": "12345", "companyId": "67890" },
    { "contactId": "12346", "companyId": "67890" }
  ]
    `);
    process.exit(0);
  }

  const configPath = args[0];
  const operation = args[1];

  (async () => {
    try {
      console.log('📋 Loading configuration...');
      const config = ConfigLoader.load(configPath);

      const verifier = new AssociationVerifier(config);

      const rateLimit = parseInt(args.find((arg, i) => args[i-1] === '--rate-limit')) || 100;
      const outputFile = args.find((arg, i) => args[i-1] === '--output');

      if (operation === 'verify-single') {
        const contactId = args[2];
        const companyId = args[3];

        if (!contactId || !companyId) {
          console.error('❌ Missing contactId or companyId');
          process.exit(1);
        }

        const result = await verifier.verifyAndRepair(contactId, companyId);
        console.log('\nResult:', result);

      } else if (operation === 'verify-batch') {
        const batchFile = args[2];

        if (!batchFile || !fs.existsSync(batchFile)) {
          console.error('❌ Batch file not found');
          process.exit(1);
        }

        const associations = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
        await verifier.verifyAndRepairBatch(associations, rateLimit);

      } else if (operation === 'verify-company') {
        const companyId = args[2];
        const contactsFile = args[3];

        if (!companyId || !contactsFile || !fs.existsSync(contactsFile)) {
          console.error('❌ Missing companyId or contacts file not found');
          process.exit(1);
        }

        const contactIds = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
        await verifier.verifyCompanyContacts(companyId, contactIds);

      } else {
        console.error(`❌ Unknown operation: ${operation}`);
        process.exit(1);
      }

      verifier.printSummary();

      if (outputFile) {
        verifier.saveResults(outputFile);
      }

      console.log('\n✅ Verification complete');
      process.exit(0);

    } catch (error) {
      console.error('\n❌ Fatal error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

module.exports = AssociationVerifier;
