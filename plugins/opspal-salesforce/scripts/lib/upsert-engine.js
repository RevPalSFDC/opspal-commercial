/**
 * Salesforce Upsert Engine
 *
 * Core orchestration engine for Lead/Contact/Account upsert operations.
 * Coordinates matching, field mapping, enrichment, ownership, and error handling.
 *
 * @module upsert-engine
 * @version 1.0.0
 */

const { UpsertMatcher } = require('./upsert-matcher');
const { LeadToAccountMatcher } = require('./lead-to-account-matcher');
const { UpsertFieldMapper } = require('./upsert-field-mapper');
const fs = require('fs').promises;
const path = require('path');

/**
 * Default configuration for upsert operations
 */
const DEFAULT_CONFIG = {
    batchSize: 200,
    continueOnError: true,
    enableEnrichment: false,
    enableOwnershipRouting: true,
    enableAutoConvert: false,
    matching: {
        fuzzyThreshold: 0.75,
        crossObjectDedup: true,
        domainMatchEnabled: true
    },
    fieldMapping: {
        nullHandling: 'preserveExisting'
    },
    errorHandling: {
        maxRetries: 3,
        escalateOnMaxRetries: true
    }
};

/**
 * Operation status constants
 */
const OPERATION_STATUS = {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
    FAILED: 'FAILED'
};

/**
 * Record action types
 */
const RECORD_ACTIONS = {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    SKIP: 'SKIP',
    REVIEW: 'REVIEW',
    FAILED: 'FAILED'
};

/**
 * Core Upsert Engine class
 */
class UpsertEngine {
    /**
     * Create a new UpsertEngine instance
     * @param {Object} config - Configuration options
     * @param {Object} sfConnection - Salesforce connection/query executor
     */
    constructor(config = {}, sfConnection = null) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.sfConnection = sfConnection;
        this.matcher = new UpsertMatcher(this.config.matching);
        this.leadAccountMatcher = new LeadToAccountMatcher(this.config.matching);
        this.fieldMapper = new UpsertFieldMapper(this.config.fieldMapping);
        this.operationId = null;
        this.auditLog = [];
    }

    /**
     * Generate a unique operation ID
     * @returns {string} Operation ID
     */
    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Execute upsert operation for multiple records
     * @param {Array} records - Records to upsert
     * @param {string} objectType - Salesforce object type (Lead, Contact, Account)
     * @param {Object} options - Operation options
     * @returns {Promise<Object>} Operation results
     */
    async upsertRecords(records, objectType, options = {}) {
        this.operationId = this.generateOperationId();
        const startTime = Date.now();

        const results = {
            operationId: this.operationId,
            objectType,
            status: OPERATION_STATUS.PROCESSING,
            timestamp: new Date().toISOString(),
            summary: {
                total: records.length,
                created: 0,
                updated: 0,
                skipped: 0,
                review: 0,
                failed: 0
            },
            matchingStats: {
                idMatch: 0,
                emailMatch: 0,
                compositeMatch: 0,
                fuzzyMatch: 0,
                domainMatch: 0,
                noMatch: 0
            },
            records: [],
            errors: [],
            warnings: []
        };

        try {
            // Step 1: Normalize and validate records
            const normalizedRecords = await this.normalizeRecords(records, objectType);

            // Step 2: Batch process records
            const batches = this.chunkArray(normalizedRecords, this.config.batchSize);

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                this.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} records)`);

                const batchResults = await this.processBatch(batch, objectType, options);

                // Aggregate results
                results.summary.created += batchResults.created.length;
                results.summary.updated += batchResults.updated.length;
                results.summary.skipped += batchResults.skipped.length;
                results.summary.review += batchResults.review.length;
                results.summary.failed += batchResults.failed.length;

                results.records.push(...batchResults.records);
                results.errors.push(...batchResults.errors);
                results.warnings.push(...batchResults.warnings);

                // Aggregate matching stats
                for (const [key, value] of Object.entries(batchResults.matchingStats)) {
                    results.matchingStats[key] = (results.matchingStats[key] || 0) + value;
                }
            }

            // Determine final status
            if (results.summary.failed === 0) {
                results.status = OPERATION_STATUS.COMPLETED;
            } else if (results.summary.created + results.summary.updated > 0) {
                results.status = OPERATION_STATUS.PARTIAL_SUCCESS;
            } else {
                results.status = OPERATION_STATUS.FAILED;
            }

        } catch (error) {
            results.status = OPERATION_STATUS.FAILED;
            results.errors.push({
                type: 'OPERATION_ERROR',
                message: error.message,
                stack: error.stack
            });
        }

        results.duration_ms = Date.now() - startTime;
        results.recordsPerSecond = (results.summary.total / (results.duration_ms / 1000)).toFixed(2);

        // Log operation
        await this.logOperation(results);

        return results;
    }

    /**
     * Process a batch of records
     * @param {Array} records - Batch of records
     * @param {string} objectType - Object type
     * @param {Object} options - Options
     * @returns {Promise<Object>} Batch results
     */
    async processBatch(records, objectType, options) {
        const batchResults = {
            created: [],
            updated: [],
            skipped: [],
            review: [],
            failed: [],
            records: [],
            errors: [],
            warnings: [],
            matchingStats: {}
        };

        // Batch match all records
        const matchResults = await this.batchMatch(records, objectType);

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const matchResult = matchResults[i];

            try {
                const processResult = await this.processRecord(
                    record,
                    matchResult,
                    objectType,
                    options
                );

                // Track matching stats
                const matchType = processResult.matchType || 'noMatch';
                batchResults.matchingStats[matchType] = (batchResults.matchingStats[matchType] || 0) + 1;

                // Categorize result
                switch (processResult.action) {
                    case RECORD_ACTIONS.CREATE:
                        batchResults.created.push(processResult);
                        break;
                    case RECORD_ACTIONS.UPDATE:
                        batchResults.updated.push(processResult);
                        break;
                    case RECORD_ACTIONS.SKIP:
                        batchResults.skipped.push(processResult);
                        break;
                    case RECORD_ACTIONS.REVIEW:
                        batchResults.review.push(processResult);
                        break;
                    case RECORD_ACTIONS.FAILED:
                        batchResults.failed.push(processResult);
                        batchResults.errors.push({
                            record: this.redactSensitive(record),
                            error: processResult.error
                        });
                        break;
                }

                batchResults.records.push(processResult);

            } catch (error) {
                batchResults.failed.push({
                    record: this.redactSensitive(record),
                    action: RECORD_ACTIONS.FAILED,
                    error: { message: error.message }
                });

                if (this.config.continueOnError) {
                    batchResults.errors.push({
                        record: this.redactSensitive(record),
                        error: { message: error.message }
                    });
                    continue;
                } else {
                    throw error;
                }
            }
        }

        return batchResults;
    }

    /**
     * Process a single record
     * @param {Object} record - Record to process
     * @param {Object} matchResult - Match result from matcher
     * @param {string} objectType - Object type
     * @param {Object} options - Options
     * @returns {Promise<Object>} Process result
     */
    async processRecord(record, matchResult, objectType, options) {
        const result = {
            inputRecord: this.redactSensitive(record),
            action: null,
            recordId: null,
            matchType: matchResult?.matchType || 'noMatch',
            matchConfidence: matchResult?.confidence || 0,
            fieldsUpdated: [],
            previousValues: {},
            newValues: {}
        };

        // Determine action based on match
        if (matchResult?.action === 'UPDATE' && matchResult.matchedRecord) {
            // Update existing record
            result.action = RECORD_ACTIONS.UPDATE;
            result.recordId = matchResult.matchedRecord.Id;

            // Map fields and apply transformations
            const mappedData = this.fieldMapper.mapFields(
                record,
                objectType,
                matchResult.matchedRecord
            );

            // Identify changed fields
            for (const [field, value] of Object.entries(mappedData)) {
                if (matchResult.matchedRecord[field] !== value) {
                    result.fieldsUpdated.push(field);
                    result.previousValues[field] = matchResult.matchedRecord[field];
                    result.newValues[field] = value;
                }
            }

            // Execute update if there are changes
            if (result.fieldsUpdated.length > 0) {
                await this.executeUpdate(objectType, result.recordId, mappedData);
            } else {
                result.action = RECORD_ACTIONS.SKIP;
                result.skipReason = 'No fields to update';
            }

        } else if (matchResult?.action === 'REVIEW') {
            // Multiple potential matches - flag for review
            result.action = RECORD_ACTIONS.REVIEW;
            result.reviewReason = 'Multiple potential matches';
            result.candidates = matchResult.candidates?.map(c => ({
                id: c.Id,
                name: c.Name,
                confidence: c.confidence
            }));

        } else {
            // Create new record
            result.action = RECORD_ACTIONS.CREATE;

            // Map fields for creation
            const mappedData = this.fieldMapper.mapFields(record, objectType);

            // Execute create
            const createResult = await this.executeCreate(objectType, mappedData);
            result.recordId = createResult.id;
            result.newValues = mappedData;
        }

        // Post-processing

        // Ownership routing
        if (this.config.enableOwnershipRouting && result.recordId) {
            try {
                const ownerResult = await this.assignOwnership(result.recordId, objectType, options);
                if (ownerResult.changed) {
                    result.ownershipAssignment = ownerResult;
                }
            } catch (error) {
                result.warnings = result.warnings || [];
                result.warnings.push({
                    type: 'OWNERSHIP_FAILED',
                    message: error.message
                });
            }
        }

        // Enrichment
        if (this.config.enableEnrichment && result.action === RECORD_ACTIONS.CREATE) {
            try {
                const enrichResult = await this.enrichRecord(result.recordId, objectType);
                if (enrichResult.fieldsEnriched?.length > 0) {
                    result.enrichment = enrichResult;
                }
            } catch (error) {
                result.warnings = result.warnings || [];
                result.warnings.push({
                    type: 'ENRICHMENT_FAILED',
                    message: error.message
                });
            }
        }

        return result;
    }

    /**
     * Batch match records against existing Salesforce data
     * @param {Array} records - Records to match
     * @param {string} objectType - Object type
     * @returns {Promise<Array>} Match results for each record
     */
    async batchMatch(records, objectType) {
        return await this.matcher.matchRecords(records, objectType, this.sfConnection);
    }

    /**
     * Normalize records before processing
     * @param {Array} records - Records to normalize
     * @param {string} objectType - Object type
     * @returns {Promise<Array>} Normalized records
     */
    async normalizeRecords(records, objectType) {
        return records.map(record => {
            const normalized = { ...record };

            // Normalize email
            if (normalized.Email) {
                normalized.Email = normalized.Email.toLowerCase().trim();
            }

            // Normalize phone
            if (normalized.Phone) {
                normalized.Phone = this.normalizePhone(normalized.Phone);
            }

            // Normalize company name
            if (normalized.Company) {
                normalized.Company = normalized.Company.trim();
            }

            return normalized;
        });
    }

    /**
     * Normalize phone number
     * @param {string} phone - Phone number
     * @returns {string} Normalized phone
     */
    normalizePhone(phone) {
        if (!phone) return null;

        const digits = phone.replace(/\D/g, '');

        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }

        if (digits.length === 11 && digits[0] === '1') {
            return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }

        return phone;
    }

    /**
     * Execute Salesforce update
     * @param {string} objectType - Object type
     * @param {string} recordId - Record ID
     * @param {Object} data - Data to update
     * @returns {Promise<Object>} Update result
     */
    async executeUpdate(objectType, recordId, data) {
        // Implementation depends on Salesforce connection
        if (this.sfConnection?.update) {
            return await this.sfConnection.update(objectType, recordId, data);
        }

        // Placeholder for CLI execution
        this.log(`[DRY RUN] Would update ${objectType} ${recordId} with:`, data);
        return { id: recordId, success: true };
    }

    /**
     * Execute Salesforce create
     * @param {string} objectType - Object type
     * @param {Object} data - Data to create
     * @returns {Promise<Object>} Create result
     */
    async executeCreate(objectType, data) {
        if (this.sfConnection?.create) {
            return await this.sfConnection.create(objectType, data);
        }

        // Placeholder for CLI execution
        const mockId = `00${objectType[0]}MOCK${Date.now()}`;
        this.log(`[DRY RUN] Would create ${objectType} with:`, data);
        return { id: mockId, success: true };
    }

    /**
     * Assign ownership to record
     * @param {string} recordId - Record ID
     * @param {string} objectType - Object type
     * @param {Object} options - Options
     * @returns {Promise<Object>} Assignment result
     */
    async assignOwnership(recordId, objectType, options) {
        // Ownership routing logic would be implemented here
        // This is a placeholder that delegates to the ownership-router agent
        return { changed: false };
    }

    /**
     * Enrich record with external data
     * @param {string} recordId - Record ID
     * @param {string} objectType - Object type
     * @returns {Promise<Object>} Enrichment result
     */
    async enrichRecord(recordId, objectType) {
        // Enrichment logic would be implemented here
        // This is a placeholder that delegates to the enrichment-manager agent
        return { fieldsEnriched: [] };
    }

    /**
     * Redact sensitive fields from record
     * @param {Object} record - Record to redact
     * @returns {Object} Redacted record
     */
    redactSensitive(record) {
        const SENSITIVE_FIELDS = ['SSN', 'TaxId', 'CreditCard', 'Password'];
        const redacted = { ...record };

        for (const field of SENSITIVE_FIELDS) {
            if (redacted[field]) {
                redacted[field] = '***REDACTED***';
            }
        }

        return redacted;
    }

    /**
     * Split array into chunks
     * @param {Array} array - Array to chunk
     * @param {number} size - Chunk size
     * @returns {Array} Array of chunks
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Log message to audit log
     * @param {string} message - Message to log
     * @param {Object} data - Additional data
     */
    log(message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            operationId: this.operationId,
            message,
            data
        };
        this.auditLog.push(entry);

        if (this.config.debug) {
            console.log(`[UpsertEngine] ${message}`, data || '');
        }
    }

    /**
     * Log operation to audit file
     * @param {Object} results - Operation results
     */
    async logOperation(results) {
        if (!this.config.auditLogPath) return;

        try {
            const logDir = path.dirname(this.config.auditLogPath);
            await fs.mkdir(logDir, { recursive: true });

            const logEntry = JSON.stringify(results) + '\n';
            await fs.appendFile(this.config.auditLogPath, logEntry);
        } catch (error) {
            console.error('Failed to write audit log:', error.message);
        }
    }
}

/**
 * Convenience function to run upsert operation
 * @param {Array} records - Records to upsert
 * @param {string} objectType - Object type
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Operation results
 */
async function runUpsert(records, objectType, config = {}) {
    const engine = new UpsertEngine(config);
    return await engine.upsertRecords(records, objectType);
}

module.exports = {
    UpsertEngine,
    runUpsert,
    OPERATION_STATUS,
    RECORD_ACTIONS,
    DEFAULT_CONFIG
};
