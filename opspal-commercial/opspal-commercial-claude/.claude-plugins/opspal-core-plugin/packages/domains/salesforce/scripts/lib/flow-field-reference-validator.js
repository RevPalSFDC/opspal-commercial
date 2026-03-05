#!/usr/bin/env node

/**
 * Flow Field Reference Validator (Enhanced)
 *
 * Validates field references in Salesforce Flow metadata to prevent:
 * - Field doesn't exist errors
 * - Wrong field usage (ContractTerm on Opportunity)
 * - Unpopulated field usage (Net_Price__c)
 * - Wrong user reference field (CreatedById vs OwnerId)
 * - Field permission issues (user can't access field)
 * - Invalid picklist values
 * - Broken relationship paths
 * - Duplicate field assignments (Phase 2.2)
 *
 * Enhancements (v2.0):
 * - Field permission validation
 * - Picklist value validation
 * - Relationship path validation
 * - Batch validation for performance
 *
 * Enhancements (v2.1 - Phase 2.2):
 * - Pre-modification field usage snapshot
 * - Post-modification diff analysis
 * - Duplicate field assignment detection
 * - New method: analyzeFieldAssignments(flowXmlPath)
 *
 * Usage:
 *   const validator = new FlowFieldReferenceValidator(orgAlias, { checkPermissions: true });
 *   const result = await validator.validate(flowXmlPath);
 *
 *   // New: Snapshot and diff
 *   const snapshot = await validator.createSnapshot(flowXmlPath);
 *   // ... make modifications ...
 *   const diff = await validator.compareWithSnapshot(flowXmlPath, snapshot);
 *
 *   // New: Check for duplicate assignments
 *   const duplicates = await validator.analyzeFieldAssignments(flowXmlPath);
 *
 * @module flow-field-reference-validator
 * @version 2.1.0
 * @created 2025-10-24
 * @enhanced 2025-12-09
 * @addresses Cohort #4 - Flow Field References ($98k ROI after Phase 2.2 enhancements)
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const FieldUsageAnalyzer = require('./field-usage-analyzer');
const { execSync } = require('child_process');

class FlowFieldReferenceValidator {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.checkPopulation = options.checkPopulation !== false; // Default true
        this.checkPermissions = options.checkPermissions || false; // New: Default false for backward compat
        this.checkPicklistValues = options.checkPicklistValues || false; // New: Default false
        this.checkRelationships = options.checkRelationships !== false; // New: Default true

        this.usageAnalyzer = new FieldUsageAnalyzer(orgAlias, { verbose: false });
        this.standardFieldMapping = this.loadStandardFieldMapping();

        // Cache for field describe results (batch fetching)
        this.fieldCache = new Map();
        this.picklistCache = new Map();

        // Phase 3.3: Population rate thresholds
        this.populationThresholds = {
            ERROR: options.populationErrorThreshold || 0.01,    // <1% = ERROR
            WARNING: options.populationWarningThreshold || 0.10, // <10% = WARNING
            INFO: options.populationInfoThreshold || 0.50        // <50% = INFO
        };

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            fieldsChecked: 0,
            invalidReferences: 0,
            permissionDenied: 0,
            invalidPicklistValues: 0,
            brokenRelationships: 0,
            populationWarnings: 0,      // Phase 3.3
            populationErrors: 0          // Phase 3.3
        };
    }

    /**
     * Load standard field mapping configuration
     */
    loadStandardFieldMapping() {
        try {
            const configPath = path.join(__dirname, '../../config/standard-field-mapping.json');
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not load standard field mapping: ${error.message}`);
            }
        }
        return {};
    }

    /**
     * Validate flow field references
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @returns {Object} Validation result
     */
    async validate(flowXmlPath) {
        this.stats.totalValidations++;

        const result = {
            valid: false,
            flowPath: flowXmlPath,
            flowName: path.basename(flowXmlPath, '.flow-meta.xml'),
            errors: [],
            warnings: [],
            fieldReferences: [],
            suggestions: []
        };

        // Read and parse flow XML
        let flowContent, flowXml;
        try {
            flowContent = fs.readFileSync(flowXmlPath, 'utf8');
            flowXml = await xml2js.parseStringPromise(flowContent);
        } catch (error) {
            result.errors.push({
                type: 'PARSE_ERROR',
                message: `Failed to parse flow XML: ${error.message}`,
                severity: 'CRITICAL'
            });
            this.stats.failed++;
            return result;
        }

        // Extract field references
        const fieldRefs = this.extractFieldReferences(flowXml);
        result.fieldReferences = fieldRefs;
        this.stats.fieldsChecked += fieldRefs.length;

        // NEW: Batch describe fields for performance (populate caches)
        if (this.checkPermissions || this.checkPicklistValues) {
            await this.batchDescribeFields(fieldRefs);
        }

        // Validate each field reference
        for (const fieldRef of fieldRefs) {
            const errors = await this.validateFieldReference(fieldRef);

            for (const error of errors) {
                if (error.severity === 'ERROR' || error.severity === 'CRITICAL') {
                    result.errors.push(error);
                    this.stats.invalidReferences++;
                } else if (error.severity === 'WARNING') {
                    result.warnings.push(error);
                } else {
                    result.suggestions.push(error);
                }
            }

            // NEW: Check field permissions if enabled
            if (this.checkPermissions && fieldRef.object) {
                const permissionResult = await this.validateFieldPermissions(fieldRef.object, fieldRef.field);

                if (!permissionResult.valid || !permissionResult.writable) {
                    result.errors.push({
                        type: 'PERMISSION_DENIED',
                        message: `Field ${fieldRef.field} on ${fieldRef.object} is not writable`,
                        severity: 'ERROR',
                        field: fieldRef.field,
                        object: fieldRef.object,
                        element: fieldRef.element,
                        details: permissionResult.details,
                        suggestion: 'Check field-level security or use a different field'
                    });
                    this.stats.permissionDenied++;
                }
            }

            // NEW: Check relationship paths if enabled
            if (this.checkRelationships && fieldRef.field.includes('.')) {
                const relationshipResult = await this.validateRelationshipPath(fieldRef.field, fieldRef.object);

                if (!relationshipResult.valid) {
                    result.errors.push({
                        type: 'BROKEN_RELATIONSHIP',
                        message: relationshipResult.message,
                        severity: 'CRITICAL',
                        field: fieldRef.field,
                        object: fieldRef.object,
                        brokenAt: relationshipResult.brokenAt,
                        suggestion: 'Check relationship field names and object references'
                    });
                    this.stats.brokenRelationships++;
                }
            }
        }

        // Check for common field confusions
        const confusions = this.checkFieldConfusions(fieldRefs);
        result.errors.push(...confusions.errors);
        result.suggestions.push(...confusions.suggestions);

        // Determine overall validity
        result.valid = result.errors.length === 0;

        // Update stats
        if (result.valid) {
            this.stats.passed++;
        } else {
            this.stats.failed++;
        }

        return result;
    }

    /**
     * Extract field references from flow XML
     */
    extractFieldReferences(flowXml) {
        const fieldRefs = [];
        const flow = flowXml.Flow || flowXml;

        // Helper to traverse flow and find field references
        const traverse = (obj, objectContext = null) => {
            if (typeof obj !== 'object' || obj === null) return;

            // Check for field references
            if (obj.field && obj.field[0]) {
                fieldRefs.push({
                    field: obj.field[0],
                    object: objectContext || this.guessObjectFromContext(obj),
                    element: obj.name?.[0] || 'unknown',
                    elementType: this.getElementType(obj)
                });
            }

            // Recursively traverse
            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    // Update object context if recordLookups or similar
                    const newContext = obj.object?.[0] || objectContext;
                    traverse(obj[key], newContext);
                }
            }
        };

        traverse(flow);
        return fieldRefs;
    }

    /**
     * Validate a single field reference
     */
    async validateFieldReference(fieldRef) {
        const errors = [];

        if (!fieldRef.object) {
            errors.push({
                type: 'MISSING_OBJECT_CONTEXT',
                message: `Cannot determine object for field ${fieldRef.field}`,
                severity: 'WARNING',
                field: fieldRef.field,
                element: fieldRef.element
            });
            return errors;
        }

        // Use field usage analyzer
        const analysis = await this.usageAnalyzer.analyze(fieldRef.object, fieldRef.field);

        if (!analysis.exists) {
            errors.push({
                type: 'FIELD_NOT_FOUND',
                message: `Field ${fieldRef.field} does not exist on ${fieldRef.object}`,
                severity: 'CRITICAL',
                field: fieldRef.field,
                object: fieldRef.object,
                element: fieldRef.element,
                suggestions: analysis.alternatives
            });
            return errors;
        }

        // Check population if enabled
        if (this.checkPopulation) {
            if (analysis.populationLevel === 'CRITICAL' || analysis.populationLevel === 'EMPTY') {
                errors.push({
                    type: 'UNPOPULATED_FIELD',
                    message: `Field ${fieldRef.field} is only ${(analysis.populationRate * 100).toFixed(1)}% populated`,
                    severity: 'ERROR',
                    field: fieldRef.field,
                    object: fieldRef.object,
                    populationRate: analysis.populationRate,
                    alternatives: analysis.alternatives
                });
            } else if (analysis.populationLevel === 'LOW') {
                errors.push({
                    type: 'LOW_POPULATION',
                    message: `Field ${fieldRef.field} is only ${(analysis.populationRate * 100).toFixed(1)}% populated`,
                    severity: 'WARNING',
                    field: fieldRef.field,
                    object: fieldRef.object,
                    populationRate: analysis.populationRate,
                    recommendation: 'Add null checks in flow logic'
                });
            }
        }

        return errors;
    }

    /**
     * Check for common field confusions
     */
    checkFieldConfusions(fieldRefs) {
        const errors = [];
        const suggestions = [];

        for (const fieldRef of fieldRefs) {
            // ContractTerm on Opportunity
            if (fieldRef.object === 'Opportunity' && fieldRef.field === 'ContractTerm') {
                errors.push({
                    type: 'WRONG_OBJECT',
                    message: 'ContractTerm exists on Contract, not Opportunity',
                    severity: 'CRITICAL',
                    field: fieldRef.field,
                    object: fieldRef.object,
                    suggestion: 'Use Contract_Term_Months__c or lookup to Contract.ContractTerm'
                });
            }

            // CreatedById for ownership
            if (fieldRef.field === 'CreatedById' && fieldRef.elementType === 'assignment') {
                suggestions.push({
                    type: 'BETTER_ALTERNATIVE',
                    message: 'CreatedById is for audit only - use OwnerId for ownership logic',
                    severity: 'INFO',
                    field: fieldRef.field,
                    object: fieldRef.object,
                    suggestion: 'Replace CreatedById with OwnerId for ownership/assignment'
                });
            }

            // Net_Price__c when TotalPrice exists
            if (fieldRef.field === 'Net_Price__c' &&
                (fieldRef.object === 'OpportunityLineItem' || fieldRef.object === 'QuoteLineItem')) {
                suggestions.push({
                    type: 'STANDARD_ALTERNATIVE',
                    message: 'TotalPrice is a standard field - prefer over custom Net_Price__c',
                    severity: 'INFO',
                    field: fieldRef.field,
                    object: fieldRef.object,
                    suggestion: 'Use TotalPrice instead (Quantity × UnitPrice)'
                });
            }
        }

        return { errors, suggestions };
    }

    /**
     * Helper methods
     */
    guessObjectFromContext(element) {
        // Try to infer object from element name or type
        if (element.object && element.object[0]) {
            return element.object[0];
        }
        return null;
    }

    getElementType(element) {
        if (element.assignmentItems) return 'assignment';
        if (element.filters) return 'filter';
        if (element.formula) return 'formula';
        return 'reference';
    }

    /**
     * Batch describe fields for performance
     *
     * @param {Array} fieldRefs - Field references to describe
     * @returns {Promise<Map>} Field describe results by "Object.Field"
     */
    async batchDescribeFields(fieldRefs) {
        const fieldMap = new Map();
        const objectFields = new Map();

        // Group fields by object
        for (const fieldRef of fieldRefs) {
            if (!fieldRef.object) continue;

            if (!objectFields.has(fieldRef.object)) {
                objectFields.set(fieldRef.object, new Set());
            }
            objectFields.get(fieldRef.object).add(fieldRef.field);
        }

        // Describe each object's fields
        for (const [objectName, fields] of objectFields.entries()) {
            try {
                // Use sf sobject describe --sobject <object> --json
                const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
                const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
                const describeResult = JSON.parse(output);

                if (describeResult.status === 0 && describeResult.result) {
                    const fieldDescribes = describeResult.result.fields || [];

                    for (const fieldDescribe of fieldDescribes) {
                        const key = `${objectName}.${fieldDescribe.name}`;
                        fieldMap.set(key, fieldDescribe);
                        this.fieldCache.set(key, fieldDescribe);

                        // Cache picklist values
                        if (fieldDescribe.type === 'picklist' || fieldDescribe.type === 'multipicklist') {
                            const values = (fieldDescribe.picklistValues || []).map(pv => pv.value);
                            this.picklistCache.set(key, values);
                        }
                    }
                }
            } catch (error) {
                if (this.verbose) {
                    console.warn(`Warning: Could not describe ${objectName}: ${error.message}`);
                }
            }
        }

        return fieldMap;
    }

    /**
     * Validate field permissions
     *
     * @param {string} objectName - Object name
     * @param {string} fieldName - Field name
     * @returns {Promise<Object>} Permission validation result
     */
    async validateFieldPermissions(objectName, fieldName) {
        const key = `${objectName}.${fieldName}`;

        // Check cache first
        if (this.fieldCache.has(key)) {
            const fieldDescribe = this.fieldCache.get(key);

            return {
                valid: fieldDescribe.updateable || fieldDescribe.createable,
                readable: fieldDescribe.createable || fieldDescribe.updateable,
                writable: fieldDescribe.updateable,
                creatable: fieldDescribe.createable,
                details: {
                    createable: fieldDescribe.createable,
                    updateable: fieldDescribe.updateable,
                    calculated: fieldDescribe.calculated,
                    autoNumber: fieldDescribe.autoNumber
                }
            };
        }

        // Fetch field describe if not cached
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            const describeResult = JSON.parse(output);

            if (describeResult.status === 0 && describeResult.result) {
                const field = describeResult.result.fields.find(f => f.name === fieldName);

                if (field) {
                    this.fieldCache.set(key, field);

                    return {
                        valid: field.updateable || field.createable,
                        readable: field.createable || field.updateable,
                        writable: field.updateable,
                        creatable: field.createable,
                        details: field
                    };
                }
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not check permissions for ${key}: ${error.message}`);
            }
        }

        return {
            valid: false,
            readable: false,
            writable: false,
            creatable: false,
            error: 'Could not determine permissions'
        };
    }

    /**
     * Validate picklist value
     *
     * @param {string} objectName - Object name
     * @param {string} fieldName - Field name
     * @param {string} value - Picklist value to validate
     * @returns {Promise<Object>} Validation result
     */
    async validatePicklistValue(objectName, fieldName, value) {
        const key = `${objectName}.${fieldName}`;

        // Check cache first
        if (this.picklistCache.has(key)) {
            const validValues = this.picklistCache.get(key);

            return {
                valid: validValues.includes(value),
                validValues,
                providedValue: value,
                suggestions: this.findSimilarPicklistValues(value, validValues)
            };
        }

        // Fetch field describe if not cached
        const permissions = await this.validateFieldPermissions(objectName, fieldName);

        if (permissions.details && permissions.details.picklistValues) {
            const validValues = permissions.details.picklistValues.map(pv => pv.value);
            this.picklistCache.set(key, validValues);

            return {
                valid: validValues.includes(value),
                validValues,
                providedValue: value,
                suggestions: this.findSimilarPicklistValues(value, validValues)
            };
        }

        return {
            valid: false,
            error: 'Field is not a picklist or could not fetch values'
        };
    }

    /**
     * Find similar picklist values (for suggestions)
     */
    findSimilarPicklistValues(value, validValues) {
        const valueLower = value.toLowerCase();
        const similar = [];

        for (const validValue of validValues) {
            const validLower = validValue.toLowerCase();

            // Exact match (case-insensitive)
            if (validLower === valueLower) {
                similar.push({ value: validValue, reason: 'case mismatch' });
                continue;
            }

            // Contains
            if (validLower.includes(valueLower) || valueLower.includes(validLower)) {
                similar.push({ value: validValue, reason: 'partial match' });
                continue;
            }

            // Levenshtein distance < 3
            if (this.levenshteinDistance(valueLower, validLower) < 3) {
                similar.push({ value: validValue, reason: 'similar spelling' });
            }
        }

        return similar.slice(0, 5); // Top 5 suggestions
    }

    /**
     * Calculate Levenshtein distance
     */
    levenshteinDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Validate relationship path
     *
     * @param {string} path - Relationship path (e.g., "Contract.ContractTerm")
     * @param {string} fromObject - Starting object
     * @returns {Promise<Object>} Validation result
     */
    async validateRelationshipPath(path, fromObject) {
        if (!path.includes('.')) {
            return { valid: true, message: 'Not a relationship path' };
        }

        const parts = path.split('.');
        let currentObject = fromObject;

        for (let i = 0; i < parts.length - 1; i++) {
            const relationshipName = parts[i];

            try {
                // Describe object to get relationships
                const cmd = `sf sobject describe --sobject ${currentObject} --target-org ${this.orgAlias} --json`;
                const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
                const describeResult = JSON.parse(output);

                if (describeResult.status === 0 && describeResult.result) {
                    const fields = describeResult.result.fields || [];

                    // Find relationship field
                    const relationship = fields.find(f =>
                        f.relationshipName === relationshipName ||
                        f.name === relationshipName
                    );

                    if (!relationship) {
                        return {
                            valid: false,
                            message: `Relationship ${relationshipName} not found on ${currentObject}`,
                            brokenAt: relationshipName,
                            fromObject: currentObject
                        };
                    }

                    // Move to referenced object
                    if (relationship.referenceTo && relationship.referenceTo.length > 0) {
                        currentObject = relationship.referenceTo[0];
                    } else {
                        return {
                            valid: false,
                            message: `Relationship ${relationshipName} has no target object`,
                            brokenAt: relationshipName
                        };
                    }
                } else {
                    return {
                        valid: false,
                        message: `Could not describe ${currentObject}`,
                        error: describeResult.message
                    };
                }
            } catch (error) {
                return {
                    valid: false,
                    message: `Error validating relationship path: ${error.message}`,
                    error: error.message
                };
            }
        }

        // Validate final field exists on target object
        const finalField = parts[parts.length - 1];
        const analysis = await this.usageAnalyzer.analyze(currentObject, finalField);

        if (!analysis.exists) {
            return {
                valid: false,
                message: `Field ${finalField} does not exist on ${currentObject}`,
                brokenAt: finalField,
                fromObject: currentObject
            };
        }

        return {
            valid: true,
            message: 'Relationship path is valid',
            targetObject: currentObject,
            targetField: finalField
        };
    }

    // =========================================================================
    // Phase 2.2: Snapshot, Diff, and Duplicate Assignment Detection
    // =========================================================================

    /**
     * Create a snapshot of field usage in a Flow
     * Use before modifications to enable diff analysis
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @returns {Promise<Object>} Snapshot containing field references and assignments
     */
    async createSnapshot(flowXmlPath) {
        const snapshot = {
            timestamp: new Date().toISOString(),
            flowPath: flowXmlPath,
            flowName: path.basename(flowXmlPath, '.flow-meta.xml'),
            fieldReferences: [],
            fieldAssignments: [],
            elements: {},
            checksum: null
        };

        // Read and parse flow XML
        let flowContent, flowXml;
        try {
            flowContent = fs.readFileSync(flowXmlPath, 'utf8');
            flowXml = await xml2js.parseStringPromise(flowContent);

            // Create checksum for change detection
            const crypto = require('crypto');
            snapshot.checksum = crypto.createHash('md5').update(flowContent).digest('hex');
        } catch (error) {
            throw new Error(`Failed to create snapshot: ${error.message}`);
        }

        // Extract all field references
        snapshot.fieldReferences = this.extractFieldReferences(flowXml);

        // Extract detailed field assignments (for duplicate detection)
        snapshot.fieldAssignments = this._extractFieldAssignments(flowXml);

        // Extract element metadata for diff
        snapshot.elements = this._extractElementMetadata(flowXml);

        if (this.verbose) {
            console.log(`📸 Snapshot created: ${snapshot.fieldReferences.length} field refs, ${snapshot.fieldAssignments.length} assignments`);
        }

        return snapshot;
    }

    /**
     * Compare current Flow state with a previous snapshot
     * Use after modifications to detect changes
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @param {Object} snapshot - Previous snapshot from createSnapshot()
     * @returns {Promise<Object>} Diff result with added/removed/modified fields
     */
    async compareWithSnapshot(flowXmlPath, snapshot) {
        const diff = {
            timestamp: new Date().toISOString(),
            snapshotTimestamp: snapshot.timestamp,
            flowName: snapshot.flowName,
            hasChanges: false,
            checksumChanged: false,
            fieldReferences: {
                added: [],
                removed: [],
                modified: []
            },
            fieldAssignments: {
                added: [],
                removed: [],
                duplicatesIntroduced: []
            },
            elements: {
                added: [],
                removed: [],
                modified: []
            },
            summary: {
                totalChanges: 0,
                riskLevel: 'LOW',
                warnings: []
            }
        };

        // Read current state
        let currentContent, currentXml;
        try {
            currentContent = fs.readFileSync(flowXmlPath, 'utf8');
            currentXml = await xml2js.parseStringPromise(currentContent);
        } catch (error) {
            throw new Error(`Failed to read current Flow for comparison: ${error.message}`);
        }

        // Check checksum for quick change detection
        const crypto = require('crypto');
        const currentChecksum = crypto.createHash('md5').update(currentContent).digest('hex');
        diff.checksumChanged = currentChecksum !== snapshot.checksum;

        if (!diff.checksumChanged) {
            diff.summary.warnings.push('No changes detected (identical checksum)');
            return diff;
        }

        // Extract current state
        const currentFieldRefs = this.extractFieldReferences(currentXml);
        const currentAssignments = this._extractFieldAssignments(currentXml);
        const currentElements = this._extractElementMetadata(currentXml);

        // Compare field references
        const snapshotRefKeys = new Set(snapshot.fieldReferences.map(r => `${r.object}.${r.field}@${r.element}`));
        const currentRefKeys = new Set(currentFieldRefs.map(r => `${r.object}.${r.field}@${r.element}`));

        for (const ref of currentFieldRefs) {
            const key = `${ref.object}.${ref.field}@${ref.element}`;
            if (!snapshotRefKeys.has(key)) {
                diff.fieldReferences.added.push(ref);
            }
        }

        for (const ref of snapshot.fieldReferences) {
            const key = `${ref.object}.${ref.field}@${ref.element}`;
            if (!currentRefKeys.has(key)) {
                diff.fieldReferences.removed.push(ref);
            }
        }

        // Compare field assignments
        const snapshotAssignKeys = new Set(snapshot.fieldAssignments.map(a => `${a.element}:${a.field}=${a.value}`));
        const currentAssignKeys = new Set(currentAssignments.map(a => `${a.element}:${a.field}=${a.value}`));

        for (const assign of currentAssignments) {
            const key = `${assign.element}:${assign.field}=${assign.value}`;
            if (!snapshotAssignKeys.has(key)) {
                diff.fieldAssignments.added.push(assign);
            }
        }

        for (const assign of snapshot.fieldAssignments) {
            const key = `${assign.element}:${assign.field}=${assign.value}`;
            if (!currentAssignKeys.has(key)) {
                diff.fieldAssignments.removed.push(assign);
            }
        }

        // Check for duplicates introduced
        const duplicates = this._findDuplicateAssignments(currentAssignments);
        const oldDuplicates = this._findDuplicateAssignments(snapshot.fieldAssignments);
        const oldDupKeys = new Set(oldDuplicates.map(d => `${d.field}@${d.elements.join(',')}`));

        for (const dup of duplicates) {
            const key = `${dup.field}@${dup.elements.join(',')}`;
            if (!oldDupKeys.has(key)) {
                diff.fieldAssignments.duplicatesIntroduced.push(dup);
            }
        }

        // Compare elements
        const snapshotElementKeys = new Set(Object.keys(snapshot.elements));
        const currentElementKeys = new Set(Object.keys(currentElements));

        for (const key of currentElementKeys) {
            if (!snapshotElementKeys.has(key)) {
                diff.elements.added.push({ name: key, ...currentElements[key] });
            } else if (JSON.stringify(currentElements[key]) !== JSON.stringify(snapshot.elements[key])) {
                diff.elements.modified.push({
                    name: key,
                    before: snapshot.elements[key],
                    after: currentElements[key]
                });
            }
        }

        for (const key of snapshotElementKeys) {
            if (!currentElementKeys.has(key)) {
                diff.elements.removed.push({ name: key, ...snapshot.elements[key] });
            }
        }

        // Calculate summary
        diff.summary.totalChanges =
            diff.fieldReferences.added.length +
            diff.fieldReferences.removed.length +
            diff.fieldAssignments.added.length +
            diff.fieldAssignments.removed.length +
            diff.elements.added.length +
            diff.elements.removed.length +
            diff.elements.modified.length;

        diff.hasChanges = diff.summary.totalChanges > 0;

        // Calculate risk level
        if (diff.fieldAssignments.duplicatesIntroduced.length > 0) {
            diff.summary.riskLevel = 'HIGH';
            diff.summary.warnings.push(`${diff.fieldAssignments.duplicatesIntroduced.length} duplicate field assignments introduced`);
        } else if (diff.fieldReferences.removed.length > 0) {
            diff.summary.riskLevel = 'MEDIUM';
            diff.summary.warnings.push(`${diff.fieldReferences.removed.length} field references removed`);
        } else if (diff.elements.removed.length > 0) {
            diff.summary.riskLevel = 'MEDIUM';
            diff.summary.warnings.push(`${diff.elements.removed.length} elements removed`);
        }

        if (this.verbose) {
            console.log(`📊 Diff complete: ${diff.summary.totalChanges} changes, risk=${diff.summary.riskLevel}`);
        }

        return diff;
    }

    /**
     * Analyze field assignments in a Flow to detect duplicates
     * Duplicate assignments (same field assigned multiple times) often indicate
     * copy-paste errors or incorrect NLP modifications
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @returns {Promise<Object>} Analysis result with duplicates and recommendations
     */
    async analyzeFieldAssignments(flowXmlPath) {
        const result = {
            flowPath: flowXmlPath,
            flowName: path.basename(flowXmlPath, '.flow-meta.xml'),
            totalAssignments: 0,
            uniqueFields: 0,
            duplicates: [],
            sequentialDuplicates: [], // Same field assigned back-to-back
            conflictingValues: [], // Same field with different values
            recommendations: [],
            severity: 'NONE'
        };

        // Read and parse flow XML
        let flowContent, flowXml;
        try {
            flowContent = fs.readFileSync(flowXmlPath, 'utf8');
            flowXml = await xml2js.parseStringPromise(flowContent);
        } catch (error) {
            throw new Error(`Failed to analyze Flow: ${error.message}`);
        }

        // Extract all field assignments
        const assignments = this._extractFieldAssignments(flowXml);
        result.totalAssignments = assignments.length;

        // Count unique fields
        const uniqueFields = new Set(assignments.map(a => a.field));
        result.uniqueFields = uniqueFields.size;

        // Find duplicates
        result.duplicates = this._findDuplicateAssignments(assignments);

        // Find sequential duplicates (within same element)
        result.sequentialDuplicates = this._findSequentialDuplicates(flowXml);

        // Find conflicting values
        result.conflictingValues = this._findConflictingValues(assignments);

        // Generate recommendations
        if (result.duplicates.length > 0) {
            result.severity = 'ERROR';
            result.recommendations.push({
                type: 'REMOVE_DUPLICATES',
                message: `Remove ${result.duplicates.length} duplicate field assignment(s)`,
                details: result.duplicates.map(d => ({
                    field: d.field,
                    elements: d.elements,
                    action: 'Keep only the intended assignment and remove others'
                }))
            });
        }

        if (result.sequentialDuplicates.length > 0) {
            result.severity = result.severity === 'NONE' ? 'WARNING' : result.severity;
            result.recommendations.push({
                type: 'CONSOLIDATE_SEQUENTIAL',
                message: `Consolidate ${result.sequentialDuplicates.length} sequential duplicate(s)`,
                details: result.sequentialDuplicates.map(d => ({
                    field: d.field,
                    element: d.element,
                    occurrences: d.occurrences,
                    action: 'Keep the final value assignment only'
                }))
            });
        }

        if (result.conflictingValues.length > 0) {
            result.severity = 'ERROR';
            result.recommendations.push({
                type: 'RESOLVE_CONFLICTS',
                message: `Resolve ${result.conflictingValues.length} conflicting value assignment(s)`,
                details: result.conflictingValues.map(c => ({
                    field: c.field,
                    values: c.values,
                    elements: c.elements,
                    action: 'Determine which value is correct and remove conflicting assignments'
                }))
            });
        }

        if (result.severity === 'NONE') {
            result.recommendations.push({
                type: 'NO_ISSUES',
                message: 'No duplicate field assignments detected'
            });
        }

        if (this.verbose) {
            console.log(`🔍 Assignment analysis: ${result.totalAssignments} assignments, ${result.duplicates.length} duplicates, severity=${result.severity}`);
        }

        return result;
    }

    /**
     * Extract detailed field assignments from Flow XML
     * @private
     */
    _extractFieldAssignments(flowXml) {
        const assignments = [];
        const flow = flowXml.Flow || flowXml;

        // Helper to extract assignments from an element
        const extractFromElement = (element, elementName, elementType) => {
            // Record Update assignments
            if (element.inputAssignments) {
                const inputAssignments = Array.isArray(element.inputAssignments)
                    ? element.inputAssignments
                    : [element.inputAssignments];

                for (const assign of inputAssignments) {
                    if (assign.field && assign.field[0]) {
                        assignments.push({
                            element: elementName,
                            elementType: elementType,
                            field: assign.field[0],
                            value: assign.value?.[0]?.stringValue?.[0] ||
                                   assign.value?.[0]?.elementReference?.[0] ||
                                   assign.value?.[0]?.numberValue?.[0] ||
                                   assign.value?.[0]?.booleanValue?.[0] ||
                                   'unknown',
                            valueType: this._getValueType(assign.value?.[0])
                        });
                    }
                }
            }

            // Assignment element items
            if (element.assignmentItems) {
                const assignItems = Array.isArray(element.assignmentItems)
                    ? element.assignmentItems
                    : [element.assignmentItems];

                for (const item of assignItems) {
                    if (item.assignToReference && item.assignToReference[0]) {
                        assignments.push({
                            element: elementName,
                            elementType: 'assignment',
                            field: item.assignToReference[0],
                            value: item.value?.[0]?.stringValue?.[0] ||
                                   item.value?.[0]?.elementReference?.[0] ||
                                   item.value?.[0]?.numberValue?.[0] ||
                                   item.value?.[0]?.booleanValue?.[0] ||
                                   'unknown',
                            valueType: this._getValueType(item.value?.[0]),
                            operator: item.operator?.[0] || 'Assign'
                        });
                    }
                }
            }
        };

        // Process record updates
        if (flow.recordUpdates) {
            const updates = Array.isArray(flow.recordUpdates) ? flow.recordUpdates : [flow.recordUpdates];
            for (const update of updates) {
                extractFromElement(update, update.name?.[0] || 'unknown', 'recordUpdate');
            }
        }

        // Process record creates
        if (flow.recordCreates) {
            const creates = Array.isArray(flow.recordCreates) ? flow.recordCreates : [flow.recordCreates];
            for (const create of creates) {
                extractFromElement(create, create.name?.[0] || 'unknown', 'recordCreate');
            }
        }

        // Process assignments
        if (flow.assignments) {
            const assignElements = Array.isArray(flow.assignments) ? flow.assignments : [flow.assignments];
            for (const assign of assignElements) {
                extractFromElement(assign, assign.name?.[0] || 'unknown', 'assignment');
            }
        }

        return assignments;
    }

    /**
     * Get value type from Flow assignment value
     * @private
     */
    _getValueType(value) {
        if (!value) return 'unknown';
        if (value.stringValue) return 'string';
        if (value.elementReference) return 'reference';
        if (value.numberValue) return 'number';
        if (value.booleanValue) return 'boolean';
        if (value.dateValue) return 'date';
        if (value.dateTimeValue) return 'datetime';
        return 'unknown';
    }

    /**
     * Extract element metadata for diff comparison
     * @private
     */
    _extractElementMetadata(flowXml) {
        const elements = {};
        const flow = flowXml.Flow || flowXml;

        // Element types to track
        const elementTypes = [
            'recordUpdates', 'recordCreates', 'recordLookups', 'recordDeletes',
            'assignments', 'decisions', 'loops', 'screens', 'subflows',
            'actionCalls', 'waits'
        ];

        for (const elementType of elementTypes) {
            if (flow[elementType]) {
                const items = Array.isArray(flow[elementType]) ? flow[elementType] : [flow[elementType]];
                for (const item of items) {
                    const name = item.name?.[0] || 'unknown';
                    elements[name] = {
                        type: elementType.replace(/s$/, ''), // Singularize
                        label: item.label?.[0] || name,
                        object: item.object?.[0] || null,
                        fieldCount: this._countFields(item)
                    };
                }
            }
        }

        return elements;
    }

    /**
     * Count fields in an element
     * @private
     */
    _countFields(element) {
        let count = 0;
        if (element.inputAssignments) {
            count += Array.isArray(element.inputAssignments)
                ? element.inputAssignments.length
                : 1;
        }
        if (element.assignmentItems) {
            count += Array.isArray(element.assignmentItems)
                ? element.assignmentItems.length
                : 1;
        }
        if (element.queriedFields) {
            count += Array.isArray(element.queriedFields)
                ? element.queriedFields.length
                : 1;
        }
        return count;
    }

    /**
     * Find duplicate field assignments (same field assigned in multiple elements)
     * @private
     */
    _findDuplicateAssignments(assignments) {
        const fieldToElements = new Map();

        for (const assign of assignments) {
            const key = assign.field;
            if (!fieldToElements.has(key)) {
                fieldToElements.set(key, []);
            }
            fieldToElements.get(key).push({
                element: assign.element,
                value: assign.value,
                elementType: assign.elementType
            });
        }

        const duplicates = [];
        for (const [field, elementList] of fieldToElements.entries()) {
            if (elementList.length > 1) {
                duplicates.push({
                    field,
                    count: elementList.length,
                    elements: elementList.map(e => e.element),
                    values: elementList.map(e => e.value),
                    elementTypes: elementList.map(e => e.elementType)
                });
            }
        }

        return duplicates;
    }

    /**
     * Find sequential duplicates (same field assigned multiple times in same element)
     * @private
     */
    _findSequentialDuplicates(flowXml) {
        const sequentialDuplicates = [];
        const flow = flowXml.Flow || flowXml;

        // Check each element type
        const checkElement = (element, elementName) => {
            const fieldCounts = new Map();

            // Count inputAssignments
            if (element.inputAssignments) {
                const items = Array.isArray(element.inputAssignments)
                    ? element.inputAssignments
                    : [element.inputAssignments];

                for (const item of items) {
                    const field = item.field?.[0];
                    if (field) {
                        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
                    }
                }
            }

            // Count assignmentItems
            if (element.assignmentItems) {
                const items = Array.isArray(element.assignmentItems)
                    ? element.assignmentItems
                    : [element.assignmentItems];

                for (const item of items) {
                    const field = item.assignToReference?.[0];
                    if (field) {
                        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
                    }
                }
            }

            // Report duplicates
            for (const [field, count] of fieldCounts.entries()) {
                if (count > 1) {
                    sequentialDuplicates.push({
                        element: elementName,
                        field,
                        occurrences: count
                    });
                }
            }
        };

        // Process all element types
        const elementTypes = ['recordUpdates', 'recordCreates', 'assignments'];
        for (const elementType of elementTypes) {
            if (flow[elementType]) {
                const elements = Array.isArray(flow[elementType]) ? flow[elementType] : [flow[elementType]];
                for (const element of elements) {
                    checkElement(element, element.name?.[0] || 'unknown');
                }
            }
        }

        return sequentialDuplicates;
    }

    /**
     * Find conflicting values (same field assigned different values)
     * @private
     */
    _findConflictingValues(assignments) {
        const fieldToValues = new Map();

        for (const assign of assignments) {
            const key = assign.field;
            if (!fieldToValues.has(key)) {
                fieldToValues.set(key, []);
            }
            fieldToValues.get(key).push({
                value: assign.value,
                element: assign.element
            });
        }

        const conflicts = [];
        for (const [field, valueList] of fieldToValues.entries()) {
            const uniqueValues = new Set(valueList.map(v => String(v.value)));
            if (uniqueValues.size > 1 && valueList.length > 1) {
                conflicts.push({
                    field,
                    values: Array.from(uniqueValues),
                    elements: valueList.map(v => v.element),
                    assignments: valueList
                });
            }
        }

        return conflicts;
    }

    /**
     * Phase 3.3: Generate field population report for pre-flight validation
     * Analyzes field population rates and provides recommendations
     * @param {string} orgAlias - Salesforce org alias
     * @param {string[]} fieldApiNames - Array of field API names to analyze
     * @param {Object} options - Report options
     * @returns {Promise<Object>} Population report with warnings/errors
     */
    async generatePopulationReport(orgAlias, fieldApiNames, options = {}) {
        const startTime = Date.now();
        const report = {
            timestamp: new Date().toISOString(),
            orgAlias,
            fieldsAnalyzed: fieldApiNames.length,
            summary: {
                errors: [],
                warnings: [],
                info: [],
                healthy: []
            },
            fields: {},
            recommendations: [],
            metadata: {
                thresholds: this.populationThresholds,
                executionTime: 0
            }
        };

        if (!fieldApiNames || fieldApiNames.length === 0) {
            report.summary.info.push('No fields specified for population analysis');
            return report;
        }

        // Group fields by object for efficient querying
        const fieldsByObject = this._groupFieldsByObject(fieldApiNames);

        for (const [objectName, fields] of Object.entries(fieldsByObject)) {
            try {
                const populationData = await this._queryFieldPopulation(
                    orgAlias,
                    objectName,
                    fields,
                    options
                );

                for (const fieldData of populationData) {
                    const fieldKey = `${objectName}.${fieldData.fieldName}`;
                    const rate = fieldData.populationRate;

                    // Classify based on thresholds
                    let severity = 'HEALTHY';
                    let message = '';

                    if (rate < this.populationThresholds.ERROR) {
                        severity = 'ERROR';
                        message = `Field has critically low population rate (${(rate * 100).toFixed(2)}% < ${this.populationThresholds.ERROR * 100}%)`;
                        report.summary.errors.push({
                            field: fieldKey,
                            rate,
                            message
                        });
                        this.stats.populationErrors++;
                    } else if (rate < this.populationThresholds.WARNING) {
                        severity = 'WARNING';
                        message = `Field has low population rate (${(rate * 100).toFixed(2)}% < ${this.populationThresholds.WARNING * 100}%)`;
                        report.summary.warnings.push({
                            field: fieldKey,
                            rate,
                            message
                        });
                        this.stats.populationWarnings++;
                    } else if (rate < this.populationThresholds.INFO) {
                        severity = 'INFO';
                        message = `Field has moderate population rate (${(rate * 100).toFixed(2)}%)`;
                        report.summary.info.push({
                            field: fieldKey,
                            rate,
                            message
                        });
                    } else {
                        message = `Field is well-populated (${(rate * 100).toFixed(2)}%)`;
                        report.summary.healthy.push({
                            field: fieldKey,
                            rate,
                            message
                        });
                    }

                    report.fields[fieldKey] = {
                        ...fieldData,
                        severity,
                        message,
                        alternatives: severity !== 'HEALTHY'
                            ? await this._suggestAlternativeFields(orgAlias, objectName, fieldData.fieldName, options)
                            : []
                    };
                }
            } catch (err) {
                report.summary.errors.push({
                    field: objectName,
                    rate: null,
                    message: `Failed to query population for ${objectName}: ${err.message}`
                });
            }
        }

        // Generate recommendations based on findings
        report.recommendations = this._generatePopulationRecommendations(report);

        report.metadata.executionTime = Date.now() - startTime;

        if (this.verbose) {
            console.log(`[PopulationReport] Analyzed ${fieldApiNames.length} fields in ${report.metadata.executionTime}ms`);
            console.log(`  Errors: ${report.summary.errors.length}`);
            console.log(`  Warnings: ${report.summary.warnings.length}`);
            console.log(`  Info: ${report.summary.info.length}`);
            console.log(`  Healthy: ${report.summary.healthy.length}`);
        }

        return report;
    }

    /**
     * Group field API names by their parent object
     * @private
     */
    _groupFieldsByObject(fieldApiNames) {
        const grouped = {};

        for (const fieldName of fieldApiNames) {
            // Handle both formats: "Object.Field" and "Field" (assumes current object context)
            const parts = fieldName.includes('.') ? fieldName.split('.') : [null, fieldName];
            const objectName = parts.length > 1 ? parts[0] : 'Unknown';
            const field = parts.length > 1 ? parts[1] : parts[0];

            if (!grouped[objectName]) {
                grouped[objectName] = [];
            }
            grouped[objectName].push(field);
        }

        return grouped;
    }

    /**
     * Query field population rates from Salesforce
     * @private
     */
    async _queryFieldPopulation(orgAlias, objectName, fields, options = {}) {
        const results = [];
        const sampleSize = options.sampleSize || 10000;

        for (const field of fields) {
            try {
                // Build SOQL to count populated vs total records
                const countQuery = `SELECT COUNT() FROM ${objectName} WHERE ${field} != null`;
                const totalQuery = `SELECT COUNT() FROM ${objectName}`;

                // Execute queries using sf CLI
                const { execSync } = require('child_process');

                let populatedCount = 0;
                let totalCount = 0;

                try {
                    const populatedResult = execSync(
                        `sf data query --query "${countQuery}" --target-org ${orgAlias} --json`,
                        { encoding: 'utf-8', timeout: 30000 }
                    );
                    const populatedData = JSON.parse(populatedResult);
                    populatedCount = populatedData.result?.totalSize || 0;
                } catch (queryErr) {
                    // Field might not be queryable, mark as unknown
                    results.push({
                        fieldName: field,
                        objectName,
                        populatedCount: null,
                        totalCount: null,
                        populationRate: null,
                        queryable: false,
                        error: queryErr.message
                    });
                    continue;
                }

                try {
                    const totalResult = execSync(
                        `sf data query --query "${totalQuery}" --target-org ${orgAlias} --json`,
                        { encoding: 'utf-8', timeout: 30000 }
                    );
                    const totalData = JSON.parse(totalResult);
                    totalCount = totalData.result?.totalSize || 0;
                } catch (queryErr) {
                    totalCount = 0;
                }

                const rate = totalCount > 0 ? populatedCount / totalCount : 0;

                results.push({
                    fieldName: field,
                    objectName,
                    populatedCount,
                    totalCount,
                    populationRate: rate,
                    queryable: true,
                    error: null
                });

            } catch (err) {
                results.push({
                    fieldName: field,
                    objectName,
                    populatedCount: null,
                    totalCount: null,
                    populationRate: null,
                    queryable: false,
                    error: err.message
                });
            }
        }

        return results;
    }

    /**
     * Suggest alternative fields with better population rates
     * @private
     */
    async _suggestAlternativeFields(orgAlias, objectName, fieldName, options = {}) {
        const alternatives = [];

        try {
            const { execSync } = require('child_process');

            // Get field metadata to understand field type
            const describeResult = execSync(
                `sf sobject describe ${objectName} --target-org ${orgAlias} --json`,
                { encoding: 'utf-8', timeout: 30000 }
            );
            const describeData = JSON.parse(describeResult);
            const fields = describeData.result?.fields || [];

            // Find the original field
            const originalField = fields.find(f => f.name === fieldName);
            if (!originalField) return alternatives;

            // Find similar fields (same type, similar name pattern)
            const similarFields = fields.filter(f => {
                // Same type
                if (f.type !== originalField.type) return false;
                // Not the same field
                if (f.name === fieldName) return false;
                // Exclude system fields unless original is system
                if (!originalField.custom && f.custom) return false;
                // Check for name similarity (contains similar terms)
                const originalTerms = fieldName.toLowerCase().replace(/__c$/i, '').split(/[_\s]/);
                const candidateTerms = f.name.toLowerCase().replace(/__c$/i, '').split(/[_\s]/);
                const overlap = originalTerms.filter(t => candidateTerms.some(ct => ct.includes(t) || t.includes(ct)));
                return overlap.length > 0;
            }).slice(0, 5); // Limit to 5 alternatives

            // Check population rates for alternatives
            for (const altField of similarFields) {
                try {
                    const countQuery = `SELECT COUNT() FROM ${objectName} WHERE ${altField.name} != null`;
                    const totalQuery = `SELECT COUNT() FROM ${objectName}`;

                    const populatedResult = execSync(
                        `sf data query --query "${countQuery}" --target-org ${orgAlias} --json`,
                        { encoding: 'utf-8', timeout: 15000 }
                    );
                    const totalResult = execSync(
                        `sf data query --query "${totalQuery}" --target-org ${orgAlias} --json`,
                        { encoding: 'utf-8', timeout: 15000 }
                    );

                    const populated = JSON.parse(populatedResult).result?.totalSize || 0;
                    const total = JSON.parse(totalResult).result?.totalSize || 0;
                    const rate = total > 0 ? populated / total : 0;

                    if (rate > this.populationThresholds.WARNING) {
                        alternatives.push({
                            fieldName: altField.name,
                            fieldLabel: altField.label,
                            fieldType: altField.type,
                            populationRate: rate,
                            reason: `Similar field with ${(rate * 100).toFixed(1)}% population rate`
                        });
                    }
                } catch (altErr) {
                    // Skip fields that can't be queried
                }
            }

            // Sort by population rate descending
            alternatives.sort((a, b) => b.populationRate - a.populationRate);

        } catch (err) {
            if (this.verbose) {
                console.warn(`[PopulationReport] Failed to find alternatives for ${objectName}.${fieldName}: ${err.message}`);
            }
        }

        return alternatives.slice(0, 3); // Return top 3 alternatives
    }

    /**
     * Generate recommendations based on population report findings
     * @private
     */
    _generatePopulationRecommendations(report) {
        const recommendations = [];

        // Critical: Fields with <1% population
        if (report.summary.errors.length > 0) {
            recommendations.push({
                severity: 'CRITICAL',
                category: 'LOW_POPULATION',
                title: 'Critically Low Population Fields Detected',
                description: `${report.summary.errors.length} field(s) have population rates below ${this.populationThresholds.ERROR * 100}%. These fields may not be reliable for automation.`,
                action: 'Review field usage in the Flow. Consider using alternative fields or adding validation to handle null values.',
                affectedFields: report.summary.errors.map(e => e.field)
            });
        }

        // Warning: Fields with <10% population
        if (report.summary.warnings.length > 0) {
            recommendations.push({
                severity: 'WARNING',
                category: 'LOW_POPULATION',
                title: 'Low Population Fields Detected',
                description: `${report.summary.warnings.length} field(s) have population rates below ${this.populationThresholds.WARNING * 100}%.`,
                action: 'Add null checks in the Flow or consider alternative fields with better population rates.',
                affectedFields: report.summary.warnings.map(w => w.field)
            });
        }

        // Check for fields with alternatives
        const fieldsWithAlternatives = Object.entries(report.fields)
            .filter(([_, data]) => data.alternatives && data.alternatives.length > 0)
            .map(([field, data]) => ({
                field,
                alternatives: data.alternatives.map(a => a.fieldName)
            }));

        if (fieldsWithAlternatives.length > 0) {
            recommendations.push({
                severity: 'INFO',
                category: 'ALTERNATIVE_FIELDS',
                title: 'Alternative Fields Available',
                description: `${fieldsWithAlternatives.length} field(s) have better-populated alternatives available.`,
                action: 'Consider using alternative fields to improve automation reliability.',
                details: fieldsWithAlternatives
            });
        }

        // Summary recommendation
        const errorCount = report.summary.errors.length;
        const warningCount = report.summary.warnings.length;
        const healthyCount = report.summary.healthy.length;
        const total = errorCount + warningCount + report.summary.info.length + healthyCount;

        if (errorCount > 0) {
            recommendations.push({
                severity: 'CRITICAL',
                category: 'OVERALL_HEALTH',
                title: 'Pre-Flight Check: FAILED',
                description: `${errorCount}/${total} fields have critically low population rates. Deployment is NOT recommended.`,
                action: 'Address critical population issues before deploying the Flow.'
            });
        } else if (warningCount > total * 0.5) {
            recommendations.push({
                severity: 'WARNING',
                category: 'OVERALL_HEALTH',
                title: 'Pre-Flight Check: CAUTION',
                description: `More than 50% of fields have low population rates. Review Flow logic for null handling.`,
                action: 'Add comprehensive null checks to the Flow before deployment.'
            });
        } else {
            recommendations.push({
                severity: 'INFO',
                category: 'OVERALL_HEALTH',
                title: 'Pre-Flight Check: PASSED',
                description: `${healthyCount}/${total} fields are well-populated. Flow is ready for deployment.`,
                action: 'Proceed with deployment. Monitor Field population rates over time.'
            });
        }

        return recommendations;
    }

    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalValidations > 0
                ? (this.stats.passed / this.stats.totalValidations * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

module.exports = FlowFieldReferenceValidator;

// CLI Entry Point
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const printUsage = () => {
        console.log(`
Flow Field Reference Validator CLI
===================================

Usage: node flow-field-reference-validator.js <command> [options]

Commands:
  validate <flowPath>          Validate field references in a Flow
  snapshot <flowPath>          Create a snapshot of field usage
  compare <flowPath> <snapshotPath>  Compare current state with snapshot
  duplicates <flowPath>        Analyze duplicate field assignments
  population <org> <fields...> Generate field population report (Phase 3.3)

Options:
  --verbose, -v    Enable verbose output
  --json           Output as JSON
  --help, -h       Show this help

Examples:
  node flow-field-reference-validator.js validate ./flows/MyFlow.xml
  node flow-field-reference-validator.js snapshot ./flows/MyFlow.xml > snapshot.json
  node flow-field-reference-validator.js compare ./flows/MyFlow.xml ./snapshot.json
  node flow-field-reference-validator.js duplicates ./flows/MyFlow.xml
  node flow-field-reference-validator.js population myorg Account.Industry Account.Type
        `);
    };

    const verbose = args.includes('--verbose') || args.includes('-v');
    const jsonOutput = args.includes('--json');

    if (!command || command === '--help' || command === '-h') {
        printUsage();
        process.exit(0);
    }

    const validator = new FlowFieldReferenceValidator('', { verbose });

    (async () => {
        try {
            switch (command) {
                case 'validate': {
                    const flowPath = args[1];
                    if (!flowPath) {
                        console.error('Error: Flow path required');
                        process.exit(1);
                    }
                    const result = await validator.validateFlowFieldReferences(flowPath);
                    if (jsonOutput) {
                        console.log(JSON.stringify(result, null, 2));
                    } else {
                        console.log(`\nValidation Result: ${result.valid ? '✅ PASSED' : '❌ FAILED'}`);
                        console.log(`  Severity: ${result.severity}`);
                        console.log(`  Issues: ${result.issues.length}`);
                        if (result.issues.length > 0) {
                            console.log('\nIssues:');
                            result.issues.forEach((issue, i) => {
                                console.log(`  ${i + 1}. [${issue.severity}] ${issue.message}`);
                            });
                        }
                    }
                    process.exit(result.valid ? 0 : 1);
                }

                case 'snapshot': {
                    const flowPath = args[1];
                    if (!flowPath) {
                        console.error('Error: Flow path required');
                        process.exit(1);
                    }
                    const snapshot = await validator.createSnapshot(flowPath);
                    console.log(JSON.stringify(snapshot, null, 2));
                    break;
                }

                case 'compare': {
                    const flowPath = args[1];
                    const snapshotPath = args[2];
                    if (!flowPath || !snapshotPath) {
                        console.error('Error: Flow path and snapshot path required');
                        process.exit(1);
                    }
                    const fs = require('fs');
                    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
                    const diff = await validator.compareWithSnapshot(flowPath, snapshot);
                    if (jsonOutput) {
                        console.log(JSON.stringify(diff, null, 2));
                    } else {
                        console.log(`\nSnapshot Comparison`);
                        console.log(`  Has Changes: ${diff.hasChanges ? 'YES' : 'NO'}`);
                        console.log(`  Added Fields: ${diff.added.length}`);
                        console.log(`  Removed Fields: ${diff.removed.length}`);
                        console.log(`  Modified Elements: ${diff.modified.length}`);
                        if (diff.hasChanges) {
                            if (diff.added.length > 0) {
                                console.log('\nAdded Fields:');
                                diff.added.forEach(f => console.log(`  + ${f}`));
                            }
                            if (diff.removed.length > 0) {
                                console.log('\nRemoved Fields:');
                                diff.removed.forEach(f => console.log(`  - ${f}`));
                            }
                        }
                    }
                    process.exit(diff.hasChanges ? 1 : 0);
                }

                case 'duplicates': {
                    const flowPath = args[1];
                    if (!flowPath) {
                        console.error('Error: Flow path required');
                        process.exit(1);
                    }
                    const result = await validator.analyzeFieldAssignments(flowPath);
                    if (jsonOutput) {
                        console.log(JSON.stringify(result, null, 2));
                    } else {
                        console.log(`\nDuplicate Field Assignment Analysis`);
                        console.log(`  Severity: ${result.severity}`);
                        console.log(`  Total Assignments: ${result.totalAssignments}`);
                        console.log(`  Duplicates Found: ${result.duplicates.length}`);
                        if (result.duplicates.length > 0) {
                            console.log('\nDuplicates:');
                            result.duplicates.forEach((dup, i) => {
                                console.log(`  ${i + 1}. ${dup.field} (${dup.type})`);
                                console.log(`     Elements: ${dup.elements.join(', ')}`);
                            });
                        }
                        if (result.recommendations.length > 0) {
                            console.log('\nRecommendations:');
                            result.recommendations.forEach((rec, i) => {
                                console.log(`  ${i + 1}. ${rec}`);
                            });
                        }
                    }
                    process.exit(result.duplicates.length > 0 ? 1 : 0);
                }

                case 'population': {
                    const org = args[1];
                    const fields = args.slice(2).filter(a => !a.startsWith('--'));
                    if (!org || fields.length === 0) {
                        console.error('Error: Org alias and field list required');
                        console.error('Usage: population <org> <Object.Field> [Object.Field...]');
                        process.exit(1);
                    }
                    const report = await validator.generatePopulationReport(org, fields);
                    if (jsonOutput) {
                        console.log(JSON.stringify(report, null, 2));
                    } else {
                        console.log(`\n📊 Field Population Report`);
                        console.log(`   Org: ${report.orgAlias}`);
                        console.log(`   Fields Analyzed: ${report.fieldsAnalyzed}`);
                        console.log(`   Execution Time: ${report.metadata.executionTime}ms`);
                        console.log(`\n📈 Summary:`);
                        console.log(`   ❌ Errors (< ${report.metadata.thresholds.ERROR * 100}%): ${report.summary.errors.length}`);
                        console.log(`   ⚠️  Warnings (< ${report.metadata.thresholds.WARNING * 100}%): ${report.summary.warnings.length}`);
                        console.log(`   ℹ️  Info (< ${report.metadata.thresholds.INFO * 100}%): ${report.summary.info.length}`);
                        console.log(`   ✅ Healthy: ${report.summary.healthy.length}`);

                        if (report.summary.errors.length > 0) {
                            console.log(`\n❌ Critical Fields (< ${report.metadata.thresholds.ERROR * 100}% populated):`);
                            report.summary.errors.forEach(e => {
                                console.log(`   - ${e.field}: ${e.rate !== null ? (e.rate * 100).toFixed(2) + '%' : 'N/A'}`);
                            });
                        }

                        if (report.summary.warnings.length > 0) {
                            console.log(`\n⚠️  Low Population Fields (< ${report.metadata.thresholds.WARNING * 100}%):`);
                            report.summary.warnings.forEach(w => {
                                console.log(`   - ${w.field}: ${(w.rate * 100).toFixed(2)}%`);
                            });
                        }

                        if (report.recommendations.length > 0) {
                            console.log(`\n📋 Recommendations:`);
                            report.recommendations.forEach((rec, i) => {
                                const icon = rec.severity === 'CRITICAL' ? '❌' : rec.severity === 'WARNING' ? '⚠️' : 'ℹ️';
                                console.log(`   ${i + 1}. ${icon} ${rec.title}`);
                                console.log(`      ${rec.description}`);
                                console.log(`      Action: ${rec.action}`);
                            });
                        }
                    }
                    process.exit(report.summary.errors.length > 0 ? 1 : 0);
                }

                default:
                    console.error(`Unknown command: ${command}`);
                    printUsage();
                    process.exit(1);
            }
        } catch (err) {
            console.error(`Error: ${err.message}`);
            if (verbose) {
                console.error(err.stack);
            }
            process.exit(1);
        }
    })();
}
