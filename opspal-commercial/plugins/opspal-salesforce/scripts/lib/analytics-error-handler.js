#!/usr/bin/env node

/**
 * Salesforce Analytics Error Handler
 * 
 * Maps Salesforce report error codes to actionable fixes and provides
 * intelligent recovery strategies based on error patterns.
 * 
 * Based on Salesforce Report Error Codes documentation
 */

const fs = require('fs').promises;
const path = require('path');

class AnalyticsErrorHandler {
    constructor() {
        // Comprehensive error code mappings from Salesforce documentation
        this.errorMappings = [
            // Folder-related errors
            {
                code: 'NULL_FOLDER_ID',
                patterns: [/folder ID can't be null/i, /folderId is required/i],
                message: 'Report folder ID is required',
                suggestion: 'Use sf_resolve_folder_id() to get a valid folder ID',
                recovery: async (context) => {
                    return {
                        action: 'RESOLVE_FOLDER',
                        instruction: 'List available folders and select one',
                        command: 'analytics-discovery.js folders'
                    };
                }
            },
            {
                code: 'INVALID_FOLDER_ID',
                patterns: [/invalid.*folder/i, /folder.*not.*found/i],
                message: 'The specified folder ID is invalid',
                suggestion: 'Verify the folder exists and you have access',
                recovery: async (context) => {
                    return {
                        action: 'LIST_FOLDERS',
                        instruction: 'Choose from available folders',
                        folderId: context.folderId
                    };
                }
            },

            // Field-related errors
            {
                code: 'INVALID_FIELD',
                patterns: [/field.*not.*found/i, /invalid.*field/i, /unknown.*column/i],
                message: 'One or more field tokens are invalid',
                suggestion: 'Use sf_describe_report_type() to find valid field tokens',
                recovery: async (context) => {
                    const fieldMatch = context.error.match(/field[:\s]+([^\s,]+)/i);
                    return {
                        action: 'VALIDATE_FIELDS',
                        invalidField: fieldMatch?.[1],
                        instruction: 'Check field availability for this report type',
                        command: `analytics-discovery.js describe "${context.reportType}"`
                    };
                }
            },
            {
                code: 'FIELD_NOT_ACCESSIBLE',
                patterns: [/field.*not.*accessible/i, /insufficient.*field.*permission/i],
                message: 'User lacks permission to access one or more fields',
                suggestion: 'Check field-level security settings',
                recovery: async (context) => {
                    return {
                        action: 'CHECK_PERMISSIONS',
                        instruction: 'Verify field-level security for the user',
                        alternatives: 'Remove restricted fields or grant permissions'
                    };
                }
            },

            // Report type errors
            {
                code: 'INVALID_REPORT_TYPE',
                patterns: [/report type.*not.*found/i, /invalid.*report.*type/i],
                message: 'The specified report type does not exist',
                suggestion: 'Use sf_discover_report_types() to find valid report types',
                recovery: async (context) => {
                    return {
                        action: 'LIST_REPORT_TYPES',
                        searchPattern: context.reportType,
                        instruction: 'Search for available report types',
                        command: `analytics-discovery.js types "${context.reportType}"`
                    };
                }
            },

            // Aggregate errors
            {
                code: 'INVALID_AGGREGATE',
                patterns: [/aggregate.*invalid/i, /invalid.*aggregate.*function/i],
                message: 'Aggregate syntax or function is invalid',
                suggestion: 'Use proper aggregate tokens (s!Amount for SUM, a!Amount for AVG)',
                recovery: async (context) => {
                    const aggregateMatch = context.error.match(/aggregate[:\s]+([^\s,]+)/i);
                    return {
                        action: 'FIX_AGGREGATE',
                        invalidAggregate: aggregateMatch?.[1],
                        validPrefixes: {
                            'SUM': 's!',
                            'AVG': 'a!',
                            'MIN': 'mn!',
                            'MAX': 'mx!',
                            'COUNT': 'c!',
                            'COUNT_DISTINCT': 'u!'
                        },
                        example: 's!Amount for SUM(Amount)'
                    };
                }
            },

            // Permission errors
            {
                code: 'INSUFFICIENT_PERMISSIONS',
                patterns: [/permission/i, /not.*authorized/i, /access.*denied/i],
                message: 'User lacks permission for this operation',
                suggestion: 'Check user permissions and report folder access',
                recovery: async (context) => {
                    return {
                        action: 'VERIFY_PERMISSIONS',
                        requiredPermissions: [
                            'Create and Customize Reports',
                            'View Reports in Public Folders',
                            'Manage Reports in Public Folders'
                        ],
                        instruction: 'Verify user has these permissions in Profile or Permission Set'
                    };
                }
            },

            // Limit errors
            {
                code: 'LIMIT_EXCEEDED',
                patterns: [/limit.*exceeded/i, /too.*many.*columns/i, /maximum.*reached/i],
                message: 'Report exceeds platform limits',
                suggestion: 'Reduce columns, apply filters, or simplify the report',
                recovery: async (context) => {
                    return {
                        action: 'SIMPLIFY_REPORT',
                        limits: {
                            tabular: { maxColumns: 10, maxRows: 2000 },
                            summary: { maxColumns: 12, maxGroups: 2000 },
                            matrix: { maxColumns: 8, maxCells: 100000 }
                        },
                        instruction: 'Reduce complexity or split into multiple reports'
                    };
                }
            },

            // Date filter errors
            {
                code: 'INVALID_DATE_FILTER',
                patterns: [/invalid.*date.*filter/i, /date.*range.*invalid/i],
                message: 'Date filter configuration is invalid',
                suggestion: 'Use standard date literals like LAST_30_DAYS, THIS_QUARTER',
                recovery: async (context) => {
                    return {
                        action: 'FIX_DATE_FILTER',
                        validDateLiterals: [
                            'TODAY', 'YESTERDAY', 'TOMORROW',
                            'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK',
                            'LAST_MONTH', 'THIS_MONTH', 'NEXT_MONTH',
                            'LAST_90_DAYS', 'NEXT_90_DAYS',
                            'THIS_QUARTER', 'LAST_QUARTER', 'NEXT_QUARTER',
                            'THIS_YEAR', 'LAST_YEAR', 'NEXT_YEAR'
                        ],
                        example: { durationValue: 'LAST_30_DAYS', column: 'CREATED_DATE' }
                    };
                }
            },

            // Format-specific errors
            {
                code: 'INVALID_GROUPING',
                patterns: [/grouping.*required/i, /missing.*group/i],
                message: 'Summary/Matrix reports require groupings',
                suggestion: 'Add at least one grouping field for non-tabular reports',
                recovery: async (context) => {
                    return {
                        action: 'ADD_GROUPING',
                        reportFormat: context.format,
                        instruction: 'Add groupingsDown or groupingsAcross',
                        example: {
                            groupingsDown: [{ name: 'ACCOUNT.NAME', sortOrder: 'ASC' }]
                        }
                    };
                }
            },

            // Metadata structure errors  
            {
                code: 'INVALID_METADATA_STRUCTURE',
                patterns: [/invalid.*structure/i, /malformed.*metadata/i],
                message: 'Report metadata structure is invalid',
                suggestion: 'Validate metadata structure against schema',
                recovery: async (context) => {
                    return {
                        action: 'VALIDATE_STRUCTURE',
                        requiredFields: ['name', 'reportType', 'reportFormat', 'folderId'],
                        conditionalFields: {
                            TABULAR: ['detailColumns'],
                            SUMMARY: ['detailColumns', 'groupingsDown'],
                            MATRIX: ['detailColumns', 'groupingsDown', 'groupingsAcross']
                        }
                    };
                }
            },

            // Generic/Unknown errors
            {
                code: 'UNKNOWN_ERROR',
                patterns: [/.*/],
                message: 'An unexpected error occurred',
                suggestion: 'Check the full error message and Salesforce system status',
                recovery: async (context) => {
                    return {
                        action: 'MANUAL_REVIEW',
                        instruction: 'Review error details and check Salesforce documentation',
                        debugSteps: [
                            'Validate report metadata with query endpoint',
                            'Check Salesforce system status',
                            'Review API limits and usage',
                            'Try creating report manually in UI first'
                        ]
                    };
                }
            }
        ];

        // Track error patterns for learning
        this.errorHistory = [];
        this.maxHistorySize = 100;
    }

    /**
     * Analyze an error and provide recovery strategy
     */
    async analyzeError(error, context = {}) {
        const errorMessage = typeof error === 'string' ? error : error.message || error.toString();
        
        // Find matching error pattern
        const match = this.errorMappings.find(mapping => 
            mapping.patterns.some(pattern => pattern.test(errorMessage))
        );

        if (!match) {
            return this.errorMappings[this.errorMappings.length - 1]; // Return UNKNOWN_ERROR
        }

        // Execute recovery strategy if available
        let recovery = null;
        if (match.recovery) {
            recovery = await match.recovery({ ...context, error: errorMessage });
        }

        // Track error for pattern analysis
        this.trackError({
            code: match.code,
            message: errorMessage,
            context,
            timestamp: new Date().toISOString()
        });

        return {
            code: match.code,
            message: match.message,
            suggestion: match.suggestion,
            recovery,
            originalError: errorMessage,
            context
        };
    }

    /**
     * Track errors for pattern analysis
     */
    trackError(errorData) {
        this.errorHistory.push(errorData);
        
        // Keep history size manageable
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Get error patterns and statistics
     */
    getErrorStatistics() {
        const stats = {};
        
        this.errorHistory.forEach(error => {
            if (!stats[error.code]) {
                stats[error.code] = {
                    count: 0,
                    lastOccurred: null,
                    contexts: []
                };
            }
            
            stats[error.code].count++;
            stats[error.code].lastOccurred = error.timestamp;
            
            // Track unique contexts
            const contextKey = JSON.stringify(error.context.reportType || 'unknown');
            if (!stats[error.code].contexts.includes(contextKey)) {
                stats[error.code].contexts.push(contextKey);
            }
        });

        return {
            totalErrors: this.errorHistory.length,
            errorTypes: Object.keys(stats).length,
            mostCommon: Object.entries(stats)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 5)
                .map(([code, data]) => ({ code, ...data })),
            stats
        };
    }

    /**
     * Generate recovery script based on error
     */
    generateRecoveryScript(errorAnalysis) {
        const scripts = [];

        switch (errorAnalysis.code) {
            case 'NULL_FOLDER_ID':
            case 'INVALID_FOLDER_ID':
                scripts.push('# List available folders');
                scripts.push('node analytics-discovery.js folders');
                scripts.push('# Then use the folder ID in your report creation');
                break;

            case 'INVALID_FIELD':
                scripts.push('# Describe the report type to find valid fields');
                scripts.push(`node analytics-discovery.js describe "${errorAnalysis.context.reportType || 'YourReportType'}"`);
                scripts.push('# Use the exact field tokens from the output');
                break;

            case 'INVALID_REPORT_TYPE':
                scripts.push('# Search for available report types');
                scripts.push('node analytics-discovery.js types');
                scripts.push('# Or search with a pattern');
                scripts.push(`node analytics-discovery.js types "${errorAnalysis.context.reportType || 'pattern'}"`);
                break;

            case 'INVALID_AGGREGATE':
                scripts.push('# Fix aggregate syntax:');
                scripts.push('# SUM: s!FieldName');
                scripts.push('# AVG: a!FieldName');
                scripts.push('# COUNT: c!FieldName');
                scripts.push('# Example: s!Amount for SUM(Amount)');
                break;

            case 'LIMIT_EXCEEDED':
                scripts.push('# Reduce report complexity:');
                scripts.push('# - Limit to 10 columns for Tabular');
                scripts.push('# - Apply date filters to reduce rows');
                scripts.push('# - Split into multiple focused reports');
                break;

            default:
                scripts.push('# Validate report metadata before creation');
                scripts.push('node analytics-discovery.js validate metadata.json');
        }

        return scripts.join('\n');
    }

    /**
     * Save error history to file for analysis
     */
    async saveErrorHistory(filePath) {
        const data = {
            timestamp: new Date().toISOString(),
            statistics: this.getErrorStatistics(),
            history: this.errorHistory
        };

        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    /**
     * Load error history from file
     */
    async loadErrorHistory(filePath) {
        try {
            const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
            this.errorHistory = data.history || [];
        } catch (error) {
            // File doesn't exist or is invalid, start fresh
            this.errorHistory = [];
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const errorMessage = args.slice(1).join(' ');

    const handler = new AnalyticsErrorHandler();

    (async () => {
        switch (command) {
            case 'analyze':
                if (!errorMessage) {
                    console.error('Error message required');
                    process.exit(1);
                }
                const analysis = await handler.analyzeError(errorMessage);
                console.log(JSON.stringify(analysis, null, 2));
                console.log('\nRecovery Script:');
                console.log(handler.generateRecoveryScript(analysis));
                break;

            case 'stats':
                const historyFile = args[1] || path.join(process.cwd(), 'error-history.json');
                await handler.loadErrorHistory(historyFile);
                console.log(JSON.stringify(handler.getErrorStatistics(), null, 2));
                break;

            default:
                console.log('Usage: analytics-error-handler.js <command> [args]');
                console.log('Commands:');
                console.log('  analyze <error message>  - Analyze error and suggest recovery');
                console.log('  stats [file]            - Show error statistics');
        }
    })();
}

module.exports = AnalyticsErrorHandler;