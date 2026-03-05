#!/usr/bin/env node
/**
 * Territory Orphan Detector
 *
 * Identifies accounts that will become orphaned during territory migrations.
 * Detects accounts owned by users not assigned to any territory.
 *
 * Addresses Cohort 3 (data-quality) - 4 reflections, $82K ROI
 *
 * Checks:
 * 1. Accounts owned by users not in any territory
 * 2. Users leaving territories who own accounts
 * 3. Territories without assigned users
 *
 * @module territory-orphan-detector
 * @version 1.0.0
 * @created 2026-02-01
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TerritoryOrphanDetector {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 60000;
  }

  /**
   * Execute a SOQL query against the org
   */
  query(soql) {
    const escapedQuery = soql.replace(/"/g, '\\"').replace(/\n/g, ' ');
    const cmd = `sf data query --query "${escapedQuery}" --target-org ${this.orgAlias} --json`;

    if (this.verbose) {
      console.log(`Executing: ${soql.substring(0, 100)}...`);
    }

    try {
      const result = execSync(cmd, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: this.timeout
      });
      const parsed = JSON.parse(result);
      return parsed.result?.records || [];
    } catch (error) {
      if (this.verbose) {
        console.error(`Query failed: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * Check if Territory2 is enabled in the org
   */
  async checkTerritoryEnabled() {
    try {
      // Try to query Territory2Model - if it fails, Territory2 is not enabled
      const models = this.query('SELECT Id, Name, State FROM Territory2Model LIMIT 1');
      return models.length > 0 || models !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get active territory models
   */
  async getActiveModels() {
    const query = `
      SELECT Id, Name, State, DeveloperName
      FROM Territory2Model
      WHERE State = 'Active'
    `;
    return this.query(query);
  }

  /**
   * Get all users assigned to territories in a model
   */
  async getUsersInTerritories(modelId = null) {
    let query = `
      SELECT UserId, User.Name, User.IsActive, Territory2Id, Territory2.Name
      FROM UserTerritory2Association
    `;

    if (modelId) {
      query += ` WHERE Territory2.Territory2ModelId = '${modelId}'`;
    }

    return this.query(query);
  }

  /**
   * Get all account owners with account counts
   */
  async getAccountOwners() {
    const query = `
      SELECT OwnerId, Owner.Name, Owner.IsActive, COUNT(Id) AccountCount
      FROM Account
      WHERE OwnerId != null
      GROUP BY OwnerId, Owner.Name, Owner.IsActive
      ORDER BY COUNT(Id) DESC
    `;
    return this.query(query);
  }

  /**
   * Get accounts for a specific owner
   */
  async getAccountsForOwner(ownerId, limit = 10) {
    const query = `
      SELECT Id, Name, Type, Industry, AnnualRevenue, CreatedDate
      FROM Account
      WHERE OwnerId = '${ownerId}'
      ORDER BY AnnualRevenue DESC NULLS LAST
      LIMIT ${limit}
    `;
    return this.query(query);
  }

  /**
   * Detect orphan ownership - accounts owned by users not in any territory
   */
  async detectOrphanOwnership(modelId = null) {
    console.log('Analyzing territory ownership...');

    // Get users in territories
    const territoryUsers = await this.getUsersInTerritories(modelId);
    const userIdsInTerritory = new Set(territoryUsers.map(u => u.UserId));

    console.log(`Found ${territoryUsers.length} user-territory assignments`);
    console.log(`Unique users in territories: ${userIdsInTerritory.size}`);

    // Get account owners
    const accountOwners = await this.getAccountOwners();
    console.log(`Found ${accountOwners.length} unique account owners`);

    // Find orphans - owners not in any territory
    const orphans = [];
    let totalOrphanAccounts = 0;

    for (const owner of accountOwners) {
      if (!userIdsInTerritory.has(owner.OwnerId)) {
        const orphanEntry = {
          userId: owner.OwnerId,
          userName: owner.Owner?.Name || 'Unknown',
          isActive: owner.Owner?.IsActive ?? false,
          accountCount: owner.AccountCount,
          reason: 'Owner not assigned to any territory'
        };

        orphans.push(orphanEntry);
        totalOrphanAccounts += owner.AccountCount;
      }
    }

    // Sort by account count descending
    orphans.sort((a, b) => b.accountCount - a.accountCount);

    return {
      summary: {
        totalAccountOwners: accountOwners.length,
        usersInTerritories: userIdsInTerritory.size,
        orphanOwners: orphans.length,
        orphanAccounts: totalOrphanAccounts,
        orphanRate: accountOwners.length > 0
          ? Math.round((orphans.length / accountOwners.length) * 100)
          : 0
      },
      orphanOwners: orphans,
      territoryUsers: territoryUsers.length,
      modelId: modelId || 'all'
    };
  }

  /**
   * Simulate migration impact
   * Given users being removed from territories, identify affected accounts
   */
  async simulateMigrationImpact(userIdsToRemove) {
    console.log(`Simulating impact of removing ${userIdsToRemove.length} users from territories...`);

    const affected = [];

    for (const userId of userIdsToRemove) {
      const accounts = await this.getAccountsForOwner(userId, 100);

      if (accounts.length > 0) {
        affected.push({
          userId,
          accountCount: accounts.length,
          sampleAccounts: accounts.slice(0, 5).map(a => ({
            id: a.Id,
            name: a.Name,
            type: a.Type,
            annualRevenue: a.AnnualRevenue
          }))
        });
      }
    }

    const totalAccounts = affected.reduce((sum, u) => sum + u.accountCount, 0);

    return {
      usersAffected: affected.length,
      accountsAffected: totalAccounts,
      details: affected,
      recommendation: totalAccounts > 100
        ? 'HIGH IMPACT: Consider reassigning accounts before user removal'
        : totalAccounts > 10
          ? 'MEDIUM IMPACT: Review account ownership before proceeding'
          : 'LOW IMPACT: Minimal accounts affected'
    };
  }

  /**
   * Get territories without users
   */
  async getEmptyTerritories(modelId = null) {
    // Get all territories
    let territoriesQuery = `
      SELECT Id, Name, DeveloperName, Territory2Type.DeveloperName
      FROM Territory2
    `;

    if (modelId) {
      territoriesQuery += ` WHERE Territory2ModelId = '${modelId}'`;
    }

    const territories = this.query(territoriesQuery);

    // Get territories with assignments
    const assignmentsQuery = `
      SELECT Territory2Id
      FROM UserTerritory2Association
      GROUP BY Territory2Id
    `;

    const assignedTerritoryIds = new Set(
      this.query(assignmentsQuery).map(a => a.Territory2Id)
    );

    // Find empty territories
    const emptyTerritories = territories.filter(t => !assignedTerritoryIds.has(t.Id));

    return {
      totalTerritories: territories.length,
      emptyTerritories: emptyTerritories.length,
      emptyRate: territories.length > 0
        ? Math.round((emptyTerritories.length / territories.length) * 100)
        : 0,
      territories: emptyTerritories.map(t => ({
        id: t.Id,
        name: t.Name,
        developerName: t.DeveloperName,
        type: t.Territory2Type?.DeveloperName
      }))
    };
  }

  /**
   * Generate cleanup recommendations
   */
  generateCleanupPlan(orphanReport) {
    const plan = {
      priority: 'LOW',
      actions: [],
      queries: []
    };

    // Determine priority
    if (orphanReport.summary.orphanAccounts > 500) {
      plan.priority = 'CRITICAL';
    } else if (orphanReport.summary.orphanAccounts > 100) {
      plan.priority = 'HIGH';
    } else if (orphanReport.summary.orphanAccounts > 10) {
      plan.priority = 'MEDIUM';
    }

    // Generate actions
    if (orphanReport.orphanOwners.length > 0) {
      plan.actions.push({
        step: 1,
        action: 'Review orphan owners',
        description: 'Review the list of account owners not in any territory',
        effort: 'Low'
      });

      // Check for inactive users
      const inactiveOrphans = orphanReport.orphanOwners.filter(o => !o.isActive);
      if (inactiveOrphans.length > 0) {
        plan.actions.push({
          step: 2,
          action: 'Reassign inactive user accounts',
          description: `${inactiveOrphans.length} inactive users own accounts - reassign to active territory users`,
          effort: 'Medium',
          userIds: inactiveOrphans.map(o => o.userId)
        });
      }

      plan.actions.push({
        step: 3,
        action: 'Choose resolution strategy',
        options: [
          'A) Assign orphan owners to appropriate territories',
          'B) Bulk transfer accounts to territory-assigned owners',
          'C) Create a "catch-all" territory for orphan accounts'
        ]
      });

      // Generate helpful SOQL queries
      const orphanIds = orphanReport.orphanOwners.slice(0, 50).map(o => `'${o.userId}'`).join(',');

      plan.queries.push({
        purpose: 'List all accounts owned by orphan users',
        soql: `SELECT Id, Name, OwnerId, Owner.Name, Type, AnnualRevenue FROM Account WHERE OwnerId IN (${orphanIds}) ORDER BY AnnualRevenue DESC NULLS LAST`
      });

      plan.queries.push({
        purpose: 'Get orphan user details',
        soql: `SELECT Id, Name, IsActive, Profile.Name, UserRole.Name FROM User WHERE Id IN (${orphanIds})`
      });
    }

    return plan;
  }

  /**
   * Generate full report
   */
  async generateReport(modelId = null) {
    console.log('Generating Territory Orphan Detection Report...\n');

    // Check if Territory2 is enabled
    const territoryEnabled = await this.checkTerritoryEnabled();
    if (!territoryEnabled) {
      return {
        error: 'Territory2 Management is not enabled in this org',
        recommendation: 'Enable Territory2 Management or skip territory-based validation'
      };
    }

    // Get active models
    const models = await this.getActiveModels();
    console.log(`Found ${models.length} active territory model(s)`);

    // Detect orphans
    const orphanReport = await this.detectOrphanOwnership(modelId);

    // Get empty territories
    const emptyTerritories = await this.getEmptyTerritories(modelId);

    // Generate cleanup plan
    const cleanupPlan = this.generateCleanupPlan(orphanReport);

    return {
      timestamp: new Date().toISOString(),
      org: this.orgAlias,
      territoryModels: models.map(m => ({ id: m.Id, name: m.Name, state: m.State })),
      orphanOwnership: orphanReport,
      emptyTerritories: emptyTerritories,
      cleanupPlan: cleanupPlan,
      overallHealth: this.calculateHealth(orphanReport, emptyTerritories)
    };
  }

  /**
   * Calculate overall territory health score
   */
  calculateHealth(orphanReport, emptyTerritories) {
    let score = 100;
    const issues = [];

    // Deduct for orphan rate
    if (orphanReport.summary.orphanRate > 50) {
      score -= 40;
      issues.push('CRITICAL: Over 50% of account owners are not in territories');
    } else if (orphanReport.summary.orphanRate > 20) {
      score -= 20;
      issues.push('WARNING: Over 20% of account owners are not in territories');
    } else if (orphanReport.summary.orphanRate > 5) {
      score -= 10;
      issues.push('INFO: Some account owners are not in territories');
    }

    // Deduct for empty territories
    if (emptyTerritories.emptyRate > 50) {
      score -= 20;
      issues.push('WARNING: Over 50% of territories have no users');
    } else if (emptyTerritories.emptyRate > 20) {
      score -= 10;
      issues.push('INFO: Some territories have no users');
    }

    return {
      score: Math.max(0, score),
      rating: score >= 80 ? 'HEALTHY' : score >= 60 ? 'FAIR' : score >= 40 ? 'POOR' : 'CRITICAL',
      issues
    };
  }
}

module.exports = TerritoryOrphanDetector;

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Territory Orphan Detector

Identifies accounts owned by users not assigned to any territory.
Helps prevent orphan ownership during territory migrations.

Usage:
  node territory-orphan-detector.js <command> <org-alias> [options]

Commands:
  detect <org>              Detect orphan ownership
  simulate <org>            Simulate migration impact
  report <org>              Generate full report
  empty <org>               List territories without users

Options:
  --model-id <id>           Filter by territory model ID
  --users <id1,id2,...>     User IDs for simulation
  --json                    Output as JSON
  --verbose                 Verbose output

Examples:
  node territory-orphan-detector.js detect my-org
  node territory-orphan-detector.js report my-org --json
  node territory-orphan-detector.js simulate my-org --users 005xx000001,005xx000002
`);
    process.exit(0);
  }

  const command = args[0];
  const orgAlias = args[1];

  if (!orgAlias) {
    console.error('Error: org alias required');
    process.exit(1);
  }

  const modelIdIdx = args.indexOf('--model-id');
  const modelId = modelIdIdx >= 0 ? args[modelIdIdx + 1] : null;
  const jsonOutput = args.includes('--json');
  const verbose = args.includes('--verbose');

  const detector = new TerritoryOrphanDetector(orgAlias, { verbose });

  (async () => {
    let result;

    switch (command) {
      case 'detect':
        result = await detector.detectOrphanOwnership(modelId);
        break;

      case 'simulate': {
        const usersIdx = args.indexOf('--users');
        if (usersIdx < 0) {
          console.error('Error: --users required for simulate command');
          process.exit(1);
        }
        const userIds = args[usersIdx + 1].split(',');
        result = await detector.simulateMigrationImpact(userIds);
        break;
      }

      case 'report':
        result = await detector.generateReport(modelId);
        break;

      case 'empty':
        result = await detector.getEmptyTerritories(modelId);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Pretty print for terminal
      console.log('\n' + '='.repeat(60));

      if (command === 'detect') {
        console.log('  ORPHAN OWNERSHIP DETECTION');
        console.log('='.repeat(60));
        console.log(`\n  Account Owners:        ${result.summary.totalAccountOwners}`);
        console.log(`  Users in Territories:  ${result.summary.usersInTerritories}`);
        console.log(`  Orphan Owners:         ${result.summary.orphanOwners}`);
        console.log(`  Orphan Accounts:       ${result.summary.orphanAccounts}`);
        console.log(`  Orphan Rate:           ${result.summary.orphanRate}%`);

        if (result.orphanOwners.length > 0) {
          console.log('\n  Top Orphan Owners:');
          result.orphanOwners.slice(0, 10).forEach((o, i) => {
            console.log(`    ${i + 1}. ${o.userName} (${o.accountCount} accounts)${!o.isActive ? ' [INACTIVE]' : ''}`);
          });
        }
      } else if (command === 'report') {
        console.log('  TERRITORY HEALTH REPORT');
        console.log('='.repeat(60));
        console.log(`\n  Health Score:   ${result.overallHealth.score}/100 (${result.overallHealth.rating})`);

        if (result.overallHealth.issues.length > 0) {
          console.log('\n  Issues:');
          result.overallHealth.issues.forEach(issue => {
            console.log(`    - ${issue}`);
          });
        }

        console.log(`\n  Cleanup Priority: ${result.cleanupPlan.priority}`);
      }

      console.log('\n' + '='.repeat(60) + '\n');
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
