#!/usr/bin/env node

/**
 * Error Recovery and Pattern Recognition System
 * 
 * Intelligent error handling system that learns from errors, suggests fixes,
 * and automatically recovers from common issues.
 * 
 * Features:
 * - Pattern recognition for common errors
 * - Automatic retry with different strategies
 * - Self-healing capabilities
 * - Error context preservation
 * - Learning from past resolutions
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

function getPlaybookVersion(playbookPath) {
    try {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const output = execSync(`git -C "${repoRoot}" log -1 --pretty=format:%h -- "${playbookPath}"`, {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
        return output || 'untracked';
    } catch (error) {
        return 'unknown';
    }
}

function logPlaybookUsage(playbookPath) {
    const version = getPlaybookVersion(playbookPath);
    console.log(`📘 Playbook: ${playbookPath} (version: ${version})`);
}

class ErrorRecoverySystem {
    constructor(options = {}) {
        if (options.logPlaybook !== false) {
            logPlaybookUsage('docs/playbooks/error-recovery.md');
        }
        this.errorPatterns = new Map();
        this.resolutionHistory = [];
        this.learningMode = true;
        this.maxRetries = 3;
        this.patternDatabase = path.join(__dirname, '../../data/error-patterns.json');
        
        // Load pre-defined patterns
        this.loadPatterns();
    }

    /**
     * Load error patterns from database
     */
    async loadPatterns() {
        // Core error patterns based on actual issues encountered
        this.registerPattern({
            id: 'PICKLIST_VALUE_ERROR',
            pattern: /bad value for restricted picklist field/i,
            extractor: (error) => {
                const match = error.message.match(/field:\s*(\w+).*value:\s*['"]([^'"]+)['"]/i);
                return match ? { field: match[1], value: match[2] } : {};
            },
            resolver: async (context, error) => {
                const { field, value, object } = context;
                
                // Query valid picklist values
                const PreFlightValidator = require('./preflight-validator');
                const validator = new PreFlightValidator(context.orgAlias);
                const validValues = await validator.getPicklistValues(object, field);
                
                // Find best match
                const activeValues = validValues.filter(v => v.active).map(v => v.value);
                const suggestion = validator.findClosestMatch(value, activeValues);
                
                return {
                    type: 'FIELD_UPDATE',
                    action: 'replace_value',
                    field: field,
                    oldValue: value,
                    newValue: suggestion || activeValues[0],
                    validValues: activeValues,
                    confidence: suggestion ? 0.8 : 0.5,
                    explanation: `Invalid picklist value '${value}'. Suggested: '${suggestion || activeValues[0]}'`
                };
            }
        });

        this.registerPattern({
            id: 'REQUIRED_FIELDS_MISSING',
            pattern: /Required fields are missing:\s*\[([^\]]+)\]/i,
            extractor: (error) => {
                const match = error.message.match(/Required fields are missing:\s*\[([^\]]+)\]/i);
                return match ? { fields: match[1].split(',').map(f => f.trim()) } : {};
            },
            resolver: async (context, error, extracted) => {
                const { fields } = extracted;
                const suggestions = {};
                
                // Get field metadata and suggest values
                const PreFlightValidator = require('./preflight-validator');
                const validator = new PreFlightValidator(context.orgAlias);
                
                for (const field of fields) {
                    const metadata = await validator.getFieldMetadata(context.object);
                    const fieldInfo = metadata.find(f => f.QualifiedApiName === field || f.DeveloperName === field);
                    
                    if (fieldInfo) {
                        suggestions[field] = await validator.suggestFieldValue(
                            context.object, field, fieldInfo.DataType
                        );
                    }
                }
                
                return {
                    type: 'ADD_FIELDS',
                    action: 'add_required_fields',
                    fields: suggestions,
                    confidence: 0.9,
                    explanation: `Adding required fields: ${fields.join(', ')}`
                };
            }
        });

        this.registerPattern({
            id: 'DUPLICATE_VALUE',
            pattern: /duplicate value found|DUPLICATE_VALUE/i,
            extractor: (error) => {
                const match = error.message.match(/duplicate value found.*?(\w+)/i);
                return match ? { field: match[1] } : {};
            },
            resolver: async (context, error, extracted) => {
                const { field, value } = { ...extracted, ...context };
                const timestamp = Date.now();
                
                return {
                    type: 'MAKE_UNIQUE',
                    action: 'append_timestamp',
                    field: field,
                    oldValue: value,
                    newValue: `${value}_${timestamp}`,
                    confidence: 0.95,
                    explanation: `Making value unique by appending timestamp`
                };
            }
        });

        this.registerPattern({
            id: 'INVALID_FIELD',
            pattern: /No such column '(\w+)'|INVALID_FIELD/i,
            extractor: (error) => {
                const match = error.message.match(/No such column '(\w+)'/i);
                return match ? { field: match[1] } : {};
            },
            resolver: async (context, error, extracted) => {
                const { field } = extracted;
                
                // Check if field exists with different API name
                const PreFlightValidator = require('./preflight-validator');
                const validator = new PreFlightValidator(context.orgAlias);
                const metadata = await validator.getFieldMetadata(context.object);
                
                // Find similar field names
                const similar = metadata.filter(f => 
                    f.DeveloperName.toLowerCase().includes(field.toLowerCase()) ||
                    f.Label.toLowerCase().includes(field.toLowerCase())
                );
                
                if (similar.length > 0) {
                    return {
                        type: 'FIELD_RENAME',
                        action: 'correct_field_name',
                        oldField: field,
                        newField: similar[0].QualifiedApiName,
                        alternatives: similar.map(f => f.QualifiedApiName),
                        confidence: 0.7,
                        explanation: `Field '${field}' not found. Using '${similar[0].QualifiedApiName}' instead`
                    };
                } else {
                    return {
                        type: 'REMOVE_FIELD',
                        action: 'remove_invalid_field',
                        field: field,
                        confidence: 0.6,
                        explanation: `Removing invalid field '${field}'`
                    };
                }
            }
        });

        this.registerPattern({
            id: 'API_TIMEOUT',
            pattern: /timeout|timed out|ETIMEDOUT/i,
            resolver: async (context, error) => {
                return {
                    type: 'RETRY_STRATEGY',
                    action: 'reduce_batch_size',
                    currentBatchSize: context.batchSize || 100,
                    newBatchSize: Math.max(10, Math.floor((context.batchSize || 100) / 2)),
                    delay: 2000,
                    confidence: 0.9,
                    explanation: 'Timeout detected. Reducing batch size and retrying with delay'
                };
            }
        });

        this.registerPattern({
            id: 'GOVERNOR_LIMIT',
            pattern: /Too many SOQL queries|CPU time limit exceeded|heap size/i,
            resolver: async (context, error) => {
                return {
                    type: 'SWITCH_MODE',
                    action: 'use_bulk_api',
                    reason: 'Governor limits exceeded',
                    confidence: 1.0,
                    explanation: 'Switching to Bulk API to avoid governor limits'
                };
            }
        });

        // Flow-specific error patterns
        this.registerPattern({
            id: 'FLOW_MUTUAL_EXCLUSION',
            pattern: /sObjectInputReference.*inputAssignments|Cannot use sObjectInputReference together with inputAssignments/i,
            extractor: (error) => {
                const match = error.message.match(/element[:\s]+(\w+)/i);
                return match ? { element: match[1] } : {};
            },
            resolver: async (context, error, extracted) => {
                return {
                    type: 'FLOW_FIX',
                    action: 'remove_mutual_exclusion',
                    element: extracted.element,
                    fix: 'Use either sObjectInputReference OR inputAssignments, not both',
                    confidence: 1.0,
                    explanation: 'Flow has mutual exclusion violation. Remove either sObjectInputReference or inputAssignments',
                    command: `node scripts/lib/flow-validator.js ${context.flowPath} --fix`
                };
            }
        });

        this.registerPattern({
            id: 'FLOW_MISSING_COLLECTION',
            pattern: /Collection variable.*required|Collection.*AssignCount|Collection variable required before/i,
            extractor: (error) => {
                const match = error.message.match(/variable[:\s]+(\w+)/i);
                return match ? { variable: match[1] } : {};
            },
            resolver: async (context, error, extracted) => {
                return {
                    type: 'FLOW_FIX',
                    action: 'add_collection_variable',
                    variable: extracted.variable,
                    pattern: 'Get Records → Collection → AssignCount',
                    confidence: 0.95,
                    explanation: 'Flow needs collection variable before count operation',
                    fix: 'Add collection variable to store Get Records result before counting'
                };
            }
        });

        this.registerPattern({
            id: 'FLOW_VALIDATION_RULE_BLOCKER',
            pattern: /field.*not editable.*validation rule|PRIORVALUE.*Status|validation rule.*blocking/i,
            extractor: (error) => {
                const fieldMatch = error.message.match(/field[:\s]+(\w+)/i);
                const valueMatch = error.message.match(/value[:\s]+['"]([^'"]+)['"]/i);
                return { 
                    field: fieldMatch ? fieldMatch[1] : 'Status',
                    value: valueMatch ? valueMatch[1] : null
                };
            },
            resolver: async (context, error, extracted) => {
                const { field, value } = extracted;
                
                return {
                    type: 'VALIDATION_BYPASS',
                    action: 'check_transition_rules',
                    field: field,
                    blockedValue: value,
                    confidence: 0.8,
                    explanation: `Validation rule blocking ${field} transition. Check PRIORVALUE rules`,
                    command: `./scripts/validation-rule-analyzer.sh full ${context.object}`,
                    alternatives: [
                        'Follow allowed status transition path',
                        'Set required fields before status change',
                        'Use system mode or bypass validation'
                    ]
                };
            }
        });

        this.registerPattern({
            id: 'FLOW_DANGLING_REFERENCE',
            pattern: /Element reference.*not found|reference.*does not exist|Unknown element/i,
            extractor: (error) => {
                const match = error.message.match(/reference[:\s]+['"]?(\w+)['"]?/i);
                return match ? { reference: match[1] } : {};
            },
            resolver: async (context, error, extracted) => {
                return {
                    type: 'FLOW_FIX',
                    action: 'fix_references',
                    reference: extracted.reference,
                    confidence: 0.9,
                    explanation: `Flow has dangling reference to '${extracted.reference}'`,
                    fix: 'Remove reference or create missing element',
                    command: `node scripts/lib/flow-validator.js ${context.flowPath} --fix`
                };
            }
        });

        this.registerPattern({
            id: 'FLOW_COMPLEXITY_HIGH',
            pattern: /complexity.*exceeds|flow.*too complex|Consider.*Apex/i,
            extractor: (error) => {
                const match = error.message.match(/score[:\s]+(\d+)/i);
                return match ? { score: parseInt(match[1]) } : { score: 0 };
            },
            resolver: async (context, error, extracted) => {
                return {
                    type: 'ARCHITECTURE_CHANGE',
                    action: 'convert_to_apex',
                    complexityScore: extracted.score,
                    threshold: 7,
                    confidence: extracted.score >= 15 ? 1.0 : 0.7,
                    explanation: `Flow complexity score ${extracted.score} exceeds threshold`,
                    recommendation: extracted.score >= 15 ? 'URGENT: Convert to Apex immediately' : 
                                   extracted.score >= 10 ? 'Should convert to Apex' : 
                                   'Monitor performance, consider Apex',
                    command: `node scripts/utilities/flow-audit.js --complexity ${context.flowName}`
                };
            }
        });

        this.registerPattern({
            id: 'FLOW_CONSOLIDATION_VIOLATION',
            pattern: /Multiple flows.*same.*trigger|consolidation.*violation|one flow per/i,
            extractor: (error) => {
                const objectMatch = error.message.match(/object[:\s]+(\w+)/i);
                const triggerMatch = error.message.match(/trigger[:\s]+(\w+)/i);
                return { 
                    object: objectMatch ? objectMatch[1] : null,
                    trigger: triggerMatch ? triggerMatch[1] : null
                };
            },
            resolver: async (context, error, extracted) => {
                const { object, trigger } = extracted;
                
                return {
                    type: 'FLOW_CONSOLIDATION',
                    action: 'merge_flows',
                    object: object || context.object,
                    trigger: trigger || context.trigger,
                    targetFlow: `${object || context.object}_${trigger || 'AfterSave'}_Master`,
                    confidence: 0.95,
                    explanation: 'Multiple flows detected for same object/trigger combination',
                    fix: 'Consolidate into single master flow',
                    command: `./scripts/flow-consolidation-validator.sh -o ${context.orgAlias} -n ${object} -m report`
                };
            }
        });

        this.registerPattern({
            id: 'FLOW_DEPLOYMENT_ERROR',
            pattern: /field integrity exception|Cannot.*deploy.*flow|Flow.*deployment.*failed/i,
            resolver: async (context, error) => {
                return {
                    type: 'DEPLOYMENT_VALIDATION',
                    action: 'validate_before_deploy',
                    confidence: 0.9,
                    explanation: 'Flow deployment failed. Run validation checks',
                    steps: [
                        `node scripts/lib/flow-validator.js ${context.flowPath} --verbose`,
                        `./scripts/lib/deploy-validator.sh -o ${context.orgAlias} -m "Flow:${context.flowName}"`,
                        `./scripts/flow-test-runner.sh -o ${context.orgAlias} -f ${context.flowName}`
                    ],
                    command: `./scripts/ci-validate-flow.sh --org ${context.orgAlias} --flow ${context.flowName}`
                };
            }
        });

        this.registerPattern({
            id: 'SESSION_EXPIRED',
            pattern: /Session expired|INVALID_SESSION_ID/i,
            resolver: async (context, error) => {
                return {
                    type: 'REAUTH',
                    action: 'refresh_session',
                    confidence: 1.0,
                    explanation: 'Session expired. Refreshing authentication'
                };
            }
        });

        // Try to load additional patterns from file
        try {
            const data = await fs.readFile(this.patternDatabase, 'utf8');
            const savedPatterns = JSON.parse(data);
            savedPatterns.forEach(pattern => this.registerPattern(pattern));
        } catch (error) {
            // File doesn't exist yet, will be created on first save
        }
    }

    /**
     * Register a new error pattern
     */
    registerPattern(patternConfig) {
        this.errorPatterns.set(patternConfig.id, {
            ...patternConfig,
            pattern: patternConfig.pattern instanceof RegExp ? 
                patternConfig.pattern : new RegExp(patternConfig.pattern, 'i'),
            hitCount: 0,
            successCount: 0,
            lastUsed: null
        });
    }

    /**
     * Main error recovery entry point
     */
    async recoverFromError(error, context, attempt = 1) {
        console.log(`\n🔧 Error Recovery System Activated (Attempt ${attempt}/${this.maxRetries})`);
        
        // Find matching pattern
        const pattern = this.findMatchingPattern(error);
        
        if (!pattern) {
            console.log('❌ No matching error pattern found');
            return this.handleUnknownError(error, context);
        }
        
        console.log(`✅ Matched pattern: ${pattern.id}`);
        pattern.hitCount++;
        pattern.lastUsed = new Date();
        
        // Extract error details
        const extracted = pattern.extractor ? pattern.extractor(error) : {};
        
        // Get resolution
        const resolution = await pattern.resolver(context, error, extracted);
        console.log(`💡 Resolution: ${resolution.explanation}`);
        
        // Apply resolution
        const result = await this.applyResolution(resolution, context, error);
        
        if (result.success) {
            pattern.successCount++;
            this.recordResolution(error, pattern, resolution, result);
            
            if (this.learningMode) {
                await this.savePatterns();
            }
            
            return result;
        } else if (attempt < this.maxRetries) {
            console.log(`⚠️  Resolution failed. Trying alternative strategy...`);
            return this.recoverFromError(error, context, attempt + 1);
        } else {
            console.log(`❌ Maximum retry attempts reached`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Find matching error pattern
     */
    findMatchingPattern(error) {
        const errorMessage = error.message || error.toString();
        
        for (const [id, pattern] of this.errorPatterns) {
            if (pattern.pattern.test(errorMessage)) {
                return pattern;
            }
        }
        
        return null;
    }

    /**
     * Apply resolution based on type
     */
    async applyResolution(resolution, context, originalError) {
        try {
            switch (resolution.type) {
                case 'FIELD_UPDATE':
                    return this.applyFieldUpdate(resolution, context);
                    
                case 'ADD_FIELDS':
                    return this.applyAddFields(resolution, context);
                    
                case 'MAKE_UNIQUE':
                    return this.applyMakeUnique(resolution, context);
                    
                case 'FIELD_RENAME':
                    return this.applyFieldRename(resolution, context);
                    
                case 'REMOVE_FIELD':
                    return this.applyRemoveField(resolution, context);
                    
                case 'RETRY_STRATEGY':
                    return this.applyRetryStrategy(resolution, context);
                    
                case 'SWITCH_MODE':
                    return this.applySwitchMode(resolution, context);
                    
                case 'REAUTH':
                    return this.applyReauth(resolution, context);
                    
                default:
                    return { 
                        success: false, 
                        error: `Unknown resolution type: ${resolution.type}` 
                    };
            }
        } catch (error) {
            return { 
                success: false, 
                error: error.message,
                originalError: originalError.message 
            };
        }
    }

    /**
     * Apply field update resolution
     */
    async applyFieldUpdate(resolution, context) {
        const { field, newValue } = resolution;
        
        // Update the data
        if (Array.isArray(context.data)) {
            context.data.forEach(record => {
                if (record[field] !== undefined) {
                    record[field] = newValue;
                }
            });
        } else if (context.data) {
            context.data[field] = newValue;
        }
        
        // Retry the operation
        return {
            success: true,
            action: 'retry',
            modifications: [{
                field,
                newValue,
                resolution: resolution.explanation
            }],
            data: context.data
        };
    }

    /**
     * Apply add fields resolution
     */
    async applyAddFields(resolution, context) {
        const { fields } = resolution;
        
        // Add missing fields to data
        if (Array.isArray(context.data)) {
            context.data.forEach(record => {
                for (const [field, suggestion] of Object.entries(fields)) {
                    if (!record[field]) {
                        record[field] = suggestion.defaultValue || suggestion.commonValue;
                    }
                }
            });
        } else if (context.data) {
            for (const [field, suggestion] of Object.entries(fields)) {
                if (!context.data[field]) {
                    context.data[field] = suggestion.defaultValue || suggestion.commonValue;
                }
            }
        }
        
        return {
            success: true,
            action: 'retry',
            modifications: Object.keys(fields).map(field => ({
                field,
                added: true,
                value: fields[field].defaultValue || fields[field].commonValue
            })),
            data: context.data
        };
    }

    /**
     * Apply make unique resolution
     */
    async applyMakeUnique(resolution, context) {
        const { field, newValue } = resolution;
        
        // Update to unique value
        if (Array.isArray(context.data)) {
            context.data.forEach((record, index) => {
                if (record[field]) {
                    record[field] = `${record[field]}_${Date.now()}_${index}`;
                }
            });
        } else if (context.data && context.data[field]) {
            context.data[field] = newValue;
        }
        
        return {
            success: true,
            action: 'retry',
            modifications: [{
                field,
                madeUnique: true,
                newValue
            }],
            data: context.data
        };
    }

    /**
     * Apply field rename resolution
     */
    async applyFieldRename(resolution, context) {
        const { oldField, newField } = resolution;
        
        // Rename field in data
        if (Array.isArray(context.data)) {
            context.data.forEach(record => {
                if (record[oldField] !== undefined) {
                    record[newField] = record[oldField];
                    delete record[oldField];
                }
            });
        } else if (context.data && context.data[oldField] !== undefined) {
            context.data[newField] = context.data[oldField];
            delete context.data[oldField];
        }
        
        return {
            success: true,
            action: 'retry',
            modifications: [{
                oldField,
                newField,
                renamed: true
            }],
            data: context.data
        };
    }

    /**
     * Apply remove field resolution
     */
    async applyRemoveField(resolution, context) {
        const { field } = resolution;
        
        // Remove field from data
        if (Array.isArray(context.data)) {
            context.data.forEach(record => {
                delete record[field];
            });
        } else if (context.data) {
            delete context.data[field];
        }
        
        return {
            success: true,
            action: 'retry',
            modifications: [{
                field,
                removed: true
            }],
            data: context.data
        };
    }

    /**
     * Apply retry strategy resolution
     */
    async applyRetryStrategy(resolution, context) {
        const { newBatchSize, delay } = resolution;
        
        // Wait before retry
        if (delay) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Update context with new strategy
        context.batchSize = newBatchSize;
        context.retryStrategy = 'reduced_batch';
        
        return {
            success: true,
            action: 'retry',
            strategy: {
                batchSize: newBatchSize,
                delay
            }
        };
    }

    /**
     * Apply switch mode resolution
     */
    async applySwitchMode(resolution, context) {
        context.useBulkAPI = true;
        context.forceBulk = true;
        
        return {
            success: true,
            action: 'retry',
            mode: 'bulk_api'
        };
    }

    /**
     * Apply reauth resolution
     */
    async applyReauth(resolution, context) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        try {
            // Refresh authentication
            await execAsync(`sf org display --target-org ${context.orgAlias}`);
            
            return {
                success: true,
                action: 'retry',
                refreshed: true
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to refresh authentication: ${error.message}`
            };
        }
    }

    /**
     * Handle unknown error
     */
    async handleUnknownError(error, context) {
        // Try generic recovery strategies
        const strategies = [
            {
                name: 'retry_with_delay',
                apply: async () => {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    return { success: true, action: 'retry', strategy: 'delayed_retry' };
                }
            },
            {
                name: 'reduce_payload',
                apply: async () => {
                    if (Array.isArray(context.data) && context.data.length > 1) {
                        context.data = context.data.slice(0, Math.floor(context.data.length / 2));
                        return { success: true, action: 'retry', strategy: 'reduced_payload' };
                    }
                    return { success: false };
                }
            }
        ];
        
        for (const strategy of strategies) {
            console.log(`Trying generic strategy: ${strategy.name}`);
            const result = await strategy.apply();
            if (result.success) {
                return result;
            }
        }
        
        // Learn from this error if in learning mode
        if (this.learningMode) {
            this.learnFromError(error, context);
        }
        
        return {
            success: false,
            error: error.message,
            unknown: true
        };
    }

    /**
     * Learn from new error patterns
     */
    learnFromError(error, context) {
        const errorSignature = this.generateErrorSignature(error);
        
        // Store for analysis
        this.resolutionHistory.push({
            timestamp: new Date(),
            error: error.message,
            signature: errorSignature,
            context: {
                object: context.object,
                operation: context.operation,
                recordCount: context.data?.length
            },
            resolved: false
        });
        
        // If we see this error multiple times, suggest creating a pattern
        const similarErrors = this.resolutionHistory.filter(h => 
            h.signature === errorSignature
        );
        
        if (similarErrors.length >= 3) {
            console.log(`\n📊 Pattern detected: This error has occurred ${similarErrors.length} times`);
            console.log('Consider adding a resolution pattern for:', errorSignature);
        }
    }

    /**
     * Generate error signature for pattern matching
     */
    generateErrorSignature(error) {
        const message = error.message || error.toString();
        
        // Remove variable parts (IDs, timestamps, etc.)
        return message
            .replace(/[0-9a-f]{15,18}/gi, 'ID')
            .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
            .replace(/\d+/g, 'NUM')
            .toLowerCase()
            .trim();
    }

    /**
     * Record successful resolution
     */
    recordResolution(error, pattern, resolution, result) {
        const record = {
            timestamp: new Date(),
            patternId: pattern.id,
            error: error.message,
            resolution: resolution,
            result: result,
            confidence: resolution.confidence
        };
        
        this.resolutionHistory.push(record);
        
        // Keep history size manageable
        if (this.resolutionHistory.length > 1000) {
            this.resolutionHistory = this.resolutionHistory.slice(-500);
        }
    }

    /**
     * Save patterns to file
     */
    async savePatterns() {
        const patterns = Array.from(this.errorPatterns.values()).map(p => ({
            id: p.id,
            pattern: p.pattern.source,
            hitCount: p.hitCount,
            successCount: p.successCount,
            successRate: p.hitCount > 0 ? p.successCount / p.hitCount : 0,
            lastUsed: p.lastUsed
        }));
        
        try {
            await fs.mkdir(path.dirname(this.patternDatabase), { recursive: true });
            await fs.writeFile(this.patternDatabase, JSON.stringify(patterns, null, 2));
        } catch (error) {
            console.error('Failed to save patterns:', error.message);
        }
    }

    /**
     * Get recovery statistics
     */
    getStatistics() {
        const stats = {
            totalErrors: this.resolutionHistory.length,
            resolvedErrors: this.resolutionHistory.filter(r => r.result?.success).length,
            patterns: {}
        };
        
        for (const [id, pattern] of this.errorPatterns) {
            stats.patterns[id] = {
                hits: pattern.hitCount,
                successes: pattern.successCount,
                successRate: pattern.hitCount > 0 ? 
                    (pattern.successCount / pattern.hitCount * 100).toFixed(1) + '%' : 'N/A'
            };
        }
        
        stats.overallSuccessRate = stats.totalErrors > 0 ?
            (stats.resolvedErrors / stats.totalErrors * 100).toFixed(1) + '%' : 'N/A';

        return stats;
    }

    // ========== OOO-Enhanced Methods (NEW) ==========

    /**
     * OOO: Concurrency Handler for Permission Set/Flow Updates
     *
     * Implements Section F (Guardrails) - retrieve→merge→deploy→verify cycle
     * with backoff + single retry on mismatch.
     *
     * @param {string} metadataType - 'PermissionSet' or 'Flow'
     * @param {string} metadataName - Name of the metadata component
     * @param {object} changes - Changes to apply
     * @param {object} options - Concurrency options
     * @returns {Promise<object>} Update result with retry handling
     */
    async handleConcurrentUpdate(metadataType, metadataName, changes, options = {}) {
        const maxRetries = options.maxRetries || 1;  // OOO spec: single retry
        const backoffMs = options.backoffMs || 5000;  // 5 second backoff

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`  Retry attempt ${attempt}/${maxRetries} after ${backoffMs}ms backoff...`);
                    await this.sleep(backoffMs);
                }

                // Step 1: Retrieve current version
                console.log(`  Step 1: Retrieving ${metadataType} ${metadataName}...`);
                const current = await this.retrieveMetadata(metadataType, metadataName, options.orgAlias);

                // Step 2: Merge changes
                console.log(`  Step 2: Merging changes...`);
                const merged = this.mergeMetadata(current, changes, metadataType);

                // Step 3: Deploy merged version
                console.log(`  Step 3: Deploying merged ${metadataType}...`);
                const deployment = await this.deployMetadata(metadataType, metadataName, merged, options.orgAlias);

                if (!deployment.success) {
                    throw new Error(`Deployment failed: ${deployment.error}`);
                }

                // Step 4: Verify changes applied
                console.log(`  Step 4: Verifying changes...`);
                const verification = await this.verifyMetadataChanges(
                    metadataType,
                    metadataName,
                    changes,
                    options.orgAlias
                );

                if (!verification.success) {
                    if (attempt < maxRetries) {
                        console.log(`  ⚠️  Verification mismatch detected, will retry...`);
                        continue;  // Retry with backoff
                    } else {
                        throw new Error(`Verification failed: ${verification.issues.join(', ')}`);
                    }
                }

                console.log(`  ✅ Concurrent update successful`);
                return {
                    success: true,
                    attempt: attempt + 1,
                    metadata: merged,
                    verification
                };

            } catch (error) {
                if (attempt >= maxRetries) {
                    return {
                        success: false,
                        error: error.message,
                        attempts: attempt + 1
                    };
                }
                // Continue to retry
            }
        }

        return {
            success: false,
            error: 'Max retries exceeded',
            attempts: maxRetries + 1
        };
    }

    /**
     * Sleep helper for backoff
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retrieve Metadata
     *
     * Gets current version of metadata component.
     */
    async retrieveMetadata(metadataType, metadataName, orgAlias) {
        // Placeholder: Would use sf project retrieve
        return { name: metadataName, type: metadataType };
    }

    /**
     * Merge Metadata
     *
     * Merges changes into current metadata (accretive union).
     */
    mergeMetadata(current, changes, metadataType) {
        if (metadataType === 'PermissionSet') {
            return {
                ...current,
                fieldPermissions: [
                    ...(current.fieldPermissions || []),
                    ...(changes.fieldPermissions || [])
                ],
                objectPermissions: [
                    ...(current.objectPermissions || []),
                    ...(changes.objectPermissions || [])
                ]
            };
        }

        // For other types, simple merge
        return { ...current, ...changes };
    }

    /**
     * Deploy Metadata
     *
     * Deploys merged metadata component.
     */
    async deployMetadata(metadataType, metadataName, metadata, orgAlias) {
        // Placeholder: Would use sf project deploy
        return { success: true };
    }

    /**
     * Verify Metadata Changes
     *
     * Confirms changes were applied successfully.
     */
    async verifyMetadataChanges(metadataType, metadataName, expectedChanges, orgAlias) {
        // Placeholder: Would query metadata to verify
        return { success: true, issues: [] };
    }
}

// Export for use in other modules
module.exports = ErrorRecoverySystem;

// CLI interface for testing
if (require.main === module) {
    const system = new ErrorRecoverySystem();
    
    console.log('Error Recovery System - Interactive Test Mode');
    console.log('Available commands:');
    console.log('  stats    - Show recovery statistics');
    console.log('  test     - Test error recovery');
    console.log('  patterns - List registered patterns');
    console.log('  exit     - Exit');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.on('line', async (input) => {
        switch (input.trim()) {
            case 'stats':
                console.log(JSON.stringify(system.getStatistics(), null, 2));
                break;
                
            case 'patterns':
                for (const [id, pattern] of system.errorPatterns) {
                    console.log(`${id}: ${pattern.pattern.source}`);
                }
                break;
                
            case 'test':
                // Test with sample error
                const error = new Error("Required fields are missing: [Name, Type__c]");
                const context = {
                    object: 'Account',
                    operation: 'insert',
                    data: [{ Description: 'Test' }],
                    orgAlias: 'test'
                };
                const result = await system.recoverFromError(error, context);
                console.log('Recovery result:', result);
                break;
                
            case 'exit':
                process.exit(0);
                break;
                
            default:
                console.log('Unknown command');
        }
    });
}
