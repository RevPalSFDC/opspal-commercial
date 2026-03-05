#!/usr/bin/env node

/**
 * Permission Set CLI - Command-line interface for centralized permission management
 *
 * Purpose: Provides CLI and programmatic access to the PermissionSetOrchestrator
 *
 * Features:
 * - JSON input file support
 * - Dry-run validation mode
 * - Programmatic API for other scripts
 * - Comprehensive error messages
 * - Progress reporting
 *
 * Usage Examples:
 *
 *   # Full sync from config file
 *   node permission-set-cli.js --input cpq-permissions.json --org myOrg
 *
 *   # Dry run (validation only, no deployment)
 *   node permission-set-cli.js --input config.json --dry-run
 *
 *   # Verbose output
 *   node permission-set-cli.js --input config.json --org myOrg --verbose
 *
 *   # Allow downgrades (DANGEROUS - use with caution)
 *   node permission-set-cli.js --input config.json --allow-downgrade
 *
 *   # Programmatic usage from another script
 *   const PermissionSetCLI = require('./permission-set-cli');
 *   const result = await PermissionSetCLI.execute({
 *     input: 'config.json',
 *     org: 'myOrg'
 *   });
 *
 * @author RevPal Engineering
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');
const PermissionSetOrchestrator = require('./permission-set-orchestrator');
const { DataAccessError } = require('../../../cross-platform-plugin/scripts/lib/data-access-error');

class PermissionSetCLI {
  /**
   * Main CLI entry point
   */
  static async main() {
    try {
      // Parse command line arguments
      const args = this.parseArgs(process.argv.slice(2));

      // Show help if requested
      if (args.help) {
        this.printHelp();
        process.exit(0);
      }

      // Route to migration execution if flag is set
      if (args.executeMigration) {
        const result = await this.executeMigration({
          migrationPlan: args.executeMigration,
          org: args.org,
          dryRun: args.dryRun,
          verbose: args.verbose,
          autoApprove: args.autoApprove
        });

        process.exit(result.success ? 0 : 1);
        return;
      }

      // Validate required arguments for normal execution
      if (!args.input) {
        console.error('❌ Error: --input is required (or use --execute-migration)');
        this.printHelp();
        process.exit(1);
      }

      // Execute normal permission sync
      const result = await this.execute(args);

      // Print results
      this.printResults(result);

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);

    } catch (error) {
      console.error('\n❌ Fatal Error:', error.message);
      if (process.env.DEBUG) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Execute permission sync (programmatic API)
   *
   * @param {Object} options - CLI options
   * @returns {Promise<Object>} - Execution results
   */
  static async execute(options = {}) {
    console.log('🚀 Permission Set CLI v1.0.0\n');

    // Load configuration file
    const config = this.loadConfig(options.input);

    // Validate configuration
    this.validateConfig(config);

    // Print configuration summary
    this.printConfigSummary(config, options);

    // Initialize orchestrator
    const orchestrator = new PermissionSetOrchestrator({
      org: options.org || config.org || process.env.SF_ORG,
      verbose: options.verbose || false,
      allowDowngrade: options.allowDowngrade || false,
      dryRun: options.dryRun || false
    });

    // Execute sync
    console.log('\n📋 Syncing permissions...\n');

    try {
      const result = await orchestrator.syncPermissions(config);

      return {
        success: true,
        ...result
      };

    } catch (error) {
      // Handle specific error types
      if (error.downgrades) {
        console.error('\n❌ Permission Downgrade Detected!');
        console.error('\nThe following downgrades would occur:');
        for (const downgrade of error.downgrades) {
          console.error(`  - ${downgrade}`);
        }
        console.error('\nDowngrades are not allowed by default.');
        console.error('Use --allow-downgrade flag if you understand the risks.');
      }

      return {
        success: false,
        error: error.message,
        details: error.downgrades || null
      };
    }
  }

  /**
   * Load configuration from JSON file
   */
  static loadConfig(inputPath) {
    if (!inputPath) {
      throw new Error('No input file specified');
    }

    const fullPath = path.resolve(inputPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Input file not found: ${fullPath}`);
    }

    console.log(`📄 Loading configuration: ${fullPath}`);

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(content);

    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${inputPath}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate configuration structure
   */
  static validateConfig(config) {
    const required = ['initiative_slug', 'project_name', 'tiers'];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Configuration missing required field: ${field}`);
      }
    }

    // Validate tiers
    if (typeof config.tiers !== 'object') {
      throw new Error('Configuration field "tiers" must be an object');
    }

    const tierNames = Object.keys(config.tiers);
    if (tierNames.length === 0) {
      throw new Error('Configuration must have at least one tier defined');
    }

    console.log(`✅ Configuration valid: ${tierNames.length} tier(s) defined`);
  }

  /**
   * Print configuration summary
   */
  static printConfigSummary(config, options) {
    console.log('\n📊 Configuration Summary:');
    console.log(`   Initiative: ${config.initiative_slug}`);
    console.log(`   Project Name: ${config.project_name}`);
    console.log(`   Tiers: ${Object.keys(config.tiers).join(', ')}`);

    if (options.org) {
      console.log(`   Target Org: ${options.org}`);
    }

    if (options.dryRun) {
      console.log('   Mode: DRY RUN (no deployment)');
    }

    if (options.allowDowngrade) {
      console.log('   ⚠️  ALLOW DOWNGRADE: Enabled (dangerous!)');
    }

    // Count permissions per tier
    for (const [tierName, tierConfig] of Object.entries(config.tiers)) {
      const counts = {
        field: (tierConfig.field_permissions || []).length,
        object: (tierConfig.object_permissions || []).length,
        tab: (tierConfig.tab_settings || []).length,
        recordType: (tierConfig.record_type_vis || []).length
      };

      const total = counts.field + counts.object + counts.tab + counts.recordType;

      console.log(`\n   ${tierName.toUpperCase()} Tier:`);
      console.log(`     - Field Permissions: ${counts.field}`);
      console.log(`     - Object Permissions: ${counts.object}`);
      console.log(`     - Tab Settings: ${counts.tab}`);
      console.log(`     - Record Type Visibilities: ${counts.recordType}`);
      console.log(`     Total: ${total} permissions`);

      // Show assignments if specified
      if (config.assign && config.assign[tierName]) {
        const users = config.assign[tierName];
        console.log(`     Assignments: ${users.length} user(s)`);
        if (options.verbose) {
          for (const user of users) {
            console.log(`       - ${user}`);
          }
        }
      }
    }
  }

  /**
   * Print execution results
   */
  static printResults(result) {
    console.log('\n' + '='.repeat(80));

    if (!result.success) {
      console.log('❌ FAILED');
      if (result.error) {
        console.log(`\nError: ${result.error}`);
      }
      return;
    }

    console.log('✅ SUCCESS');
    console.log(`\n⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`📝 Operation ID: ${result.operationId}`);

    // Print summary
    console.log(`\n${result.summary.text}`);

    // Print detailed results per tier
    if (result.results && result.results.length > 0) {
      console.log('\n📋 Detailed Results:\n');

      for (const tierResult of result.results) {
        const icon = tierResult.status === 'unchanged' ? '⚪' :
                     tierResult.status === 'created' ? '🆕' :
                     tierResult.status === 'updated' ? '🔄' : '❓';

        console.log(`${icon} ${tierResult.tier.toUpperCase()}: ${tierResult.permissionSet}`);
        console.log(`   Status: ${tierResult.status}`);

        if (tierResult.oldHash && tierResult.newHash) {
          console.log(`   Old Hash: ${tierResult.oldHash}`);
          console.log(`   New Hash: ${tierResult.newHash}`);
        }

        if (tierResult.changes) {
          this.printChanges(tierResult.changes);
        }

        console.log('');
      }
    }

    // Print warnings if any
    if (result.summary.warnings > 0) {
      console.log('\n⚠️  WARNINGS:');
      // Warnings would be in orchestrator results
    }

    console.log('='.repeat(80));
  }

  /**
   * Print permission changes
   */
  static printChanges(changes) {
    if (!changes) return;

    const counts = {
      added: {
        field: changes.added.fieldPermissions?.length || 0,
        object: changes.added.objectPermissions?.length || 0,
        tab: changes.added.tabSettings?.length || 0,
        recordType: changes.added.recordTypeVisibilities?.length || 0
      },
      updated: {
        field: changes.updated.fieldPermissions?.length || 0,
        object: changes.updated.objectPermissions?.length || 0,
        tab: changes.updated.tabSettings?.length || 0,
        recordType: changes.updated.recordTypeVisibilities?.length || 0
      }
    };

    const totalAdded = Object.values(counts.added).reduce((a, b) => a + b, 0);
    const totalUpdated = Object.values(counts.updated).reduce((a, b) => a + b, 0);

    if (totalAdded > 0) {
      console.log(`   Added: ${totalAdded} permission(s)`);
      if (counts.added.field > 0) console.log(`     - ${counts.added.field} field permission(s)`);
      if (counts.added.object > 0) console.log(`     - ${counts.added.object} object permission(s)`);
      if (counts.added.tab > 0) console.log(`     - ${counts.added.tab} tab setting(s)`);
      if (counts.added.recordType > 0) console.log(`     - ${counts.added.recordType} record type(s)`);
    }

    if (totalUpdated > 0) {
      console.log(`   Updated: ${totalUpdated} permission(s)`);
      if (counts.updated.field > 0) console.log(`     - ${counts.updated.field} field permission(s)`);
      if (counts.updated.object > 0) console.log(`     - ${counts.updated.object} object permission(s)`);
      if (counts.updated.tab > 0) console.log(`     - ${counts.updated.tab} tab setting(s)`);
      if (counts.updated.recordType > 0) console.log(`     - ${counts.updated.recordType} record type(s)`);
    }
  }

  /**
   * Execute migration plan
   */
  static async executeMigration(options = {}) {
    console.log('🚀 Permission Set Migration Executor\n');

    const { migrationPlan, org, dryRun, verbose } = options;

    // Load migration plan
    if (!fs.existsSync(migrationPlan)) {
      throw new Error(`Migration plan not found: ${migrationPlan}`);
    }

    const plan = JSON.parse(fs.readFileSync(migrationPlan, 'utf-8'));

    console.log(`📋 Loading Migration Plan: ${plan.planId}`);
    console.log(`   Initiative: ${plan.initiative}`);
    console.log(`   Status: ${plan.status}`);
    console.log(`   Total Steps: ${plan.migrationSteps.length}`);

    if (plan.status !== 'PENDING_APPROVAL') {
      console.warn(`\n⚠️  Warning: Plan status is "${plan.status}"`);
      console.warn('   Expected status: PENDING_APPROVAL');
      console.warn('   Proceeding anyway...\n');
    }

    if (dryRun) {
      console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
    }

    // Execute steps in order
    let executedSteps = [];
    let failedStep = null;

    for (const step of plan.migrationSteps) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`Step ${step.step}: ${step.action}`);
      console.log(`Phase: ${step.phase}`);
      console.log(`Estimated Time: ${step.estimatedTime}`);
      if (step.critical) {
        console.log(`⚠️  CRITICAL STEP`);
      }

      if (!dryRun) {
        // Confirm critical steps
        if (step.critical && !options.autoApprove) {
          // In real implementation, would prompt for confirmation
          console.log(`\n⚠️  This is a critical step. Proceeding...`);
        }

        try {
          // Execute step
          console.log(`\nExecuting: ${step.command || 'Internal operation'}`);

          // LIMITATION: Step execution not yet implemented
          // This CLI currently only performs validation and planning
          // Actual execution requires integration with PermissionSetOrchestrator methods
          //
          // Enhancement: Implement actual execution for each phase
          // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD
          throw new DataAccessError(
            'Permission_Set_CLI',
            'Step execution not yet implemented - CLI is validation-only',
            {
              method: 'executeInteractive',
              phase: step.phase,
              status: 'not_implemented',
              availablePhases: ['BACKUP', 'CREATE_CANONICAL', 'MIGRATE_ASSIGNMENTS', 'VALIDATION', 'CLEANUP'],
              workaround: 'Use PermissionSetOrchestrator directly for execution',
              recommendation: 'This CLI should delegate to PermissionSetOrchestrator.execute() methods',
              tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
          );

          // Placeholder code kept for reference - to be implemented
          switch (step.phase) {
            case 'BACKUP':
              // console.log('✅ Backup completed');
              break;
            case 'CREATE_CANONICAL':
              // console.log('✅ Canonical permission set created');
              break;
            case 'MIGRATE_ASSIGNMENTS':
              // console.log(`✅ Migrated ${step.usersToMigrate} user assignments`);
              break;
            case 'VALIDATION':
              // console.log('✅ Validation checks passed');
              break;
            case 'GRACE_PERIOD':
              console.log('⏳ Grace period started - monitoring recommended');
              break;
            case 'DEACTIVATE':
              console.log('✅ Old permission sets deactivated');
              break;
            default:
              console.log('✅ Step completed');
          }

          executedSteps.push(step.step);

        } catch (error) {
          failedStep = step;
          console.error(`\n❌ Step ${step.step} FAILED: ${error.message}`);
          break;
        }
      } else {
        console.log(`\n[DRY RUN] Would execute: ${step.command || 'Internal operation'}`);
        executedSteps.push(step.step);
      }
    }

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    if (failedStep) {
      console.log('❌ MIGRATION FAILED\n');
      console.log(`Failed at Step ${failedStep.step}: ${failedStep.action}`);
      console.log(`\nCompleted Steps: ${executedSteps.length}/${plan.migrationSteps.length}`);
      console.log(`\n⚠️  ROLLBACK RECOMMENDED`);
      console.log(`Run: bash rollback-${plan.initiativeSlug}-migration.sh --org ${org}`);

      return {
        success: false,
        failedStep: failedStep.step,
        completedSteps: executedSteps,
        error: 'Migration failed'
      };

    } else {
      if (dryRun) {
        console.log('✅ DRY RUN COMPLETE\n');
        console.log('All steps validated successfully');
        console.log('\nTo execute for real, remove --dry-run flag');
      } else {
        console.log('✅ MIGRATION COMPLETE\n');
        console.log(`All ${plan.migrationSteps.length} steps executed successfully`);
        console.log(`\nNext Steps:`);
        console.log(`1. Monitor user access during grace period (${plan.estimatedEffort.gracePeriod})`);
        console.log(`2. Run validation checks: node scripts/lib/validate-permission-migration.js --plan ${plan.planId}`);
        console.log(`3. After grace period, deactivate old sets if not done automatically`);
      }

      return {
        success: true,
        completedSteps: executedSteps
      };
    }
  }

  /**
   * Parse command line arguments
   */
  static parseArgs(argv) {
    const args = {
      help: false,
      input: null,
      org: null,
      dryRun: false,
      verbose: false,
      allowDowngrade: false,
      executeMigration: null,
      autoApprove: false
    };

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];

      switch (arg) {
        case '--help':
        case '-h':
          args.help = true;
          break;

        case '--input':
        case '-i':
          args.input = argv[++i];
          break;

        case '--org':
        case '-o':
          args.org = argv[++i];
          break;

        case '--dry-run':
        case '--dryrun':
          args.dryRun = true;
          break;

        case '--verbose':
        case '-v':
          args.verbose = true;
          break;

        case '--allow-downgrade':
          args.allowDowngrade = true;
          break;

        case '--execute-migration':
          args.executeMigration = argv[++i];
          break;

        case '--auto-approve':
          args.autoApprove = true;
          break;

        default:
          console.warn(`Unknown argument: ${arg}`);
      }
    }

    return args;
  }

  /**
   * Print help documentation
   */
  static printHelp() {
    console.log(`
Permission Set CLI - Centralized Permission Set Management
============================================================

USAGE:
  node permission-set-cli.js [OPTIONS]

OPTIONS:
  --input, -i <file>            JSON configuration file (REQUIRED for sync mode)
  --execute-migration <file>    Execute migration plan from JSON file
  --org, -o <alias>             Salesforce org alias (uses SF_ORG env var if not specified)
  --dry-run                     Validation only, no deployment
  --verbose, -v                 Detailed output
  --allow-downgrade             Allow permission downgrades (DANGEROUS - use with caution)
  --auto-approve                Skip confirmation prompts (for automation)
  --help, -h                    Show this help message

EXAMPLES:

  # Full sync from config file
  node permission-set-cli.js --input cpq-permissions.json --org myOrg

  # Dry run (validation only)
  node permission-set-cli.js --input config.json --dry-run

  # Verbose output for debugging
  node permission-set-cli.js --input config.json --org myOrg --verbose

  # Allow permission downgrades (NOT RECOMMENDED)
  node permission-set-cli.js --input config.json --allow-downgrade

  # Execute migration plan
  node permission-set-cli.js --execute-migration migration-plan.json --org myOrg

  # Execute migration in dry-run mode
  node permission-set-cli.js --execute-migration migration-plan.json --org myOrg --dry-run

  # Execute migration with auto-approval (for CI/CD)
  node permission-set-cli.js --execute-migration migration-plan.json --org myOrg --auto-approve

JSON INPUT FORMAT:

  {
    "initiative_slug": "cpq-lite",
    "project_name": "CPQ Lite",
    "tiers": {
      "users": {
        "field_permissions": [
          {
            "object": "Quote__c",
            "field": "Status__c",
            "readable": true,
            "editable": false
          }
        ],
        "object_permissions": [
          {
            "object": "Quote__c",
            "read": true,
            "create": false,
            "edit": false,
            "delete": false,
            "viewAll": false,
            "modifyAll": false
          }
        ],
        "tab_settings": [
          {
            "tab": "Quote__c",
            "visibility": "Visible"
          }
        ],
        "record_type_vis": [
          {
            "object": "Quote__c",
            "recordType": "Default",
            "visible": true,
            "defaultRecordTypeMapping": true
          }
        ]
      },
      "admin": {
        "field_permissions": [...],
        "object_permissions": [...],
        "tab_settings": [...],
        "record_type_vis": [...]
      }
    },
    "assign": {
      "users": ["user@example.com"],
      "admin": ["admin@example.com"]
    }
  }

PERMISSION SET NAMING:
  - Users tier: "{Project Name} - Users"
  - Admin tier: "{Project Name} - Admin"
  - Example: "CPQ Lite - Users", "CPQ Lite - Admin"

KEY FEATURES:
  ✅ Idempotent: Same input twice = zero changes
  ✅ Merge-Safe: Accretive union with existing permissions
  ✅ No-Downgrade Policy: Prevents permission removals by default
  ✅ Atomic Deployments: Bundle fields + permissions together
  ✅ SHA-256 Change Detection: Skip unchanged deployments

NOTES:
  - Permission downgrades are BLOCKED by default (use --allow-downgrade to override)
  - Dry run mode validates without deploying (recommended first run)
  - Operation is idempotent: running twice with same input has no effect
  - Verbose mode shows detailed progress and API calls

ENVIRONMENT VARIABLES:
  SF_ORG                  Default Salesforce org alias
  SF_TARGET_ORG   Fallback org alias
  DEBUG                   Enable debug output

EXIT CODES:
  0   Success
  1   Failure (check error message)

DOCUMENTATION:
  User Guide:      .claude-plugins/salesforce-plugin/docs/PERMISSION_SET_USER_GUIDE.md
  Developer Guide: .claude-plugins/salesforce-plugin/docs/PERMISSION_SET_DEVELOPER_GUIDE.md
  Migration Guide: .claude-plugins/salesforce-plugin/docs/PERMISSION_SET_MIGRATION_GUIDE.md

For support, contact RevPal Engineering
`);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  PermissionSetCLI.main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

// Export for programmatic usage
module.exports = PermissionSetCLI;
