#!/usr/bin/env node

/**
 * Permission Set Analyzer - Analyze fragmentation and identify consolidation opportunities
 *
 * Purpose: Phase 2 of Permission Set Assessment Wizard
 * - Analyzes permission overlap between sets
 * - Detects redundant permissions
 * - Calculates consolidation opportunities
 * - Assesses migration risk
 * - Generates actionable recommendations
 *
 * Usage:
 *   node permission-set-analyzer.js --discovery discovery-report.json --org myOrg
 *   node permission-set-analyzer.js --initiative CPQ --org myOrg
 *   node permission-set-analyzer.js --discovery discovery-report.json --output analysis-report.json
 *
 * Input: Discovery report from permission-set-discovery.js
 * Output: Analysis report with overlap analysis and recommendations
 *
 * @author RevPal Engineering
 * @version 1.0.0
 * @date 2025-10-22
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const PermissionSetRetriever = require('./permission-set-orchestrator').PermissionSetRetriever;

class PermissionSetAnalyzer {
  constructor(options = {}) {
    this.org = options.org || process.env.SF_ORG;
    this.verbose = options.verbose || false;
    this.discoveryReport = options.discoveryReport || null;
    this.focusInitiative = options.initiative || null;
    this.outputPath = options.output || null;

    // Analysis results
    this.results = {
      org: this.org,
      analysisDate: new Date().toISOString(),
      initiatives: [],
      errors: []
    };
  }

  /**
   * Main analysis workflow
   */
  async analyze() {
    this.log('info', `📊 Starting permission set analysis for org: ${this.org}`);

    try {
      // Step 1: Load discovery report or run discovery
      const discoveryData = await this.loadDiscoveryData();

      // Step 2: Filter to focus initiative if specified
      let initiativesToAnalyze = discoveryData.initiatives;
      if (this.focusInitiative) {
        initiativesToAnalyze = discoveryData.initiatives.filter(
          init => init.detectedName.toLowerCase() === this.focusInitiative.toLowerCase()
        );

        if (initiativesToAnalyze.length === 0) {
          throw new Error(`Initiative "${this.focusInitiative}" not found in discovery report`);
        }
      }

      this.log('info', `Analyzing ${initiativesToAnalyze.length} initiative(s)`);

      // Step 3: Analyze each initiative in detail
      for (const initiative of initiativesToAnalyze) {
        this.log('info', `Analyzing: ${initiative.detectedName}`);
        const analysis = await this.analyzeInitiative(initiative);
        this.results.initiatives.push(analysis);
      }

      // Step 4: Output results
      if (this.outputPath) {
        fs.writeFileSync(this.outputPath, JSON.stringify(this.results, null, 2));
        this.log('info', `✅ Analysis report saved to: ${this.outputPath}`);
      }

      return {
        success: true,
        results: this.results
      };

    } catch (error) {
      this.log('error', `Analysis failed: ${error.message}`);
      this.results.errors.push({
        phase: 'analysis',
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
   * Load discovery data
   */
  async loadDiscoveryData() {
    if (this.discoveryReport) {
      // Load from file
      if (!fs.existsSync(this.discoveryReport)) {
        throw new Error(`Discovery report not found: ${this.discoveryReport}`);
      }

      const content = fs.readFileSync(this.discoveryReport, 'utf-8');
      return JSON.parse(content);

    } else {
      // Run discovery
      this.log('info', 'No discovery report provided, running discovery...');
      const PermissionSetDiscovery = require('./permission-set-discovery');
      const discovery = new PermissionSetDiscovery({ org: this.org, verbose: this.verbose });
      const result = await discovery.discover();

      if (!result.success) {
        throw new Error('Discovery failed');
      }

      return result.results;
    }
  }

  /**
   * Analyze initiative in detail
   */
  async analyzeInitiative(initiative) {
    const analysis = {
      initiative: initiative.detectedName,
      discoveryData: {
        permissionSets: initiative.permissionSets,
        totalAssignments: initiative.totalAssignments,
        fragmentationScore: initiative.fragmentationScore,
        riskLevel: initiative.riskLevel,
        tierAnalysis: initiative.tierAnalysis
      },
      permissionAnalysis: null,
      overlapAnalysis: null,
      consolidationOpportunities: [],
      riskAssessment: null,
      recommendations: [],
      estimatedEffort: null
    };

    // Step 1: Retrieve full permission metadata
    const permissionMetadata = await this.retrievePermissionMetadata(initiative);
    analysis.permissionAnalysis = permissionMetadata;

    // Step 2: Calculate overlap between permission sets
    const overlapMatrix = this.calculateOverlapMatrix(permissionMetadata);
    analysis.overlapAnalysis = overlapMatrix;

    // Step 3: Identify consolidation opportunities
    const opportunities = this.identifyConsolidationOpportunities(
      initiative,
      permissionMetadata,
      overlapMatrix
    );
    analysis.consolidationOpportunities = opportunities;

    // Step 4: Assess migration risks
    const risks = this.assessMigrationRisks(initiative, permissionMetadata);
    analysis.riskAssessment = risks;

    // Step 5: Generate recommendations
    const recommendations = this.generateRecommendations(
      initiative,
      opportunities,
      risks
    );
    analysis.recommendations = recommendations;

    // Step 6: Estimate migration effort
    const effort = this.estimateMigrationEffort(initiative, permissionMetadata);
    analysis.estimatedEffort = effort;

    return analysis;
  }

  /**
   * Retrieve full permission metadata for each set
   */
  async retrievePermissionMetadata(initiative) {
    this.log('debug', 'Retrieving permission metadata...');

    const metadata = [];

    for (const psName of initiative.permissionSets) {
      try {
        // Query permission set details
        const details = await this.queryPermissionSetDetails(psName);
        metadata.push(details);

      } catch (error) {
        this.log('warn', `Failed to retrieve metadata for ${psName}: ${error.message}`);
        metadata.push({
          name: psName,
          error: error.message,
          fieldPermissions: [],
          objectPermissions: [],
          tabSettings: [],
          recordTypeVisibilities: []
        });
      }
    }

    return metadata;
  }

  /**
   * Query permission set details from org
   */
  async queryPermissionSetDetails(psName) {
    // Query field permissions
    const fieldPermsQuery = `
      SELECT Parent.Name, SobjectType, Field, PermissionsRead, PermissionsEdit
      FROM FieldPermissions
      WHERE Parent.Name = '${psName}'
    `;

    // Query object permissions
    const objectPermsQuery = `
      SELECT Parent.Name, SobjectType, PermissionsRead, PermissionsCreate,
             PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords,
             PermissionsModifyAllRecords
      FROM ObjectPermissions
      WHERE Parent.Name = '${psName}'
    `;

    try {
      const fieldPermsCmd = `sf data query --query "${fieldPermsQuery.replace(/\n/g, ' ')}" --target-org ${this.org} --json`;
      const objectPermsCmd = `sf data query --query "${objectPermsQuery.replace(/\n/g, ' ')}" --target-org ${this.org} --json`;

      const fieldPermsResult = JSON.parse(execSync(fieldPermsCmd, { encoding: 'utf-8' }));
      const objectPermsResult = JSON.parse(execSync(objectPermsCmd, { encoding: 'utf-8' }));

      return {
        name: psName,
        fieldPermissions: (fieldPermsResult.result?.records || []).map(r => ({
          object: r.SobjectType,
          field: r.Field.split('.')[1], // Extract field name
          readable: r.PermissionsRead,
          editable: r.PermissionsEdit
        })),
        objectPermissions: (objectPermsResult.result?.records || []).map(r => ({
          object: r.SobjectType,
          read: r.PermissionsRead,
          create: r.PermissionsCreate,
          edit: r.PermissionsEdit,
          delete: r.PermissionsDelete,
          viewAll: r.PermissionsViewAllRecords,
          modifyAll: r.PermissionsModifyAllRecords
        })),
        tabSettings: [], // Would need separate query
        recordTypeVisibilities: [] // Would need separate query
      };

    } catch (error) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  /**
   * Calculate overlap matrix between permission sets
   */
  calculateOverlapMatrix(permissionMetadata) {
    const matrix = {
      pairwise: [],
      averageOverlap: 0
    };

    // Compare each pair
    for (let i = 0; i < permissionMetadata.length; i++) {
      for (let j = i + 1; j < permissionMetadata.length; j++) {
        const ps1 = permissionMetadata[i];
        const ps2 = permissionMetadata[j];

        const overlap = this.calculatePairwiseOverlap(ps1, ps2);
        matrix.pairwise.push(overlap);
      }
    }

    // Calculate average
    if (matrix.pairwise.length > 0) {
      const sum = matrix.pairwise.reduce((acc, pair) => acc + pair.overlapPercentage, 0);
      matrix.averageOverlap = Math.round(sum / matrix.pairwise.length);
    }

    return matrix;
  }

  /**
   * Calculate overlap between two permission sets
   */
  calculatePairwiseOverlap(ps1, ps2) {
    // Field permissions overlap
    const ps1Fields = new Set(
      ps1.fieldPermissions.map(fp => `${fp.object}.${fp.field}`)
    );
    const ps2Fields = new Set(
      ps2.fieldPermissions.map(fp => `${fp.object}.${fp.field}`)
    );

    const commonFields = new Set([...ps1Fields].filter(f => ps2Fields.has(f)));
    const totalFields = new Set([...ps1Fields, ...ps2Fields]);

    const fieldOverlap = totalFields.size > 0
      ? (commonFields.size / totalFields.size) * 100
      : 0;

    // Object permissions overlap
    const ps1Objects = new Set(ps1.objectPermissions.map(op => op.object));
    const ps2Objects = new Set(ps2.objectPermissions.map(op => op.object));

    const commonObjects = new Set([...ps1Objects].filter(o => ps2Objects.has(o)));
    const totalObjects = new Set([...ps1Objects, ...ps2Objects]);

    const objectOverlap = totalObjects.size > 0
      ? (commonObjects.size / totalObjects.size) * 100
      : 0;

    // Weighted average (field permissions more important)
    const overlapPercentage = Math.round(
      fieldOverlap * 0.7 + objectOverlap * 0.3
    );

    return {
      set1: ps1.name,
      set2: ps2.name,
      overlapPercentage,
      fieldOverlap: Math.round(fieldOverlap),
      objectOverlap: Math.round(objectOverlap),
      commonFields: Array.from(commonFields),
      uniqueToSet1: ps1Fields.size - commonFields.size,
      uniqueToSet2: ps2Fields.size - commonFields.size
    };
  }

  /**
   * Identify consolidation opportunities
   */
  identifyConsolidationOpportunities(initiative, permissionMetadata, overlapMatrix) {
    const opportunities = [];

    // Opportunity 1: High overlap between similar-tier sets
    const userTierSets = initiative.tierAnalysis.users;
    const adminTierSets = initiative.tierAnalysis.admin;

    if (userTierSets.length > 1) {
      // Calculate average overlap within user tier
      const userOverlaps = overlapMatrix.pairwise.filter(pair =>
        userTierSets.includes(pair.set1) && userTierSets.includes(pair.set2)
      );

      if (userOverlaps.length > 0) {
        const avgUserOverlap = userOverlaps.reduce((sum, pair) => sum + pair.overlapPercentage, 0) / userOverlaps.length;

        if (avgUserOverlap > 60) {
          opportunities.push({
            type: 'CONSOLIDATE_USER_TIER',
            sets: userTierSets,
            reason: `${Math.round(avgUserOverlap)}% average permission overlap in user-tier sets`,
            suggestedTarget: `${initiative.detectedName} - Users`,
            confidence: avgUserOverlap > 80 ? 'HIGH' : avgUserOverlap > 70 ? 'MEDIUM' : 'LOW',
            benefit: 'Eliminate duplication, simplify management'
          });
        }
      }
    }

    if (adminTierSets.length > 1) {
      // Similar logic for admin tier
      const adminOverlaps = overlapMatrix.pairwise.filter(pair =>
        adminTierSets.includes(pair.set1) && adminTierSets.includes(pair.set2)
      );

      if (adminOverlaps.length > 0) {
        const avgAdminOverlap = adminOverlaps.reduce((sum, pair) => sum + pair.overlapPercentage, 0) / adminOverlaps.length;

        if (avgAdminOverlap > 60) {
          opportunities.push({
            type: 'CONSOLIDATE_ADMIN_TIER',
            sets: adminTierSets,
            reason: `${Math.round(avgAdminOverlap)}% average permission overlap in admin-tier sets`,
            suggestedTarget: `${initiative.detectedName} - Admin`,
            confidence: avgAdminOverlap > 80 ? 'HIGH' : avgAdminOverlap > 70 ? 'MEDIUM' : 'LOW',
            benefit: 'Standardize admin access, reduce complexity'
          });
        }
      }
    }

    // Opportunity 2: Unknown tier sets (should be categorized)
    if (initiative.tierAnalysis.unknown.length > 0) {
      opportunities.push({
        type: 'CATEGORIZE_UNKNOWN',
        sets: initiative.tierAnalysis.unknown,
        reason: 'Permission sets without clear user/admin designation',
        suggestedAction: 'Review and categorize into Users or Admin tier',
        confidence: 'MEDIUM',
        benefit: 'Clear permission structure'
      });
    }

    return opportunities;
  }

  /**
   * Assess migration risks
   */
  assessMigrationRisks(initiative, permissionMetadata) {
    const risks = {
      level: 'LOW',
      factors: [],
      mitigations: [],
      score: 0
    };

    // Risk factor 1: High user count
    if (initiative.totalAssignments > 50) {
      risks.factors.push('High number of user assignments (50+)');
      risks.score += 30;
    } else if (initiative.totalAssignments > 20) {
      risks.factors.push('Moderate number of user assignments (20-50)');
      risks.score += 15;
    }

    // Risk factor 2: Complex permission structure
    const totalPermissions = permissionMetadata.reduce(
      (sum, ps) => sum + ps.fieldPermissions.length + ps.objectPermissions.length,
      0
    );

    if (totalPermissions > 100) {
      risks.factors.push('Complex permission structure (100+ permissions)');
      risks.score += 20;
    }

    // Risk factor 3: Many permission sets to consolidate
    if (initiative.permissionSets.length > 5) {
      risks.factors.push(`Many sets to consolidate (${initiative.permissionSets.length})`);
      risks.score += 25;
    }

    // Risk factor 4: Production environment
    // (Would need to detect from org metadata)
    // For now, assume MEDIUM risk by default
    risks.factors.push('Assume production environment (verify in sandbox first)');
    risks.score += 20;

    // Determine level
    if (risks.score >= 70) {
      risks.level = 'HIGH';
    } else if (risks.score >= 40) {
      risks.level = 'MEDIUM';
    } else {
      risks.level = 'LOW';
    }

    // Mitigations
    if (risks.level === 'HIGH' || risks.level === 'MEDIUM') {
      risks.mitigations = [
        'Test migration in sandbox environment first',
        'Execute migration during maintenance window',
        'Migrate user assignments in phases (10 users at a time)',
        'Maintain 30-day grace period before deactivating old sets',
        'Keep rollback plan ready',
        'Monitor user reports for access issues',
        'Validate field-level security after each phase'
      ];
    } else {
      risks.mitigations = [
        'Test in sandbox first',
        'Maintain grace period before deactivation',
        'Keep rollback plan available'
      ];
    }

    return risks;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(initiative, opportunities, risks) {
    const recommendations = [];

    // Recommendation 1: Consolidation strategy
    if (opportunities.length > 0) {
      const primaryOpp = opportunities.find(o => o.type === 'CONSOLIDATE_USER_TIER');
      if (primaryOpp) {
        recommendations.push({
          priority: 'HIGH',
          action: 'CONSOLIDATE',
          description: `Consolidate ${primaryOpp.sets.length} user-tier permission sets into "${primaryOpp.suggestedTarget}"`,
          benefit: primaryOpp.benefit,
          confidence: primaryOpp.confidence
        });
      }

      const adminOpp = opportunities.find(o => o.type === 'CONSOLIDATE_ADMIN_TIER');
      if (adminOpp) {
        recommendations.push({
          priority: 'HIGH',
          action: 'CONSOLIDATE',
          description: `Consolidate ${adminOpp.sets.length} admin-tier permission sets into "${adminOpp.suggestedTarget}"`,
          benefit: adminOpp.benefit,
          confidence: adminOpp.confidence
        });
      }
    }

    // Recommendation 2: Risk mitigations
    if (risks.level === 'HIGH') {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'MITIGATE_RISKS',
        description: 'Address high-risk factors before migration',
        details: risks.mitigations
      });
    }

    // Recommendation 3: Phased approach
    if (initiative.totalAssignments > 20) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'PHASED_MIGRATION',
        description: 'Migrate user assignments in phases to reduce risk',
        details: [
          'Phase 1: Migrate 25% of users',
          'Phase 2: Wait 1 week, validate',
          'Phase 3: Migrate remaining 75%',
          'Phase 4: Monitor for 30 days before deactivation'
        ]
      });
    }

    // Recommendation 4: Documentation
    recommendations.push({
      priority: 'MEDIUM',
      action: 'DOCUMENT',
      description: 'Document migration plan and communicate to stakeholders',
      details: [
        'Create migration plan document',
        'Get approval from security/compliance team',
        'Notify affected users',
        'Schedule migration window',
        'Prepare rollback procedure'
      ]
    });

    return recommendations;
  }

  /**
   * Estimate migration effort
   */
  estimateMigrationEffort(initiative, permissionMetadata) {
    // Base time estimates
    let activeMinutes = 0;
    let gracePeriodDays = 30;

    // Backup: 2 minutes per permission set
    activeMinutes += initiative.permissionSets.length * 2;

    // Create canonical sets: 5 minutes per tier
    const tierCount = (initiative.tierAnalysis.users.length > 0 ? 1 : 0) +
                     (initiative.tierAnalysis.admin.length > 0 ? 1 : 0);
    activeMinutes += tierCount * 5;

    // Migrate assignments: 0.5 minutes per user
    activeMinutes += Math.ceil(initiative.totalAssignments * 0.5);

    // Validation: 5 minutes
    activeMinutes += 5;

    // Deactivation: 2 minutes per old set
    activeMinutes += initiative.permissionSets.length * 2;

    return {
      activeTime: `${activeMinutes} minutes`,
      gracePeriod: `${gracePeriodDays} days`,
      totalTime: `${activeMinutes} minutes active + ${gracePeriodDays} days grace period`,
      breakdown: {
        backup: `${initiative.permissionSets.length * 2} min`,
        createCanonical: `${tierCount * 5} min`,
        migrateAssignments: `${Math.ceil(initiative.totalAssignments * 0.5)} min`,
        validation: '5 min',
        deactivation: `${initiative.permissionSets.length * 2} min`
      }
    };
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

  const analyzer = new PermissionSetAnalyzer(args);
  const result = await analyzer.analyze();

  // Print summary
  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ Analysis Complete\n');

    for (const initiative of result.results.initiatives) {
      console.log(`\n📊 Initiative: ${initiative.initiative}`);
      console.log(`   Fragmentation Score: ${initiative.discoveryData.fragmentationScore}`);
      console.log(`   Risk Level: ${initiative.riskAssessment.level}`);
      console.log(`   Average Overlap: ${initiative.overlapAnalysis.averageOverlap}%`);
      console.log(`   Consolidation Opportunities: ${initiative.consolidationOpportunities.length}`);
      console.log(`   Estimated Effort: ${initiative.estimatedEffort.totalTime}`);
    }
  } else {
    console.log('❌ Analysis Failed');
    console.log(`\nError: ${result.error}`);
  }
  console.log('='.repeat(80));

  process.exit(result.success ? 0 : 1);
}

function parseArgs(argv) {
  const args = {
    help: false,
    org: null,
    discovery: null,
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
      case '--discovery':
      case '-d':
        args.discoveryReport = argv[++i];
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
Permission Set Analyzer - Phase 2 of Assessment Wizard
=======================================================

USAGE:
  node permission-set-analyzer.js --org <alias> [OPTIONS]

OPTIONS:
  --org, -o <alias>         Salesforce org alias (REQUIRED)
  --discovery, -d <file>    Discovery report JSON (optional, will run discovery if not provided)
  --initiative, -i <name>   Focus on specific initiative (optional)
  --output <file>           Save analysis to JSON file
  --verbose, -v             Detailed output
  --help, -h                Show this help

EXAMPLES:

  # Analyze with existing discovery report
  node permission-set-analyzer.js --org myOrg --discovery discovery-report.json

  # Run discovery + analysis
  node permission-set-analyzer.js --org myOrg

  # Focus on CPQ initiative
  node permission-set-analyzer.js --org myOrg --initiative CPQ --output cpq-analysis.json

OUTPUT:
  - Overlap analysis (pairwise and average)
  - Consolidation opportunities
  - Risk assessment with mitigations
  - Actionable recommendations
  - Effort estimates

NEXT STEPS:
  1. Review analysis report
  2. Generate migration plan with permission-set-migration-planner.js
  3. Execute via assessment wizard agent
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
module.exports = PermissionSetAnalyzer;
