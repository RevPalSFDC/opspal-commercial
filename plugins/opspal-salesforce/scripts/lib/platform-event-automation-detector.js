#!/usr/bin/env node

/**
 * Platform Event Automation Detector (v3.30.0)
 *
 * Detects automation triggered by Platform Events:
 * - Apex triggers on Platform Event objects (__e suffix)
 * - Platform Event-triggered Flows (TriggerType='PlatformEvent')
 * - Resulting record operations (DML) that write fields
 *
 * Purpose: Close coverage gap - PE automation runs outside user transactions but writes records
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PlatformEventAutomationDetector {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.results = {
            platformEventTriggers: [],
            platformEventFlows: [],
            fieldWrites: [], // Compatible with Field Write Map format
            summary: {
                totalPETriggers: 0,
                totalPEFlows: 0,
                totalFieldWrites: 0,
                platformEventsUsed: new Set()
            }
        };
    }

    /**
     * Main detection method
     */
    async detect() {
        console.log(`\n=== Platform Event Automation Detection ===`);
        console.log(`Organization: ${this.orgAlias}\n`);

        try {
            // Phase 1: Detect Apex triggers on Platform Events
            await this.detectPlatformEventTriggers();

            // Phase 2: Detect Platform Event-triggered Flows
            await this.detectPlatformEventFlows();

            // Phase 3: Analyze field writes from PE automation
            await this.analyzeFieldWrites();

            // Generate summary
            this.generateSummary();

            console.log(`\n✅ Detection Complete`);
            console.log(`- Platform Event Triggers: ${this.results.summary.totalPETriggers}`);
            console.log(`- Platform Event Flows: ${this.results.summary.totalPEFlows}`);
            console.log(`- Total Field Writes: ${this.results.summary.totalFieldWrites}`);
            console.log(`- Platform Events Used: ${this.results.summary.platformEventsUsed.size}`);

            return this.results;

        } catch (error) {
            console.error(`\n❌ Error during detection: ${error.message}`);
            if (this.verbose) {
                console.error(error.stack);
            }
            throw error;
        }
    }

    /**
     * Phase 1: Detect Apex triggers on Platform Event objects
     */
    async detectPlatformEventTriggers() {
        console.log(`\n[Phase 1] Detecting Apex triggers on Platform Events...`);

        try {
            // Query Tooling API for triggers on __e objects
            const query = `SELECT Id, Name, TableEnumOrId, Body FROM ApexTrigger WHERE TableEnumOrId LIKE '%__e'`;
            const queryCmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

            if (this.verbose) {
                console.log(`  Executing: ${queryCmd}`);
            }

            const queryOutput = execSync(queryCmd, { encoding: 'utf8' });
            const queryResult = JSON.parse(queryOutput);

            if (queryResult.status === 0 && queryResult.result && queryResult.result.records) {
                const triggers = queryResult.result.records;

                triggers.forEach(trigger => {
                    this.results.platformEventTriggers.push({
                        name: trigger.Name,
                        platformEvent: trigger.TableEnumOrId,
                        body: trigger.Body
                    });

                    this.results.summary.platformEventsUsed.add(trigger.TableEnumOrId);
                });

                console.log(`  ✅ Found ${triggers.length} Platform Event triggers`);
            } else {
                console.log(`  ℹ️  No Platform Event triggers found`);
            }

        } catch (error) {
            console.warn(`  ⚠️  Warning: Could not query Platform Event triggers (${error.message})`);
        }
    }

    /**
     * Phase 2: Detect Platform Event-triggered Flows
     */
    async detectPlatformEventFlows() {
        console.log(`\n[Phase 2] Detecting Platform Event-triggered Flows...`);

        try {
            // TriggerType is a field on Flow (version object), NOT on FlowDefinitionView.
            // Query the Flow object for platform event trigger detection.
            const query = `SELECT Id, DefinitionId, ProcessType, TriggerType, Status FROM Flow WHERE TriggerType = 'PlatformEvent' AND Status = 'Active'`;
            const queryCmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`;

            if (this.verbose) {
                console.log(`  Executing: ${queryCmd}`);
            }

            const queryOutput = execSync(queryCmd, { encoding: 'utf8' });
            const queryResult = JSON.parse(queryOutput);

            if (queryResult.status === 0 && queryResult.result && queryResult.result.records) {
                const flows = queryResult.result.records;

                flows.forEach(flow => {
                    this.results.platformEventFlows.push({
                        name: flow.DefinitionId || flow.Id,
                        label: flow.ProcessType || 'Unknown',
                        platformEvent: flow.TriggerType,
                        triggerType: flow.TriggerType
                    });

                    if (flow.TriggerType === 'PlatformEvent') {
                        this.results.summary.platformEventsUsed.add(flow.DefinitionId || flow.Id);
                    }
                });

                console.log(`  ✅ Found ${flows.length} Platform Event Flows`);
            } else {
                console.log(`  ℹ️  No Platform Event Flows found`);
            }

        } catch (error) {
            console.warn(`  ⚠️  Warning: Could not query Platform Event Flows (${error.message})`);
        }
    }

    /**
     * Phase 3: Analyze field writes from PE automation
     *
     * Note: This requires parsing Apex trigger bodies and Flow XML
     * For initial implementation, we'll extract basic DML patterns from Apex
     */
    async analyzeFieldWrites() {
        console.log(`\n[Phase 3] Analyzing field writes from PE automation...`);

        // Analyze Apex trigger bodies for DML operations
        this.results.platformEventTriggers.forEach(trigger => {
            const dmlPatterns = this.extractDMLFromApex(trigger.body);

            dmlPatterns.forEach(dml => {
                this.results.fieldWrites.push({
                    object: dml.object,
                    field: `${dml.object}.*`, // Wildcard - exact fields require deeper parsing
                    sourceName: trigger.name,
                    sourceType: 'PlatformEventTrigger',
                    timing: 'ASYNC', // PE triggers run asynchronously
                    operation: dml.operation,
                    platformEvent: trigger.platformEvent
                });
            });
        });

        // For flows, we'd need to parse Flow XML (similar to flow-xml-parser.js)
        // For now, add placeholder entries
        this.results.platformEventFlows.forEach(flow => {
            this.results.fieldWrites.push({
                object: 'UNKNOWN', // Would need Flow XML parsing
                field: 'UNKNOWN.*',
                sourceName: flow.name,
                sourceType: 'PlatformEventFlow',
                timing: 'ASYNC',
                operation: 'UPDATE',
                platformEvent: flow.platformEvent
            });
        });

        console.log(`  ✅ Extracted ${this.results.fieldWrites.length} field write operations`);
    }

    /**
     * Extract DML operations from Apex code
     * Simple pattern matching - not comprehensive but catches common patterns
     */
    extractDMLFromApex(apexBody) {
        const dmlPatterns = [];
        const lines = apexBody.split('\n');

        lines.forEach(line => {
            // Match: insert/update/upsert/delete <Object>
            const insertMatch = line.match(/insert\s+(\w+)/i);
            const updateMatch = line.match(/update\s+(\w+)/i);
            const upsertMatch = line.match(/upsert\s+(\w+)/i);
            const deleteMatch = line.match(/delete\s+(\w+)/i);

            if (insertMatch && !insertMatch[1].startsWith('new')) {
                dmlPatterns.push({ object: insertMatch[1], operation: 'INSERT' });
            }
            if (updateMatch) {
                dmlPatterns.push({ object: updateMatch[1], operation: 'UPDATE' });
            }
            if (upsertMatch) {
                dmlPatterns.push({ object: upsertMatch[1], operation: 'UPSERT' });
            }
            if (deleteMatch) {
                dmlPatterns.push({ object: deleteMatch[1], operation: 'DELETE' });
            }
        });

        return dmlPatterns;
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
        this.results.summary.totalPETriggers = this.results.platformEventTriggers.length;
        this.results.summary.totalPEFlows = this.results.platformEventFlows.length;
        this.results.summary.totalFieldWrites = this.results.fieldWrites.length;

        // Convert Set to Array for JSON serialization
        this.results.summary.platformEventsUsed = Array.from(this.results.summary.platformEventsUsed);
    }

    /**
     * Save results to JSON file
     */
    saveResults(outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Results saved to: ${outputPath}`);
    }

    /**
     * Generate Platform Event Cascade Report
     */
    generateCascadeReport() {
        let report = `# Platform Event Automation Cascade Report\n\n`;
        report += `**Organization**: ${this.orgAlias}\n`;
        report += `**Generated**: ${new Date().toISOString()}\n\n`;

        report += `## Summary\n\n`;
        report += `- **Platform Events Used**: ${this.results.summary.platformEventsUsed.length}\n`;
        report += `- **Apex Triggers on PEs**: ${this.results.summary.totalPETriggers}\n`;
        report += `- **Flows Triggered by PEs**: ${this.results.summary.totalPEFlows}\n`;
        report += `- **Total Field Writes**: ${this.results.summary.totalFieldWrites}\n\n`;

        report += `---\n\n`;

        report += `## Platform Events\n\n`;
        this.results.summary.platformEventsUsed.forEach(pe => {
            report += `### ${pe}\n\n`;

            // Find triggers for this PE
            const triggers = this.results.platformEventTriggers.filter(t => t.platformEvent === pe);
            if (triggers.length > 0) {
                report += `**Apex Triggers**:\n`;
                triggers.forEach(trigger => {
                    report += `- ${trigger.name}\n`;
                });
                report += `\n`;
            }

            // Find flows for this PE
            const flows = this.results.platformEventFlows.filter(f => f.platformEvent === pe);
            if (flows.length > 0) {
                report += `**Flows**:\n`;
                flows.forEach(flow => {
                    report += `- ${flow.name} (${flow.label})\n`;
                });
                report += `\n`;
            }

            // Find field writes for this PE
            const writes = this.results.fieldWrites.filter(w => w.platformEvent === pe);
            if (writes.length > 0) {
                report += `**Field Writes**:\n`;
                writes.forEach(write => {
                    report += `- ${write.object}.${write.field} (${write.operation}) via ${write.sourceName}\n`;
                });
                report += `\n`;
            }
        });

        report += `---\n\n`;
        report += `## ⚠️ Important Notes\n\n`;
        report += `- Platform Event automation runs **asynchronously** (outside user transaction)\n`;
        report += `- PE triggers can cause **delayed field updates** (appears after user action completes)\n`;
        report += `- PE chains can spawn **multiple automations** in parallel\n`;
        report += `- Consider PE timing when diagnosing "mystery overwrites"\n`;

        return report;
    }
}

module.exports = PlatformEventAutomationDetector;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node platform-event-automation-detector.js <org-alias> [--verbose] [--output <file>] [--report]');
        console.log('');
        console.log('Detects automation triggered by Platform Events.');
        console.log('');
        console.log('Options:');
        console.log('  --verbose    Show detailed logging');
        console.log('  --output     Save results to JSON file');
        console.log('  --report     Generate markdown cascade report');
        console.log('');
        console.log('Example:');
        console.log('  node platform-event-automation-detector.js production --output pe-automation.json --report');
        process.exit(1);
    }

    const orgAlias = args[0];
    const verbose = args.includes('--verbose');
    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;
    const generateReport = args.includes('--report');

    const detector = new PlatformEventAutomationDetector(orgAlias, { verbose });

    detector.detect()
        .then((results) => {
            if (outputFile) {
                detector.saveResults(outputFile);
            }

            if (generateReport) {
                const report = detector.generateCascadeReport();
                const reportPath = outputFile ? outputFile.replace('.json', '_REPORT.md') : 'PLATFORM_EVENT_CASCADE_REPORT.md';
                fs.writeFileSync(reportPath, report);
                console.log(`\n📄 Cascade report generated: ${reportPath}`);
            }

            if (!outputFile && !generateReport) {
                console.log('\n=== Field Writes Extracted ===');
                console.log(JSON.stringify(results.fieldWrites, null, 2));
            }
        })
        .catch((error) => {
            console.error(`\n❌ Detection failed: ${error.message}`);
            process.exit(1);
        });
}
