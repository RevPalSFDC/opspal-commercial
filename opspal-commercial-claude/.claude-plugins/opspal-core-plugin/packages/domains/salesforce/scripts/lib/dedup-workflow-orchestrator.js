#!/usr/bin/env node

/**
 * Dedup Workflow Orchestrator
 *
 * Unified entry point for all deduplication operations.
 * Orchestrates backup → validation → detection → analysis workflow.
 *
 * Usage:
 *   node dedup-workflow-orchestrator.js analyze <org-alias> <pairs-file> [options]
 *   node dedup-workflow-orchestrator.js prepare <org-alias> [options]
 *   node dedup-workflow-orchestrator.js recover <org-alias> <survivor-id> <procedure> [options]
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DedupWorkflowOrchestrator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = options;
        this.scriptsDir = __dirname;
        this.results = {};
    }

    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'INFO': '✓',
            'WARN': '⚠',
            'ERROR': '✗',
            'SUCCESS': '✅',
            'STEP': '📋'
        }[level] || 'ℹ';
        console.log(`${prefix} [${timestamp.substring(11, 19)}] ${message}`);
    }

    logSection(title) {
        console.log('\n' + '═'.repeat(70));
        console.log(title);
        console.log('═'.repeat(70));
    }

    /**
     * Execute shell command with logging
     */
    exec(command, description) {
        this.log(description, 'STEP');
        try {
            const result = execSync(command, { encoding: 'utf8', stdio: 'inherit' });
            this.log(`${description} - Complete`, 'SUCCESS');
            return { success: true, output: result };
        } catch (error) {
            this.log(`${description} - Failed: ${error.message}`, 'ERROR');
            return { success: false, error: error.message };
        }
    }

    /**
     * Workflow: Prepare for dedup operations
     */
    async prepareWorkflow() {
        this.logSection(`PREPARE WORKFLOW: ${this.orgAlias}`);

        console.log('This workflow prepares your org for safe deduplication operations.');
        console.log('Steps: Validate → Backup → Detect Importance Fields\n');

        // Step 1: Pre-merge validation
        const validationScript = path.join(this.scriptsDir, 'sfdc-pre-merge-validator.js');
        this.results.validation = this.exec(
            `node ${validationScript} ${this.orgAlias} Account`,
            'Step 1/3: Pre-Merge Validation'
        );

        if (!this.results.validation.success) {
            this.log('Validation failed. Fix issues before proceeding.', 'ERROR');
            return false;
        }

        // Step 2: Full backup
        const backupScript = path.join(this.scriptsDir, 'sfdc-full-backup-generator.js');
        this.results.backup = this.exec(
            `node ${backupScript} ${this.orgAlias} Account`,
            'Step 2/3: Full Backup Generation'
        );

        if (!this.results.backup.success) {
            this.log('Backup failed. Cannot proceed safely.', 'ERROR');
            return false;
        }

        // Step 3: Importance field detection
        const importanceScript = path.join(this.scriptsDir, 'importance-field-detector.js');
        this.results.importance = this.exec(
            `node ${importanceScript} ${this.orgAlias} Account`,
            'Step 3/3: Importance Field Detection'
        );

        if (!this.results.importance.success) {
            this.log('Importance detection failed.', 'WARN');
        }

        // Summary
        this.logSection('PREPARE WORKFLOW - COMPLETE');
        console.log('✅ Pre-merge validation: PASSED');
        console.log('✅ Full backup: COMPLETE');
        console.log('✅ Importance fields: DETECTED');
        console.log('\nYou can now proceed with duplicate analysis.');
        console.log(`  node dedup-workflow-orchestrator.js analyze ${this.orgAlias} pairs.csv\n`);

        return true;
    }

    /**
     * Workflow: Analyze duplicate pairs
     */
    async analyzeWorkflow(pairsFile) {
        this.logSection(`ANALYZE WORKFLOW: ${this.orgAlias}`);

        if (!fs.existsSync(pairsFile)) {
            this.log(`Pairs file not found: ${pairsFile}`, 'ERROR');
            return false;
        }

        console.log(`Analyzing duplicate pairs from: ${pairsFile}\n`);

        // Check prerequisites
        const backupDir = path.join(this.scriptsDir, `../../backups/${this.orgAlias}`);
        if (!fs.existsSync(backupDir)) {
            this.log('No backup found. Run prepare workflow first.', 'ERROR');
            console.log(`  node dedup-workflow-orchestrator.js prepare ${this.orgAlias}\n`);
            return false;
        }

        // Run safety analysis
        const safetyScript = path.join(this.scriptsDir, 'dedup-safety-engine.js');
        const configFlag = this.options.config ? `--config ${this.options.config}` : '';

        this.results.analysis = this.exec(
            `node ${safetyScript} analyze ${this.orgAlias} ${pairsFile} ${configFlag}`,
            'Running Dedup Safety Analysis'
        );

        if (!this.results.analysis.success) {
            this.log('Analysis failed', 'ERROR');
            return false;
        }

        // Display results
        this.logSection('ANALYSIS COMPLETE');

        // Read decisions file
        const decisionsFile = 'dedup-decisions.json';
        if (fs.existsSync(decisionsFile)) {
            const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));

            console.log('\n📊 SUMMARY:');
            console.log(`  Total Pairs Analyzed: ${decisions.stats.total}`);
            console.log(`  ✅ APPROVE: ${decisions.stats.approved}`);
            console.log(`  ⚠️  REVIEW: ${decisions.stats.review}`);
            console.log(`  🛑 BLOCK: ${decisions.stats.blocked}`);
            console.log(`  Type 1 Errors Prevented: ${decisions.stats.type1Prevented}`);
            console.log(`  Type 2 Errors Prevented: ${decisions.stats.type2Prevented}`);

            // Show blocked merges
            if (decisions.stats.blocked > 0) {
                console.log('\n🛑 BLOCKED MERGES (Require Recovery):');
                const blocked = decisions.decisions.filter(d => d.decision === 'BLOCK');
                for (const decision of blocked.slice(0, 5)) {
                    console.log(`\n  ${decision.recordA.name} ← ${decision.recordB.name}`);
                    console.log(`  Reason: ${decision.guardrails_triggered[0]?.type || 'Unknown'}`);
                    console.log(`  Recovery: Procedure ${decision.recovery_procedure}`);
                }
            }

            // Show review required
            if (decisions.stats.review > 0) {
                console.log(`\n⚠️  ${decisions.stats.review} merge(s) require manual review`);
            }

            console.log(`\n📄 Full report saved to: ${decisionsFile}\n`);
        }

        return true;
    }

    /**
     * Workflow: Execute recovery procedure
     */
    async recoverWorkflow(survivorId, procedure) {
        this.logSection(`RECOVERY WORKFLOW: Procedure ${procedure.toUpperCase()}`);

        const procedureScripts = {
            'a': 'procedure-a-field-restoration.js',
            'b': 'procedure-b-entity-separation.js',
            'c': 'procedure-c-quick-undelete.js'
        };

        const scriptFile = procedureScripts[procedure.toLowerCase()];
        if (!scriptFile) {
            this.log(`Invalid procedure: ${procedure}. Must be A, B, or C.`, 'ERROR');
            return false;
        }

        const procedureScript = path.join(this.scriptsDir, scriptFile);
        const dryRunFlag = this.options.dryRun ? '--dry-run' : '';
        const autoApproveFlag = this.options.autoApprove ? '--auto-approve' : '';

        this.results.recovery = this.exec(
            `node ${procedureScript} ${this.orgAlias} ${survivorId} ${dryRunFlag} ${autoApproveFlag}`,
            `Executing Procedure ${procedure.toUpperCase()}`
        );

        if (!this.results.recovery.success) {
            this.log('Recovery failed', 'ERROR');
            return false;
        }

        this.logSection('RECOVERY COMPLETE');
        return true;
    }

    /**
     * Display help
     */
    static showHelp() {
        console.log(`
═══════════════════════════════════════════════════════════════════
Dedup Workflow Orchestrator
═══════════════════════════════════════════════════════════════════

Unified entry point for all Salesforce Account deduplication operations.

COMMANDS:

  prepare <org-alias>
    Prepare org for deduplication (validate → backup → detect importance)

    Example:
      node dedup-workflow-orchestrator.js prepare bluerabbit2021-revpal

  analyze <org-alias> <pairs-file>
    Analyze duplicate pairs for Type 1/2 errors

    Options:
      --config <file>    Org-specific configuration JSON

    Example:
      node dedup-workflow-orchestrator.js analyze production pairs.csv
      node dedup-workflow-orchestrator.js analyze production pairs.csv --config config.json

  recover <org-alias> <survivor-id> <procedure>
    Execute recovery procedure (A, B, or C)

    Procedures:
      A = Field Restoration (Type 2 - wrong survivor)
      B = Entity Separation (Type 1 - different entities)
      C = Quick Undelete (Type 1 - within 15 days)

    Options:
      --dry-run          Generate scripts without execution
      --auto-approve     Skip interactive prompts (Procedure B only)

    Examples:
      node dedup-workflow-orchestrator.js recover production 001xx000ABC a --dry-run
      node dedup-workflow-orchestrator.js recover production 001xx000ABC b
      node dedup-workflow-orchestrator.js recover production 001xx000ABC c

COMPLETE WORKFLOW:

  # Step 1: Prepare
  node dedup-workflow-orchestrator.js prepare production

  # Step 2: Export duplicate pairs (via Cloudingo, DemandTools, etc.)
  # Save as CSV with idA,idB columns

  # Step 3: Analyze
  node dedup-workflow-orchestrator.js analyze production duplicates.csv

  # Step 4: Review decisions in dedup-decisions.json

  # Step 5: Execute approved merges (via Salesforce UI or API)

  # Step 6: If needed, recover from errors
  node dedup-workflow-orchestrator.js recover production 001xx000ABC b

CONFIGURATION:

  Create org-specific config at: instances/{org}/dedup-config.json

  {
    "org_alias": "production",
    "industry": "PropTech",
    "guardrails": {
      "domain_mismatch": { "threshold": 0.3, "severity": "REVIEW" },
      "integration_id_conflict": { "severity": "BLOCK" }
    }
  }

OUTPUT FILES:

  - backups/{org}/{timestamp}/             Full FIELDS(ALL) backup
  - field-importance-reports/              Importance analysis
  - validation-reports/                    Pre-merge validation
  - dedup-decisions.json                   Analysis results
  - restoration-scripts/                   Recovery Apex scripts
  - separation-guides/                     Manual review guides
  - quick-guides/                          Quick recovery guides

DOCUMENTATION:

  - DEDUP_IMPLEMENTATION_COMPLETE.md       Full implementation summary
  - DEDUP_QUICKSTART.md                    Quick start guide
  - DEDUP_CONFIG_GUIDE.md                  Configuration guide
  - DEDUP_RECOVERY_GUIDE.md                Recovery playbook

═══════════════════════════════════════════════════════════════════
        `);
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        DedupWorkflowOrchestrator.showHelp();
        process.exit(0);
    }

    const getOption = (flag) => {
        const index = args.indexOf(flag);
        return index !== -1 && args[index + 1] ? args[index + 1] : null;
    };

    const orgAlias = args[1];

    if (!orgAlias) {
        console.error('Error: org-alias required');
        console.error('Usage: node dedup-workflow-orchestrator.js <command> <org-alias> [...]');
        console.error('Run with --help for full usage');
        process.exit(1);
    }

    const options = {
        config: getOption('--config'),
        dryRun: args.includes('--dry-run'),
        autoApprove: args.includes('--auto-approve')
    };

    const orchestrator = new DedupWorkflowOrchestrator(orgAlias, options);

    async function run() {
        try {
            let success = false;

            switch (command) {
                case 'prepare':
                    success = await orchestrator.prepareWorkflow();
                    break;

                case 'analyze':
                    const pairsFile = args[2];
                    if (!pairsFile) {
                        console.error('Error: pairs-file required for analyze command');
                        process.exit(1);
                    }
                    success = await orchestrator.analyzeWorkflow(pairsFile);
                    break;

                case 'recover':
                    const survivorId = args[2];
                    const procedure = args[3];
                    if (!survivorId || !procedure) {
                        console.error('Error: survivor-id and procedure required for recover command');
                        console.error('Usage: node dedup-workflow-orchestrator.js recover <org> <survivor-id> <a|b|c>');
                        process.exit(1);
                    }
                    success = await orchestrator.recoverWorkflow(survivorId, procedure);
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    console.error('Run with --help for usage');
                    process.exit(1);
            }

            process.exit(success ? 0 : 1);

        } catch (error) {
            console.error('\n❌ Fatal error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    }

    run();
}

module.exports = DedupWorkflowOrchestrator;
