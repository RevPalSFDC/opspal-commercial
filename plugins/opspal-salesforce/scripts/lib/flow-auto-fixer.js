#!/usr/bin/env node

/**
 * Flow Auto-Fixer
 *
 * Automated remediation engine for common Flow validation issues
 * Integrates with flow-validator.js to apply fixes automatically
 *
 * Supported Fix Patterns:
 * 1. Hard-coded IDs → Convert to formula variables
 * 2. Missing descriptions → Add template descriptions
 * 3. Outdated API versions → Update to latest
 * 4. Deprecated patterns → Apply pattern migrations
 * 5. Missing fault paths → Add default error handlers
 * 6. Copy naming → Rename to descriptive names
 * 7. Unused variables → Remove from metadata
 * 8. Unconnected elements → Remove or connect
 *
 * @module flow-auto-fixer
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

class FlowAutoFixer {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ' }
        });

        this.fixes = [];
        this.skipped = [];
    }

    /**
     * Apply all available fixes to a Flow
     * @param {string} flowPath - Path to Flow XML file
     * @param {Array<Object>} issues - Array of issues from validator
     * @returns {Promise<Object>} Fix results
     */
    async applyFixes(flowPath, issues = []) {
        console.log(`\n🔧 Auto-Fixer: ${path.basename(flowPath)}`);
        console.log('─'.repeat(60));

        try {
            // Read and parse Flow
            const xmlContent = await fs.readFile(flowPath, 'utf8');
            const flowMetadata = await new Promise((resolve, reject) => {
                this.parser.parseString(xmlContent, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            if (!flowMetadata || !flowMetadata.Flow) {
                throw new Error('Invalid flow metadata structure');
            }

            const flow = flowMetadata.Flow;

            // Apply fixes by pattern
            await this._fixHardcodedIds(flow, issues);
            await this._fixMissingDescriptions(flow, issues);
            await this._fixOutdatedApiVersions(flow, issues);
            await this._fixDeprecatedPatterns(flow, issues);
            await this._fixMissingFaultPaths(flow, issues);
            await this._fixCopyNaming(flow, issues);
            await this._fixUnusedVariables(flow, issues);
            await this._fixUnconnectedElements(flow, issues);

            // Save fixed version
            if (this.fixes.length > 0 && !this.dryRun) {
                const fixedXml = this.builder.buildObject(flowMetadata);
                const fixedPath = flowPath.replace('.flow-meta.xml', '.fixed.flow-meta.xml');
                await fs.writeFile(fixedPath, fixedXml);

                console.log(`\n✅ Applied ${this.fixes.length} fix(es)`);
                console.log(`💾 Saved to: ${fixedPath}`);
            } else if (this.dryRun) {
                console.log(`\n🔍 Dry run: ${this.fixes.length} fix(es) would be applied`);
            } else {
                console.log(`\nℹ️  No auto-fixable issues found`);
            }

            return {
                fixed: this.fixes.length,
                skipped: this.skipped.length,
                fixes: this.fixes,
                skippedReasons: this.skipped
            };

        } catch (error) {
            console.error(`❌ Auto-fix failed: ${error.message}`);
            return {
                error: error.message,
                fixed: 0,
                skipped: this.skipped.length
            };
        }
    }

    /**
     * Fix Pattern 1: Hard-coded IDs → Convert to formula variables
     * @private
     */
    async _fixHardcodedIds(flow, issues) {
        const hardcodedIdPattern = /[0-9]{15,18}/g;
        let fixCount = 0;

        // Check filters in Get Records elements
        const recordLookups = this._ensureArray(flow.recordLookups);
        for (const lookup of recordLookups) {
            const filters = this._ensureArray(lookup.filters);

            for (const filter of filters) {
                const value = filter.value?.stringValue?.[0];

                if (value && hardcodedIdPattern.test(value)) {
                    // Create formula variable to replace hardcoded ID
                    const varName = `var_${filter.field?.[0]}_Id`;

                    // Create variable if it doesn't exist
                    if (!this._variableExists(flow, varName)) {
                        this._createFormulaVariable(flow, varName, value, 'Text');
                    }

                    // Replace hardcoded value with variable reference
                    delete filter.value.stringValue;
                    filter.value.elementReference = [varName];

                    fixCount++;
                    this._logFix('HardcodedId', lookup.name?.[0], `Converted hardcoded ID to variable ${varName}`);
                }
            }
        }

        return fixCount;
    }

    /**
     * Fix Pattern 2: Missing descriptions → Add template descriptions
     * @private
     */
    async _fixMissingDescriptions(flow, issues) {
        let fixCount = 0;

        // Fix Flow description
        if (!flow.description || flow.description[0].trim() === '') {
            const flowLabel = flow.label?.[0] || 'Flow';
            flow.description = [`Automated Flow: ${flowLabel}`];
            fixCount++;
            this._logFix('MissingDescription', 'Flow', 'Added template description');
        }

        // Fix element descriptions
        const elementTypes = [
            'decisions', 'loops', 'recordLookups', 'recordCreates',
            'recordUpdates', 'recordDeletes', 'assignments', 'actionCalls'
        ];

        for (const elementType of elementTypes) {
            const elements = this._ensureArray(flow[elementType]);

            for (const element of elements) {
                if (!element.description || element.description[0].trim() === '') {
                    const elementName = element.name?.[0] || 'Element';
                    const readableName = this._camelCaseToWords(elementName);
                    element.description = [readableName];
                    fixCount++;
                    this._logFix('MissingDescription', elementName, 'Added template description');
                }
            }
        }

        return fixCount;
    }

    /**
     * Fix Pattern 3: Outdated API versions → Update to latest
     * @private
     */
    async _fixOutdatedApiVersions(flow, issues) {
        const latestApiVersion = '62.0';
        let fixCount = 0;

        if (flow.apiVersion && parseFloat(flow.apiVersion[0]) < parseFloat(latestApiVersion)) {
            const oldVersion = flow.apiVersion[0];
            flow.apiVersion = [latestApiVersion];
            fixCount++;
            this._logFix('OutdatedApiVersion', 'Flow', `Updated API version from ${oldVersion} to ${latestApiVersion}`);
        }

        return fixCount;
    }

    /**
     * Fix Pattern 4: Deprecated patterns → Apply pattern migrations
     * @private
     */
    async _fixDeprecatedPatterns(flow, issues) {
        let fixCount = 0;

        // Example: Convert deprecated inputReference + inputAssignments pattern
        const recordUpdates = this._ensureArray(flow.recordUpdates);
        const recordCreates = this._ensureArray(flow.recordCreates);

        for (const element of [...recordUpdates, ...recordCreates]) {
            if (element.inputReference && element.inputAssignments) {
                // Remove inputReference, keep inputAssignments
                delete element.inputReference;
                fixCount++;
                this._logFix('DeprecatedPattern', element.name?.[0], 'Removed inputReference (kept inputAssignments)');
            }
        }

        return fixCount;
    }

    /**
     * Fix Pattern 5: Missing fault paths → Add default error handlers
     * @private
     */
    async _fixMissingFaultPaths(flow, issues) {
        let fixCount = 0;

        // Elements that should have fault paths
        const dmlTypes = ['recordCreates', 'recordUpdates', 'recordDeletes', 'recordLookups'];

        for (const dmlType of dmlTypes) {
            const elements = this._ensureArray(flow[dmlType]);

            for (const element of elements) {
                if (!element.faultConnector) {
                    // Create fault connector (usually points to error screen or log)
                    element.faultConnector = [{
                        targetReference: ['ErrorScreen'] // Default error screen
                    }];

                    fixCount++;
                    this._logFix('MissingFaultPath', element.name?.[0], 'Added default fault path to ErrorScreen');

                    // Note: ErrorScreen element should be created if it doesn't exist
                    this._ensureErrorScreen(flow);
                }
            }
        }

        return fixCount;
    }

    /**
     * Fix Pattern 6: Copy naming → Rename to descriptive names
     * @private
     */
    async _fixCopyNaming(flow, issues) {
        const copyPattern = /^(Copy_of_|.*_Copy\d*$)/i;
        let fixCount = 0;

        const elementTypes = [
            'decisions', 'loops', 'recordLookups', 'recordCreates',
            'recordUpdates', 'recordDeletes', 'assignments', 'actionCalls'
        ];

        for (const elementType of elementTypes) {
            const elements = this._ensureArray(flow[elementType]);

            for (const element of elements) {
                const elementName = element.name?.[0];

                if (elementName && copyPattern.test(elementName)) {
                    // Generate descriptive name based on element type
                    const newName = this._generateDescriptiveName(element, elementType);

                    // Update all references to this element
                    this._updateElementReferences(flow, elementName, newName);

                    element.name = [newName];
                    fixCount++;
                    this._logFix('CopyNaming', elementName, `Renamed to ${newName}`);
                }
            }
        }

        return fixCount;
    }

    /**
     * Fix Pattern 7: Unused variables → Remove from metadata
     * @private
     */
    async _fixUnusedVariables(flow, issues) {
        let fixCount = 0;

        const variables = this._ensureArray(flow.variables);
        const usedVariables = this._findUsedVariables(flow);

        // Filter out unused variables
        const usedVariableElements = variables.filter(variable => {
            const varName = variable.name?.[0];

            if (!usedVariables.has(varName)) {
                fixCount++;
                this._logFix('UnusedVariable', varName, 'Removed unused variable');
                return false;
            }

            return true;
        });

        if (fixCount > 0) {
            flow.variables = usedVariableElements;
        }

        return fixCount;
    }

    /**
     * Fix Pattern 8: Unconnected elements → Remove or connect
     * @private
     */
    async _fixUnconnectedElements(flow, issues) {
        let fixCount = 0;

        const allElements = this._getAllElements(flow);
        const connectedElements = new Set();

        // Find all elements reachable from start
        const startElement = flow.start?.[0]?.connector?.[0]?.targetReference?.[0];
        if (startElement) {
            this._traverseConnections(flow, startElement, connectedElements);
        }

        // Remove unconnected elements
        const elementTypes = [
            'decisions', 'loops', 'recordLookups', 'recordCreates',
            'recordUpdates', 'recordDeletes', 'assignments', 'actionCalls'
        ];

        for (const elementType of elementTypes) {
            const elements = this._ensureArray(flow[elementType]);
            const connectedOnly = elements.filter(element => {
                const elementName = element.name?.[0];

                if (!connectedElements.has(elementName)) {
                    fixCount++;
                    this._logFix('UnconnectedElement', elementName, 'Removed unconnected element');
                    return false;
                }

                return true;
            });

            if (connectedOnly.length < elements.length) {
                flow[elementType] = connectedOnly;
            }
        }

        return fixCount;
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    _ensureArray(value) {
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
    }

    _variableExists(flow, varName) {
        const variables = this._ensureArray(flow.variables);
        return variables.some(v => v.name?.[0] === varName);
    }

    _createFormulaVariable(flow, varName, value, dataType) {
        if (!flow.variables) {
            flow.variables = [];
        }

        flow.variables.push({
            name: [varName],
            dataType: [dataType],
            isInput: ['false'],
            isOutput: ['false'],
            value: {
                stringValue: [value]
            }
        });
    }

    _ensureErrorScreen(flow) {
        const screens = this._ensureArray(flow.screens);
        const hasErrorScreen = screens.some(s => s.name?.[0] === 'ErrorScreen');

        if (!hasErrorScreen) {
            if (!flow.screens) {
                flow.screens = [];
            }

            flow.screens.push({
                name: ['ErrorScreen'],
                label: ['Error'],
                description: ['Default error screen for fault paths'],
                fields: [{
                    name: ['ErrorMessage'],
                    fieldType: ['DisplayText'],
                    fieldText: ['An error occurred. Please contact your administrator.']
                }]
            });
        }
    }

    _camelCaseToWords(str) {
        return str.replace(/([A-Z])/g, ' $1').trim();
    }

    _generateDescriptiveName(element, elementType) {
        const typePrefix = elementType.replace(/s$/, ''); // Remove trailing 's'
        const timestamp = Date.now().toString().slice(-6);
        return `${typePrefix}_${timestamp}`;
    }

    _updateElementReferences(flow, oldName, newName) {
        const allElements = this._getAllElements(flow);

        for (const element of allElements) {
            // Update connectors
            const connectors = this._ensureArray(element.connector);
            for (const connector of connectors) {
                if (connector.targetReference?.[0] === oldName) {
                    connector.targetReference = [newName];
                }
            }

            // Update default connector
            if (element.defaultConnector?.[0]?.targetReference?.[0] === oldName) {
                element.defaultConnector[0].targetReference = [newName];
            }

            // Update fault connector
            if (element.faultConnector?.[0]?.targetReference?.[0] === oldName) {
                element.faultConnector[0].targetReference = [newName];
            }
        }

        // Update start connector
        if (flow.start?.[0]?.connector?.[0]?.targetReference?.[0] === oldName) {
            flow.start[0].connector[0].targetReference = [newName];
        }
    }

    _findUsedVariables(flow) {
        const usedVariables = new Set();
        const allElements = this._getAllElements(flow);

        for (const element of allElements) {
            // Check input assignments
            const inputAssignments = this._ensureArray(element.inputAssignments);
            for (const assignment of inputAssignments) {
                const ref = assignment.value?.elementReference?.[0];
                if (ref) usedVariables.add(ref);
            }

            // Check filters
            const filters = this._ensureArray(element.filters);
            for (const filter of filters) {
                const ref = filter.value?.elementReference?.[0];
                if (ref) usedVariables.add(ref);
            }

            // Check assignment items
            const assignmentItems = this._ensureArray(element.assignmentItems);
            for (const item of assignmentItems) {
                const ref = item.value?.elementReference?.[0];
                if (ref) usedVariables.add(ref);
            }
        }

        return usedVariables;
    }

    _getAllElements(flow) {
        const elements = [];
        const elementTypes = [
            'decisions', 'loops', 'recordLookups', 'recordCreates',
            'recordUpdates', 'recordDeletes', 'assignments', 'actionCalls', 'screens'
        ];

        for (const elementType of elementTypes) {
            elements.push(...this._ensureArray(flow[elementType]));
        }

        return elements;
    }

    _traverseConnections(flow, elementName, visited) {
        if (visited.has(elementName)) return;
        visited.add(elementName);

        const element = this._findElement(flow, elementName);
        if (!element) return;

        // Traverse connectors
        const connectors = this._ensureArray(element.connector);
        for (const connector of connectors) {
            const target = connector.targetReference?.[0];
            if (target) {
                this._traverseConnections(flow, target, visited);
            }
        }

        // Traverse default connector
        const defaultTarget = element.defaultConnector?.[0]?.targetReference?.[0];
        if (defaultTarget) {
            this._traverseConnections(flow, defaultTarget, visited);
        }

        // Traverse fault connector
        const faultTarget = element.faultConnector?.[0]?.targetReference?.[0];
        if (faultTarget) {
            this._traverseConnections(flow, faultTarget, visited);
        }
    }

    _findElement(flow, elementName) {
        const allElements = this._getAllElements(flow);
        return allElements.find(e => e.name?.[0] === elementName);
    }

    _logFix(pattern, elementName, description) {
        this.fixes.push({
            pattern,
            element: elementName,
            description
        });

        if (this.verbose) {
            console.log(`  ✓ [${pattern}] ${elementName}: ${description}`);
        }
    }

    _logSkip(pattern, elementName, reason) {
        this.skipped.push({
            pattern,
            element: elementName,
            reason
        });

        if (this.verbose) {
            console.log(`  ⊘ [${pattern}] ${elementName}: ${reason}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Flow Auto-Fixer

Usage: flow-auto-fixer.js <flow-file.xml> [options]

Options:
  --verbose, -v     Show detailed fix progress
  --dry-run         Show what would be fixed without making changes
  --help            Show this help message

Supported Fix Patterns:
  1. Hard-coded IDs → Convert to formula variables
  2. Missing descriptions → Add template descriptions
  3. Outdated API versions → Update to latest
  4. Deprecated patterns → Apply pattern migrations
  5. Missing fault paths → Add default error handlers
  6. Copy naming → Rename to descriptive names
  7. Unused variables → Remove from metadata
  8. Unconnected elements → Remove or connect

Examples:
  # Apply fixes
  node flow-auto-fixer.js MyFlow.flow-meta.xml

  # Dry run to preview fixes
  node flow-auto-fixer.js MyFlow.flow-meta.xml --dry-run

  # Verbose output
  node flow-auto-fixer.js MyFlow.flow-meta.xml --verbose
        `);
        process.exit(0);
    }

    const flowPath = args[0];
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        dryRun: args.includes('--dry-run')
    };

    const fixer = new FlowAutoFixer(options);

    fixer.applyFixes(flowPath).then(result => {
        if (result.error) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }).catch(error => {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = FlowAutoFixer;
