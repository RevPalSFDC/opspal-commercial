#!/usr/bin/env node

/**
 * Salesforce Order of Operations - Permission Guardrail
 *
 * Implements Section F (Guardrails) from the Salesforce Order of Operations playbook.
 *
 * Rule: No silent permission downgrades without explicit allow_downgrade flag.
 *
 * Purpose:
 * - Detect permission downgrades before deployment
 * - Require explicit --allow-downgrade flag for intentional downgrades
 * - Log all permission changes for audit trail
 * - Prevent accidental permission removal
 *
 * @see docs/SALESFORCE_ORDER_OF_OPERATIONS.md Section F
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const execAsync = promisify(exec);

class OOOPermissionGuardrail {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.allowDowngrade = options.allowDowngrade || false;
    }

    /**
     * Validate Permission Changes
     *
     * Compares existing permissions with planned changes and detects downgrades.
     *
     * @param {string} permissionSetName - Permission set name
     * @param {object} plannedChanges - New permission configuration
     * @returns {Promise<object>} Validation result with downgrade detection
     */
    async validatePermissionChanges(permissionSetName, plannedChanges) {
        this.log(`🔍 Validating permission changes for ${permissionSetName}...`);

        try {
            // Get current permissions
            const currentPermissions = await this.getCurrentPermissions(permissionSetName);

            if (!currentPermissions) {
                // New permission set, no downgrades possible
                return {
                    valid: true,
                    isNew: true,
                    downgrades: [],
                    upgrades: this.countPermissions(plannedChanges)
                };
            }

            // Compare permissions
            const comparison = this.comparePermissions(currentPermissions, plannedChanges);

            if (comparison.downgrades.length > 0 && !this.allowDowngrade) {
                return {
                    valid: false,
                    downgrades: comparison.downgrades,
                    error: `Permission downgrades detected. Use --allow-downgrade flag to proceed.`,
                    details: comparison.downgrades.map(d => ({
                        type: d.type,
                        target: d.target,
                        current: d.current,
                        planned: d.planned,
                        impact: d.impact
                    }))
                };
            }

            // Log all changes
            await this.logPermissionChanges(permissionSetName, comparison);

            return {
                valid: true,
                downgrades: comparison.downgrades,
                upgrades: comparison.upgrades,
                unchanged: comparison.unchanged,
                allowedDowngrade: this.allowDowngrade && comparison.downgrades.length > 0
            };

        } catch (error) {
            throw new Error(`Permission validation failed: ${error.message}`);
        }
    }

    /**
     * Get Current Permissions
     *
     * Retrieves existing permission set via Tooling API.
     *
     * @param {string} permissionSetName - Permission set name
     * @returns {Promise<object>} Current permissions or null
     */
    async getCurrentPermissions(permissionSetName) {
        try {
            // Query permission set
            const query = `SELECT Id, Name FROM PermissionSet WHERE Name = '${permissionSetName}' LIMIT 1`;

            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const result = JSON.parse(stdout);
            const permSet = result.result?.records?.[0];

            if (!permSet) {
                return null;
            }

            // Get field permissions
            const fpQuery = `
                SELECT Field, PermissionsRead, PermissionsEdit
                FROM FieldPermissions
                WHERE ParentId = '${permSet.Id}'
            `;

            const fpResult = await execAsync(
                `sf data query --query "${fpQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const fieldPermissions = JSON.parse(fpResult.stdout).result?.records || [];

            // Get object permissions
            const opQuery = `
                SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete
                FROM ObjectPermissions
                WHERE ParentId = '${permSet.Id}'
            `;

            const opResult = await execAsync(
                `sf data query --query "${opQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`,
                { maxBuffer: 10 * 1024 * 1024 }
            );

            const objectPermissions = JSON.parse(opResult.stdout).result?.records || [];

            return {
                id: permSet.Id,
                name: permSet.Name,
                fieldPermissions,
                objectPermissions
            };

        } catch (error) {
            this.log(`Warning: Failed to retrieve current permissions: ${error.message}`);
            return null;
        }
    }

    /**
     * Compare Permissions
     *
     * Identifies upgrades, downgrades, and unchanged permissions.
     *
     * @param {object} current - Current permissions
     * @param {object} planned - Planned permissions
     * @returns {object} Comparison result
     */
    comparePermissions(current, planned) {
        const downgrades = [];
        const upgrades = [];
        const unchanged = [];

        // Compare field permissions
        for (const currentFP of current.fieldPermissions) {
            const plannedFP = planned.fieldPermissions?.find(p => p.field === currentFP.Field);

            if (!plannedFP) {
                // Field permission removed
                downgrades.push({
                    type: 'FIELD_PERMISSION_REMOVED',
                    target: currentFP.Field,
                    current: { read: currentFP.PermissionsRead, edit: currentFP.PermissionsEdit },
                    planned: { read: false, edit: false },
                    impact: 'Field will become inaccessible'
                });
            } else {
                // Check for downgrades
                if (currentFP.PermissionsRead && !plannedFP.readable) {
                    downgrades.push({
                        type: 'FIELD_READ_REMOVED',
                        target: currentFP.Field,
                        current: { read: true },
                        planned: { read: false },
                        impact: 'Field will no longer be readable'
                    });
                }

                if (currentFP.PermissionsEdit && !plannedFP.editable) {
                    downgrades.push({
                        type: 'FIELD_EDIT_REMOVED',
                        target: currentFP.Field,
                        current: { edit: true },
                        planned: { edit: false },
                        impact: 'Field will no longer be editable'
                    });
                }

                // Check for upgrades
                if (!currentFP.PermissionsRead && plannedFP.readable) {
                    upgrades.push({
                        type: 'FIELD_READ_ADDED',
                        target: currentFP.Field
                    });
                }

                if (!currentFP.PermissionsEdit && plannedFP.editable) {
                    upgrades.push({
                        type: 'FIELD_EDIT_ADDED',
                        target: currentFP.Field
                    });
                }
            }
        }

        // Check for new field permissions
        for (const plannedFP of (planned.fieldPermissions || [])) {
            const currentFP = current.fieldPermissions.find(p => p.Field === plannedFP.field);

            if (!currentFP) {
                upgrades.push({
                    type: 'FIELD_PERMISSION_ADDED',
                    target: plannedFP.field,
                    permissions: { read: plannedFP.readable, edit: plannedFP.editable }
                });
            }
        }

        return {
            downgrades,
            upgrades,
            unchanged
        };
    }

    /**
     * Log Permission Changes
     *
     * Creates audit trail of all permission changes.
     *
     * @param {string} permissionSetName - Permission set name
     * @param {object} comparison - Permission comparison result
     */
    async logPermissionChanges(permissionSetName, comparison) {
        const logEntry = {
            permissionSet: permissionSetName,
            timestamp: new Date().toISOString(),
            org: this.orgAlias,
            downgrades: comparison.downgrades,
            upgrades: comparison.upgrades,
            allowDowngrade: this.allowDowngrade
        };

        const logDir = './.ooo-logs';
        try {
            await fs.mkdir(logDir, { recursive: true });
            const logFile = path.join(logDir, `permission-changes-${Date.now()}.json`);
            await fs.writeFile(logFile, JSON.stringify(logEntry, null, 2), 'utf8');

            this.log(`  Permission changes logged to ${logFile}`);
        } catch (error) {
            this.log(`  Warning: Failed to log permission changes: ${error.message}`);
        }
    }

    /**
     * Count Permissions
     *
     * Helper to count total permissions in a set.
     */
    countPermissions(permissionSet) {
        return {
            fieldPermissions: permissionSet.fieldPermissions?.length || 0,
            objectPermissions: permissionSet.objectPermissions?.length || 0
        };
    }

    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
}

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log(`
Salesforce Order of Operations - Permission Guardrail

Usage:
  node ooo-permission-guardrail.js validate <permission-set> <org> --planned <json> [options]

Commands:
  validate    Validate permission changes and detect downgrades

Options:
  --planned <json>        Planned permission changes as JSON
  --allow-downgrade       Explicitly allow permission downgrades (default: false)
  --verbose               Show detailed logging

Example:
  node ooo-permission-guardrail.js validate AgentAccess myorg \
    --planned '{"fieldPermissions":[{"field":"Account.Test__c","readable":true,"editable":true}]}' \
    --verbose

  # Allow downgrade (explicit)
  node ooo-permission-guardrail.js validate AgentAccess myorg \
    --planned '{"fieldPermissions":[]}' \
    --allow-downgrade
        `);
        process.exit(0);
    }

    async function runCLI() {
        if (command !== 'validate') {
            console.error(`Unknown command: ${command}`);
            process.exit(1);
        }

        const permissionSet = args[1];
        const org = args[2];

        if (!permissionSet || !org) {
            console.error('Error: Permission set and org are required');
            process.exit(1);
        }

        const plannedIndex = args.indexOf('--planned');
        if (plannedIndex === -1 || !args[plannedIndex + 1]) {
            console.error('Error: --planned is required');
            process.exit(1);
        }

        const planned = JSON.parse(args[plannedIndex + 1]);

        const options = {
            verbose: args.includes('--verbose'),
            allowDowngrade: args.includes('--allow-downgrade')
        };

        const guardrail = new OOOPermissionGuardrail(org, options);

        try {
            const result = await guardrail.validatePermissionChanges(permissionSet, planned);

            console.log(JSON.stringify(result, null, 2));

            if (result.valid) {
                if (result.downgrades?.length > 0) {
                    console.log('\n⚠️  Permission downgrades allowed with --allow-downgrade flag');
                }
                process.exit(0);
            } else {
                console.error('\n❌ Permission downgrades detected - deployment blocked');
                console.error('   Use --allow-downgrade flag to proceed');
                process.exit(1);
            }

        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = { OOOPermissionGuardrail };
