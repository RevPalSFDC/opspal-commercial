#!/usr/bin/env node

/**
 * HubSpot Report Clone Validator
 *
 * Validates HubSpot report cloning operations before execution to prevent:
 * 1. Target list doesn't exist errors
 * 2. Object type mismatch (cloning Contact report to Company list)
 * 3. Permission errors (user doesn't have access to target list)
 * 4. Invalid report configuration for target list
 *
 * This prevents tool-contract failures by ensuring all prerequisites
 * for report cloning are met before the operation.
 *
 * Usage:
 *   const validator = new HubSpotReportCloneValidator(portalId, accessToken);
 *   const result = await validator.validate(cloneRequest);
 *
 * Example validation:
 *   Source: Contact report (ID: 123)
 *   Target: Company list (ID: 456)
 *   → ERROR: Object type mismatch (Contact vs Company)
 *
 * @module hubspot-report-clone-validator
 * @version 1.0.0
 * @created 2025-10-26
 * @addresses Reflection Cohort - HubSpot Report Clone Issues ($32k annual ROI)
 */

const https = require('https');

class HubSpotReportCloneValidator {
    constructor(portalId, accessToken, options = {}) {
        this.portalId = portalId;
        this.accessToken = accessToken;
        this.verbose = options.verbose || false;
        this.checkPermissions = options.checkPermissions !== false; // Default true
        this.checkObjectTypes = options.checkObjectTypes !== false; // Default true

        this.apiBase = 'api.hubapi.com';

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            errors: {
                listNotFound: 0,
                reportNotFound: 0,
                objectTypeMismatch: 0,
                permissionDenied: 0,
                invalidConfiguration: 0
            }
        };
    }

    /**
     * Validate report clone operation
     *
     * @param {Object} cloneRequest - Report clone request
     * @param {string} cloneRequest.sourceReportId - Source report ID
     * @param {string} cloneRequest.targetListId - Target list ID
     * @param {string} cloneRequest.newReportName - New report name (optional)
     * @returns {Object} Validation result with errors, warnings, and suggestions
     */
    async validate(cloneRequest) {
        this.stats.totalValidations++;

        const result = {
            valid: false,
            sourceReportId: cloneRequest.sourceReportId,
            targetListId: cloneRequest.targetListId,
            errors: [],
            warnings: [],
            suggestions: [],
            metadata: {
                sourceReport: null,
                targetList: null,
                objectTypeMatch: null,
                permissionsValid: null
            }
        };

        // Validate required fields
        if (!cloneRequest.sourceReportId) {
            result.errors.push({
                type: 'MISSING_FIELD',
                message: 'sourceReportId is required',
                severity: 'CRITICAL',
                field: 'sourceReportId'
            });
        }

        if (!cloneRequest.targetListId) {
            result.errors.push({
                type: 'MISSING_FIELD',
                message: 'targetListId is required',
                severity: 'CRITICAL',
                field: 'targetListId'
            });
        }

        // Can't proceed without IDs
        if (result.errors.length > 0) {
            this.stats.failed++;
            return result;
        }

        try {
            // Step 1: Verify source report exists and get metadata
            const sourceReport = await this.getReport(cloneRequest.sourceReportId);
            if (!sourceReport) {
                result.errors.push({
                    type: 'REPORT_NOT_FOUND',
                    message: `Source report '${cloneRequest.sourceReportId}' not found`,
                    severity: 'ERROR',
                    reportId: cloneRequest.sourceReportId,
                    suggestion: 'Verify the report ID is correct and the report exists'
                });
                this.stats.errors.reportNotFound++;
            } else {
                result.metadata.sourceReport = sourceReport;
            }

            // Step 2: Verify target list exists and get metadata
            const targetList = await this.getList(cloneRequest.targetListId);
            if (!targetList) {
                result.errors.push({
                    type: 'LIST_NOT_FOUND',
                    message: `Target list '${cloneRequest.targetListId}' not found`,
                    severity: 'ERROR',
                    listId: cloneRequest.targetListId,
                    suggestion: 'Verify the list ID is correct and the list exists in this portal'
                });
                this.stats.errors.listNotFound++;
            } else {
                result.metadata.targetList = targetList;
            }

            // Can't proceed if either doesn't exist
            if (!sourceReport || !targetList) {
                this.stats.failed++;
                return result;
            }

            // Step 3: Validate object type compatibility
            if (this.checkObjectTypes) {
                const objectTypeResult = this.validateObjectTypes(sourceReport, targetList);
                result.metadata.objectTypeMatch = objectTypeResult.match;

                if (!objectTypeResult.match) {
                    result.errors.push({
                        type: 'OBJECT_TYPE_MISMATCH',
                        message: objectTypeResult.message,
                        severity: 'ERROR',
                        sourceObjectType: objectTypeResult.sourceType,
                        targetObjectType: objectTypeResult.targetType,
                        suggestion: 'Use a list with the same object type as the source report'
                    });
                    this.stats.errors.objectTypeMismatch++;
                }
            }

            // Step 4: Check permissions
            if (this.checkPermissions) {
                const permissionResult = await this.validatePermissions(sourceReport, targetList);
                result.metadata.permissionsValid = permissionResult.valid;

                if (!permissionResult.valid) {
                    result.errors.push({
                        type: 'PERMISSION_DENIED',
                        message: permissionResult.message,
                        severity: 'ERROR',
                        details: permissionResult.details,
                        suggestion: 'Ensure you have read access to source report and write access to target list'
                    });
                    this.stats.errors.permissionDenied++;
                }
            }

            // Step 5: Validate report configuration compatibility
            const configResult = this.validateConfiguration(sourceReport, targetList);
            if (!configResult.valid) {
                result.errors.push(...configResult.errors);
                result.warnings.push(...configResult.warnings);
                this.stats.errors.invalidConfiguration += configResult.errors.length;
            }

            // Determine overall validity
            result.valid = result.errors.length === 0;

            // Update stats
            if (result.valid) {
                this.stats.passed++;
            } else {
                this.stats.failed++;
            }

        } catch (error) {
            result.errors.push({
                type: 'VALIDATION_ERROR',
                message: `Validation failed: ${error.message}`,
                severity: 'CRITICAL',
                error: error.stack
            });
            this.stats.failed++;
        }

        return result;
    }

    /**
     * Get report metadata from HubSpot API
     *
     * @param {string} reportId - Report ID
     * @returns {Object|null} Report metadata or null if not found
     */
    async getReport(reportId) {
        try {
            const response = await this.makeApiCall(`/analytics/v2/reports/${reportId}`);

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch report: HTTP ${response.status}`);
            }

            return response.data;
        } catch (error) {
            if (this.verbose) {
                console.error(`Error fetching report ${reportId}:`, error.message);
            }
            return null;
        }
    }

    /**
     * Get list metadata from HubSpot API
     *
     * @param {string} listId - List ID
     * @returns {Object|null} List metadata or null if not found
     */
    async getList(listId) {
        try {
            const response = await this.makeApiCall(`/contacts/v1/lists/${listId}`);

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch list: HTTP ${response.status}`);
            }

            return response.data;
        } catch (error) {
            if (this.verbose) {
                console.error(`Error fetching list ${listId}:`, error.message);
            }
            return null;
        }
    }

    /**
     * Validate object type compatibility between report and list
     *
     * @param {Object} sourceReport - Source report metadata
     * @param {Object} targetList - Target list metadata
     * @returns {Object} Validation result with match status
     */
    validateObjectTypes(sourceReport, targetList) {
        // Extract object types
        const sourceObjectType = this.extractReportObjectType(sourceReport);
        const targetObjectType = this.extractListObjectType(targetList);

        if (!sourceObjectType || !targetObjectType) {
            return {
                match: false,
                message: 'Could not determine object types',
                sourceType: sourceObjectType,
                targetType: targetObjectType
            };
        }

        // Normalize object types (CONTACT, CONTACTS → contact)
        const normalizeType = (type) => {
            return type.toLowerCase().replace(/s$/, ''); // Remove trailing 's'
        };

        const sourceNormalized = normalizeType(sourceObjectType);
        const targetNormalized = normalizeType(targetObjectType);

        if (sourceNormalized !== targetNormalized) {
            return {
                match: false,
                message: `Object type mismatch: Report is for '${sourceObjectType}' but list is for '${targetObjectType}'`,
                sourceType: sourceObjectType,
                targetType: targetObjectType
            };
        }

        return {
            match: true,
            message: 'Object types match',
            sourceType: sourceObjectType,
            targetType: targetObjectType
        };
    }

    /**
     * Extract object type from report metadata
     */
    extractReportObjectType(report) {
        // HubSpot reports typically have objectType or dataType field
        return report.objectType || report.dataType || report.type || 'unknown';
    }

    /**
     * Extract object type from list metadata
     */
    extractListObjectType(list) {
        // HubSpot lists have listType field
        // Static lists: STATIC, Dynamic lists: DYNAMIC
        // Object type is in the list's metadata
        return list.objectTypeId || list.listType || 'unknown';
    }

    /**
     * Validate permissions on source report and target list
     *
     * @param {Object} sourceReport - Source report metadata
     * @param {Object} targetList - Target list metadata
     * @returns {Object} Validation result
     */
    async validatePermissions(sourceReport, targetList) {
        // Note: Full permission checking requires additional API calls
        // This is a simplified check based on metadata

        const result = {
            valid: true,
            message: 'Permissions appear valid',
            details: {}
        };

        // Check if user can read source report
        if (sourceReport.readOnly === true) {
            result.details.sourceReport = 'read-only';
        }

        // Check if target list is editable
        if (targetList.readOnly === true || targetList.internal === true) {
            result.valid = false;
            result.message = 'Target list is read-only or internal';
            result.details.targetList = 'read-only';
        }

        // Check if list is archived
        if (targetList.archived === true) {
            result.valid = false;
            result.message = 'Target list is archived';
            result.details.targetList = 'archived';
        }

        return result;
    }

    /**
     * Validate report configuration compatibility with target list
     *
     * @param {Object} sourceReport - Source report metadata
     * @param {Object} targetList - Target list metadata
     * @returns {Object} Validation result with errors and warnings
     */
    validateConfiguration(sourceReport, targetList) {
        const errors = [];
        const warnings = [];

        // Check if report uses properties not available on target object type
        if (sourceReport.dimensions || sourceReport.metrics) {
            warnings.push({
                type: 'CONFIG_WARNING',
                message: 'Report uses custom dimensions/metrics - verify they exist on target object type',
                severity: 'WARNING',
                suggestion: 'Check that all report dimensions and metrics are available for the target list object type'
            });
        }

        // Check if list has filters that might conflict
        if (targetList.filters && targetList.filters.length > 0) {
            warnings.push({
                type: 'CONFIG_WARNING',
                message: 'Target list has existing filters - cloned report may show unexpected results',
                severity: 'WARNING',
                filterCount: targetList.filters.length,
                suggestion: 'Review list filters to ensure they align with report expectations'
            });
        }

        // Check list size
        if (targetList.metaData && targetList.metaData.size > 10000) {
            warnings.push({
                type: 'CONFIG_WARNING',
                message: 'Target list is large (>10,000 records) - report may take time to generate',
                severity: 'WARNING',
                listSize: targetList.metaData.size,
                suggestion: 'Consider using a smaller list for faster report generation'
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    /**
     * Make HubSpot API call
     *
     * @param {string} path - API path (e.g., /contacts/v1/lists/123)
     * @param {string} method - HTTP method (default: GET)
     * @returns {Promise<Object>} API response
     */
    makeApiCall(path, method = 'GET') {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.apiBase,
                path: path,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    const response = {
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        data: null
                    };

                    if (data) {
                        try {
                            response.data = JSON.parse(data);
                        } catch (e) {
                            response.data = data;
                        }
                    }

                    resolve(response);
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            errors: {
                listNotFound: 0,
                reportNotFound: 0,
                objectTypeMismatch: 0,
                permissionDenied: 0,
                invalidConfiguration: 0
            }
        };
    }
}

module.exports = HubSpotReportCloneValidator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.log('Usage: hubspot-report-clone-validator.js <portalId> <accessToken> <sourceReportId> <targetListId>');
        console.log('');
        console.log('Example:');
        console.log('  node hubspot-report-clone-validator.js 12345 pat-xxx report-123 list-456');
        console.log('');
        console.log('Environment Variables:');
        console.log('  HUBSPOT_PORTAL_ID - HubSpot portal ID');
        console.log('  HUBSPOT_ACCESS_TOKEN - HubSpot access token');
        process.exit(1);
    }

    const [portalId, accessToken, sourceReportId, targetListId] = args;
    const validator = new HubSpotReportCloneValidator(portalId, accessToken, { verbose: true });

    (async () => {
        try {
            console.log('\n📊 Validating report clone operation...\n');
            console.log(`Source Report: ${sourceReportId}`);
            console.log(`Target List: ${targetListId}\n`);

            const result = await validator.validate({
                sourceReportId,
                targetListId
            });

            console.log(`\n${result.valid ? '✅' : '❌'} Validation Result: ${result.valid ? 'VALID' : 'INVALID'}\n`);

            if (result.errors.length > 0) {
                console.log('Errors:');
                for (const error of result.errors) {
                    console.log(`  ❌ ${error.message}`);
                    if (error.suggestion) {
                        console.log(`     💡 ${error.suggestion}`);
                    }
                }
                console.log('');
            }

            if (result.warnings.length > 0) {
                console.log('Warnings:');
                for (const warning of result.warnings) {
                    console.log(`  ⚠️  ${warning.message}`);
                    if (warning.suggestion) {
                        console.log(`     💡 ${warning.suggestion}`);
                    }
                }
                console.log('');
            }

            if (result.metadata.sourceReport && result.metadata.targetList) {
                console.log('Metadata:');
                console.log(`  Source Object Type: ${result.metadata.sourceReport.objectType || 'unknown'}`);
                console.log(`  Target Object Type: ${result.metadata.targetList.objectTypeId || result.metadata.targetList.listType}`);
                console.log(`  Object Types Match: ${result.metadata.objectTypeMatch ? '✓' : '✗'}`);
                console.log(`  Permissions Valid: ${result.metadata.permissionsValid ? '✓' : '✗'}`);
                console.log('');
            }

            console.log('Statistics:');
            console.log(JSON.stringify(validator.getStats(), null, 2));

            process.exit(result.valid ? 0 : 1);

        } catch (error) {
            console.error('❌ Error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}
