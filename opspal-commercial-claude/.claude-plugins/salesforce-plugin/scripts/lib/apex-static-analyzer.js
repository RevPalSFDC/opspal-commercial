#!/usr/bin/env node

/**
 * Apex Static Analyzer
 *
 * Purpose: Parse Apex code to extract object/field access, DML operations,
 * SOQL queries, method calls, and governor limit risks for automation inventory.
 *
 * Features:
 * - Extracts from Apex SymbolTable (Tooling API)
 * - Identifies object and field access patterns
 * - Detects DML operations (insert, update, delete, upsert, undelete)
 * - Extracts SOQL queries
 * - Maps method calls and dependencies
 * - Detects governor limit risks
 * - Normalizes to UDM format
 *
 * Usage:
 *   const analyzer = new ApexStaticAnalyzer(orgAlias);
 *   const analysis = await analyzer.analyzeClass(classId);
 *   const udm = analyzer.normalizeToUDM(analysis);
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ApexStaticAnalyzer {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.cache = new Map();
    }

    /**
     * Analyze Apex Class
     */
    async analyzeClass(classId, options = {}) {
        console.log(`  Analyzing Apex Class: ${classId}...`);

        // Get class metadata with SymbolTable
        const classData = await this.getClassMetadata(classId);

        if (!classData) {
            throw new Error(`Failed to retrieve class metadata for ${classId}`);
        }

        const analysis = {
            id: classId,
            name: classData.Name,
            type: 'ApexClass',
            apiVersion: classData.ApiVersion,
            status: classData.Status,
            lastModifiedDate: classData.LastModifiedDate,
            lastModifiedBy: classData.LastModifiedBy?.Name,

            // Static analysis results
            objectAccess: [],
            fieldAccess: [],
            dmlOperations: [],
            soqlQueries: [],
            methodCalls: [],
            governorRisks: [],

            // TIER 2 ENHANCEMENT: Field-level operation tracking
            fieldOperations: [],  // [{field: 'Account.Status__c', operation: 'WRITE'|'READ'|'READ_WRITE', context: string}]

            // Metadata
            symbolTable: classData.SymbolTable,
            body: options.includeBody ? classData.Body : null
        };

        // Parse SymbolTable if available
        if (classData.SymbolTable) {
            this.parseSymbolTable(analysis, classData.SymbolTable);
        } else {
            // Fallback to body parsing if SymbolTable not available
            if (classData.Body) {
                this.parseBody(analysis, classData.Body);
            }
        }

        // Detect governor risks
        analysis.governorRisks = this.detectGovernorRisks(analysis);

        return analysis;
    }

    /**
     * Analyze Apex Trigger
     */
    async analyzeTrigger(triggerId, options = {}) {
        console.log(`  Analyzing Apex Trigger: ${triggerId}...`);

        // Get trigger metadata
        const triggerData = await this.getTriggerMetadata(triggerId);

        if (!triggerData) {
            throw new Error(`Failed to retrieve trigger metadata for ${triggerId}`);
        }

        const analysis = {
            id: triggerId,
            name: triggerData.Name,
            type: 'ApexTrigger',
            object: triggerData.TableEnumOrId,
            apiVersion: triggerData.ApiVersion,
            status: triggerData.Status,
            lastModifiedDate: triggerData.LastModifiedDate,
            lastModifiedBy: triggerData.LastModifiedBy?.Name,

            // Trigger context
            events: this.extractTriggerEvents(triggerData),

            // Static analysis results
            objectAccess: [triggerData.TableEnumOrId],
            fieldAccess: [],
            dmlOperations: [],
            soqlQueries: [],
            methodCalls: [],
            governorRisks: [],

            // TIER 2 ENHANCEMENT: Field-level operation tracking
            fieldOperations: [],  // [{field: 'Account.Status__c', operation: 'WRITE'|'READ'|'READ_WRITE', context: string}]

            // Metadata
            body: options.includeBody ? triggerData.Body : null
        };

        // Parse trigger body
        if (triggerData.Body) {
            this.parseBody(analysis, triggerData.Body);
            // TIER 1 ENHANCEMENT: Extract field writes and DML target objects
            this.extractFieldWrites(analysis, triggerData.Body, triggerData.TableEnumOrId);
            this.extractDMLTargetObjects(analysis, triggerData.Body);
            // TIER 2 ENHANCEMENT: Categorize field operations (READ vs WRITE vs READ_WRITE)
            this.categorizeFieldOperations(analysis, triggerData.Body, triggerData.TableEnumOrId);
        }

        // Add trigger object to access patterns
        if (!analysis.objectAccess.includes(triggerData.TableEnumOrId)) {
            analysis.objectAccess.push(triggerData.TableEnumOrId);
        }

        // Detect governor risks
        analysis.governorRisks = this.detectGovernorRisks(analysis);

        return analysis;
    }

    /**
     * Get Class Metadata with SymbolTable
     */
    async getClassMetadata(classId) {
        // Check cache first
        if (this.cache.has(`class_${classId}`)) {
            return this.cache.get(`class_${classId}`);
        }

        const query = `
            SELECT Id, Name, ApiVersion, Status, Body, SymbolTable,
                   LastModifiedDate, LastModifiedBy.Name
            FROM ApexClass
            WHERE Id = '${classId}'
        `;

        try {
            const result = this.execSfCommand(
                `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (result?.result?.records?.[0]) {
                const classData = result.result.records[0];
                this.cache.set(`class_${classId}`, classData);
                return classData;
            }
        } catch (error) {
            console.error(`Error fetching class metadata: ${error.message}`);
        }

        return null;
    }

    /**
     * Get Trigger Metadata
     */
    async getTriggerMetadata(triggerId) {
        // Check cache first
        if (this.cache.has(`trigger_${triggerId}`)) {
            return this.cache.get(`trigger_${triggerId}`);
        }

        const query = `
            SELECT Id, Name, ApiVersion, Status, Body, TableEnumOrId,
                   UsageBeforeInsert, UsageAfterInsert,
                   UsageBeforeUpdate, UsageAfterUpdate,
                   UsageBeforeDelete, UsageAfterDelete,
                   UsageAfterUndelete,
                   LastModifiedDate, LastModifiedBy.Name
            FROM ApexTrigger
            WHERE Id = '${triggerId}'
        `;

        try {
            const result = this.execSfCommand(
                `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`
            );

            if (result?.result?.records?.[0]) {
                const triggerData = result.result.records[0];
                this.cache.set(`trigger_${triggerId}`, triggerData);
                return triggerData;
            }
        } catch (error) {
            console.error(`Error fetching trigger metadata: ${error.message}`);
        }

        return null;
    }

    /**
     * Extract trigger events from metadata
     */
    extractTriggerEvents(triggerData) {
        const events = [];

        if (triggerData.UsageBeforeInsert) events.push('beforeInsert');
        if (triggerData.UsageAfterInsert) events.push('afterInsert');
        if (triggerData.UsageBeforeUpdate) events.push('beforeUpdate');
        if (triggerData.UsageAfterUpdate) events.push('afterUpdate');
        if (triggerData.UsageBeforeDelete) events.push('beforeDelete');
        if (triggerData.UsageAfterDelete) events.push('afterDelete');
        if (triggerData.UsageAfterUndelete) events.push('afterUndelete');

        return events;
    }

    /**
     * Parse SymbolTable for static analysis
     */
    parseSymbolTable(analysis, symbolTable) {
        if (!symbolTable) return;

        // SymbolTable structure varies, handle common patterns
        try {
            // Extract method information
            if (symbolTable.methods) {
                for (const method of symbolTable.methods) {
                    // Look for DML operations in method references
                    if (method.references) {
                        this.parseMethodReferences(analysis, method.references);
                    }
                }
            }

            // Extract variable references (for object/field access)
            if (symbolTable.variables) {
                for (const variable of symbolTable.variables) {
                    if (variable.type) {
                        this.extractObjectFromType(analysis, variable.type);
                    }
                }
            }

            // Extract external references (method calls to other classes)
            if (symbolTable.externalReferences) {
                for (const ref of symbolTable.externalReferences) {
                    if (ref.name) {
                        analysis.methodCalls.push({
                            target: ref.name,
                            type: ref.namespace ? 'namespace' : 'internal'
                        });
                    }
                }
            }

        } catch (error) {
            console.warn(`Warning: Error parsing SymbolTable: ${error.message}`);
            // Fall back to body parsing
        }
    }

    /**
     * Parse method references from SymbolTable
     */
    parseMethodReferences(analysis, references) {
        for (const ref of references) {
            // Look for DML method calls
            const dmlPattern = /\b(insert|update|delete|upsert|undelete)\b/i;
            if (ref.name && dmlPattern.test(ref.name)) {
                const operation = ref.name.toLowerCase();
                analysis.dmlOperations.push({
                    operation: operation,
                    line: ref.location?.line,
                    approxRows: this.estimateRowCount(ref)
                });
            }

            // Look for Database class methods
            if (ref.name?.startsWith('Database.')) {
                const operation = ref.name.replace('Database.', '').toLowerCase();
                if (['insert', 'update', 'delete', 'upsert', 'undelete'].includes(operation)) {
                    analysis.dmlOperations.push({
                        operation: operation,
                        line: ref.location?.line,
                        approxRows: this.estimateRowCount(ref)
                    });
                }
            }
        }
    }

    /**
     * Extract object from type reference
     */
    extractObjectFromType(analysis, type) {
        // Match patterns like List<Account>, Map<Id, Contact>, Account[], etc.
        const objectPattern = /(?:List|Set|Map)<.*?([A-Z][a-zA-Z0-9_]+).*?>|([A-Z][a-zA-Z0-9_]+)\[\]|^([A-Z][a-zA-Z0-9_]+)$/;
        const matches = type.match(objectPattern);

        if (matches) {
            const objectName = matches[1] || matches[2] || matches[3];
            if (objectName && !this.isBuiltInType(objectName)) {
                if (!analysis.objectAccess.includes(objectName)) {
                    analysis.objectAccess.push(objectName);
                }
            }
        }
    }

    /**
     * Check if type is built-in Salesforce type
     */
    isBuiltInType(type) {
        const builtInTypes = [
            'String', 'Integer', 'Long', 'Double', 'Decimal', 'Boolean',
            'Date', 'Datetime', 'Time', 'Id', 'Blob', 'Object',
            'List', 'Set', 'Map', 'Exception'
        ];
        return builtInTypes.includes(type);
    }

    /**
     * Parse Apex body for patterns (fallback when SymbolTable unavailable)
     */
    parseBody(analysis, body) {
        if (!body) return;

        // Extract DML operations
        this.extractDMLFromBody(analysis, body);

        // Extract SOQL queries
        this.extractSOQLFromBody(analysis, body);

        // Extract object references
        this.extractObjectReferencesFromBody(analysis, body);

        // Extract method calls
        this.extractMethodCallsFromBody(analysis, body);
    }

    /**
     * Extract DML operations from body
     */
    extractDMLFromBody(analysis, body) {
        const dmlPatterns = [
            /\b(insert|update|delete|upsert|undelete)\s+([a-zA-Z0-9_]+)/gi,
            /Database\.(insert|update|delete|upsert|undelete)\s*\(/gi
        ];

        for (const pattern of dmlPatterns) {
            let match;
            while ((match = pattern.exec(body)) !== null) {
                const operation = match[1].toLowerCase();
                const variable = match[2] || 'unknown';

                analysis.dmlOperations.push({
                    operation: operation,
                    variable: variable,
                    approxRows: this.estimateRowsFromVariable(body, variable)
                });
            }
        }
    }

    /**
     * Extract SOQL queries from body
     */
    extractSOQLFromBody(analysis, body) {
        const soqlPattern = /\[\s*SELECT\s+.*?\s+FROM\s+([a-zA-Z0-9_]+).*?\]/gis;
        let match;

        while ((match = soqlPattern.exec(body)) !== null) {
            const query = match[0];
            const objectName = match[1];

            analysis.soqlQueries.push({
                query: query.substring(0, 200), // Truncate long queries
                object: objectName
            });

            // Add to object access
            if (!analysis.objectAccess.includes(objectName)) {
                analysis.objectAccess.push(objectName);
            }

            // Extract fields from query
            this.extractFieldsFromSOQL(analysis, query, objectName);
        }
    }

    /**
     * Extract fields from SOQL query
     */
    extractFieldsFromSOQL(analysis, query, objectName) {
        // Simple field extraction (between SELECT and FROM)
        const fieldMatch = query.match(/SELECT\s+(.*?)\s+FROM/is);
        if (fieldMatch) {
            const fieldsStr = fieldMatch[1];
            const fields = fieldsStr.split(',').map(f => f.trim());

            for (const field of fields) {
                // Remove functions and aliases
                const cleanField = field.replace(/\(.*?\)/g, '').split(/\s+/)[0];
                if (cleanField && cleanField !== '*' && !cleanField.includes('(')) {
                    const fullField = `${objectName}.${cleanField}`;
                    if (!analysis.fieldAccess.includes(fullField)) {
                        analysis.fieldAccess.push(fullField);
                    }
                }
            }
        }
    }

    /**
     * Extract object references from body
     */
    extractObjectReferencesFromBody(analysis, body) {
        // Match Schema.SObjectType patterns
        const schemaPattern = /Schema\.SObjectType\.([a-zA-Z0-9_]+)/g;
        let match;

        while ((match = schemaPattern.exec(body)) !== null) {
            const objectName = match[1];
            if (!analysis.objectAccess.includes(objectName)) {
                analysis.objectAccess.push(objectName);
            }
        }

        // Match field references like Account.Name, Contact.Email
        const fieldPattern = /\b([A-Z][a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\b/g;
        while ((match = fieldPattern.exec(body)) !== null) {
            const objectName = match[1];
            const fieldName = match[2];

            // Filter out common non-object patterns
            if (!this.isBuiltInType(objectName) && !['System', 'Database', 'Test', 'Trigger'].includes(objectName)) {
                if (!analysis.objectAccess.includes(objectName)) {
                    analysis.objectAccess.push(objectName);
                }

                const fullField = `${objectName}.${fieldName}`;
                if (!analysis.fieldAccess.includes(fullField)) {
                    analysis.fieldAccess.push(fullField);
                }
            }
        }
    }

    /**
     * Extract method calls from body
     */
    extractMethodCallsFromBody(analysis, body) {
        // Match class method calls like ClassName.methodName()
        const methodPattern = /\b([A-Z][a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\s*\(/g;
        let match;

        const seen = new Set();
        while ((match = methodPattern.exec(body)) !== null) {
            const className = match[1];
            const methodName = match[2];

            // Filter out System classes and common patterns
            if (!['System', 'String', 'Integer', 'Database', 'Test', 'Math', 'Limits'].includes(className)) {
                const call = `${className}.${methodName}`;
                if (!seen.has(call)) {
                    seen.add(call);
                    analysis.methodCalls.push({
                        target: className,
                        method: methodName,
                        type: 'internal'
                    });
                }
            }
        }
    }

    /**
     * Estimate row count from variable name or context
     */
    estimateRowsFromVariable(body, variable) {
        // Look for patterns like List<...> or bulk operations
        if (body.includes(`List<`) && body.includes(variable)) {
            // Check for Trigger context
            if (body.includes('Trigger.new') || body.includes('Trigger.old')) {
                return 200; // Typical bulk size
            }
            return 10; // Default list assumption
        }
        return 1; // Single record
    }

    /**
     * Estimate row count from reference context
     */
    estimateRowCount(ref) {
        // Check for collection indicators
        if (ref.name?.toLowerCase().includes('list') ||
            ref.name?.toLowerCase().includes('bulk')) {
            return 100;
        }
        return 1;
    }

    /**
     * Detect governor limit risks
     */
    detectGovernorRisks(analysis) {
        const risks = [];

        // DML in loops risk
        if (analysis.body && this.detectDMLInLoop(analysis.body)) {
            risks.push({
                code: 'DML_IN_LOOP',
                severity: 'HIGH',
                message: 'DML operations detected inside loop',
                impact: 'Risk of hitting 150 DML limit'
            });
        }

        // SOQL in loops risk
        if (analysis.body && this.detectSOQLInLoop(analysis.body)) {
            risks.push({
                code: 'SOQL_IN_LOOP',
                severity: 'HIGH',
                message: 'SOQL queries detected inside loop',
                impact: 'Risk of hitting 100 SOQL limit'
            });
        }

        // High DML count
        if (analysis.dmlOperations.length > 10) {
            risks.push({
                code: 'HIGH_DML_COUNT',
                severity: 'MEDIUM',
                message: `${analysis.dmlOperations.length} DML operations in class`,
                impact: 'May approach 150 DML limit in bulk scenarios'
            });
        }

        // High SOQL count
        if (analysis.soqlQueries.length > 10) {
            risks.push({
                code: 'HIGH_SOQL_COUNT',
                severity: 'MEDIUM',
                message: `${analysis.soqlQueries.length} SOQL queries in class`,
                impact: 'May approach 100 SOQL limit'
            });
        }

        // No bulkification
        if (analysis.body && !this.detectBulkPattern(analysis.body)) {
            if (analysis.dmlOperations.length > 0 || analysis.soqlQueries.length > 0) {
                risks.push({
                    code: 'NO_BULKIFICATION',
                    severity: 'HIGH',
                    message: 'No bulkification pattern detected',
                    impact: 'Code may not handle bulk operations properly'
                });
            }
        }

        return risks;
    }

    /**
     * Detect DML in loop pattern
     */
    detectDMLInLoop(body) {
        // Look for DML inside for/while loops
        const loopPattern = /(for|while)\s*\([^)]*\)\s*\{[^}]*\b(insert|update|delete|upsert|undelete)\b/gis;
        return loopPattern.test(body);
    }

    /**
     * Detect SOQL in loop pattern
     */
    detectSOQLInLoop(body) {
        // Look for SOQL inside for/while loops
        const loopPattern = /(for|while)\s*\([^)]*\)\s*\{[^}]*\[.*?SELECT.*?FROM/gis;
        return loopPattern.test(body);
    }

    /**
     * Detect bulkification patterns
     */
    detectBulkPattern(body) {
        // Look for common bulk patterns
        const bulkPatterns = [
            /List<.*?>/i,
            /Map<.*?>/i,
            /Set<.*?>/i,
            /\bTrigger\.new\b/i,
            /\bTrigger\.old\b/i,
            /\.addAll\(/i
        ];

        return bulkPatterns.some(pattern => pattern.test(body));
    }

    /**
     * TIER 1 ENHANCEMENT: Extract field writes from Apex body
     * Detects patterns like: object.Field__c = value
     */
    extractFieldWrites(analysis, body, triggerObject) {
        if (!body || !triggerObject) return;

        // Initialize fieldsModified array if not present
        if (!analysis.fieldsModified) {
            analysis.fieldsModified = [];
        }

        // Pattern 1: Direct field assignment (object.Field__c = value)
        const fieldAssignmentPattern = new RegExp(`${triggerObject}\\.(\\w+)\\s*=`, 'g');
        const assignmentMatches = [...body.matchAll(fieldAssignmentPattern)];

        for (const match of assignmentMatches) {
            const fieldName = match[1];
            // Filter out common non-field patterns
            if (!['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                if (!analysis.fieldsModified.includes(fullField)) {
                    analysis.fieldsModified.push(fullField);
                }
            }
        }

        // Pattern 2: Variable field assignments (for variable in collection: variable.Field = value)
        // Matches: acc.Status__c = 'Active'
        const varFieldPattern = /(\w+)\.([A-Z]\w+__c|\w+Id|Name|Status|Type|OwnerId)\s*=/g;
        const varMatches = [...body.matchAll(varFieldPattern)];

        for (const match of varMatches) {
            const varName = match[1];
            const fieldName = match[2];

            // Check if variable is of trigger object type
            const varTypePattern = new RegExp(`${triggerObject}\\s+${varName}\\s*[=:]`, 'g');
            if (body.match(varTypePattern) || varName.toLowerCase().startsWith(triggerObject.toLowerCase().substring(0, 3))) {
                const fullField = `${triggerObject}.${fieldName}`;
                if (!analysis.fieldsModified.includes(fullField)) {
                    analysis.fieldsModified.push(fullField);
                }
            }
        }

        // Pattern 3: Trigger.new assignments (for trigger context)
        if (body.includes('Trigger.new')) {
            const triggerNewPattern = /Trigger\.new\[?\w*\]?\.([A-Z]\w+__c|\w+Id|Name|Status|Type|OwnerId)\s*=/g;
            const triggerNewMatches = [...body.matchAll(triggerNewPattern)];

            for (const match of triggerNewMatches) {
                const fieldName = match[1];
                const fullField = `${triggerObject}.${fieldName}`;
                if (!analysis.fieldsModified.includes(fullField)) {
                    analysis.fieldsModified.push(fullField);
                }
            }
        }
    }

    /**
     * TIER 1 ENHANCEMENT: Extract DML target objects from Apex body
     * Identifies which objects are being inserted/updated/deleted
     */
    extractDMLTargetObjects(analysis, body) {
        if (!body) return;

        // Enhance existing dmlOperations with target objects
        for (let i = 0; i < analysis.dmlOperations.length; i++) {
            const dml = analysis.dmlOperations[i];

            // Pattern 1: Direct DML with variable (insert accounts, update contactList)
            const dmlVarPattern = new RegExp(`\\b${dml.operation}\\s+(\\w+)`, 'i');
            const varMatch = body.match(dmlVarPattern);

            if (varMatch) {
                const varName = varMatch[1];

                // Try to find variable declaration with type
                const varDeclPattern = new RegExp(`(List|Set|Map)<([A-Z][a-zA-Z0-9_]+)>\\s+${varName}|([A-Z][a-zA-Z0-9_]+)\\s+${varName}\\s*=`, 'g');
                const declMatch = body.match(varDeclPattern);

                if (declMatch && declMatch[0]) {
                    // Extract object name from type declaration
                    const objectMatch = declMatch[0].match(/([A-Z][a-zA-Z0-9_]+)/);
                    if (objectMatch) {
                        const objectName = objectMatch[1];
                        if (!this.isBuiltInType(objectName)) {
                            dml.targetObject = objectName;

                            // Add to objectAccess if not already present
                            if (!analysis.objectAccess.includes(objectName)) {
                                analysis.objectAccess.push(objectName);
                            }
                        }
                    }
                }
            }

            // Pattern 2: Database class methods (Database.insert(accounts))
            if (dml.operation && body.includes(`Database.${dml.operation}`)) {
                const dbPattern = new RegExp(`Database\\.${dml.operation}\\s*\\(\\s*(\\w+)`, 'i');
                const dbMatch = body.match(dbPattern);

                if (dbMatch) {
                    const varName = dbMatch[1];
                    const varDeclPattern = new RegExp(`(List|Set|Map)<([A-Z][a-zA-Z0-9_]+)>\\s+${varName}|([A-Z][a-zA-Z0-9_]+)\\s+${varName}`, 'g');
                    const declMatch = body.match(varDeclPattern);

                    if (declMatch && declMatch[0]) {
                        const objectMatch = declMatch[0].match(/([A-Z][a-zA-Z0-9_]+)/);
                        if (objectMatch && !this.isBuiltInType(objectMatch[1])) {
                            dml.targetObject = objectMatch[1];

                            if (!analysis.objectAccess.includes(objectMatch[1])) {
                                analysis.objectAccess.push(objectMatch[1]);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * TIER 2 ENHANCEMENT: Extract field READ operations from Apex body
     * Detects patterns like: if (object.Field__c == value), System.debug(object.Field__c)
     */
    extractFieldReads(analysis, body, triggerObject) {
        if (!body || !triggerObject) return;

        const readOperations = [];

        // Pattern 1: Fields in conditions (if, while, for)
        // Matches: if (account.Status__c == 'Active')
        const conditionPattern = new RegExp(
            `(if|while|for)\\s*\\([^)]*?${triggerObject}\\.(\\w+)|` +
            `(if|while|for)\\s*\\([^)]*?(\\w+)\\.(\\w+)`,
            'g'
        );
        const conditionMatches = [...body.matchAll(conditionPattern)];

        for (const match of conditionMatches) {
            const fieldName = match[2] || match[5];
            if (fieldName && !['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                readOperations.push({
                    field: fullField,
                    operation: 'READ',
                    context: 'condition'
                });
            }
        }

        // Pattern 2: Fields in method arguments
        // Matches: System.debug(account.Name), validate(contact.Email)
        const methodArgPattern = new RegExp(`\\w+\\([^)]*?${triggerObject}\\.(\\w+)|\\w+\\([^)]*?(\\w+)\\.(\\w+)`, 'g');
        const methodArgMatches = [...body.matchAll(methodArgPattern)];

        for (const match of methodArgMatches) {
            const fieldName = match[1] || match[3];
            if (fieldName && !['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                readOperations.push({
                    field: fullField,
                    operation: 'READ',
                    context: 'method_argument'
                });
            }
        }

        // Pattern 3: Fields in expressions (right side of assignment)
        // Matches: String status = account.Status__c;
        const expressionPattern = new RegExp(`=\\s*${triggerObject}\\.(\\w+)|=\\s*(\\w+)\\.(\\w+)(?!\\s*=)`, 'g');
        const expressionMatches = [...body.matchAll(expressionPattern)];

        for (const match of expressionMatches) {
            const fieldName = match[1] || match[3];
            if (fieldName && !['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                readOperations.push({
                    field: fullField,
                    operation: 'READ',
                    context: 'expression'
                });
            }
        }

        // Pattern 4: Fields in string concatenation or comparison
        // Matches: 'Status: ' + account.Status__c, account.Name != null
        const comparisonPattern = new RegExp(`(\\+|==|!=|<|>|<=|>=)\\s*${triggerObject}\\.(\\w+)`, 'g');
        const comparisonMatches = [...body.matchAll(comparisonPattern)];

        for (const match of comparisonMatches) {
            const fieldName = match[2];
            if (fieldName && !['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                readOperations.push({
                    field: fullField,
                    operation: 'READ',
                    context: 'comparison'
                });
            }
        }

        // Pattern 5: Trigger.old fields (always READ in trigger context)
        if (body.includes('Trigger.old')) {
            const triggerOldPattern = /Trigger\.old\[?\w*\]?\.([A-Z]\w+__c|\w+Id|Name|Status|Type|OwnerId)/g;
            const triggerOldMatches = [...body.matchAll(triggerOldPattern)];

            for (const match of triggerOldMatches) {
                const fieldName = match[1];
                const fullField = `${triggerObject}.${fieldName}`;
                readOperations.push({
                    field: fullField,
                    operation: 'READ',
                    context: 'trigger_old'
                });
            }
        }

        return readOperations;
    }

    /**
     * TIER 2 ENHANCEMENT: Enhanced field WRITE extraction with context
     * Builds upon Tier 1 to add operation context
     */
    extractFieldWritesEnhanced(analysis, body, triggerObject) {
        if (!body || !triggerObject) return [];

        const writeOperations = [];

        // Pattern 1: Direct field assignment (object.Field__c = value)
        const fieldAssignmentPattern = new RegExp(`${triggerObject}\\.(\\w+)\\s*=`, 'g');
        const assignmentMatches = [...body.matchAll(fieldAssignmentPattern)];

        for (const match of assignmentMatches) {
            const fieldName = match[1];
            if (!['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                writeOperations.push({
                    field: fullField,
                    operation: 'WRITE',
                    context: 'direct_assignment'
                });
            }
        }

        // Pattern 2: Variable field assignments
        const varFieldPattern = /(\w+)\.([A-Z]\w+__c|\w+Id|Name|Status|Type|OwnerId)\s*=/g;
        const varMatches = [...body.matchAll(varFieldPattern)];

        for (const match of varMatches) {
            const varName = match[1];
            const fieldName = match[2];

            // Check if variable is of trigger object type
            const varTypePattern = new RegExp(`${triggerObject}\\s+${varName}\\s*[=:]`, 'g');
            if (body.match(varTypePattern) || varName.toLowerCase().startsWith(triggerObject.toLowerCase().substring(0, 3))) {
                const fullField = `${triggerObject}.${fieldName}`;
                writeOperations.push({
                    field: fullField,
                    operation: 'WRITE',
                    context: 'variable_assignment'
                });
            }
        }

        // Pattern 3: Trigger.new assignments (for trigger context)
        if (body.includes('Trigger.new')) {
            const triggerNewPattern = /Trigger\.new\[?\w*\]?\.([A-Z]\w+__c|\w+Id|Name|Status|Type|OwnerId)\s*=/g;
            const triggerNewMatches = [...body.matchAll(triggerNewPattern)];

            for (const match of triggerNewMatches) {
                const fieldName = match[1];
                const fullField = `${triggerObject}.${fieldName}`;
                writeOperations.push({
                    field: fullField,
                    operation: 'WRITE',
                    context: 'trigger_new_assignment'
                });
            }
        }

        // Pattern 4: Bulk field updates (for loops with assignment)
        const bulkUpdatePattern = new RegExp(`for\\s*\\([^)]*?${triggerObject}[^)]*?\\)[^{]*?{[^}]*?\\.(\\w+)\\s*=`, 'g');
        const bulkMatches = [...body.matchAll(bulkUpdatePattern)];

        for (const match of bulkMatches) {
            const fieldName = match[1];
            if (!['Id', 'SObjectType', 'getSObjectType'].includes(fieldName)) {
                const fullField = `${triggerObject}.${fieldName}`;
                writeOperations.push({
                    field: fullField,
                    operation: 'WRITE',
                    context: 'bulk_update'
                });
            }
        }

        return writeOperations;
    }

    /**
     * TIER 2 ENHANCEMENT: Categorize field operations (READ, WRITE, READ_WRITE)
     * Merges READ and WRITE operations, detecting fields that are both read and written
     */
    categorizeFieldOperations(analysis, body, triggerObject) {
        if (!body || !triggerObject) return;

        // Extract READ and WRITE operations
        const readOps = this.extractFieldReads(analysis, body, triggerObject);
        const writeOps = this.extractFieldWritesEnhanced(analysis, body, triggerObject);

        // Build field operation map: field -> {reads: [], writes: []}
        const fieldMap = new Map();

        for (const op of readOps) {
            if (!fieldMap.has(op.field)) {
                fieldMap.set(op.field, { reads: [], writes: [] });
            }
            fieldMap.get(op.field).reads.push(op.context);
        }

        for (const op of writeOps) {
            if (!fieldMap.has(op.field)) {
                fieldMap.set(op.field, { reads: [], writes: [] });
            }
            fieldMap.get(op.field).writes.push(op.context);
        }

        // Categorize based on operation types
        analysis.fieldOperations = [];

        for (const [field, ops] of fieldMap.entries()) {
            let operation;
            let context;

            if (ops.reads.length > 0 && ops.writes.length > 0) {
                // Both read and write
                operation = 'READ_WRITE';
                context = `read(${ops.reads.join(', ')}), write(${ops.writes.join(', ')})`;
            } else if (ops.writes.length > 0) {
                // Write only
                operation = 'WRITE';
                context = ops.writes.join(', ');
            } else {
                // Read only
                operation = 'READ';
                context = ops.reads.join(', ');
            }

            analysis.fieldOperations.push({
                field,
                operation,
                context
            });
        }

        // Maintain backward compatibility: populate fieldsModified with WRITE and READ_WRITE fields
        if (!analysis.fieldsModified) {
            analysis.fieldsModified = [];
        }

        for (const fieldOp of analysis.fieldOperations) {
            if (fieldOp.operation === 'WRITE' || fieldOp.operation === 'READ_WRITE') {
                if (!analysis.fieldsModified.includes(fieldOp.field)) {
                    analysis.fieldsModified.push(fieldOp.field);
                }
            }
        }
    }

    /**
     * Normalize to UDM format
     */
    normalizeToUDM(analysis) {
        const udm = {
            // Core Identity
            id: analysis.id,
            name: analysis.name,
            type: analysis.type,
            status: analysis.status,
            version: null,
            apiVersion: analysis.apiVersion,

            // Ownership
            owningPackage: null,
            lastModifiedBy: analysis.lastModifiedBy,
            lastModifiedDate: analysis.lastModifiedDate,

            // Trigger Context (for triggers only)
            objectTargets: analysis.type === 'ApexTrigger' ? [{
                objectApiName: analysis.object,
                when: analysis.events || [],
                conditionsSummary: 'Apex Trigger'
            }] : [],

            // Data Access
            reads: analysis.fieldAccess,
            writes: analysis.fieldsModified || [], // TIER 1: Now extracted from body
            // TIER 2: Field-level operation tracking with READ/WRITE/READ_WRITE categorization
            fieldOperations: analysis.fieldOperations || [], // [{field, operation, context}]
            soql: analysis.soqlQueries.map(q => q.query),
            dml: analysis.dmlOperations.map(op => ({
                op: op.operation,
                object: op.targetObject || 'unknown', // TIER 1: Now extracted from body
                approxRows: op.approxRows || 1
            })),

            // Dependencies & Invocations
            invokes: analysis.methodCalls.map(call => ({
                type: 'ApexClass',
                name: call.target,
                id: null
            })),

            // Apex-Specific
            entryCriteriaSummary: analysis.type === 'ApexTrigger' ?
                `Trigger on ${analysis.object}: ${analysis.events?.join(', ')}` : null,
            triggerOrder: null,
            recursionSettings: null,

            // Risk Assessment
            riskSignals: analysis.governorRisks.map(risk => ({
                code: risk.code,
                description: risk.message
            })),

            // Source References
            sourceRefs: {
                api: 'Tooling',
                urls: []
            }
        };

        return udm;
    }

    /**
     * Execute SF CLI command
     */
    execSfCommand(command) {
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return JSON.parse(result);
        } catch (error) {
            console.error(`Error executing: ${command}`);
            console.error(error.message);
            return null;
        }
    }
}

module.exports = ApexStaticAnalyzer;

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Apex Static Analyzer
====================

Usage:
  node apex-static-analyzer.js <org-alias> <class-id|trigger-id> [options]

Options:
  --type <class|trigger>  Specify component type (default: auto-detect)
  --include-body          Include full Apex body in output
  --output <file>         Write output to file (default: stdout)

Examples:
  node apex-static-analyzer.js production 01p5Y000000abcd
  node apex-static-analyzer.js sandbox 01q5Y000000xyz --type trigger
  node apex-static-analyzer.js production 01p5Y000000abcd --output analysis.json
        `);
        process.exit(1);
    }

    const [orgAlias, componentId] = args;
    const options = {
        includeBody: args.includes('--include-body'),
        outputFile: args[args.indexOf('--output') + 1] || null,
        type: args.includes('--type') ? args[args.indexOf('--type') + 1] : null
    };

    (async () => {
        try {
            const analyzer = new ApexStaticAnalyzer(orgAlias);

            let analysis;
            if (options.type === 'trigger' || componentId.startsWith('01q')) {
                analysis = await analyzer.analyzeTrigger(componentId, options);
            } else {
                analysis = await analyzer.analyzeClass(componentId, options);
            }

            const udm = analyzer.normalizeToUDM(analysis);

            const output = JSON.stringify(udm, null, 2);

            if (options.outputFile) {
                fs.writeFileSync(options.outputFile, output);
                console.log(`\n✓ Analysis written to: ${options.outputFile}`);
            } else {
                console.log(output);
            }

        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    })();
}
