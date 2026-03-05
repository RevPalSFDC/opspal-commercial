/**
 * FlowNLPModifier
 *
 * Parses natural language instructions and modifies Salesforce Flow XML.
 * Supports adding, removing, and modifying flow elements with intelligent templates and decision rules.
 *
 * Phase 1.1 Implementation - Natural Language Parsing
 * Phase 2.2 Enhancement - Intelligent Element Templates & Advanced Options
 * Phase 2.3 Enhancement - Advanced Decision Rules & Conditions
 *
 * Features:
 *   - Natural language instruction parsing
 *   - Intelligent element templates with proper defaults
 *   - Advanced element options (connectors, labels, locations)
 *   - Decision rules with conditions (if/then logic)
 *   - Multiple conditions with AND/OR logic
 *   - Property-specific modifications
 *
 * Usage:
 *   const modifier = new FlowNLPModifier('./flows/Account_AfterSave.flow-meta.xml', 'sandbox');
 *   await modifier.parseAndApply('Remove the Legacy_Email_Step element');
 *   await modifier.parseAndApply('Add a decision called Approval_Check with label "Check Approval Status" connecting to Next_Step');
 *   await modifier.parseAndApply('Add a decision called Amount_Check with rule High_Value if Amount > 10000 then Large_Deal_Path');
 *   await modifier.save('./flows/Account_AfterSave_modified.flow-meta.xml');
 *
 * @version 3.0.0
 * @date 2025-10-31
 *
 * @see Related Runbooks (v3.42.0):
 * - **Runbook 3**: Tools and Techniques - Method 2: Natural Language Modification
 *   Location: docs/runbooks/flow-xml-development/03-tools-and-techniques.md
 *   Topics: NLP syntax patterns, supported operations, limitations, best practices
 *   Use when: Adding elements to existing Flows, iterative development
 *
 *   Supported Operations (from Runbook 3):
 *   - Add Decision: "Add a decision called {Name} if {condition} then {outcome}"
 *   - Add Assignment: "Set {variable} to {value}"
 *   - Add Record Lookup: "Get {object} where {condition}"
 *   - Add Record Update: "Update {object} set {field} to {value}"
 *   - Add Subflow: "Call subflow {name} with {inputs}"
 *   - Add Loop: "Loop through {collection}"
 *
 *   NLP Parsing Rules:
 *   - Condition operators: equals/is/=, not equals/!=, >, <, contains, starts with
 *   - Logic operators: and, or
 *   - Data type inference: Numbers→numberValue, true/false→booleanValue, TODAY→dateTimeValue
 *   - Variable references: RecordId, $Record.Field → {!$Record.Field}
 *
 *   Limitations (see Runbook 3 for workarounds):
 *   - Complex formulas → Use direct XML editing
 *   - Nested loops → Create subflow for inner loop
 *   - Screen elements → Use direct XML for complex screens
 *   - Fault paths → Add manually in XML
 *
 * Quick Examples (from Runbook 3):
 * ```javascript
 * // Add decision with multiple rules
 * await modifier.parseAndApply(
 *   "Add a decision called Priority_Router. If Case Priority equals Critical then Escalate_Immediately, " +
 *   "if Priority equals High then Notify_Manager, otherwise Standard_Processing"
 * );
 *
 * // Add assignment with calculation
 * await modifier.parseAndApply("Set Total_Value to Quantity multiplied by Unit_Price");
 *
 * // Conditional record update
 * await modifier.parseAndApply("Update Account set Last_Reviewed_Date to TODAY");
 * ```
 *
 * @see CLI Usage: `flow add <flow-file> "<instruction>" [--dry-run] [--verbose] [--validate-after]`
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const FlowTaskContext = require('./flow-task-context');
const FlowErrorTaxonomy = require('./flow-error-taxonomy');
const FlowElementTemplates = require('./flow-element-templates');
const FlowConditionParser = require('./flow-condition-parser');

// Phase 2.3: Pre-flight complexity checking
let FlowComplexityCalculator;
try {
    FlowComplexityCalculator = require('./flow-complexity-calculator');
} catch (err) {
    // Complexity calculator not available (optional dependency)
    FlowComplexityCalculator = null;
}

class FlowNLPModifier {
    constructor(flowPath, orgAlias, options = {}) {
        this.flowPath = flowPath;
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;

        // Initialize support components
        this.context = new FlowTaskContext(
            options.contextFile || './tmp/flow-nlp-context.json',
            { verbose: this.verbose }
        );
        this.errorTaxonomy = new FlowErrorTaxonomy();
        this.templates = new FlowElementTemplates();
        this.conditionParser = new FlowConditionParser();

        // Phase 2.3: Complexity checking
        this.complexityCalculator = FlowComplexityCalculator ? new FlowComplexityCalculator() : null;
        this.preflightCheckEnabled = options.preflightCheck !== false; // Default: enabled

        // XML parser/builder
        this.parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true
        });
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ' }
        });

        // Flow state
        this.flow = null;
        this.originalFlow = null;
        this.operations = [];
    }

    /**
     * Initialize modifier and load flow
     */
    async init() {
        try {
            await this.context.init({
                flowName: path.basename(this.flowPath, '.flow-meta.xml'),
                operation: 'nlp-modification',
                orgAlias: this.orgAlias
            });

            // Load flow XML
            const xmlContent = await fs.readFile(this.flowPath, 'utf8');
            const parsed = await this.parser.parseStringPromise(xmlContent);

            this.flow = parsed.Flow || parsed.flow;
            this.originalFlow = JSON.parse(JSON.stringify(this.flow)); // Deep copy

            if (!this.flow) {
                throw new Error('Invalid flow XML structure');
            }

            await this.context.createCheckpoint('initial', {
                flowPath: this.flowPath,
                flowLabel: this.flow.label
            });

            this.log(`Initialized: ${this.flow.label}`);

            return this;
        } catch (error) {
            const classification = this.errorTaxonomy.classify(error);
            await this.context.recordError(error, 'initialization');
            throw error;
        }
    }

    /**
     * Parse and apply natural language instruction
     * @param {string} instruction - Natural language instruction
     * @param {Object} options - Apply options
     * @param {boolean} options.skipPreflightCheck - Skip complexity check (default: false)
     * @returns {Promise<Object>} Operation result with complexity info
     */
    async parseAndApply(instruction, options = {}) {
        try {
            this.log(`Parsing instruction: "${instruction}"`);

            await this.context.recordStep('parse_instruction', {
                instruction: instruction
            });

            const operation = this.parseInstruction(instruction);

            if (!operation) {
                throw new Error(`Could not parse instruction: "${instruction}"`);
            }

            this.log(`Parsed operation: ${operation.type} - ${operation.target}`);

            // Phase 2.3: Pre-flight complexity check
            let complexityPreview = null;
            if (this.preflightCheckEnabled && !options.skipPreflightCheck && this.complexityCalculator) {
                complexityPreview = await this.calculateComplexityImpact(instruction);

                if (this.verbose && complexityPreview) {
                    this.log(`Complexity Impact: +${complexityPreview.score} points`);
                    if (complexityPreview.elementCounts) {
                        const counts = Object.entries(complexityPreview.elementCounts)
                            .map(([type, count]) => `${type}: ${count}`)
                            .join(', ');
                        this.log(`  Elements: ${counts}`);
                    }
                }
            }

            await this.context.recordStep('apply_operation', {
                operationType: operation.type,
                target: operation.target,
                complexityImpact: complexityPreview?.score || 0
            });

            const result = await this.applyOperation(operation);

            // Attach complexity info to result
            if (complexityPreview) {
                result.complexityImpact = complexityPreview;
            }

            this.operations.push({
                instruction: instruction,
                operation: operation,
                result: result,
                complexityImpact: complexityPreview,
                timestamp: new Date().toISOString()
            });

            await this.context.recordStep('operation_complete', {
                success: true,
                modificationsCount: this.operations.length,
                totalComplexityAdded: this.getTotalComplexityAdded()
            });

            return result;
        } catch (error) {
            const classification = this.errorTaxonomy.classify(error);
            await this.context.recordError(error, 'parse_and_apply');

            this.log(`Error (${classification.category}): ${error.message}`);

            throw error;
        }
    }

    /**
     * Parse natural language instruction into operation
     */
    parseInstruction(instruction) {
        const normalized = instruction.toLowerCase().trim();
        const original = instruction.trim();

        // Pattern: Remove <element>
        const removeMatch = normalized.match(/remove (?:the )?(.+?)(?:\s+element)?$/);
        if (removeMatch) {
            // Extract from original instruction to preserve case
            const originalMatch = original.match(/remove (?:the )?(.+?)(?:\s+element)?$/i);
            return {
                type: 'remove',
                target: this.normalizeElementName(originalMatch[1])
            };
        }

        // Pattern: Add a <type> called <name> [with] <options>
        // Make "with" optional and capture everything after name as potential options
        const addWithOptionsMatch = normalized.match(/add (?:a |an )?(\w+) (?:called|named) (\w+)\s+(.+)/);
        if (addWithOptionsMatch) {
            const originalMatch = original.match(/add (?:a |an )?(\w+) (?:called|named) (\w+)\s+(.+)/i);
            const optionsString = originalMatch[3];

            // Remove "with" prefix if present
            const cleanOptionsString = optionsString.replace(/^with\s+/i, '');

            // Only parse as options if it contains option keywords
            if (/(?:label|connecting|target|default|for|on|object|collection|ascending|descending|at|location|rule)/i.test(cleanOptionsString)) {
                return {
                    type: 'add',
                    elementType: originalMatch[1].toLowerCase(),
                    target: originalMatch[2],
                    options: this.parseElementOptions(cleanOptionsString)
                };
            }

            // Otherwise, treat as basic add without options
            return {
                type: 'add',
                elementType: originalMatch[1].toLowerCase(),
                target: originalMatch[2]
            };
        }

        // Pattern: Add a <type> called <name>
        const addMatch = normalized.match(/add (?:a |an )?(\w+) (?:called|named) (\w+)\s*$/);
        if (addMatch) {
            // Extract from original to preserve case
            const originalMatch = original.match(/add (?:a |an )?(\w+) (?:called|named) (\w+)\s*$/i);
            return {
                type: 'add',
                elementType: originalMatch[1].toLowerCase(),
                target: originalMatch[2]
            };
        }

        // Pattern: Modify <element> to <change>
        const modifyMatch = normalized.match(/modify (.+?) to (.+)/);
        if (modifyMatch) {
            const originalMatch = original.match(/modify (.+?) to (.+)/i);
            return {
                type: 'modify',
                target: this.normalizeElementName(originalMatch[1]),
                change: originalMatch[2]
            };
        }

        // Pattern: Change <element> <property> to <value>
        const changeMatch = normalized.match(/change (.+?) (\w+) to (.+)/);
        if (changeMatch) {
            const originalMatch = original.match(/change (.+?) (\w+) to (.+)/i);
            return {
                type: 'modify',
                target: this.normalizeElementName(originalMatch[1]),
                property: originalMatch[2],
                value: originalMatch[3]
            };
        }

        // Pattern: Activate flow
        if (normalized.includes('activate') && normalized.includes('flow') && !normalized.includes('deactivate')) {
            return {
                type: 'activate',
                target: 'flow'
            };
        }

        // Pattern: Deactivate flow
        if (normalized.includes('deactivate') && normalized.includes('flow')) {
            return {
                type: 'deactivate',
                target: 'flow'
            };
        }

        return null;
    }

    /**
     * Parse element options from natural language
     */
    parseElementOptions(optionsString) {
        const options = {};
        const normalized = optionsString.toLowerCase();

        // Parse label (case-sensitive)
        const labelMatch = optionsString.match(/label\s+['"]([^'"]+)['"]/i);
        if (labelMatch) {
            options.label = labelMatch[1];
        }

        // Parse default target/connector (preserve case)
        const targetMatch = optionsString.match(/(?:connecting to|target|next)\s+(\w+)/i);
        if (targetMatch) {
            options.target = targetMatch[1];
        }

        // Parse default connector label (for decisions)
        const defaultLabelMatch = optionsString.match(/default\s+(?:label\s+)?['"]([^'"]+)['"]/i);
        if (defaultLabelMatch) {
            options.defaultLabel = defaultLabelMatch[1];
        }

        // Parse object type (for record operations, preserve case)
        const objectMatch = optionsString.match(/(?:for|on|object)\s+(\w+)/i);
        if (objectMatch) {
            options.object = objectMatch[1];
        }

        // Parse collection (for loops, preserve case)
        const collectionMatch = optionsString.match(/collection\s+(\w+)/i);
        if (collectionMatch) {
            options.collection = collectionMatch[1];
        }

        // Parse iteration order (for loops)
        if (normalized.includes('ascending')) {
            options.iterationOrder = 'Asc';
        } else if (normalized.includes('descending')) {
            options.iterationOrder = 'Desc';
        }

        // Parse location
        const locationMatch = optionsString.match(/(?:at|location)\s+(\d+),\s*(\d+)/i);
        if (locationMatch) {
            options.locationX = parseInt(locationMatch[1]);
            options.locationY = parseInt(locationMatch[2]);
        }

        // Parse rules (for decisions)
        // Pattern: "rule Name if Condition then Target and rule Name2 if Condition2 then Target2"
        if (/\brule\b/i.test(optionsString)) {
            options.rules = this.parseRules(optionsString);
        }

        return options;
    }

    /**
     * Parse decision rules from options string
     * @param {string} optionsString - String containing one or more rule definitions
     * @returns {Array} Array of rule objects
     */
    parseRules(optionsString) {
        const rules = [];

        // Split by "and rule" or "with rule" to handle multiple rules
        // Pattern: "rule Name if Condition then Target"
        const rulePattern = /rule\s+(\w+)\s+if\s+(.+?)\s+then\s+(\w+)/gi;

        let match;
        while ((match = rulePattern.exec(optionsString)) !== null) {
            const ruleName = match[1];
            const conditionString = match[2];
            const target = match[3];

            try {
                // Parse conditions using FlowConditionParser
                const { conditions, logic } = this.conditionParser.parseMultipleConditions(conditionString);

                rules.push({
                    name: ruleName,
                    label: this.templates.makeLabel(ruleName),
                    conditionLogic: logic,
                    conditions: conditions,
                    target: target
                });
            } catch (error) {
                throw new Error(`Failed to parse rule "${ruleName}": ${error.message}`);
            }
        }

        if (rules.length === 0) {
            throw new Error(`Could not parse any rules from: "${optionsString}"`);
        }

        return rules;
    }

    /**
     * Normalize element name (handle variations)
     */
    normalizeElementName(name) {
        // Preserve original case, just clean up the format
        return name
            .trim()
            .replace(/^the /i, '')
            .replace(/ element$/i, '')
            .replace(/ step$/i, '')
            .replace(/\s+/g, '_');
    }

    /**
     * Apply parsed operation to flow
     */
    async applyOperation(operation) {
        switch (operation.type) {
            case 'remove':
                return await this.removeElement(operation.target);

            case 'add':
                return await this.addElement(operation.elementType, operation.target, operation.options);

            case 'modify':
                return await this.modifyElement(operation.target, operation.change, operation.property, operation.value);

            case 'activate':
                return await this.setStatus('Active');

            case 'deactivate':
                return await this.setStatus('Draft');

            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }

    /**
     * Remove element from flow
     */
    async removeElement(elementName) {
        this.log(`Removing element: ${elementName}`);

        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows'
        ];

        let removed = false;

        for (const type of elementTypes) {
            if (!this.flow[type]) continue;

            if (Array.isArray(this.flow[type])) {
                const originalLength = this.flow[type].length;
                this.flow[type] = this.flow[type].filter(el => el.name !== elementName);

                if (this.flow[type].length < originalLength) {
                    removed = true;
                    this.log(`Removed ${elementName} from ${type}`);

                    // Remove empty array
                    if (this.flow[type].length === 0) {
                        delete this.flow[type];
                    }
                    break;
                }
            } else {
                // Single element
                if (this.flow[type].name === elementName) {
                    delete this.flow[type];
                    removed = true;
                    this.log(`Removed ${elementName} from ${type}`);
                    break;
                }
            }
        }

        if (!removed) {
            throw new Error(`Element not found: ${elementName}`);
        }

        return { removed: elementName };
    }

    /**
     * Add element to flow using intelligent templates
     */
    async addElement(elementType, elementName, options = {}) {
        this.log(`Adding ${elementType}: ${elementName} with options: ${JSON.stringify(options)}`);

        // Create element using templates with intelligent defaults
        const newElement = this.templates.createElement(elementType, elementName, options);

        // Get flow element type
        const flowType = this.templates.getFlowType(elementType);

        // Add to flow
        if (!this.flow[flowType]) {
            // First element of this type
            this.flow[flowType] = newElement;
        } else if (Array.isArray(this.flow[flowType])) {
            // Already have multiple elements of this type
            this.flow[flowType].push(newElement);
        } else {
            // Convert single element to array
            this.flow[flowType] = [this.flow[flowType], newElement];
        }

        this.log(`Added ${elementName} as ${flowType} with template defaults`);

        return {
            added: elementName,
            type: flowType,
            element: newElement
        };
    }

    /**
     * Modify element in flow
     */
    async modifyElement(elementName, change, property, value) {
        this.log(`Modifying element: ${elementName}`);

        const element = this.findElement(elementName);

        if (!element) {
            throw new Error(`Element not found: ${elementName}`);
        }

        // Apply modification based on parameters
        if (property && value) {
            // Direct property change
            element[property] = value;
            this.log(`Changed ${elementName}.${property} to "${value}"`);
            return { modified: elementName, property, value };
        } else if (change) {
            // Parse change description
            // This is a simplified version - can be expanded
            const labelMatch = change.match(/label\s+(?:to\s+)?['"](.+)['"]/i);
            if (labelMatch) {
                element.label = labelMatch[1];
                return { modified: elementName, property: 'label', value: labelMatch[1] };
            }

            throw new Error(`Could not parse modification: "${change}"`);
        }

        throw new Error(`No modification specified for: ${elementName}`);
    }

    /**
     * Set flow status (Active/Draft)
     */
    async setStatus(status) {
        this.log(`Setting flow status to: ${status}`);

        const oldStatus = this.flow.status;
        this.flow.status = status;

        return { property: 'status', oldValue: oldStatus, newValue: status };
    }

    /**
     * Find element by name
     */
    findElement(elementName) {
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows'
        ];

        for (const type of elementTypes) {
            if (!this.flow[type]) continue;

            if (Array.isArray(this.flow[type])) {
                const found = this.flow[type].find(el => el.name === elementName);
                if (found) return found;
            } else {
                if (this.flow[type].name === elementName) {
                    return this.flow[type];
                }
            }
        }

        return null;
    }

    /**
     * Save modified flow to file
     */
    async save(outputPath) {
        try {
            await this.context.recordStep('save_flow', {
                outputPath: outputPath
            });

            const xml = this.builder.buildObject({ Flow: this.flow });
            await fs.writeFile(outputPath, xml, 'utf8');

            await this.context.complete({
                outputPath: outputPath,
                operationsApplied: this.operations.length,
                success: true
            });

            this.log(`Saved modified flow to: ${outputPath}`);

            return outputPath;
        } catch (error) {
            const classification = this.errorTaxonomy.classify(error);
            await this.context.recordError(error, 'save');
            throw error;
        }
    }

    /**
     * Get operations history
     */
    getOperations() {
        return this.operations;
    }

    /**
     * Get context for rollback/debugging
     */
    getContext() {
        return this.context.get();
    }

    /**
     * Rollback to original state
     */
    async rollback() {
        this.flow = JSON.parse(JSON.stringify(this.originalFlow));
        this.operations = [];

        await this.context.recordStep('rollback', {
            message: 'Rolled back to original state'
        });

        this.log('Rolled back to original state');
    }

    /**
     * Calculate complexity impact of an instruction (Phase 2.3)
     * @param {string} instruction - Natural language instruction
     * @returns {Promise<Object>} Complexity impact details
     */
    async calculateComplexityImpact(instruction) {
        if (!this.complexityCalculator) {
            return null;
        }

        return await this.complexityCalculator.calculateFromInstruction(instruction);
    }

    /**
     * Get total complexity added by all operations (Phase 2.3)
     * @returns {number} Total complexity score
     */
    getTotalComplexityAdded() {
        return this.operations.reduce((total, op) => {
            return total + (op.complexityImpact?.score || 0);
        }, 0);
    }

    /**
     * Log helper
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowNLPModifier] ${message}`);
        }
    }
}

module.exports = FlowNLPModifier;
