#!/usr/bin/env node

/**
 * Flow XML Validator
 *
 * Comprehensive validation tool for Salesforce Flow metadata files
 * Prevents common deployment errors by checking structure before deployment
 *
 * Based on lessons learned from Contract flow deployment issues
 *
 * @see Related Runbooks (v3.42.0):
 * - **Runbook 4**: Validation and Best Practices - 11-Stage Validation Pipeline
 *   Location: docs/runbooks/flow-xml-development/04-validation-and-best-practices.md
 *   Topics: Comprehensive validation (syntax, metadata, formulas, logic, best practices, governor limits)
 *   Use when: Validating Flows before deployment, troubleshooting failures
 *
 *   Validation Stages (from Runbook 4):
 *   1. Syntax Validation - Well-formed XML, valid schema, correct namespace
 *   2. Metadata Validation - Required fields present, valid values
 *   3. Formula Validation - Salesforce formula syntax, data type matching
 *   4. Logic Validation - Reachable elements, no connector cycles, terminal paths
 *   5. Best Practices - Bulkification, fault paths, naming conventions
 *   6. Governor Limits - DML operations, SOQL queries, CPU time, heap size
 *   7. Security & Permissions - FLS, object access, sharing rules
 *   8. Performance - Complexity, query optimization, collection size
 *   9. Deployment Readiness - Package.xml, API version compatibility
 *   10. Org-Specific - Custom fields exist, objects accessible
 *   11. Regression - Compare against previous version
 *
 *   Critical Best Practices (enforced):
 *   - No DML inside loops (CRITICAL)
 *   - Fault paths on all DML operations
 *   - One Flow per trigger context
 *   - Descriptive element names
 *   - Bulkified patterns for collections
 *
 *   Common Validation Failures (see Runbook 4):
 *   - Element not found → Broken connector reference
 *   - Cyclomatic complexity too high → Split decisions or use formula
 *   - DML inside loop → Use collection pattern
 *   - Invalid location values → Round to nearest 50
 *
 * Quick Examples (from Runbook 4):
 * ```javascript
 * // Validate all stages
 * const validator = new FlowValidator({ verbose: true, autoFix: false });
 * const result = await validator.validate('./flows/MyFlow.xml', ['all']);
 *
 * // Validate specific stages
 * await validator.validate('./flows/MyFlow.xml', ['syntax', 'metadata', 'bestpractices']);
 *
 * // Auto-fix issues
 * const autoFixer = new FlowValidator({ autoFix: true });
 * await autoFixer.validate('./flows/MyFlow.xml', ['all']);
 * ```
 *
 * @see CLI Usage: `flow validate <flow-file> --checks all --best-practices --fix-auto`
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration support
const FlowValidatorConfig = require('./flow-validator-config');

// Auto-fix support
const FlowAutoFixer = require('./flow-auto-fixer');

// Phase 3: Additional validators from Flow Scanner integration
const UnusedVariableValidator = require('./validators/unused-variable-validator');
const UnconnectedElementValidator = require('./validators/unconnected-element-validator');
const CopyAPINameValidator = require('./validators/copy-api-name-validator');
const RecursiveAfterUpdateValidator = require('./validators/recursive-after-update-validator');
const TriggerOrderValidator = require('./validators/trigger-order-validator');
const AutoLayoutValidator = require('./validators/auto-layout-validator');
const InactiveFlowValidator = require('./validators/inactive-flow-validator');
const UnsafeRunningContextValidator = require('./validators/unsafe-running-context-validator');

// Phase 2.2: Segment validation support
let SegmentTemplates;
try {
    SegmentTemplates = require('./flow-segment-templates');
} catch (err) {
    // Segment templates not available (optional dependency)
    SegmentTemplates = null;
}

class FlowValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.autoFix = options.autoFix || false;
        this.configPath = options.configPath || null;
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ' }
        });

        this.config = null;
        this.validationRules = this.initializeRules();
        this.issues = [];
        this.warnings = [];
        this.suggestions = [];
    }

    /**
     * Load configuration file
     * @private
     */
    async _loadConfig() {
        if (!this.config) {
            this.config = new FlowValidatorConfig();
            await this.config.load(this.configPath || '.flow-validator.yml');

            if (this.verbose && this.config.loaded) {
                const summary = this.config.getSummary();
                console.log(`  ℹ️  Loaded configuration (${summary.enabledRules}/${summary.totalRules} rules enabled)`);
            }
        }
        return this.config;
    }

    /**
     * Record issue/warning with exception checking
     * @param {Object} violation - Violation details
     * @param {string} type - 'issue', 'warning', or 'suggestion'
     * @private
     */
    _recordViolation(violation, type = 'warning') {
        const ruleName = violation.rule || violation.category;
        const elementName = violation.element;

        // Check if violation is excepted
        if (this.config && this.currentFlowName) {
            if (this.config.isExcepted(this.currentFlowName, ruleName, elementName)) {
                if (this.verbose) {
                    console.log(`  ℹ️  Suppressed (excepted): ${ruleName} in ${elementName || 'flow'}`);
                }
                return;
            }
        }

        // Record violation based on type
        if (type === 'issue' || violation.severity === 'critical') {
            this.issues.push(violation);
        } else if (type === 'warning') {
            this.warnings.push(violation);
        } else if (type === 'suggestion') {
            this.suggestions.push(violation);
        }
    }

    /**
     * Initialize validation rules
     */
    initializeRules() {
        return {
            // Critical rules that cause deployment failures
            critical: [
                {
                    name: 'mutual-exclusion-check',
                    description: 'Ensure sObjectInputReference and inputAssignments are not used together',
                    validate: this.checkMutualExclusion.bind(this)
                },
                {
                    name: 'collection-before-count',
                    description: 'Ensure collections exist before counting operations',
                    validate: this.checkCollectionBeforeCount.bind(this)
                },
                {
                    name: 'dangling-references',
                    description: 'Verify all element references resolve correctly',
                    validate: this.checkDanglingReferences.bind(this)
                },
                {
                    name: 'variable-declarations',
                    description: 'Ensure all referenced variables are declared',
                    validate: this.checkVariableDeclarations.bind(this)
                },
                {
                    name: 'required-elements',
                    description: 'Check for required flow elements',
                    validate: this.checkRequiredElements.bind(this)
                },
                {
                    name: 'unreachable-elements',
                    description: 'Detect elements that are never executed (unreachable from start)',
                    validate: this.checkUnreachableElements.bind(this)
                },
                {
                    name: 'infinite-loops',
                    description: 'Detect loops that may run infinitely',
                    validate: this.checkInfiniteLoops.bind(this)
                }
            ],
            // Best practice rules
            bestPractices: [
                {
                    name: 'naming-conventions',
                    description: 'Check flow and variable naming conventions',
                    validate: this.checkNamingConventions.bind(this)
                },
                {
                    name: 'flow-consolidation',
                    description: 'Check for flow consolidation opportunities',
                    validate: this.checkFlowConsolidation.bind(this)
                },
                {
                    name: 'complexity-score',
                    description: 'Calculate complexity and recommend Apex if needed',
                    validate: this.checkComplexityScore.bind(this)
                },
                {
                    name: 'error-handling',
                    description: 'Ensure proper error handling exists',
                    validate: this.checkErrorHandling.bind(this)
                }
            ],
            // Performance rules
            performance: [
                {
                    name: 'bulk-operations',
                    description: 'Check for bulk-safe operations',
                    validate: this.checkBulkOperations.bind(this)
                },
                {
                    name: 'query-optimization',
                    description: 'Check for optimized queries',
                    validate: this.checkQueryOptimization.bind(this)
                },
                {
                    name: 'loop-efficiency',
                    description: 'Check for efficient loop usage',
                    validate: this.checkLoopEfficiency.bind(this)
                }
            ],
            // Phase 3: Flow Scanner integration rules
            flowScanner: [
                {
                    name: 'UnusedVariable',
                    description: 'Detect variables declared but never used',
                    validate: this.checkUnusedVariables.bind(this)
                },
                {
                    name: 'UnconnectedElement',
                    description: 'Find orphaned Flow elements',
                    validate: this.checkUnconnectedElements.bind(this)
                },
                {
                    name: 'CopyAPIName',
                    description: 'Detect "Copy of..." naming patterns',
                    validate: this.checkCopyAPIName.bind(this)
                },
                {
                    name: 'RecursiveAfterUpdate',
                    description: 'Prevent infinite loops in after-update triggers',
                    validate: this.checkRecursiveAfterUpdate.bind(this)
                },
                {
                    name: 'TriggerOrder',
                    description: 'Enforce trigger order best practices',
                    validate: this.checkTriggerOrder.bind(this)
                },
                {
                    name: 'AutoLayout',
                    description: 'Encourage auto-layout enablement',
                    validate: this.checkAutoLayout.bind(this)
                },
                {
                    name: 'InactiveFlow',
                    description: 'Flag flows that have not been activated',
                    validate: this.checkInactiveFlow.bind(this)
                },
                {
                    name: 'UnsafeRunningContext',
                    description: 'Flag "System Mode without Sharing" usage',
                    validate: this.checkUnsafeRunningContext.bind(this)
                }
            ]
        };
    }

    /**
     * Main validation entry point
     */
    async validateFlow(flowPath) {
        console.log(`\n🔍 Validating Flow: ${path.basename(flowPath)}`);
        console.log('═'.repeat(60));

        try {
            // Load configuration
            await this._loadConfig();

            // Read and parse XML
            const xmlContent = await fs.readFile(flowPath, 'utf8');
            const flowMetadata = await this.parseXML(xmlContent);

            if (!flowMetadata || !flowMetadata.Flow) {
                throw new Error('Invalid flow metadata structure');
            }

            const flow = flowMetadata.Flow;
            const flowName = flow.label?.[0] || path.basename(flowPath, '.flow-meta.xml');

            // Store flow name for exception checking
            this.currentFlowName = flowName;

            // Run all validation rules
            await this.runValidationRules(flow, 'critical');
            await this.runValidationRules(flow, 'bestPractices');
            await this.runValidationRules(flow, 'performance');
            await this.runValidationRules(flow, 'flowScanner');

            // Generate report
            const report = this.generateReport(flowPath);

            // Optionally auto-fix issues
            if (this.autoFix && this.issues.length > 0) {
                await this.attemptAutoFix(flow, flowPath);
            }

            return report;

        } catch (error) {
            console.error(`❌ Validation failed: ${error.message}`);
            return {
                valid: false,
                error: error.message,
                issues: this.issues,
                warnings: this.warnings
            };
        }
    }

    /**
     * Parse XML content
     */
    async parseXML(xmlContent) {
        return new Promise((resolve, reject) => {
            this.parser.parseString(xmlContent, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * Run validation rules by category
     */
    async runValidationRules(flow, category) {
        const rules = this.validationRules[category];

        for (const rule of rules) {
            // Check if rule is enabled in config
            if (!this.config.isRuleEnabled(rule.name)) {
                if (this.verbose) {
                    console.log(`  ⊘ Skipped (disabled): ${rule.description}`);
                }
                continue;
            }

            if (this.verbose) {
                console.log(`  ▸ Running: ${rule.description}`);
            }

            try {
                await rule.validate(flow);
            } catch (error) {
                // Get severity from config (overrides default category severity)
                const configuredSeverity = this.config.getRuleSeverity(rule.name);

                const violation = {
                    rule: rule.name,
                    category: category,
                    message: error.message,
                    severity: configuredSeverity === 'error' ? 'critical' : configuredSeverity
                };

                // Use _recordViolation to apply exception checking
                this._recordViolation(violation, configuredSeverity === 'error' ? 'issue' : 'warning');
            }
        }
    }

    /**
     * Check mutual exclusion rule
     */
    checkMutualExclusion(flow) {
        const recordUpdates = flow.recordUpdates || [];
        const recordCreates = flow.recordCreates || [];
        const allElements = [...recordUpdates, ...recordCreates];
        
        allElements.forEach(element => {
            if (Array.isArray(element)) {
                element.forEach(el => this.validateMutualExclusion(el));
            } else {
                this.validateMutualExclusion(element);
            }
        });
    }

    validateMutualExclusion(element) {
        if (element.inputReference && element.inputAssignments) {
            const issue = {
                element: element.name?.[0] || 'unknown',
                problem: 'Element has both sObjectInputReference and inputAssignments',
                fix: 'Use either sObjectInputReference (for single record) OR inputAssignments (for field-by-field), not both',
                severity: 'critical'
            };
            
            this.issues.push(issue);
            
            // Suggest fix
            this.suggestions.push({
                element: issue.element,
                suggestion: 'Remove inputReference and use only inputAssignments for field-by-field updates'
            });
        }
    }

    /**
     * Check collection before count
     */
    checkCollectionBeforeCount(flow) {
        const assignments = flow.assignments || [];
        const variables = flow.variables || [];
        const recordLookups = flow.recordLookups || [];
        
        // Build variable map
        const variableMap = new Map();
        variables.forEach(v => {
            if (Array.isArray(v)) {
                v.forEach(var_ => variableMap.set(var_.name?.[0], var_));
            } else if (v.name) {
                variableMap.set(v.name[0], v);
            }
        });
        
        // Check assignments that use count
        assignments.forEach(assignment => {
            if (Array.isArray(assignment)) {
                assignment.forEach(a => this.validateCountOperation(a, variableMap, recordLookups));
            } else {
                this.validateCountOperation(assignment, variableMap, recordLookups);
            }
        });
    }

    validateCountOperation(assignment, variableMap, recordLookups) {
        const assignmentItems = assignment.assignmentItems || [];
        
        assignmentItems.forEach(item => {
            if (Array.isArray(item)) {
                item.forEach(i => this.checkCountItem(i, variableMap, recordLookups, assignment.name?.[0]));
            } else {
                this.checkCountItem(item, variableMap, recordLookups, assignment.name?.[0]);
            }
        });
    }

    checkCountItem(item, variableMap, recordLookups, assignmentName) {
        const operator = item.operator?.[0];
        
        if (operator === 'AssignCount') {
            const value = item.value?.elementReference?.[0];
            
            if (value) {
                // Check if this references a collection variable
                const variable = variableMap.get(value);
                const isCollection = variable?.isCollection?.[0] === 'true';
                
                if (!isCollection) {
                    // Check if it's a record lookup that outputs to collection
                    const lookup = recordLookups.find(rl => 
                        (Array.isArray(rl) ? rl[0].name?.[0] : rl.name?.[0]) === value
                    );
                    
                    const storesAll = lookup?.storeOutputAutomatically?.[0] === 'true' && 
                                     lookup?.queriedFields;
                    
                    if (!storesAll) {
                        this.issues.push({
                            element: assignmentName || 'unknown',
                            problem: `Count operation on non-collection: ${value}`,
                            fix: 'Ensure the referenced element outputs to a collection variable',
                            severity: 'critical'
                        });
                        
                        this.suggestions.push({
                            element: assignmentName,
                            suggestion: `Create a collection variable and update the Get Records element to output all records to it`
                        });
                    }
                }
            }
        }
    }

    /**
     * Check for dangling references
     */
    checkDanglingReferences(flow) {
        const allElements = this.getAllElements(flow);
        const elementNames = new Set(allElements.map(e => e.name?.[0]).filter(Boolean));
        
        // Check all connectors
        allElements.forEach(element => {
            const connectors = element.connector || [];
            connectors.forEach(connector => {
                if (Array.isArray(connector)) {
                    connector.forEach(c => this.validateConnector(c, elementNames, element.name?.[0]));
                } else {
                    this.validateConnector(connector, elementNames, element.name?.[0]);
                }
            });
            
            // Check default connector
            if (element.defaultConnector) {
                this.validateConnector(element.defaultConnector[0], elementNames, element.name?.[0]);
            }
        });
    }

    validateConnector(connector, elementNames, sourceName) {
        const target = connector.targetReference?.[0];
        
        if (target && !elementNames.has(target)) {
            this.issues.push({
                element: sourceName || 'unknown',
                problem: `Dangling reference to non-existent element: ${target}`,
                fix: `Create the missing element "${target}" or update the reference`,
                severity: 'critical'
            });
        }
    }

    /**
     * Check variable declarations
     */
    checkVariableDeclarations(flow) {
        const variables = new Set();
        const variableElements = flow.variables || [];
        
        // Collect all declared variables
        variableElements.forEach(v => {
            if (Array.isArray(v)) {
                v.forEach(var_ => variables.add(var_.name?.[0]));
            } else if (v.name) {
                variables.add(v.name[0]);
            }
        });
        
        // Check all variable references
        const allElements = this.getAllElements(flow);
        allElements.forEach(element => {
            this.checkElementVariableReferences(element, variables);
        });
    }

    checkElementVariableReferences(element, declaredVariables) {
        // Check input assignments
        const inputAssignments = element.inputAssignments || [];
        inputAssignments.forEach(assignment => {
            if (Array.isArray(assignment)) {
                assignment.forEach(a => this.validateVariableReference(a, declaredVariables, element.name?.[0]));
            } else {
                this.validateVariableReference(assignment, declaredVariables, element.name?.[0]);
            }
        });
        
        // Check filters
        const filters = element.filters || [];
        filters.forEach(filter => {
            if (Array.isArray(filter)) {
                filter.forEach(f => this.validateFilterVariable(f, declaredVariables, element.name?.[0]));
            } else {
                this.validateFilterVariable(filter, declaredVariables, element.name?.[0]);
            }
        });
    }

    validateVariableReference(assignment, declaredVariables, elementName) {
        const value = assignment.value?.elementReference?.[0];
        
        if (value && !declaredVariables.has(value) && !this.isSystemVariable(value)) {
            this.warnings.push({
                element: elementName || 'unknown',
                problem: `Reference to undeclared variable: ${value}`,
                fix: `Declare variable "${value}" in the variables section`,
                severity: 'warning'
            });
        }
    }

    validateFilterVariable(filter, declaredVariables, elementName) {
        const value = filter.value?.elementReference?.[0];
        
        if (value && !declaredVariables.has(value) && !this.isSystemVariable(value)) {
            this.warnings.push({
                element: elementName || 'unknown',
                problem: `Filter references undeclared variable: ${value}`,
                fix: `Declare variable "${value}" in the variables section`,
                severity: 'warning'
            });
        }
    }

    /**
     * Check required elements
     */
    checkRequiredElements(flow) {
        // Check for start element
        const start = flow.start?.[0];
        if (!start) {
            this.issues.push({
                problem: 'Flow missing start element',
                fix: 'Add a start element to define flow trigger',
                severity: 'critical'
            });
        }
        
        // Check for at least one actionable element
        const hasActions = (flow.recordCreates?.length > 0) ||
                          (flow.recordUpdates?.length > 0) ||
                          (flow.recordDeletes?.length > 0) ||
                          (flow.actionCalls?.length > 0);
        
        if (!hasActions) {
            this.warnings.push({
                problem: 'Flow has no actionable elements',
                fix: 'Add at least one action (create, update, delete, or action call)',
                severity: 'warning'
            });
        }
    }

    /**
     * Check naming conventions
     */
    checkNamingConventions(flow) {
        const apiName = flow.apiName?.[0];
        const label = flow.label?.[0];
        
        // Check flow naming pattern
        if (apiName && !apiName.match(/^[A-Z][a-zA-Z0-9_]*$/)) {
            this.warnings.push({
                problem: `Flow API name doesn't follow naming convention: ${apiName}`,
                fix: 'Use PascalCase without spaces or special characters',
                severity: 'warning'
            });
        }
        
        // Check for consolidation pattern
        if (flow.processType?.[0] === 'AutoLaunchedFlow' && flow.triggerType) {
            const triggerType = flow.triggerType[0];
            const expectedPattern = /_(?:BeforeSave|AfterSave|BeforeDelete|AfterDelete)_Master$/;
            
            if (!apiName?.match(expectedPattern)) {
                this.suggestions.push({
                    suggestion: `Consider naming pattern: [Object]_${triggerType}_Master for consolidation`,
                    current: apiName
                });
            }
        }
    }

    /**
     * Check flow consolidation opportunities
     */
    async checkFlowConsolidation(flow) {
        if (flow.processType?.[0] === 'AutoLaunchedFlow' && flow.start?.[0]?.object) {
            const object = flow.start[0].object[0];
            const triggerType = flow.start[0].recordTriggerType?.[0];
            
            this.suggestions.push({
                suggestion: `Ensure this is the only ${triggerType} flow for ${object}`,
                action: `Run: node scripts/utilities/flow-audit.js --object ${object} --analyze`
            });
        }
    }

    /**
     * Calculate complexity score
     */
    checkComplexityScore(flow) {
        let score = 0;
        const factors = [];
        
        // Count decision branches (+1 each)
        const decisions = flow.decisions?.length || 0;
        score += decisions;
        if (decisions > 0) factors.push(`${decisions} decisions`);
        
        // Count loops (+3 each)
        const loops = flow.loops?.length || 0;
        score += loops * 3;
        if (loops > 0) factors.push(`${loops} loops`);
        
        // Count queries (+1 each)
        const queries = flow.recordLookups?.length || 0;
        score += queries;
        if (queries > 0) factors.push(`${queries} queries`);
        
        // Count cross-object updates (+2 each)
        const updates = flow.recordUpdates?.length || 0;
        const creates = flow.recordCreates?.length || 0;
        score += (updates + creates) * 2;
        if (updates + creates > 0) factors.push(`${updates + creates} DML operations`);
        
        // Count external callouts (+3 each)
        const actionCalls = flow.actionCalls?.filter(a => 
            a.actionType?.[0] === 'apex' || a.actionType?.[0] === 'externalService'
        ).length || 0;
        score += actionCalls * 3;
        if (actionCalls > 0) factors.push(`${actionCalls} external calls`);
        
        // Check collection processing (+2)
        const hasCollections = flow.variables?.some(v => 
            v.isCollection?.[0] === 'true'
        );
        if (hasCollections) {
            score += 2;
            factors.push('collection processing');
        }
        
        // Provide recommendation
        if (score >= 7) {
            this.warnings.push({
                problem: `High complexity score: ${score}`,
                factors: factors.join(', '),
                fix: 'Consider using Apex instead of Flow for better maintainability',
                severity: 'warning'
            });
        } else if (this.verbose) {
            console.log(`  ✓ Complexity score: ${score} (acceptable)`);
        }
        
        return score;
    }

    /**
     * Check error handling
     */
    checkErrorHandling(flow) {
        const hasFaultPath = flow.faultConnector?.length > 0;
        
        if (!hasFaultPath && flow.processType?.[0] === 'AutoLaunchedFlow') {
            this.warnings.push({
                problem: 'No fault handling configured',
                fix: 'Add fault paths to handle errors gracefully',
                severity: 'warning'
            });
        }
    }

    /**
     * Check bulk operations
     */
    checkBulkOperations(flow) {
        const loops = flow.loops || [];
        
        loops.forEach(loop => {
            if (Array.isArray(loop)) {
                loop.forEach(l => this.checkLoopForDML(l, flow));
            } else {
                this.checkLoopForDML(loop, flow);
            }
        });
    }

    checkLoopForDML(loop, flow) {
        const loopName = loop.name?.[0];
        const nextElement = loop.nextValueConnector?.[0]?.targetReference?.[0];
        
        if (nextElement) {
            // Check if next element is DML
            const isDML = this.isDMLElement(nextElement, flow);
            
            if (isDML) {
                this.warnings.push({
                    element: loopName,
                    problem: 'DML operation inside loop detected',
                    fix: 'Move DML outside loop and use collection variables',
                    severity: 'warning'
                });
            }
        }
    }

    isDMLElement(elementName, flow) {
        const element = this.findElement(elementName, flow);
        
        return element && (
            element.recordCreates || 
            element.recordUpdates || 
            element.recordDeletes
        );
    }

    /**
     * Check query optimization
     */
    checkQueryOptimization(flow) {
        const recordLookups = flow.recordLookups || [];
        
        recordLookups.forEach(lookup => {
            if (Array.isArray(lookup)) {
                lookup.forEach(l => this.validateQuery(l));
            } else {
                this.validateQuery(lookup);
            }
        });
    }

    validateQuery(lookup) {
        const filters = lookup.filters || [];
        const hasFilters = filters.length > 0;
        
        if (!hasFilters) {
            this.warnings.push({
                element: lookup.name?.[0],
                problem: 'Query without filters may retrieve too many records',
                fix: 'Add filters to limit records retrieved',
                severity: 'warning'
            });
        }
        
        // Check for indexed fields in filters
        filters.forEach(filter => {
            if (Array.isArray(filter)) {
                filter.forEach(f => this.checkFilterIndexing(f, lookup.name?.[0]));
            } else {
                this.checkFilterIndexing(filter, lookup.name?.[0]);
            }
        });
    }

    checkFilterIndexing(filter, lookupName) {
        const field = filter.field?.[0];
        const nonIndexedFields = ['Description', 'CustomField__c']; // Example
        
        if (nonIndexedFields.includes(field)) {
            this.suggestions.push({
                element: lookupName,
                suggestion: `Consider using indexed field instead of ${field} for better performance`
            });
        }
    }

    /**
     * Check loop efficiency
     */
    checkLoopEfficiency(flow) {
        const loops = flow.loops || [];
        
        loops.forEach(loop => {
            if (Array.isArray(loop)) {
                loop.forEach(l => this.validateLoopEfficiency(l));
            } else {
                this.validateLoopEfficiency(loop);
            }
        });
    }

    validateLoopEfficiency(loop) {
        const collectionReference = loop.collectionReference?.[0];

        if (!collectionReference) {
            this.issues.push({
                element: loop.name?.[0],
                problem: 'Loop without collection reference',
                fix: 'Specify a collection to iterate over',
                severity: 'critical'
            });
        }
    }

    /**
     * Phase 3: Flow Scanner integration validators
     */

    /**
     * Check for unused variables
     */
    checkUnusedVariables(flow) {
        const validator = new UnusedVariableValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check for unconnected elements
     */
    checkUnconnectedElements(flow) {
        const validator = new UnconnectedElementValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check for copy-style API names
     */
    checkCopyAPIName(flow) {
        const validator = new CopyAPINameValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' :
                        violation.severity === 'note' ? 'suggestion' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check for recursive after-update patterns
     */
    checkRecursiveAfterUpdate(flow) {
        const validator = new RecursiveAfterUpdateValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' :
                        violation.severity === 'note' ? 'suggestion' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check trigger order settings
     */
    checkTriggerOrder(flow) {
        const validator = new TriggerOrderValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' :
                        violation.severity === 'note' ? 'suggestion' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check auto-layout settings
     */
    checkAutoLayout(flow) {
        const validator = new AutoLayoutValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' :
                        violation.severity === 'note' ? 'suggestion' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check for inactive flows
     */
    checkInactiveFlow(flow) {
        const validator = new InactiveFlowValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' :
                        violation.severity === 'note' ? 'suggestion' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Check for unsafe running context
     */
    checkUnsafeRunningContext(flow) {
        const validator = new UnsafeRunningContextValidator({ verbose: this.verbose });
        const violations = validator.validate(flow);

        violations.forEach(violation => {
            const type = violation.severity === 'error' ? 'issue' :
                        violation.severity === 'note' ? 'suggestion' : 'warning';
            this._recordViolation(violation, type);
        });
    }

    /**
     * Helper: Get all flow elements
     */
    getAllElements(flow) {
        const elements = [];
        
        const elementTypes = [
            'actionCalls', 'assignments', 'decisions', 'loops',
            'recordCreates', 'recordDeletes', 'recordLookups', 
            'recordUpdates', 'screens', 'subflows', 'waits'
        ];
        
        elementTypes.forEach(type => {
            if (flow[type]) {
                if (Array.isArray(flow[type])) {
                    elements.push(...flow[type]);
                } else {
                    elements.push(flow[type]);
                }
            }
        });
        
        return elements;
    }

    /**
     * Helper: Find element by name
     */
    findElement(name, flow) {
        const allElements = this.getAllElements(flow);
        return allElements.find((e) => this._normalizeValue(e.name) === name);
    }

    /**
     * Helper: Check if variable is system variable
     */
    isSystemVariable(name) {
        const systemVars = [
            '$Record', '$Record__Prior', '$Flow', '$User', 
            '$Organization', '$System', '$Label', '$Permission'
        ];
        
        return systemVars.some(sv => name?.startsWith(sv));
    }

    /**
     * Export validation results as SARIF 2.1.0 format
     * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
     * @returns {Object} SARIF-formatted report
     */
    exportSarif(flowPath) {
        const hasErrors = this.issues.filter(i => i.severity === 'critical').length > 0;

        // Build SARIF results array from issues, warnings, and suggestions
        const results = [];

        // Map critical issues to SARIF results (level: error)
        this.issues.filter(i => i.severity === 'critical').forEach(issue => {
            results.push(this._issuesToSarifResult(issue, 'error', flowPath));
        });

        // Map warnings to SARIF results (level: warning)
        this.warnings.forEach(warning => {
            results.push(this._issuesToSarifResult(warning, 'warning', flowPath));
        });

        // Map suggestions to SARIF results (level: note)
        this.suggestions.forEach(suggestion => {
            results.push(this._suggestionToSarifResult(suggestion, flowPath));
        });

        // Build SARIF document
        const sarif = {
            version: '2.1.0',
            $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
            runs: [{
                tool: {
                    driver: {
                        name: 'Salesforce Flow Validator',
                        version: '1.0.0',
                        informationUri: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace',
                        rules: this._buildSarifRules()
                    }
                },
                results: results,
                invocations: [{
                    executionSuccessful: !hasErrors,
                    endTimeUtc: new Date().toISOString()
                }]
            }]
        };

        return sarif;
    }

    /**
     * Convert issue/warning to SARIF result
     * @private
     */
    _issuesToSarifResult(issue, level, flowPath) {
        const ruleId = issue.rule || issue.category || 'unknown-rule';

        return {
            ruleId: ruleId,
            level: level,
            message: {
                text: issue.problem || issue.message || 'Unknown issue'
            },
            locations: [{
                physicalLocation: {
                    artifactLocation: {
                        uri: flowPath,
                        uriBaseId: '%SRCROOT%'
                    },
                    region: {
                        startLine: 1  // Flow XML doesn't have line-level granularity
                    }
                },
                logicalLocations: issue.element ? [{
                    name: issue.element,
                    kind: 'element'
                }] : undefined
            }],
            fixes: (issue.fix || issue.recommendation) ? [{
                description: {
                    text: issue.fix || issue.recommendation
                }
            }] : undefined
        };
    }

    /**
     * Convert suggestion to SARIF result
     * @private
     */
    _suggestionToSarifResult(suggestion, flowPath) {
        return {
            ruleId: 'suggestion',
            level: 'note',
            message: {
                text: suggestion.suggestion || suggestion.message || 'Suggestion'
            },
            locations: [{
                physicalLocation: {
                    artifactLocation: {
                        uri: flowPath,
                        uriBaseId: '%SRCROOT%'
                    },
                    region: {
                        startLine: 1
                    }
                },
                logicalLocations: suggestion.element ? [{
                    name: suggestion.element,
                    kind: 'element'
                }] : undefined
            }]
        };
    }

    /**
     * Build SARIF rules array from validation rules
     * @private
     */
    _buildSarifRules() {
        const rules = [];

        // Add critical rules
        this.validationRules.critical.forEach(rule => {
            rules.push({
                id: rule.name,
                name: rule.name,
                shortDescription: {
                    text: rule.description
                },
                fullDescription: {
                    text: rule.description
                },
                defaultConfiguration: {
                    level: 'error'
                },
                properties: {
                    category: 'critical',
                    tags: ['deployment-blocker', 'critical']
                }
            });
        });

        // Add best practice rules
        this.validationRules.bestPractices.forEach(rule => {
            rules.push({
                id: rule.name,
                name: rule.name,
                shortDescription: {
                    text: rule.description
                },
                fullDescription: {
                    text: rule.description
                },
                defaultConfiguration: {
                    level: 'warning'
                },
                properties: {
                    category: 'best-practices',
                    tags: ['maintainability', 'best-practice']
                }
            });
        });

        // Add performance rules
        this.validationRules.performance.forEach(rule => {
            rules.push({
                id: rule.name,
                name: rule.name,
                shortDescription: {
                    text: rule.description
                },
                fullDescription: {
                    text: rule.description
                },
                defaultConfiguration: {
                    level: 'warning'
                },
                properties: {
                    category: 'performance',
                    tags: ['performance', 'optimization']
                }
            });
        });

        // Add suggestion rule
        rules.push({
            id: 'suggestion',
            name: 'suggestion',
            shortDescription: {
                text: 'Suggestion for improvement'
            },
            fullDescription: {
                text: 'Suggestions for code quality and maintainability improvements'
            },
            defaultConfiguration: {
                level: 'note'
            },
            properties: {
                category: 'suggestion',
                tags: ['suggestion', 'improvement']
            }
        });

        return rules;
    }

    /**
     * Generate validation report
     */
    generateReport(flowPath) {
        const hasErrors = this.issues.filter(i => i.severity === 'critical').length > 0;
        const report = {
            valid: !hasErrors,
            file: flowPath,
            timestamp: new Date().toISOString(),
            summary: {
                errors: this.issues.filter(i => i.severity === 'critical').length,
                warnings: this.warnings.length,
                suggestions: this.suggestions.length
            },
            issues: this.issues,
            warnings: this.warnings,
            suggestions: this.suggestions
        };

        // Console output
        console.log('\n📋 VALIDATION REPORT');
        console.log('─'.repeat(60));
        
        if (report.summary.errors > 0) {
            console.log(`\n❌ ERRORS (${report.summary.errors}):`);
            this.issues.filter(i => i.severity === 'critical').forEach((issue, idx) => {
                const message = issue.problem || issue.message || 'Unknown error';
                const fix = issue.fix || issue.recommendation || 'No fix available';
                console.log(`\n  ${idx + 1}. ${message}`);
                if (issue.element) console.log(`     Element: ${issue.element}`);
                console.log(`     Fix: ${fix}`);
            });
        }

        if (report.summary.warnings > 0) {
            console.log(`\n⚠️  WARNINGS (${report.summary.warnings}):`);
            this.warnings.forEach((warning, idx) => {
                const message = warning.problem || warning.message || 'Unknown warning';
                const fix = warning.fix || warning.recommendation || 'No fix available';
                console.log(`\n  ${idx + 1}. ${message}`);
                if (warning.element) console.log(`     Element: ${warning.element}`);
                console.log(`     Fix: ${fix}`);
            });
        }

        if (report.summary.suggestions > 0) {
            console.log(`\n💡 SUGGESTIONS (${report.summary.suggestions}):`);
            this.suggestions.forEach((suggestion, idx) => {
                const message = suggestion.suggestion || suggestion.message || 'Suggestion';
                const fix = suggestion.recommendation || 'No recommendation';
                console.log(`\n  ${idx + 1}. ${message}`);
                if (suggestion.element) console.log(`     Element: ${suggestion.element}`);
                if (suggestion.action) console.log(`     Action: ${suggestion.action}`);
                if (!suggestion.action && !suggestion.suggestion) console.log(`     Recommendation: ${fix}`);
            });
        }
        
        console.log('\n' + '─'.repeat(60));
        
        if (hasErrors) {
            console.log('❌ Validation FAILED - Fix critical errors before deployment');
        } else if (report.summary.warnings > 0) {
            console.log('⚠️  Validation PASSED with warnings - Review before deployment');
        } else {
            console.log('✅ Validation PASSED - Flow is ready for deployment');
        }
        
        console.log('═'.repeat(60) + '\n');
        
        return report;
    }

    /**
     * Attempt to auto-fix issues using FlowAutoFixer
     */
    async attemptAutoFix(flow, flowPath) {
        const fixer = new FlowAutoFixer({
            verbose: this.verbose,
            dryRun: false
        });

        // Collect all issues for the auto-fixer
        const allIssues = [
            ...this.issues,
            ...this.warnings,
            ...this.suggestions
        ];

        const result = await fixer.applyFixes(flowPath, allIssues);

        if (result.error) {
            console.error(`\n❌ Auto-fix failed: ${result.error}`);
            return result;
        }

        if (result.fixed > 0) {
            console.log(`\n✅ Auto-fix applied ${result.fixed} fix(es)`);

            if (result.skipped > 0) {
                console.log(`⚠️  Skipped ${result.skipped} issue(s) (manual intervention required)`);
            }
        } else {
            console.log('\n  ℹ️  No auto-fixable issues found');
        }

        return result;
    }

    /**
     * Validate segment-specific rules (Phase 2.2)
     * @param {Object} flow - Parsed flow object
     * @param {Object} segmentMetadata - Segment metadata from SegmentManager
     * @returns {Object} Segment validation result
     */
    async validateSegment(flow, segmentMetadata) {
        if (!SegmentTemplates) {
            return {
                valid: true,
                warnings: ['Segment templates not available - skipping segment validation']
            };
        }

        const templates = new SegmentTemplates();
        const template = templates.getTemplate(segmentMetadata.type);

        if (!template) {
            return {
                valid: true,
                warnings: [`No template found for segment type: ${segmentMetadata.type}`]
            };
        }

        const result = {
            valid: true,
            errors: [],
            warnings: [],
            info: []
        };

        const rules = template.validationRules;
        const elements = segmentMetadata.elements || [];

        // Count element types in segment
        const elementCounts = this._countSegmentElements(flow, elements);

        // Validate against template rules
        if (rules.maxDecisions && elementCounts.decisions > rules.maxDecisions) {
            result.errors.push({
                rule: 'max-decisions',
                message: `Segment has ${elementCounts.decisions} decisions, exceeds maximum of ${rules.maxDecisions}`,
                severity: 'error'
            });
            result.valid = false;
        }

        if (rules.maxRecordLookups && elementCounts.recordLookups > rules.maxRecordLookups) {
            result.errors.push({
                rule: 'max-record-lookups',
                message: `Segment has ${elementCounts.recordLookups} record lookups, exceeds maximum of ${rules.maxRecordLookups}`,
                severity: 'error'
            });
            result.valid = false;
        }

        if (rules.maxLoops && elementCounts.loops > rules.maxLoops) {
            result.errors.push({
                rule: 'max-loops',
                message: `Segment has ${elementCounts.loops} loops, exceeds maximum of ${rules.maxLoops}`,
                severity: 'error'
            });
            result.valid = false;
        }

        // Check for DML in loops (CRITICAL anti-pattern)
        if (rules.allowsDMLInLoop === false && elementCounts.loops > 0) {
            const dmlInLoop = this._checkDMLInLoops(flow, elements);
            if (dmlInLoop.found) {
                result.errors.push({
                    rule: 'no-dml-in-loops',
                    message: 'CRITICAL: DML operations found inside loops',
                    details: dmlInLoop.violations,
                    severity: 'critical'
                });
                result.valid = false;
            }
        }

        // Check for SOQL in loops (CRITICAL anti-pattern)
        if (rules.allowsSOQLInLoop === false && elementCounts.loops > 0) {
            const soqlInLoop = this._checkSOQLInLoops(flow, elements);
            if (soqlInLoop.found) {
                result.errors.push({
                    rule: 'no-soql-in-loops',
                    message: 'CRITICAL: SOQL queries found inside loops',
                    details: soqlInLoop.violations,
                    severity: 'critical'
                });
                result.valid = false;
            }
        }

        // Check fault paths requirement
        if (rules.requiresFaultPaths) {
            const missingFaultPaths = this._checkFaultPaths(flow, elements);
            if (missingFaultPaths.length > 0) {
                result.warnings.push({
                    rule: 'requires-fault-paths',
                    message: 'Segment elements missing fault paths',
                    details: missingFaultPaths,
                    severity: 'warning'
                });
            }
        }

        // Check segment isolation (no cross-segment variable pollution)
        const isolationIssues = this._checkSegmentIsolation(flow, segmentMetadata);
        if (isolationIssues.length > 0) {
            result.warnings.push({
                rule: 'segment-isolation',
                message: 'Potential cross-segment variable pollution detected',
                details: isolationIssues,
                severity: 'warning'
            });
        }

        // Check connector paths between segments
        if (rules.requiresConnectorPaths) {
            const connectorIssues = this._checkSegmentConnectors(flow, segmentMetadata);
            if (connectorIssues.length > 0) {
                result.errors.push({
                    rule: 'requires-connector-paths',
                    message: 'Segment has incomplete connector paths',
                    details: connectorIssues,
                    severity: 'error'
                });
                result.valid = false;
            }
        }

        return result;
    }

    /**
     * Count element types in a segment
     * @param {Object} flow - Flow object
     * @param {Array<string>} elementNames - Element names in segment
     * @returns {Object} Element counts
     * @private
     */
    _countSegmentElements(flow, elementNames) {
        const counts = {
            decisions: 0,
            loops: 0,
            recordLookups: 0,
            recordUpdates: 0,
            recordCreates: 0,
            recordDeletes: 0,
            assignments: 0,
            actions: 0
        };

        for (const elementName of elementNames) {
            const element = this.findElement(elementName, flow);
            if (!element) continue;

            // Detect element type from flow structure
            if (flow.decisions && this._isInArray(flow.decisions, elementName)) counts.decisions++;
            if (flow.loops && this._isInArray(flow.loops, elementName)) counts.loops++;
            if (flow.recordLookups && this._isInArray(flow.recordLookups, elementName)) counts.recordLookups++;
            if (flow.recordUpdates && this._isInArray(flow.recordUpdates, elementName)) counts.recordUpdates++;
            if (flow.recordCreates && this._isInArray(flow.recordCreates, elementName)) counts.recordCreates++;
            if (flow.recordDeletes && this._isInArray(flow.recordDeletes, elementName)) counts.recordDeletes++;
            if (flow.assignments && this._isInArray(flow.assignments, elementName)) counts.assignments++;
            if (flow.actionCalls && this._isInArray(flow.actionCalls, elementName)) counts.actions++;
        }

        return counts;
    }

    /**
     * Check if element name is in flow array
     * @param {Array|Object} flowArray - Flow element array
     * @param {string} elementName - Element name to find
     * @returns {boolean} True if found
     * @private
     */
    _isInArray(flowArray, elementName) {
        const arr = Array.isArray(flowArray) ? flowArray : [flowArray];
        return arr.some((el) => this._normalizeValue(el.name) === elementName);
    }

    /**
     * Check for DML operations inside loops
     * @param {Object} flow - Flow object
     * @param {Array<string>} segmentElements - Elements in segment
     * @returns {Object} Violation details
     * @private
     */
    _checkDMLInLoops(flow, segmentElements) {
        const violations = [];
        const loops = Array.isArray(flow.loops) ? flow.loops : (flow.loops ? [flow.loops] : []);

        for (const loop of loops) {
            if (!segmentElements.includes(loop.name)) continue;

            // Check if any DML operations reference this loop
            const dmlTypes = ['recordUpdates', 'recordCreates', 'recordDeletes'];
            for (const dmlType of dmlTypes) {
                if (!flow[dmlType]) continue;

                const dmlOps = Array.isArray(flow[dmlType]) ? flow[dmlType] : [flow[dmlType]];
                for (const dml of dmlOps) {
                    // Check if DML is within loop (simplified check)
                    if (this._isWithinLoop(loop, dml, flow)) {
                        violations.push({
                            loop: loop.name,
                            dmlOperation: dml.name,
                            type: dmlType
                        });
                    }
                }
            }
        }

        return {
            found: violations.length > 0,
            violations
        };
    }

    /**
     * Check for SOQL queries inside loops
     * @param {Object} flow - Flow object
     * @param {Array<string>} segmentElements - Elements in segment
     * @returns {Object} Violation details
     * @private
     */
    _checkSOQLInLoops(flow, segmentElements) {
        const violations = [];
        const loops = Array.isArray(flow.loops) ? flow.loops : (flow.loops ? [flow.loops] : []);

        for (const loop of loops) {
            if (!segmentElements.includes(loop.name)) continue;

            if (!flow.recordLookups) continue;

            const lookups = Array.isArray(flow.recordLookups) ? flow.recordLookups : [flow.recordLookups];
            for (const lookup of lookups) {
                if (this._isWithinLoop(loop, lookup, flow)) {
                    violations.push({
                        loop: loop.name,
                        query: lookup.name
                    });
                }
            }
        }

        return {
            found: violations.length > 0,
            violations
        };
    }

    /**
     * Check if element is within a loop
     * @param {Object} loop - Loop element
     * @param {Object} element - Element to check
     * @param {Object} flow - Full flow object
     * @returns {boolean} True if within loop
     * @private
     */
    _isWithinLoop(loop, element, flow) {
        // Simplified check - in a real implementation, would traverse connector paths
        // For now, check if element's connector references the loop
        if (element.connector && element.connector.targetReference) {
            // Check if this element is reachable from loop
            return this._isReachableFrom(loop.name, element.name, flow);
        }
        return false;
    }

    /**
     * Check if target is reachable from source using BFS
     * Detects cycles and unreachable elements
     * @param {string} source - Source element name
     * @param {string} target - Target element name
     * @param {Object} flow - Flow object
     * @returns {boolean} True if reachable
     * @private
     */
    _isReachableFrom(source, target, flow) {
        const visited = new Set();
        const queue = [source];

        while (queue.length > 0) {
            const current = queue.shift();

            // Found target - reachable
            if (current === target) {
                return true;
            }

            // Already visited - skip to prevent infinite loop
            if (visited.has(current)) {
                continue;
            }
            visited.add(current);

            // Get all connections from current element
            const connections = this._getElementConnections(current, flow);

            for (const conn of connections) {
                if (!visited.has(conn.targetReference)) {
                    queue.push(conn.targetReference);
                }
            }
        }

        return false;
    }

    /**
     * Get all outgoing connections from an element
     * @param {string} elementName - Element name
     * @param {Object} flow - Flow object
     * @returns {Array<Object>} Array of connections with type and target
     * @private
     */
    _getElementConnections(elementName, flow) {
        const connections = [];
        const element = this._findElement(elementName, flow);

        if (!element) return connections;

        // Collect all connector fields
        const connectorFields = [
            'connector', 'defaultConnector', 'faultConnector',
            'nextValueConnector', 'noMoreValuesConnector'
        ];

        for (const field of connectorFields) {
            const connectors = Array.isArray(element[field]) ? element[field] : [element[field]];
            for (const connector of connectors) {
                const targetReference = this._extractTargetReference(connector);
                if (!targetReference) continue;
                connections.push({
                    type: field,
                    targetReference
                });
            }
        }

        // Handle decision outcomes
        if (element.rules) {
            const rules = Array.isArray(element.rules) ? element.rules : [element.rules];
            for (const rule of rules) {
                const targetReference = this._extractTargetReference(rule.connector);
                if (targetReference) {
                    connections.push({
                        type: 'ruleConnector',
                        targetReference,
                        label: this._normalizeValue(rule.label)
                    });
                }
            }
        }

        return connections;
    }

    /**
     * Find element by name in flow
     * @param {string} name - Element name
     * @param {Object} flow - Flow object
     * @returns {Object|null} Element or null if not found
     * @private
     */
    _findElement(name, flow) {
        const elementTypes = [
            'decisions', 'assignments', 'recordLookups', 'recordCreates',
            'recordUpdates', 'recordDeletes', 'loops', 'actionCalls',
            'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            const found = elements.find((el) => this._normalizeValue(el.name) === name);
            if (found) return found;
        }

        return null;
    }

    /**
     * Detect unreachable elements (never executed)
     * @param {Object} flow - Flow object
     * @returns {Array<Object>} Array of unreachable element issues
     * @private
     */
    _detectUnreachableElements(flow) {
        const issues = [];
        const startElement = flow.start?.connector?.targetReference;

        if (!startElement) {
            return issues; // No start element
        }

        // BFS from start to find all reachable elements
        const reachable = new Set();
        const queue = [startElement];
        const visited = new Set();

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;

            visited.add(current);
            reachable.add(current);

            const connections = this._getElementConnections(current, flow);
            for (const conn of connections) {
                queue.push(conn.targetReference);
            }
        }

        // Check all elements against reachable set
        const allElements = this._getAllElementNames(flow);
        for (const elementName of allElements) {
            if (!reachable.has(elementName)) {
                issues.push({
                    type: 'UNREACHABLE_ELEMENT',
                    element: elementName,
                    severity: 'warning',
                    message: `Element "${elementName}" is never executed (unreachable from start)`
                });
            }
        }

        return issues;
    }

    /**
     * Get all element names in flow
     * @param {Object} flow - Flow object
     * @returns {Array<string>} Array of element names
     * @private
     */
    _getAllElementNames(flow) {
        const names = [];
        const elementTypes = [
            'decisions', 'assignments', 'recordLookups', 'recordCreates',
            'recordUpdates', 'recordDeletes', 'loops', 'actionCalls',
            'screens', 'subflows', 'waits'
        ];

        for (const type of elementTypes) {
            if (!flow[type]) continue;

            const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
            for (const element of elements) {
                const name = this._normalizeValue(element.name);
                if (name) {
                    names.push(name);
                }
            }
        }

        return names;
    }

    /**
     * Detect infinite loops
     * @param {Object} flow - Flow object
     * @returns {Array<Object>} Array of infinite loop issues
     * @private
     */
    _detectInfiniteLoops(flow) {
        const issues = [];
        const loops = this._getLoopElements(flow);

        for (const loop of loops) {
            // Check if loop has exit condition
            const hasBreak = this._loopHasBreakCondition(loop, flow);

            if (!hasBreak) {
                issues.push({
                    type: 'INFINITE_LOOP_RISK',
                    element: loop.name,
                    severity: 'error',
                    message: `Loop "${loop.name}" may run infinitely - no break condition found`
                });
            }

            // Check if loop increments counter/variable
            const hasIncrement = this._loopHasIncrement(loop, flow);

            if (!hasIncrement) {
                issues.push({
                    type: 'LOOP_WITHOUT_INCREMENT',
                    element: loop.name,
                    severity: 'warning',
                    message: `Loop "${loop.name}" doesn't increment loop variable - may cause issues`
                });
            }
        }

        return issues;
    }

    /**
     * Get loop elements from flow
     * @param {Object} flow - Flow object
     * @returns {Array<Object>} Array of loop elements
     * @private
     */
    _getLoopElements(flow) {
        if (!flow.loops) return [];
        return Array.isArray(flow.loops) ? flow.loops : [flow.loops];
    }

    /**
     * Check if loop has break condition
     * @param {Object} loop - Loop element
     * @param {Object} flow - Flow object
     * @returns {boolean} True if has break condition
     * @private
     */
    _loopHasBreakCondition(loop, flow) {
        // Check if noMoreValuesConnector leads outside the loop
        if (loop.noMoreValuesConnector && loop.noMoreValuesConnector.targetReference) {
            const target = loop.noMoreValuesConnector.targetReference;
            // Check if target is outside the loop (not reachable from nextValueConnector back to loop)
            if (loop.nextValueConnector && loop.nextValueConnector.targetReference) {
                const loopBody = loop.nextValueConnector.targetReference;
                // If noMoreValuesConnector target is NOT reachable from loop body back to loop start, it's an exit
                return !this._isReachableFrom(target, loop.name, flow);
            }
            return true; // Has an exit connector
        }
        return false;
    }

    /**
     * Check if loop has increment
     * @param {Object} loop - Loop element
     * @param {Object} flow - Flow object
     * @returns {boolean} True if has increment
     * @private
     */
    _loopHasIncrement(loop, flow) {
        // Check if loop body contains an assignment that modifies loop collection variable
        if (!loop.nextValueConnector || !loop.nextValueConnector.targetReference) {
            return false;
        }

        const loopBody = loop.nextValueConnector.targetReference;
        const collectionVariable = loop.collectionReference;

        // Traverse loop body looking for assignments
        const visited = new Set();
        const queue = [loopBody];

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);

            const element = this._findElement(current, flow);
            if (!element) continue;

            // Check if this is an assignment that modifies collection
            if (element.assignmentItems) {
                const items = Array.isArray(element.assignmentItems) ? element.assignmentItems : [element.assignmentItems];
                for (const item of items) {
                    if (item.assignToReference === collectionVariable) {
                        return true; // Found increment
                    }
                }
            }

            // Continue traversing
            const connections = this._getElementConnections(current, flow);
            for (const conn of connections) {
                // Don't follow back to loop start
                if (conn.targetReference !== loop.name) {
                    queue.push(conn.targetReference);
                }
            }
        }

        return false; // No increment found
    }

    /**
     * Check for unreachable elements (public wrapper for validation rule)
     * @param {Object} flow - Flow object
     */
    checkUnreachableElements(flow) {
        const issues = this._detectUnreachableElements(flow);

        for (const issue of issues) {
            if (issue.severity === 'error') {
                this.issues.push({
                    element: issue.element,
                    problem: issue.message,
                    fix: 'Remove unreachable element or add connector path from reachable elements',
                    severity: 'warning'
                });
            } else {
                this.warnings.push({
                    element: issue.element,
                    message: issue.message,
                    severity: issue.severity
                });
            }
        }
    }

    /**
     * Check for infinite loops (public wrapper for validation rule)
     * @param {Object} flow - Flow object
     */
    checkInfiniteLoops(flow) {
        const issues = this._detectInfiniteLoops(flow);

        for (const issue of issues) {
            if (issue.severity === 'error') {
                this.issues.push({
                    element: issue.element,
                    problem: issue.message,
                    fix: 'Add noMoreValuesConnector or break condition to exit loop',
                    severity: 'critical'
                });
            } else {
                this.warnings.push({
                    element: issue.element,
                    message: issue.message,
                    severity: issue.severity
                });
            }
        }
    }

    /**
     * Check fault paths on elements
     * @param {Object} flow - Flow object
     * @param {Array<string>} segmentElements - Elements in segment
     * @returns {Array<string>} Elements missing fault paths
     * @private
     */
    _checkFaultPaths(flow, segmentElements) {
        const missing = [];
        const requireFaultPaths = ['recordLookups', 'recordUpdates', 'recordCreates', 'recordDeletes'];
        const segmentSet = new Set((segmentElements || []).map((name) => this._normalizeValue(name) || name));

        for (const elementType of requireFaultPaths) {
            if (!flow[elementType]) continue;

            const elements = Array.isArray(flow[elementType]) ? flow[elementType] : [flow[elementType]];
            for (const element of elements) {
                const name = this._normalizeValue(element.name);
                const faultTarget = this._extractTargetReference(element.faultConnector);
                if (name && segmentSet.has(name) && !faultTarget) {
                    missing.push(name);
                }
            }
        }

        return missing;
    }

    /**
     * Check segment isolation
     * @param {Object} flow - Flow object
     * @param {Object} segmentMetadata - Segment metadata
     * @returns {Array<Object>} Isolation issues
     * @private
     */
    _checkSegmentIsolation(flow, segmentMetadata) {
        const issues = [];
        const segmentName = this._normalizeValue(segmentMetadata?.name) || 'segment';
        const segmentElements = Array.isArray(segmentMetadata?.elements) ? segmentMetadata.elements : [];
        const segmentSet = new Set(segmentElements.map((name) => this._normalizeValue(name) || name));

        if (segmentSet.size === 0) {
            return issues;
        }

        const variableDefs = Array.isArray(flow.variables) ? flow.variables : (flow.variables ? [flow.variables] : []);
        const variableMap = new Map();

        for (const variable of variableDefs) {
            const variableName = this._normalizeValue(variable.name);
            if (variableName) {
                variableMap.set(variableName, variable);
            }
        }

        const normalizedPrefix = segmentName
            .replace(/[^A-Za-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();
        const issueSignatures = new Set();

        const recordIssue = (type, elementName, variable, message) => {
            const signature = `${type}|${elementName}|${variable}`;
            if (issueSignatures.has(signature)) return;
            issueSignatures.add(signature);
            issues.push({
                type,
                segment: segmentName,
                element: elementName,
                variable,
                message
            });
        };

        for (const elementName of segmentSet) {
            const element = this._findElement(elementName, flow);
            if (!element) continue;

            const normalizedElementName = this._normalizeValue(element.name) || elementName;

            const assignmentItems = Array.isArray(element.assignmentItems)
                ? element.assignmentItems
                : (element.assignmentItems ? [element.assignmentItems] : []);

            for (const item of assignmentItems) {
                const variableRef = this._normalizeVariableReference(item.assignToReference);
                if (!variableRef || this.isSystemVariable(variableRef)) continue;

                const variableDef = variableMap.get(variableRef);
                if (!variableDef) continue;

                const explicitlyShared = this._normalizeBoolean(variableDef.isInput) ||
                    this._normalizeBoolean(variableDef.isOutput);
                const namespaced = normalizedPrefix &&
                    variableRef.toLowerCase().startsWith(`${normalizedPrefix}_`);

                if (!explicitlyShared && !namespaced) {
                    recordIssue(
                        'non-namespaced-variable-write',
                        normalizedElementName,
                        variableRef,
                        `Segment writes to "${variableRef}" without explicit input/output scoping`
                    );
                }
            }

            for (const ref of this._extractVariableReferencesFromElement(element)) {
                if (!ref || this.isSystemVariable(ref)) continue;

                const variableDef = variableMap.get(ref);
                if (!variableDef) continue;

                const explicitlyShared = this._normalizeBoolean(variableDef.isInput) ||
                    this._normalizeBoolean(variableDef.isOutput);
                const namespaced = normalizedPrefix &&
                    ref.toLowerCase().startsWith(`${normalizedPrefix}_`);

                if (!explicitlyShared && !namespaced) {
                    recordIssue(
                        'non-namespaced-variable-read',
                        normalizedElementName,
                        ref,
                        `Segment reads "${ref}" without explicit input/output scoping`
                    );
                }
            }
        }

        return issues;
    }

    /**
     * Check connector paths between segments
     * @param {Object} flow - Flow object
     * @param {Object} segmentMetadata - Segment metadata
     * @returns {Array<Object>} Connector issues
     * @private
     */
    _checkSegmentConnectors(flow, segmentMetadata) {
        const issues = [];
        const segmentElements = Array.isArray(segmentMetadata?.elements) ? segmentMetadata.elements : [];
        const normalizedSegmentElements = segmentElements
            .map((name) => this._normalizeValue(name) || name)
            .filter(Boolean);
        const segmentSet = new Set(normalizedSegmentElements);

        if (segmentSet.size === 0) {
            return issues;
        }

        const allElementNames = this._getAllElementNames(flow);
        const allElementSet = new Set(allElementNames);
        const inboundSources = new Map();

        const addInboundSource = (target, source) => {
            if (!target) return;
            if (!inboundSources.has(target)) inboundSources.set(target, new Set());
            inboundSources.get(target).add(source);
        };

        const flowStart = this._extractTargetReference(flow.start?.connector || flow.start?.[0]?.connector);
        if (flowStart) {
            addInboundSource(flowStart, '__flow_start__');
        }

        for (const sourceName of allElementNames) {
            const connections = this._getElementConnections(sourceName, flow);
            for (const connection of connections) {
                const target = this._normalizeValue(connection.targetReference);
                addInboundSource(target, sourceName);
            }
        }

        const exitPaths = [];

        for (const elementName of normalizedSegmentElements) {
            if (!allElementSet.has(elementName)) {
                issues.push({
                    type: 'missing-segment-element',
                    element: elementName,
                    message: `Segment references unknown element "${elementName}"`
                });
                continue;
            }

            const connections = this._getElementConnections(elementName, flow);
            for (const connection of connections) {
                const target = this._normalizeValue(connection.targetReference);
                if (!target) continue;

                if (!allElementSet.has(target)) {
                    issues.push({
                        type: 'dangling-connector',
                        element: elementName,
                        target,
                        connectorType: connection.type,
                        message: `Connector from "${elementName}" points to missing element "${target}"`
                    });
                    continue;
                }

                if (!segmentSet.has(target)) {
                    exitPaths.push({
                        from: elementName,
                        to: target,
                        connectorType: connection.type
                    });
                }
            }

            const inbound = inboundSources.get(elementName) || new Set();
            const hasInbound = inbound.size > 0;
            const hasCrossSegmentEntry = [...inbound].some((source) => source === '__flow_start__' || !segmentSet.has(source));

            if (!hasInbound && elementName !== flowStart) {
                issues.push({
                    type: 'orphan-segment-element',
                    element: elementName,
                    message: `Segment element "${elementName}" has no inbound connector`
                });
            }

            if (connections.length === 0 && !hasCrossSegmentEntry) {
                issues.push({
                    type: 'dead-end-segment-element',
                    element: elementName,
                    message: `Segment element "${elementName}" has no outgoing connector path`
                });
            }
        }

        const entryPoints = normalizedSegmentElements.filter((elementName) => {
            const inbound = inboundSources.get(elementName) || new Set();
            return [...inbound].some((source) => source === '__flow_start__' || !segmentSet.has(source));
        });

        if (entryPoints.length === 0) {
            issues.push({
                type: 'missing-segment-entry',
                segment: this._normalizeValue(segmentMetadata?.name) || 'segment',
                message: 'Segment has no entry connector from flow start or another segment'
            });
        }

        if (exitPaths.length === 0) {
            issues.push({
                type: 'missing-segment-exit',
                segment: this._normalizeValue(segmentMetadata?.name) || 'segment',
                message: 'Segment has no connector path that exits to another segment'
            });
        }

        return issues;
    }

    /**
     * Normalize xml2js scalar values to strings
     * @param {*} value - Raw value
     * @returns {string|null} Normalized value
     * @private
     */
    _normalizeValue(value) {
        if (Array.isArray(value)) {
            return this._normalizeValue(value[0]);
        }

        if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '_')) {
            return this._normalizeValue(value._);
        }

        if (value === undefined || value === null) {
            return null;
        }

        const normalized = String(value).trim();
        return normalized.length > 0 ? normalized : null;
    }

    /**
     * Normalize boolean-like values from Flow XML
     * @param {*} value - Raw value
     * @returns {boolean} Boolean value
     * @private
     */
    _normalizeBoolean(value) {
        const normalized = this._normalizeValue(value);
        if (!normalized) return false;
        const lowered = normalized.toLowerCase();
        return lowered === 'true' || lowered === '1' || lowered === 'yes';
    }

    /**
     * Extract target reference from connector payload
     * @param {*} connector - Connector object/value
     * @returns {string|null} Target element name
     * @private
     */
    _extractTargetReference(connector) {
        if (!connector) return null;

        if (Array.isArray(connector)) {
            for (const candidate of connector) {
                const target = this._extractTargetReference(candidate);
                if (target) return target;
            }
            return null;
        }

        if (typeof connector === 'string') {
            return this._normalizeValue(connector);
        }

        if (typeof connector === 'object') {
            if (Object.prototype.hasOwnProperty.call(connector, 'targetReference')) {
                return this._extractTargetReference(connector.targetReference);
            }
        }

        return null;
    }

    /**
     * Extract variable references from an element payload
     * @param {Object} element - Flow element
     * @returns {Array<string>} Variable names
     * @private
     */
    _extractVariableReferencesFromElement(element) {
        const references = new Set();
        if (!element) return [];

        let serialized = '';
        try {
            serialized = JSON.stringify(element);
        } catch (_) {
            return [];
        }

        const regex = /\{!\s*([A-Za-z0-9_$.]+(?:\.[A-Za-z0-9_]+)*)\s*\}/g;
        let match;
        while ((match = regex.exec(serialized)) !== null) {
            const normalized = this._normalizeVariableReference(match[1]);
            if (normalized) references.add(normalized);
        }

        return [...references];
    }

    /**
     * Normalize variable references to root variable names
     * @param {*} reference - Variable reference
     * @returns {string|null} Variable root name
     * @private
     */
    _normalizeVariableReference(reference) {
        const raw = this._normalizeValue(reference);
        if (!raw) return null;

        const cleaned = raw.replace(/^\{!\s*/, '').replace(/\s*\}$/, '');
        const root = cleaned.split('.')[0];
        return this._normalizeValue(root);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Flow XML Validator

Usage: flow-validator.js <flow-file.xml> [options]

Options:
  --verbose, -v         Show detailed validation progress
  --auto-fix, -f        Attempt to auto-fix issues
  --output, -o          Output format (json, console, sarif)
  --sarif               Output SARIF 2.1.0 format for CI/CD integration
  --config <path>       Path to .flow-validator.yml configuration file
  --help                Show this help message

Examples:
  # Basic validation
  node flow-validator.js force-app/main/default/flows/Account_AfterSave.flow-meta.xml

  # Verbose with auto-fix
  node flow-validator.js MyFlow.flow-meta.xml --verbose --auto-fix

  # Output as JSON
  node flow-validator.js MyFlow.flow-meta.xml --output json

  # Output as SARIF for GitHub Code Scanning
  node flow-validator.js MyFlow.flow-meta.xml --sarif > results.sarif

  # Use custom configuration file
  node flow-validator.js MyFlow.flow-meta.xml --config custom-rules.yml

  # SARIF with verbose logging and custom config
  node flow-validator.js MyFlow.flow-meta.xml --verbose --config .flow-validator.yml --output sarif
        `);
        process.exit(0);
    }

    const flowPath = args[0];
    const outputFormat = args.includes('--sarif') ? 'sarif' :
                        (args.includes('--output') ? args[args.indexOf('--output') + 1] : 'console');

    const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;

    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        autoFix: args.includes('--auto-fix') || args.includes('-f'),
        output: outputFormat,
        configPath: configPath
    };

    const validator = new FlowValidator(options);

    validator.validateFlow(flowPath).then(report => {
        if (options.output === 'json') {
            console.log(JSON.stringify(report, null, 2));
        } else if (options.output === 'sarif') {
            const sarifReport = validator.exportSarif(flowPath);
            console.log(JSON.stringify(sarifReport, null, 2));
        }

        process.exit(report.valid ? 0 : 1);
    }).catch(error => {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = FlowValidator;
