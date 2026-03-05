#!/usr/bin/env node

/**
 * Deployment State Tracker - Track Salesforce deployment state transitions
 *
 * Queries org state before/after deployments to detect drift,
 * verify changes, and enable rollback detection.
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class DeploymentStateTracker {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.orgAlias = options.orgAlias || null;
        this.stateDir = options.stateDir || '.deployment-state';
        this.maxSnapshots = options.maxSnapshots || 10;

        // Ensure state directory exists
        if (!fs.existsSync(this.stateDir)) {
            fs.mkdirSync(this.stateDir, { recursive: true });
        }

        // State tracking
        this.currentState = null;
        this.previousState = null;
        this.deploymentHistory = [];

        // Load existing history
        this._loadHistory();
    }

    /**
     * Capture current org state
     * @param {string} orgAlias - Salesforce org alias
     * @param {Array} components - Component types to query
     * @returns {Object} Captured state
     */
    async captureState(orgAlias = null, components = null) {
        const org = orgAlias || this.orgAlias;
        if (!org) {
            throw new Error('Org alias is required');
        }

        const defaultComponents = ['FlowDefinition', 'CustomField', 'ValidationRule', 'ApexClass', 'ApexTrigger'];
        const typesToQuery = components || defaultComponents;

        const state = {
            id: this._generateStateId(),
            orgAlias: org,
            capturedAt: new Date().toISOString(),
            components: {}
        };

        for (const componentType of typesToQuery) {
            try {
                const data = await this._queryComponent(org, componentType);
                state.components[componentType] = data;
            } catch (error) {
                if (this.verbose) {
                    console.error(`[STATE] Error querying ${componentType}: ${error.message}`);
                }
                state.components[componentType] = { error: error.message, records: [] };
            }
        }

        this.previousState = this.currentState;
        this.currentState = state;

        // Save snapshot
        this._saveSnapshot(state);

        return state;
    }

    /**
     * Query a specific component type
     */
    async _queryComponent(orgAlias, componentType) {
        const queries = {
            FlowDefinition: "SELECT DeveloperName, ActiveVersion.VersionNumber, LatestVersion.VersionNumber FROM FlowDefinition",
            CustomField: "SELECT DeveloperName, EntityDefinition.QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName LIKE '%__c'",
            ValidationRule: "SELECT ValidationName, Active, EntityDefinition.QualifiedApiName FROM ValidationRule",
            ApexClass: "SELECT Name, Status, ApiVersion FROM ApexClass WHERE NamespacePrefix = null",
            ApexTrigger: "SELECT Name, Status, ApiVersion, TableEnumOrId FROM ApexTrigger WHERE NamespacePrefix = null",
            PermissionSet: "SELECT Name, Label, Description FROM PermissionSet WHERE IsCustom = true",
            Profile: "SELECT Name FROM Profile",
            Layout: "SELECT Name, TableEnumOrId FROM Layout",
            RecordType: "SELECT DeveloperName, SobjectType, IsActive FROM RecordType"
        };

        const query = queries[componentType];
        if (!query) {
            return { records: [], count: 0, note: 'No query defined for component type' };
        }

        try {
            const result = this._executeQuery(orgAlias, query, true);
            return {
                records: result.records || [],
                count: result.totalSize || 0,
                queriedAt: new Date().toISOString()
            };
        } catch (error) {
            return { records: [], count: 0, error: error.message };
        }
    }

    /**
     * Execute SOQL query
     */
    _executeQuery(orgAlias, query, useToolingApi = false) {
        try {
            const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
            const cmd = `sf data query --query "${query}" ${toolingFlag} --target-org ${orgAlias} --json`;

            const output = execSync(cmd, {
                encoding: 'utf8',
                timeout: 60000,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);
            return result.result || { records: [], totalSize: 0 };
        } catch (error) {
            if (this.verbose) {
                console.error(`[STATE] Query error: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Compare two states and return differences
     * @param {Object} before - Previous state
     * @param {Object} after - Current state
     * @returns {Object} Differences
     */
    compareStates(before, after) {
        if (!before || !after) {
            return { error: 'Both states required for comparison' };
        }

        const diff = {
            beforeId: before.id,
            afterId: after.id,
            comparedAt: new Date().toISOString(),
            changes: {},
            summary: {
                added: 0,
                modified: 0,
                removed: 0,
                unchanged: 0
            }
        };

        const allComponentTypes = new Set([
            ...Object.keys(before.components || {}),
            ...Object.keys(after.components || {})
        ]);

        for (const componentType of allComponentTypes) {
            const beforeData = before.components?.[componentType] || { records: [] };
            const afterData = after.components?.[componentType] || { records: [] };

            const componentDiff = this._compareRecords(
                beforeData.records || [],
                afterData.records || [],
                componentType
            );

            diff.changes[componentType] = componentDiff;
            diff.summary.added += componentDiff.added.length;
            diff.summary.modified += componentDiff.modified.length;
            diff.summary.removed += componentDiff.removed.length;
            diff.summary.unchanged += componentDiff.unchanged.length;
        }

        return diff;
    }

    /**
     * Compare record arrays
     */
    _compareRecords(beforeRecords, afterRecords, componentType) {
        const getKey = (record) => {
            // Use appropriate identifier based on component type
            return record.DeveloperName || record.Name || record.ValidationName || record.Id;
        };

        const beforeMap = new Map(beforeRecords.map(r => [getKey(r), r]));
        const afterMap = new Map(afterRecords.map(r => [getKey(r), r]));

        const result = {
            added: [],
            modified: [],
            removed: [],
            unchanged: []
        };

        // Find added and modified
        for (const [key, afterRecord] of afterMap) {
            if (!beforeMap.has(key)) {
                result.added.push({ key, record: afterRecord });
            } else {
                const beforeRecord = beforeMap.get(key);
                if (this._recordChanged(beforeRecord, afterRecord, componentType)) {
                    result.modified.push({
                        key,
                        before: beforeRecord,
                        after: afterRecord,
                        changes: this._getRecordChanges(beforeRecord, afterRecord)
                    });
                } else {
                    result.unchanged.push({ key, record: afterRecord });
                }
            }
        }

        // Find removed
        for (const [key, beforeRecord] of beforeMap) {
            if (!afterMap.has(key)) {
                result.removed.push({ key, record: beforeRecord });
            }
        }

        return result;
    }

    /**
     * Check if record changed
     */
    _recordChanged(before, after, componentType) {
        // Compare relevant fields based on component type
        const fieldsToCompare = {
            FlowDefinition: ['ActiveVersion', 'LatestVersion'],
            ValidationRule: ['Active'],
            ApexClass: ['Status', 'ApiVersion'],
            ApexTrigger: ['Status', 'ApiVersion'],
            CustomField: ['DataType'],
            PermissionSet: ['Label', 'Description'],
            RecordType: ['IsActive']
        };

        const fields = fieldsToCompare[componentType] || Object.keys(after);

        for (const field of fields) {
            const beforeVal = this._getNestedValue(before, field);
            const afterVal = this._getNestedValue(after, field);

            if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get nested value from object
     */
    _getNestedValue(obj, path) {
        const parts = path.split('.');
        let value = obj;

        for (const part of parts) {
            if (value === null || value === undefined) return undefined;
            value = value[part];
        }

        return value;
    }

    /**
     * Get specific changes between records
     */
    _getRecordChanges(before, after) {
        const changes = [];

        for (const key of Object.keys(after)) {
            if (key.startsWith('attributes')) continue;

            const beforeVal = before[key];
            const afterVal = after[key];

            if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
                changes.push({
                    field: key,
                    before: beforeVal,
                    after: afterVal
                });
            }
        }

        return changes;
    }

    /**
     * Record a deployment
     * @param {Object} deployment - Deployment details
     * @returns {Object} Deployment record
     */
    recordDeployment(deployment) {
        const record = {
            id: this._generateStateId(),
            timestamp: new Date().toISOString(),
            orgAlias: deployment.orgAlias || this.orgAlias,
            source: deployment.source,
            components: deployment.components || [],
            status: deployment.status || 'unknown',
            beforeStateId: this.previousState?.id || null,
            afterStateId: this.currentState?.id || null,
            metadata: deployment.metadata || {}
        };

        this.deploymentHistory.push(record);
        this._saveHistory();

        return record;
    }

    /**
     * Verify deployment succeeded
     * @param {Object} expected - Expected changes
     * @returns {Object} Verification result
     */
    async verifyDeployment(expected = {}) {
        if (!this.previousState || !this.currentState) {
            return {
                verified: false,
                error: 'Cannot verify - missing state snapshots'
            };
        }

        const diff = this.compareStates(this.previousState, this.currentState);

        const verification = {
            verified: true,
            diff,
            checks: []
        };

        // Verify expected additions
        if (expected.added) {
            for (const item of expected.added) {
                const componentType = item.type;
                const componentName = item.name;

                const found = diff.changes[componentType]?.added.some(
                    a => a.key === componentName
                );

                verification.checks.push({
                    check: 'added',
                    type: componentType,
                    name: componentName,
                    passed: found
                });

                if (!found) verification.verified = false;
            }
        }

        // Verify expected modifications
        if (expected.modified) {
            for (const item of expected.modified) {
                const componentType = item.type;
                const componentName = item.name;

                const found = diff.changes[componentType]?.modified.some(
                    m => m.key === componentName
                );

                verification.checks.push({
                    check: 'modified',
                    type: componentType,
                    name: componentName,
                    passed: found
                });

                if (!found) verification.verified = false;
            }
        }

        // Check for unexpected removals
        if (expected.noRemovals !== false) {
            const unexpectedRemovals = [];

            for (const [componentType, changes] of Object.entries(diff.changes)) {
                if (changes.removed.length > 0) {
                    unexpectedRemovals.push({
                        type: componentType,
                        items: changes.removed.map(r => r.key)
                    });
                }
            }

            if (unexpectedRemovals.length > 0) {
                verification.checks.push({
                    check: 'no_unexpected_removals',
                    passed: false,
                    details: unexpectedRemovals
                });
                verification.verified = false;
            }
        }

        return verification;
    }

    /**
     * Detect if rollback occurred
     * @returns {Object} Rollback detection result
     */
    detectRollback() {
        if (this.deploymentHistory.length < 2) {
            return { rollbackDetected: false, reason: 'Insufficient history' };
        }

        // Check if current state matches a previous state
        const snapshots = this._loadSnapshots();

        if (snapshots.length < 2) {
            return { rollbackDetected: false, reason: 'Insufficient snapshots' };
        }

        const current = this.currentState;

        for (let i = 0; i < snapshots.length - 1; i++) {
            const older = snapshots[i];
            const diff = this.compareStates(older, current);

            // If very few changes, might be a rollback
            const totalChanges = diff.summary.added + diff.summary.modified + diff.summary.removed;

            if (totalChanges === 0) {
                return {
                    rollbackDetected: true,
                    rolledBackTo: older.id,
                    rolledBackAt: older.capturedAt,
                    currentStateId: current.id
                };
            }
        }

        return { rollbackDetected: false };
    }

    /**
     * Get flow activation status
     * @param {string} flowName - Flow developer name
     * @returns {Object} Flow status
     */
    async getFlowStatus(flowName) {
        if (!this.currentState) {
            throw new Error('No state captured. Call captureState first.');
        }

        const flows = this.currentState.components?.FlowDefinition?.records || [];
        const flow = flows.find(f => f.DeveloperName === flowName);

        if (!flow) {
            return { found: false, flowName };
        }

        return {
            found: true,
            flowName,
            activeVersion: flow.ActiveVersion?.VersionNumber || null,
            latestVersion: flow.LatestVersion?.VersionNumber || null,
            isActivated: flow.ActiveVersion !== null,
            isDraft: flow.ActiveVersion?.VersionNumber !== flow.LatestVersion?.VersionNumber
        };
    }

    /**
     * Verify Flow activation status after deployment
     * Queries FlowDefinition to verify the flow is active
     * @param {string} flowName - Flow developer name
     * @param {string} orgAlias - Salesforce org alias
     * @returns {Object} Verification result
     */
    async verifyFlowActivation(flowName, orgAlias = null) {
        const org = orgAlias || this.orgAlias;
        if (!org) {
            throw new Error('Org alias is required');
        }

        if (this.verbose) {
            console.log(`[STATE] Verifying Flow activation: ${flowName}`);
        }

        try {
            const query = `SELECT DeveloperName, ActiveVersion.VersionNumber, LatestVersion.VersionNumber FROM FlowDefinition WHERE DeveloperName = '${flowName}'`;
            const result = this._executeQuery(org, query, true);
            const records = result.records || [];

            if (records.length === 0) {
                return {
                    verified: false,
                    flowName,
                    error: `Flow '${flowName}' not found in org`,
                    suggestion: 'Check the flow API name and ensure deployment completed successfully'
                };
            }

            const flow = records[0];
            const activeVersion = flow.ActiveVersion?.VersionNumber || null;
            const latestVersion = flow.LatestVersion?.VersionNumber || null;
            const isActive = activeVersion !== null;
            const needsActivation = !isActive || (latestVersion && activeVersion !== latestVersion);

            return {
                verified: isActive && !needsActivation,
                flowName,
                activeVersion,
                latestVersion,
                isActive,
                needsActivation,
                status: isActive ? 'Active' : 'Draft',
                warning: needsActivation ? `Flow deployed but latest version (${latestVersion}) is not active. Current active: ${activeVersion || 'none'}` : null
            };
        } catch (error) {
            return {
                verified: false,
                flowName,
                error: error.message,
                suggestion: 'Query failed - check org connection and permissions'
            };
        }
    }

    /**
     * Attempt to activate a Flow that deployed as Draft
     * @param {string} flowName - Flow developer name
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Activation options
     * @returns {Object} Activation result
     */
    async activateFlow(flowName, orgAlias = null, options = {}) {
        const org = orgAlias || this.orgAlias;
        const maxRetries = options.maxRetries || 3;
        const retryDelayMs = options.retryDelayMs || 2000;

        if (!org) {
            throw new Error('Org alias is required');
        }

        if (this.verbose) {
            console.log(`[STATE] Attempting to activate Flow: ${flowName}`);
        }

        // First verify current status
        const status = await this.verifyFlowActivation(flowName, org);

        if (status.verified) {
            return {
                success: true,
                message: 'Flow is already active',
                flowName,
                activeVersion: status.activeVersion
            };
        }

        if (!status.latestVersion) {
            return {
                success: false,
                message: 'Cannot activate - no version to activate',
                flowName,
                error: status.error
            };
        }

        // Attempt activation using sf flow activate command
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (this.verbose) {
                    console.log(`[STATE] Activation attempt ${attempt}/${maxRetries}`);
                }

                // Use Tooling API to activate the Flow
                // First get the FlowDefinition Id
                const defQuery = `SELECT Id FROM FlowDefinition WHERE DeveloperName = '${flowName}'`;
                const defResult = this._executeQuery(org, defQuery, true);

                if (!defResult.records || defResult.records.length === 0) {
                    throw new Error('FlowDefinition not found');
                }

                const flowDefId = defResult.records[0].Id;

                // Now get the latest FlowVersion to activate
                const versionQuery = `SELECT Id, VersionNumber FROM FlowVersion WHERE FlowDefinitionId = '${flowDefId}' ORDER BY VersionNumber DESC LIMIT 1`;
                const versionResult = this._executeQuery(org, versionQuery, true);

                if (!versionResult.records || versionResult.records.length === 0) {
                    throw new Error('No FlowVersion found');
                }

                const latestVersionId = versionResult.records[0].Id;

                // Activate using Tooling API update
                const activateCmd = `sf data update record --sobject FlowDefinition --record-id ${flowDefId} --values "ActiveVersionId='${latestVersionId}'" --use-tooling-api --target-org ${org} --json`;

                execSync(activateCmd, {
                    encoding: 'utf8',
                    timeout: 60000,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                // Verify activation succeeded
                const verifyResult = await this.verifyFlowActivation(flowName, org);

                if (verifyResult.verified) {
                    return {
                        success: true,
                        message: `Flow activated successfully on attempt ${attempt}`,
                        flowName,
                        activeVersion: verifyResult.activeVersion,
                        attempts: attempt
                    };
                }

            } catch (error) {
                if (this.verbose) {
                    console.error(`[STATE] Activation attempt ${attempt} failed: ${error.message}`);
                }

                if (attempt < maxRetries) {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                }
            }
        }

        return {
            success: false,
            message: `Failed to activate Flow after ${maxRetries} attempts`,
            flowName,
            suggestion: 'Manually activate the flow in Salesforce Setup → Flows → Activate'
        };
    }

    /**
     * Post-deployment Flow verification with auto-retry
     * Use this after deploying Flows to ensure they're active
     * @param {Array} flowNames - List of flow developer names
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Options including autoActivate flag
     * @returns {Object} Verification results for all flows
     */
    async verifyFlowsPostDeployment(flowNames, orgAlias = null, options = {}) {
        const org = orgAlias || this.orgAlias;
        const autoActivate = options.autoActivate !== false; // Default to true

        const results = {
            timestamp: new Date().toISOString(),
            orgAlias: org,
            flows: [],
            summary: {
                total: flowNames.length,
                active: 0,
                draft: 0,
                notFound: 0,
                activated: 0,
                failed: 0
            }
        };

        for (const flowName of flowNames) {
            const verification = await this.verifyFlowActivation(flowName, org);

            if (!verification.flowName) {
                verification.flowName = flowName;
            }

            if (verification.error && verification.error.includes('not found')) {
                results.summary.notFound++;
                verification.finalStatus = 'not_found';
            } else if (verification.verified) {
                results.summary.active++;
                verification.finalStatus = 'active';
            } else if (verification.needsActivation && autoActivate) {
                // Try to activate
                const activationResult = await this.activateFlow(flowName, org);

                if (activationResult.success) {
                    results.summary.activated++;
                    verification.finalStatus = 'auto_activated';
                    verification.activationResult = activationResult;
                } else {
                    results.summary.failed++;
                    verification.finalStatus = 'activation_failed';
                    verification.activationResult = activationResult;
                }
            } else {
                results.summary.draft++;
                verification.finalStatus = 'draft';
            }

            results.flows.push(verification);
        }

        results.allActive = results.summary.active + results.summary.activated === results.summary.total;

        return results;
    }

    /**
     * Get deployment history
     * @param {number} limit - Max records to return
     * @returns {Array} Deployment history
     */
    getHistory(limit = 10) {
        return this.deploymentHistory.slice(-limit);
    }

    /**
     * Generate report of current state
     * @returns {string} Markdown report
     */
    generateReport() {
        if (!this.currentState) {
            return '# Deployment State Report\n\nNo state captured.';
        }

        const lines = [
            '# Deployment State Report',
            '',
            `**State ID:** ${this.currentState.id}`,
            `**Org Alias:** ${this.currentState.orgAlias}`,
            `**Captured At:** ${this.currentState.capturedAt}`,
            '',
            '## Component Summary',
            ''
        ];

        for (const [type, data] of Object.entries(this.currentState.components)) {
            const count = data.count || data.records?.length || 0;
            const status = data.error ? `⚠️ Error: ${data.error}` : `✅ ${count} records`;
            lines.push(`- **${type}:** ${status}`);
        }

        if (this.previousState) {
            const diff = this.compareStates(this.previousState, this.currentState);
            lines.push('');
            lines.push('## Changes Since Last Capture');
            lines.push('');
            lines.push(`- **Added:** ${diff.summary.added}`);
            lines.push(`- **Modified:** ${diff.summary.modified}`);
            lines.push(`- **Removed:** ${diff.summary.removed}`);
            lines.push(`- **Unchanged:** ${diff.summary.unchanged}`);
        }

        if (this.deploymentHistory.length > 0) {
            lines.push('');
            lines.push('## Recent Deployments');
            lines.push('');

            const recent = this.getHistory(5);
            for (const deployment of recent) {
                lines.push(`- **${deployment.timestamp}:** ${deployment.status} (${deployment.source || 'unknown source'})`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Save snapshot to disk
     */
    _saveSnapshot(state) {
        const filename = `snapshot-${state.id}.json`;
        const filepath = path.join(this.stateDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(state, null, 2));

        // Clean up old snapshots
        this._cleanupSnapshots();
    }

    /**
     * Load all snapshots
     */
    _loadSnapshots() {
        const files = fs.readdirSync(this.stateDir)
            .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
            .sort();

        return files.map(f => {
            const filepath = path.join(this.stateDir, f);
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        });
    }

    /**
     * Clean up old snapshots
     */
    _cleanupSnapshots() {
        const files = fs.readdirSync(this.stateDir)
            .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
            .sort();

        while (files.length > this.maxSnapshots) {
            const oldest = files.shift();
            fs.unlinkSync(path.join(this.stateDir, oldest));
        }
    }

    /**
     * Save deployment history
     */
    _saveHistory() {
        const filepath = path.join(this.stateDir, 'history.json');
        fs.writeFileSync(filepath, JSON.stringify(this.deploymentHistory, null, 2));
    }

    /**
     * Load deployment history
     */
    _loadHistory() {
        const filepath = path.join(this.stateDir, 'history.json');

        if (fs.existsSync(filepath)) {
            try {
                this.deploymentHistory = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            } catch (error) {
                this.deploymentHistory = [];
            }
        }
    }

    /**
     * Generate state ID
     */
    _generateStateId() {
        return `state-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }

    /**
     * Clear all state data
     */
    clearState() {
        this.currentState = null;
        this.previousState = null;
        this.deploymentHistory = [];

        // Remove all files in state directory
        if (fs.existsSync(this.stateDir)) {
            const files = fs.readdirSync(this.stateDir);
            for (const file of files) {
                fs.unlinkSync(path.join(this.stateDir, file));
            }
        }
    }

    /**
     * Get statistics
     */
    getStatistics() {
        const snapshots = this._loadSnapshots();

        return {
            snapshotCount: snapshots.length,
            deploymentCount: this.deploymentHistory.length,
            currentStateId: this.currentState?.id || null,
            previousStateId: this.previousState?.id || null,
            lastCaptured: this.currentState?.capturedAt || null,
            lastDeployment: this.deploymentHistory.length > 0
                ? this.deploymentHistory[this.deploymentHistory.length - 1].timestamp
                : null
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const orgAlias = args[1];

    const tracker = new DeploymentStateTracker({
        verbose: args.includes('--verbose'),
        orgAlias
    });

    (async () => {
        switch (command) {
            case 'capture':
                if (!orgAlias) {
                    console.error('Usage: deployment-state-tracker capture <org-alias>');
                    process.exit(1);
                }

                console.log(`Capturing state for ${orgAlias}...`);
                const state = await tracker.captureState(orgAlias);
                console.log(JSON.stringify(state, null, 2));
                break;

            case 'compare':
                const snapshots = tracker._loadSnapshots();
                if (snapshots.length < 2) {
                    console.error('Need at least 2 snapshots to compare');
                    process.exit(1);
                }

                const before = snapshots[snapshots.length - 2];
                const after = snapshots[snapshots.length - 1];
                const diff = tracker.compareStates(before, after);
                console.log(JSON.stringify(diff, null, 2));
                break;

            case 'report':
                if (orgAlias) {
                    await tracker.captureState(orgAlias);
                }
                console.log(tracker.generateReport());
                break;

            case 'history':
                console.log(JSON.stringify(tracker.getHistory(), null, 2));
                break;

            case 'stats':
                console.log(JSON.stringify(tracker.getStatistics(), null, 2));
                break;

            default:
                console.log(`
Deployment State Tracker - Track Salesforce deployment state transitions

Usage:
  deployment-state-tracker capture <org-alias>    Capture current org state
  deployment-state-tracker compare                Compare last two snapshots
  deployment-state-tracker report [org-alias]     Generate state report
  deployment-state-tracker history                Show deployment history
  deployment-state-tracker stats                  Show statistics

Examples:
  deployment-state-tracker capture myorg
  deployment-state-tracker compare --verbose
  deployment-state-tracker report myorg
                `);
        }
    })().catch(error => {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { DeploymentStateTracker };
