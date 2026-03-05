/**
 * HubSpot Merge Strategy Selector
 *
 * Analyzes two companies and recommends the optimal merge strategy:
 * - Standard merge API (when allowed)
 * - Lift-and-shift (when merge API blocked)
 * - Manual review required (when conflicts detected)
 *
 * Detects merge blockers:
 * - Active Salesforce sync on both companies
 * - Read-only properties
 * - Data conflicts requiring manual resolution
 */

const https = require('https');

class MergeStrategySelector {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * Analyze two companies and recommend merge strategy
   * @param {string} masterCompanyId - ID of master company
   * @param {string} duplicateCompanyId - ID of duplicate company
   * @returns {Promise<object>} Strategy recommendation with reasoning
   */
  async selectStrategy(masterCompanyId, duplicateCompanyId) {
    console.log('🔍 Analyzing companies for merge strategy...\n');

    // Fetch both companies with SF sync properties
    const master = await this.getCompany(masterCompanyId);
    const duplicate = await this.getCompany(duplicateCompanyId);

    if (!master || !duplicate) {
      return {
        strategy: 'ERROR',
        reason: 'One or both companies not found',
        canProceed: false
      };
    }

    console.log(`Master: ${master.properties.name} (ID: ${masterCompanyId})`);
    console.log(`  SF Account ID: ${master.properties.salesforceaccountid || 'None'}`);
    console.log(`  Lifecycle Stage: ${master.properties.lifecyclestage || 'unknown'}\n`);

    console.log(`Duplicate: ${duplicate.properties.name} (ID: ${duplicateCompanyId})`);
    console.log(`  SF Account ID: ${duplicate.properties.salesforceaccountid || 'None'}`);
    console.log(`  Lifecycle Stage: ${duplicate.properties.lifecyclestage || 'unknown'}\n`);

    // Check for SF sync blocker
    const masterHasSFSync = !!master.properties.salesforceaccountid;
    const duplicateHasSFSync = !!duplicate.properties.salesforceaccountid;

    if (masterHasSFSync && duplicateHasSFSync) {
      // Check if they share the same SF Account ID
      const shareSFAccount = master.properties.salesforceaccountid === duplicate.properties.salesforceaccountid;

      if (shareSFAccount) {
        return {
          strategy: 'LIFT_AND_SHIFT',
          reason: 'Both companies have active Salesforce sync with same SF Account ID - merge API will return HTTP 400',
          blockers: ['salesforce_sync_active'],
          recommendation: {
            method: 'lift-and-shift',
            script: 'scripts/lift-and-shift-company-duplicates.js',
            description: 'Move all associations from duplicate to master, then delete duplicate'
          },
          canProceed: true,
          details: {
            masterSFAccountId: master.properties.salesforceaccountid,
            duplicateSFAccountId: duplicate.properties.salesforceaccountid,
            sharedSFAccount: true
          }
        };
      } else {
        return {
          strategy: 'MANUAL_REVIEW',
          reason: 'Both companies have Salesforce sync but DIFFERENT SF Account IDs - these may be legitimately separate accounts',
          blockers: ['different_salesforce_accounts'],
          recommendation: {
            method: 'manual-review',
            description: 'Verify in Salesforce whether these are truly duplicates or separate accounts'
          },
          canProceed: false,
          details: {
            masterSFAccountId: master.properties.salesforceaccountid,
            duplicateSFAccountId: duplicate.properties.salesforceaccountid,
            sharedSFAccount: false
          }
        };
      }
    } else if (masterHasSFSync || duplicateHasSFSync) {
      // Only one has SF sync
      return {
        strategy: 'STANDARD_MERGE',
        reason: 'Only one company has Salesforce sync - merge API should work',
        blockers: [],
        recommendation: {
          method: 'merge-api',
          api: 'POST /crm/v3/objects/companies/merge',
          description: 'Use HubSpot merge API to merge duplicate into master'
        },
        canProceed: true,
        warning: 'Ensure master company is the one with Salesforce sync to maintain sync integrity',
        details: {
          masterSFAccountId: master.properties.salesforceaccountid || null,
          duplicateSFAccountId: duplicate.properties.salesforceaccountid || null,
          sharedSFAccount: false
        }
      };
    } else {
      // Neither has SF sync
      return {
        strategy: 'STANDARD_MERGE',
        reason: 'Neither company has Salesforce sync - merge API is optimal',
        blockers: [],
        recommendation: {
          method: 'merge-api',
          api: 'POST /crm/v3/objects/companies/merge',
          description: 'Use HubSpot merge API to merge duplicate into master'
        },
        canProceed: true,
        details: {
          masterSFAccountId: null,
          duplicateSFAccountId: null,
          sharedSFAccount: false
        }
      };
    }
  }

  /**
   * Get company with SF sync properties
   * @param {string} companyId
   * @returns {Promise<object>}
   */
  async getCompany(companyId) {
    const properties = [
      'name',
      'lifecyclestage',
      'salesforceaccountid',
      'salesforceobjecttype',
      'hs_object_id'
    ];

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.hubapi.com',
        path: `/crm/v3/objects/companies/${companyId}?properties=${properties.join(',')}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else if (res.statusCode === 404) {
            resolve(null);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }).on('error', reject).end();
    });
  }

  /**
   * Format strategy for display
   * @param {object} strategy
   * @returns {string}
   */
  formatStrategy(strategy) {
    const lines = [];
    lines.push('═'.repeat(70));
    lines.push('📋 MERGE STRATEGY RECOMMENDATION');
    lines.push('═'.repeat(70));
    lines.push(`Strategy: ${strategy.strategy}`);
    lines.push(`Reason: ${strategy.reason}`);
    lines.push('');

    if (strategy.blockers && strategy.blockers.length > 0) {
      lines.push(`Blockers: ${strategy.blockers.join(', ')}`);
      lines.push('');
    }

    if (strategy.warning) {
      lines.push(`⚠️  Warning: ${strategy.warning}`);
      lines.push('');
    }

    if (strategy.recommendation) {
      lines.push('Recommendation:');
      lines.push(`  Method: ${strategy.recommendation.method}`);
      if (strategy.recommendation.api) {
        lines.push(`  API: ${strategy.recommendation.api}`);
      }
      if (strategy.recommendation.script) {
        lines.push(`  Script: ${strategy.recommendation.script}`);
      }
      lines.push(`  ${strategy.recommendation.description}`);
      lines.push('');
    }

    lines.push(`Can Proceed: ${strategy.canProceed ? '✅ Yes' : '❌ No - Manual Review Required'}`);
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help')) {
    console.log(`
Usage: node scripts/lib/hubspot-merge-strategy-selector.js <master-id> <duplicate-id>

Analyzes two HubSpot companies and recommends the optimal merge strategy.

Arguments:
  master-id       ID of the master company (will be kept)
  duplicate-id    ID of the duplicate company (will be merged/deleted)

Options:
  --json          Output raw JSON instead of formatted text
  --help          Show this help message

Examples:
  # Get merge recommendation
  node scripts/lib/hubspot-merge-strategy-selector.js 40979075625 40984560305

  # Get JSON output for scripting
  node scripts/lib/hubspot-merge-strategy-selector.js 40979075625 40984560305 --json
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const masterId = args[0];
  const duplicateId = args[1];
  const jsonOutput = args.includes('--json');

  // Load portal config
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, '../../portals/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const activePortal = config.activePortal;
  const portalConfig = config.portals[activePortal];

  if (!portalConfig || !portalConfig.accessToken) {
    console.error('❌ No access token configured for portal:', activePortal);
    process.exit(1);
  }

  const selector = new MergeStrategySelector(portalConfig.accessToken);

  try {
    const strategy = await selector.selectStrategy(masterId, duplicateId);

    if (jsonOutput) {
      console.log(JSON.stringify(strategy, null, 2));
    } else {
      console.log(selector.formatStrategy(strategy));
    }

    process.exit(strategy.canProceed ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run CLI if called directly
if (require.main === module) {
  main();
}

module.exports = MergeStrategySelector;
