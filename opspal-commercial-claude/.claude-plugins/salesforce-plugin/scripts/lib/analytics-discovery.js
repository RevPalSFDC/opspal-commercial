#!/usr/bin/env node

/**
 * Salesforce Analytics Discovery API
 * 
 * Implements the discovery phase for report creation to prevent errors
 * and eliminate guesswork about report types, fields, and folders.
 * 
 * Based on recommendations from Salesforce Analytics REST API documentation
 */

const https = require('https');
const url = require('url');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

class AnalyticsDiscovery {
    constructor(instanceUrl, accessToken) {
        this.instanceUrl = instanceUrl;
        this.accessToken = accessToken;
        this.apiVersion = 'v64.0';
        this.cache = new Map();
        this.cacheExpiry = 3600000; // 1 hour cache
    }

    /**
     * Initialize from Salesforce CLI authentication
     */
    static async fromSFAuth(orgAlias) {
        const authCmd = `sf org display --json${orgAlias ? ` --target-org ${orgAlias}` : ''}`;
        const result = await execAsync(authCmd);
        const authData = JSON.parse(result.stdout);
        
        if (!authData.result || !authData.result.accessToken) {
            throw new Error('Failed to get SF authentication');
        }

        return new AnalyticsDiscovery(
            authData.result.instanceUrl,
            authData.result.accessToken
        );
    }

    /**
     * Step 1: Resolve report folder ID from name
     * Returns folder ID and namespace for managed packages
     */
    async resolveFolderId(folderName = null) {
        const cacheKey = `folders_report`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                const folders = cached.data;
                if (folderName) {
                    const folder = folders.find(f => 
                        f.label.toLowerCase() === folderName.toLowerCase() ||
                        f.name.toLowerCase() === folderName.toLowerCase()
                    );
                    return folder || null;
                }
                return folders;
            }
        }

        try {
            const response = await this.makeRequest('/services/data/' + this.apiVersion + '/folders?types=report');
            const folders = response.folders || [];
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: folders,
                timestamp: Date.now()
            });

            // Enhanced folder info with namespace detection
            const enhancedFolders = folders.map(folder => ({
                id: folder.id,
                label: folder.label,
                name: folder.name,
                namespace: folder.namespace || null,
                type: folder.type,
                isManaged: !!folder.namespace,
                fullPath: folder.namespace ? `${folder.namespace}__${folder.name}` : folder.name
            }));

            if (folderName) {
                const folder = enhancedFolders.find(f => 
                    f.label.toLowerCase() === folderName.toLowerCase() ||
                    f.name.toLowerCase() === folderName.toLowerCase()
                );
                return folder || null;
            }

            return enhancedFolders;
        } catch (error) {
            throw new Error(`Failed to resolve folder: ${error.message}`);
        }
    }

    /**
     * Step 2: Discover available report types
     * Returns list of report types with their API names
     */
    async discoverReportTypes(filterPattern = null) {
        const cacheKey = 'report_types';
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                const types = cached.data;
                if (filterPattern) {
                    return types.filter(t => 
                        t.type.toLowerCase().includes(filterPattern.toLowerCase()) ||
                        t.label.toLowerCase().includes(filterPattern.toLowerCase())
                    );
                }
                return types;
            }
        }

        try {
            const response = await this.makeRequest('/services/data/' + this.apiVersion + '/analytics/report-types');
            const reportTypes = response.reportTypes || [];
            
            // Enhance with categorization
            const enhancedTypes = reportTypes.map(type => ({
                type: type.type,
                label: type.label,
                category: type.category || 'Other',
                isManaged: type.type.includes('__'),
                namespace: type.type.split('__')[0] || null,
                apiName: type.type
            }));

            // Sort by category and label for easier browsing
            enhancedTypes.sort((a, b) => {
                if (a.category !== b.category) {
                    return a.category.localeCompare(b.category);
                }
                return a.label.localeCompare(b.label);
            });

            // Cache the result
            this.cache.set(cacheKey, {
                data: enhancedTypes,
                timestamp: Date.now()
            });

            if (filterPattern) {
                return enhancedTypes.filter(t => 
                    t.type.toLowerCase().includes(filterPattern.toLowerCase()) ||
                    t.label.toLowerCase().includes(filterPattern.toLowerCase())
                );
            }

            return enhancedTypes;
        } catch (error) {
            throw new Error(`Failed to discover report types: ${error.message}`);
        }
    }

    /**
     * Step 3: Describe a specific report type
     * Returns available fields, sections, and metadata
     */
    async describeReportType(reportType) {
        const cacheKey = `describe_${reportType}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }

        try {
            const response = await this.makeRequest(`/services/data/${this.apiVersion}/analytics/report-types/${reportType}`);
            
            // Extract field tokens for report metadata
            const fields = [];
            const sections = response.reportTypeMetadata?.sections || [];
            
            sections.forEach(section => {
                const columns = section.columns || [];
                columns.forEach(column => {
                    fields.push({
                        token: column.name,
                        label: column.label,
                        dataType: column.dataType,
                        filterable: column.filterable,
                        groupable: column.groupable,
                        sortable: column.sortable,
                        aggregatable: column.aggregatable,
                        section: section.label,
                        isCustom: column.name.includes('__c'),
                        isFormula: column.formulaColumn || false
                    });
                });
            });

            const description = {
                reportType,
                label: response.reportTypeMetadata?.label,
                baseObject: response.reportTypeMetadata?.baseObject,
                categories: response.reportTypeMetadata?.categories,
                sections: sections.map(s => ({
                    label: s.label,
                    fieldCount: s.columns?.length || 0
                })),
                fields,
                totalFields: fields.length,
                customFields: fields.filter(f => f.isCustom).length,
                standardFields: fields.filter(f => !f.isCustom).length
            };

            // Cache the result
            this.cache.set(cacheKey, {
                data: description,
                timestamp: Date.now()
            });

            return description;
        } catch (error) {
            throw new Error(`Failed to describe report type ${reportType}: ${error.message}`);
        }
    }

    /**
     * Step 4: Validate report metadata before creation
     * Uses the query endpoint to test without saving
     */
    async validateReportMetadata(reportMetadata) {
        try {
            const response = await this.makeRequest(
                '/services/data/' + this.apiVersion + '/analytics/reports/query',
                'POST',
                { reportMetadata }
            );

            return {
                valid: true,
                message: 'Report metadata is valid',
                previewData: response
            };
        } catch (error) {
            // Parse error to provide specific guidance
            const errorDetail = this.parseReportError(error.message);
            return {
                valid: false,
                error: error.message,
                suggestion: errorDetail.suggestion,
                errorCode: errorDetail.code,
                field: errorDetail.field
            };
        }
    }

    /**
     * Step 5: Get valid aggregate syntax for a field
     */
    getAggregateToken(fieldToken, aggregateType) {
        const aggregatePrefixes = {
            'AVG': 'a!',
            'SUM': 's!',
            'MIN': 'mx!',
            'MAX': 'mn!',
            'COUNT': 'c!',
            'COUNT_DISTINCT': 'u!'
        };

        const prefix = aggregatePrefixes[aggregateType.toUpperCase()];
        if (!prefix) {
            throw new Error(`Invalid aggregate type: ${aggregateType}`);
        }

        return `${prefix}${fieldToken}`;
    }

    /**
     * Parse Salesforce report errors to provide actionable suggestions
     */
    parseReportError(errorMessage) {
        const errorMappings = [
            {
                pattern: /folder ID can't be null/i,
                code: 'NULL_FOLDER_ID',
                suggestion: 'Use resolveFolderId() to get a valid folder ID first'
            },
            {
                pattern: /invalid.*folder/i,
                code: 'INVALID_FOLDER_ID',
                suggestion: 'The folder ID is invalid. List available folders with resolveFolderId()'
            },
            {
                pattern: /field.*not.*found|invalid.*field/i,
                code: 'INVALID_FIELD',
                suggestion: 'Use describeReportType() to find valid field tokens',
                field: errorMessage.match(/field[:\s]+([^\s,]+)/i)?.[1]
            },
            {
                pattern: /report type.*not.*found/i,
                code: 'INVALID_REPORT_TYPE',
                suggestion: 'Use discoverReportTypes() to find valid report types'
            },
            {
                pattern: /aggregate.*invalid/i,
                code: 'INVALID_AGGREGATE',
                suggestion: 'Use getAggregateToken() for proper aggregate syntax (e.g., s!Amount for SUM)'
            },
            {
                pattern: /permission/i,
                code: 'INSUFFICIENT_PERMISSIONS',
                suggestion: 'Check user permissions for report creation and folder access'
            },
            {
                pattern: /limit.*exceeded/i,
                code: 'LIMIT_EXCEEDED',
                suggestion: 'Reduce the number of columns or use filters to limit data'
            }
        ];

        for (const mapping of errorMappings) {
            if (mapping.pattern.test(errorMessage)) {
                return mapping;
            }
        }

        return {
            code: 'UNKNOWN_ERROR',
            suggestion: 'Check the full error message and Salesforce documentation'
        };
    }

    /**
     * Make authenticated API request
     */
    async makeRequest(endpoint, method = 'GET', body = null) {
        const parsedUrl = url.parse(this.instanceUrl);
        
        const options = {
            hostname: parsedUrl.hostname,
            path: endpoint,
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            const errorMsg = result.message || result[0]?.message || JSON.stringify(result);
                            reject(new Error(errorMsg));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            
            if (body) {
                req.write(JSON.stringify(body));
            }
            
            req.end();
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const param = args[1];
    const orgAlias = args.find(a => a.startsWith('--org='))?.split('=')[1];

    (async () => {
        try {
            const discovery = await AnalyticsDiscovery.fromSFAuth(orgAlias);

            switch (command) {
                case 'folders':
                    const folders = await discovery.resolveFolderId(param);
                    console.log(JSON.stringify(folders, null, 2));
                    break;

                case 'types':
                    const types = await discovery.discoverReportTypes(param);
                    console.log(JSON.stringify(types, null, 2));
                    break;

                case 'describe':
                    if (!param) {
                        throw new Error('Report type required for describe command');
                    }
                    const description = await discovery.describeReportType(param);
                    console.log(JSON.stringify(description, null, 2));
                    break;

                case 'validate':
                    if (!param) {
                        throw new Error('Metadata JSON file required for validate command');
                    }
                    const metadata = JSON.parse(await fs.readFile(param, 'utf8'));
                    const validation = await discovery.validateReportMetadata(metadata);
                    console.log(JSON.stringify(validation, null, 2));
                    break;

                default:
                    console.log('Usage: analytics-discovery.js <command> [param] [--org=alias]');
                    console.log('Commands:');
                    console.log('  folders [name]        - List or find report folders');
                    console.log('  types [filter]        - Discover report types');
                    console.log('  describe <type>       - Describe report type fields');
                    console.log('  validate <file.json>  - Validate report metadata');
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = AnalyticsDiscovery;