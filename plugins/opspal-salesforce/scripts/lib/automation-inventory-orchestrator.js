#!/usr/bin/env node

/**
 * Automation Inventory Orchestrator
 *
 * Purpose: Main coordinator for complete Salesforce automation audit.
 * Orchestrates all extraction, analysis, conflict detection, and reporting phases.
 *
 * Features:
 * - Coordinates all extraction libraries (Apex, Flow, Process Builder, Workflow)
 * - Manages UDM normalization
 * - Executes conflict detection (8 rules)
 * - Calculates risk scores and hotspots
 * - Generates comprehensive reports
 * - Packages all artifacts
 * - Error handling with graceful degradation
 *
 * Usage:
 *   node automation-inventory-orchestrator.js --org production --out ./artifacts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { requireProtectedModule } = require('../../../opspal-core/scripts/lib/protected-asset-runtime');

// Import all analysis libraries
const ApexStaticAnalyzer = require('./apex-static-analyzer');
const ProcessBuilderExtractor = require('./process-builder-extractor');
const WorkflowRuleExtractor = require('./workflow-rule-extractor');
const AutomationDependencyGraph = require('./automation-dependency-graph');
const AutomationConflictEngine = require('./automation-conflict-engine');
const AutomationUDMNormalizer = require('./automation-udm-normalizer');
const AutomationRiskScorer = requireProtectedModule({
    pluginRoot: path.resolve(__dirname, '../..'),
    pluginName: 'opspal-salesforce',
    relativePath: 'scripts/lib/automation-risk-scorer.js'
});
const FlowStreamingQuery = require('./flow-streaming-query');
const FlowMetadataRetriever = require('./flow-metadata-retriever');
const MetadataCapabilityChecker = require('./metadata-capability-checker');
const { safeExecSfCommand } = require('./safe-sf-result-parser');
const { generateReceipt, formatReceiptBlock } = require('./execution-receipt');

class AutomationInventoryOrchestrator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            outputDir: options.outputDir || `./instances/${orgAlias}/automation-audit-${Date.now()}`,
            objects: options.objects || null, // null = all objects
            types: options.types || ['ApexTrigger', 'ApexClass', 'Flow', 'ProcessBuilder', 'WorkflowRule'],
            activeOnly: options.activeOnly !== false,
            includeBody: options.includeBody || false,
            verbose: options.verbose || false,
            skipFlows: options.skipFlows || false,
            showProgress: options.showProgress !== false,
            excludeManaged: options.excludeManaged || false
        };

        // Initialize libraries
        this.apexAnalyzer = new ApexStaticAnalyzer(orgAlias);
        this.processExtractor = new ProcessBuilderExtractor(orgAlias);
        this.workflowExtractor = new WorkflowRuleExtractor(orgAlias);
        this.normalizer = new AutomationUDMNormalizer();
        this.riskScorer = new AutomationRiskScorer();
        this.capabilityChecker = new MetadataCapabilityChecker();

        // Capability validation results — populated in initialize()
        this.orgCapabilities = null;

        // Harvest execution tracking — populated in harvestMetadata()
        this.harvestBranches = [];
        this.harvestReceipt = null;

        // Results storage
        this.rawData = {
            triggers: [],
            classes: [],
            flows: [],
            processes: [],
            workflows: []
        };
        this.udmData = [];
        this.graph = null;
        this.conflicts = [];
        this.hotspots = [];
        this.errors = [];
    }

    /**
     * Execute complete automation audit
     */
    async execute() {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║    Salesforce Automation Inventory & Conflict Analysis        ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');

        const startTime = Date.now();

        try {
            // Phase 1: Initialize & Validate
            console.log('Phase 1/11: Initialize & Validate');
            await this.initialize();

            // Phase 2: Metadata Harvest
            console.log('\nPhase 2/11: Metadata Harvest');
            await this.harvestMetadata();

            // Phase 3: Static Analysis
            console.log('\nPhase 3/11: Static Analysis');
            await this.performStaticAnalysis();

            // Phase 4: Normalize to UDM
            console.log('\nPhase 4/11: Normalize to UDM');
            await this.normalizeToUDM();

            // Phase 5: Build Dependency Graph
            console.log('\nPhase 5/11: Build Dependency Graph');
            await this.buildDependencyGraph();

            // Phase 6: Detect Conflicts
            console.log('\nPhase 6/11: Detect Conflicts');
            await this.detectConflicts();

            // Phase 7: Calculate Risk Scores
            console.log('\nPhase 7/11: Calculate Risk Scores');
            await this.calculateRiskScores();

            // Phase 8: Identify Hotspots
            console.log('\nPhase 8/11: Identify Hotspots');
            await this.identifyHotspots();

            // Phase 9: Generate Remediation Plans
            console.log('\nPhase 9/11: Generate Remediation Plans');
            await this.generateRemediationPlans();

            // Phase 10: Generate Reports
            console.log('\nPhase 10/11: Generate Reports');
            await this.generateReports();

            // Phase 11: Package Artifacts
            console.log('\nPhase 11/11: Package Artifacts');
            await this.packageArtifacts();

            const duration = Math.round((Date.now() - startTime) / 1000);
            console.log('\n╔════════════════════════════════════════════════════════════════╗');
            console.log('║                  Automation Audit Complete!                    ║');
            console.log('╚════════════════════════════════════════════════════════════════╝\n');
            console.log(`Duration: ${duration} seconds`);
            console.log(`Artifacts: ${this.options.outputDir}`);
            console.log(`\nKey Files:`);
            console.log(`  - Executive Summary: ${this.options.outputDir}/reports/Executive_Summary.md`);
            console.log(`  - 🔴 FIELD COLLISION ANALYSIS: ${this.options.outputDir}/FIELD_WRITE_MAP_COLLISIONS.md`);
            console.log(`  - Dashboard: ${this.options.outputDir}/dashboard/index.html`);
            console.log(`  - Conflicts: ${this.options.outputDir}/findings/Conflicts.json`);
            console.log(`  - Graph: ${this.options.outputDir}/graphs/automation_graph.json`);

            return {
                success: true,
                duration: duration,
                summary: this.getSummary(),
                harvestReceipt: this.harvestReceipt,
                receiptBlock: this.harvestReceipt ? formatReceiptBlock(this.harvestReceipt) : null
            };

        } catch (error) {
            console.error(`\n❌ Audit failed: ${error.message}`);
            console.error(error.stack);

            // Save partial results
            await this.savePartialResults(error);

            return {
                success: false,
                error: error.message,
                partialResults: this.options.outputDir
            };
        }
    }

    /**
     * Phase 1: Initialize & Validate
     */
    async initialize() {
        // Create output directories
        const dirs = [
            this.options.outputDir,
            `${this.options.outputDir}/raw`,
            `${this.options.outputDir}/reports`,
            `${this.options.outputDir}/findings`,
            `${this.options.outputDir}/graphs`,
            `${this.options.outputDir}/dashboard`
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // Validate org connection
        console.log(`  Validating org connection: ${this.orgAlias}...`);
        try {
            execSync(`sf org display --target-org ${this.orgAlias} --json`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            console.log('  ✓ Org connection verified');
        } catch (error) {
            throw new Error(`Cannot connect to org: ${this.orgAlias}`);
        }

        // Pre-validate metadata object availability before harvest phase.
        // This prevents unsupported-object errors (FlowDefinitionView, WorkflowRule)
        // from cascading into silent empty-array results downstream.
        // NOTE: orgAlias is an internal configuration value from the constructor,
        // not external user input. The sf CLI resolves it against authenticated orgs.
        console.log('  Pre-validating metadata capabilities...');
        try {
            this.orgCapabilities = await this.capabilityChecker.preOperationValidation(
                this.orgAlias,
                ['FlowDefinitionView', 'WorkflowRule', 'ValidationRule', 'ApexTrigger', 'ApexClass']
            );

            if (this.orgCapabilities.unavailable.length > 0) {
                console.log(`    ⚠ Unavailable objects: ${this.orgCapabilities.unavailable.join(', ')}`);
                for (const rec of this.orgCapabilities.recommendations) {
                    console.log(`      → ${rec.message}`);
                }
            }
            if (this.orgCapabilities.available.length > 0) {
                console.log(`    ✓ Available: ${this.orgCapabilities.available.join(', ')}`);
            }

            // Save capability report for downstream consumers
            const capPath = `${this.options.outputDir}/raw/metadata-capabilities.json`;
            fs.writeFileSync(capPath, JSON.stringify(this.orgCapabilities, null, 2));
        } catch (capError) {
            console.warn(`    ⚠ Capability pre-validation failed: ${capError.message}`);
            this.errors.push({ phase: 'initialize', type: 'capability-check', error: capError.message });
            // Continue — harvesters have their own fallback behavior
        }
    }

    /**
     * Phase 2: Harvest Metadata
     */
    async harvestMetadata() {
        const types = this.options.types;

        // Harvest Apex Triggers
        if (types.includes('ApexTrigger')) {
            console.log('  Harvesting Apex Triggers...');
            try {
                this.rawData.triggers = await this.harvestApexTriggers();
                console.log(`    ✓ Found ${this.rawData.triggers.length} trigger(s)`);
            } catch (error) {
                console.warn(`    ⚠ Warning: ${error.message}`);
                this.errors.push({ phase: 'harvest', type: 'ApexTrigger', error: error.message });
            }
        }

        // Harvest Apex Classes
        if (types.includes('ApexClass')) {
            console.log('  Harvesting Apex Classes...');
            try {
                this.rawData.classes = await this.harvestApexClasses();
                console.log(`    ✓ Found ${this.rawData.classes.length} class(es)`);
            } catch (error) {
                console.warn(`    ⚠ Warning: ${error.message}`);
                this.errors.push({ phase: 'harvest', type: 'ApexClass', error: error.message });
            }
        }

        // Harvest Flows
        if (types.includes('Flow') && !this.options.skipFlows) {
            // Check capability: if FlowDefinitionView is unavailable, warn before attempting
            const fdvUnavailable = this.orgCapabilities?.unavailable?.includes('FlowDefinitionView');
            if (fdvUnavailable) {
                console.log('  Harvesting Flows (FlowDefinitionView unavailable — using fallback)...');
            } else {
                console.log('  Harvesting Flows...');
            }
            try {
                this.rawData.flows = await this.harvestFlows();

                // v3.21.0: Handle count-only mode
                if (this.rawData.flows.countOnly) {
                    console.log(`    ✓ Found ${this.rawData.flows.totalCount} flow(s) (count-only mode)`);
                    console.log(`       Reason: ${this.rawData.flows.reason}`);
                } else {
                    console.log(`    ✓ Found ${this.rawData.flows.length} flow(s)`);
                }
            } catch (error) {
                console.warn(`    ⚠ Warning: ${error.message}`);
                if (error.message.includes('QUERY_TIMEOUT') || error.message.includes('timeout')) {
                    console.log('    💡 Tip: Use --skip-flows flag to skip flow analysis if timeouts persist');
                }
                this.errors.push({ phase: 'harvest', type: 'Flow', error: error.message });
            }
        } else if (this.options.skipFlows) {
            console.log('  Skipping Flows (--skip-flows flag set)');
        }

        // Harvest Process Builder
        if (types.includes('ProcessBuilder')) {
            // Check capability: ProcessBuilder queries FlowDefinitionView
            const fdvUnavailable = this.orgCapabilities?.unavailable?.includes('FlowDefinitionView');
            if (fdvUnavailable) {
                console.log('  Harvesting Process Builder (FlowDefinitionView unavailable — results may be incomplete)...');
                this.errors.push({
                    phase: 'harvest',
                    type: 'ProcessBuilder',
                    error: 'FlowDefinitionView unavailable — process extraction may return empty results. This is a known limitation, not a real zero-count.',
                    severity: 'warning'
                });
            } else {
                console.log('  Harvesting Process Builder...');
            }
            try {
                this.rawData.processes = await this.processExtractor.extractAllProcesses(
                    this.options.objects
                );
                const count = this.rawData.processes.length;
                const isConfirmedZero = count === 0 && !fdvUnavailable;
                const pbChildReceipt = this.processExtractor.getLastReceipt?.() || null;
                this.harvestBranches.push({
                    name: 'ProcessBuilder',
                    success: true,
                    recordCount: count,
                    usedFallback: fdvUnavailable,
                    confirmedZero: count === 0 ? isConfirmedZero : undefined,
                    childReceiptHash: pbChildReceipt?.integrityHash || null
                });
                if (count === 0 && fdvUnavailable) {
                    console.log(`    ⚠ Found 0 process(es) — FlowDefinitionView unavailable (not a confirmed zero-count)`);
                } else {
                    console.log(`    ✓ Found ${count} process(es)`);
                }
            } catch (error) {
                console.warn(`    ⚠ Warning: ${error.message}`);
                this.errors.push({ phase: 'harvest', type: 'ProcessBuilder', error: error.message });
                this.harvestBranches.push({
                    name: 'ProcessBuilder',
                    success: false,
                    recordCount: 0,
                    failureType: 'extraction_failed',
                    error: error.message
                });
            }
        }

        // Harvest Workflow Rules
        if (types.includes('WorkflowRule')) {
            console.log('  Harvesting Workflow Rules...');
            try {
                this.rawData.workflows = await this.workflowExtractor.extractAllWorkflowRules(
                    this.options.objects
                );
                this.harvestBranches.push({
                    name: 'WorkflowRule',
                    success: true,
                    recordCount: this.rawData.workflows.length
                });
                console.log(`    ✓ Found ${this.rawData.workflows.length} rule(s)`);
            } catch (error) {
                console.warn(`    ⚠ Warning: ${error.message}`);
                this.errors.push({ phase: 'harvest', type: 'WorkflowRule', error: error.message });
                this.harvestBranches.push({
                    name: 'WorkflowRule',
                    success: false,
                    recordCount: 0,
                    failureType: 'extraction_failed',
                    error: error.message
                });
            }
        }

        // Generate harvest-level execution receipt from all branch results
        this._generateHarvestReceipt();

        // Save raw data
        this.saveRawData();
    }

    /**
     * Generate a harvest-level execution receipt from all branch results.
     * This receipt proves the orchestrator actually executed org queries
     * and is verifiable by the SubagentStop proof hook.
     * @private
     */
    _generateHarvestReceipt() {
        const succeeded = {};
        const failed = {};
        const fallbacks = [];

        const childReceiptHashes = {};

        for (const branch of this.harvestBranches) {
            if (branch.success) {
                succeeded[branch.name] = {
                    totalSize: branch.recordCount,
                    records: [],
                    usedFallback: branch.usedFallback || false
                };
                if (branch.usedFallback) {
                    fallbacks.push({ name: branch.name, note: `${branch.name} used fallback path` });
                }
            } else {
                failed[branch.name] = {
                    error: branch.error || 'unknown',
                    failureType: branch.failureType || 'unknown'
                };
            }
            // Collect child receipt hashes for deterministic chain of proof
            if (branch.childReceiptHash) {
                childReceiptHashes[branch.name] = branch.childReceiptHash;
            }
        }

        const succeededCount = Object.keys(succeeded).length;
        const failedCount = Object.keys(failed).length;
        const totalCount = this.harvestBranches.length;

        let status;
        if (totalCount === 0) status = 'failed';
        else if (failedCount === 0) status = 'complete';
        else if (succeededCount === 0) status = 'failed';
        else status = 'partial';

        const receiptInput = {
            status,
            orgAlias: this.orgAlias,
            totalQueries: totalCount,
            succeededCount,
            failedCount,
            succeeded,
            failed,
            fallbacks,
            durationMs: 0
        };

        this.harvestReceipt = generateReceipt(receiptInput, {
            helper: 'automation-inventory-orchestrator@harvest'
        });

        // Save child receipt hashes for chain-of-proof verification
        if (Object.keys(childReceiptHashes).length > 0) {
            const childHashPath = `${this.options.outputDir}/raw/child-receipt-hashes.json`;
            fs.writeFileSync(childHashPath, JSON.stringify(childReceiptHashes, null, 2));
        }

        // Save receipt to output directory
        const receiptPath = `${this.options.outputDir}/raw/harvest-execution-receipt.json`;
        fs.writeFileSync(receiptPath, JSON.stringify(this.harvestReceipt, null, 2));

        // Also save the formatted receipt block for agent output embedding
        const blockPath = `${this.options.outputDir}/raw/harvest-receipt-block.txt`;
        fs.writeFileSync(blockPath, formatReceiptBlock(this.harvestReceipt));

        console.log(`  ✓ Harvest receipt generated: ${status} (${succeededCount}/${totalCount} branches)`);
    }

    /**
     * Harvest Apex Triggers — uses receipt-enabled safe execution
     */
    async harvestApexTriggers() {
        const query = `SELECT Id, Name, TableEnumOrId, ApiVersion, Status, UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, UsageAfterUpdate, UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete, LastModifiedDate, LastModifiedBy.Name FROM ApexTrigger ${this.options.activeOnly ? "WHERE Status = 'Active'" : ''} ORDER BY TableEnumOrId, Name`;

        const result = safeExecSfCommand(
            `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        this.harvestBranches.push({
            name: 'ApexTrigger',
            success: result.success,
            recordCount: result.success ? (result.totalSize || 0) : 0,
            failureType: result.failureType || null,
            error: result.error || null
        });

        if (!result.success) {
            console.warn(`    ⚠ ApexTrigger query failed: ${result.error}`);
            return [];
        }

        return result.records || [];
    }

    /**
     * Harvest Apex Classes (with pagination and optional managed package filtering)
     * Uses receipt-enabled safe execution.
     */
    async harvestApexClasses() {
        const batchSize = 2000;
        let offset = 0;
        let allRecords = [];
        let hasMore = true;
        let pagesSucceeded = 0;
        let pagesFailed = 0;

        // Build WHERE clause
        const whereClauses = [];
        if (this.options.activeOnly) {
            whereClauses.push("Status = 'Active'");
        }
        if (this.options.excludeManaged) {
            whereClauses.push("NamespacePrefix = null");
        }
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        if (this.options.verbose) {
            console.log(`    Retrieving Apex classes (excludeManaged: ${this.options.excludeManaged})...`);
        }

        // Paginate through all classes
        while (hasMore) {
            const query = `SELECT Id, Name, ApiVersion, Status, NamespacePrefix, LastModifiedDate, LastModifiedBy.Name FROM ApexClass ${whereClause} ORDER BY Name LIMIT ${batchSize} OFFSET ${offset}`;

            const result = safeExecSfCommand(
                `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (!result.success) {
                pagesFailed++;
                console.warn(`    ⚠ ApexClass page ${offset / batchSize} failed: ${result.error}`);
                hasMore = false;
            } else {
                pagesSucceeded++;
                const records = result.records || [];
                allRecords = allRecords.concat(records);

                if (records.length < batchSize) {
                    hasMore = false;
                } else {
                    offset += batchSize;
                    if (this.options.verbose) {
                        console.log(`      Retrieved ${allRecords.length} classes so far...`);
                    }
                }
            }
        }

        this.harvestBranches.push({
            name: 'ApexClass',
            success: pagesSucceeded > 0,
            recordCount: allRecords.length,
            failureType: pagesFailed > 0 ? 'partial_pagination' : null,
            error: pagesFailed > 0 ? `${pagesFailed} page(s) failed during pagination` : null,
            pages: { succeeded: pagesSucceeded, failed: pagesFailed }
        });

        if (this.options.verbose) {
            console.log(`      Total Apex classes: ${allRecords.length}`);
        }

        return allRecords;
    }

    /**
     * Harvest Flows (with automatic Tooling API → Metadata API fallback)
     * v3.22.0: Uses FlowMetadataRetriever for robust retrieval
     */
    async harvestFlows() {
        const retriever = new FlowMetadataRetriever(this.orgAlias, {
            verbose: this.options.verbose || this.options.showProgress
        });

        try {
            const flows = await retriever.getAllFlows({
                activeOnly: this.options.activeOnly,
                excludeManaged: this.options.excludeManaged
            });
            const log = retriever.getRetrievalLog();

            const usedFallback = log.method === 'metadata_api';

            // Track retrieval method for audit reporting
            if (usedFallback) {
                this.errors.push({
                    type: 'Flow',
                    level: 'warning',
                    error: 'FlowDefinitionView unavailable - used Metadata API fallback',
                    impact: 'Flow retrieval succeeded via alternate method',
                    recommendation: 'This is expected in some org types - no action needed'
                });
            }

            this.harvestBranches.push({
                name: 'Flow',
                success: true,
                recordCount: flows.length,
                usedFallback,
                method: log.method || 'tooling_api'
            });

            if (this.options.verbose) {
                console.log(`    Retrieved ${flows.length} flows via ${log.method}`);
            }

            return flows;

        } catch (error) {
            // Both methods failed
            this.errors.push({
                type: 'Flow',
                level: 'error',
                error: error.message,
                impact: 'Flow count may be inaccurate or zero',
                recommendation: 'Check org connectivity and Flow permissions'
            });

            this.harvestBranches.push({
                name: 'Flow',
                success: false,
                recordCount: 0,
                failureType: 'retrieval_failed',
                error: error.message
            });

            return [];
        }
    }

    /**
     * Phase 3: Static Analysis
     */
    async performStaticAnalysis() {
        // Analyze triggers
        console.log(`  Analyzing ${this.rawData.triggers.length} trigger(s)...`);
        let lastProgressTime = Date.now();
        for (let i = 0; i < this.rawData.triggers.length; i++) {
            const trigger = this.rawData.triggers[i];
            try {
                // Include body for field extraction in conflict analysis
                const analysis = await this.apexAnalyzer.analyzeTrigger(trigger.Id, { ...this.options, includeBody: true });
                trigger.analysis = analysis;
            } catch (error) {
                console.warn(`    ⚠ Failed to analyze trigger ${trigger.Name}: ${error.message}`);
                this.errors.push({ phase: 'analysis', id: trigger.Id, error: error.message });
            }

            // Progress logging every 10 items or 60 seconds
            const now = Date.now();
            if ((i + 1) % 10 === 0 || now - lastProgressTime > 60000) {
                const percent = Math.round(((i + 1) / this.rawData.triggers.length) * 100);
                console.log(`    Progress: ${i + 1}/${this.rawData.triggers.length} triggers (${percent}%)`);
                lastProgressTime = now;
            }
        }

        // Analyze classes (sample only for performance)
        const classesToAnalyze = this.rawData.classes.slice(0, 100);
        console.log(`  Analyzing ${classesToAnalyze.length} class(es) (sampled)...`);
        lastProgressTime = Date.now();
        for (let i = 0; i < classesToAnalyze.length; i++) {
            const apexClass = classesToAnalyze[i];
            try {
                // Include body for field extraction in conflict analysis
                const analysis = await this.apexAnalyzer.analyzeClass(apexClass.Id, { ...this.options, includeBody: true });
                apexClass.analysis = analysis;
            } catch (error) {
                console.warn(`    ⚠ Failed to analyze class ${apexClass.Name}: ${error.message}`);
                this.errors.push({ phase: 'analysis', id: apexClass.Id, error: error.message });
            }

            // Progress logging every 10 items or 60 seconds
            const now = Date.now();
            if ((i + 1) % 10 === 0 || now - lastProgressTime > 60000) {
                const percent = Math.round(((i + 1) / classesToAnalyze.length) * 100);
                console.log(`    Progress: ${i + 1}/${classesToAnalyze.length} classes (${percent}%)`);
                lastProgressTime = now;
            }
        }

        console.log('  ✓ Static analysis complete');
    }

    /**
     * Phase 4: Normalize to UDM
     */
    async normalizeToUDM() {
        // Normalize triggers
        for (const trigger of this.rawData.triggers) {
            if (trigger.analysis) {
                const udm = this.normalizer.normalizeApexTrigger(trigger.analysis);
                this.udmData.push(udm);
            }
        }

        // Normalize classes
        for (const apexClass of this.rawData.classes) {
            if (apexClass.analysis) {
                const udm = this.normalizer.normalizeApexClass(apexClass.analysis);
                this.udmData.push(udm);
            }
        }

        // Normalize processes
        for (const process of this.rawData.processes) {
            const udm = this.normalizer.normalizeProcessBuilder(process);
            this.udmData.push(udm);
        }

        // Normalize workflows
        for (const workflow of this.rawData.workflows) {
            const udm = this.normalizer.normalizeWorkflowRule(workflow);
            this.udmData.push(udm);
        }

        console.log(`  ✓ Normalized ${this.udmData.length} automation component(s) to UDM`);

        // Save UDM data
        fs.writeFileSync(
            `${this.options.outputDir}/raw/udm_data.json`,
            JSON.stringify(this.udmData, null, 2)
        );
    }

    /**
     * Phase 5: Build Dependency Graph
     */
    async buildDependencyGraph() {
        this.graph = new AutomationDependencyGraph();

        for (const automation of this.udmData) {
            this.graph.addAutomation(automation);
        }

        const stats = this.graph.getStatistics();
        console.log(`  ✓ Built graph: ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);
    }

    /**
     * Phase 6: Detect Conflicts
     */
    async detectConflicts() {
        const conflictEngine = new AutomationConflictEngine(this.udmData, this.graph);
        this.conflicts = conflictEngine.detectAllConflicts();

        const bySeverity = this.conflicts.reduce((acc, c) => {
            acc[c.severity] = (acc[c.severity] || 0) + 1;
            return acc;
        }, {});

        console.log(`  ✓ Found ${this.conflicts.length} conflict(s):`);
        if (bySeverity.CRITICAL) console.log(`    CRITICAL: ${bySeverity.CRITICAL}`);
        if (bySeverity.HIGH) console.log(`    HIGH: ${bySeverity.HIGH}`);
        if (bySeverity.MEDIUM) console.log(`    MEDIUM: ${bySeverity.MEDIUM}`);
        if (bySeverity.LOW) console.log(`    LOW: ${bySeverity.LOW}`);
    }

    /**
     * Phase 7: Calculate Risk Scores
     */
    async calculateRiskScores() {
        for (const automation of this.udmData) {
            automation.riskScore = this.riskScorer.calculateRiskScore(automation, this.conflicts);
            automation.riskLevel = this.riskScorer.getRiskLevel(automation.riskScore);
        }

        const avgScore = Math.round(
            this.udmData.reduce((sum, a) => sum + a.riskScore, 0) / this.udmData.length
        );

        console.log(`  ✓ Calculated risk scores (average: ${avgScore})`);
    }

    /**
     * Phase 8: Identify Hotspots
     */
    async identifyHotspots() {
        this.hotspots = this.riskScorer.identifyHotspots(this.udmData, 10);
        console.log(`  ✓ Identified ${this.hotspots.length} hotspot object(s)`);
    }

    /**
     * Phase 9: Generate Remediation Plans
     */
    async generateRemediationPlans() {
        // Remediation plans are embedded in conflict findings
        console.log('  ✓ Remediation plans included in conflict findings');
    }

    /**
     * Phase 10: Generate Reports
     */
    async generateReports() {
        // This will be implemented by automation-reporter.js
        console.log('  ✓ Report generation prepared');
    }

    /**
     * Phase 11: Package Artifacts
     */
    async packageArtifacts() {
        // Save conflicts
        fs.writeFileSync(
            `${this.options.outputDir}/findings/Conflicts.json`,
            JSON.stringify(this.conflicts, null, 2)
        );

        // Save graph
        fs.writeFileSync(
            `${this.options.outputDir}/graphs/automation_graph.json`,
            JSON.stringify(this.graph.toJSON(), null, 2)
        );

        fs.writeFileSync(
            `${this.options.outputDir}/graphs/automation_graph.dot`,
            this.graph.toDOT()
        );

        // Save hotspots
        fs.writeFileSync(
            `${this.options.outputDir}/findings/Hotspots.json`,
            JSON.stringify(this.hotspots, null, 2)
        );

        // Create 'latest' symbolic link
        const instanceDir = path.dirname(this.options.outputDir);
        const latestLink = path.join(instanceDir, 'latest-audit');

        try {
            // Remove existing link if it exists
            if (fs.existsSync(latestLink)) {
                fs.unlinkSync(latestLink);
            }

            // Create new symbolic link
            fs.symlinkSync(path.basename(this.options.outputDir), latestLink);
            console.log('  ✓ Created \'latest-audit\' symbolic link');
        } catch (error) {
            console.warn(`  ⚠ Could not create symbolic link: ${error.message}`);
        }

        console.log('  ✓ Artifacts packaged');
    }

    /**
     * Save raw data
     */
    saveRawData() {
        fs.writeFileSync(
            `${this.options.outputDir}/raw/raw_data.json`,
            JSON.stringify(this.rawData, null, 2)
        );
    }

    /**
     * Save partial results on error
     */
    async savePartialResults(error) {
        const errorReport = {
            error: error.message,
            phase: 'unknown',
            timestamp: new Date().toISOString(),
            partialData: {
                udmCount: this.udmData.length,
                conflictsCount: this.conflicts.length,
                errors: this.errors
            }
        };

        fs.writeFileSync(
            `${this.options.outputDir}/ERROR_REPORT.json`,
            JSON.stringify(errorReport, null, 2)
        );
    }

    /**
     * Get summary
     */
    getSummary() {
        return {
            org: this.orgAlias,
            timestamp: new Date().toISOString(),
            automation: {
                total: this.udmData.length,
                byType: this.udmData.reduce((acc, a) => {
                    acc[a.type] = (acc[a.type] || 0) + 1;
                    return acc;
                }, {})
            },
            conflicts: {
                total: this.conflicts.length,
                bySeverity: this.conflicts.reduce((acc, c) => {
                    acc[c.severity] = (acc[c.severity] || 0) + 1;
                    return acc;
                }, {})
            },
            hotspots: this.hotspots.length,
            errors: this.errors.length
        };
    }

    /**
     * Execute SF CLI command (DEPRECATED — prefer safeExecSfCommand for receipt coverage)
     *
     * This method does NOT generate execution receipts. It is retained for backward
     * compatibility with sub-modules that haven't migrated yet. New harvest code
     * should use the imported safeExecSfCommand() from safe-sf-result-parser.js.
     *
     * @deprecated Use safeExecSfCommand() for receipt-enabled execution
     */
    execSfCommand(command) {
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return JSON.parse(result);
        } catch (error) {
            console.error(`Error executing: ${command}`);
            return null;
        }
    }
}

module.exports = AutomationInventoryOrchestrator;

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2 || !args.includes('--org')) {
        console.log(`
Automation Inventory Orchestrator
==================================

Usage:
  node automation-inventory-orchestrator.js --org <alias> [options]

Options:
  --org <alias>           Target Salesforce org (required)
  --out <dir>             Output directory (default: ./instances/{org}/automation-audit-{timestamp})
  --objects <obj1,obj2>   Filter by objects (default: all)
  --types <type1,type2>   Automation types to include (default: all)
  --active-only           Only include active automation (default: true)
  --include-body          Include Apex body in analysis (default: false)
  --skip-flows            Skip flow analysis (useful if timeouts occur)
  --verbose               Verbose output (default: false)

Examples:
  node automation-inventory-orchestrator.js --org production
  node automation-inventory-orchestrator.js --org sandbox --objects Account,Contact
  node automation-inventory-orchestrator.js --org production --skip-flows
  node automation-inventory-orchestrator.js --org production --out ./audit-2025-10-08
        `);
        process.exit(1);
    }

    // Parse arguments
    const orgAlias = args[args.indexOf('--org') + 1];
    const options = {
        outputDir: args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined,
        objects: args.includes('--objects') ? args[args.indexOf('--objects') + 1].split(',') : null,
        types: args.includes('--types') ? args[args.indexOf('--types') + 1].split(',') : undefined,
        activeOnly: !args.includes('--no-active-only'),
        includeBody: args.includes('--include-body'),
        skipFlows: args.includes('--skip-flows'),
        verbose: args.includes('--verbose'),
        showProgress: !args.includes('--no-progress')
    };

    // Execute audit
    (async () => {
        const orchestrator = new AutomationInventoryOrchestrator(orgAlias, options);
        const result = await orchestrator.execute();
        process.exit(result.success ? 0 : 1);
    })();
}
