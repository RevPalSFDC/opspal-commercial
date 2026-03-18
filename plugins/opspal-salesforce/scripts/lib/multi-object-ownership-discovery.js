#!/usr/bin/env node

/**
 * Multi-Object Ownership Discovery
 *
 * Comprehensive discovery script that queries Contact, Lead, Opportunity, Account, Case,
 * and custom objects for inactive user ownership. Returns ownership breakdown by user.
 *
 * @module multi-object-ownership-discovery
 * @version 1.0.0
 * @since 2025-10-06
 *
 * Usage:
 *   node scripts/lib/multi-object-ownership-discovery.js <org-alias> [options]
 *
 * Examples:
 *   # Full discovery
 *   node scripts/lib/multi-object-ownership-discovery.js delta-production
 *
 *   # JSON output
 *   node scripts/lib/multi-object-ownership-discovery.js delta-production --json
 *
 *   # Include custom objects
 *   node scripts/lib/multi-object-ownership-discovery.js delta-production --include-custom
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MultiObjectOwnershipDiscovery {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.standardObjects = ['Contact', 'Lead', 'Opportunity', 'Account', 'Case'];
    this.integrationPatterns = [
      /@alndata\.com$/i,
      /@convergeone\.com$/i,
      /-salesforce@/i,
      /integration@/i,
      /^api.*user/i,
      /^data.*sync/i
    ];
  }

  /**
   * Run comprehensive discovery across all objects
   * @param {Object} options - Discovery options
   * @param {boolean} [options.includeCustom] - Include custom objects
   * @param {boolean} [options.includeIntegration] - Include integration users
   * @returns {Object} Discovery results
   */
  async runDiscovery(options = {}) {
    const { includeCustom = false, includeIntegration = false } = options;

    const results = {
      timestamp: new Date().toISOString(),
      org: this.orgAlias,
      standardObjects: {},
      customObjects: {},
      userSummary: {},
      integrationUsers: [],
      departedUsers: [],
      totalInactiveOwnership: 0
    };

    // Query each standard object
    for (const object of this.standardObjects) {
      console.error(`Querying ${object}...`);
      results.standardObjects[object] = await this.queryObjectOwnership(object);
    }

    // Query custom objects if requested
    if (includeCustom) {
      const customObjects = this.getCustomObjects();
      for (const object of customObjects) {
        console.error(`Querying custom object ${object}...`);
        results.customObjects[object] = await this.queryObjectOwnership(object);
      }
    }

    // Build user summary
    results.userSummary = this.buildUserSummary(results.standardObjects, results.customObjects);

    // Classify users
    const classification = this.classifyUsers(results.userSummary);
    results.integrationUsers = classification.integration;
    results.departedUsers = classification.departed;

    // Calculate totals
    results.totalInactiveOwnership = Object.values(results.userSummary)
      .reduce((sum, user) => sum + user.totalRecords, 0);

    return results;
  }

  /**
   * Query ownership for specific object
   * @param {string} object - Object API name
   * @returns {Array} Ownership records
   */
  async queryObjectOwnership(object) {
    try {
      const query = `
        SELECT Owner.Id, Owner.Name, Owner.Email, Owner.IsActive, COUNT(Id) RecordCount
        FROM ${object}
        WHERE Owner.IsActive = false
        GROUP BY Owner.Id, Owner.Name, Owner.Email, Owner.IsActive
        ORDER BY COUNT(Id) DESC
      `.trim().replace(/\s+/g, ' ');

      const result = execSync(
        `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );

      const parsed = JSON.parse(result);
      if (!parsed.result || parsed.result.totalSize === 0) {
        return [];
      }

      return parsed.result.records.map(r => ({
        ownerId: r.Owner.Id,
        ownerName: r.Owner.Name,
        ownerEmail: r.Owner.Email,
        isActive: r.Owner.IsActive,
        recordCount: r.RecordCount
      }));

    } catch (error) {
      console.error(`Error querying ${object}:`, error.message);
      return [];
    }
  }

  /**
   * Get list of custom objects with OwnerId field
   * @returns {Array} Custom object API names
   */
  getCustomObjects() {
    try {
      const result = execSync(
        `sf sobject list --sobject-type-category custom --target-org ${this.orgAlias} --json`,
        { encoding: 'utf-8' }
      );

      const parsed = JSON.parse(result);
      if (!parsed.result) return [];

      // Filter to only objects with OwnerId field
      const customObjects = parsed.result.filter(obj => {
        try {
          const describe = execSync(
            `sf sobject describe --sobject ${obj} --target-org ${this.orgAlias} --json`,
            { encoding: 'utf-8' }
          );
          const fields = JSON.parse(describe).result.fields || [];
          return fields.some(f => f.name === 'OwnerId');
        } catch {
          return false;
        }
      });

      return customObjects;

    } catch (error) {
      console.error('Error getting custom objects:', error.message);
      return [];
    }
  }

  /**
   * Build user summary from object results
   * @param {Object} standardObjects - Standard object results
   * @param {Object} customObjects - Custom object results
   * @returns {Object} User summary
   */
  buildUserSummary(standardObjects, customObjects) {
    const userMap = new Map();

    // Process standard objects
    Object.entries(standardObjects).forEach(([objName, records]) => {
      records.forEach(record => {
        if (!userMap.has(record.ownerId)) {
          userMap.set(record.ownerId, {
            userId: record.ownerId,
            userName: record.ownerName,
            userEmail: record.ownerEmail,
            objects: {},
            totalRecords: 0
          });
        }

        const user = userMap.get(record.ownerId);
        user.objects[objName] = record.recordCount;
        user.totalRecords += record.recordCount;
      });
    });

    // Process custom objects
    Object.entries(customObjects).forEach(([objName, records]) => {
      records.forEach(record => {
        if (!userMap.has(record.ownerId)) {
          userMap.set(record.ownerId, {
            userId: record.ownerId,
            userName: record.ownerName,
            userEmail: record.ownerEmail,
            objects: {},
            totalRecords: 0
          });
        }

        const user = userMap.get(record.ownerId);
        user.objects[objName] = record.recordCount;
        user.totalRecords += record.recordCount;
      });
    });

    // Convert map to object
    const summary = {};
    userMap.forEach((user, userId) => {
      summary[userId] = user;
    });

    return summary;
  }

  /**
   * Classify users as integration or departed
   * @param {Object} userSummary - User summary
   * @returns {Object} Classification results
   */
  classifyUsers(userSummary) {
    const integration = [];
    const departed = [];

    Object.values(userSummary).forEach(user => {
      const isIntegration = this.integrationPatterns.some(pattern =>
        pattern.test(user.userEmail || '') || pattern.test(user.userName || '')
      );

      if (isIntegration) {
        integration.push(user);
      } else {
        departed.push(user);
      }
    });

    return { integration, departed };
  }

  /**
   * Format results for display
   * @param {Object} results - Discovery results
   * @returns {string} Formatted output
   */
  formatResults(results) {
    const lines = [];

    lines.push('\n=== Multi-Object Ownership Discovery ===\n');
    lines.push(`Org: ${results.org}`);
    lines.push(`Timestamp: ${new Date(results.timestamp).toLocaleString()}`);
    lines.push(`Total Inactive User Ownership: ${results.totalInactiveOwnership.toLocaleString()} records\n`);

    // Standard objects summary
    lines.push('--- Standard Objects ---\n');
    Object.entries(results.standardObjects).forEach(([obj, records]) => {
      const total = records.reduce((sum, r) => sum + r.recordCount, 0);
      lines.push(`${obj}: ${total.toLocaleString()} records (${records.length} inactive users)`);
    });

    // Custom objects summary (if any)
    if (Object.keys(results.customObjects).length > 0) {
      lines.push('\n--- Custom Objects ---\n');
      Object.entries(results.customObjects).forEach(([obj, records]) => {
        const total = records.reduce((sum, r) => sum + r.recordCount, 0);
        lines.push(`${obj}: ${total.toLocaleString()} records (${records.length} inactive users)`);
      });
    }

    // Integration users
    if (results.integrationUsers.length > 0) {
      lines.push('\n--- Integration Users (DO NOT REASSIGN) ---\n');
      results.integrationUsers.forEach(user => {
        lines.push(`${user.userName} (${user.userEmail}): ${user.totalRecords.toLocaleString()} records`);
        Object.entries(user.objects).forEach(([obj, count]) => {
          lines.push(`  - ${obj}: ${count.toLocaleString()}`);
        });
      });
    }

    // Departed users
    if (results.departedUsers.length > 0) {
      lines.push('\n--- Departed Employees (SHOULD REASSIGN) ---\n');
      results.departedUsers
        .sort((a, b) => b.totalRecords - a.totalRecords)
        .forEach(user => {
          lines.push(`${user.userName} (${user.userEmail}): ${user.totalRecords.toLocaleString()} records`);
          Object.entries(user.objects).forEach(([obj, count]) => {
            lines.push(`  - ${obj}: ${count.toLocaleString()}`);
          });
        });
    }

    // Recommendations
    lines.push('\n--- Recommendations ---\n');

    if (results.departedUsers.length > 0) {
      const totalDeparted = results.departedUsers.reduce((sum, u) => sum + u.totalRecords, 0);
      lines.push(`⚠️  ${totalDeparted.toLocaleString()} records owned by ${results.departedUsers.length} departed employees`);
      lines.push('   Action: Run ownership transfer for departed users');
    }

    if (results.integrationUsers.length > 0) {
      const totalIntegration = results.integrationUsers.reduce((sum, u) => sum + u.totalRecords, 0);
      lines.push(`✅ ${totalIntegration.toLocaleString()} records owned by ${results.integrationUsers.length} integration users`);
      lines.push('   Action: Preserve - do not reassign');
    }

    // Check for high-risk objects
    const opportunities = results.standardObjects.Opportunity || [];
    const oppCount = opportunities.reduce((sum, r) => sum + r.recordCount, 0);
    if (oppCount > 0) {
      lines.push(`\n⚠️  HIGH PRIORITY: ${oppCount.toLocaleString()} Opportunities owned by inactive users`);
      lines.push('   Action: Query for open/high-value opportunities before transfer');
    }

    const accounts = results.standardObjects.Account || [];
    const accCount = accounts.reduce((sum, r) => sum + r.recordCount, 0);
    if (accCount > 0) {
      lines.push(`\n⚠️  MEDIUM PRIORITY: ${accCount.toLocaleString()} Accounts owned by inactive users`);
      lines.push('   Action: Check for related Contacts/Opportunities before transfer');
    }

    return lines.join('\n') + '\n';
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(`
Usage: node multi-object-ownership-discovery.js <org-alias> [options]

Options:
  --include-custom       Include custom objects in discovery
  --json                 Output as JSON
  --save <file>          Save results to file

Examples:
  # Full discovery with output
  node multi-object-ownership-discovery.js delta-production

  # Include custom objects
  node multi-object-ownership-discovery.js delta-production --include-custom

  # JSON output
  node multi-object-ownership-discovery.js delta-production --json

  # Save to file
  node multi-object-ownership-discovery.js delta-production --save results.json
    `);
    process.exit(1);
  }

  const [orgAlias] = args;
  const includeCustom = args.includes('--include-custom');
  const jsonOutput = args.includes('--json');
  const saveFile = args.includes('--save') ? args[args.indexOf('--save') + 1] : null;

  const discovery = new MultiObjectOwnershipDiscovery(orgAlias);

  (async () => {
    const results = await discovery.runDiscovery({ includeCustom });

    if (jsonOutput || saveFile) {
      const json = JSON.stringify(results, null, 2);

      if (saveFile) {
        fs.writeFileSync(saveFile, json);
        console.error(`Results saved to: ${saveFile}`);
      }

      if (jsonOutput) {
        console.log(json);
      }
    } else {
      console.log(discovery.formatResults(results));
    }

    // Exit with status based on findings
    const hasDepartedUsers = results.departedUsers.length > 0;
    process.exit(hasDepartedUsers ? 1 : 0);
  })();
}

module.exports = MultiObjectOwnershipDiscovery;
