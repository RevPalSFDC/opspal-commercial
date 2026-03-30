/**
 * FlowDeploymentManager
 *
 * Orchestrates Flow deployment with comprehensive validation, permission escalation,
 * and rollback capabilities. Integrates all Phase 1-2 components into cohesive
 * deployment workflow.
 *
 * Phase 3.0 Implementation - Enhanced Deployment Orchestration
 *
 * Features:
 * - Pre-deployment validation (5-level framework)
 * - Deployment execution via SF CLI with permission escalation
 * - Automatic rollback on failure with checkpoint restoration
 * - Comprehensive deployment logging and audit trail (FlowTaskContext)
 * - Error classification and recovery (FlowErrorTaxonomy)
 * - Dry-run mode for safe testing
 * - Activation management (deploy active/inactive)
 *
 * @version 2.0.0 (Phase 3.0 Enhanced)
 * @date 2025-11-04
 * @feature Phase 3.0 - Complete Flow Authoring Orchestrator
 *
 * @see Related Runbooks (v3.42.0):
 * - **Runbook 5**: Testing and Deployment
 *   Location: docs/runbooks/flow-xml-development/05-testing-and-deployment.md
 *   Topics: Deployment strategies, testing lifecycle, rollback procedures
 *   Use when: Deploying Flows to sandbox or production, recovering from failures
 *
 *   Deployment Strategies (from Runbook 5):
 *   1. Direct Activation - Low-traffic Flows, non-critical (no downtime, medium risk)
 *   2. Staged Activation - High-traffic Flows, gradual rollout (no downtime, low risk)
 *   3. Blue-Green - Critical Flows, zero downtime (instant rollback, very low risk)
 *   4. Canary - Uncertain Flows, progressive validation (no downtime, low risk)
 *
 *   Testing Lifecycle:
 *   Dev Sandbox → QA Sandbox → UAT Sandbox → Staging → Production
 *   Unit Tests → Integration Tests → System Tests → UAT → Smoke Tests
 *
 *   Rollback Decision Criteria (from Runbook 5):
 *   - Immediate rollback: Error rate > 5%, data corruption, critical process blocked
 *   - Scheduled rollback: Error rate 2-5% (within 2h), performance degradation >50% (within 4h)
 *
 *   Post-Deployment Verification:
 *   - Activation confirmation (query FlowDefinition for ActiveVersionNumber)
 *   - Functional testing (run smoke tests)
 *   - Monitor debug logs (first 24 hours critical)
 *   - Business metrics validation (within thresholds)
 *
 * - **Runbook 6**: Monitoring, Maintenance, and Rollback
 *   Location: docs/runbooks/flow-xml-development/06-monitoring-maintenance-rollback.md
 *   Topics: Production monitoring, performance optimization, disaster recovery
 *   Use when: Monitoring production Flows, optimizing performance, emergency rollback
 *
 *   Advanced Rollback Scenarios:
 *   - Partial Rollback: Rollback specific element, not entire Flow
 *   - Emergency Rollback: Deactivate immediately, rollback to last known good
 *   - Data Recovery: Restore from backup after failed Flow execution
 *
 * Quick Examples (from Runbooks):
 * ```javascript
 * // Runbook 5: Direct deployment with activation
 * const manager = new FlowDeploymentManager('production', { verbose: true });
 * await manager.deploy('./flows/MyFlow.xml', { activate: true, runTests: true });
 *
 * // Runbook 5: Staged deployment (inactive first, then activate)
 * await manager.deploy('./flows/MyFlow.xml', { activate: false }); // Step 1: Deploy as Draft
 * await manager.verify('MyFlow'); // Step 2: Verify
 * await manager.activate('MyFlow'); // Step 3: Activate later
 *
 * // Runbook 6: Emergency rollback
 * await manager.rollback('MyFlow', { version: 4, activate: true });
 * ```
 *
 * @see CLI Usage:
 * - `flow deploy <flow-file> --org <org> --activate`
 * - `flow deploy <flow-file> --org <org> --status Draft` (staged)
 * - `flow rollback <flow-name> --version <num> --org <org>`
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const FlowTaskContext = require('./flow-task-context');
const FlowErrorTaxonomy = require('./flow-error-taxonomy');
const { createTempSalesforceProject } = require('./temp-salesforce-project');

class FlowDeploymentManager {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose !== false;
        this.workingDir = options.workingDir || process.cwd();
        this.deploymentHistory = [];
        this.currentDeploymentId = null;
        this.currentFlowPath = null;
        this.flowName = null;
        this.preDeploymentSnapshot = null;

        // Phase 3.0: Initialize context and error taxonomy
        this.contextDir = path.join(this.workingDir, '.flow-contexts');
        this.context = null; // Initialized per-deployment
        this.errorTaxonomy = new FlowErrorTaxonomy();
    }

    /**
     * Initialize deployment context (used by tests and deploy workflow)
     * @param {string} flowPath - Path to Flow XML file
     * @param {Object} options - Context options
     * @returns {Object} FlowTaskContext instance
     */
    async init(flowPath, options = {}) {
        if (!flowPath) {
            throw new Error('flowPath is required');
        }

        const deploymentId = options.deploymentId || this.generateDeploymentId();
        const flowName = path.basename(flowPath, '.flow-meta.xml');

        this.currentDeploymentId = deploymentId;
        this.currentFlowPath = flowPath;
        this.flowName = flowName;

        await fs.mkdir(this.contextDir, { recursive: true });
        const contextFile = options.contextFile ||
            path.join(this.contextDir, `deploy_${flowName}_${deploymentId}.json`);
        this.context = new FlowTaskContext(contextFile, { verbose: this.verbose });

        await this.context.init({
            flowName: flowName,
            operation: options.operation || 'deployment',
            orgAlias: this.orgAlias,
            metadata: {
                flowPath: flowPath,
                deploymentId: deploymentId,
                ...options.metadata
            }
        });

        this.log(`Context initialized: ${this.context.context.contextId}`);

        return this.context;
    }

    /**
     * Deploy a Flow with comprehensive validation and rollback
     * @param {string} flowPath - Path to Flow XML file
     * @param {Object} options - Deployment options
     * @returns {Object} Deployment result
     */
    async deploy(flowPath, options = {}) {
        const deploymentId = this.generateDeploymentId();
        const flowName = path.basename(flowPath, '.flow-meta.xml');
        const startTime = Date.now();

        this.currentDeploymentId = deploymentId;
        this.currentFlowPath = flowPath;
        this.flowName = flowName;

        this.log(`Starting deployment ${deploymentId} for ${flowPath}`);

        try {
            // Phase 3.0: Initialize FlowTaskContext for audit trail
            await this.init(flowPath, {
                deploymentId,
                operation: 'deployment',
                metadata: { options }
            });

            // Step 1: Pre-deployment validation
            if (options.validate !== false) {
                this.log('Running pre-deployment validation...');
                const validationResult = await this.validateBeforeDeployment(flowPath);

                await this.context.recordStep('validation_complete', {
                    valid: validationResult.valid,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings
                });

                if (!validationResult.valid) {
                    throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
                }

                if (validationResult.warnings.length > 0) {
                    this.log(`Warnings: ${validationResult.warnings.join(', ')}`);
                }
            }

            await this.context.createCheckpoint('validation_passed', {});

            // Step 2: Dry-run check (Phase 3.0 enhancement)
            if (options.dryRun === true) {
                this.log('DRY-RUN MODE: Skipping actual deployment');

                await this.context.complete({
                    success: true,
                    dryRun: true,
                    message: 'Validation passed - deployment would succeed'
                });

                const duration = Date.now() - startTime;

                return {
                    success: true,
                    dryRun: true,
                    deploymentId: deploymentId,
                    flowPath: flowPath,
                    duration: duration,
                    message: 'Dry-run successful - no changes made',
                    contextId: this.context.context.contextId
                };
            }

            // Step 3: Create backup of existing Flow (if exists)
            const backupPath = await this.createBackup(flowPath, deploymentId);
            this.preDeploymentSnapshot = backupPath;

            await this.context.recordStep('backup_created', {
                backupPath: backupPath || 'none (new Flow)'
            });
            await this.context.createCheckpoint('backup_created', { backupPath });

            // Step 4: Execute deployment with permission escalation
            this.log('Executing deployment...');

            let deployResult;
            let deploymentTier = 'direct';

            if (options.escalatePermissions !== false) {
                // Use permission escalation system (Phase 1.2)
                this.log('Using permission escalation for deployment...');
                const FlowPermissionEscalator = require('./flow-permission-escalator');
                const escalator = new FlowPermissionEscalator(flowPath, this.orgAlias, {
                    verbose: this.verbose
                });

                await escalator.init();
                deployResult = await escalator.deploy();
                deploymentTier = deployResult.tier;

                await this.context.recordStep('deployment_complete', {
                    tier: deploymentTier,
                    success: true
                });
            } else {
                // Direct deployment (no escalation)
                deployResult = await this.executeDeploy(flowPath, {
                    activateOnDeploy: options.activateOnDeploy !== false,
                    runTests: options.runTests === true
                });

                await this.context.recordStep('deployment_complete', {
                    tier: 'direct',
                    success: deployResult.success
                });
            }

            await this.context.createCheckpoint('deployment_complete', { tier: deploymentTier });

            // Step 5: Verify deployment
            if (options.verify !== false) {
                this.log('Verifying deployment...');
                const verifyResult = await this.verifyDeployment(flowPath);

                await this.context.recordStep('verification_complete', {
                    success: verifyResult.success,
                    status: verifyResult.status
                });

                if (!verifyResult.success) {
                    throw new Error(`Deployment verification failed: ${verifyResult.error}`);
                }
            }

            // Step 6: Activation (if requested)
            if (options.activateOnDeploy === true) {
                this.log('Activating Flow...');
                await this.activate(flowName);

                await this.context.recordStep('flow_activated', {
                    flowName: flowName
                });
            }

            const duration = Date.now() - startTime;

            // Mark context as complete
            await this.context.complete({
                success: true,
                flowName: flowName,
                tier: deploymentTier,
                duration: duration
            });

            const result = {
                success: true,
                deploymentId: deploymentId,
                flowPath: flowPath,
                flowName: flowName,
                backupPath: backupPath,
                tier: deploymentTier,
                duration: duration,
                activated: options.activateOnDeploy === true,
                contextId: this.context.context.contextId,
                message: 'Deployment successful'
            };

            this.deploymentHistory.push(result);
            this.log(`Deployment ${deploymentId} completed successfully in ${duration}ms (tier: ${deploymentTier})`);

            return result;

        } catch (error) {
            this.log(`Deployment ${deploymentId} failed: ${error.message}`);

            // Phase 3.0: Classify error using FlowErrorTaxonomy
            const errorClassification = this.errorTaxonomy.classify(error);
            this.log(`Error classification: ${errorClassification.category} - ${errorClassification.severity}`);

            // Record error in context
            if (this.context) {
                await this.context.recordError(error, 'deployment', {
                    classification: errorClassification
                });
            }

            // Automatic rollback on failure
            if (options.autoRollback !== false) {
                this.log('Attempting automatic rollback...');
                try {
                    await this.rollback(deploymentId);
                    this.log('Rollback successful');

                    if (this.context) {
                        await this.context.recordStep('rollback_complete', {
                            success: true
                        });
                    }
                } catch (rollbackError) {
                    this.log(`Rollback failed: ${rollbackError.message}`);

                    if (this.context) {
                        await this.context.recordError(rollbackError, 'rollback');
                    }
                }
            }

            const duration = Date.now() - startTime;

            // Mark context as failed
            if (this.context) {
                await this.context.complete({
                    success: false,
                    error: error.message,
                    classification: errorClassification,
                    duration: duration
                });
            }

            const result = {
                success: false,
                deploymentId: deploymentId,
                flowPath: flowPath,
                flowName: flowName,
                duration: duration,
                error: error.message,
                classification: errorClassification,
                rollbackAttempted: options.autoRollback !== false,
                contextId: this.context ? this.context.context.contextId : null,
                message: 'Deployment failed'
            };

            this.deploymentHistory.push(result);

            throw error;
        }
    }

    /**
     * Validate Flow before deployment
     */
    async validateBeforeDeployment(flowPath) {
        const FlowXMLParser = require('./flow-xml-parser');
        const parser = new FlowXMLParser();

        try {
            const validation = await parser.validate(flowPath);
            return validation;
        } catch (error) {
            return {
                valid: false,
                errors: [error.message],
                warnings: []
            };
        }
    }

    /**
     * Create backup of existing Flow
     */
    async createBackup(flowPath, deploymentId) {
        const flowName = path.basename(flowPath, '.flow-meta.xml');
        const backupDir = path.join(this.workingDir, '.flow-backups');
        await fs.mkdir(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `${flowName}_${deploymentId}_${timestamp}.flow-meta.xml`);

        try {
            // Try to retrieve existing Flow from org
            const retrieveResult = await this.retrieveFlowFromOrg(flowName);
            if (retrieveResult.success) {
                await fs.writeFile(backupPath, retrieveResult.content);
                this.log(`Backup created: ${backupPath}`);
            } else {
                this.log('No existing Flow found in org (new Flow)');
            }
        } catch (error) {
            this.log(`Backup creation failed (non-fatal): ${error.message}`);
        }

        return backupPath;
    }

    /**
     * Create a pre-deployment snapshot for rollback
     */
    async createSnapshot(flowPath = this.currentFlowPath, deploymentId = this.currentDeploymentId) {
        if (!flowPath) {
            throw new Error('flowPath is required to create snapshot');
        }

        const snapshotId = deploymentId || this.generateDeploymentId();
        const backupPath = await this.createBackup(flowPath, snapshotId);
        this.preDeploymentSnapshot = backupPath;

        if (this.context) {
            await this.context.recordStep('snapshot_created', { backupPath });
            await this.context.createCheckpoint('snapshot_created', { backupPath });
        }

        return backupPath;
    }

    /**
     * Retrieve Flow from org
     */
    async retrieveFlowFromOrg(flowName) {
        try {
            const cmd = `sf data query --query "SELECT Metadata FROM Flow WHERE DeveloperName = '${flowName}' AND Status = 'Active'" --use-tooling-api --target-org ${this.orgAlias} --json`;
            const { stdout } = await execAsync(cmd);
            const result = JSON.parse(stdout);

            if (result.result && result.result.records && result.result.records.length > 0) {
                return {
                    success: true,
                    content: result.result.records[0].Metadata
                };
            }

            return { success: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Execute deployment via SF CLI
     */
    async executeDeploy(flowPath, options) {
        const flowFileName = path.basename(flowPath);
        const project = createTempSalesforceProject('flow-deploy');
        project.copyMetadataFile(flowPath, path.join('flows', flowFileName));

        let cmd = `sf project deploy start --source-dir ${project.sourceDir} --target-org ${this.orgAlias}`;

        if (options.runTests) {
            cmd += ' --test-level RunLocalTests';
        }

        if (this.verbose) {
            this.log(`Executing: ${cmd}`);
        }

        try {
            const { stdout, stderr } = await execAsync(cmd, { cwd: project.rootDir });

            if (stderr && !stderr.includes('Warning')) {
                throw new Error(stderr);
            }

            return { success: true, output: stdout };
        } catch (error) {
            throw new Error(`Deployment command failed: ${error.message}`);
        } finally {
            project.cleanup();
        }
    }

    /**
     * Verify deployment success
     */
    async verifyDeployment(flowPath) {
        const flowName = path.basename(flowPath, '.flow-meta.xml');

        try {
            const cmd = `sf data query --query "SELECT DeveloperName, Status FROM FlowDefinition WHERE DeveloperName = '${flowName}'" --use-tooling-api --target-org ${this.orgAlias} --json`;
            const { stdout } = await execAsync(cmd);
            const result = JSON.parse(stdout);

            if (result.result && result.result.records && result.result.records.length > 0) {
                return { success: true, status: result.result.records[0].Status };
            }

            return { success: false, error: 'Flow not found in org after deployment' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Rollback to previous version
     */
    async rollback(deploymentId) {
        const deployment = this.deploymentHistory.find(d => d.deploymentId === deploymentId);

        if (!deployment || !deployment.backupPath) {
            throw new Error(`No backup found for deployment ${deploymentId}`);
        }

        this.log(`Rolling back deployment ${deploymentId} from ${deployment.backupPath}`);

        try {
            // Re-deploy the backup
            await this.executeDeploy(deployment.backupPath, {
                runTests: false
            });

            return { success: true };
        } catch (error) {
            throw new Error(`Rollback failed: ${error.message}`);
        }
    }

    /**
     * Activate a Flow
     */
    async activate(flowName) {
        this.log(`Activating Flow: ${flowName}`);

        try {
            const cmd = `sf data update record --sobject FlowDefinition --where "DeveloperName='${flowName}'" --values "ActiveVersionNumber=LatestVersion" --target-org ${this.orgAlias}`;
            await execAsync(cmd);

            return { success: true };
        } catch (error) {
            throw new Error(`Activation failed: ${error.message}`);
        }
    }

    /**
     * Deactivate a Flow
     */
    async deactivate(flowName) {
        this.log(`Deactivating Flow: ${flowName}`);

        try {
            const cmd = `sf data update record --sobject FlowDefinition --where "DeveloperName='${flowName}'" --values "ActiveVersionNumber=0" --target-org ${this.orgAlias}`;
            await execAsync(cmd);

            return { success: true };
        } catch (error) {
            throw new Error(`Deactivation failed: ${error.message}`);
        }
    }

    /**
     * Get deployment history
     */
    getHistory() {
        return this.deploymentHistory;
    }

    /**
     * Get latest deployment
     */
    getLatestDeployment() {
        return this.deploymentHistory[this.deploymentHistory.length - 1];
    }

    /**
     * Generate unique deployment ID
     */
    generateDeploymentId() {
        return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Logging helper
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowDeploymentManager] ${message}`);
        }
    }
}

module.exports = FlowDeploymentManager;
