#!/usr/bin/env node

/**
 * SOQL Report Converter
 * 
 * Converts blocked Salesforce reports to equivalent SOQL queries
 * Provides alternative data extraction when REST API limitations prevent report creation
 * 
 * Based on beta-corp Production analysis showing 60% of failures due to API blocks
 * 
 * Usage: node soql-report-converter.js --type <report-type> --filters <json> --output <file>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { RobustCSVParser } = require('./lib/csv-schema-validator');

class SOQLReportConverter {
    constructor(orgAlias = null) {
        this.orgAlias = orgAlias || process.env.SF_TARGET_ORG || 'production';
        this.csvParser = new RobustCSVParser(); // Quick Win: Robust CSV generation

        // Pre-built SOQL templates for blocked report types
        this.reportTemplates = {
            'Activities': {
                name: 'All Activities',
                query: `SELECT Id, Subject, Type, Status, Priority, ActivityDate,
                        Who.Name, Who.Type, What.Name, What.Type,
                        Owner.Name, CreatedDate, LastModifiedDate,
                        Description, IsTask, IsEvent
                        FROM Task
                        WHERE {filters}
                        ORDER BY ActivityDate DESC
                        LIMIT {limit}`,
                defaultFilters: 'ActivityDate != NULL',
                fields: ['Subject', 'Type', 'Status', 'ActivityDate', 'Who', 'What', 'Owner']
            },
            
            'Tasks': {
                name: 'Task Report',
                query: `SELECT Id, Subject, Status, Priority, ActivityDate,
                        Who.Name, What.Name, Owner.Name,
                        IsClosed, IsHighPriority, IsRecurrence,
                        CallType, CallDurationInSeconds
                        FROM Task
                        WHERE IsTask = true AND {filters}
                        ORDER BY ActivityDate DESC
                        LIMIT {limit}`,
                defaultFilters: 'IsDeleted = false',
                fields: ['Subject', 'Status', 'Priority', 'ActivityDate', 'Who', 'What', 'Owner']
            },
            
            'Events': {
                name: 'Event Report',
                query: `SELECT Id, Subject, Location, StartDateTime, EndDateTime,
                        Who.Name, What.Name, Owner.Name,
                        IsAllDayEvent, IsRecurrence, ShowAs,
                        DurationInMinutes
                        FROM Event
                        WHERE {filters}
                        ORDER BY StartDateTime DESC
                        LIMIT {limit}`,
                defaultFilters: 'StartDateTime != NULL',
                fields: ['Subject', 'Location', 'StartDateTime', 'EndDateTime', 'Who', 'What', 'Owner']
            },
            
            'ActivitiesWithAccounts': {
                name: 'Activities with Accounts',
                query: `SELECT Id, Subject, Type, Status, ActivityDate,
                        Who.Name, What.Name, What.Type,
                        Account.Name, Account.Industry, Account.Type,
                        Owner.Name
                        FROM Task
                        WHERE WhatId IN (SELECT Id FROM Account) AND {filters}
                        ORDER BY ActivityDate DESC
                        LIMIT {limit}`,
                defaultFilters: 'Account.Name != NULL',
                fields: ['Subject', 'Type', 'Status', 'ActivityDate', 'Account', 'Owner']
            },
            
            'CallsByRep': {
                name: 'Calls by Sales Rep',
                query: `SELECT Owner.Name rep, 
                        COUNT(Id) callCount,
                        AVG(CallDurationInSeconds) avgDuration,
                        MAX(CallDurationInSeconds) maxDuration,
                        MIN(CallDurationInSeconds) minDuration
                        FROM Task
                        WHERE Type = 'Call' AND {filters}
                        GROUP BY Owner.Name
                        ORDER BY COUNT(Id) DESC`,
                defaultFilters: 'CallDurationInSeconds > 0',
                fields: ['Owner', 'CallCount', 'AvgDuration']
            },
            
            'DailyActivityVolume': {
                name: 'Daily Activity Volume',
                query: `SELECT DAY_ONLY(CreatedDate) activityDate,
                        Type activityType,
                        COUNT(Id) activityCount
                        FROM Task
                        WHERE {filters}
                        GROUP BY DAY_ONLY(CreatedDate), Type
                        ORDER BY DAY_ONLY(CreatedDate) DESC`,
                defaultFilters: 'CreatedDate = LAST_N_DAYS:30',
                fields: ['Date', 'Type', 'Count']
            },
            
            'OpportunityActivities': {
                name: 'Opportunity Related Activities',
                query: `SELECT Id, Subject, Type, Status, ActivityDate,
                        What.Name opportunityName,
                        Owner.Name repName,
                        CreatedDate
                        FROM Task
                        WHERE WhatId IN (SELECT Id FROM Opportunity) AND {filters}
                        ORDER BY ActivityDate DESC
                        LIMIT {limit}`,
                defaultFilters: 'What.Type = \'Opportunity\'',
                fields: ['Subject', 'Type', 'Status', 'Opportunity', 'Owner']
            },
            
            'TouchesByAccount': {
                name: 'Sales Touches by Account',
                query: `SELECT Account.Name accountName,
                        COUNT(Id) touchCount,
                        MAX(ActivityDate) lastTouch,
                        MIN(ActivityDate) firstTouch
                        FROM Task
                        WHERE AccountId != NULL AND {filters}
                        GROUP BY Account.Name
                        ORDER BY COUNT(Id) DESC`,
                defaultFilters: 'Type IN (\'Call\', \'Email\', \'Meeting\')',
                fields: ['Account', 'TouchCount', 'LastTouch', 'FirstTouch']
            }
        };
        
        // Date filter conversions
        this.dateFilterMap = {
            'Today': 'TODAY',
            'Yesterday': 'YESTERDAY',
            'This Week': 'THIS_WEEK',
            'Last Week': 'LAST_WEEK',
            'This Month': 'THIS_MONTH',
            'Last Month': 'LAST_MONTH',
            'Last 30 Days': 'LAST_N_DAYS:30',
            'Last 60 Days': 'LAST_N_DAYS:60',
            'Last 90 Days': 'LAST_N_DAYS:90',
            'This Quarter': 'THIS_QUARTER',
            'Last Quarter': 'LAST_QUARTER',
            'This Year': 'THIS_YEAR',
            'Last Year': 'LAST_YEAR'
        };
    }

    /**
     * Convert report request to SOQL
     */
    async convertToSOQL(reportType, filters = {}, options = {}) {
        console.log('🔄 Converting Report to SOQL Query\n');
        console.log(`Report Type: ${reportType}`);
        
        // Check if we have a template for this report type
        const template = this.reportTemplates[reportType];
        if (!template) {
            console.log('⚠️ No direct template available. Building custom query...\n');
            return this.buildCustomQuery(reportType, filters, options);
        }
        
        // Build SOQL from template
        let query = template.query;
        
        // Apply filters
        const filterClauses = this.buildFilterClauses(filters, template.defaultFilters);
        query = query.replace('{filters}', filterClauses);
        
        // Apply limit
        const limit = options.limit || 1000;
        query = query.replace('{limit}', limit);
        
        // Clean up query
        query = this.cleanQuery(query);
        
        console.log('✅ SOQL Query Generated:\n');
        console.log('─'.repeat(60));
        console.log(query);
        console.log('─'.repeat(60) + '\n');
        
        return {
            query: query,
            reportName: template.name,
            fields: template.fields,
            canExecute: true
        };
    }

    /**
     * Build custom query for non-templated report types
     */
    buildCustomQuery(reportType, filters, options) {
        // Map common report types to objects
        const objectMap = {
            'LeadReport': 'Lead',
            'ContactReport': 'Contact',
            'AccountReport': 'Account',
            'OpportunityReport': 'Opportunity',
            'CaseReport': 'Case'
        };
        
        const objectName = objectMap[reportType] || reportType.replace('Report', '').replace('List', '');
        
        // Build basic query structure
        const fields = this.getStandardFields(objectName);
        const filterClauses = this.buildFilterClauses(filters, 'IsDeleted = false');
        const limit = options.limit || 1000;
        
        const query = `SELECT ${fields.join(', ')}
                      FROM ${objectName}
                      WHERE ${filterClauses}
                      ORDER BY CreatedDate DESC
                      LIMIT ${limit}`;
        
        return {
            query: this.cleanQuery(query),
            reportName: `${objectName} Report`,
            fields: fields,
            canExecute: true
        };
    }

    /**
     * Get standard fields for an object
     */
    getStandardFields(objectName) {
        const standardFields = {
            'Lead': ['Id', 'Name', 'Company', 'Status', 'Email', 'Phone', 'Owner.Name', 'CreatedDate'],
            'Contact': ['Id', 'Name', 'Account.Name', 'Email', 'Phone', 'Title', 'Owner.Name', 'CreatedDate'],
            'Account': ['Id', 'Name', 'Type', 'Industry', 'AnnualRevenue', 'Owner.Name', 'CreatedDate'],
            'Opportunity': ['Id', 'Name', 'Account.Name', 'StageName', 'Amount', 'CloseDate', 'Owner.Name'],
            'Case': ['Id', 'CaseNumber', 'Subject', 'Status', 'Priority', 'Account.Name', 'Owner.Name'],
            'Task': ['Id', 'Subject', 'Type', 'Status', 'ActivityDate', 'Who.Name', 'What.Name', 'Owner.Name'],
            'Event': ['Id', 'Subject', 'StartDateTime', 'EndDateTime', 'Who.Name', 'What.Name', 'Owner.Name']
        };
        
        return standardFields[objectName] || ['Id', 'Name', 'CreatedDate', 'LastModifiedDate'];
    }

    /**
     * Build filter clauses from filter object
     */
    buildFilterClauses(filters, defaultFilters) {
        const clauses = [];
        
        // Add default filters
        if (defaultFilters) {
            clauses.push(defaultFilters);
        }
        
        // Add date filters
        if (filters.dateField && filters.dateRange) {
            const dateFilter = this.dateFilterMap[filters.dateRange] || filters.dateRange;
            clauses.push(`${filters.dateField} = ${dateFilter}`);
        }
        
        // Add field filters
        if (filters.fieldFilters) {
            Object.entries(filters.fieldFilters).forEach(([field, value]) => {
                if (Array.isArray(value)) {
                    clauses.push(`${field} IN (${value.map(v => `'${v}'`).join(', ')})`);
                } else if (typeof value === 'string') {
                    clauses.push(`${field} = '${value}'`);
                } else {
                    clauses.push(`${field} = ${value}`);
                }
            });
        }
        
        // Add custom filter string
        if (filters.customFilter) {
            clauses.push(filters.customFilter);
        }
        
        return clauses.length > 0 ? clauses.join(' AND ') : '1=1';
    }

    /**
     * Clean and format query
     */
    cleanQuery(query) {
        return query
            .replace(/\s+/g, ' ')
            .replace(/\s*,\s*/g, ', ')
            .replace(/\s*=\s*/g, ' = ')
            .replace(/\s+FROM\s+/g, '\nFROM ')
            .replace(/\s+WHERE\s+/g, '\nWHERE ')
            .replace(/\s+GROUP BY\s+/g, '\nGROUP BY ')
            .replace(/\s+ORDER BY\s+/g, '\nORDER BY ')
            .replace(/\s+LIMIT\s+/g, '\nLIMIT ')
            .trim();
    }

    /**
     * Execute SOQL query and return results
     */
    async executeQuery(query, format = 'json') {
        console.log('🚀 Executing SOQL Query...\n');
        
        try {
            const result = execSync(
                `sf data query --query "${query}" -o ${this.orgAlias} --json`,
                { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
            );
            
            const data = JSON.parse(result);
            
            if (data.status === 0 && data.result) {
                console.log(`✅ Query executed successfully`);
                console.log(`Records returned: ${data.result.totalSize}\n`);
                
                if (format === 'csv') {
                    return this.convertToCSV(data.result.records);
                } else if (format === 'table') {
                    return this.formatAsTable(data.result.records);
                }
                
                return data.result.records;
            } else {
                throw new Error(data.message || 'Query execution failed');
            }
            
        } catch (error) {
            console.error('❌ Query execution failed:', error.message);
            return null;
        }
    }

    /**
     * Convert results to CSV format
     * Quick Win: Uses RobustCSVParser for automatic quoting and escaping
     */
    convertToCSV(records) {
        if (!records || records.length === 0) return '';

        // Get headers from first record
        const headers = Object.keys(records[0]).filter(k => k !== 'attributes');

        // Convert to object-based rows for robust CSV generation
        const rows = records.map(record => {
            const row = {};
            headers.forEach(header => {
                row[header] = this.getNestedValue(record, header);
            });
            return row;
        });

        // Quick Win: RobustCSVParser handles all quoting, commas, quotes automatically
        return this.csvParser.generate(rows);
    }

    /**
     * Format results as ASCII table
     */
    formatAsTable(records) {
        if (!records || records.length === 0) return 'No records found';
        
        // Get headers
        const headers = Object.keys(records[0]).filter(k => k !== 'attributes');
        
        // Calculate column widths
        const widths = {};
        headers.forEach(header => {
            widths[header] = Math.max(
                header.length,
                ...records.map(r => String(this.getNestedValue(r, header) || '').length)
            );
        });
        
        // Build table
        const separator = '+' + headers.map(h => '-'.repeat(widths[h] + 2)).join('+') + '+';
        const headerRow = '|' + headers.map(h => ` ${h.padEnd(widths[h])} `).join('|') + '|';
        
        const rows = records.map(record => {
            return '|' + headers.map(header => {
                const value = String(this.getNestedValue(record, header) || '');
                return ` ${value.padEnd(widths[header])} `;
            }).join('|') + '|';
        });
        
        return [separator, headerRow, separator, ...rows, separator].join('\n');
    }

    /**
     * Get nested object value
     */
    getNestedValue(obj, path) {
        if (!path.includes('.')) {
            return obj[path];
        }
        
        const parts = path.split('.');
        let value = obj;
        
        for (const part of parts) {
            if (value && typeof value === 'object') {
                value = value[part];
            } else {
                return null;
            }
        }
        
        return value;
    }

    /**
     * Save query to file
     */
    saveQuery(query, outputFile) {
        const content = `-- SOQL Query Generated by Report Converter
-- Date: ${new Date().toISOString()}
-- Original Report Type: Blocked by API
-- Workaround: Direct SOQL Query

${query}

/*
 * Usage:
 * 1. Execute in Developer Console
 * 2. Use with Salesforce CLI: sf data query --query "..." 
 * 3. Use in Apex: Database.query('...')
 */`;
        
        fs.writeFileSync(outputFile, content);
        console.log(`💾 Query saved to: ${outputFile}\n`);
    }

    /**
     * Generate multiple queries for dashboard
     */
    async generateDashboardQueries(dashboardConfig) {
        console.log('📊 Generating Dashboard SOQL Queries\n');
        
        const queries = {};
        
        for (const [name, config] of Object.entries(dashboardConfig)) {
            const result = await this.convertToSOQL(
                config.reportType,
                config.filters,
                config.options
            );
            
            queries[name] = result.query;
        }
        
        return queries;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    // Parse arguments
    const typeIndex = args.indexOf('--type');
    const filtersIndex = args.indexOf('--filters');
    const outputIndex = args.indexOf('--output');
    const executeIndex = args.indexOf('--execute');
    const formatIndex = args.indexOf('--format');
    const orgIndex = args.indexOf('--org');
    
    const reportType = typeIndex > -1 ? args[typeIndex + 1] : 'Activities';
    const filters = filtersIndex > -1 ? JSON.parse(args[filtersIndex + 1]) : {};
    const outputFile = outputIndex > -1 ? args[outputIndex + 1] : null;
    const shouldExecute = executeIndex > -1;
    const format = formatIndex > -1 ? args[formatIndex + 1] : 'json';
    const org = orgIndex > -1 ? args[orgIndex + 1] : null;
    
    // Show available templates if no type specified
    if (typeIndex === -1) {
        console.log('📚 Available Report Templates:\n');
        const converter = new SOQLReportConverter();
        Object.keys(converter.reportTemplates).forEach(type => {
            console.log(`  - ${type}: ${converter.reportTemplates[type].name}`);
        });
        console.log('\nUsage: node soql-report-converter.js --type <type> [options]\n');
        process.exit(0);
    }
    
    // Convert report to SOQL
    const converter = new SOQLReportConverter(org);
    
    converter.convertToSOQL(reportType, filters).then(async result => {
        if (outputFile) {
            converter.saveQuery(result.query, outputFile);
        }
        
        if (shouldExecute) {
            const data = await converter.executeQuery(result.query, format);
            if (data) {
                console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
            }
        }
    }).catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

module.exports = SOQLReportConverter;