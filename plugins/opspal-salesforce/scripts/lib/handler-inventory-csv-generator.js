#!/usr/bin/env node

/**
 * Handler Inventory CSV Generator
 *
 * Purpose: Convert handler inventory JSON to CSV format for easy filtering,
 * sorting, and analysis in spreadsheet applications.
 *
 * Features:
 * - Converts nested JSON to flat CSV rows
 * - Handles multiple handlers per trigger
 * - Generates primary inventory CSV
 * - Generates handler-trigger association cross-reference CSV
 * - ✅ Quick Win Integration: Uses RobustCSVParser for robust CSV generation
 *   - Automatic field quoting and escaping
 *   - Handles embedded commas, quotes, newlines
 *   - Resilient to special characters
 *
 * Output Columns (Primary CSV):
 * Object, Trigger, Events, Active, API Version, Handler, BaseClass, Callouts,
 * Async, BulkSafe, HardCodedIDs, Coverage%, MigrationImpact
 *
 * Usage:
 *   const generator = new HandlerInventoryCSVGenerator();
 *   await generator.generateCSV(inventory, outputDir);
 *
 * @version 1.1.0
 * @date 2025-10-31 - Updated to use RobustCSVParser (Quick Win)
 */

const fs = require('fs');
const path = require('path');
const { RobustCSVParser } = require('./csv-schema-validator');

class HandlerInventoryCSVGenerator {
    constructor(options = {}) {
        this.verbose = options.verbose !== false;
        this.csvParser = new RobustCSVParser(); // Quick Win: Use robust CSV generator
    }

    /**
     * Generate CSV files from handler inventory
     * @param {Array<Object>} inventory - Handler inventory JSON
     * @param {string} outputDir - Output directory
     * @returns {Object} Paths to generated CSV files
     */
    async generateCSV(inventory, outputDir) {
        console.log('\n📊 Generating CSV files from handler inventory...\n');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate primary inventory CSV
        const primaryCSVPath = await this.generatePrimaryCSV(inventory, outputDir);

        // Generate handler-trigger association CSV
        const associationCSVPath = await this.generateAssociationCSV(inventory, outputDir);

        console.log('✅ CSV generation complete\n');

        return {
            primaryCSV: primaryCSVPath,
            associationCSV: associationCSVPath
        };
    }

    /**
     * Generate primary handler inventory CSV
     * @param {Array<Object>} inventory - Handler inventory JSON
     * @param {string} outputDir - Output directory
     */
    async generatePrimaryCSV(inventory, outputDir) {
        const outputFile = path.join(outputDir, 'Apex_Handler_Inventory.csv');

        // Quick Win: Convert to objects for robust CSV generation
        const rows = [];

        // Convert inventory to CSV row objects
        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                rows.push({
                    'Object': entry.objectName || '',
                    'Trigger': entry.triggerName || '',
                    'Events': entry.triggerEvents.join(', '),
                    'Active': entry.isActive ? 'Yes' : 'No',
                    'API Version': entry.apiVersion || '',
                    'Handler': handler.className || 'Inline Logic',
                    'BaseClass': handler.baseClass || 'None',
                    'Callouts': handler.doesCallout ? 'Yes' : 'No',
                    'Async': handler.asyncWork.join(', '),
                    'BulkSafe': this.getBulkSafeStatus(handler.bulkSafetyFindings),
                    'HardCodedIDs': handler.hardCodedIds.length > 0 ? handler.hardCodedIds.length : 'None',
                    'Coverage%': handler.approxCoverage + '%',
                    'MigrationImpact': handler.migrationImpact
                });
            }
        }

        // Quick Win: Use RobustCSVParser to generate CSV
        // Automatically handles quoting, embedded commas, escaped quotes
        const csvContent = this.csvParser.generate(rows);
        fs.writeFileSync(outputFile, csvContent, 'utf8');

        console.log(`📄 Saved primary CSV: ${outputFile}`);
        console.log(`   Rows: ${rows.length} (${inventory.length} triggers)`);
        console.log(`   ✅ Using RobustCSVParser (handles quoted fields, embedded commas)\n`);

        return outputFile;
    }

    /**
     * Generate handler-trigger association CSV
     * @param {Array<Object>} inventory - Handler inventory JSON
     * @param {string} outputDir - Output directory
     */
    async generateAssociationCSV(inventory, outputDir) {
        const outputFile = path.join(outputDir, 'Handler_Trigger_Associations.csv');

        // Build handler map
        const handlerMap = new Map();

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                if (!handler.className) continue; // Skip inline logic

                if (!handlerMap.has(handler.className)) {
                    handlerMap.set(handler.className, {
                        className: handler.className,
                        baseClass: handler.baseClass,
                        eventMethods: handler.eventMethods,
                        triggers: [],
                        objects: new Set(),
                        migrationImpact: handler.migrationImpact,
                        coverage: handler.approxCoverage
                    });
                }

                const handlerData = handlerMap.get(handler.className);
                handlerData.triggers.push(entry.triggerName);
                handlerData.objects.add(entry.objectName);
            }
        }

        // Quick Win: Convert to objects for robust CSV generation
        const rows = [];

        for (const [className, data] of handlerMap.entries()) {
            rows.push({
                'Handler Class': className,
                'Base Class': data.baseClass || 'None',
                'Event Methods': data.eventMethods.join(', '),
                'Triggers': data.triggers.join(', '),
                'Objects': Array.from(data.objects).join(', '),
                'Migration Impact': data.migrationImpact,
                'Coverage%': data.coverage + '%'
            });
        }

        // Quick Win: Use RobustCSVParser to generate CSV
        const csvContent = this.csvParser.generate(rows);
        fs.writeFileSync(outputFile, csvContent, 'utf8');

        console.log(`📄 Saved association CSV: ${outputFile}`);
        console.log(`   Rows: ${rows.length} (${handlerMap.size} handlers)`);
        console.log(`   ✅ Using RobustCSVParser (handles quoted fields, embedded commas)\n`);

        return outputFile;
    }

    /**
     * Note: escapeCSV method removed in v1.1.0
     * Now using RobustCSVParser.generate() which handles all escaping automatically
     */

    /**
     * Get bulk safety status from findings
     * @param {Array<string>} findings - Bulk safety findings
     * @returns {string} Status (OK, RISK, UNKNOWN)
     */
    getBulkSafeStatus(findings) {
        if (!findings || findings.length === 0) {
            return 'UNKNOWN';
        }

        const hasRisk = findings.some(f => f.includes('RISK'));

        if (hasRisk) {
            return 'RISK';
        }

        const allOK = findings.every(f => f.includes('OK'));

        if (allOK) {
            return 'OK';
        }

        return 'CHECK';
    }
}

module.exports = HandlerInventoryCSVGenerator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node handler-inventory-csv-generator.js <inventory-json-file> <output-dir>');
        console.error('Example: node handler-inventory-csv-generator.js ./inventory.json ./output');
        process.exit(1);
    }

    const jsonFile = args[0];
    const outputDir = args[1];

    (async () => {
        try {
            // Load JSON
            const inventory = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

            const generator = new HandlerInventoryCSVGenerator({ verbose: true });
            await generator.generateCSV(inventory, outputDir);

            console.log('✅ CSV generation complete!\n');
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}
