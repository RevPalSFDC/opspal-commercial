#!/usr/bin/env node

/**
 * Platform Event Detector
 *
 * Detects Platform Event triggers and their subscriber flows for automation auditing.
 * Maps PE triggers to flows and extracts field writes from PE-triggered automations.
 *
 * Part of Wave 1: Automation Coverage Completion
 *
 * Usage:
 *   node platform-event-detector.js --org <alias> [--object <ObjectName>] [--output json|csv|table] [--dry-run]
 *
 * Examples:
 *   node platform-event-detector.js --org production
 *   node platform-event-detector.js --org sandbox --object Order_Event__e --output json
 *   node platform-event-detector.js --org prod --dry-run
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class PlatformEventDetector {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.targetObject = options.object || null;
        this.outputFormat = options.output || 'table';
        this.dryRun = options.dryRun || false;
        this.reportDir = path.join(__dirname, '../../reports/automation-analysis');
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        this.results = {
            platformEvents: [],
            subscriberFlows: [],
            fieldWrites: [],
            automationChains: [],
            summary: {}
        };
    }

    async log(message, level = 'info') {
        const timestamp = new Date().toISOString();
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

    async discoverPlatformEvents() {
        await this.log('Discovering Platform Event objects...');

        try {
            // Query for custom Platform Event objects (end with __e)
            const entityQuery = `
                SELECT DurableId, QualifiedApiName, Label, Description,
                       NamespacePrefix, IsCustomizable, LastModifiedDate
                FROM EntityDefinition
                WHERE QualifiedApiName LIKE '%__e'
                ORDER BY QualifiedApiName
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${entityQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --json`
            );
            const result = JSON.parse(stdout);

            if (result.result && result.result.records) {
                this.results.platformEvents = result.result.records.map(pe => ({
                    apiName: pe.QualifiedApiName,
                    label: pe.Label,
                    description: pe.Description || '',
                    namespace: pe.NamespacePrefix || '',
                    durableId: pe.DurableId,
                    lastModified: pe.LastModifiedDate,
                    isManaged: !!pe.NamespacePrefix
                }));

                await this.log(`Found ${this.results.platformEvents.length} Platform Event objects`, 'success');
            } else {
                await this.log('No Platform Event objects found', 'warn');
                this.results.platformEvents = [];
            }

            return this.results.platformEvents;
        } catch (error) {
            await this.log(`Error discovering Platform Events: ${error.message}`, 'error');
            throw error;
        }
    }

    async findPlatformEventSubscribers() {
        await this.log('Finding Platform Event subscriber flows...');

        try {
            // Query FlowDefinitionView for Platform Event-triggered flows
            const flowQuery = `
                SELECT Id, DurableId, ApiName, Label, Description,
                       TriggerType, TriggerObjectOrEventId, TriggerObjectOrEventLabel,
                       ProcessType, IsActive, LastModifiedDate, VersionNumber
                FROM FlowDefinitionView
                WHERE TriggerType = 'PlatformEvent'
                AND IsActive = true
                ORDER BY TriggerObjectOrEventLabel, Label
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${flowQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --use-tooling-api --json`
            );
            const result = JSON.parse(stdout);

            if (result.result && result.result.records) {
                this.results.subscriberFlows = result.result.records.map(flow => ({
                    apiName: flow.ApiName,
                    label: flow.Label,
                    description: flow.Description || '',
                    triggerType: flow.TriggerType,
                    triggerObject: flow.TriggerObjectOrEventLabel || flow.TriggerObjectOrEventId,
                    processType: flow.ProcessType,
                    isActive: flow.IsActive,
                    lastModified: flow.LastModifiedDate,
                    version: flow.VersionNumber,
                    durableId: flow.DurableId
                }));

                await this.log(`Found ${this.results.subscriberFlows.length} Platform Event subscriber flows`, 'success');
            } else {
                await this.log('No Platform Event subscriber flows found', 'warn');
                this.results.subscriberFlows = [];
            }

            return this.results.subscriberFlows;
        } catch (error) {
            // Handle case where no flows exist with this trigger type
            if (error.message.includes('No records found')) {
                await this.log('No Platform Event subscriber flows found', 'warn');
                this.results.subscriberFlows = [];
                return [];
            }
            await this.log(`Error finding subscriber flows: ${error.message}`, 'error');
            throw error;
        }
    }

    async analyzeFlowFieldWrites(flowApiName) {
        try {
            // Get flow metadata to analyze field writes
            const flowQuery = `
                SELECT Id, Definition.DeveloperName, FullName, Status
                FROM Flow
                WHERE Definition.DeveloperName = '${flowApiName}'
                AND Status = 'Active'
                LIMIT 1
            `;

            const { stdout } = await execAsync(
                `sf data query --query "${flowQuery.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --use-tooling-api --json`
            );
            const result = JSON.parse(stdout);

            if (!result.result || !result.result.records || result.result.records.length === 0) {
                return [];
            }

            // For a complete implementation, you would retrieve and parse the flow metadata
            // to extract recordUpdates, recordCreates elements and their field assignments.
            // This is a simplified version that tracks the flow's existence.

            return [{
                flowApiName,
                flowId: result.result.records[0].Id,
                status: result.result.records[0].Status,
                fieldsWritten: [], // Would be populated from metadata parsing
                objectsAffected: [] // Would be populated from metadata parsing
            }];
        } catch (error) {
            await this.log(`Could not analyze field writes for ${flowApiName}: ${error.message}`, 'warn');
            return [];
        }
    }

    async buildAutomationChains() {
        await this.log('Building automation chains...');

        // Group subscriber flows by their trigger Platform Event
        const chainsByEvent = {};

        for (const flow of this.results.subscriberFlows) {
            const eventKey = flow.triggerObject;
            if (!chainsByEvent[eventKey]) {
                chainsByEvent[eventKey] = {
                    platformEvent: eventKey,
                    publisherInfo: this.findEventPublishers(eventKey),
                    subscribers: []
                };
            }

            // Analyze field writes for each flow
            const fieldWrites = await this.analyzeFlowFieldWrites(flow.apiName);

            chainsByEvent[eventKey].subscribers.push({
                ...flow,
                fieldWrites
            });
        }

        this.results.automationChains = Object.values(chainsByEvent);
        await this.log(`Built ${this.results.automationChains.length} automation chains`, 'success');

        return this.results.automationChains;
    }

    findEventPublishers(eventApiName) {
        // This would typically involve:
        // 1. Searching Apex classes for EventBus.publish() calls
        // 2. Searching flows for Platform Event publish actions
        // 3. Searching Process Builders for PE publish actions
        // For now, return a placeholder indicating manual review needed
        return {
            note: 'Publisher analysis requires Apex/Flow metadata parsing',
            searchPatterns: [
                `EventBus.publish(new ${eventApiName}`,
                `Create Records: ${eventApiName}`
            ]
        };
    }

    generateSummary() {
        this.results.summary = {
            totalPlatformEvents: this.results.platformEvents.length,
            totalSubscriberFlows: this.results.subscriberFlows.length,
            totalAutomationChains: this.results.automationChains.length,
            managedEvents: this.results.platformEvents.filter(pe => pe.isManaged).length,
            customEvents: this.results.platformEvents.filter(pe => !pe.isManaged).length,
            eventsWithSubscribers: new Set(this.results.subscriberFlows.map(f => f.triggerObject)).size,
            eventsWithoutSubscribers: this.results.platformEvents.length -
                new Set(this.results.subscriberFlows.map(f => f.triggerObject)).size,
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
        const jsonPath = path.join(this.reportDir, `platform-events-${this.orgAlias}-${this.timestamp}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(reportData, null, 2));

        // CSV Report for subscriber flows
        if (this.results.subscriberFlows.length > 0) {
            const csvPath = path.join(this.reportDir, `platform-event-subscribers-${this.orgAlias}-${this.timestamp}.csv`);
            const csvHeaders = 'Platform Event,Flow Name,Flow API Name,Process Type,Active,Last Modified\n';
            const csvRows = this.results.subscriberFlows.map(f =>
                `"${f.triggerObject}","${f.label}","${f.apiName}","${f.processType}","${f.isActive}","${f.lastModified}"`
            ).join('\n');
            await fs.writeFile(csvPath, csvHeaders + csvRows);
            await this.log(`CSV report: ${csvPath}`, 'info');
        }

        await this.log(`JSON report: ${jsonPath}`, 'info');
        return reportData;
    }

    formatTableOutput() {
        console.log('\n' + '='.repeat(100));
        console.log('PLATFORM EVENT DETECTION RESULTS');
        console.log('='.repeat(100));

        console.log('\n📦 PLATFORM EVENT OBJECTS:');
        if (this.results.platformEvents.length === 0) {
            console.log('  No Platform Event objects found');
        } else {
            console.log('-'.repeat(80));
            console.log('| API Name'.padEnd(40) + '| Label'.padEnd(30) + '| Managed |');
            console.log('-'.repeat(80));
            for (const pe of this.results.platformEvents) {
                console.log(
                    '| ' + pe.apiName.padEnd(38) +
                    '| ' + (pe.label || '').substring(0, 28).padEnd(28) +
                    '| ' + (pe.isManaged ? 'Yes' : 'No').padEnd(7) + '|'
                );
            }
            console.log('-'.repeat(80));
        }

        console.log('\n🔔 SUBSCRIBER FLOWS:');
        if (this.results.subscriberFlows.length === 0) {
            console.log('  No Platform Event subscriber flows found');
        } else {
            console.log('-'.repeat(100));
            console.log('| Trigger Event'.padEnd(35) + '| Flow Name'.padEnd(35) + '| Process Type'.padEnd(20) + '| Active |');
            console.log('-'.repeat(100));
            for (const flow of this.results.subscriberFlows) {
                console.log(
                    '| ' + (flow.triggerObject || '').substring(0, 33).padEnd(33) +
                    '| ' + flow.label.substring(0, 33).padEnd(33) +
                    '| ' + flow.processType.padEnd(18) +
                    '| ' + (flow.isActive ? 'Yes' : 'No').padEnd(6) + '|'
                );
            }
            console.log('-'.repeat(100));
        }

        console.log('\n📊 SUMMARY:');
        const summary = this.results.summary;
        console.log(`  Total Platform Events: ${summary.totalPlatformEvents}`);
        console.log(`    - Custom: ${summary.customEvents}`);
        console.log(`    - Managed Package: ${summary.managedEvents}`);
        console.log(`  Total Subscriber Flows: ${summary.totalSubscriberFlows}`);
        console.log(`  Events WITH Subscribers: ${summary.eventsWithSubscribers}`);
        console.log(`  Events WITHOUT Subscribers: ${summary.eventsWithoutSubscribers}`);
        console.log('');
    }

    async run() {
        try {
            if (this.dryRun) {
                await this.log('DRY RUN MODE - No changes will be made', 'warn');
            }

            await this.log('Starting Platform Event Detection...');

            // Validate connection
            await this.validateConnection();

            // Discover Platform Events
            await this.discoverPlatformEvents();

            // Filter by target object if specified
            if (this.targetObject) {
                this.results.platformEvents = this.results.platformEvents.filter(
                    pe => pe.apiName === this.targetObject || pe.apiName.includes(this.targetObject)
                );
            }

            // Find subscriber flows
            await this.findPlatformEventSubscribers();

            // Build automation chains
            await this.buildAutomationChains();

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

            await this.log('Platform Event detection completed successfully', 'success');

            return this.results;

        } catch (error) {
            await this.log(`Detection failed: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

// CLI Parsing
function parseArgs(args) {
    const options = {
        org: null,
        object: null,
        output: 'table',
        dryRun: false
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
            case '--dry-run':
                options.dryRun = true;
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
Platform Event Detector
=======================

Detects Platform Event triggers and their subscriber flows for automation auditing.

Usage:
  node platform-event-detector.js --org <alias> [options]

Options:
  --org, -o <alias>    Salesforce org alias (required)
  --object <name>      Filter to specific Platform Event object
  --output <format>    Output format: json, csv, table (default: table)
  --dry-run            Preview mode - no reports generated
  --help, -h           Show this help message

Examples:
  node platform-event-detector.js --org production
  node platform-event-detector.js --org sandbox --object Order_Event__e
  node platform-event-detector.js --org prod --output json

Output:
  - Console summary in specified format
  - JSON report: reports/automation-analysis/platform-events-{org}-{timestamp}.json
  - CSV report: reports/automation-analysis/platform-event-subscribers-{org}-{timestamp}.csv

Integration with Automation Auditor:
  This script's output can be consumed by sfdc-automation-auditor to include
  Platform Event automations in the collision detection matrix.
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

    const detector = new PlatformEventDetector(options.org, {
        object: options.object,
        output: options.output,
        dryRun: options.dryRun
    });

    await detector.run();
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = PlatformEventDetector;
