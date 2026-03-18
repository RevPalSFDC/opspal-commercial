#!/usr/bin/env node

/**
 * Instance-Agnostic Toolkit
 *
 * Comprehensive utility library for Salesforce operations that eliminates
 * hardcoded org aliases, field names, and manual discovery.
 *
 * This is the PRIMARY IMPORT for all sub-agents and scripts.
 *
 * Usage in Sub-Agents:
 *   const toolkit = require('./scripts/lib/instance-agnostic-toolkit');
 *
 *   // Auto-detect org from project directory
 *   const orgContext = await toolkit.getOrgContext();
 *
 *   // Get field without knowing exact API name
 *   const fieldName = await toolkit.getField('Contact', 'funnel stage');
 *
 *   // Execute with automatic retry and validation bypass
 *   const result = await toolkit.executeWithRecovery(async () => {
 *       return await bulkOperation();
 *   }, { objectName: 'Contact' });
 *
 *   // Calculate campaign attribution
 *   const attribution = await toolkit.getFirstLastTouch(contactIds);
 *
 *   // Classify by funnel stage
 *   const stages = await toolkit.classifyByFunnel(contactIds);
 */

// Core utilities
const { getOrgContext, requireOrgContext, getOrgParam } = require('./org-context-injector');
const { FieldMapper } = require('./field-mapper');
const { InstanceConfig } = require('./instance-config-registry');

// Business logic libraries
const { CampaignAttribution } = require('./campaign-attribution');
const { FunnelClassifier } = require('./funnel-classifier');
const { StandardQueries } = require('./standard-queries');

// Error handling and recovery
const { SmartValidationBypass } = require('./smart-validation-bypass');
const { ErrorRecovery, ErrorCategory } = require('./enhanced-error-recovery');

// Data enrichment
const { FuzzyAccountMatcher } = require('./fuzzy-account-matcher');

/**
 * Main Toolkit Class
 * Provides unified interface to all instance-agnostic utilities
 */
class InstanceAgnosticToolkit {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            verbose: options.verbose || false,
            ...options
        };

        // Initialize utility instances (lazy loaded)
        this._fieldMapper = null;
        this._config = null;
        this._attribution = null;
        this._classifier = null;
        this._queries = null;
        this._validationBypass = null;
        this._errorRecovery = null;
        this._orgContext = null;
        this._fuzzyMatcher = null;
    }

    /**
     * Initialize toolkit with org context
     */
    async init() {
        if (!this._orgContext) {
            this._orgContext = await (this.orgAlias
                ? getOrgContext({ orgAlias: this.orgAlias, verbose: this.options.verbose })
                : requireOrgContext({ verbose: this.options.verbose }));

            this.orgAlias = this._orgContext.alias;
        }
    }

    // ========================================================================
    // ORG CONTEXT MANAGEMENT
    // ========================================================================

    /**
     * Get current org context
     */
    async getOrgContext() {
        await this.init();
        return this._orgContext;
    }

    /**
     * Get org parameter for SF CLI commands
     */
    getOrgParam() {
        if (!this._orgContext) {
            throw new Error('Toolkit not initialized. Call init() first.');
        }
        return getOrgParam(this._orgContext);
    }

    // ========================================================================
    // FIELD MAPPING
    // ========================================================================

    async _ensureFieldMapper() {
        if (!this._fieldMapper) {
            await this.init();
            this._fieldMapper = new FieldMapper(this.orgAlias, this.options);
            await this._fieldMapper.init();
        }
        return this._fieldMapper;
    }

    /**
     * Get field API name from fuzzy pattern
     */
    async getField(objectName, fieldPattern, options = {}) {
        const mapper = await this._ensureFieldMapper();
        return await mapper.getField(objectName, fieldPattern, options);
    }

    /**
     * Get multiple fields at once
     */
    async getFields(objectName, fieldPatterns) {
        const mapper = await this._ensureFieldMapper();
        return await mapper.getFields(objectName, fieldPatterns);
    }

    /**
     * Register custom field mapping
     */
    async registerField(objectName, pattern, apiName) {
        const mapper = await this._ensureFieldMapper();
        return await mapper.registerField(objectName, pattern, apiName);
    }

    // ========================================================================
    // INSTANCE CONFIGURATION
    // ========================================================================

    async _ensureConfig() {
        if (!this._config) {
            await this.init();
            this._config = new InstanceConfig(this.orgAlias, this.options);
            await this._config.init();
        }
        return this._config;
    }

    /**
     * Get instance configuration value
     */
    async getConfig(keyPath, defaultValue = null) {
        const config = await this._ensureConfig();
        return config.get(keyPath, defaultValue);
    }

    /**
     * Set instance configuration value
     */
    async setConfig(keyPath, value) {
        const config = await this._ensureConfig();
        return config.set(keyPath, value);
    }

    /**
     * Get field mapping from config
     */
    async getFieldMapping(fieldKey) {
        const config = await this._ensureConfig();
        return config.getFieldMapping(fieldKey);
    }

    /**
     * Register blocking validation rule
     */
    async registerBlockingRule(ruleName, objectName, reason = '') {
        const config = await this._ensureConfig();
        return config.registerBlockingRule(ruleName, objectName, reason);
    }

    // ========================================================================
    // CAMPAIGN ATTRIBUTION
    // ========================================================================

    async _ensureAttribution() {
        if (!this._attribution) {
            await this.init();
            this._attribution = new CampaignAttribution(this.orgAlias, this.options);
            await this._attribution.init();
        }
        return this._attribution;
    }

    /**
     * Get first and last touch attribution for contacts
     */
    async getFirstLastTouch(contactIds, options = {}) {
        const attribution = await this._ensureAttribution();
        return await attribution.getFirstLastTouch(contactIds, options);
    }

    /**
     * Identify hand raisers from campaign engagement
     */
    async identifyHandRaisers(contactIds, patterns = {}) {
        const attribution = await this._ensureAttribution();
        return await attribution.identifyHandRaisers(contactIds, patterns);
    }

    /**
     * Get campaign journey statistics
     */
    async getCampaignJourneyStats(contactIds) {
        const attribution = await this._ensureAttribution();
        return await attribution.getCampaignJourneyStats(contactIds);
    }

    /**
     * Generate attribution update CSV
     */
    async generateAttributionCSV(contactIds, fields = {}) {
        const attribution = await this._ensureAttribution();
        return await attribution.generateAttributionUpdateCSV(contactIds, fields);
    }

    // ========================================================================
    // FUNNEL CLASSIFICATION
    // ========================================================================

    async _ensureClassifier() {
        if (!this._classifier) {
            await this.init();
            this._classifier = new FunnelClassifier(this.orgAlias, this.options);
            await this._classifier.init();
        }
        return this._classifier;
    }

    /**
     * Classify contacts/leads by funnel stage
     */
    async classifyByFunnel(recordIds, options = {}) {
        const classifier = await this._ensureClassifier();
        return await classifier.classify(recordIds, options);
    }

    /**
     * Get funnel distribution summary
     */
    async getFunnelDistribution(recordIds, options = {}) {
        const classifier = await this._ensureClassifier();
        return await classifier.getFunnelDistribution(recordIds, options);
    }

    /**
     * Generate funnel stage CSV for bulk update
     */
    async generateFunnelStageCSV(recordIds, funnelStageField, options = {}) {
        const classifier = await this._ensureClassifier();
        return await classifier.generateFunnelStageCSV(recordIds, funnelStageField, options);
    }

    // ========================================================================
    // STANDARD QUERIES
    // ========================================================================

    async _ensureQueries() {
        if (!this._queries) {
            await this.init();
            this._queries = new StandardQueries(this.orgAlias, this.options);
            await this._queries.init();
        }
        return this._queries;
    }

    /**
     * Get leads converted today
     */
    async getConvertedLeadsToday() {
        const queries = await this._ensureQueries();
        return await queries.getConvertedLeadsToday();
    }

    /**
     * Get campaign memberships for leads
     */
    async getCampaignMembershipForLeads(leadIds) {
        const queries = await this._ensureQueries();
        return await queries.getCampaignMembershipForLeads(leadIds);
    }

    /**
     * Get campaign memberships for contacts
     */
    async getCampaignMembershipForContacts(contactIds) {
        const queries = await this._ensureQueries();
        return await queries.getCampaignMembershipForContacts(contactIds);
    }

    /**
     * Get active validation rules for object
     */
    async getActiveValidationRules(objectName) {
        const queries = await this._ensureQueries();
        return await queries.getActiveValidationRules(objectName);
    }

    // ========================================================================
    // VALIDATION BYPASS
    // ========================================================================

    async _ensureValidationBypass() {
        if (!this._validationBypass) {
            await this.init();
            this._validationBypass = new SmartValidationBypass(this.orgAlias, this.options);
            await this._validationBypass.init();
        }
        return this._validationBypass;
    }

    /**
     * Execute operation with automatic validation bypass
     */
    async executeWithBypass(objectName, operation, options = {}) {
        const bypass = await this._ensureValidationBypass();
        return await bypass.executeWithBypass(objectName, operation, options);
    }

    // ========================================================================
    // ERROR RECOVERY
    // ========================================================================

    async _ensureErrorRecovery() {
        if (!this._errorRecovery) {
            await this.init();
            this._errorRecovery = new ErrorRecovery(this.orgAlias, this.options);
            await this._errorRecovery.init();
        }
        return this._errorRecovery;
    }

    /**
     * Execute operation with automatic retry and error recovery
     */
    async executeWithRetry(operation, options = {}) {
        const recovery = await this._ensureErrorRecovery();
        return await recovery.executeWithRetry(operation, options);
    }

    /**
     * Execute operation with automatic retry AND validation bypass
     * This is the ULTIMATE error-proof execution method
     */
    async executeWithRecovery(operation, options = {}) {
        const { objectName, ...retryOptions } = options;

        if (!objectName) {
            // No object name, just use retry
            return await this.executeWithRetry(operation, retryOptions);
        }

        // Wrap operation with validation bypass, then add retry
        return await this.executeWithRetry(async () => {
            return await this.executeWithBypass(objectName, operation, options);
        }, retryOptions);
    }

    /**
     * Execute bulk operation with automatic splitting on failure
     */
    async executeWithSplitting(records, operation, options = {}) {
        const recovery = await this._ensureErrorRecovery();
        return await recovery.executeWithSplitting(records, operation, options);
    }

    /**
     * Get error statistics
     */
    async getErrorStats() {
        const recovery = await this._ensureErrorRecovery();
        return recovery.getErrorStats();
    }

    // ========================================================================
    // CONVENIENCE METHODS (Common Workflows)
    // ========================================================================

    /**
     * Complete attribution backfill workflow
     * Handles: query → attribution calculation → CSV generation → bulk update
     */
    async backfillAttribution(contactIds, fields = {}) {
        await this.init();

        if (this.options.verbose) {
            console.log(`\n🎯 Starting attribution backfill for ${contactIds.length} contacts...`);
        }

        // Step 1: Calculate attribution
        const attribution = await this.getFirstLastTouch(contactIds);

        // Step 2: Generate CSV
        const csv = await this.generateAttributionCSV(contactIds, fields);

        // Step 3: Return data ready for bulk API
        return {
            attribution,
            csv,
            summary: {
                totalContacts: contactIds.length,
                contactsWithCampaigns: Object.values(attribution).filter(a => a.journeyCount > 0).length,
                averageTouches: (Object.values(attribution).reduce((sum, a) => sum + a.journeyCount, 0) / contactIds.length).toFixed(1)
            }
        };
    }

    /**
     * Complete funnel classification workflow
     * Handles: classification → distribution analysis → CSV generation
     */
    async classifyAndUpdate(recordIds, funnelStageField, options = {}) {
        await this.init();

        if (this.options.verbose) {
            console.log(`\n📊 Starting funnel classification for ${recordIds.length} records...`);
        }

        // Step 1: Classify
        const classifications = await this.classifyByFunnel(recordIds, options);

        // Step 2: Get distribution
        const distribution = await this.getFunnelDistribution(recordIds, options);

        // Step 3: Generate CSV
        const csv = await this.generateFunnelStageCSV(recordIds, funnelStageField, options);

        return {
            classifications,
            distribution,
            csv,
            summary: distribution.summary
        };
    }

    // ========================================================================
    // CSV ENRICHMENT & FUZZY MATCHING
    // ========================================================================

    /**
     * Get or create fuzzy matcher instance
     */
    async _ensureFuzzyMatcher(options = {}) {
        if (!this._fuzzyMatcher) {
            await this.init();
            this._fuzzyMatcher = new FuzzyAccountMatcher(this.orgAlias, options);
        }
        return this._fuzzyMatcher;
    }

    /**
     * Fuzzy match entity names to Salesforce records
     *
     * @param {Array<string>} names - Entity names to match
     * @param {Object} options - Matching options
     * @returns {Object} Match results with statistics
     *
     * @example
     * const results = await toolkit.fuzzyMatch([
     *   'CA: Bakersfield PD',
     *   'FL: Miami Police Department'
     * ], {
     *   entityType: 'Account',
     *   returnFields: ['Id', 'Name', 'OwnerId']
     * });
     */
    async fuzzyMatch(names, options = {}) {
        await this.init();

        if (this.options.verbose) {
            console.log(`\n🔍 Fuzzy matching ${names.length} entities...`);
        }

        const matcher = await this._ensureFuzzyMatcher(options);
        const results = await matcher.match(names);

        if (this.options.verbose) {
            console.log(`✓ Matched ${results.stats.matched}/${results.stats.total} (${results.stats.matchRate}%)`);
        }

        return results;
    }

    /**
     * Validate fuzzy matches against authoritative source
     *
     * @param {Object} matchResults - Results from fuzzyMatch()
     * @param {Object} authoritativeData - Known-good entity → ID mappings
     * @returns {Array} List of mismatches that need correction
     */
    async validateMatches(matchResults, authoritativeData) {
        const matcher = await this._ensureFuzzyMatcher();
        return await matcher.validateAgainstSource(matchResults, authoritativeData);
    }

    /**
     * Apply corrections from authoritative source
     *
     * @param {Object} matchResults - Results from fuzzyMatch()
     * @param {Array} mismatches - Mismatches from validateMatches()
     * @returns {Object} Updated match results
     */
    async applyCorrections(matchResults, mismatches) {
        const matcher = await this._ensureFuzzyMatcher();
        return await matcher.applyCorrections(matchResults, mismatches);
    }

    /**
     * Apply mappings from authoritative source for unmatched records
     *
     * @param {Object} matchResults - Results from fuzzyMatch()
     * @param {Object} mappings - Entity name → Salesforce name mappings
     * @returns {Object} Updated match results
     */
    async applyMappings(matchResults, mappings) {
        const matcher = await this._ensureFuzzyMatcher();
        return await matcher.applyMappings(matchResults, mappings);
    }

    /**
     * Complete CSV enrichment workflow
     * Handles: fuzzy matching → validation → enrichment → reporting
     *
     * @param {Array<string>} names - Entity names to match
     * @param {Object} options - Enrichment options
     * @returns {Object} Complete enrichment results
     *
     * @example
     * const results = await toolkit.enrichCsvWithSalesforceIds(
     *   ['CA: Bakersfield PD', 'FL: Miami PD'],
     *   {
     *     entityType: 'Account',
     *     authoritativeSource: authData,
     *     additionalColumns: [
     *       { name: 'RecordTypeId', value: '012xxx' }
     *     ]
     *   }
     * );
     */
    async enrichCsvWithSalesforceIds(names, options = {}) {
        await this.init();

        if (this.options.verbose) {
            console.log(`\n📊 Starting CSV enrichment workflow...`);
        }

        // Step 1: Fuzzy matching
        let results = await this.fuzzyMatch(names, options);

        // Step 2: Validation (if authoritative source provided)
        if (options.authoritativeSource) {
            if (this.options.verbose) {
                console.log(`\n✓ Validating against authoritative source...`);
            }

            const mismatches = await this.validateMatches(results, options.authoritativeSource);

            if (mismatches.length > 0) {
                if (this.options.verbose) {
                    console.log(`⚠ Found ${mismatches.length} mismatches, applying corrections...`);
                }
                results = await this.applyCorrections(results, mismatches);
            }

            // Apply mappings for unmatched
            if (options.authoritativeMappings) {
                results = await this.applyMappings(results, options.authoritativeMappings);
            }
        }

        // Step 3: Return enriched data
        return {
            matched: results.matched,
            unmatched: results.unmatched,
            stats: results.stats,
            lookupTable: this._generateLookupTable(results.matched),
            summary: {
                total: results.stats.total,
                matched: results.stats.matched,
                matchRate: results.stats.matchRate,
                unmatched: results.stats.unmatched,
                corrected: options.authoritativeSource ? results.stats.corrected || 0 : 0
            }
        };
    }

    /**
     * Generate lookup table from matched results
     */
    _generateLookupTable(matched) {
        const table = {};

        for (const [name, data] of Object.entries(matched)) {
            table[name] = {
                recordId: data.recordId,
                salesforceName: data.salesforceName,
                ownerId: data.ownerId,
                matchType: data.matchType,
                confidence: data.confidence
            };

            if (data.previousRecordId) {
                table[name].previousRecordId = data.previousRecordId;
                table[name].previousMatchType = data.previousMatchType;
            }
        }

        return table;
    }

    // ========================================================================
    // PLAYBOOK & OPERATION MANAGEMENT (NEW v3.2)
    // ========================================================================

    /**
     * Execute renewal import using contract renewal playbook
     *
     * @param {Object} config - Import configuration
     * @param {string} config.csvPath - Path to renewal CSV file
     * @param {string} config.fieldMappingPath - Path to field mapping config
     * @param {Object} config.advocateAssignment - Advocate assignment settings
     * @param {Object} config.validation - Validation settings
     * @returns {Promise<Object>} Import results with success/failed records
     *
     * @example
     * const results = await kit.executeRenewalImport({
     *   csvPath: 'data/renewals.csv',
     *   fieldMappingPath: 'field-mapping.json',
     *   advocateAssignment: {
     *     enabled: true,
     *     mappingFile: 'advocate-analysis.json'
     *   },
     *   validation: {
     *     preflight: true,
     *     strictMode: false
     *   }
     * });
     */
    async executeRenewalImport(config) {
        await this.init();

        const { IdempotentBulkOperation } = require('./idempotent-bulk-operation');
        const { FieldMappingEngine } = require('./field-mapping-engine');
        const { OperationLinker } = require('./operation-linker');

        // Auto-discover related operations
        const linker = new OperationLinker(this.orgAlias);
        const integrations = linker.discoverIntegrations('renewal-import');

        if (integrations.suggestions.length > 0 && this.options.verbose) {
            console.log(`\n🔗 Found ${integrations.suggestions.length} related operations:`);
            for (const suggestion of integrations.suggestions) {
                console.log(`   • ${suggestion.operation.type}: ${suggestion.description}`);
            }
        }

        // Load field mapping
        const fieldMapping = JSON.parse(require('fs').readFileSync(config.fieldMappingPath, 'utf8'));
        const mappingEngine = new FieldMappingEngine(fieldMapping);

        // Create idempotent operation
        const operation = new IdempotentBulkOperation(this.orgAlias, {
            operationId: config.operationId,
            operationType: 'renewal-import',
            enableRollback: config.enableRollback !== false
        });

        // Check if already executed
        if (await operation.isAlreadyExecuted()) {
            const existing = await operation.getExistingResult();
            if (this.options.verbose) {
                console.log(`\n⚠️  Operation already executed at ${existing.timestamp}`);
            }
            return existing;
        }

        // Run preflight validation if enabled
        if (config.validation && config.validation.preflight) {
            const validationResults = await this.validateBeforeImport({
                objectType: 'Opportunity',
                csvPath: config.csvPath,
                fieldMapping: fieldMapping
            });

            if (validationResults.errors.length > 0) {
                throw new Error(`Preflight validation failed: ${validationResults.errors.map(e => e.message).join(', ')}`);
            }
        }

        // Transform CSV
        const additionalData = await this._loadAdditionalData(config);
        const transformResults = mappingEngine.transformCsv(config.csvPath, { additionalData });

        if (transformResults.failed > 0) {
            throw new Error(`CSV transformation failed for ${transformResults.failed} records`);
        }

        // Execute with operation wrapper
        const results = await operation.execute(async (opId) => {
            return await this._executeBulkUpsert(transformResults.records);
        });

        // Record operation for future linking
        linker.recordOperation({
            type: 'renewal-import',
            description: `Imported ${results.successful?.length || 0} renewal opportunities`,
            outputs: [config.csvPath],
            stats: {
                recordCount: transformResults.total,
                successful: results.successful?.length || 0,
                failed: results.failed?.length || 0
            },
            config: config
        });

        return results;
    }

    /**
     * Validate operation before execution (preflight check)
     *
     * @param {Object} config - Validation configuration
     * @param {string} config.objectType - Salesforce object type
     * @param {string} config.csvPath - Path to CSV file
     * @param {Object} config.fieldMapping - Field mapping configuration
     * @returns {Promise<Object>} Validation results with errors/warnings
     */
    async validateBeforeImport(config) {
        await this.init();

        const { PreflightValidator } = require('./preflight-validator');
        const validator = new PreflightValidator(this.orgAlias);

        const results = await validator.validate({
            objectType: config.objectType,
            csvPath: config.csvPath,
            fieldMapping: config.fieldMapping,
            checkPicklists: true,
            checkValidationRules: true,
            checkFieldHistory: true
        });

        if (this.options.verbose) {
            console.log(`\n📋 Preflight Validation Results:`);
            console.log(`   Errors: ${results.errors.length}`);
            console.log(`   Warnings: ${results.warnings.length}`);
        }

        return results;
    }

    /**
     * Find related operations from prior days
     *
     * @param {string} operationType - Type of operation to find related work for
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Related operations with relevance scores
     *
     * @example
     * const related = await kit.findRelatedOperations('renewal-import');
     * // Returns: [{ operation: {...}, relevance: 15, description: "..." }]
     */
    async findRelatedOperations(operationType, options = {}) {
        await this.init();

        const { OperationLinker } = require('./operation-linker');
        const linker = new OperationLinker(this.orgAlias, options);

        const related = linker.findRelatedOperations(operationType, options);

        if (this.options.verbose && related.length > 0) {
            console.log(`\n🔍 Found ${related.length} related operations:`);
            for (const { operation, relevance } of related) {
                console.log(`   • ${operation.type} (${relevance} relevance)`);
            }
        }

        return related;
    }

    /**
     * Record operation for future cross-day integration
     *
     * @param {Object} metadata - Operation metadata
     * @param {string} metadata.type - Operation type
     * @param {string} metadata.description - Human-readable description
     * @param {string[]} metadata.outputs - Output file paths
     * @param {Object} metadata.stats - Statistics
     * @returns {Promise<Object>} Recorded operation
     *
     * @example
     * await kit.recordOperation({
     *   type: 'advocate-mapping',
     *   description: 'Mapped 134 agencies to customer advocates',
     *   outputs: ['advocate-analysis.json'],
     *   stats: { recordCount: 134, matchRate: 0.96 }
     * });
     */
    async recordOperation(metadata) {
        await this.init();

        const { OperationLinker } = require('./operation-linker');
        const linker = new OperationLinker(this.orgAlias);

        const operation = linker.recordOperation(metadata);

        if (this.options.verbose) {
            console.log(`\n✅ Operation recorded: ${operation.id}`);
        }

        return operation;
    }

    /**
     * Load additional data for field mapping (Account names, advocate assignments)
     * @private
     */
    async _loadAdditionalData(config) {
        const data = {};

        // Load Account metadata for naming
        try {
            const accounts = await this.queries.getAccounts();
            data.accounts = accounts.reduce((acc, a) => {
                acc[a.Id] = a;
                return acc;
            }, {});
        } catch (error) {
            if (this.options.verbose) {
                console.log(`⚠️  Could not load Account metadata: ${error.message}`);
            }
        }

        // Load advocate assignments if configured
        if (config.advocateAssignment && config.advocateAssignment.enabled) {
            const fs = require('fs');
            const advocatePath = config.advocateAssignment.mappingFile;
            if (fs.existsSync(advocatePath)) {
                data.advocateAssignments = JSON.parse(fs.readFileSync(advocatePath, 'utf8'));
            }
        }

        return data;
    }

    /**
     * Execute bulk upsert operation
     * @private
     */
    async _executeBulkUpsert(records) {
        const { BulkAPIHandler } = require('./bulk-api-handler');
        const handler = await BulkAPIHandler.fromSFAuth(this.orgAlias);

        return await handler.smartOperation('insert', 'Opportunity', records);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export individual classes for direct use
module.exports = {
    // Main toolkit
    InstanceAgnosticToolkit,

    // Core utilities
    getOrgContext,
    requireOrgContext,
    getOrgParam,
    FieldMapper,
    InstanceConfig,

    // Business logic
    CampaignAttribution,
    FunnelClassifier,
    StandardQueries,

    // Data enrichment
    FuzzyAccountMatcher,

    // Error handling
    SmartValidationBypass,
    ErrorRecovery,
    ErrorCategory,

    // Convenience: Create toolkit instance
    createToolkit: (orgAlias = null, options = {}) => {
        return new InstanceAgnosticToolkit(orgAlias, options);
    }
};

// ============================================================================
// CLI USAGE
// ============================================================================

if (require.main === module) {
    (async () => {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         Instance-Agnostic Toolkit for Salesforce             ║
║              Unified Utility Library v1.0                     ║
╚═══════════════════════════════════════════════════════════════╝

Available Components:
  • Org Context Auto-Detection
  • Field Mapping Registry
  • Instance Configuration Storage
  • Campaign Attribution Analysis
  • Funnel Classification Engine
  • Standard Query Library
  • CSV Enrichment & Fuzzy Matching
  • Smart Validation Bypass
  • Enhanced Error Recovery

Usage in Scripts:
  const toolkit = require('./scripts/lib/instance-agnostic-toolkit');
  const kit = toolkit.createToolkit();
  await kit.init();

  // Auto-detect org
  const org = await kit.getOrgContext();

  // Get field without exact API name
  const field = await kit.getField('Contact', 'funnel stage');

  // Execute with full error recovery
  const result = await kit.executeWithRecovery(async () => {
      return await myBulkOperation();
  }, { objectName: 'Contact' });

Documentation:
  See individual module files for detailed API documentation.

Toolkit initialized for: ${await (async () => {
            try {
                const toolkit = new InstanceAgnosticToolkit(null, { verbose: false });
                await toolkit.init();
                const org = await toolkit.getOrgContext();
                return org.alias;
            } catch (e) {
                return 'No org detected';
            }
        })()}
`);
    })();
}
