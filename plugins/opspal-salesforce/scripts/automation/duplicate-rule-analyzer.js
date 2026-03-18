#!/usr/bin/env node

/**
 * Duplicate Rule Analyzer
 *
 * Analyzes Duplicate Rules and Matching Rules for automation auditing.
 * Identifies blocking vs alert-only rules and documents field-level matching criteria.
 *
 * Part of Wave 1: Automation Coverage Completion
 *
 * Usage:
 *   node duplicate-rule-analyzer.js --org <alias> [--object <ObjectName>] [--output json|csv|table]
 *
 * Examples:
 *   node duplicate-rule-analyzer.js --org production
 *   node duplicate-rule-analyzer.js --org sandbox --object Account
 *   node duplicate-rule-analyzer.js --org prod --output json
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class DuplicateRuleAnalyzer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.targetObject = options.object || null;
        this.outputFormat = options.output || 'table';
        this.reportDir = path.join(__dirname, '../../reports/automation-analysis');
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        this.results = {
            duplicateRules: [],
            matchingRules: [],
            fieldCriteria: [],
            blockingRules: [],
            alertOnlyRules: [],
            summary: {}
        };

        // Action types for duplicate rules
        this.actionTypes = {
            Block: 'Prevents record save if duplicate found',
            Allow: 'Allows save but shows duplicate alert',
            Report: 'Reports duplicates without blocking'
        };
    }

    async log(message, level = 'info') {
        const prefix = {
            info: '\x1b[36m[INFO]\x1b[0m',
            warn: '\x1b[33m[WARN]\x1b[0m',
            error: '\x1b[31m[ERROR]\x1b[0m',
            success: '\x1b[32m[SUCCESS]\x1b[0m'
        };
        console.log(`${prefix[level] || prefix.info} ${message}`);
    }

    async validateConnection() {
        try {
            const { stdout } = await execAsync(`sf org display --target-org ${this.orgAlias} --json`);
            const orgInfo = JSON.parse(stdout);

            if (!orgInfo.result) {
                throw new Error('Invalid org connection');
            }

            await this.log(`Connected to org: ${orgInfo.result.alias} (${orgInfo.result.instanceUrl})`, 'success');
            return orgInfo.result;
        } catch (error) {
            await this.log(`Failed to connect to org ${this.orgAlias}: ${error.message}`, 'error');
            throw error;
        }
    }

    async discoverDuplicateRules() {
        await this.log('Discovering Duplicate Rules...');

        try {
            // Query DuplicateRule using Tooling API
            const query = `
                SELECT Id, DeveloperName, MasterLabel, SobjectType, IsActive,
                       Description, ActionOnInsert, ActionOnUpdate,
                       AlertText, OperationsOnInsert, OperationsOnUpdate
                FROM DuplicateRule
                ${this.targetObject ? `WHERE SobjectType = '${this.targetObject}'` : ''}
                ORDER BY SobjectType, MasterLabel
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --use-tooling-api --json`
            );
            const result = JSON.parse(stdout);

            if (result.result && result.result.records) {
                this.results.duplicateRules = result.result.records.map(rule => {
                    const ruleData = {
                        id: rule.Id,
                        developerName: rule.DeveloperName,
                        label: rule.MasterLabel,
                        objectType: rule.SobjectType,
                        isActive: rule.IsActive,
                        description: rule.Description || '',
                        actionOnInsert: rule.ActionOnInsert,
                        actionOnUpdate: rule.ActionOnUpdate,
                        alertText: rule.AlertText || '',
                        operationsOnInsert: rule.OperationsOnInsert,
                        operationsOnUpdate: rule.OperationsOnUpdate,
                        isBlocking: rule.ActionOnInsert === 'Block' || rule.ActionOnUpdate === 'Block',
                        matchingRules: []
                    };

                    // Categorize as blocking or alert-only
                    if (ruleData.isBlocking && ruleData.isActive) {
                        this.results.blockingRules.push(ruleData);
                    } else if (ruleData.isActive) {
                        this.results.alertOnlyRules.push(ruleData);
                    }

                    return ruleData;
                });

                await this.log(`Found ${this.results.duplicateRules.length} Duplicate Rules`, 'success');
                await this.log(`  - Blocking: ${this.results.blockingRules.length}`, 'info');
                await this.log(`  - Alert-only: ${this.results.alertOnlyRules.length}`, 'info');
            } else {
                await this.log('No Duplicate Rules found', 'warn');
            }

            return this.results.duplicateRules;
        } catch (error) {
            await this.log(`Error discovering Duplicate Rules: ${error.message}`, 'error');
            return [];
        }
    }

    async discoverMatchingRules() {
        await this.log('Discovering Matching Rules...');

        try {
            // Query MatchingRule using Tooling API
            const query = `
                SELECT Id, DeveloperName, MasterLabel, SobjectType, IsActive,
                       Description, MatchEngine, RuleStatus
                FROM MatchingRule
                ${this.targetObject ? `WHERE SobjectType = '${this.targetObject}'` : ''}
                ORDER BY SobjectType, MasterLabel
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --use-tooling-api --json`
            );
            const result = JSON.parse(stdout);

            if (result.result && result.result.records) {
                this.results.matchingRules = result.result.records.map(rule => ({
                    id: rule.Id,
                    developerName: rule.DeveloperName,
                    label: rule.MasterLabel,
                    objectType: rule.SobjectType,
                    isActive: rule.IsActive,
                    description: rule.Description || '',
                    matchEngine: rule.MatchEngine,
                    status: rule.RuleStatus,
                    fieldCriteria: []
                }));

                await this.log(`Found ${this.results.matchingRules.length} Matching Rules`, 'success');
            } else {
                await this.log('No Matching Rules found', 'warn');
            }

            return this.results.matchingRules;
        } catch (error) {
            await this.log(`Error discovering Matching Rules: ${error.message}`, 'error');
            return [];
        }
    }

    async analyzeMatchingCriteria() {
        await this.log('Analyzing Matching Criteria...');

        for (const rule of this.results.matchingRules) {
            try {
                // Query MatchingRuleItem for field-level criteria
                const query = `
                    SELECT Id, MatchingRuleId, Field, MatchingMethod,
                           BlankValueBehavior, SortOrder
                    FROM MatchingRuleItem
                    WHERE MatchingRuleId = '${rule.id}'
                    ORDER BY SortOrder
                `;

                const { stdout } = await execAsync(
                    `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --use-tooling-api --json`
                );
                const result = JSON.parse(stdout);

                if (result.result && result.result.records) {
                    rule.fieldCriteria = result.result.records.map(item => ({
                        field: item.Field,
                        matchingMethod: item.MatchingMethod,
                        blankValueBehavior: item.BlankValueBehavior,
                        sortOrder: item.SortOrder
                    }));

                    // Add to global field criteria list
                    for (const fc of rule.fieldCriteria) {
                        this.results.fieldCriteria.push({
                            matchingRule: rule.label,
                            matchingRuleId: rule.id,
                            objectType: rule.objectType,
                            ...fc
                        });
                    }
                }
            } catch (error) {
                await this.log(`Could not analyze criteria for ${rule.label}: ${error.message}`, 'warn');
            }
        }

        await this.log(`Analyzed ${this.results.fieldCriteria.length} field criteria`, 'success');
    }

    async linkDuplicateToMatchingRules() {
        await this.log('Linking Duplicate Rules to Matching Rules...');

        // This would typically require Metadata API to get full linkage
        // For now, we match by object type
        for (const dupRule of this.results.duplicateRules) {
            dupRule.matchingRules = this.results.matchingRules
                .filter(mr => mr.objectType === dupRule.objectType)
                .map(mr => ({
                    label: mr.label,
                    developerName: mr.developerName,
                    matchEngine: mr.matchEngine,
                    fieldCount: mr.fieldCriteria.length
                }));
        }
    }

    generateSummary() {
        const activeRules = this.results.duplicateRules.filter(r => r.isActive);
        const objectsWithDuplicateRules = [...new Set(activeRules.map(r => r.objectType))];

        this.results.summary = {
            totalDuplicateRules: this.results.duplicateRules.length,
            activeDuplicateRules: activeRules.length,
            inactiveDuplicateRules: this.results.duplicateRules.length - activeRules.length,
            blockingRulesCount: this.results.blockingRules.length,
            alertOnlyRulesCount: this.results.alertOnlyRules.length,
            totalMatchingRules: this.results.matchingRules.length,
            activeMatchingRules: this.results.matchingRules.filter(r => r.isActive).length,
            totalFieldCriteria: this.results.fieldCriteria.length,
            objectsWithDuplicateRules,
            objectCount: objectsWithDuplicateRules.length,
            impactAnalysis: {
                blockingRulesCanPreventDataCreation: this.results.blockingRules.length > 0,
                affectedObjects: [...new Set(this.results.blockingRules.map(r => r.objectType))],
                recommendation: this.results.blockingRules.length > 0
                    ? 'Review blocking rules to ensure they do not prevent legitimate data operations during automation'
                    : 'No blocking rules detected - duplicate management is alert-only'
            },
            matchingMethodsUsed: [...new Set(this.results.fieldCriteria.map(fc => fc.matchingMethod))],
            generatedAt: new Date().toISOString(),
            orgAlias: this.orgAlias
        };

        return this.results.summary;
    }

    async generateReport() {
        await fs.mkdir(this.reportDir, { recursive: true });

        const reportData = {
            ...this.results,
            summary: this.generateSummary()
        };

        // JSON Report
        const jsonPath = path.join(this.reportDir, `duplicate-rules-${this.orgAlias}-${this.timestamp}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(reportData, null, 2));

        // CSV Report for duplicate rules
        if (this.results.duplicateRules.length > 0) {
            const csvPath = path.join(this.reportDir, `duplicate-rules-${this.orgAlias}-${this.timestamp}.csv`);
            const csvHeaders = 'Object,Rule Name,Active,Action on Insert,Action on Update,Blocking\n';
            const csvRows = this.results.duplicateRules.map(r =>
                `"${r.objectType}","${r.label}","${r.isActive}","${r.actionOnInsert}","${r.actionOnUpdate}","${r.isBlocking}"`
            ).join('\n');
            await fs.writeFile(csvPath, csvHeaders + csvRows);
            await this.log(`CSV report: ${csvPath}`, 'info');
        }

        // CSV Report for field criteria
        if (this.results.fieldCriteria.length > 0) {
            const fcCsvPath = path.join(this.reportDir, `matching-criteria-${this.orgAlias}-${this.timestamp}.csv`);
            const fcHeaders = 'Object,Matching Rule,Field,Matching Method,Blank Behavior\n';
            const fcRows = this.results.fieldCriteria.map(fc =>
                `"${fc.objectType}","${fc.matchingRule}","${fc.field}","${fc.matchingMethod}","${fc.blankValueBehavior}"`
            ).join('\n');
            await fs.writeFile(fcCsvPath, fcHeaders + fcRows);
            await this.log(`Field criteria CSV: ${fcCsvPath}`, 'info');
        }

        await this.log(`JSON report: ${jsonPath}`, 'info');
        return reportData;
    }

    formatTableOutput() {
        console.log('\n' + '='.repeat(120));
        console.log('DUPLICATE & MATCHING RULE ANALYSIS');
        console.log('='.repeat(120));

        // Duplicate Rules
        console.log('\n🔍 DUPLICATE RULES:');
        if (this.results.duplicateRules.length === 0) {
            console.log('  No Duplicate Rules found');
        } else {
            console.log('-'.repeat(120));
            console.log('| Object'.padEnd(20) + '| Rule Name'.padEnd(35) + '| Active'.padEnd(10) + '| On Insert'.padEnd(12) + '| On Update'.padEnd(12) + '| Blocking |');
            console.log('-'.repeat(120));
            for (const rule of this.results.duplicateRules) {
                console.log(
                    '| ' + rule.objectType.substring(0, 18).padEnd(18) +
                    '| ' + rule.label.substring(0, 33).padEnd(33) +
                    '| ' + (rule.isActive ? 'Yes' : 'No').padEnd(8) +
                    '| ' + (rule.actionOnInsert || 'N/A').padEnd(10) +
                    '| ' + (rule.actionOnUpdate || 'N/A').padEnd(10) +
                    '| ' + (rule.isBlocking ? 'YES' : 'No').padEnd(8) + '|'
                );
            }
            console.log('-'.repeat(120));
        }

        // Blocking Rules Warning
        if (this.results.blockingRules.length > 0) {
            console.log('\n⚠️  BLOCKING RULES (Can prevent data creation):');
            for (const rule of this.results.blockingRules) {
                console.log(`    • ${rule.objectType}: ${rule.label}`);
                if (rule.alertText) {
                    console.log(`      Alert: "${rule.alertText.substring(0, 60)}..."`);
                }
            }
        }

        // Matching Rules
        console.log('\n🎯 MATCHING RULES:');
        if (this.results.matchingRules.length === 0) {
            console.log('  No Matching Rules found');
        } else {
            console.log('-'.repeat(100));
            console.log('| Object'.padEnd(20) + '| Rule Name'.padEnd(35) + '| Engine'.padEnd(15) + '| Active'.padEnd(10) + '| Fields |');
            console.log('-'.repeat(100));
            for (const rule of this.results.matchingRules) {
                console.log(
                    '| ' + rule.objectType.substring(0, 18).padEnd(18) +
                    '| ' + rule.label.substring(0, 33).padEnd(33) +
                    '| ' + (rule.matchEngine || 'Standard').padEnd(13) +
                    '| ' + (rule.isActive ? 'Yes' : 'No').padEnd(8) +
                    '| ' + (rule.fieldCriteria.length + '').padEnd(6) + '|'
                );
            }
            console.log('-'.repeat(100));
        }

        // Field Criteria Summary
        console.log('\n📋 MATCHING FIELD CRITERIA:');
        if (this.results.fieldCriteria.length === 0) {
            console.log('  No field criteria found');
        } else {
            // Group by object
            const byObject = {};
            for (const fc of this.results.fieldCriteria) {
                if (!byObject[fc.objectType]) {
                    byObject[fc.objectType] = [];
                }
                byObject[fc.objectType].push(fc);
            }

            for (const [obj, criteria] of Object.entries(byObject)) {
                console.log(`  ${obj}:`);
                for (const fc of criteria.slice(0, 5)) { // Show first 5
                    console.log(`    • ${fc.field} (${fc.matchingMethod})`);
                }
                if (criteria.length > 5) {
                    console.log(`    ... and ${criteria.length - 5} more fields`);
                }
            }
        }

        // Summary
        console.log('\n📊 SUMMARY:');
        const summary = this.results.summary;
        console.log(`  Duplicate Rules: ${summary.totalDuplicateRules} (${summary.activeDuplicateRules} active)`);
        console.log(`    - Blocking: ${summary.blockingRulesCount}`);
        console.log(`    - Alert-only: ${summary.alertOnlyRulesCount}`);
        console.log(`  Matching Rules: ${summary.totalMatchingRules} (${summary.activeMatchingRules} active)`);
        console.log(`  Field Criteria: ${summary.totalFieldCriteria}`);
        console.log(`  Objects Covered: ${summary.objectsWithDuplicateRules.join(', ') || 'None'}`);
        console.log(`  Matching Methods: ${summary.matchingMethodsUsed.join(', ') || 'None'}`);

        if (summary.impactAnalysis.blockingRulesCanPreventDataCreation) {
            console.log('\n⚠️  IMPACT ANALYSIS:');
            console.log(`  Blocking rules can prevent data creation on: ${summary.impactAnalysis.affectedObjects.join(', ')}`);
            console.log(`  Recommendation: ${summary.impactAnalysis.recommendation}`);
        }
        console.log('');
    }

    async run() {
        try {
            await this.log('Starting Duplicate & Matching Rule Analysis...');

            // Validate connection
            await this.validateConnection();

            // Discover Duplicate Rules
            await this.discoverDuplicateRules();

            // Discover Matching Rules
            await this.discoverMatchingRules();

            // Analyze Matching Criteria
            await this.analyzeMatchingCriteria();

            // Link Duplicate Rules to Matching Rules
            await this.linkDuplicateToMatchingRules();

            // Generate summary
            this.generateSummary();

            // Output results
            if (this.outputFormat === 'json') {
                console.log(JSON.stringify(this.results, null, 2));
            } else if (this.outputFormat === 'table') {
                this.formatTableOutput();
            }

            // Generate reports
            await this.generateReport();

            await this.log('Duplicate & Matching Rule analysis completed successfully', 'success');

            return this.results;

        } catch (error) {
            await this.log(`Analysis failed: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

// CLI Parsing
function parseArgs(args) {
    const options = {
        org: null,
        object: null,
        output: 'table'
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch (arg) {
            case '--org':
            case '-o':
                options.org = nextArg;
                i++;
                break;
            case '--object':
                options.object = nextArg;
                i++;
                break;
            case '--output':
                options.output = nextArg;
                i++;
                break;
            case '--help':
            case '-h':
                printUsage();
                process.exit(0);
        }
    }

    return options;
}

function printUsage() {
    console.log(`
Duplicate Rule Analyzer
=======================

Analyzes Duplicate Rules and Matching Rules for automation auditing.

Usage:
  node duplicate-rule-analyzer.js --org <alias> [options]

Options:
  --org, -o <alias>    Salesforce org alias (required)
  --object <name>      Filter to specific sObject (e.g., Account, Contact, Lead)
  --output <format>    Output format: json, csv, table (default: table)
  --help, -h           Show this help message

Examples:
  node duplicate-rule-analyzer.js --org production
  node duplicate-rule-analyzer.js --org sandbox --object Account
  node duplicate-rule-analyzer.js --org prod --output json

Rule Types:
  Duplicate Rules:
    - Block: Prevents record save when duplicate detected
    - Allow: Shows alert but allows save
    - Report: Silent duplicate detection

  Matching Rules:
    - Define field criteria for duplicate detection
    - Support various matching methods (Exact, Fuzzy, etc.)

Impact on Automation:
  - BLOCKING rules can prevent data operations during automation
  - This affects Flows, Apex, integrations that create/update records
  - Important to document which objects have blocking rules

Integration with Automation Auditor:
  This script's output can be consumed by sfdc-automation-auditor to include
  Duplicate Rules in the data write analysis (can block writes).
`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (!options.org) {
        console.error('Error: --org is required');
        printUsage();
        process.exit(1);
    }

    const analyzer = new DuplicateRuleAnalyzer(options.org, {
        object: options.object,
        output: options.output
    });

    await analyzer.run();
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = DuplicateRuleAnalyzer;
