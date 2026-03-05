#!/usr/bin/env node

/**
 * Handler Inventory Builder
 *
 * Purpose: Build comprehensive Apex Handler and Trigger inventory by orchestrating
 * detection, analysis, and coverage retrieval for the automation audit.
 *
 * Features:
 * - Retrieves all ApexTrigger records via Tooling API
 * - Identifies candidate handler ApexClass records
 * - Retrieves trigger and handler bodies
 * - Detects handler-to-trigger associations
 * - Performs static analysis on handlers
 * - Retrieves test coverage from ApexCodeCoverageAggregate
 * - Produces structured JSON output per specification
 *
 * Usage:
 *   const builder = new HandlerInventoryBuilder(orgAlias);
 *   const inventory = await builder.buildInventory();
 *   await builder.saveInventory(inventory, outputDir);
 *
 * @version 1.0.0
 * @date 2025-10-29
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ApexHandlerDetector = require('./apex-handler-detector');
const HandlerStaticAnalyzer = require('./handler-static-analyzer');
const ApexBodyRetriever = require('./apex-body-retriever');

class HandlerInventoryBuilder {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose !== false; // Default to true
        this.excludeManaged = options.excludeManaged || false;
        this.detector = new ApexHandlerDetector({ verbose: this.verbose });
        this.analyzer = new HandlerStaticAnalyzer({ verbose: this.verbose });
        this.bodyRetriever = new ApexBodyRetriever({ orgAlias: this.orgAlias, verbose: this.verbose });
    }

    /**
     * Build complete handler inventory
     * @returns {Array<Object>} Array of trigger-handler inventory objects
     */
    async buildInventory() {
        console.log('\n🔨 Building Apex Handler & Trigger Inventory...\n');

        // Step 1: Retrieve all triggers
        const triggers = await this.retrieveTriggers();
        console.log(`✅ Found ${triggers.length} triggers\n`);

        if (triggers.length === 0) {
            console.log('⚠️  No triggers found in org. Inventory will be empty.\n');
            return [];
        }

        // Step 2: Retrieve candidate handler classes
        const candidateHandlers = await this.retrieveCandidateHandlers();
        console.log(`✅ Found ${candidateHandlers.length} candidate handler classes\n`);

        // Step 3: Retrieve trigger bodies
        const triggerIds = triggers.map(t => t.Id);
        const triggerBodies = await this.bodyRetriever.retrieveTriggerBodies(triggerIds);

        // Step 4: Retrieve handler class bodies
        const handlerIds = candidateHandlers.map(c => c.Id);
        const handlerBodies = await this.bodyRetriever.retrieveClassBodies(handlerIds);

        // Step 5: Build handler lookup map
        const handlerMap = this.buildHandlerMap(candidateHandlers, handlerBodies);

        // Step 6: Retrieve test coverage
        const coverageMap = await this.retrieveTestCoverage(handlerIds);

        // Step 7: Build inventory for each trigger
        const inventory = [];

        for (const trigger of triggers) {
            const triggerBody = triggerBodies.get(trigger.Id) || '';

            // Detect trigger events
            const triggerEvents = this.detector.extractTriggerEvents(triggerBody);

            // Detect handler associations
            const associations = this.detector.detectHandlerAssociations(triggerBody, trigger.Name);

            // Get handler details
            const handlerClasses = [];

            for (const assoc of associations) {
                const handler = handlerMap.get(assoc.handlerClass);

                if (handler) {
                    // Analyze handler
                    const analysis = this.analyzer.analyzeHandler(handler.body, handler.name);

                    // Add test coverage
                    const coverage = coverageMap.get(handler.id) || {};
                    analysis.approxCoverage = coverage.PercentCovered || 0;
                    analysis.testClasses = coverage.TestClasses || [];

                    // Extract additional metadata
                    const baseClass = this.detector.detectBaseClass(handler.body);
                    const eventMethods = this.detector.extractEventMethods(handler.body);

                    handlerClasses.push({
                        className: handler.name,
                        baseClass: baseClass,
                        eventMethods: eventMethods,
                        touchesObjects: analysis.touchesObjects,
                        queriesObjects: analysis.queriesObjects,
                        doesCallout: analysis.doesCallout,
                        asyncWork: analysis.asyncWork,
                        publishesEvents: analysis.publishesEvents,
                        externalConfig: analysis.externalConfig,
                        hardCodedIds: analysis.hardCodedIds,
                        bulkSafetyFindings: analysis.bulkSafetyFindings,
                        testClasses: analysis.testClasses,
                        approxCoverage: analysis.approxCoverage,
                        migrationImpact: analysis.migrationImpact
                    });
                } else {
                    // Handler class not found (external package or deleted)
                    handlerClasses.push({
                        className: assoc.handlerClass,
                        baseClass: null,
                        eventMethods: [],
                        touchesObjects: [],
                        queriesObjects: [],
                        doesCallout: false,
                        asyncWork: [],
                        publishesEvents: [],
                        externalConfig: [],
                        hardCodedIds: [],
                        bulkSafetyFindings: ['WARNING: Handler class not found in org'],
                        testClasses: [],
                        approxCoverage: 0,
                        migrationImpact: 'UNKNOWN'
                    });
                }
            }

            // Build inventory entry
            const entry = {
                objectName: trigger.TableEnumOrId,
                triggerName: trigger.Name,
                triggerEvents: triggerEvents,
                isActive: trigger.Status === 'Active',
                apiVersion: trigger.ApiVersion,
                handlerClasses: handlerClasses.length > 0 ? handlerClasses : [{
                    className: null,
                    baseClass: null,
                    eventMethods: [],
                    touchesObjects: [],
                    queriesObjects: [],
                    doesCallout: false,
                    asyncWork: [],
                    publishesEvents: [],
                    externalConfig: [],
                    hardCodedIds: [],
                    bulkSafetyFindings: ['INFO: No handler class detected (inline trigger logic)'],
                    testClasses: [],
                    approxCoverage: 0,
                    migrationImpact: 'LOW'
                }],
                notes: handlerClasses.length === 0 ? 'Inline trigger logic (no handler pattern)' : ''
            };

            inventory.push(entry);
        }

        console.log(`\n✅ Built inventory for ${inventory.length} triggers\n`);

        return inventory;
    }

    /**
     * Save inventory to JSON file
     * @param {Array<Object>} inventory - Handler inventory
     * @param {string} outputDir - Output directory
     */
    async saveInventory(inventory, outputDir) {
        const outputFile = path.join(outputDir, 'apex-handler-inventory.json');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write JSON
        fs.writeFileSync(outputFile, JSON.stringify(inventory, null, 2), 'utf8');

        console.log(`📄 Saved handler inventory to: ${outputFile}\n`);

        return outputFile;
    }

    /**
     * Retrieve all triggers from org (with optional managed package filtering)
     * @returns {Array<Object>} Array of trigger metadata
     */
    async retrieveTriggers() {
        console.log('📥 Retrieving triggers from org...');

        // Build WHERE clause
        const whereClauses = ["Status IN ('Active', 'Inactive')"];
        if (this.excludeManaged) {
            whereClauses.push("NamespacePrefix = null");
        }
        const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

        const query = `SELECT Id, Name, TableEnumOrId, ApiVersion, Status, NamespacePrefix FROM ApexTrigger ${whereClause}`;

        try {
            const result = execSync(
                `sf data query --query "${query}" --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
            );

            const data = JSON.parse(result);

            if (data.status === 0 && data.result && data.result.records) {
                return data.result.records;
            }

            return [];
        } catch (error) {
            console.error(`❌ Error retrieving triggers: ${error.message}`);
            return [];
        }
    }

    /**
     * Retrieve candidate handler classes (with optional managed package filtering)
     * @returns {Array<Object>} Array of class metadata
     */
    async retrieveCandidateHandlers() {
        console.log('📥 Retrieving candidate handler classes from org...');

        // Build WHERE clause
        const whereClauses = ["(Name LIKE '%Handler%' OR Name LIKE '%Trigger%')"];
        if (this.excludeManaged) {
            whereClauses.push("NamespacePrefix = null");
        }
        const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

        // Query for classes that likely contain trigger handlers
        const query = `SELECT Id, Name, ApiVersion, NamespacePrefix FROM ApexClass ${whereClause}`;

        try {
            const result = execSync(
                `sf data query --query "${query}" --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
            );

            const data = JSON.parse(result);

            if (data.status === 0 && data.result && data.result.records) {
                return data.result.records;
            }

            return [];
        } catch (error) {
            console.error(`❌ Error retrieving handler classes: ${error.message}`);
            return [];
        }
    }

    /**
     * Build handler lookup map
     * @param {Array<Object>} handlers - Handler class metadata
     * @param {Map<string, string>} bodies - Handler bodies map
     * @returns {Map<string, Object>} Handler name to metadata map
     */
    buildHandlerMap(handlers, bodies) {
        const map = new Map();

        handlers.forEach(handler => {
            map.set(handler.Name, {
                id: handler.Id,
                name: handler.Name,
                apiVersion: handler.ApiVersion,
                body: bodies.get(handler.Id) || ''
            });
        });

        return map;
    }

    /**
     * Retrieve test coverage for handler classes
     * @param {Array<string>} classIds - Handler class IDs
     * @returns {Map<string, Object>} Class ID to coverage map
     */
    async retrieveTestCoverage(classIds) {
        if (classIds.length === 0) {
            return new Map();
        }

        console.log('📥 Retrieving test coverage...');

        const coverageMap = new Map();

        // Query in batches of 50
        const batchSize = 50;
        for (let i = 0; i < classIds.length; i += batchSize) {
            const batch = classIds.slice(i, i + batchSize);
            const idList = batch.map(id => `'${id}'`).join(',');

            const query = `SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered, PercentCovered FROM ApexCodeCoverageAggregate WHERE ApexClassOrTriggerId IN (${idList})`;

            try {
                const result = execSync(
                    `sf data query --query "${query}" --json --target-org ${this.orgAlias} --use-tooling-api`,
                    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
                );

                const data = JSON.parse(result);

                if (data.status === 0 && data.result && data.result.records) {
                    data.result.records.forEach(record => {
                        coverageMap.set(record.ApexClassOrTriggerId, {
                            PercentCovered: Math.round(record.PercentCovered || 0),
                            NumLinesCovered: record.NumLinesCovered,
                            NumLinesUncovered: record.NumLinesUncovered,
                            TestClasses: [] // Will be populated if we query test methods
                        });
                    });
                }
            } catch (error) {
                console.error(`⚠️  Error retrieving coverage for batch: ${error.message}`);
            }
        }

        console.log(`✅ Retrieved coverage for ${coverageMap.size} classes\n`);

        return coverageMap;
    }
}

module.exports = HandlerInventoryBuilder;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node handler-inventory-builder.js <org-alias> <output-dir>');
        console.error('Example: node handler-inventory-builder.js myorg ./output');
        process.exit(1);
    }

    const orgAlias = args[0];
    const outputDir = args[1];

    (async () => {
        try {
            const builder = new HandlerInventoryBuilder(orgAlias, { verbose: true });
            const inventory = await builder.buildInventory();
            await builder.saveInventory(inventory, outputDir);

            console.log('✅ Handler inventory build complete!\n');
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}
