#!/usr/bin/env node
/**
 * Salesforce API Type Router
 *
 * A decision layer that classifies tasks and routes them to the optimal Salesforce API.
 * Prevents wrong-API errors by analyzing operation type, scale, and complexity.
 *
 * @version 1.0.0
 * @author OpsPal by RevPal
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Load configuration from JSON (allows pluggable rules)
let CONFIG;
try {
    CONFIG = require('../../config/api-routing-config.json');
} catch (e) {
    // Fallback to defaults if config not found
    CONFIG = {
        version: '1.0.0',
        thresholds: {
            bulkRecordThreshold: 200,
            compositeOperationThreshold: 2,
            graphqlComplexityThreshold: 3
        }
    };
}

// ============================================================================
// ROUTING RULES (Decision Matrix)
// ============================================================================

const ROUTING_RULES = {
    // Data Read Operations
    'data:read:single': {
        api: 'REST',
        reason: 'Simple single-record read - REST is efficient for small datasets',
        command: 'sf data get record'
    },
    'data:read:batch': {
        api: 'REST',
        reason: 'Small batch read (<200 records) - REST with SOQL is appropriate',
        command: 'sf data query'
    },
    'data:read:bulk': {
        api: 'BULK',
        reason: 'Large dataset retrieval (200+ records) - Bulk API handles millions efficiently',
        command: 'sf data bulk query'
    },
    'data:read:complex': {
        api: 'GRAPHQL',
        reason: 'Multi-object related query - GraphQL allows precise field selection',
        command: 'sf graphql query'
    },

    // Data Write Operations
    'data:write:single': {
        api: 'REST',
        reason: 'Simple single-record write - REST provides immediate feedback',
        command: 'sf data create record'
    },
    'data:write:batch': {
        api: 'COMPOSITE',
        reason: 'Multiple independent operations (2-25) - Composite API batches efficiently',
        command: 'sf api request rest --method POST (composite)'
    },
    'data:write:bulk': {
        api: 'BULK',
        reason: 'High-volume write operation (200+) - Bulk API processes asynchronously',
        command: 'sf data bulk upsert'
    },

    // Data Delete Operations
    'data:delete:single': {
        api: 'REST',
        reason: 'Single record deletion - REST is straightforward',
        command: 'sf data delete record'
    },
    'data:delete:bulk': {
        api: 'BULK',
        reason: 'Mass deletion - Bulk API prevents governor limit issues',
        command: 'sf data bulk delete'
    },

    // Metadata Operations
    'metadata:deploy': {
        api: 'METADATA',
        reason: 'Schema/config deployment - Metadata API handles package-based deploys',
        command: 'sf project deploy start'
    },
    'metadata:retrieve': {
        api: 'METADATA',
        reason: 'Schema/config retrieval - Metadata API retrieves full configurations',
        command: 'sf project retrieve start'
    },
    'metadata:query': {
        api: 'TOOLING',
        reason: 'Query metadata objects - Tooling API exposes metadata as queryable objects',
        command: 'sf data query --use-tooling-api'
    },
    'metadata:single_change': {
        api: 'TOOLING',
        reason: 'Single metadata item change - Tooling API allows granular updates',
        command: 'sf api request rest (tooling endpoint)'
    },

    // Flow Operations
    'flow:query': {
        api: 'TOOLING',
        reason: 'FlowDefinitionView, FlowVersion require Tooling API',
        command: 'sf data query --use-tooling-api "SELECT ... FROM FlowDefinitionView"'
    },
    'flow:deploy': {
        api: 'METADATA',
        reason: 'Flow deployment requires Metadata API for version control',
        command: 'sf project deploy start -m Flow'
    },

    // Apex Operations
    'apex:test': {
        api: 'TOOLING',
        reason: 'Apex test execution via Tooling API',
        command: 'sf apex run test'
    },
    'apex:query': {
        api: 'TOOLING',
        reason: 'ApexClass, ApexTrigger queries require Tooling API',
        command: 'sf data query --use-tooling-api "SELECT ... FROM ApexClass"'
    },
    'apex:execute': {
        api: 'TOOLING',
        reason: 'Anonymous Apex execution via Tooling API',
        command: 'sf apex run'
    },

    // Territory Operations
    'territory:config': {
        api: 'METADATA',
        reason: 'Territory2 model configuration requires Metadata API',
        command: 'sf project deploy start -m Territory2Model'
    },
    'territory:data': {
        api: 'REST',
        reason: 'Territory assignment data uses standard REST API',
        command: 'sf data query "SELECT ... FROM Territory2"'
    },

    // Report Operations
    'report:query': {
        api: 'REST',
        reason: 'Report queries use Analytics REST API',
        command: 'sf api request rest /services/data/vXX.0/analytics/reports'
    },
    'report:deploy': {
        api: 'METADATA',
        reason: 'Report deployment requires Metadata API',
        command: 'sf project deploy start -m Report'
    },

    // Integration Operations
    'integration:legacy': {
        api: 'SOAP',
        reason: 'Legacy/ERP integrations often require SOAP for formal contracts',
        command: 'Use WSDL-based client'
    },
    'integration:modern': {
        api: 'REST',
        reason: 'Modern integrations prefer REST for simplicity',
        command: 'sf api request rest'
    }
};

// ============================================================================
// TOOLING API OBJECTS (Objects that require --use-tooling-api flag)
// ============================================================================

// ============================================================================
// CPQ OBJECTS (Salesforce CPQ / SBQQ__ namespace)
// ============================================================================

const CPQ_OBJECTS = new Set([
    // Core CPQ Objects
    'SBQQ__Quote__c',
    'SBQQ__QuoteLine__c',
    'SBQQ__QuoteLineGroup__c',
    'SBQQ__Product__c',
    'SBQQ__ProductOption__c',
    'SBQQ__ProductFeature__c',

    // Pricing & Discounting
    'SBQQ__PriceRule__c',
    'SBQQ__PriceCondition__c',
    'SBQQ__PriceAction__c',
    'SBQQ__DiscountSchedule__c',
    'SBQQ__DiscountTier__c',
    'SBQQ__BlockPrice__c',

    // Configuration
    'SBQQ__ConfigurationRule__c',
    'SBQQ__ConfigurationAttribute__c',
    'SBQQ__OptionConstraint__c',

    // Subscriptions & Renewals
    'SBQQ__Subscription__c',
    'SBQQ__ContractedPrice__c',
    'SBQQ__QuoteTemplate__c',

    // Other CPQ Objects
    'SBQQ__CustomAction__c',
    'SBQQ__CustomScript__c',
    'SBQQ__SearchFilter__c',
    'SBQQ__SummaryVariable__c'
]);

// CPQ Objects that trigger heavy calculations (batch carefully)
const CPQ_CALCULATION_OBJECTS = new Set([
    'SBQQ__Quote__c',
    'SBQQ__QuoteLine__c',
    'SBQQ__QuoteLineGroup__c'
]);

const TOOLING_API_OBJECTS = new Set([
    // Core Metadata Objects
    'ApexClass',
    'ApexTrigger',
    'ApexPage',
    'ApexComponent',
    'ApexTestQueueItem',
    'ApexTestResult',
    'ApexTestResultLimits',
    'ApexCodeCoverage',
    'ApexCodeCoverageAggregate',
    'ApexLog',
    'ApexExecutionOverlayResult',

    // Flow Objects
    'FlowDefinitionView',
    'FlowVersionView',
    'Flow',
    'FlowDefinition',

    // Field/Object Definition
    'CustomField',
    'CustomObject',
    'EntityDefinition',
    'FieldDefinition',
    'EntityParticle',

    // Validation & Rules
    'ValidationRule',
    'WorkflowRule',
    'WorkflowFieldUpdate',
    'WorkflowAlert',
    'WorkflowTask',
    'WorkflowOutboundMessage',

    // Layout Objects
    'Layout',
    'LayoutSection',
    'LayoutColumn',
    'LayoutItem',
    'CompactLayout',

    // Permission Objects
    'PermissionSet',
    'PermissionSetAssignment',
    'Profile',
    'ProfileLayout',

    // Other Metadata
    'RecordType',
    'CustomTab',
    'QuickActionDefinition',
    'Publisher',
    'TraceFlag',
    'DebugLevel',
    'MetadataContainer',
    'ContainerAsyncRequest',
    'SymbolTable',
    'ApexClassMember',
    'ApexTriggerMember'
]);

// ============================================================================
// API CLASS
// ============================================================================

class SalesforceApiTypeRouter {
    constructor(options = {}) {
        this.thresholds = {
            bulk: options.bulkThreshold || CONFIG.thresholds.bulkRecordThreshold || 200,
            composite: options.compositeThreshold || CONFIG.thresholds.compositeOperationThreshold || 2,
            graphql: options.graphqlThreshold || CONFIG.thresholds.graphqlComplexityThreshold || 3
        };
        this.verbose = options.verbose || process.env.SF_API_ROUTING_VERBOSE === '1';
        this.enabled = process.env.SF_API_ROUTING_ENABLED !== '0';
    }

    /**
     * Classify a task into type:operation:scale format
     * @param {Object} task - Task parameters
     * @returns {Object} Classification result
     */
    classifyTask(task) {
        const classification = {
            type: this._detectType(task),
            operation: this._detectOperation(task),
            scale: this._detectScale(task),
            objects: this._extractObjects(task)
        };

        // Check for Tooling API requirement
        classification.requiresTooling = this._requiresToolingApi(classification.objects);

        // Check for CPQ objects
        classification.isCpq = this._isCpqObject(classification.objects);
        classification.triggersCalculations = this._triggersCalculations(classification.objects);

        // Generate classification key
        classification.key = `${classification.type}:${classification.operation}:${classification.scale}`;

        return classification;
    }

    /**
     * Recommend the optimal API for a task
     * @param {Object|string} task - Task object or command string
     * @returns {Object} Recommendation with api, reason, and command
     */
    recommendApi(task) {
        if (!this.enabled) {
            return null;
        }

        // Parse task if it's a string
        if (typeof task === 'string') {
            // Try to parse as JSON first
            if (task.trim().startsWith('{')) {
                try {
                    task = JSON.parse(task);
                } catch (e) {
                    // Not valid JSON, treat as command
                    task = this._parseCommand(task);
                }
            } else {
                task = this._parseCommand(task);
            }
        }

        const classification = this.classifyTask(task);

        // Override with Tooling API if required objects detected
        if (classification.requiresTooling && classification.type !== 'metadata') {
            return {
                api: 'TOOLING',
                reason: `Objects [${classification.objects.join(', ')}] require Tooling API`,
                command: 'sf data query --use-tooling-api',
                classification,
                override: true
            };
        }

        // Check for CPQ-specific routing (SBQQ__ namespace)
        const cpqRecommendation = this._getCpqRecommendation(classification);
        if (cpqRecommendation) {
            return {
                ...cpqRecommendation,
                classification,
                cpq: true
            };
        }

        // Look up recommendation
        const rule = ROUTING_RULES[classification.key];
        if (rule) {
            return {
                ...rule,
                classification
            };
        }

        // Default fallback
        return {
            api: 'REST',
            reason: 'Default - REST API handles most operations',
            command: 'sf data query',
            classification,
            fallback: true
        };
    }

    /**
     * Suggest alternative API when one fails
     * @param {string} failedApi - The API that failed
     * @param {string} errorCode - Error code or message
     * @param {Object} context - Optional context about the operation
     * @returns {Object} Alternative suggestion
     */
    suggestAlternative(failedApi, errorCode, context = {}) {
        // Import fallback mapper
        let FallbackMapper;
        try {
            FallbackMapper = require('./api-fallback-mapper');
        } catch (e) {
            // Inline fallbacks if mapper not available
            const ERROR_FALLBACKS = {
                'REQUEST_LIMIT_EXCEEDED': { alt: 'BULK', reason: 'Rate limit exceeded, use async Bulk API' },
                'QUERY_TOO_COMPLICATED': { alt: 'GRAPHQL', reason: 'Query complexity better suited for GraphQL' },
                'EXCEEDED_MAX_SEMIJOIN_SUBSELECTS': { alt: 'COMPOSITE', reason: 'Split into separate queries via Composite' },
                'INVALID_FIELD_FOR_INSERT_UPDATE': { alt: 'TOOLING', reason: 'Field may be metadata-only' },
                'FIELD_FILTER_VALIDATION_EXCEPTION': { alt: 'TOOLING', reason: 'Use Tooling API for this object' },
                'EXCEEDED_QUOTA': { alt: 'REST', reason: 'Bulk quota exceeded, fall back to REST with smaller batches' },
                'Use --use-tooling-api': { alt: 'TOOLING', reason: 'Object requires Tooling API' },
                'sObject type.*is not supported': { alt: 'TOOLING', reason: 'Object requires Tooling API' }
            };

            // Pattern match error
            for (const [pattern, fallback] of Object.entries(ERROR_FALLBACKS)) {
                if (errorCode.includes(pattern) || new RegExp(pattern, 'i').test(errorCode)) {
                    return {
                        originalApi: failedApi,
                        alternativeApi: fallback.alt,
                        reason: fallback.reason,
                        errorCode
                    };
                }
            }

            return null;
        }

        return FallbackMapper.suggestFallback(failedApi, errorCode, context);
    }

    /**
     * Check a command string and provide routing suggestion
     * @param {string} command - CLI command to check
     * @returns {string|null} Suggestion message or null if no suggestion
     */
    checkCommand(command) {
        const recommendation = this.recommendApi(command);

        if (!recommendation) return null;

        // Detect current API from command
        const currentApi = this._detectApiFromCommand(command);

        // If using wrong API, provide suggestion
        if (currentApi && currentApi !== recommendation.api) {
            return `💡 Consider using ${recommendation.api} instead of ${currentApi}: ${recommendation.reason}`;
        }

        // If missing --use-tooling-api flag
        if (recommendation.override && !command.includes('--use-tooling-api')) {
            return `⚠️  Add --use-tooling-api flag: ${recommendation.reason}`;
        }

        return null;
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    _detectType(task) {
        // Check for metadata operations
        if (task.metadata || task.deploy || task.retrieve) return 'metadata';
        if (task.apex || task.apexClass) return 'apex';
        if (task.flow || task.flowQuery) return 'flow';
        if (task.territory && task.model) return 'territory';
        if (task.report && task.deploy) return 'report';

        // Command-based detection
        if (task.command) {
            if (/\b(?:sf|sfdx)\b.*\bproject\s+deploy\b/.test(task.command) || /\b(?:sf|sfdx)\b.*\bproject\s+retrieve\b/.test(task.command)) return 'metadata';
            if (/\b(?:sf|sfdx)\b.*\bapex\b/.test(task.command)) return 'apex';
            if (task.command.includes('FlowDefinitionView') || task.command.includes('FlowVersion')) return 'flow';
        }

        // Default to data
        return 'data';
    }

    _detectOperation(task) {
        if (task.operation) return task.operation;

        // Infer from task properties
        if (task.query || task.soql || task.read) return 'read';
        if (task.create || task.insert) return 'write';
        if (task.update || task.upsert) return 'write';
        if (task.delete) return 'delete';
        if (task.deploy) return 'deploy';
        if (task.retrieve) return 'retrieve';

        // Command-based detection
        if (task.command) {
            if (task.command.includes('query') || task.command.includes('SELECT')) return 'read';
            if (task.command.includes('create') || task.command.includes('upsert') || task.command.includes('INSERT')) return 'write';
            if (task.command.includes('delete') || task.command.includes('DELETE')) return 'delete';
            if (task.command.includes('deploy')) return 'deploy';
            if (task.command.includes('retrieve')) return 'retrieve';
        }

        return 'read';
    }

    _detectScale(task) {
        const recordCount = task.recordCount || task.records || task.count || task.limit || 1;

        if (recordCount >= this.thresholds.bulk) return 'bulk';
        if (recordCount > 1 || task.batch) return 'batch';
        return 'single';
    }

    _extractObjects(task) {
        const objects = new Set();

        // Direct specification
        if (task.object) objects.add(task.object);
        if (task.objects) task.objects.forEach(o => objects.add(o));
        if (task.sobject) objects.add(task.sobject);

        // Parse from SOQL
        if (task.soql || task.query) {
            const soql = task.soql || task.query;
            const fromMatch = soql.match(/FROM\s+(\w+)/i);
            if (fromMatch) objects.add(fromMatch[1]);
        }

        // Parse from command
        if (task.command) {
            const fromMatch = task.command.match(/FROM\s+(\w+)/i);
            if (fromMatch) objects.add(fromMatch[1]);

            // Check for sobject flag (both --sobject and -s)
            const sobjectMatch = task.command.match(/(?:--sobject|-s)\s+(\S+)/i);
            if (sobjectMatch) objects.add(sobjectMatch[1]);
        }

        return Array.from(objects);
    }

    _requiresToolingApi(objects) {
        return objects.some(obj => TOOLING_API_OBJECTS.has(obj));
    }

    /**
     * Check if any objects are CPQ (SBQQ__) objects
     * @param {Array} objects - List of object names
     * @returns {boolean}
     */
    _isCpqObject(objects) {
        return objects.some(obj =>
            CPQ_OBJECTS.has(obj) || obj.startsWith('SBQQ__')
        );
    }

    /**
     * Check if any objects trigger CPQ calculations
     * @param {Array} objects - List of object names
     * @returns {boolean}
     */
    _triggersCalculations(objects) {
        return objects.some(obj => CPQ_CALCULATION_OBJECTS.has(obj));
    }

    /**
     * Get CPQ-specific routing recommendation
     * @param {Object} classification - Task classification
     * @returns {Object|null} CPQ-specific recommendation or null
     */
    _getCpqRecommendation(classification) {
        const { objects, operation, scale } = classification;

        if (!this._isCpqObject(objects)) return null;

        const triggersCalc = this._triggersCalculations(objects);

        // CPQ bulk write operations need special handling
        if (operation === 'write' && triggersCalc) {
            if (scale === 'bulk') {
                return {
                    api: 'BULK',
                    reason: 'CPQ calculation objects - use Bulk API with small batch size (50-100) to avoid calculation timeouts',
                    command: 'sf data bulk upsert --batch-size 50',
                    cpqWarning: 'Each record triggers CPQ calculations. Monitor job status for calculation errors.',
                    batchSizeRecommendation: 50
                };
            }
            if (scale === 'batch') {
                return {
                    api: 'REST',
                    reason: 'CPQ calculation objects - use REST API sequentially to ensure proper calculation order',
                    command: 'sf data create record (sequential)',
                    cpqWarning: 'Process records sequentially to maintain pricing calculation integrity.',
                    sequential: true
                };
            }
        }

        // CPQ read operations - standard routing is fine
        if (operation === 'read') {
            return {
                api: scale === 'bulk' ? 'BULK' : 'REST',
                reason: `CPQ object read - standard ${scale === 'bulk' ? 'Bulk' : 'REST'} API is appropriate`,
                command: scale === 'bulk' ? 'sf data bulk query' : 'sf data query',
                cpqInfo: 'CPQ objects are standard SObjects for read operations.'
            };
        }

        // CPQ delete - warn about cascade effects
        if (operation === 'delete' && triggersCalc) {
            return {
                api: scale === 'bulk' ? 'BULK' : 'REST',
                reason: 'CPQ deletion - be aware of cascade delete behavior on related lines/groups',
                command: scale === 'bulk' ? 'sf data bulk delete' : 'sf data delete record',
                cpqWarning: 'Deleting Quotes cascades to QuoteLines. Verify recalculation triggers.'
            };
        }

        return null;
    }

    _parseCommand(command) {
        return {
            command,
            // Detect record count from command (e.g., LIMIT clause)
            count: this._extractLimit(command),
            // Store original for analysis
            original: command
        };
    }

    _extractLimit(command) {
        const limitMatch = command.match(/LIMIT\s+(\d+)/i);
        return limitMatch ? parseInt(limitMatch[1], 10) : 1;
    }

    _detectApiFromCommand(command) {
        if (command.includes('--use-tooling-api')) return 'TOOLING';
        if (/\b(?:sf|sfdx)\s+data\s+bulk\b/.test(command) || command.includes('bulk query') || command.includes('bulk upsert')) return 'BULK';
        if (/\b(?:sf|sfdx)\s+project\s+deploy\b/.test(command) || /\b(?:sf|sfdx)\s+project\s+retrieve\b/.test(command)) return 'METADATA';
        if (/\b(?:sf|sfdx)\s+graphql\b/.test(command)) return 'GRAPHQL';
        if (command.includes('composite')) return 'COMPOSITE';
        if (/\b(?:sf|sfdx)\s+data\b/.test(command) || /\b(?:sf|sfdx)\s+api\b/.test(command)) return 'REST';
        return null;
    }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);
    const action = args[0];
    const input = args.slice(1).join(' ');

    const router = new SalesforceApiTypeRouter();

    switch (action) {
        case 'check':
            const suggestion = router.checkCommand(input);
            if (suggestion) {
                console.log(suggestion);
                process.exit(0);
            }
            process.exit(0);
            break;

        case 'recommend':
            const recommendation = router.recommendApi(input);
            console.log(JSON.stringify(recommendation, null, 2));
            break;

        case 'classify':
            const classification = router.classifyTask({ command: input });
            console.log(JSON.stringify(classification, null, 2));
            break;

        case 'alternative':
            // Format: api-type-router.js alternative <failed-api> <error-message>
            const failedApi = args[1];
            const errorMessage = args.slice(2).join(' ');
            const alternative = router.suggestAlternative(failedApi, errorMessage);
            if (alternative) {
                console.log(JSON.stringify(alternative, null, 2));
            } else {
                console.log('No alternative suggestion available');
            }
            break;

        case 'list-tooling':
            console.log('Objects requiring Tooling API:');
            Array.from(TOOLING_API_OBJECTS).sort().forEach(obj => console.log(`  - ${obj}`));
            break;

        case 'list-cpq':
            console.log('CPQ Objects (SBQQ__ namespace):');
            Array.from(CPQ_OBJECTS).sort().forEach(obj => console.log(`  - ${obj}`));
            console.log('\nCPQ Calculation Objects (batch carefully):');
            Array.from(CPQ_CALCULATION_OBJECTS).sort().forEach(obj => console.log(`  ⚠️  ${obj}`));
            break;

        case 'help':
        default:
            console.log(`
Salesforce API Type Router

Usage:
  api-type-router.js check <command>        Check command and suggest better API
  api-type-router.js recommend <command>    Get API recommendation
  api-type-router.js classify <command>     Classify task type
  api-type-router.js alternative <api> <error>  Get fallback suggestion
  api-type-router.js list-tooling           List Tooling API objects
  api-type-router.js list-cpq               List CPQ (SBQQ__) objects
  api-type-router.js help                   Show this help

Environment Variables:
  SF_API_ROUTING_ENABLED=0|1   Enable/disable routing (default: 1)
  SF_API_ROUTING_VERBOSE=0|1   Verbose output (default: 0)
  SF_BULK_THRESHOLD=N          Records before suggesting Bulk API (default: 200)

Examples:
  api-type-router.js check 'sf data query "SELECT Id FROM FlowDefinitionView"'
  api-type-router.js recommend 'sf data create record -s Account'
  api-type-router.js alternative REST REQUEST_LIMIT_EXCEEDED
`);
            break;
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    SalesforceApiTypeRouter,
    ROUTING_RULES,
    TOOLING_API_OBJECTS,
    CPQ_OBJECTS,
    CPQ_CALCULATION_OBJECTS
};
