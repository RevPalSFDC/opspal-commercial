#!/usr/bin/env node
/**
 * Validation Rule Manager
 *
 * Provides programmatic interface for validation rule operations using Salesforce Metadata API.
 *
 * Key Limitations:
 * - ValidationRule metadata is READ-ONLY via Tooling API
 * - Must use Metadata API workflow: retrieve → modify → deploy
 * - Direct updates via Tooling API will fail with "invalid cross reference id"
 *
 * Usage:
 *   const manager = new ValidationRuleManager(orgAlias);
 *   await manager.listActive('Opportunity');
 *   await manager.deactivate('Opportunity', ['Rule1', 'Rule2']);
 *
 * See: docs/SALESFORCE_API_LIMITATIONS.md#validation-rule-metadata-limitations
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ValidationRuleManager {
    constructor(orgAlias) {
        if (!orgAlias) {
            throw new Error('Organization alias is required');
        }
        this.orgAlias = orgAlias;
        this.backupDir = path.join(process.cwd(), 'backups');
    }

    /**
     * List all active validation rules for an object
     *
     * @param {string} objectName - API name of the object (e.g., 'Opportunity')
     * @returns {Promise<Array>} Array of active validation rules
     */
    async listActive(objectName) {
        console.log(`Querying active validation rules for ${objectName}...`);

        const query = `SELECT Id, ValidationName, Active, ErrorDisplayField, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND Active = true ORDER BY ValidationName`;

        try {
            const result = execSync(
                `sf data query --query "${query}" --use-tooling-api --target-org "${this.orgAlias}" --json`,
                { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
            );

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Query failed: ${data.message}`);
            }

            const rules = data.result.records || [];
            console.log(`✓ Found ${rules.length} active validation rules`);

            return rules;
        } catch (error) {
            throw new Error(`Failed to query validation rules: ${error.message}`);
        }
    }

    /**
     * List all validation rules (active and inactive) for an object
     *
     * @param {string} objectName - API name of the object
     * @returns {Promise<Array>} Array of all validation rules
     */
    async listAll(objectName) {
        console.log(`Querying all validation rules for ${objectName}...`);

        const query = `SELECT Id, ValidationName, Active, ErrorDisplayField, ErrorMessage FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}' ORDER BY ValidationName`;

        try {
            const result = execSync(
                `sf data query --query "${query}" --use-tooling-api --target-org "${this.orgAlias}" --json`,
                { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
            );

            const data = JSON.parse(result);

            if (data.status !== 0) {
                throw new Error(`Query failed: ${data.message}`);
            }

            const rules = data.result.records || [];
            console.log(`✓ Found ${rules.length} total validation rules`);

            return rules;
        } catch (error) {
            throw new Error(`Failed to query validation rules: ${error.message}`);
        }
    }

    /**
     * Deactivate validation rules using Metadata API workflow
     *
     * @param {string} objectName - API name of the object
     * @param {Array<string>} ruleNames - Array of ValidationName values to deactivate
     * @param {Object} options - Options: { backup: true, verify: true }
     * @returns {Promise<Object>} Result object with success status
     */
    async deactivate(objectName, ruleNames, options = {}) {
        const opts = { backup: true, verify: true, ...options };

        console.log(`\n╔════════════════════════════════════════════════════════════╗`);
        console.log(`║     Validation Rule Deactivation                          ║`);
        console.log(`╚════════════════════════════════════════════════════════════╝`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Object: ${objectName}`);
        console.log(`Rules: ${ruleNames.length}`);
        console.log();

        // Step 1: Pre-flight validation
        console.log('Step 1: Pre-flight validation...');
        await this._validateRulesExist(objectName, ruleNames);

        // Step 2: Create package.xml
        console.log('Step 2: Creating package.xml...');
        const packageXml = this._createPackageXml(objectName, ruleNames);
        const packagePath = `/tmp/vr-deactivate-${objectName}-${Date.now()}.xml`;
        fs.writeFileSync(packagePath, packageXml);
        console.log(`✓ Created: ${packagePath}`);

        // Step 3: Retrieve metadata
        console.log('Step 3: Retrieving validation rule metadata...');
        try {
            execSync(
                `sf project retrieve start --manifest "${packagePath}" --target-org "${this.orgAlias}" --wait 10`,
                { stdio: 'inherit' }
            );
            console.log('✓ Metadata retrieved');
        } catch (error) {
            throw new Error(`Metadata retrieval failed: ${error.message}`);
        }

        const rulesDir = path.join(process.cwd(), 'force-app', 'main', 'default', 'objects', objectName, 'validationRules');

        if (!fs.existsSync(rulesDir)) {
            throw new Error(`Validation rules directory not found: ${rulesDir}`);
        }

        // Step 4: Backup (if enabled)
        let backupPath = null;
        if (opts.backup) {
            console.log('Step 4: Creating backup...');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + Date.now();
            backupPath = path.join(this.backupDir, `validation-rules-${timestamp}`);

            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
            }

            execSync(`cp -r "${rulesDir}" "${backupPath}"`);
            console.log(`✓ Backup created: ${backupPath}`);
        }

        // Step 5: Modify XML files
        console.log('Step 5: Modifying validation rules to inactive...');
        const modifiedCount = this._batchModify(rulesDir, '<active>true</active>', '<active>false</active>');
        console.log(`✓ Modified ${modifiedCount} validation rule files`);

        // Step 6: Deploy changes
        console.log('Step 6: Deploying changes...');
        try {
            execSync(
                `sf project deploy start --source-dir "${rulesDir}" --target-org "${this.orgAlias}" --wait 10`,
                { stdio: 'inherit' }
            );
            console.log('✓ Deployment successful');
        } catch (error) {
            console.error('✗ Deployment failed');

            if (backupPath) {
                console.log('Restoring from backup...');
                execSync(`cp -r "${backupPath}/validationRules" "force-app/main/default/objects/${objectName}/"`);
                console.log(`✓ Restored from backup: ${backupPath}`);
            }

            throw new Error(`Deployment failed: ${error.message}`);
        }

        // Step 7: Verify (if enabled)
        if (opts.verify) {
            console.log('Step 7: Verifying deactivation...');
            console.log('Waiting 5 seconds for metadata propagation...');
            await this._sleep(5000);

            const activeRules = await this.listActive(objectName);
            const remainingActive = activeRules.filter(r => ruleNames.includes(r.ValidationName));

            if (remainingActive.length === 0) {
                console.log(`✓ SUCCESS: All ${ruleNames.length} validation rules deactivated`);
            } else {
                console.warn(`⚠ WARNING: ${remainingActive.length} rules still active`);
                console.warn('Still active:', remainingActive.map(r => r.ValidationName));
            }
        }

        return {
            success: true,
            rulesModified: modifiedCount,
            backupPath: backupPath,
            deploymentSuccessful: true
        };
    }

    /**
     * Activate validation rules using Metadata API workflow
     *
     * @param {string} objectName - API name of the object
     * @param {Array<string>} ruleNames - Array of ValidationName values to activate
     * @param {Object} options - Options: { backup: true, verify: true }
     * @returns {Promise<Object>} Result object with success status
     */
    async activate(objectName, ruleNames, options = {}) {
        const opts = { backup: true, verify: true, ...options };

        console.log(`\n╔════════════════════════════════════════════════════════════╗`);
        console.log(`║     Validation Rule Activation                            ║`);
        console.log(`╚════════════════════════════════════════════════════════════╝`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Object: ${objectName}`);
        console.log(`Rules: ${ruleNames.length}`);
        console.log();

        // Similar workflow to deactivate, but sets active to true
        console.log('Step 1: Creating package.xml...');
        const packageXml = this._createPackageXml(objectName, ruleNames);
        const packagePath = `/tmp/vr-activate-${objectName}-${Date.now()}.xml`;
        fs.writeFileSync(packagePath, packageXml);

        console.log('Step 2: Retrieving validation rule metadata...');
        execSync(
            `sf project retrieve start --manifest "${packagePath}" --target-org "${this.orgAlias}" --wait 10`,
            { stdio: 'inherit' }
        );

        const rulesDir = path.join(process.cwd(), 'force-app', 'main', 'default', 'objects', objectName, 'validationRules');

        if (opts.backup) {
            console.log('Step 3: Creating backup...');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + Date.now();
            const backupPath = path.join(this.backupDir, `validation-rules-${timestamp}`);

            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
            }

            execSync(`cp -r "${rulesDir}" "${backupPath}"`);
            console.log(`✓ Backup created: ${backupPath}`);
        }

        console.log('Step 4: Modifying validation rules to active...');
        const modifiedCount = this._batchModify(rulesDir, '<active>false</active>', '<active>true</active>');
        console.log(`✓ Modified ${modifiedCount} validation rule files`);

        console.log('Step 5: Deploying changes...');
        execSync(
            `sf project deploy start --source-dir "${rulesDir}" --target-org "${this.orgAlias}" --wait 10`,
            { stdio: 'inherit' }
        );
        console.log('✓ Deployment successful');

        if (opts.verify) {
            console.log('Step 6: Verifying activation...');
            await this._sleep(5000);

            const activeRules = await this.listActive(objectName);
            const nowActive = activeRules.filter(r => ruleNames.includes(r.ValidationName));

            console.log(`✓ SUCCESS: ${nowActive.length} of ${ruleNames.length} validation rules activated`);
        }

        return {
            success: true,
            rulesModified: modifiedCount,
            deploymentSuccessful: true
        };
    }

    /**
     * Bulk modify multiple validation rules with different operations
     *
     * @param {string} objectName - API name of the object
     * @param {Array<Object>} modifications - Array of {ruleName, operation, value}
     * @returns {Promise<Object>} Result object with success status
     */
    async bulkModify(objectName, modifications) {
        console.log(`Bulk modifying ${modifications.length} validation rules...`);

        // Group by operation type
        const deactivate = modifications
            .filter(m => m.operation === 'deactivate')
            .map(m => m.ruleName);

        const activate = modifications
            .filter(m => m.operation === 'activate')
            .map(m => m.ruleName);

        const results = {
            deactivated: 0,
            activated: 0,
            errors: []
        };

        if (deactivate.length > 0) {
            try {
                await this.deactivate(objectName, deactivate);
                results.deactivated = deactivate.length;
            } catch (error) {
                results.errors.push({ operation: 'deactivate', error: error.message });
            }
        }

        if (activate.length > 0) {
            try {
                await this.activate(objectName, activate);
                results.activated = activate.length;
            } catch (error) {
                results.errors.push({ operation: 'activate', error: error.message });
            }
        }

        return results;
    }

    // Private helper methods

    async _validateRulesExist(objectName, ruleNames) {
        const allRules = await this.listAll(objectName);
        const existingNames = allRules.map(r => r.ValidationName);

        const missing = ruleNames.filter(name => !existingNames.includes(name));

        if (missing.length > 0) {
            throw new Error(`Rules not found: ${missing.join(', ')}`);
        }

        console.log('✓ All rules exist');
    }

    _createPackageXml(objectName, ruleNames) {
        const members = ruleNames
            .map(name => `        <members>${objectName}.${name}</members>`)
            .join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
${members}
        <name>ValidationRule</name>
    </types>
    <version>61.0</version>
</Package>`;
    }

    _batchModify(directory, searchPattern, replacePattern) {
        const files = fs.readdirSync(directory)
            .filter(f => f.endsWith('.validationRule-meta.xml'))
            .map(f => path.join(directory, f));

        let modifiedCount = 0;

        files.forEach(file => {
            const content = fs.readFileSync(file, 'utf-8');
            if (content.includes(searchPattern)) {
                const newContent = content.replace(new RegExp(searchPattern, 'g'), replacePattern);
                fs.writeFileSync(file, newContent);
                modifiedCount++;
            }
        });

        return modifiedCount;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error(`
Usage: node validation-rule-manager.js <command> <org-alias> [options]

Commands:
  list-active <org> <object>                    List active validation rules
  list-all <org> <object>                       List all validation rules
  deactivate <org> <object> <rule1,rule2,...>   Deactivate specific rules
  activate <org> <object> <rule1,rule2,...>     Activate specific rules

Examples:
  node validation-rule-manager.js list-active rentable-sandbox Opportunity
  node validation-rule-manager.js deactivate rentable-sandbox Opportunity Amount_Required,Type_Required
  node validation-rule-manager.js activate rentable-sandbox Opportunity Amount_Required
`);
        process.exit(1);
    }

    const [command, orgAlias, objectName, ...rest] = args;
    const manager = new ValidationRuleManager(orgAlias);

    (async () => {
        try {
            switch (command) {
                case 'list-active':
                    const activeRules = await manager.listActive(objectName);
                    console.log(JSON.stringify(activeRules, null, 2));
                    break;

                case 'list-all':
                    const allRules = await manager.listAll(objectName);
                    console.log(JSON.stringify(allRules, null, 2));
                    break;

                case 'deactivate':
                    if (rest.length === 0) {
                        console.error('Error: Rule names required (comma-separated)');
                        process.exit(1);
                    }
                    const deactivateRules = rest[0].split(',').map(r => r.trim());
                    await manager.deactivate(objectName, deactivateRules);
                    break;

                case 'activate':
                    if (rest.length === 0) {
                        console.error('Error: Rule names required (comma-separated)');
                        process.exit(1);
                    }
                    const activateRules = rest[0].split(',').map(r => r.trim());
                    await manager.activate(objectName, activateRules);
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = ValidationRuleManager;
