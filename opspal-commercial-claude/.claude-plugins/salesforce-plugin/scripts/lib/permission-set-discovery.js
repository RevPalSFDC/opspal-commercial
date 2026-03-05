#!/usr/bin/env node

/**
 * Permission Set Discovery - Scan org for permission sets and detect patterns
 *
 * Purpose: Phase 1 of Permission Set Assessment Wizard
 * - Queries all permission sets in org
 * - Analyzes naming patterns
 * - Detects potential initiatives
 * - Calculates fragmentation scores
 * - Identifies consolidation opportunities
 *
 * Usage:
 *   node permission-set-discovery.js --org myOrg
 *   node permission-set-discovery.js --org myOrg --initiative CPQ
 *   node permission-set-discovery.js --org myOrg --output discovery-report.json
 *
 * Output: Discovery Report JSON with:
 * - Total permission sets (custom vs managed)
 * - Detected initiatives with fragmentation scores
 * - Orphaned/unmanaged sets
 * - Consolidation opportunities
 *
 * @author RevPal Engineering
 * @version 1.0.0
 * @date 2025-10-22
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PermissionSetDiscovery {
  constructor(options = {}) {
    this.org = options.org || process.env.SF_ORG;
    this.verbose = options.verbose || false;
    this.focusInitiative = options.initiative || null;
    this.outputPath = options.output || null;

    // Discovery results
    this.results = {
      org: this.org,
      discoveryDate: new Date().toISOString(),
      totalPermissionSets: 0,
      customPermissionSets: 0,
      managedPermissionSets: 0,
      initiatives: [],
      orphanedSets: [],
      unmanagedSets: [],
      errors: []
    };
  }

  /**
   * Main discovery workflow
   */
  async discover() {
    this.log('info', `🔍 Starting permission set discovery for org: ${this.org}`);

    try {
      // Step 1: Query all permission sets
      const permissionSets = await this.queryPermissionSets();
      this.log('info', `Found ${permissionSets.length} permission sets`);

      // Step 2: Classify permission sets (custom vs managed)
      const classified = this.classifyPermissionSets(permissionSets);
      this.results.totalPermissionSets = permissionSets.length;
      this.results.customPermissionSets = classified.custom.length;
      this.results.managedPermissionSets = classified.managed.length;

      // Step 3: Detect initiatives from naming patterns
      const initiatives = this.detectInitiatives(classified.custom);
      this.log('info', `Detected ${initiatives.length} potential initiatives`);

      // Step 4: Analyze each initiative
      for (const initiative of initiatives) {
        await this.analyzeInitiative(initiative, permissionSets);
      }

      this.results.initiatives = initiatives;

      // Step 5: Identify orphaned sets (not part of any initiative)
      this.results.orphanedSets = this.identifyOrphanedSets(
        classified.custom,
        initiatives
      );

      // Step 6: Generate summary
      const summary = this.generateSummary();

      // Output results
      if (this.outputPath) {
        fs.writeFileSync(this.outputPath, JSON.stringify(this.results, null, 2));
        this.log('info', `✅ Discovery report saved to: ${this.outputPath}`);
      }

      return {
        success: true,
        results: this.results,
        summary
      };

    } catch (error) {
      this.log('error', `Discovery failed: ${error.message}`);
      this.results.errors.push({
        phase: 'discovery',
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        results: this.results
      };
    }
  }

  /**
   * Query all permission sets from org
   */
  async queryPermissionSets() {
    this.log('debug', 'Querying permission sets...');

    const query = `
      SELECT Id, Name, Label, Description, NamespacePrefix, IsCustom,
             (SELECT Assignee.Id, Assignee.Username FROM Assignments)
      FROM PermissionSet
      WHERE IsOwnedByProfile = false
      ORDER BY Name
    `;

    try {
      const command = `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.org} --json`;
      const result = execSync(command, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      if (!parsed.result || !parsed.result.records) {
        throw new Error('No permission sets found');
      }

      return parsed.result.records.map(ps => ({
        id: ps.Id,
        name: ps.Name,
        label: ps.Label,
        description: ps.Description,
        namespace: ps.NamespacePrefix,
        isCustom: ps.IsCustom,
        assignments: (ps.Assignments || {}).records || []
      }));

    } catch (error) {
      throw new Error(`Failed to query permission sets: ${error.message}`);
    }
  }

  /**
   * Classify permission sets (custom vs managed)
   */
  classifyPermissionSets(permissionSets) {
    const custom = [];
    const managed = [];

    for (const ps of permissionSets) {
      if (ps.namespace) {
        managed.push(ps);
      } else {
        custom.push(ps);
      }
    }

    return { custom, managed };
  }

  /**
   * Detect initiatives from naming patterns
   */
  detectInitiatives(customSets) {
    // Common patterns for fragmented permission sets
    const patterns = [
      // "CPQ Phase 1", "CPQ Phase 2", etc.
      { regex: /^(.+?)[\s_-]+(Phase|Tranche|V|Version)[\s_-]*\d+/i, group: 1 },

      // "CPQ Users", "CPQ Admin", "CPQ Power"
      { regex: /^(.+?)[\s_-]+(Users?|Admins?|Power|Read|Edit|Full)/i, group: 1 },

      // "CPQ_Extended", "CPQ_Basic"
      { regex: /^(.+?)[\s_-]+(Extended|Basic|Standard|Advanced|Premium)/i, group: 1 },

      // "CPQ 2024", "CPQ 2025"
      { regex: /^(.+?)[\s_-]+\d{4}/i, group: 1 }
    ];

    const initiativeMap = new Map();

    for (const ps of customSets) {
      let matched = false;

      for (const pattern of patterns) {
        const match = ps.name.match(pattern.regex) || ps.label.match(pattern.regex);

        if (match) {
          const baseName = match[pattern.group].trim();

          if (!initiativeMap.has(baseName)) {
            initiativeMap.set(baseName, {
              detectedName: baseName,
              permissionSets: [],
              permissionSetDetails: []
            });
          }

          initiativeMap.get(baseName).permissionSets.push(ps.name);
          initiativeMap.get(baseName).permissionSetDetails.push(ps);
          matched = true;
          break;
        }
      }

      // If no pattern matched, might be standalone or orphaned
      if (!matched) {
        // Check if name suggests it's part of an initiative (contains common keywords)
        const keywords = ['Users', 'Admin', 'Power', 'Read', 'Edit', 'Full'];
        const hasKeyword = keywords.some(kw => ps.name.includes(kw) || ps.label.includes(kw));

        if (hasKeyword) {
          // Try to extract base name by removing keyword
          const baseName = ps.name.replace(new RegExp(`[\\s_-]*(${keywords.join('|')})[\\s_-]*`, 'gi'), '').trim();

          if (baseName && baseName !== ps.name) {
            if (!initiativeMap.has(baseName)) {
              initiativeMap.set(baseName, {
                detectedName: baseName,
                permissionSets: [],
                permissionSetDetails: []
              });
            }

            initiativeMap.get(baseName).permissionSets.push(ps.name);
            initiativeMap.get(baseName).permissionSetDetails.push(ps);
          }
        }
      }
    }

    // Convert to array and filter out single-set "initiatives"
    const initiatives = Array.from(initiativeMap.values()).filter(
      initiative => initiative.permissionSets.length >= 1  // Include even single sets for now
    );

    return initiatives;
  }

  /**
   * Analyze initiative in detail
   */
  async analyzeInitiative(initiative, allPermissionSets) {
    this.log('debug', `Analyzing initiative: ${initiative.detectedName}`);

    // Calculate total assignments
    let totalAssignments = 0;
    for (const ps of initiative.permissionSetDetails) {
      totalAssignments += ps.assignments.length;
    }

    initiative.totalAssignments = totalAssignments;

    // Calculate fragmentation score
    initiative.fragmentationScore = this.calculateFragmentationScore(initiative);

    // Determine risk level
    initiative.riskLevel = this.assessRiskLevel(initiative);

    // Determine if consolidation is recommended
    initiative.consolidationOpportunity = this.shouldConsolidate(initiative);

    // Detect tier patterns (users vs admin)
    initiative.tierAnalysis = this.detectTiers(initiative);

    this.log('debug', `Initiative ${initiative.detectedName}: score=${initiative.fragmentationScore}, risk=${initiative.riskLevel}`);
  }

  /**
   * Calculate fragmentation score (0-100)
   */
  calculateFragmentationScore(initiative) {
    let score = 0;

    // Penalty for multiple sets (ideal is 2: Users + Admin)
    const setCount = initiative.permissionSets.length;
    if (setCount > 2) {
      score += (setCount - 2) * 15;  // 15 points per extra set
    } else if (setCount === 1) {
      score += 10;  // Single set missing tier separation
    }

    // Penalty for naming inconsistency
    const namesLowercase = initiative.permissionSets.map(name => name.toLowerCase());
    const hasPhase = namesLowercase.some(name => name.includes('phase') || name.includes('tranche'));
    if (hasPhase) {
      score += 20;  // Phased rollout indicates fragmentation
    }

    // Penalty for high user count (complexity of migration)
    if (initiative.totalAssignments > 20) {
      score += 15;
    } else if (initiative.totalAssignments > 50) {
      score += 25;
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Assess risk level for migration
   */
  assessRiskLevel(initiative) {
    const score = initiative.fragmentationScore;
    const assignments = initiative.totalAssignments;

    // High risk: High fragmentation + many users
    if (score >= 70 && assignments > 20) {
      return 'HIGH';
    }

    // High risk: Very high fragmentation regardless of users
    if (score >= 85) {
      return 'HIGH';
    }

    // Medium risk: Moderate fragmentation or moderate users
    if (score >= 40 || assignments > 10) {
      return 'MEDIUM';
    }

    // Low risk
    return 'LOW';
  }

  /**
   * Determine if consolidation is recommended
   */
  shouldConsolidate(initiative) {
    // Consolidate if:
    // - More than 2 permission sets (beyond Users/Admin)
    // - Fragmentation score >= 40
    // - Has phased naming
    return initiative.permissionSets.length > 2 || initiative.fragmentationScore >= 40;
  }

  /**
   * Detect tier patterns (users vs admin)
   */
  detectTiers(initiative) {
    const tiers = {
      users: [],
      admin: [],
      unknown: []
    };

    const userKeywords = ['user', 'read', 'basic', 'standard'];
    const adminKeywords = ['admin', 'power', 'edit', 'full', 'advanced'];

    for (const psName of initiative.permissionSets) {
      const nameLower = psName.toLowerCase();

      const isUser = userKeywords.some(kw => nameLower.includes(kw));
      const isAdmin = adminKeywords.some(kw => nameLower.includes(kw));

      if (isAdmin) {
        tiers.admin.push(psName);
      } else if (isUser) {
        tiers.users.push(psName);
      } else {
        tiers.unknown.push(psName);
      }
    }

    return tiers;
  }

  /**
   * Identify orphaned sets (not part of detected initiatives)
   */
  identifyOrphanedSets(customSets, initiatives) {
    const initiativeSets = new Set();

    for (const initiative of initiatives) {
      for (const psName of initiative.permissionSets) {
        initiativeSets.add(psName);
      }
    }

    return customSets
      .filter(ps => !initiativeSets.has(ps.name))
      .map(ps => ({
        name: ps.name,
        label: ps.label,
        assignments: ps.assignments.length
      }));
  }

  /**
   * Generate human-readable summary
   */
  generateSummary() {
    const summary = {
      totalSets: this.results.totalPermissionSets,
      customSets: this.results.customPermissionSets,
      managedSets: this.results.managedPermissionSets,
      initiatives: this.results.initiatives.length,
      highFragmentation: 0,
      mediumFragmentation: 0,
      lowFragmentation: 0,
      orphanedSets: this.results.orphanedSets.length,
      text: ''
    };

    // Count by risk level
    for (const initiative of this.results.initiatives) {
      if (initiative.riskLevel === 'HIGH') {
        summary.highFragmentation++;
      } else if (initiative.riskLevel === 'MEDIUM') {
        summary.mediumFragmentation++;
      } else {
        summary.lowFragmentation++;
      }
    }

    // Generate text summary
    const lines = [];
    lines.push(`📊 Discovery Summary for ${this.org}`);
    lines.push(`\nPermission Sets: ${summary.totalSets} (${summary.customSets} custom, ${summary.managedSets} managed)`);
    lines.push(`\nInitiatives Detected: ${summary.initiatives}`);

    if (summary.highFragmentation > 0) {
      lines.push(`  🔴 HIGH Priority: ${summary.highFragmentation}`);
    }
    if (summary.mediumFragmentation > 0) {
      lines.push(`  🟡 MEDIUM Priority: ${summary.mediumFragmentation}`);
    }
    if (summary.lowFragmentation > 0) {
      lines.push(`  🟢 LOW Priority: ${summary.lowFragmentation}`);
    }

    if (summary.orphanedSets > 0) {
      lines.push(`\nOrphaned Sets: ${summary.orphanedSets} (not part of any detected initiative)`);
    }

    summary.text = lines.join('\n');

    return summary;
  }

  /**
   * Logging utility
   */
  log(level, message) {
    if (!this.verbose && level === 'debug') return;

    const timestamp = new Date().toISOString();
    const prefix = level.toUpperCase().padEnd(5);
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }
}

// CLI execution
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.org) {
    console.error('❌ Error: --org is required');
    printHelp();
    process.exit(1);
  }

  const discovery = new PermissionSetDiscovery(args);
  const result = await discovery.discover();

  // Print summary
  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ Discovery Complete\n');
    console.log(result.summary.text);
  } else {
    console.log('❌ Discovery Failed');
    console.log(`\nError: ${result.error}`);
  }
  console.log('='.repeat(80));

  process.exit(result.success ? 0 : 1);
}

function parseArgs(argv) {
  const args = {
    help: false,
    org: null,
    initiative: null,
    output: null,
    verbose: false
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--org':
      case '-o':
        args.org = argv[++i];
        break;
      case '--initiative':
      case '-i':
        args.initiative = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Permission Set Discovery - Phase 1 of Assessment Wizard
========================================================

USAGE:
  node permission-set-discovery.js --org <alias> [OPTIONS]

OPTIONS:
  --org, -o <alias>        Salesforce org alias (REQUIRED)
  --initiative, -i <name>  Focus on specific initiative (optional)
  --output <file>          Save report to JSON file
  --verbose, -v            Detailed output
  --help, -h               Show this help

EXAMPLES:

  # Discover all permission sets
  node permission-set-discovery.js --org myOrg

  # Focus on CPQ initiative
  node permission-set-discovery.js --org myOrg --initiative CPQ

  # Save detailed report
  node permission-set-discovery.js --org myOrg --output discovery-report.json --verbose

OUTPUT:
  - Discovery report with detected initiatives
  - Fragmentation scores and risk levels
  - Consolidation opportunities
  - Orphaned permission sets

NEXT STEPS:
  1. Review discovery report
  2. Run permission-set-analyzer.js for detailed analysis
  3. Generate migration plan with permission-set-migration-planner.js
`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

// Export for programmatic usage
module.exports = PermissionSetDiscovery;
