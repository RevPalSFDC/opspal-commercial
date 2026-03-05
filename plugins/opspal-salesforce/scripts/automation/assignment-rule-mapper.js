#!/usr/bin/env node

/**
 * Assignment Rule Mapper
 *
 * Maps Assignment Rules (Lead, Case) and Escalation Rules to collision detection.
 * Extracts OwnerId assignment logic and criteria for automation auditing.
 *
 * Part of Wave 1: Automation Coverage Completion
 *
 * Usage:
 *   node assignment-rule-mapper.js --org <alias> [--object Lead|Case] [--output json|csv|table]
 *
 * Examples:
 *   node assignment-rule-mapper.js --org production
 *   node assignment-rule-mapper.js --org sandbox --object Lead
 *   node assignment-rule-mapper.js --org prod --output json
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class AssignmentRuleMapper {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.targetObject = options.object || null; // Lead or Case
        this.outputFormat = options.output || 'table';
        this.reportDir = path.join(__dirname, '../../reports/automation-analysis');
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        this.results = {
            leadAssignmentRules: [],
            caseAssignmentRules: [],
            escalationRules: [],
            fieldWrites: [],
            collisionMatrix: [],
            summary: {}
        };

        // Objects that support assignment rules
        this.assignableObjects = ['Lead', 'Case'];

        // Fields that can be written by assignment/escalation rules
        this.assignmentFields = [
            { field: 'OwnerId', description: 'Record owner assignment' },
            { field: 'Owner.Type', description: 'Owner type (User or Queue)' }
        ];

        this.escalationFields = [
            { field: 'OwnerId', description: 'Escalation reassignment' },
            { field: 'IsEscalated', description: 'Escalation flag' },
            { field: 'Priority', description: 'Priority elevation' }
        ];
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

    async discoverAssignmentRules(objectName) {
        await this.log(`Discovering ${objectName} Assignment Rules...`);

        try {
            // Query AssignmentRule for the specified object
            const query = `
                SELECT Id, Name, SobjectType, Active, CreatedDate, LastModifiedDate
                FROM AssignmentRule
                WHERE SobjectType = '${objectName}'
                ORDER BY Name
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`
            );
            const result = JSON.parse(stdout);

            const rules = [];
            if (result.result && result.result.records) {
                for (const rule of result.result.records) {
                    rules.push({
                        id: rule.Id,
                        name: rule.Name,
                        objectType: rule.SobjectType,
                        isActive: rule.Active,
                        createdDate: rule.CreatedDate,
                        lastModifiedDate: rule.LastModifiedDate,
                        entries: [],
                        fieldWrites: this.getAssignmentFieldWrites(rule)
                    });
                }

                await this.log(`Found ${rules.length} ${objectName} Assignment Rules`, 'success');
            } else {
                await this.log(`No ${objectName} Assignment Rules found`, 'warn');
            }

            return rules;
        } catch (error) {
            await this.log(`Error discovering ${objectName} Assignment Rules: ${error.message}`, 'error');
            return [];
        }
    }

    async discoverAssignmentRuleEntries(rule) {
        try {
            // Query for rule entries (criteria)
            const query = `
                SELECT Id, AssignmentRuleId, SortOrder, CriteriaItems
                FROM RuleEntry
                WHERE AssignmentRuleId = '${rule.id}'
                ORDER BY SortOrder
            `;

            // Note: RuleEntry may not be directly queryable via SOQL in all orgs
            // This would typically require Metadata API retrieve

            rule.entries = [{
                note: 'Rule entries require Metadata API retrieval for full analysis',
                criteriaCount: 'Unknown'
            }];

            return rule.entries;
        } catch (error) {
            await this.log(`Could not query rule entries for ${rule.name}: ${error.message}`, 'warn');
            rule.entries = [];
            return [];
        }
    }

    getAssignmentFieldWrites(rule) {
        // Assignment rules always write OwnerId
        return [{
            field: 'OwnerId',
            action: 'Assignment',
            description: 'Assigns record to User or Queue based on criteria',
            triggerEvent: 'On Create (when checkbox selected) or manual trigger',
            isActive: rule.Active
        }];
    }

    async discoverEscalationRules() {
        if (this.targetObject && this.targetObject !== 'Case') {
            await this.log('Escalation rules only apply to Cases, skipping...', 'info');
            return [];
        }

        await this.log('Discovering Escalation Rules...');

        try {
            // Query EscalationRule (Case only)
            const query = `
                SELECT Id, Name, SobjectType, Active, CreatedDate, LastModifiedDate
                FROM EscalationRule
                ORDER BY Name
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`
            );
            const result = JSON.parse(stdout);

            if (result.result && result.result.records) {
                this.results.escalationRules = result.result.records.map(rule => ({
                    id: rule.Id,
                    name: rule.Name,
                    objectType: rule.SobjectType,
                    isActive: rule.Active,
                    createdDate: rule.CreatedDate,
                    lastModifiedDate: rule.LastModifiedDate,
                    fieldWrites: this.getEscalationFieldWrites(rule)
                }));

                await this.log(`Found ${this.results.escalationRules.length} Escalation Rules`, 'success');
            } else {
                await this.log('No Escalation Rules found', 'warn');
            }

            return this.results.escalationRules;
        } catch (error) {
            await this.log(`Error discovering Escalation Rules: ${error.message}`, 'error');
            return [];
        }
    }

    getEscalationFieldWrites(rule) {
        // Escalation rules can write multiple fields
        return [
            {
                field: 'OwnerId',
                action: 'Escalation Reassignment',
                description: 'Reassigns case to escalation owner',
                triggerEvent: 'Time-based (when escalation criteria met)',
                isActive: rule.Active
            },
            {
                field: 'IsEscalated',
                action: 'Escalation Flag',
                description: 'Marks case as escalated',
                triggerEvent: 'On Escalation',
                isActive: rule.Active
            }
        ];
    }

    async buildFieldWriteInventory() {
        await this.log('Building field write inventory...');

        // Collect all field writes from assignment rules
        for (const rule of this.results.leadAssignmentRules) {
            for (const fw of rule.fieldWrites) {
                this.results.fieldWrites.push({
                    ruleType: 'LeadAssignment',
                    ruleName: rule.name,
                    ruleId: rule.id,
                    targetObject: 'Lead',
                    ...fw
                });
            }
        }

        for (const rule of this.results.caseAssignmentRules) {
            for (const fw of rule.fieldWrites) {
                this.results.fieldWrites.push({
                    ruleType: 'CaseAssignment',
                    ruleName: rule.name,
                    ruleId: rule.id,
                    targetObject: 'Case',
                    ...fw
                });
            }
        }

        // Collect from escalation rules
        for (const rule of this.results.escalationRules) {
            for (const fw of rule.fieldWrites) {
                this.results.fieldWrites.push({
                    ruleType: 'Escalation',
                    ruleName: rule.name,
                    ruleId: rule.id,
                    targetObject: 'Case',
                    ...fw
                });
            }
        }

        return this.results.fieldWrites;
    }

    async buildCollisionMatrix() {
        await this.log('Building collision matrix...');

        // Group field writes by object and field
        const collisionMap = {};

        for (const fw of this.results.fieldWrites) {
            const key = `${fw.targetObject}.${fw.field}`;
            if (!collisionMap[key]) {
                collisionMap[key] = {
                    object: fw.targetObject,
                    field: fw.field,
                    writers: []
                };
            }
            collisionMap[key].writers.push({
                type: fw.ruleType,
                name: fw.ruleName,
                id: fw.ruleId,
                action: fw.action,
                triggerEvent: fw.triggerEvent,
                isActive: fw.isActive
            });
        }

        // Convert to array and identify collisions
        this.results.collisionMatrix = Object.values(collisionMap).map(entry => ({
            ...entry,
            writerCount: entry.writers.length,
            hasCollision: entry.writers.length > 1,
            activeWriters: entry.writers.filter(w => w.isActive).length
        }));

        return this.results.collisionMatrix;
    }

    generateSummary() {
        const allRules = [
            ...this.results.leadAssignmentRules,
            ...this.results.caseAssignmentRules,
            ...this.results.escalationRules
        ];

        this.results.summary = {
            totalLeadAssignmentRules: this.results.leadAssignmentRules.length,
            activeLeadAssignmentRules: this.results.leadAssignmentRules.filter(r => r.isActive).length,
            totalCaseAssignmentRules: this.results.caseAssignmentRules.length,
            activeCaseAssignmentRules: this.results.caseAssignmentRules.filter(r => r.isActive).length,
            totalEscalationRules: this.results.escalationRules.length,
            activeEscalationRules: this.results.escalationRules.filter(r => r.isActive).length,
            totalFieldWrites: this.results.fieldWrites.length,
            potentialCollisions: this.results.collisionMatrix.filter(c => c.hasCollision).length,
            executionContext: {
                leadAssignment: 'Executes on Lead insert when "Assign using active assignment rules" is checked, or via workflow/process',
                caseAssignment: 'Executes on Case insert when "Assign using active assignment rules" is checked, or via workflow/process/escalation',
                escalation: 'Executes based on time criteria after Case creation (time-triggered, not transaction-based)'
            },
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
        const jsonPath = path.join(this.reportDir, `assignment-rules-${this.orgAlias}-${this.timestamp}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(reportData, null, 2));

        // CSV Report for all rules
        const allRules = [
            ...this.results.leadAssignmentRules.map(r => ({ ...r, type: 'Lead Assignment' })),
            ...this.results.caseAssignmentRules.map(r => ({ ...r, type: 'Case Assignment' })),
            ...this.results.escalationRules.map(r => ({ ...r, type: 'Escalation' }))
        ];

        if (allRules.length > 0) {
            const csvPath = path.join(this.reportDir, `assignment-rules-${this.orgAlias}-${this.timestamp}.csv`);
            const csvHeaders = 'Type,Name,Object,Active,Created,Last Modified\n';
            const csvRows = allRules.map(r =>
                `"${r.type}","${r.name}","${r.objectType}","${r.isActive}","${r.createdDate}","${r.lastModifiedDate}"`
            ).join('\n');
            await fs.writeFile(csvPath, csvHeaders + csvRows);
            await this.log(`CSV report: ${csvPath}`, 'info');
        }

        await this.log(`JSON report: ${jsonPath}`, 'info');
        return reportData;
    }

    formatTableOutput() {
        console.log('\n' + '='.repeat(100));
        console.log('ASSIGNMENT & ESCALATION RULE ANALYSIS');
        console.log('='.repeat(100));

        // Lead Assignment Rules
        console.log('\n📋 LEAD ASSIGNMENT RULES:');
        if (this.results.leadAssignmentRules.length === 0) {
            console.log('  No Lead Assignment Rules found');
        } else {
            console.log('-'.repeat(80));
            console.log('| Name'.padEnd(40) + '| Active'.padEnd(10) + '| Last Modified'.padEnd(25) + '|');
            console.log('-'.repeat(80));
            for (const rule of this.results.leadAssignmentRules) {
                console.log(
                    '| ' + rule.name.substring(0, 38).padEnd(38) +
                    '| ' + (rule.isActive ? 'Yes' : 'No').padEnd(8) +
                    '| ' + rule.lastModifiedDate.substring(0, 23).padEnd(23) + '|'
                );
            }
            console.log('-'.repeat(80));
        }

        // Case Assignment Rules
        console.log('\n📋 CASE ASSIGNMENT RULES:');
        if (this.results.caseAssignmentRules.length === 0) {
            console.log('  No Case Assignment Rules found');
        } else {
            console.log('-'.repeat(80));
            console.log('| Name'.padEnd(40) + '| Active'.padEnd(10) + '| Last Modified'.padEnd(25) + '|');
            console.log('-'.repeat(80));
            for (const rule of this.results.caseAssignmentRules) {
                console.log(
                    '| ' + rule.name.substring(0, 38).padEnd(38) +
                    '| ' + (rule.isActive ? 'Yes' : 'No').padEnd(8) +
                    '| ' + rule.lastModifiedDate.substring(0, 23).padEnd(23) + '|'
                );
            }
            console.log('-'.repeat(80));
        }

        // Escalation Rules
        console.log('\n⚡ ESCALATION RULES:');
        if (this.results.escalationRules.length === 0) {
            console.log('  No Escalation Rules found');
        } else {
            console.log('-'.repeat(80));
            console.log('| Name'.padEnd(40) + '| Active'.padEnd(10) + '| Last Modified'.padEnd(25) + '|');
            console.log('-'.repeat(80));
            for (const rule of this.results.escalationRules) {
                console.log(
                    '| ' + rule.name.substring(0, 38).padEnd(38) +
                    '| ' + (rule.isActive ? 'Yes' : 'No').padEnd(8) +
                    '| ' + rule.lastModifiedDate.substring(0, 23).padEnd(23) + '|'
                );
            }
            console.log('-'.repeat(80));
        }

        // Field writes summary
        console.log('\n🔄 FIELD WRITE TRACKING:');
        console.log('  Assignment Rules write:');
        for (const field of this.assignmentFields) {
            console.log(`    • ${field.field}: ${field.description}`);
        }
        console.log('  Escalation Rules write:');
        for (const field of this.escalationFields) {
            console.log(`    • ${field.field}: ${field.description}`);
        }

        // Summary
        console.log('\n📊 SUMMARY:');
        const summary = this.results.summary;
        console.log(`  Lead Assignment Rules: ${summary.totalLeadAssignmentRules} (${summary.activeLeadAssignmentRules} active)`);
        console.log(`  Case Assignment Rules: ${summary.totalCaseAssignmentRules} (${summary.activeCaseAssignmentRules} active)`);
        console.log(`  Escalation Rules: ${summary.totalEscalationRules} (${summary.activeEscalationRules} active)`);
        console.log(`  Total Field Write Points: ${summary.totalFieldWrites}`);
        console.log(`  Potential Collision Points: ${summary.potentialCollisions}`);
        console.log('');
    }

    async run() {
        try {
            await this.log('Starting Assignment & Escalation Rule Analysis...');

            // Validate connection
            await this.validateConnection();

            // Discover Lead Assignment Rules (if not filtering to Case only)
            if (!this.targetObject || this.targetObject === 'Lead') {
                this.results.leadAssignmentRules = await this.discoverAssignmentRules('Lead');
            }

            // Discover Case Assignment Rules (if not filtering to Lead only)
            if (!this.targetObject || this.targetObject === 'Case') {
                this.results.caseAssignmentRules = await this.discoverAssignmentRules('Case');
            }

            // Discover Escalation Rules (Case only)
            await this.discoverEscalationRules();

            // Build field write inventory
            await this.buildFieldWriteInventory();

            // Build collision matrix
            await this.buildCollisionMatrix();

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

            await this.log('Assignment & Escalation Rule analysis completed successfully', 'success');

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
                if (nextArg && ['Lead', 'Case'].includes(nextArg)) {
                    options.object = nextArg;
                } else {
                    console.error('Error: --object must be Lead or Case');
                    process.exit(1);
                }
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
Assignment Rule Mapper
======================

Maps Assignment Rules and Escalation Rules to collision detection matrix.

Usage:
  node assignment-rule-mapper.js --org <alias> [options]

Options:
  --org, -o <alias>    Salesforce org alias (required)
  --object <name>      Filter to Lead or Case only
  --output <format>    Output format: json, csv, table (default: table)
  --help, -h           Show this help message

Examples:
  node assignment-rule-mapper.js --org production
  node assignment-rule-mapper.js --org sandbox --object Lead
  node assignment-rule-mapper.js --org prod --output json

Supported Rule Types:
  - Lead Assignment Rules (OwnerId)
  - Case Assignment Rules (OwnerId)
  - Case Escalation Rules (OwnerId, IsEscalated, Priority)

Execution Context:
  Assignment Rules:
    - Execute on record insert when checkbox is selected
    - Can be triggered via Workflow Field Update or Process Builder
    - Execute AFTER before triggers, BEFORE after triggers

  Escalation Rules:
    - Time-based execution (not within save transaction)
    - Execute based on time criteria
    - Can reassign owner and modify escalation fields

Integration with Automation Auditor:
  This script's output can be consumed by sfdc-automation-auditor to include
  Assignment and Escalation Rules in the collision detection matrix.
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

    const mapper = new AssignmentRuleMapper(options.org, {
        object: options.object,
        output: options.output
    });

    await mapper.run();
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = AssignmentRuleMapper;
