/**
 * Flow Quick Validator
 *
 * Lightweight 4-stage validation subset optimized for Safe Edit Mode.
 * Provides fast validation for minor edits without full 11-stage overhead.
 *
 * @module flow-quick-validator
 * @version 1.0.0
 * @since salesforce-plugin@3.65.0
 *
 * Validation Stages (4 of 11):
 * 1. Syntax - Well-formed XML, basic structure
 * 2. References - No dangling connectors/element references
 * 3. Variables - All referenced variables are declared
 * 4. API Version - Compatibility with target API version
 *
 * Performance Target: <500ms total validation time
 *
 * Usage:
 *   const FlowQuickValidator = require('./flow-quick-validator');
 *   const validator = new FlowQuickValidator({ apiVersion: '62.0' });
 *
 *   const result = await validator.validate('./MyFlow.flow-meta.xml');
 *   if (result.valid) {
 *     // Safe to proceed with edit
 *   }
 */

const fs = require('fs').promises;
const xml2js = require('xml2js');

// Lazy load API version validator to avoid circular dependencies
let FlowAPIVersionValidator;

/**
 * Quick validation stages
 */
const QUICK_STAGES = {
    SYNTAX: {
        name: 'syntax',
        order: 1,
        description: 'Well-formed XML and basic structure',
        timeoutMs: 100
    },
    REFERENCES: {
        name: 'references',
        order: 2,
        description: 'Connector and element references',
        timeoutMs: 150
    },
    VARIABLES: {
        name: 'variables',
        order: 3,
        description: 'Variable declarations and usage',
        timeoutMs: 100
    },
    API_VERSION: {
        name: 'api-version',
        order: 4,
        description: 'API version compatibility',
        timeoutMs: 150
    }
};

class FlowQuickValidator {
    /**
     * Create a new FlowQuickValidator
     * @param {Object} options - Configuration options
     * @param {string} options.apiVersion - Target API version (default: 62.0)
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {boolean} options.strict - Treat warnings as errors
     */
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.apiVersion = options.apiVersion || '62.0';
        this.strict = options.strict || false;
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    /**
     * Log message if verbose mode is enabled
     * @param {string} message - Message to log
     * @private
     */
    _log(message) {
        if (this.verbose) {
            console.log(`[FlowQuickValidator] ${message}`);
        }
    }

    /**
     * Run quick validation on a flow
     * @param {string} flowPathOrXML - Flow file path or XML content
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validate(flowPathOrXML, options = {}) {
        const startTime = Date.now();
        const result = {
            valid: true,
            stages: [],
            errors: [],
            warnings: [],
            duration: 0,
            flowPath: null
        };

        try {
            // Load flow XML
            let flowXML = flowPathOrXML;
            if (flowPathOrXML.endsWith('.xml') || flowPathOrXML.endsWith('.flow-meta.xml')) {
                result.flowPath = flowPathOrXML;
                flowXML = await fs.readFile(flowPathOrXML, 'utf8');
            }

            // Stage 1: Syntax Validation
            const syntaxResult = await this._validateSyntax(flowXML);
            result.stages.push({ ...QUICK_STAGES.SYNTAX, ...syntaxResult });
            if (!syntaxResult.passed) {
                result.valid = false;
                result.errors.push(...syntaxResult.errors);
                // Can't continue if syntax fails
                result.duration = Date.now() - startTime;
                return result;
            }

            // Parse flow for remaining stages
            const flow = syntaxResult.parsedFlow;

            // Stage 2: References Validation
            const refsResult = this._validateReferences(flow);
            result.stages.push({ ...QUICK_STAGES.REFERENCES, ...refsResult });
            if (!refsResult.passed) {
                result.valid = false;
                result.errors.push(...refsResult.errors);
            }

            // Stage 3: Variables Validation
            const varsResult = this._validateVariables(flow);
            result.stages.push({ ...QUICK_STAGES.VARIABLES, ...varsResult });
            if (!varsResult.passed) {
                if (this.strict) {
                    result.valid = false;
                    result.errors.push(...varsResult.errors);
                } else {
                    result.warnings.push(...varsResult.errors);
                }
            }

            // Stage 4: API Version Validation
            const apiResult = await this._validateAPIVersion(flow, flowPathOrXML, options);
            result.stages.push({ ...QUICK_STAGES.API_VERSION, ...apiResult });
            if (!apiResult.passed) {
                result.warnings.push(...apiResult.errors);
                if (apiResult.deprecatedPatterns?.length > 0) {
                    result.warnings.push({
                        stage: 'api-version',
                        message: `Found ${apiResult.deprecatedPatterns.length} deprecated pattern(s)`,
                        patterns: apiResult.deprecatedPatterns
                    });
                }
            }

        } catch (error) {
            result.valid = false;
            result.errors.push({
                stage: 'general',
                message: error.message
            });
        }

        result.duration = Date.now() - startTime;
        this._log(`Validation complete in ${result.duration}ms: ${result.valid ? 'PASSED' : 'FAILED'}`);
        return result;
    }

    /**
     * Stage 1: Validate XML syntax and basic structure
     * @param {string} flowXML - Flow XML content
     * @returns {Promise<Object>} Syntax validation result
     * @private
     */
    async _validateSyntax(flowXML) {
        const result = {
            passed: true,
            errors: [],
            parsedFlow: null
        };

        try {
            // Check for empty content
            if (!flowXML || flowXML.trim().length === 0) {
                result.passed = false;
                result.errors.push({
                    stage: 'syntax',
                    message: 'Flow XML is empty'
                });
                return result;
            }

            // Check XML declaration
            if (!flowXML.includes('<?xml')) {
                result.errors.push({
                    stage: 'syntax',
                    message: 'Missing XML declaration',
                    severity: 'warning'
                });
            }

            // Parse XML
            const parsed = await this.parser.parseStringPromise(flowXML);

            if (!parsed || !parsed.Flow) {
                result.passed = false;
                result.errors.push({
                    stage: 'syntax',
                    message: 'Invalid Flow structure: Missing <Flow> root element'
                });
                return result;
            }

            const flow = parsed.Flow;

            // Check required metadata
            const requiredFields = ['apiVersion', 'processType', 'status'];
            for (const field of requiredFields) {
                if (!flow[field]) {
                    result.errors.push({
                        stage: 'syntax',
                        message: `Missing required field: ${field}`,
                        severity: field === 'apiVersion' ? 'error' : 'warning'
                    });
                    if (field === 'apiVersion') {
                        result.passed = false;
                    }
                }
            }

            result.parsedFlow = flow;

        } catch (error) {
            result.passed = false;
            result.errors.push({
                stage: 'syntax',
                message: `XML parse error: ${error.message}`
            });
        }

        return result;
    }

    /**
     * Stage 2: Validate element and connector references
     * @param {Object} flow - Parsed flow object
     * @returns {Object} References validation result
     * @private
     */
    _validateReferences(flow) {
        const result = {
            passed: true,
            errors: []
        };

        // Build set of all element names
        const elementNames = new Set();
        const elementTypes = [
            'decisions', 'assignments', 'recordLookups', 'recordUpdates',
            'recordCreates', 'recordDeletes', 'loops', 'screens', 'subflows',
            'actionCalls', 'waits', 'collectionProcessors', 'customErrors'
        ];

        for (const type of elementTypes) {
            const elements = flow[type];
            if (elements) {
                const elementArray = Array.isArray(elements) ? elements : [elements];
                for (const element of elementArray) {
                    if (element.name) {
                        elementNames.add(element.name);
                    }
                }
            }
        }

        // Check start element reference
        if (flow.startElementReference) {
            if (!elementNames.has(flow.startElementReference)) {
                result.passed = false;
                result.errors.push({
                    stage: 'references',
                    message: `Start element reference not found: ${flow.startElementReference}`
                });
            }
        }

        // Check connector references
        const connectorTypes = ['connector', 'defaultConnector', 'faultConnector', 'nextValueConnector', 'noMoreValuesConnector'];

        const checkConnectors = (element, elementName) => {
            for (const connType of connectorTypes) {
                if (element[connType]) {
                    const target = element[connType].targetReference;
                    if (target && !elementNames.has(target)) {
                        result.passed = false;
                        result.errors.push({
                            stage: 'references',
                            message: `Dangling connector in ${elementName}: target "${target}" not found`,
                            element: elementName,
                            connector: connType
                        });
                    }
                }
            }

            // Check rules (for decisions)
            if (element.rules) {
                const rules = Array.isArray(element.rules) ? element.rules : [element.rules];
                for (const rule of rules) {
                    if (rule.connector?.targetReference) {
                        if (!elementNames.has(rule.connector.targetReference)) {
                            result.passed = false;
                            result.errors.push({
                                stage: 'references',
                                message: `Dangling rule connector in ${elementName}: target "${rule.connector.targetReference}" not found`,
                                element: elementName,
                                rule: rule.name
                            });
                        }
                    }
                }
            }
        };

        // Check all elements
        for (const type of elementTypes) {
            const elements = flow[type];
            if (elements) {
                const elementArray = Array.isArray(elements) ? elements : [elements];
                for (const element of elementArray) {
                    checkConnectors(element, element.name || type);
                }
            }
        }

        return result;
    }

    /**
     * Stage 3: Validate variable declarations and usage
     * @param {Object} flow - Parsed flow object
     * @returns {Object} Variables validation result
     * @private
     */
    _validateVariables(flow) {
        const result = {
            passed: true,
            errors: []
        };

        // Build set of declared variables
        const declaredVars = new Set();

        // Flow variables
        if (flow.variables) {
            const vars = Array.isArray(flow.variables) ? flow.variables : [flow.variables];
            for (const v of vars) {
                if (v.name) {
                    declaredVars.add(v.name);
                }
            }
        }

        // Formula variables
        if (flow.formulas) {
            const formulas = Array.isArray(flow.formulas) ? flow.formulas : [flow.formulas];
            for (const f of formulas) {
                if (f.name) {
                    declaredVars.add(f.name);
                }
            }
        }

        // Constants
        if (flow.constants) {
            const constants = Array.isArray(flow.constants) ? flow.constants : [flow.constants];
            for (const c of constants) {
                if (c.name) {
                    declaredVars.add(c.name);
                }
            }
        }

        // Text templates
        if (flow.textTemplates) {
            const templates = Array.isArray(flow.textTemplates) ? flow.textTemplates : [flow.textTemplates];
            for (const t of templates) {
                if (t.name) {
                    declaredVars.add(t.name);
                }
            }
        }

        // Built-in variables
        const builtInVars = new Set([
            '$Record', '$Record__Prior', '$Flow', '$Api', '$Organization',
            '$User', '$Label', '$Setup', '$Permission', '$Profile',
            '$UserRole', '$System', '$ObjectType'
        ]);

        // Extract variable references from the flow
        const referencedVars = new Set();
        const extractReferences = (obj) => {
            if (typeof obj === 'string') {
                // Match {!VarName} and {!VarName.Field} patterns
                const matches = obj.match(/\{!([^.}]+)/g);
                if (matches) {
                    for (const match of matches) {
                        const varName = match.replace('{!', '');
                        if (!varName.startsWith('$')) {
                            referencedVars.add(varName);
                        }
                    }
                }
            } else if (typeof obj === 'object' && obj !== null) {
                // Check elementReference fields
                if (obj.elementReference && typeof obj.elementReference === 'string') {
                    const varName = obj.elementReference.split('.')[0];
                    if (!varName.startsWith('$')) {
                        referencedVars.add(varName);
                    }
                }
                // Recursively check all properties
                for (const value of Object.values(obj)) {
                    extractReferences(value);
                }
            }
        };

        extractReferences(flow);

        // Check for undeclared variables (excluding element names which can be referenced)
        // Build set of element names to exclude
        const elementNames = new Set();
        const elementTypes = [
            'decisions', 'assignments', 'recordLookups', 'recordUpdates',
            'recordCreates', 'recordDeletes', 'loops', 'screens', 'subflows',
            'actionCalls', 'waits', 'collectionProcessors', 'customErrors'
        ];
        for (const type of elementTypes) {
            const elements = flow[type];
            if (elements) {
                const elementArray = Array.isArray(elements) ? elements : [elements];
                for (const element of elementArray) {
                    if (element.name) {
                        elementNames.add(element.name);
                    }
                }
            }
        }

        for (const varName of referencedVars) {
            if (!declaredVars.has(varName) && !elementNames.has(varName)) {
                result.passed = false;
                result.errors.push({
                    stage: 'variables',
                    message: `Undeclared variable referenced: ${varName}`,
                    variable: varName,
                    severity: 'warning'
                });
            }
        }

        return result;
    }

    /**
     * Stage 4: Validate API version compatibility
     * @param {Object} flow - Parsed flow object
     * @param {string} flowPathOrXML - Original flow path or XML
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} API version validation result
     * @private
     */
    async _validateAPIVersion(flow, flowPathOrXML, options = {}) {
        const result = {
            passed: true,
            errors: [],
            version: null,
            deprecatedPatterns: []
        };

        // Get flow API version
        const flowVersion = parseFloat(flow.apiVersion) || 0;
        result.version = flowVersion;

        // Check if version is present and valid
        if (!flowVersion || flowVersion < 40) {
            result.passed = false;
            result.errors.push({
                stage: 'api-version',
                message: `Invalid or outdated API version: ${flow.apiVersion || 'missing'}`,
                currentVersion: flowVersion,
                recommendedVersion: this.apiVersion
            });
            return result;
        }

        // Check against target version
        const targetVersion = parseFloat(options.apiVersion || this.apiVersion);
        if (flowVersion < targetVersion - 5) {
            result.errors.push({
                stage: 'api-version',
                message: `Flow API version (${flowVersion}) is significantly older than target (${targetVersion})`,
                severity: 'warning'
            });
        }

        // Try to use FlowAPIVersionValidator for deeper checks
        try {
            if (!FlowAPIVersionValidator) {
                FlowAPIVersionValidator = require('./flow-api-version-validator');
            }

            const apiValidator = new FlowAPIVersionValidator({ verbose: this.verbose });
            const apiResult = await apiValidator.validate(flowPathOrXML);

            if (apiResult.deprecatedPatterns && apiResult.deprecatedPatterns.length > 0) {
                result.deprecatedPatterns = apiResult.deprecatedPatterns;
                result.passed = false;
            }

            if (apiResult.errors && apiResult.errors.length > 0) {
                result.errors.push(...apiResult.errors);
            }

        } catch (err) {
            // API version validator not available, skip deeper checks
            this._log(`API version validator not available: ${err.message}`);
        }

        return result;
    }

    /**
     * Format validation result for display
     * @param {Object} result - Validation result
     * @returns {string} Formatted output
     */
    formatResult(result) {
        const lines = [
            '',
            `Quick Validation ${result.valid ? '✅ PASSED' : '❌ FAILED'} (${result.duration}ms)`,
            ''
        ];

        for (const stage of result.stages) {
            const status = stage.passed ? '✅' : '❌';
            lines.push(`  ${status} ${stage.name}: ${stage.description}`);
        }

        if (result.errors.length > 0) {
            lines.push('', 'Errors:');
            for (const error of result.errors) {
                lines.push(`  ❌ [${error.stage}] ${error.message}`);
            }
        }

        if (result.warnings.length > 0) {
            lines.push('', 'Warnings:');
            for (const warning of result.warnings) {
                lines.push(`  ⚠️  [${warning.stage}] ${warning.message}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Get validation stage definitions
     * @returns {Object} Stage definitions
     */
    static get STAGES() {
        return QUICK_STAGES;
    }
}

module.exports = FlowQuickValidator;
