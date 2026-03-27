#!/usr/bin/env node

/**
 * Flow XML Parser
 *
 * Parses .flow-meta.xml files from Metadata API retrieval to extract
 * flow metadata for automation auditing.
 *
 * Purpose: Enable flow auditing when FlowDefinitionView API is unavailable
 * by parsing retrieved flow XML metadata files.
 *
 * Usage:
 *   const parser = new FlowXMLParser();
 *   const flows = await parser.parseFlowDirectory('/path/to/flows');
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

const FLOW_SOQL_VALID_STATUSES = ['Active', 'Draft', 'Obsolete'];

class FlowXMLParser {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true
        });
    }

    /**
     * Parse all flow XML files in a directory
     * @param {string} flowsDir - Directory containing .flow-meta.xml files
     * @returns {Promise<Array>} Parsed flow objects
     */
    async parseFlowDirectory(flowsDir) {
        try {
            const files = await fs.readdir(flowsDir);
            const flowFiles = files.filter(f => f.endsWith('.flow-meta.xml'));

            if (this.verbose) {
                console.log(`   Found ${flowFiles.length} flow XML files`);
            }

            const flows = [];
            for (const file of flowFiles) {
                const filePath = path.join(flowsDir, file);
                try {
                    const flow = await this.parseFlowFile(filePath);
                    if (flow) {
                        flows.push(flow);
                    }
                } catch (error) {
                    console.warn(`   ⚠️  Failed to parse ${file}: ${error.message}`);
                }
            }

            return flows;
        } catch (error) {
            throw new Error(`Failed to read flows directory: ${error.message}`);
        }
    }

    /**
     * Parse a single flow XML file
     * @param {string} filePath - Path to .flow-meta.xml file
     * @returns {Promise<Object>} Parsed flow object
     */
    async parseFlowFile(filePath) {
        const xmlContent = await fs.readFile(filePath, 'utf8');
        const parsed = await this.parser.parseStringPromise(xmlContent);

        const flow = parsed.Flow || parsed.flow;
        if (!flow) {
            throw new Error('Invalid flow XML structure');
        }

        return this.extractFlowMetadata(flow, filePath);
    }

    /**
     * Parse method (alias for compatibility with FlowDiffChecker)
     * @param {string} filePath - Path to .flow-meta.xml file
     * @returns {Promise<Object>} Parsed flow with elements structure
     */
    async parse(filePath) {
        const xmlContent = await fs.readFile(filePath, 'utf8');
        const parsed = await this.parser.parseStringPromise(xmlContent);

        const flow = parsed.Flow || parsed.flow;
        if (!flow) {
            throw new Error('Invalid flow XML structure');
        }

        const elements = this.parseElementsForDiff(flow);
        const variables = this.parseVariablesForDiff(flow);
        const connectors = this.parseConnectorsForDiff(flow);

        // Return object with helper methods for FlowDiffChecker
        return {
            // Metadata fields (direct access for compareMetadata())
            processType: flow.processType,
            processMetadataValues: flow.processMetadataValues,
            start: flow.start,
            status: flow.status,
            triggerType: flow.triggerType,
            label: flow.label,
            apiVersion: flow.apiVersion,
            description: flow.description,

            // Elements by type
            elements: elements,
            variables: variables,
            connectors: connectors,

            // Helper method: Get all elements as flat array
            getAllElements: function() {
                const allElements = [];
                Object.values(elements).forEach(typeArray => {
                    if (Array.isArray(typeArray)) {
                        allElements.push(...typeArray);
                    }
                });
                return allElements;
            }
        };
    }

    /**
     * Parse elements for diff checking
     * @param {Object} flow - Parsed flow object
     * @returns {Object} Elements by type with elementType property
     */
    parseElementsForDiff(flow) {
        const elements = {};
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows'
        ];

        elementTypes.forEach(type => {
            if (flow[type]) {
                const items = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
                elements[type] = items.map(item => ({
                    ...item,
                    elementType: type
                }));
            }
        });

        return elements;
    }

    /**
     * Parse variables for diff checking
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Variables array
     */
    parseVariablesForDiff(flow) {
        if (!flow.variables) return [];
        const vars = Array.isArray(flow.variables) ? flow.variables : [flow.variables];
        return vars;
    }

    /**
     * Parse connectors for diff checking
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Connectors array
     */
    parseConnectorsForDiff(flow) {
        const connectors = [];

        // Extract connectors from all element types
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows'
        ];

        elementTypes.forEach(type => {
            if (flow[type]) {
                const items = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
                items.forEach(item => {
                    if (item.connector) {
                        const conn = Array.isArray(item.connector) ? item.connector : [item.connector];
                        conn.forEach(c => {
                            if (c.targetReference) {
                                connectors.push({
                                    source: item.name,
                                    target: c.targetReference
                                });
                            }
                        });
                    }
                    if (item.defaultConnector && item.defaultConnector.targetReference) {
                        connectors.push({
                            source: item.name,
                            target: item.defaultConnector.targetReference,
                            isDefault: true
                        });
                    }
                });
            }
        });

        return connectors;
    }

    /**
     * Validate flow structure and references
     * @param {Object} flowOrPath - Parsed flow object or file path
     * @returns {Promise<Object>} Validation result with errors and warnings
     */
    async validate(flowOrPath) {
        let flow;
        let filePath;

        // Handle both file path and parsed flow object
        if (typeof flowOrPath === 'string') {
            filePath = flowOrPath;
            const xmlContent = await fs.readFile(flowOrPath, 'utf8');
            const parsed = await this.parser.parseStringPromise(xmlContent);
            flow = parsed.Flow || parsed.flow;
        } else {
            flow = flowOrPath;
            filePath = 'unknown';
        }

        const errors = [];
        const warnings = [];

        // 1. Required fields validation
        if (!flow.label) {
            errors.push('Missing required field: label');
        }
        if (!flow.processType) {
            errors.push('Missing required field: processType');
        }
        if (!flow.status) {
            warnings.push('Missing field: status (defaults to Draft)');
        }
        if (!flow.apiVersion) {
            warnings.push('Missing field: apiVersion');
        }

        // 2. Element reference validation
        const allElements = new Set();
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows'
        ];

        // Collect all element names
        elementTypes.forEach(type => {
            if (flow[type]) {
                const items = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
                items.forEach(item => {
                    if (item.name) {
                        allElements.add(item.name);
                    } else {
                        errors.push(`Element of type ${type} missing name property`);
                    }
                });
            }
        });

        // 3. Connector validation
        const brokenConnectors = [];
        elementTypes.forEach(type => {
            if (flow[type]) {
                const items = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
                items.forEach(item => {
                    // Check regular connector
                    if (item.connector?.targetReference) {
                        if (!allElements.has(item.connector.targetReference)) {
                            brokenConnectors.push({
                                source: item.name,
                                target: item.connector.targetReference,
                                type: 'connector'
                            });
                        }
                    }

                    // Check default connector
                    if (item.defaultConnector?.targetReference) {
                        if (!allElements.has(item.defaultConnector.targetReference)) {
                            brokenConnectors.push({
                                source: item.name,
                                target: item.defaultConnector.targetReference,
                                type: 'defaultConnector'
                            });
                        }
                    }

                    // Check fault connector
                    if (item.faultConnector?.targetReference) {
                        if (!allElements.has(item.faultConnector.targetReference)) {
                            brokenConnectors.push({
                                source: item.name,
                                target: item.faultConnector.targetReference,
                                type: 'faultConnector'
                            });
                        }
                    }

                    // Check decision rules connectors
                    if (item.rules) {
                        const ruleArray = Array.isArray(item.rules) ? item.rules : [item.rules];
                        ruleArray.forEach((rule, index) => {
                            if (rule.connector?.targetReference) {
                                if (!allElements.has(rule.connector.targetReference)) {
                                    brokenConnectors.push({
                                        source: `${item.name}.rules[${index}]`,
                                        target: rule.connector.targetReference,
                                        type: 'ruleConnector'
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });

        if (brokenConnectors.length > 0) {
            brokenConnectors.forEach(conn => {
                errors.push(`Broken ${conn.type}: ${conn.source} → ${conn.target} (target element not found)`);
            });
        }

        // 4. Variable reference validation
        const allVariables = new Set();
        if (flow.variables) {
            const vars = Array.isArray(flow.variables) ? flow.variables : [flow.variables];
            vars.forEach(v => {
                if (v.name) {
                    allVariables.add(v.name);
                } else {
                    errors.push('Variable missing name property');
                }
            });
        }

        // 5. Start element validation (for auto-launched and record-triggered flows)
        if (flow.processType === 'AutoLaunchedFlow' || flow.start) {
            if (!flow.start) {
                warnings.push('Auto-launched flow missing start element');
            } else if (flow.start.connector?.targetReference) {
                if (!allElements.has(flow.start.connector.targetReference)) {
                    errors.push(`Start connector references non-existent element: ${flow.start.connector.targetReference}`);
                }
            }
        }

        // 6. Process type validation
        const validProcessTypes = [
            'AutoLaunchedFlow', 'Flow', 'Workflow', 'CustomEvent',
            'InvocableProcess', 'Survey', 'FieldServiceMobile', 'FieldServiceWeb'
        ];
        if (flow.processType && !validProcessTypes.includes(flow.processType)) {
            warnings.push(`Unknown process type: ${flow.processType}`);
        }

        // 7. Status validation
        const validStatuses = ['Active', 'Draft', 'Obsolete', 'InvalidDraft'];
        if (flow.status && !validStatuses.includes(flow.status)) {
            warnings.push(`Unknown status: ${flow.status}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings,
            elementCount: allElements.size,
            variableCount: allVariables.size,
            connectorCount: brokenConnectors.length === 0 ? 'all valid' : `${brokenConnectors.length} broken`
        };
    }

    /**
     * Extract metadata from parsed flow XML
     * @param {Object} flow - Parsed flow object from XML
     * @param {string} filePath - Original file path
     * @returns {Object} Normalized flow metadata
     */
    extractFlowMetadata(flow, filePath) {
        const fileName = path.basename(filePath, '.flow-meta.xml');

        // Extract basic metadata
        const metadata = {
            DeveloperName: flow.fullName || flow.label || fileName,
            ProcessType: flow.processType || 'Unknown',
            Status: flow.status || 'Draft',
            IsActive: flow.status === 'Active',
            Label: flow.label || fileName,
            Description: flow.description || '',
            NamespacePrefix: this.extractNamespace(fileName),
            LastModifiedDate: null, // Not available in XML
            ApiVersion: flow.apiVersion || null
        };

        // Extract trigger information for record-triggered flows
        if (flow.start) {
            const triggerInfo = this.extractTriggerInfo(flow.start);
            Object.assign(metadata, triggerInfo);
        }

        // Calculate complexity metrics
        metadata.complexity = this.calculateComplexity(flow);

        // Extract entry criteria
        metadata.entryCriteria = this.extractEntryCriteria(flow);

        // Tier 3: Extract field operations from flow actions
        metadata.fieldOperations = this.extractFieldOperations(flow);

        // Generate pseudo-IDs for compatibility with query-based approach
        metadata.DurableId = `flow_${fileName}`;
        metadata.ActiveVersionId = null; // Not available from XML
        metadata.LatestVersionId = null;

        return metadata;
    }

    /**
     * Extract namespace from flow filename
     * @param {string} fileName - Flow file name
     * @returns {string|null} Namespace prefix or null
     */
    extractNamespace(fileName) {
        const match = fileName.match(/^([a-zA-Z0-9]+)__/);
        return match ? match[1] : null;
    }

    /**
     * Extract trigger information from flow start element
     * @param {Object} start - Flow start element
     * @returns {Object} Trigger metadata
     */
    extractTriggerInfo(start) {
        const triggerInfo = {
            TriggerType: null,
            Object: null,
            RecordTriggerType: null
        };

        if (start.recordTriggerType) {
            triggerInfo.TriggerType = 'RecordTrigger';
            triggerInfo.RecordTriggerType = start.recordTriggerType; // Create, Update, CreateAndUpdate, Delete
        }

        if (start.object) {
            triggerInfo.Object = start.object;
        }

        if (start.scheduledPaths) {
            triggerInfo.TriggerType = 'Scheduled';
        }

        if (start.triggerType) {
            triggerInfo.TriggerType = start.triggerType;
        }

        return triggerInfo;
    }

    /**
     * Calculate flow complexity metrics
     * @param {Object} flow - Parsed flow object
     * @returns {Object} Complexity metrics
     */
    calculateComplexity(flow) {
        const complexity = {
            actionCalls: 0,
            decisions: 0,
            assignments: 0,
            loops: 0,
            screens: 0,
            subflows: 0,
            recordCreates: 0,
            recordUpdates: 0,
            recordDeletes: 0,
            total: 0
        };

        // Count different element types
        const elementTypes = [
            { key: 'actionCalls', prop: 'actionCalls' },
            { key: 'decisions', prop: 'decisions' },
            { key: 'assignments', prop: 'assignments' },
            { key: 'loops', prop: 'loops' },
            { key: 'screens', prop: 'screens' },
            { key: 'subflows', prop: 'subflows' },
            { key: 'recordCreates', prop: 'recordCreates' },
            { key: 'recordUpdates', prop: 'recordUpdates' },
            { key: 'recordDeletes', prop: 'recordDeletes' }
        ];

        elementTypes.forEach(({ key, prop }) => {
            if (flow[prop]) {
                complexity[key] = Array.isArray(flow[prop]) ? flow[prop].length : 1;
                complexity.total += complexity[key];
            }
        });

        return complexity;
    }

    /**
     * Extract entry criteria from flow
     * @param {Object} flow - Parsed flow object
     * @returns {string|null} Entry criteria formula or null
     */
    /**
     * Extract entry criteria from flow start element (v3.28.0 Enhanced)
     * Supports:
     * - Formula-based criteria (<filterFormula>, API v55+)
     * - Filter-based criteria (<conditions>/<filters> + <conditionLogic>)
     * - No criteria (always runs)
     * @param {Object} flow - Parsed flow object
     * @returns {Object} Entry criteria with type, data, and human-readable summary
     */
    extractEntryCriteria(flow) {
        if (!flow.start) {
            return { type: 'unknown', summary: 'Not Available' };
        }

        const start = flow.start;

        // Priority 1: Formula-based entry criteria (API v55+)
        if (start.filterFormula) {
            return {
                type: 'formula',
                formula: start.filterFormula,
                summary: this.truncateFormula(start.filterFormula, 200)
            };
        }

        // Priority 2: Filter-based entry criteria (conditions + logic)
        const filters = start.filters || start.conditions;
        if (filters && (Array.isArray(filters) ? filters.length > 0 : true)) {
            const logic = start.conditionLogic || start.filterLogic || 'AND';
            const items = Array.isArray(filters) ? filters : [filters];

            const conditions = items.map(f => ({
                field: f.leftValueReference || f.field || '?',
                operator: f.operator || '=',
                value: this.extractRightValue(f.rightValue || f.value)
            }));

            return {
                type: 'filters',
                logic: logic,
                items: conditions,
                summary: this.formatFilterSummary(logic, conditions)
            };
        }

        // Priority 3: No criteria (runs on all records of trigger type)
        if (start.triggerType || start.recordTriggerType) {
            return { type: 'none', summary: 'Always (no entry criteria)' };
        }

        // Unknown/Not Available
        return { type: 'unknown', summary: 'Not Available' };
    }

    /**
     * Extract right value from filter condition
     * @param {Object} valueNode - Value node from XML
     * @returns {string} Formatted value
     */
    extractRightValue(valueNode) {
        if (!valueNode) return '';
        if (typeof valueNode === 'string') return valueNode;

        // Handle different value types
        if (valueNode.stringValue) return valueNode.stringValue;
        if (valueNode.booleanValue !== undefined) return String(valueNode.booleanValue);
        if (valueNode.numberValue !== undefined) return String(valueNode.numberValue);
        if (valueNode.dateValue) return valueNode.dateValue;
        if (valueNode.dateTimeValue) return valueNode.dateTimeValue;
        if (valueNode.elementReference) return `{${valueNode.elementReference}}`;

        return JSON.stringify(valueNode);
    }

    /**
     * Format filter summary for human readability
     * @param {string} logic - Logic string (AND, OR, or custom like "1 AND (2 OR 3)")
     * @param {Array} conditions - Array of condition objects
     * @returns {string} Formatted summary (truncated to 200 chars)
     */
    formatFilterSummary(logic, conditions) {
        if (!conditions || conditions.length === 0) return 'No conditions';

        // Build condition strings
        const condStrs = conditions.map((c, i) => {
            const field = c.field.replace('$Record.', ''); // Strip $Record prefix
            return `${i + 1}) ${field} ${c.operator} ${c.value}`;
        });

        // Check if logic is custom (contains numbers)
        const isCustomLogic = /\d/.test(logic);

        let summary;
        if (isCustomLogic) {
            // Custom logic like "1 AND (2 OR 3)"
            summary = `Logic: ${logic}; ${condStrs.join('; ')}`;
        } else {
            // Simple AND/OR
            summary = `${logic}: ${condStrs.join('; ')}`;
        }

        return this.truncateFormula(summary, 200);
    }

    /**
     * Truncate formula/summary to max length with smart ending
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncateFormula(text, maxLength) {
        if (!text || text.length <= maxLength) return text;

        // Count remaining conditions if truncating filter summary
        const match = text.match(/(\d+)\)/g);
        if (match && match.length > 4) {
            const totalConditions = match.length;
            const shownConditions = 3; // Show first 3 conditions
            const remaining = totalConditions - shownConditions;

            // Find position after 3rd condition
            const thirdCondPos = text.indexOf(`${shownConditions + 1})`);
            if (thirdCondPos > 0 && thirdCondPos < maxLength) {
                return text.substring(0, thirdCondPos) + `... [+${remaining} more conditions]`;
            }
        }

        // Standard truncation
        return text.substring(0, maxLength - 20) + '... (truncated)';
    }

    /**
     * Extract field operations from flow record actions (v3.28.0 Enhanced)
     * Captures which fields are written AND the values being assigned
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Field operations with field, value, object, and operation type
     */
    extractFieldOperations(flow) {
        const fieldOperations = [];

        // Extract from recordUpdates
        if (flow.recordUpdates) {
            const updates = Array.isArray(flow.recordUpdates) ? flow.recordUpdates : [flow.recordUpdates];
            for (const update of updates) {
                const actionName = update.name || 'UnnamedUpdate';
                const objectName = update.object || 'Unknown';

                // Extract fields from inputAssignments
                if (update.inputAssignments) {
                    const assignments = Array.isArray(update.inputAssignments) ?
                        update.inputAssignments : [update.inputAssignments];

                    for (const assignment of assignments) {
                        if (assignment.field) {
                            fieldOperations.push({
                                type: 'update',
                                object: objectName,
                                field: assignment.field,
                                value: this.extractAssignmentValue(assignment.value),
                                actionName: actionName
                            });
                        }
                    }
                }
            }
        }

        // Extract from recordCreates
        if (flow.recordCreates) {
            const creates = Array.isArray(flow.recordCreates) ? flow.recordCreates : [flow.recordCreates];
            for (const create of creates) {
                const actionName = create.name || 'UnnamedCreate';
                const objectName = create.object || 'Unknown';

                // Extract fields from inputAssignments
                if (create.inputAssignments) {
                    const assignments = Array.isArray(create.inputAssignments) ?
                        create.inputAssignments : [create.inputAssignments];

                    for (const assignment of assignments) {
                        if (assignment.field) {
                            fieldOperations.push({
                                type: 'create',
                                object: objectName,
                                field: assignment.field,
                                value: this.extractAssignmentValue(assignment.value),
                                actionName: actionName
                            });
                        }
                    }
                }
            }
        }

        return fieldOperations;
    }

    /**
     * Extract value being assigned in Flow field assignment
     * @param {Object} valueNode - Value node from inputAssignments
     * @returns {string} Formatted value (literal or reference)
     */
    extractAssignmentValue(valueNode) {
        if (!valueNode) return '';

        // Literal values
        if (valueNode.stringValue) return valueNode.stringValue;
        if (valueNode.booleanValue !== undefined) return String(valueNode.booleanValue);
        if (valueNode.numberValue !== undefined) return String(valueNode.numberValue);
        if (valueNode.dateValue) return valueNode.dateValue;
        if (valueNode.dateTimeValue) return valueNode.dateTimeValue;

        // References to other flow elements (formulas, variables, record fields)
        if (valueNode.elementReference) return `={${valueNode.elementReference}}`;
        if (valueNode.fieldReference) return `=Field(${valueNode.fieldReference})`;

        // Complex expressions
        return '(complex expression)';
    }

    /**
     * Convert parsed flows to FlowDefinitionView-compatible format
     * @param {Array} flows - Parsed flow objects
     * @returns {Array} Flows in query-compatible format
     */
    toQueryCompatibleFormat(flows) {
        return flows.map(flow => ({
            DurableId: flow.DurableId,
            ActiveVersionId: flow.ActiveVersionId,
            LatestVersionId: flow.LatestVersionId,
            ProcessType: flow.ProcessType,
            DeveloperName: flow.DeveloperName,
            NamespacePrefix: flow.NamespacePrefix,
            LastModifiedDate: flow.LastModifiedDate,
            Label: flow.Label,
            IsActive: flow.IsActive,
            // Extended metadata from XML parsing
            _metadata: {
                source: 'MetadataAPI',
                complexity: flow.complexity,
                entryCriteria: flow.entryCriteria,
                fieldOperations: flow.fieldOperations || [],
                triggerInfo: {
                    TriggerType: flow.TriggerType,
                    Object: flow.Object,
                    RecordTriggerType: flow.RecordTriggerType
                }
            }
        }));
    }
}

module.exports = FlowXMLParser;
module.exports.FLOW_SOQL_VALID_STATUSES = FLOW_SOQL_VALID_STATUSES;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node flow-xml-parser.js <flows-directory> [--verbose]');
        console.log('');
        console.log('Parses .flow-meta.xml files and outputs flow metadata.');
        console.log('');
        console.log('Example:');
        console.log('  node flow-xml-parser.js ./force-app/main/default/flows --verbose');
        process.exit(1);
    }

    const flowsDir = args[0];
    const verbose = args.includes('--verbose');

    (async () => {
        try {
            const parser = new FlowXMLParser({ verbose });
            const flows = await parser.parseFlowDirectory(flowsDir);
            const compatible = parser.toQueryCompatibleFormat(flows);

            console.log(JSON.stringify(compatible, null, 2));
            console.log(`\n✓ Parsed ${flows.length} flows`);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
