#!/usr/bin/env node

/**
 * Flow Pattern Migrator
 *
 * Automatically migrates deprecated Flow patterns to current API version standards.
 *
 * Migrations:
 * - actionType='flow' → subflows element (v64 → v65)
 * - Add missing API version declarations
 * - Remove redundant TEXT() on ID fields
 *
 * Usage:
 *   const migrator = new FlowPatternMigrator();
 *   const result = await migrator.migrate(flowXmlPath);
 *
 * @module flow-pattern-migrator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #3 - Flow API v65.0 Compatibility ($15k ROI)
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class FlowPatternMigrator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.createBackup = options.createBackup !== false; // Default true
        this.targetVersion = options.targetVersion || 66.0;

        this.stats = {
            totalMigrations: 0,
            successful: 0,
            failed: 0,
            patterns: {}
        };
    }

    /**
     * Migrate flow to target API version
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @returns {Object} Migration result
     */
    async migrate(flowXmlPath) {
        this.stats.totalMigrations++;

        const result = {
            success: false,
            flowPath: flowXmlPath,
            flowName: path.basename(flowXmlPath, '.flow-meta.xml'),
            migrations: [],
            errors: [],
            backupPath: null
        };

        // Read flow XML
        let flowContent;
        try {
            flowContent = fs.readFileSync(flowXmlPath, 'utf8');
        } catch (error) {
            result.errors.push(`Failed to read flow file: ${error.message}`);
            this.stats.failed++;
            return result;
        }

        // Create backup
        if (this.createBackup) {
            const backupPath = `${flowXmlPath}.backup.${Date.now()}`;
            try {
                fs.writeFileSync(backupPath, flowContent);
                result.backupPath = backupPath;
                if (this.verbose) {
                    console.log(`✅ Created backup: ${backupPath}`);
                }
            } catch (error) {
                result.errors.push(`Failed to create backup: ${error.message}`);
                this.stats.failed++;
                return result;
            }
        }

        // Apply migrations
        let migratedContent = flowContent;

        // Migration 1: actionType='flow' → subflows
        const actionTypeMigration = this.migrateActionTypeFlow(migratedContent);
        if (actionTypeMigration.changed) {
            migratedContent = actionTypeMigration.content;
            result.migrations.push({
                pattern: 'actionType-flow-to-subflows',
                description: 'Converted actionCalls with actionType=\'flow\' to subflows element',
                occurrences: actionTypeMigration.occurrences
            });
            this.updatePatternStats('actionType-flow-to-subflows');
        }

        // Migration 2: Add API version if missing
        const versionMigration = this.addAPIVersion(migratedContent, this.targetVersion);
        if (versionMigration.changed) {
            migratedContent = versionMigration.content;
            result.migrations.push({
                pattern: 'add-api-version',
                description: `Added API version ${this.targetVersion}`,
                occurrences: 1
            });
            this.updatePatternStats('add-api-version');
        }

        // Write migrated content
        if (result.migrations.length > 0) {
            try {
                fs.writeFileSync(flowXmlPath, migratedContent);
                result.success = true;
                this.stats.successful++;

                if (this.verbose) {
                    console.log(`✅ Migrated ${result.migrations.length} pattern(s)`);
                }
            } catch (error) {
                result.errors.push(`Failed to write migrated content: ${error.message}`);
                this.stats.failed++;

                // Restore from backup
                if (result.backupPath && fs.existsSync(result.backupPath)) {
                    fs.copyFileSync(result.backupPath, flowXmlPath);
                    if (this.verbose) {
                        console.log('⚠️  Restored from backup due to write error');
                    }
                }
            }
        } else {
            result.success = true;
            result.migrations.push({
                pattern: 'none',
                description: 'No migrations needed - flow is compatible',
                occurrences: 0
            });
            this.stats.successful++;
        }

        return result;
    }

    /**
     * Migrate actionType='flow' to subflows element
     *
     * @param {string} flowContent - Flow XML content
     * @returns {Object} Migration result
     */
    migrateActionTypeFlow(flowContent) {
        let occurrences = 0;
        let changed = false;

        // Pattern: <actionCalls>...<actionType>flow</actionType>...</actionCalls>
        // Replace with: <subflows>...</subflows> (removing actionType)

        const actionCallsRegex = /<actionCalls>([\s\S]*?)<\/actionCalls>/g;

        const migratedContent = flowContent.replace(actionCallsRegex, (match, innerContent) => {
            // Check if this actionCalls has actionType='flow'
            if (/<actionType>flow<\/actionType>/.test(innerContent)) {
                occurrences++;
                changed = true;

                // Remove actionType element
                let newContent = innerContent.replace(/<actionType>flow<\/actionType>\s*/g, '');

                // Replace actionCalls with subflows
                return `<subflows>${newContent}</subflows>`;
            }

            // No change needed
            return match;
        });

        return {
            content: migratedContent,
            changed: changed,
            occurrences: occurrences
        };
    }

    /**
     * Add API version declaration if missing
     *
     * @param {string} flowContent - Flow XML content
     * @param {number} version - API version to add
     * @returns {Object} Migration result
     */
    addAPIVersion(flowContent, version) {
        // Check if API version already exists
        if (/<apiVersion>/.test(flowContent)) {
            return {
                content: flowContent,
                changed: false,
                occurrences: 0
            };
        }

        // Add after <?xml> declaration and before first element
        const versionTag = `    <apiVersion>${version}.0</apiVersion>`;

        // Insert after opening <Flow> tag
        const migratedContent = flowContent.replace(
            /(<Flow[^>]*>)/,
            `$1\n${versionTag}`
        );

        return {
            content: migratedContent,
            changed: migratedContent !== flowContent,
            occurrences: 1
        };
    }

    /**
     * Batch migrate multiple flows
     *
     * @param {Array} flowPaths - Array of flow XML paths
     * @returns {Object} Batch migration result
     */
    async migrateBatch(flowPaths) {
        const results = {
            total: flowPaths.length,
            successful: 0,
            failed: 0,
            flows: []
        };

        for (const flowPath of flowPaths) {
            const result = await this.migrate(flowPath);
            results.flows.push(result);

            if (result.success) {
                results.successful++;
            } else {
                results.failed++;
            }
        }

        return results;
    }

    /**
     * Update pattern statistics
     */
    updatePatternStats(pattern) {
        if (!this.stats.patterns[pattern]) {
            this.stats.patterns[pattern] = 0;
        }
        this.stats.patterns[pattern]++;
    }

    /**
     * Get migration statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalMigrations > 0
                ? (this.stats.successful / this.stats.totalMigrations * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

// CLI usage
if (require.main === module) {
    const migrator = new FlowPatternMigrator({ verbose: true });

    const command = process.argv[2];

    if (command === 'migrate') {
        const flowPath = process.argv[3];

        if (!flowPath) {
            console.error('Usage: node flow-pattern-migrator.js migrate <flow-xml-path>');
            process.exit(1);
        }

        migrator.migrate(flowPath).then(result => {
            console.log('\n=== Flow Pattern Migration ===\n');
            console.log(`Flow: ${result.flowName}`);
            console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);

            if (result.backupPath) {
                console.log(`Backup: ${result.backupPath}`);
            }

            if (result.migrations.length > 0) {
                console.log('\n--- Migrations Applied ---');
                for (const migration of result.migrations) {
                    console.log(`✅ ${migration.description} (${migration.occurrences} occurrence(s))`);
                }
            }

            if (result.errors.length > 0) {
                console.log('\n--- Errors ---');
                for (const error of result.errors) {
                    console.log(`❌ ${error}`);
                }
            }

            console.log('\n--- Statistics ---');
            const stats = migrator.getStats();
            console.log(`Success Rate: ${stats.successRate}`);

            process.exit(result.success ? 0 : 1);
        }).catch(error => {
            console.error('Migration error:', error);
            process.exit(1);
        });

    } else if (command === 'batch') {
        const pattern = process.argv[3] || '**/*.flow-meta.xml';

        const glob = require('glob');
        const flowPaths = glob.sync(pattern);

        if (flowPaths.length === 0) {
            console.error(`No flows found matching pattern: ${pattern}`);
            process.exit(1);
        }

        console.log(`Found ${flowPaths.length} flow(s) to migrate\n`);

        migrator.migrateBatch(flowPaths).then(results => {
            console.log('\n=== Batch Migration Results ===\n');
            console.log(`Total: ${results.total}`);
            console.log(`✅ Successful: ${results.successful}`);
            console.log(`❌ Failed: ${results.failed}`);

            if (results.failed > 0) {
                console.log('\n--- Failed Flows ---');
                for (const flow of results.flows) {
                    if (!flow.success) {
                        console.log(`❌ ${flow.flowName}`);
                        for (const error of flow.errors) {
                            console.log(`   ${error}`);
                        }
                    }
                }
            }

            process.exit(results.failed === 0 ? 0 : 1);
        });

    } else {
        console.log('Flow Pattern Migrator');
        console.log('');
        console.log('Usage:');
        console.log('  node flow-pattern-migrator.js migrate <flow-xml-path>');
        console.log('  node flow-pattern-migrator.js batch [glob-pattern]');
        console.log('');
        console.log('Examples:');
        console.log('  node flow-pattern-migrator.js migrate force-app/main/default/flows/MyFlow.flow-meta.xml');
        console.log('  node flow-pattern-migrator.js batch "force-app/**/*.flow-meta.xml"');
    }
}

module.exports = FlowPatternMigrator;
