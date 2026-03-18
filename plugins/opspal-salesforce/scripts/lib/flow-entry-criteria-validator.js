#!/usr/bin/env node
/**
 * Flow Entry Criteria Validator
 *
 * Instance-agnostic validator that detects logical contradictions between
 * flow entry criteria and internal element filters. Works on any flow XML
 * without hardcoded field names or object assumptions.
 *
 * Problem it solves:
 * - Entry criteria requires Field_A to have a value (NOT NULL)
 * - Internal update/decision requires Field_A to be NULL
 * - Flow never executes because conditions contradict
 *
 * Usage:
 *   node flow-entry-criteria-validator.js <flow-xml-path>
 *   node flow-entry-criteria-validator.js --org <alias> --flow <flowApiName>
 *
 * @version 1.0.0
 * @date 2026-01-02
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

class FlowEntryCriteriaValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.issues = [];
        this.warnings = [];
    }

    /**
     * Parse flow XML and extract all relevant conditions
     * @param {string} flowXml - Raw flow XML content
     * @returns {Object} Parsed flow structure
     */
    parseFlowXml(flowXml) {
        const flow = {
            apiName: this._extractValue(flowXml, 'fullName') || this._extractValue(flowXml, 'apiName'),
            processType: this._extractValue(flowXml, 'processType'),
            triggerType: this._extractValue(flowXml, 'triggerType'),
            objectType: this._extractValue(flowXml, 'objectType') || this._extractValue(flowXml, 'object'),
            entryCriteria: [],
            internalConditions: [],
            elements: []
        };

        // Extract entry criteria (start element filters)
        flow.entryCriteria = this._extractEntryCriteria(flowXml);

        // Extract internal element conditions (decisions, updates, etc.)
        flow.internalConditions = this._extractInternalConditions(flowXml);

        // Extract element names for context
        flow.elements = this._extractElements(flowXml);

        return flow;
    }

    /**
     * Extract entry criteria from flow start element
     * @private
     */
    _extractEntryCriteria(flowXml) {
        const criteria = [];

        // Match filterLogic and filters in start element
        const startMatch = flowXml.match(/<start>[\s\S]*?<\/start>/);
        if (!startMatch) return criteria;

        const startBlock = startMatch[0];

        // Extract all filters from start element
        const filterMatches = startBlock.matchAll(/<filters>([\s\S]*?)<\/filters>/g);
        for (const match of filterMatches) {
            const filter = this._parseFilter(match[1]);
            if (filter) {
                filter.location = 'entry_criteria';
                criteria.push(filter);
            }
        }

        // Check for recordFilter (newer format)
        const recordFilterMatch = startBlock.match(/<recordFilter>([\s\S]*?)<\/recordFilter>/);
        if (recordFilterMatch) {
            const filters = recordFilterMatch[1].matchAll(/<filters>([\s\S]*?)<\/filters>/g);
            for (const match of filters) {
                const filter = this._parseFilter(match[1]);
                if (filter) {
                    filter.location = 'entry_criteria';
                    criteria.push(filter);
                }
            }
        }

        return criteria;
    }

    /**
     * Extract conditions from internal flow elements
     * @private
     */
    _extractInternalConditions(flowXml) {
        const conditions = [];

        // Extract from decisions
        const decisionMatches = flowXml.matchAll(/<decisions>([\s\S]*?)<\/decisions>/g);
        for (const match of decisionMatches) {
            const decisionName = this._extractValue(match[1], 'name') || 'unnamed_decision';
            const ruleMatches = match[1].matchAll(/<rules>([\s\S]*?)<\/rules>/g);
            for (const ruleMatch of ruleMatches) {
                const ruleName = this._extractValue(ruleMatch[1], 'name') || 'unnamed_rule';
                const conditionMatches = ruleMatch[1].matchAll(/<conditions>([\s\S]*?)<\/conditions>/g);
                for (const condMatch of conditionMatches) {
                    const condition = this._parseCondition(condMatch[1]);
                    if (condition) {
                        condition.location = `decision:${decisionName}/${ruleName}`;
                        conditions.push(condition);
                    }
                }
            }
        }

        // Extract from recordUpdates
        const updateMatches = flowXml.matchAll(/<recordUpdates>([\s\S]*?)<\/recordUpdates>/g);
        for (const match of updateMatches) {
            const updateName = this._extractValue(match[1], 'name') || 'unnamed_update';
            const filterMatches = match[1].matchAll(/<filters>([\s\S]*?)<\/filters>/g);
            for (const filterMatch of filterMatches) {
                const filter = this._parseFilter(filterMatch[1]);
                if (filter) {
                    filter.location = `recordUpdate:${updateName}`;
                    conditions.push(filter);
                }
            }
            // Also check conditions within recordUpdates
            const condMatches = match[1].matchAll(/<conditions>([\s\S]*?)<\/conditions>/g);
            for (const condMatch of condMatches) {
                const condition = this._parseCondition(condMatch[1]);
                if (condition) {
                    condition.location = `recordUpdate:${updateName}`;
                    conditions.push(condition);
                }
            }
        }

        // Extract from recordLookups
        const lookupMatches = flowXml.matchAll(/<recordLookups>([\s\S]*?)<\/recordLookups>/g);
        for (const match of lookupMatches) {
            const lookupName = this._extractValue(match[1], 'name') || 'unnamed_lookup';
            const filterMatches = match[1].matchAll(/<filters>([\s\S]*?)<\/filters>/g);
            for (const filterMatch of filterMatches) {
                const filter = this._parseFilter(filterMatch[1]);
                if (filter) {
                    filter.location = `recordLookup:${lookupName}`;
                    conditions.push(filter);
                }
            }
        }

        // Extract from recordCreates (less common but possible)
        const createMatches = flowXml.matchAll(/<recordCreates>([\s\S]*?)<\/recordCreates>/g);
        for (const match of createMatches) {
            const createName = this._extractValue(match[1], 'name') || 'unnamed_create';
            const condMatches = match[1].matchAll(/<conditions>([\s\S]*?)<\/conditions>/g);
            for (const condMatch of condMatches) {
                const condition = this._parseCondition(condMatch[1]);
                if (condition) {
                    condition.location = `recordCreate:${createName}`;
                    conditions.push(condition);
                }
            }
        }

        return conditions;
    }

    /**
     * Parse a filter element
     * @private
     */
    _parseFilter(filterXml) {
        const field = this._extractValue(filterXml, 'field');
        const operator = this._extractValue(filterXml, 'operator');
        const value = this._extractValue(filterXml, 'value');

        if (!field) return null;

        return {
            field,
            operator: operator || 'EqualTo',
            value: value || null,
            requiresValue: this._operatorRequiresValue(operator),
            requiresNull: this._operatorRequiresNull(operator, value)
        };
    }

    /**
     * Parse a condition element
     * @private
     */
    _parseCondition(conditionXml) {
        const leftField = this._extractValue(conditionXml, 'leftValueReference');
        const operator = this._extractValue(conditionXml, 'operator');
        const rightValue = this._extractValue(conditionXml, 'rightValue');

        if (!leftField) return null;

        return {
            field: leftField,
            operator: operator || 'EqualTo',
            value: rightValue || null,
            requiresValue: this._operatorRequiresValue(operator),
            requiresNull: this._operatorRequiresNull(operator, rightValue)
        };
    }

    /**
     * Check if operator requires field to have a value
     * @private
     */
    _operatorRequiresValue(operator) {
        const valueRequiringOps = [
            'EqualTo', 'NotEqualTo', 'GreaterThan', 'GreaterThanOrEqualTo',
            'LessThan', 'LessThanOrEqualTo', 'Contains', 'StartsWith',
            'EndsWith', 'IsChanged'
        ];
        return valueRequiringOps.includes(operator);
    }

    /**
     * Check if operator/value combination requires field to be null
     * @private
     */
    _operatorRequiresNull(operator, value) {
        if (operator === 'IsNull' && (value === 'true' || value === true)) {
            return true;
        }
        if (operator === 'EqualTo' && (value === null || value === '' || value === 'null')) {
            return true;
        }
        return false;
    }

    /**
     * Extract element names for reporting
     * @private
     */
    _extractElements(flowXml) {
        const elements = [];
        const elementTypes = ['decisions', 'recordUpdates', 'recordLookups', 'recordCreates', 'assignments', 'screens'];

        for (const type of elementTypes) {
            const regex = new RegExp(`<${type}>[\\s\\S]*?<name>([^<]+)<\\/name>[\\s\\S]*?<\\/${type}>`, 'g');
            const matches = flowXml.matchAll(regex);
            for (const match of matches) {
                elements.push({ type, name: match[1] });
            }
        }

        return elements;
    }

    /**
     * Extract value from XML element
     * @private
     */
    _extractValue(xml, tagName) {
        const match = xml.match(new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`));
        return match ? match[1].trim() : null;
    }

    /**
     * Validate flow for entry criteria contradictions
     * @param {Object} flow - Parsed flow structure
     * @returns {Object} Validation results
     */
    validate(flow) {
        this.issues = [];
        this.warnings = [];

        // Build field requirement maps
        const entryRequirements = this._buildFieldRequirements(flow.entryCriteria);
        const internalRequirements = this._buildFieldRequirements(flow.internalConditions);

        // Check for contradictions
        for (const [field, entryReq] of Object.entries(entryRequirements)) {
            const internalReq = internalRequirements[field];
            if (!internalReq) continue;

            // Contradiction: Entry requires value, internal requires null
            if (entryReq.requiresValue && internalReq.requiresNull) {
                this.issues.push({
                    severity: 'P1',
                    type: 'ENTRY_INTERNAL_CONTRADICTION',
                    field,
                    message: `Field "${field}" has contradicting requirements`,
                    detail: `Entry criteria requires this field to have a value, but ${internalReq.location} requires it to be NULL`,
                    entryLocation: entryReq.locations.join(', '),
                    internalLocation: internalReq.location,
                    recommendation: `Modify entry criteria to not require "${field}" to have a value, OR modify ${internalReq.location} to not require NULL`
                });
            }

            // Contradiction: Entry requires null, internal requires value
            if (entryReq.requiresNull && internalReq.requiresValue) {
                this.issues.push({
                    severity: 'P1',
                    type: 'ENTRY_INTERNAL_CONTRADICTION',
                    field,
                    message: `Field "${field}" has contradicting requirements`,
                    detail: `Entry criteria requires this field to be NULL, but ${internalReq.location} requires it to have a value`,
                    entryLocation: entryReq.locations.join(', '),
                    internalLocation: internalReq.location,
                    recommendation: `Modify entry criteria to allow "${field}" to have values, OR modify ${internalReq.location} logic`
                });
            }
        }

        // Check for fields referenced in entry but not used internally (warning)
        for (const [field, entryReq] of Object.entries(entryRequirements)) {
            if (!internalRequirements[field] && this.verbose) {
                this.warnings.push({
                    severity: 'INFO',
                    type: 'ENTRY_ONLY_FIELD',
                    field,
                    message: `Field "${field}" is checked in entry criteria but not referenced in internal logic`
                });
            }
        }

        return {
            valid: this.issues.length === 0,
            flowName: flow.apiName,
            objectType: flow.objectType,
            processType: flow.processType,
            issues: this.issues,
            warnings: this.warnings,
            summary: {
                entryFields: Object.keys(entryRequirements).length,
                internalFields: Object.keys(internalRequirements).length,
                contradictions: this.issues.filter(i => i.type === 'ENTRY_INTERNAL_CONTRADICTION').length
            }
        };
    }

    /**
     * Build field requirements map from conditions
     * @private
     */
    _buildFieldRequirements(conditions) {
        const requirements = {};

        for (const cond of conditions) {
            if (!cond.field) continue;

            // Normalize field name (handle $Record. prefix)
            const fieldName = cond.field.replace(/^\$Record\./, '');

            if (!requirements[fieldName]) {
                requirements[fieldName] = {
                    requiresValue: false,
                    requiresNull: false,
                    locations: [],
                    location: cond.location
                };
            }

            if (cond.requiresValue) {
                requirements[fieldName].requiresValue = true;
            }
            if (cond.requiresNull) {
                requirements[fieldName].requiresNull = true;
            }
            requirements[fieldName].locations.push(cond.location);
            requirements[fieldName].location = cond.location;
        }

        return requirements;
    }

    /**
     * Load flow XML from file
     * @param {string} filePath - Path to flow XML file
     * @returns {string} Flow XML content
     */
    loadFromFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Flow file not found: ${filePath}`);
        }
        return fs.readFileSync(filePath, 'utf8');
    }

    /**
     * Load flow XML from Salesforce org
     * @param {string} orgAlias - Salesforce org alias
     * @param {string} flowApiName - Flow API name
     * @returns {string} Flow XML content
     */
    loadFromOrg(orgAlias, flowApiName) {
        try {
            // Create temp directory for retrieval
            const tempDir = `${os.tmpdir()}/flow-validator-${Date.now()}`;
            fs.mkdirSync(tempDir, { recursive: true });

            // Retrieve flow metadata
            execSync(
                `sf project retrieve start --metadata Flow:${flowApiName} --target-org ${orgAlias} --output-dir ${tempDir}`,
                { encoding: 'utf8', stdio: 'pipe' }
            );

            // Find the flow file
            const flowPath = path.join(tempDir, 'force-app', 'main', 'default', 'flows', `${flowApiName}.flow-meta.xml`);
            if (!fs.existsSync(flowPath)) {
                throw new Error(`Flow not found after retrieval: ${flowApiName}`);
            }

            const flowXml = fs.readFileSync(flowPath, 'utf8');

            // Cleanup
            fs.rmSync(tempDir, { recursive: true, force: true });

            return flowXml;
        } catch (error) {
            throw new Error(`Failed to retrieve flow from org: ${error.message}`);
        }
    }

    /**
     * Format validation results for output
     * @param {Object} results - Validation results
     * @returns {string} Formatted output
     */
    formatResults(results) {
        let output = '';

        output += `\n${'='.repeat(60)}\n`;
        output += `Flow Entry Criteria Validation Report\n`;
        output += `${'='.repeat(60)}\n\n`;

        output += `Flow: ${results.flowName || 'Unknown'}\n`;
        output += `Object: ${results.objectType || 'Unknown'}\n`;
        output += `Process Type: ${results.processType || 'Unknown'}\n\n`;

        output += `Entry Criteria Fields: ${results.summary.entryFields}\n`;
        output += `Internal Condition Fields: ${results.summary.internalFields}\n`;
        output += `Contradictions Found: ${results.summary.contradictions}\n\n`;

        if (results.valid) {
            output += `✅ PASSED - No entry criteria contradictions detected\n`;
        } else {
            output += `❌ FAILED - ${results.issues.length} issue(s) found\n\n`;

            for (const issue of results.issues) {
                output += `${'─'.repeat(50)}\n`;
                output += `[${issue.severity}] ${issue.type}\n`;
                output += `Field: ${issue.field}\n`;
                output += `Message: ${issue.message}\n`;
                output += `Detail: ${issue.detail}\n`;
                output += `Entry Location: ${issue.entryLocation}\n`;
                output += `Internal Location: ${issue.internalLocation}\n`;
                output += `Recommendation: ${issue.recommendation}\n`;
            }
        }

        if (results.warnings.length > 0 && this.verbose) {
            output += `\nWarnings:\n`;
            for (const warning of results.warnings) {
                output += `  [${warning.severity}] ${warning.field}: ${warning.message}\n`;
            }
        }

        return output;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Flow Entry Criteria Validator
=============================

Detects logical contradictions between flow entry criteria and internal element filters.

Usage:
  node flow-entry-criteria-validator.js <flow-xml-path>
  node flow-entry-criteria-validator.js --org <alias> --flow <flowApiName>
  node flow-entry-criteria-validator.js --dir <directory>  # Validate all flows in directory

Options:
  --org <alias>       Salesforce org alias to retrieve flow from
  --flow <name>       Flow API name
  --dir <path>        Directory containing flow XML files
  --verbose           Show additional details and warnings
  --json              Output results as JSON

Examples:
  node flow-entry-criteria-validator.js ./MyFlow.flow-meta.xml
  node flow-entry-criteria-validator.js --org production --flow My_Record_Triggered_Flow
  node flow-entry-criteria-validator.js --dir ./force-app/main/default/flows --verbose
        `);
        process.exit(0);
    }

    const validator = new FlowEntryCriteriaValidator({
        verbose: args.includes('--verbose') || args.includes('-v')
    });

    const outputJson = args.includes('--json');
    const results = [];

    try {
        // Handle --org and --flow
        const orgIndex = args.indexOf('--org');
        const flowIndex = args.indexOf('--flow');
        const dirIndex = args.indexOf('--dir');

        if (orgIndex !== -1 && flowIndex !== -1) {
            const orgAlias = args[orgIndex + 1];
            const flowName = args[flowIndex + 1];

            console.log(`Retrieving flow "${flowName}" from org "${orgAlias}"...`);
            const flowXml = validator.loadFromOrg(orgAlias, flowName);
            const flow = validator.parseFlowXml(flowXml);
            const result = validator.validate(flow);
            results.push(result);

        } else if (dirIndex !== -1) {
            // Validate all flows in directory
            const dir = args[dirIndex + 1];
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.flow-meta.xml'));

            console.log(`Validating ${files.length} flow(s) in ${dir}...\n`);

            for (const file of files) {
                const flowXml = validator.loadFromFile(path.join(dir, file));
                const flow = validator.parseFlowXml(flowXml);
                const result = validator.validate(flow);
                results.push(result);
            }

        } else {
            // Single file
            const filePath = args.find(a => !a.startsWith('-'));
            if (!filePath) {
                console.error('Error: Please provide a flow XML file path');
                process.exit(1);
            }

            const flowXml = validator.loadFromFile(filePath);
            const flow = validator.parseFlowXml(flowXml);
            const result = validator.validate(flow);
            results.push(result);
        }

        // Output results
        if (outputJson) {
            console.log(JSON.stringify(results, null, 2));
        } else {
            for (const result of results) {
                console.log(validator.formatResults(result));
            }

            // Summary if multiple flows
            if (results.length > 1) {
                const passed = results.filter(r => r.valid).length;
                const failed = results.filter(r => !r.valid).length;
                console.log(`\n${'='.repeat(60)}`);
                console.log(`Summary: ${passed} passed, ${failed} failed out of ${results.length} flows`);
            }
        }

        // Exit with error code if any failures
        const hasFailures = results.some(r => !r.valid);
        process.exit(hasFailures ? 1 : 0);

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = FlowEntryCriteriaValidator;
