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

    // ==========================================
    // Phase 3.65 Enhancement Methods - On-Demand Extraction
    // ==========================================

    /**
     * Extract specific elements on-demand (not tied to segments)
     * Phase 3.65: Enables extraction of arbitrary elements from a flow
     *
     * @param {string[]} elementNames - Array of element names to extract
     * @param {Object} options - Extraction options
     * @param {string} options.subflowName - Name for the new subflow
     * @param {string} options.subflowLabel - Label for the new subflow
     * @param {string} options.apiVersion - API version for the subflow
     * @param {boolean} options.dryRun - Preview extraction without creating subflow
     * @returns {Promise<Object>} Extraction result
     */
    async extractOnDemand(elementNames, options = {}) {
        this.log(`On-demand extraction of ${elementNames.length} elements`);

        // Validate extraction candidates
        const validation = this.validateExtractionCandidates(elementNames);
        if (!validation.valid) {
            return {
                success: false,
                error: 'Validation failed',
                validation
            };
        }

        // Preview impact first
        const impact = await this.previewImpact(elementNames);

        // Generate subflow name if not provided
        const subflowName = options.subflowName ||
            this._generateSubflowName(`Extracted_${Date.now()}`);
        const subflowLabel = options.subflowLabel ||
            this._generateSubflowLabel(`Extracted Elements`);

        if (options.dryRun) {
            return {
                success: true,
                dryRun: true,
                subflowName,
                subflowLabel,
                elementsToExtract: elementNames,
                impact,
                message: 'Dry run - no changes made'
            };
        }

        // Create pseudo-segment for extraction
        const pseudoSegment = {
            name: subflowName,
            elements: elementNames,
            currentComplexity: impact.complexityReduction
        };

        // Create subflow
        const subflowPath = await this._createSubflow(pseudoSegment, {
            name: subflowName,
            label: subflowLabel,
            variables: impact.variables,
            apiVersion: options.apiVersion
        });

        // Replace elements with subflow call
        await this._replaceSegmentWithSubflowCall(pseudoSegment, {
            subflowName,
            variables: impact.variables
        });

        this.log(`✅ On-demand extraction complete: ${subflowName}`);

        return {
            success: true,
            subflowName,
            subflowLabel,
            subflowPath,
            elementsExtracted: elementNames.length,
            variables: impact.variables,
            complexityReduction: impact.complexityReduction,
            connectors: impact.connectors,
            warnings: impact.warnings
        };
    }

    /**
     * Preview extraction impact without executing
     * Phase 3.65: Shows what would happen if elements were extracted
     *
     * @param {string[]} elementNames - Array of element names to preview
     * @returns {Promise<Object>} Impact preview
     */
    async previewImpact(elementNames) {
        this.log(`Previewing impact for ${elementNames.length} elements`);

        const impact = {
            elementsToExtract: elementNames,
            variables: {
                inputs: [],
                outputs: [],
                internal: []
            },
            connectors: {
                broken: [],
                rewired: []
            },
            complexityReduction: 0,
            warnings: []
        };

        const flow = this.flowAuthor.currentFlow || this.flowAuthor.flow;
        const flowVariables = flow.variables || [];

        // Track which elements are being extracted
        const extractingSet = new Set(elementNames);

        // Analyze each element
        for (const elementName of elementNames) {
            const element = this._findElementInFlow(elementName);
            if (!element) {
                impact.warnings.push(`Element not found: ${elementName}`);
                continue;
            }

            // Calculate complexity contribution
            const elementType = this._getElementType(elementName);
            const complexityWeight = this._getComplexityWeight(elementType);
            impact.complexityReduction += complexityWeight;

            // Analyze variable references
            const varRefs = this._extractVariableReferences(element);

            // Process reads - these become inputs
            for (const varName of varRefs.reads) {
                if (!impact.variables.inputs.find(v => v.name === varName)) {
                    const varDef = flowVariables.find(v => v.name === varName);
                    if (varDef || varName.startsWith('$Record')) {
                        impact.variables.inputs.push({
                            name: varName,
                            type: varDef ? varDef.dataType : 'String',
                            isCollection: varDef ? (varDef.isCollection === 'true') : false
                        });
                    }
                }
            }

            // Process writes - these become outputs
            for (const varName of varRefs.writes) {
                if (!impact.variables.outputs.find(v => v.name === varName)) {
                    const varDef = flowVariables.find(v => v.name === varName);
                    if (varDef) {
                        impact.variables.outputs.push({
                            name: varName,
                            type: varDef.dataType,
                            isCollection: varDef.isCollection === 'true'
                        });
                    }
                }
            }

            // Analyze connectors
            const connectors = this._getElementConnectors(element);
            for (const conn of connectors) {
                if (conn.targetReference && !extractingSet.has(conn.targetReference)) {
                    // This connector points outside the extraction set
                    impact.connectors.broken.push({
                        from: elementName,
                        to: conn.targetReference,
                        type: conn.type
                    });
                }
            }
        }

        // Check for incoming connectors from outside
        const allElements = this._getAllFlowElements();
        for (const [name, element] of Object.entries(allElements)) {
            if (extractingSet.has(name)) continue;

            const connectors = this._getElementConnectors(element);
            for (const conn of connectors) {
                if (conn.targetReference && extractingSet.has(conn.targetReference)) {
                    // External element points into extraction set
                    impact.connectors.rewired.push({
                        from: name,
                        to: conn.targetReference,
                        type: conn.type,
                        action: 'Will be rewired to subflow call'
                    });
                }
            }
        }

        // Generate warnings for potential issues
        if (impact.connectors.broken.length > 0) {
            impact.warnings.push(
                `${impact.connectors.broken.length} connector(s) point to elements outside extraction set`
            );
        }

        if (impact.variables.inputs.length > 10) {
            impact.warnings.push(
                `Large number of inputs (${impact.variables.inputs.length}) - consider restructuring`
            );
        }

        if (impact.variables.outputs.length > 5) {
            impact.warnings.push(
                `Large number of outputs (${impact.variables.outputs.length}) - consider using an output object`
            );
        }

        return impact;
    }

    /**
     * Interactive element selector for extraction
     * Phase 3.65: Helps users select elements for extraction
     *
     * @returns {Promise<string[]>} Selected element names
     */
    async interactiveSelect() {
        this.log('Starting interactive element selection');

        const flow = this.flowAuthor.currentFlow || this.flowAuthor.flow;
        const allElements = this._getAllFlowElements();
        const elementList = [];

        // Build element list with metadata
        for (const [name, element] of Object.entries(allElements)) {
            const type = this._getElementTypeFromElement(element);
            const complexity = this._getComplexityWeight(type);

            elementList.push({
                name,
                type,
                label: element.label || name,
                complexity,
                connectorCount: this._getElementConnectors(element).length,
                variableRefs: this._extractVariableReferences(element)
            });
        }

        // Sort by complexity (highest first)
        elementList.sort((a, b) => b.complexity - a.complexity);

        // Return interactive selection data
        // In a real interactive session, this would be used by a CLI or UI
        return {
            elements: elementList,
            totalElements: elementList.length,
            totalComplexity: elementList.reduce((sum, e) => sum + e.complexity, 0),
            suggestions: this._suggestExtractionCandidates(elementList)
        };
    }

    /**
     * Validate that elements can be extracted
     * Phase 3.65: Pre-validation before extraction
     *
     * @param {string[]} elementNames - Elements to validate
     * @returns {Object} Validation result
     */
    validateExtractionCandidates(elementNames) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            validElements: [],
            invalidElements: []
        };

        if (!elementNames || elementNames.length === 0) {
            result.valid = false;
            result.errors.push('No elements specified for extraction');
            return result;
        }

        const flow = this.flowAuthor.currentFlow || this.flowAuthor.flow;
        const extractingSet = new Set(elementNames);

        for (const elementName of elementNames) {
            const element = this._findElementInFlow(elementName);

            if (!element) {
                result.invalidElements.push({
                    name: elementName,
                    reason: 'Element not found in flow'
                });
                result.errors.push(`Element not found: ${elementName}`);
                result.valid = false;
                continue;
            }

            const elementType = this._getElementType(elementName);

            // Check for start element - can't extract
            if (element.name === 'start' || elementType === 'start') {
                result.invalidElements.push({
                    name: elementName,
                    reason: 'Cannot extract start element'
                });
                result.errors.push('Cannot extract the start element');
                result.valid = false;
                continue;
            }

            // Check for record-triggered context dependencies
            if (elementType === 'recordLookups' || elementType === 'recordCreates' ||
                elementType === 'recordUpdates' || elementType === 'recordDeletes') {
                // Check if uses $Record
                const varRefs = this._extractVariableReferences(element);
                if (varRefs.reads.some(v => v.startsWith('$Record'))) {
                    result.warnings.push(
                        `Element ${elementName} uses $Record context - ensure record is passed as input`
                    );
                }
            }

            result.validElements.push({
                name: elementName,
                type: elementType,
                complexity: this._getComplexityWeight(elementType)
            });
        }

        // Check connectivity
        const connectorIssues = this._validateConnectivity(elementNames);
        if (connectorIssues.length > 0) {
            result.warnings.push(...connectorIssues);
        }

        return result;
    }

    /**
     * Get complexity weight for element type
     * @private
     */
    _getComplexityWeight(elementType) {
        const weights = {
            decisions: 2,
            loops: 3,
            actionCalls: 2,
            recordLookups: 2,
            recordCreates: 2,
            recordUpdates: 2,
            recordDeletes: 2,
            assignments: 1,
            screens: 2,
            subflows: 2,
            waits: 3
        };
        return weights[elementType] || 1;
    }

    /**
     * Get all elements from flow
     * @private
     */
    _getAllFlowElements() {
        const flow = this.flowAuthor.currentFlow || this.flowAuthor.flow;
        const elements = {};
        const elementTypes = [
            'decisions', 'assignments', 'actionCalls', 'recordLookups',
            'recordCreates', 'recordUpdates', 'recordDeletes',
            'loops', 'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;
            const typeElements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            for (const element of typeElements) {
                if (element.name) {
                    elements[element.name] = element;
                }
            }
        }

        return elements;
    }

    /**
     * Get connectors from an element
     * @private
     */
    _getElementConnectors(element) {
        const connectors = [];

        if (element.connector && element.connector.targetReference) {
            connectors.push({
                type: 'connector',
                targetReference: element.connector.targetReference
            });
        }

        if (element.defaultConnector && element.defaultConnector.targetReference) {
            connectors.push({
                type: 'defaultConnector',
                targetReference: element.defaultConnector.targetReference
            });
        }

        if (element.faultConnector && element.faultConnector.targetReference) {
            connectors.push({
                type: 'faultConnector',
                targetReference: element.faultConnector.targetReference
            });
        }

        // Decision rules
        if (element.rules) {
            const rules = Array.isArray(element.rules) ? element.rules : [element.rules];
            for (const rule of rules) {
                if (rule.connector && rule.connector.targetReference) {
                    connectors.push({
                        type: 'ruleConnector',
                        rule: rule.name,
                        targetReference: rule.connector.targetReference
                    });
                }
            }
        }

        // Loop next element
        if (element.nextValueConnector && element.nextValueConnector.targetReference) {
            connectors.push({
                type: 'nextValueConnector',
                targetReference: element.nextValueConnector.targetReference
            });
        }

        return connectors;
    }

    /**
     * Get element type from element object
     * @private
     */
    _getElementTypeFromElement(element) {
        // Determine element type from properties
        if (element.rules) return 'decisions';
        if (element.collectionReference || element.iterationOrder) return 'loops';
        if (element.actionType) return 'actionCalls';
        if (element.getFirstRecordOnly !== undefined && element.object) return 'recordLookups';
        if (element.inputAssignments && element.object) {
            if (element.storeOutputAutomatically !== undefined) return 'recordCreates';
        }
        if (element.fields) return 'screens';
        if (element.flowName) return 'subflows';
        if (element.assignmentItems) return 'assignments';
        return 'unknown';
    }

    /**
     * Validate connectivity of elements
     * @private
     */
    _validateConnectivity(elementNames) {
        const issues = [];
        const extractingSet = new Set(elementNames);

        // Check for orphaned connectors
        for (const elementName of elementNames) {
            const element = this._findElementInFlow(elementName);
            if (!element) continue;

            const connectors = this._getElementConnectors(element);
            for (const conn of connectors) {
                if (conn.targetReference && !extractingSet.has(conn.targetReference)) {
                    // Connector points outside - needs handling
                    issues.push(
                        `Connector from ${elementName} to ${conn.targetReference} (outside extraction) will need rewiring`
                    );
                }
            }
        }

        return issues;
    }

    /**
     * Suggest good extraction candidates
     * @private
     */
    _suggestExtractionCandidates(elementList) {
        const suggestions = [];

        // Look for clusters of related elements
        // High complexity elements
        const highComplexity = elementList.filter(e => e.complexity >= 3);
        if (highComplexity.length >= 2) {
            suggestions.push({
                type: 'high_complexity_cluster',
                elements: highComplexity.map(e => e.name),
                reason: 'These elements have high complexity and could benefit from extraction',
                totalComplexity: highComplexity.reduce((sum, e) => sum + e.complexity, 0)
            });
        }

        // Elements with many variable refs (likely related)
        const variableHeavy = elementList.filter(e =>
            e.variableRefs.reads.length + e.variableRefs.writes.length > 3
        );
        if (variableHeavy.length >= 2) {
            suggestions.push({
                type: 'variable_intensive',
                elements: variableHeavy.map(e => e.name),
                reason: 'These elements share many variable references',
                totalComplexity: variableHeavy.reduce((sum, e) => sum + e.complexity, 0)
            });
        }

        return suggestions;
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
