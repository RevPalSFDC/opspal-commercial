#!/usr/bin/env node

/**
 * Permission Set Migration Planner - Generate executable migration plans
 *
 * Purpose: Phase 3 of Permission Set Assessment Wizard
 * - Maps legacy permission sets to canonical Users/Admin
 * - Creates step-by-step migration plans
 * - Generates rollback procedures
 * - Estimates effort and timeline
 * - Provides validation checkpoints
 *
 * Usage:
 *   node permission-set-migration-planner.js --analysis analysis-report.json --org myOrg
 *   node permission-set-migration-planner.js --initiative CPQ --org myOrg
 *   node permission-set-migration-planner.js --analysis analysis-report.json --output migration-plan.json
 *
 * Input: Analysis report from permission-set-analyzer.js
 * Output: Executable migration plan JSON
 *
 * @author RevPal Engineering
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PermissionSetMigrationPlanner {
  constructor(options = {}) {
    this.org = options.org || process.env.SF_ORG;
    this.verbose = options.verbose || false;
    this.analysisReport = options.analysisReport || null;
    this.focusInitiative = options.initiative || null;
    this.outputPath = options.output || null;
    this.gracePeriodDays = options.gracePeriod || 30;

    // Planning results
    this.results = {
      org: this.org,
      planningDate: new Date().toISOString(),
      plans: [],
      errors: []
    };
  }

  /**
   * Main planning workflow
   */
  async plan() {
    this.log('info', `📋 Starting migration planning for org: ${this.org}`);

    try {
      // Step 1: Load analysis report
      const analysisData = await this.loadAnalysisData();

      // Step 2: Filter to focus initiative if specified
      let initiativesToPlan = analysisData.initiatives;
      if (this.focusInitiative) {
        initiativesToPlan = analysisData.initiatives.filter(
          init => init.initiative.toLowerCase() === this.focusInitiative.toLowerCase()
        );

        if (initiativesToPlan.length === 0) {
          throw new Error(`Initiative "${this.focusInitiative}" not found in analysis report`);
        }
      }

      this.log('info', `Planning migration for ${initiativesToPlan.length} initiative(s)`);

      // Step 3: Create migration plan for each initiative
      for (const initiative of initiativesToPlan) {
        this.log('info', `Planning: ${initiative.initiative}`);
        const plan = this.createMigrationPlan(initiative);
        this.results.plans.push(plan);
      }

      // Step 4: Output results
      if (this.outputPath) {
        fs.writeFileSync(this.outputPath, JSON.stringify(this.results, null, 2));
        this.log('info', `✅ Migration plan saved to: ${this.outputPath}`);
      }

      return {
        success: true,
        results: this.results
      };

    } catch (error) {
      this.log('error', `Planning failed: ${error.message}`);
      this.results.errors.push({
        phase: 'planning',
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
   * Load analysis data
   */
  async loadAnalysisData() {
    if (this.analysisReport) {
      if (!fs.existsSync(this.analysisReport)) {
        throw new Error(`Analysis report not found: ${this.analysisReport}`);
      }

      const content = fs.readFileSync(this.analysisReport, 'utf-8');
      return JSON.parse(content);

    } else {
      // Run analyzer
      this.log('info', 'No analysis report provided, running analyzer...');
      const PermissionSetAnalyzer = require('./permission-set-analyzer');
      const analyzer = new PermissionSetAnalyzer({
        org: this.org,
        verbose: this.verbose
      });
      const result = await analyzer.analyze();

      if (!result.success) {
        throw new Error('Analysis failed');
      }

      return result.results;
    }
  }

  /**
   * Create migration plan for initiative
   */
  createMigrationPlan(initiative) {
    const plan = {
      planId: this.generatePlanId(),
      initiative: initiative.initiative,
      initiativeSlug: this.toKebabCase(initiative.initiative),
      projectName: this.toProjectName(initiative.initiative),
      status: 'PENDING_APPROVAL',
      createdDate: new Date().toISOString(),
      org: this.org,

      // From analysis
      currentState: this.summarizeCurrentState(initiative),
      targetState: this.defineTargetState(initiative),

      // Migration steps
      migrationSteps: [],
      rollbackPlan: null,

      // Metadata
      riskAssessment: initiative.riskAssessment,
      estimatedEffort: initiative.estimatedEffort,
      validationChecks: []
    };

    // Step 1: Generate migration steps
    plan.migrationSteps = this.generateMigrationSteps(initiative, plan);

    // Step 2: Generate rollback plan
    plan.rollbackPlan = this.generateRollbackPlan(initiative, plan);

    // Step 3: Define validation checks
    plan.validationChecks = this.defineValidationChecks(initiative, plan);

    return plan;
  }

  /**
   * Summarize current state
   */
  summarizeCurrentState(initiative) {
    return {
      permissionSets: initiative.discoveryData.permissionSets,
      totalSets: initiative.discoveryData.permissionSets.length,
      totalAssignments: initiative.discoveryData.totalAssignments,
      fragmentationScore: initiative.discoveryData.fragmentationScore,
      averageOverlap: initiative.overlapAnalysis.averageOverlap,
      tierDistribution: {
        users: initiative.discoveryData.tierAnalysis.users.length,
        admin: initiative.discoveryData.tierAnalysis.admin.length,
        unknown: initiative.discoveryData.tierAnalysis.unknown.length
      }
    };
  }

  /**
   * Define target state
   */
  defineTargetState(initiative) {
    const projectName = this.toProjectName(initiative.initiative);

    return {
      canonicalSets: [
        `${projectName} - Users`,
        `${projectName} - Admin`
      ],
      totalSets: 2,
      structure: 'Two-tier architecture (Users/Admin)',
      benefits: [
        'Eliminate duplication',
        'Clear permission structure',
        'Easier to manage and audit',
        'Follows best practices'
      ]
    };
  }

  /**
   * Generate migration steps
   */
  generateMigrationSteps(initiative, plan) {
    const steps = [];
    let stepNumber = 1;

    // Step 1: Backup
    steps.push({
      step: stepNumber++,
      phase: 'BACKUP',
      action: 'Backup existing permission sets',
      description: 'Retrieve and save all current permission sets before making changes',
      command: this.generateBackupCommand(initiative),
      estimatedTime: `${initiative.discoveryData.permissionSets.length * 2} minutes`,
      critical: true,
      dependencies: [],
      rollbackRequired: false
    });

    // Step 2: Create canonical Users permission set
    if (initiative.discoveryData.tierAnalysis.users.length > 0) {
      steps.push({
        step: stepNumber++,
        phase: 'CREATE_CANONICAL',
        action: 'Create canonical Users permission set',
        description: `Merge permissions from ${initiative.discoveryData.tierAnalysis.users.length} user-tier sets into "${plan.targetState.canonicalSets[0]}"`,
        command: this.generateCreateCommand(initiative, 'users', plan),
        estimatedTime: '5 minutes',
        critical: true,
        dependencies: [1],
        rollbackRequired: true
      });
    }

    // Step 3: Create canonical Admin permission set
    if (initiative.discoveryData.tierAnalysis.admin.length > 0) {
      steps.push({
        step: stepNumber++,
        phase: 'CREATE_CANONICAL',
        action: 'Create canonical Admin permission set',
        description: `Merge permissions from ${initiative.discoveryData.tierAnalysis.admin.length} admin-tier sets into "${plan.targetState.canonicalSets[1]}"`,
        command: this.generateCreateCommand(initiative, 'admin', plan),
        estimatedTime: '5 minutes',
        critical: true,
        dependencies: [1],
        rollbackRequired: true
      });
    }

    // Step 4: Migrate user assignments
    const createSteps = steps.filter(s => s.phase === 'CREATE_CANONICAL').map(s => s.step);
    steps.push({
      step: stepNumber++,
      phase: 'MIGRATE_ASSIGNMENTS',
      action: 'Migrate user assignments to new canonical sets',
      description: `Reassign ${initiative.discoveryData.totalAssignments} users from old sets to new canonical sets`,
      command: this.generateAssignmentMigrationCommand(initiative, plan),
      usersToMigrate: initiative.discoveryData.totalAssignments,
      estimatedTime: `${Math.ceil(initiative.discoveryData.totalAssignments * 0.5)} minutes`,
      critical: true,
      dependencies: createSteps,
      rollbackRequired: true,
      phasedApproach: initiative.discoveryData.totalAssignments > 20
    });

    // Step 5: Validation
    steps.push({
      step: stepNumber++,
      phase: 'VALIDATION',
      action: 'Verify user access and permissions',
      description: 'Run validation checks to ensure no users lost access',
      command: this.generateValidationCommand(initiative, plan),
      validationChecks: plan.validationChecks,
      estimatedTime: '5 minutes',
      critical: true,
      dependencies: [stepNumber - 1],
      rollbackRequired: false
    });

    // Step 6: Grace period
    steps.push({
      step: stepNumber++,
      phase: 'GRACE_PERIOD',
      action: `Wait ${this.gracePeriodDays} days before deactivation`,
      description: 'Monitor for issues, allow time to verify no access problems',
      reason: 'Ensure migration stability before removing old sets',
      estimatedTime: `${this.gracePeriodDays} days`,
      critical: false,
      dependencies: [stepNumber - 1],
      rollbackRequired: false,
      optional: false,
      skipInSandbox: true
    });

    // Step 7: Deactivate old sets
    steps.push({
      step: stepNumber++,
      phase: 'DEACTIVATE',
      action: 'Deactivate old permission sets',
      description: 'Mark old permission sets as inactive (do not delete yet)',
      setsToDeactivate: initiative.discoveryData.permissionSets,
      command: this.generateDeactivationCommand(initiative),
      estimatedTime: `${initiative.discoveryData.permissionSets.length * 2} minutes`,
      critical: false,
      dependencies: [stepNumber - 1],
      rollbackRequired: true,
      warning: 'Do not delete sets immediately - keep for additional 30 days'
    });

    return steps;
  }

  /**
   * Generate rollback plan
   */
  generateRollbackPlan(initiative, plan) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return {
      backupLocation: `backups/${this.org}/${timestamp}/`,
      estimatedRollbackTime: '15-20 minutes',
      steps: [
        {
          step: 1,
          action: 'Retrieve original permission sets from backup',
          command: `sf project retrieve start --metadata "PermissionSet:..." --target-org ${this.org}`,
          estimatedTime: '5 minutes'
        },
        {
          step: 2,
          action: 'Reactivate original permission sets',
          command: `# Use Salesforce UI or API to reactivate`,
          estimatedTime: '3 minutes'
        },
        {
          step: 3,
          action: 'Restore user assignments from backup',
          command: this.generateAssignmentRestoreCommand(initiative),
          estimatedTime: '5 minutes'
        },
        {
          step: 4,
          action: 'Deactivate new canonical permission sets',
          command: `# Mark new sets as inactive`,
          estimatedTime: '2 minutes'
        },
        {
          step: 5,
          action: 'Verify user access restored',
          command: this.generateValidationCommand(initiative, plan),
          estimatedTime: '3 minutes'
        }
      ],
      prerequisites: [
        'Backup files exist in specified location',
        'No manual changes made since migration',
        'All user assignment data preserved in backup'
      ],
      warnings: [
        'Rollback may take 15-20 minutes during which users have disrupted access',
        'Any manual changes made after migration will be lost',
        'Rollback should be done in maintenance window'
      ]
    };
  }

  /**
   * Define validation checks
   */
  defineValidationChecks(initiative, plan) {
    return [
      {
        check: 'canonical_sets_exist',
        description: 'Verify canonical permission sets were created',
        query: `SELECT Id, Name FROM PermissionSet WHERE Name IN ('${plan.targetState.canonicalSets.join("','")}')`,
        expectedCount: plan.targetState.canonicalSets.length,
        critical: true
      },
      {
        check: 'all_users_assigned',
        description: 'Verify all users have new assignments',
        query: `SELECT COUNT(Id) FROM PermissionSetAssignment WHERE PermissionSet.Name IN ('${plan.targetState.canonicalSets.join("','")}')`,
        expectedCount: initiative.discoveryData.totalAssignments,
        critical: true
      },
      {
        check: 'no_lost_access',
        description: 'Verify no users lost object access',
        query: `# Manual verification required`,
        expectedResult: 'All users can access required objects',
        critical: true
      },
      {
        check: 'fls_preserved',
        description: 'Verify field-level security is preserved or upgraded',
        query: `SELECT COUNT(Id) FROM FieldPermissions WHERE Parent.Name IN ('${plan.targetState.canonicalSets.join("','")}')`,
        expectedMinimum: 'At least as many field permissions as before',
        critical: true
      },
      {
        check: 'old_assignments_removed',
        description: 'Verify old permission set assignments are removed',
        query: `SELECT COUNT(Id) FROM PermissionSetAssignment WHERE PermissionSet.Name IN ('${initiative.discoveryData.permissionSets.join("','")}')`,
        expectedCount: 0,
        critical: false,
        runAfterGracePeriod: true
      }
    ];
  }

  /**
   * Generate command strings
   */
  generateBackupCommand(initiative) {
    const setsList = initiative.discoveryData.permissionSets.map(s => `PermissionSet:${s}`).join(' ');
    return `sf project retrieve start --metadata ${setsList} --target-org ${this.org}`;
  }

  generateCreateCommand(initiative, tier, plan) {
    const configFile = `${plan.initiativeSlug}-migration-${tier}.json`;
    return `node scripts/lib/permission-set-cli.js --input instances/${this.org}/permissions/${configFile} --org ${this.org}`;
  }

  generateAssignmentMigrationCommand(initiative, plan) {
    const scriptPath = `scripts/lib/migrate-permission-set-assignments.js`;
    return `node ${scriptPath} --from-sets "${initiative.discoveryData.permissionSets.join(',')}" --to-sets "${plan.targetState.canonicalSets.join(',')}" --org ${this.org}`;
  }

  generateValidationCommand(initiative, plan) {
    return `node scripts/lib/validate-permission-migration.js --plan ${plan.planId} --org ${this.org}`;
  }

  generateDeactivationCommand(initiative) {
    return `# Use Salesforce Setup UI to mark permission sets as inactive`;
  }

  generateAssignmentRestoreCommand(initiative) {
    return `node scripts/lib/restore-permission-set-assignments.js --backup backups/${this.org}/ --org ${this.org}`;
  }

  /**
   * Utility functions
   */
  generatePlanId() {
    return `plan-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  toKebabCase(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  toProjectName(str) {
    // Convert "CPQ" to "CPQ" (keep uppercase acronyms)
    // Convert "subscription management" to "Subscription Management"
    return str
      .split(/[\s_-]+/)
      .map(word => {
        // Keep all-caps acronyms
        if (word === word.toUpperCase()) {
          return word;
        }
        // Title case for regular words
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

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

  const planner = new PermissionSetMigrationPlanner(args);
  const result = await planner.plan();

  // Print summary
  console.log('\n' + '='.repeat(80));
  if (result.success) {
    console.log('✅ Migration Plan Complete\n');

    for (const plan of result.results.plans) {
      console.log(`\n📋 Plan: ${plan.initiative}`);
      console.log(`   Plan ID: ${plan.planId}`);
      console.log(`   Status: ${plan.status}`);
      console.log(`   Target: ${plan.targetState.canonicalSets.join(', ')}`);
      console.log(`   Steps: ${plan.migrationSteps.length}`);
      console.log(`   Estimated Effort: ${plan.estimatedEffort.totalTime}`);
      console.log(`   Risk Level: ${plan.riskAssessment.level}`);

      // Show steps
      console.log(`\n   Migration Steps:`);
      for (const step of plan.migrationSteps) {
        const icon = step.critical ? '🔴' : '🟡';
        console.log(`     ${icon} ${step.step}. ${step.action} (${step.estimatedTime})`);
      }
    }
  } else {
    console.log('❌ Planning Failed');
    console.log(`\nError: ${result.error}`);
  }
  console.log('='.repeat(80));

  process.exit(result.success ? 0 : 1);
}

function parseArgs(argv) {
  const args = {
    help: false,
    org: null,
    analysisReport: null,
    initiative: null,
    output: null,
    gracePeriod: 30,
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
      case '--analysis':
      case '-a':
        args.analysisReport = argv[++i];
        break;
      case '--initiative':
      case '-i':
        args.initiative = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--grace-period':
        args.gracePeriod = parseInt(argv[++i]);
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
Permission Set Migration Planner - Phase 3 of Assessment Wizard
================================================================

USAGE:
  node permission-set-migration-planner.js --org <alias> [OPTIONS]

OPTIONS:
  --org, -o <alias>          Salesforce org alias (REQUIRED)
  --analysis, -a <file>      Analysis report JSON (optional, will run analyzer if not provided)
  --initiative, -i <name>    Focus on specific initiative (optional)
  --output <file>            Save migration plan to JSON file
  --grace-period <days>      Grace period before deactivation (default: 30)
  --verbose, -v              Detailed output
  --help, -h                 Show this help

EXAMPLES:

  # Generate plan from analysis report
  node permission-set-migration-planner.js --org myOrg --analysis analysis-report.json

  # Run analysis + planning
  node permission-set-migration-planner.js --org myOrg

  # Focus on CPQ with custom grace period
  node permission-set-migration-planner.js --org myOrg --initiative CPQ --grace-period 60 --output cpq-plan.json

OUTPUT:
  - Executable migration plan with 7 steps
  - Rollback procedures
  - Validation checks
  - Effort estimates
  - Risk assessment

NEXT STEPS:
  1. Review migration plan carefully
  2. Get approval from stakeholders
  3. Test in sandbox environment
  4. Execute via CLI or assessment wizard agent
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
module.exports = PermissionSetMigrationPlanner;
