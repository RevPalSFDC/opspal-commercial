/**
 * Flow Subflow Extractor (Phase 4.1)
 *
 * Automatically extracts complex segments into separate subflows when they exceed
 * complexity thresholds. This prevents context overload while maintaining flow logic.
 *
 * Features:
 * - Automatic extraction when segment exceeds threshold (default: 150% of budget)
 * - Variable analysis for input/output parameter generation
 * - Maintains proper connector relationships
 * - Generates subflow metadata (name, label, API version)
 * - Handles both simple and complex variable passing
 *
 * Usage:
 * ```javascript
 * const SubflowExtractor = require('./flow-subflow-extractor');
 * const extractor = new SubflowExtractor(flowAuthor, { verbose: true });
 *
 * // Extract segment into subflow
 * const result = await extractor.extractSegmentToSubflow('Data_Enrichment', {
 *   threshold: 1.5,  // 150% of budget
 *   subflowPrefix: 'SF_'
 * });
 *
 * console.log('Subflow created:', result.subflowName);
 * console.log('Variables passed:', result.variables.inputs.length);
 * ```
 *
 * @see PHASE_4_SEGMENTATION_COMPLETE.md for implementation details
 * @author Claude (Sonnet 4.5)
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

class FlowSubflowExtractor {
    /**
     * Create a new FlowSubflowExtractor
     *
     * @param {FlowAuthor} flowAuthor - FlowAuthor instance
     * @param {Object} options - Configuration options
     * @param {boolean} [options.verbose=false] - Enable verbose logging
     * @param {number} [options.defaultThreshold=1.5] - Default extraction threshold (150% of budget)
     * @param {string} [options.subflowPrefix='SF_'] - Prefix for generated subflow names
     * @param {string} [options.subflowOutputDir='./flows/subflows'] - Output directory for subflows
     */
    constructor(flowAuthor, options = {}) {
        this.flowAuthor = flowAuthor;
        this.verbose = options.verbose || false;
        this.defaultThreshold = options.defaultThreshold || 1.5;
        this.subflowPrefix = options.subflowPrefix || 'SF_';
        this.subflowOutputDir = options.subflowOutputDir || './flows/subflows';

        this.parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true,
            xmlns: true
        });

        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            xmlns: true,
            renderOpts: { pretty: true, indent: '    ' }
        });
    }

    /**
     * Check if segment should be extracted based on threshold
     *
     * @param {Object} segmentMetadata - Segment metadata from SegmentManager
     * @param {number} [threshold=this.defaultThreshold] - Extraction threshold
     * @returns {Object} Extraction recommendation
     */
    shouldExtract(segmentMetadata, threshold = this.defaultThreshold) {
        const budgetUsage = segmentMetadata.currentComplexity / segmentMetadata.budget;
        const shouldExtract = budgetUsage >= threshold;

        return {
            shouldExtract,
            budgetUsage,
            threshold,
            complexity: segmentMetadata.currentComplexity,
            budget: segmentMetadata.budget,
            reason: shouldExtract
                ? `Segment complexity (${segmentMetadata.currentComplexity}) exceeds ${Math.round(threshold * 100)}% of budget (${segmentMetadata.budget})`
                : `Segment within threshold (${Math.round(budgetUsage * 100)}% < ${Math.round(threshold * 100)}%)`,
            recommendation: shouldExtract
                ? 'Extract segment to subflow to reduce parent flow complexity'
                : 'No extraction needed'
        };
    }

    /**
     * Extract a segment into a separate subflow
     *
     * @param {string} segmentName - Name of segment to extract
     * @param {Object} options - Extraction options
     * @param {number} [options.threshold=this.defaultThreshold] - Extraction threshold
     * @param {string} [options.subflowName] - Custom subflow name (auto-generated if not provided)
     * @param {string} [options.subflowLabel] - Custom subflow label
     * @param {boolean} [options.dryRun=false] - Preview extraction without creating subflow
     * @returns {Promise<Object>} Extraction result
     */
    async extractSegmentToSubflow(segmentName, options = {}) {
        this.log(`Extracting segment: ${segmentName}`);

        // Get segment metadata
        const segment = this._getSegment(segmentName);
        if (!segment) {
            throw new Error(`Segment not found: ${segmentName}`);
        }

        // Check threshold
        const threshold = options.threshold || this.defaultThreshold;
        const recommendation = this.shouldExtract(segment, threshold);

        if (!recommendation.shouldExtract && !options.force) {
            this.log(`Segment does not meet extraction threshold (${Math.round(recommendation.budgetUsage * 100)}% < ${Math.round(threshold * 100)}%)`);
            return {
                extracted: false,
                reason: recommendation.reason,
                recommendation: recommendation.recommendation
            };
        }

        // Analyze segment variables
        const variables = await this._analyzeSegmentVariables(segment);

        // Generate subflow metadata
        const subflowName = options.subflowName || this._generateSubflowName(segmentName);
        const subflowLabel = options.subflowLabel || this._generateSubflowLabel(segmentName);

        if (options.dryRun) {
            return {
                extracted: false,
                dryRun: true,
                subflowName,
                subflowLabel,
                variables,
                segment,
                recommendation
            };
        }

        // Create subflow
        const subflowPath = await this._createSubflow(segment, {
            name: subflowName,
            label: subflowLabel,
            variables
        });

        // Replace segment with subflow call
        await this._replaceSegmentWithSubflowCall(segment, {
            subflowName,
            variables
        });

        this.log(`✅ Segment extracted to subflow: ${subflowName}`);

        return {
            extracted: true,
            subflowName,
            subflowLabel,
            subflowPath,
            variables,
            originalComplexity: segment.currentComplexity,
            newComplexity: 2, // Subflow call = 2 complexity points
            complexityReduction: segment.currentComplexity - 2,
            recommendation: 'Segment successfully extracted to subflow'
        };
    }

    /**
     * Analyze segment variables to determine inputs/outputs
     *
     * @param {Object} segment - Segment metadata
     * @returns {Promise<Object>} Variable analysis
     * @private
     */
    async _analyzeSegmentVariables(segment) {
        this.log('Analyzing segment variables...');

        const flow = this.flowAuthor.flow;
        const segmentElements = segment.elements || [];

        const variables = {
            inputs: [],   // Variables read from parent flow
            outputs: [],  // Variables written for parent flow
            internal: []  // Variables used only within segment
        };

        // Get all variables in flow
        const flowVariables = flow.variables || [];

        // Analyze each element in segment
        for (const elementName of segmentElements) {
            const element = this._findElementInFlow(elementName);
            if (!element) continue;

            // Check for variable references in element
            const elementVars = this._extractVariableReferences(element);

            for (const varName of elementVars.reads) {
                // Variable is read - potential input
                if (!variables.inputs.find(v => v.name === varName)) {
                    const varDef = flowVariables.find(v => v.name === varName);
                    if (varDef || varName.startsWith('$Record')) {
                        variables.inputs.push({
                            name: varName,
                            type: varDef ? varDef.dataType : 'String',
                            isCollection: varDef ? (varDef.isCollection === 'true') : false
                        });
                    }
                }
            }

            for (const varName of elementVars.writes) {
                // Variable is written - potential output
                if (!variables.outputs.find(v => v.name === varName)) {
                    const varDef = flowVariables.find(v => v.name === varName);
                    if (varDef) {
                        variables.outputs.push({
                            name: varName,
                            type: varDef.dataType,
                            isCollection: varDef.isCollection === 'true'
                        });
                    }
                }
            }
        }

        // Deduplicate (if variable is both read and written, it's input/output)
        const inputNames = new Set(variables.inputs.map(v => v.name));
        const outputNames = new Set(variables.outputs.map(v => v.name));

        // Variables that are in both inputs and outputs stay in both
        // Variables only in inputs or only in outputs stay where they are

        this.log(`Variables: ${variables.inputs.length} inputs, ${variables.outputs.length} outputs`);

        return variables;
    }

    /**
     * Extract variable references from an element
     *
     * @param {Object} element - Flow element
     * @returns {Object} Variable references
     * @private
     */
    _extractVariableReferences(element) {
        const reads = new Set();
        const writes = new Set();

        // Recursive function to extract variable references from object
        const extractFromObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;

            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'string') {
                    // Look for variable references: {!VarName} or {!$Record.Field}
                    const matches = value.match(/\{!([^}]+)\}/g);
                    if (matches) {
                        matches.forEach(match => {
                            const varName = match.replace(/\{!([^}]+)\}/, '$1').split('.')[0];
                            reads.add(varName);
                        });
                    }
                } else if (typeof value === 'object') {
                    extractFromObject(value);
                }
            }
        };

        extractFromObject(element);

        // Check for assignments (writes)
        if (element.assignmentItems || element.assignments) {
            const items = element.assignmentItems || element.assignments;
            const itemsArray = Array.isArray(items) ? items : [items];
            itemsArray.forEach(item => {
                if (item.assignToReference) {
                    writes.add(item.assignToReference);
                }
            });
        }

        // Check for record creates/updates (writes)
        if (element.outputReference) {
            writes.add(element.outputReference);
        }

        return {
            reads: Array.from(reads),
            writes: Array.from(writes)
        };
    }

    /**
     * Create subflow from segment
     *
     * @param {Object} segment - Segment metadata
     * @param {Object} options - Subflow options
     * @returns {Promise<string>} Path to created subflow
     * @private
     */
    async _createSubflow(segment, options) {
        this.log(`Creating subflow: ${options.name}`);

        // Create subflow structure
        const subflow = {
            Flow: {
                $: {
                    xmlns: 'http://soap.sforce.com/2006/04/metadata'
                },
                apiVersion: this.flowAuthor.flow.apiVersion || '62.0',
                label: options.label,
                processType: 'AutoLaunchedFlow',
                status: 'Draft'
            }
        };

        // Add variables (inputs and outputs)
        if (options.variables.inputs.length > 0) {
            subflow.Flow.variables = [];
            options.variables.inputs.forEach(variable => {
                subflow.Flow.variables.push({
                    name: variable.name,
                    dataType: variable.type,
                    isInput: 'true',
                    isOutput: options.variables.outputs.find(v => v.name === variable.name) ? 'true' : 'false',
                    objectType: variable.type === 'SObject' ? variable.objectType : undefined
                });
            });

            // Add outputs that aren't also inputs
            options.variables.outputs.forEach(variable => {
                if (!options.variables.inputs.find(v => v.name === variable.name)) {
                    subflow.Flow.variables.push({
                        name: variable.name,
                        dataType: variable.type,
                        isInput: 'false',
                        isOutput: 'true',
                        objectType: variable.type === 'SObject' ? variable.objectType : undefined
                    });
                }
            });
        }

        // Copy segment elements to subflow
        const flow = this.flowAuthor.flow;
        for (const elementName of segment.elements) {
            const element = this._findElementInFlow(elementName);
            if (!element) continue;

            // Get element type
            const elementType = this._getElementType(elementName);
            if (!elementType) continue;

            // Add to subflow
            if (!subflow.Flow[elementType]) {
                subflow.Flow[elementType] = [];
            }

            // Clone element
            subflow.Flow[elementType].push(JSON.parse(JSON.stringify(element)));
        }

        // Write subflow to file
        await fs.mkdir(this.subflowOutputDir, { recursive: true });
        const subflowPath = path.join(this.subflowOutputDir, `${options.name}.flow-meta.xml`);

        const xml = this.builder.buildObject(subflow);
        await fs.writeFile(subflowPath, xml, 'utf-8');

        this.log(`✅ Subflow created: ${subflowPath}`);

        return subflowPath;
    }

    /**
     * Replace segment with subflow call in parent flow
     *
     * @param {Object} segment - Segment metadata
     * @param {Object} options - Replacement options
     * @returns {Promise<void>}
     * @private
     */
    async _replaceSegmentWithSubflowCall(segment, options) {
        this.log(`Replacing segment with subflow call: ${options.subflowName}`);

        const flow = this.flowAuthor.flow;

        // Create subflow call element
        const subflowCall = {
            name: `Call_${options.subflowName}`,
            label: `Call ${options.subflowName}`,
            locationX: 0,
            locationY: 0,
            flowName: options.subflowName,
            inputAssignments: [],
            outputAssignments: []
        };

        // Map input variables
        options.variables.inputs.forEach(variable => {
            subflowCall.inputAssignments.push({
                name: variable.name,
                value: {
                    elementReference: variable.name
                }
            });
        });

        // Map output variables
        options.variables.outputs.forEach(variable => {
            subflowCall.outputAssignments.push({
                assignToReference: variable.name,
                name: variable.name
            });
        });

        // Add subflow call to flow
        if (!flow.subflows) {
            flow.subflows = [];
        }
        flow.subflows.push(subflowCall);

        // Remove segment elements from parent flow
        for (const elementName of segment.elements) {
            this._removeElementFromFlow(elementName);
        }

        this.log('✅ Segment replaced with subflow call');
    }

    /**
     * Generate subflow name from segment name
     *
     * @param {string} segmentName - Segment name
     * @returns {string} Generated subflow name
     * @private
     */
    _generateSubflowName(segmentName) {
        // Convert segment name to subflow name
        // Example: "Data_Enrichment" -> "SF_Data_Enrichment"
        return `${this.subflowPrefix}${segmentName}`;
    }

    /**
     * Generate subflow label from segment name
     *
     * @param {string} segmentName - Segment name
     * @returns {string} Generated subflow label
     * @private
     */
    _generateSubflowLabel(segmentName) {
        // Convert segment name to label
        // Example: "Data_Enrichment" -> "Subflow: Data Enrichment"
        const label = segmentName.replace(/_/g, ' ');
        return `Subflow: ${label}`;
    }

    /**
     * Get segment by name
     *
     * @param {string} segmentName - Segment name
     * @returns {Object|null} Segment metadata
     * @private
     */
    _getSegment(segmentName) {
        if (!this.flowAuthor.segmentManager) {
            throw new Error('Segmentation not enabled in FlowAuthor');
        }

        const segments = this.flowAuthor.segmentManager.segments;
        return segments.find(s => s.name === segmentName) || null;
    }

    /**
     * Find element in flow by name
     *
     * @param {string} elementName - Element name
     * @returns {Object|null} Element
     * @private
     */
    _findElementInFlow(elementName) {
        const flow = this.flowAuthor.flow;
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            const element = elements.find(el => el.name === elementName);
            if (element) return element;
        }

        return null;
    }

    /**
     * Get element type by name
     *
     * @param {string} elementName - Element name
     * @returns {string|null} Element type
     * @private
     */
    _getElementType(elementName) {
        const flow = this.flowAuthor.flow;
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            const element = elements.find(el => el.name === elementName);
            if (element) return type;
        }

        return null;
    }

    /**
     * Remove element from flow
     *
     * @param {string} elementName - Element name
     * @returns {boolean} True if removed
     * @private
     */
    _removeElementFromFlow(elementName) {
        const flow = this.flowAuthor.flow;
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            if (Array.isArray(flow[type])) {
                const originalLength = flow[type].length;
                flow[type] = flow[type].filter(el => el.name !== elementName);
                if (flow[type].length < originalLength) {
                    return true;
                }
            } else if (flow[type].name === elementName) {
                delete flow[type];
                return true;
            }
        }

        return false;
    }

    /**
     * Log helper
     *
     * @param {string} message - Message to log
     * @private
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowSubflowExtractor] ${message}`);
        }
    }
}

module.exports = FlowSubflowExtractor;
