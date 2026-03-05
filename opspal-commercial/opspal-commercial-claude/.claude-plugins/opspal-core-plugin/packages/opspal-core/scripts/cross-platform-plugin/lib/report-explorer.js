#!/usr/bin/env node

/**
 * Report Explorer
 *
 * Purpose: Enable drill-down and ad-hoc exploration of report data.
 * Supports filtering, aggregation, pivoting, and natural language queries.
 *
 * Usage:
 *   const { ReportExplorer } = require('./report-explorer');
 *
 *   const explorer = new ReportExplorer();
 *   await explorer.loadReport('./report-data.json');
 *   const filtered = explorer.filter('Region', '=', 'EMEA');
 *   const grouped = explorer.groupBy(['Stage']).aggregate('Amount', 'sum');
 *
 * @module report-explorer
 * @version 1.0.0
 * @created 2025-12-14
 */

const fs = require('fs');
const path = require('path');

/**
 * Report Explorer
 */
class ReportExplorer {
    /**
     * Initialize report explorer
     *
     * @param {Object} config - Configuration options
     * @param {number} [config.maxRows=10000] - Maximum rows to load
     */
    constructor(config = {}) {
        this.maxRows = config.maxRows ?? 10000;
        this.data = null;
        this.filteredData = null;
        this.metadata = null;
        this.breadcrumb = [];
        this.savedViews = new Map();
        this.aggregationResult = null;
    }

    /**
     * Load report data from file
     *
     * @param {string} reportPath - Path to report JSON file
     * @returns {Object} Load result
     */
    async loadReport(reportPath) {
        if (!fs.existsSync(reportPath)) {
            return { success: false, error: `File not found: ${reportPath}` };
        }

        try {
            const content = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

            // Handle different data structures
            if (Array.isArray(content)) {
                this.data = content.slice(0, this.maxRows);
            } else if (content.records) {
                this.data = content.records.slice(0, this.maxRows);
                this.metadata = content.metadata;
            } else if (content.data) {
                this.data = content.data.slice(0, this.maxRows);
                this.metadata = content.metadata;
            } else {
                return { success: false, error: 'Unrecognized data format' };
            }

            this.filteredData = [...this.data];
            this.breadcrumb = [{ action: 'load', path: reportPath }];

            // Analyze columns
            const columns = this._analyzeColumns(this.data);

            return {
                success: true,
                totalRows: this.data.length,
                truncated: content.length > this.maxRows,
                columns,
                metadata: this.metadata
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Load data directly from array
     *
     * @param {Array<Object>} data - Data array
     * @param {Object} [metadata] - Optional metadata
     * @returns {Object} Load result
     */
    loadData(data, metadata = null) {
        if (!Array.isArray(data)) {
            return { success: false, error: 'Data must be an array' };
        }

        this.data = data.slice(0, this.maxRows);
        this.filteredData = [...this.data];
        this.metadata = metadata;
        this.breadcrumb = [{ action: 'load', source: 'memory' }];

        return {
            success: true,
            totalRows: this.data.length,
            columns: this._analyzeColumns(this.data)
        };
    }

    /**
     * Apply a filter to the data
     *
     * @param {string} field - Field to filter on
     * @param {string} operator - Comparison operator: '=', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith', 'in'
     * @param {*} value - Value to compare against
     * @returns {ReportExplorer} this (for chaining)
     */
    filter(field, operator, value) {
        if (!this.filteredData) {
            throw new Error('No data loaded');
        }

        const beforeCount = this.filteredData.length;

        this.filteredData = this.filteredData.filter(row => {
            const fieldValue = row[field];

            switch (operator) {
                case '=':
                case '==':
                    return fieldValue === value;
                case '!=':
                case '<>':
                    return fieldValue !== value;
                case '>':
                    return fieldValue > value;
                case '<':
                    return fieldValue < value;
                case '>=':
                    return fieldValue >= value;
                case '<=':
                    return fieldValue <= value;
                case 'contains':
                    return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
                case 'startsWith':
                    return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
                case 'in':
                    return Array.isArray(value) && value.includes(fieldValue);
                case 'notIn':
                    return Array.isArray(value) && !value.includes(fieldValue);
                case 'isNull':
                    return fieldValue === null || fieldValue === undefined;
                case 'isNotNull':
                    return fieldValue !== null && fieldValue !== undefined;
                default:
                    return true;
            }
        });

        this.breadcrumb.push({
            action: 'filter',
            field,
            operator,
            value,
            removedRows: beforeCount - this.filteredData.length
        });

        return this;
    }

    /**
     * Apply multiple filters
     *
     * @param {Array<{field: string, operator: string, value: *}>} filters - Array of filter definitions
     * @returns {ReportExplorer} this (for chaining)
     */
    filterMultiple(filters) {
        filters.forEach(f => this.filter(f.field, f.operator, f.value));
        return this;
    }

    /**
     * Clear all filters and restore original data
     *
     * @returns {ReportExplorer} this (for chaining)
     */
    clearFilters() {
        this.filteredData = [...this.data];
        this.breadcrumb = [this.breadcrumb[0]]; // Keep only load action
        this.aggregationResult = null;
        return this;
    }

    /**
     * Group data by fields
     *
     * @param {Array<string>} fields - Fields to group by
     * @returns {ReportExplorer} this (for chaining)
     */
    groupBy(fields) {
        if (!this.filteredData || this.filteredData.length === 0) {
            this.aggregationResult = { groups: [], fields };
            return this;
        }

        const groups = new Map();

        this.filteredData.forEach(row => {
            const key = fields.map(f => row[f]).join('|');

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    keyValues: fields.reduce((obj, f) => ({ ...obj, [f]: row[f] }), {}),
                    rows: []
                });
            }

            groups.get(key).rows.push(row);
        });

        this.aggregationResult = {
            fields,
            groups: Array.from(groups.values()),
            groupCount: groups.size
        };

        this.breadcrumb.push({ action: 'groupBy', fields });

        return this;
    }

    /**
     * Apply aggregation to grouped data
     *
     * @param {string} field - Field to aggregate
     * @param {string} operation - Aggregation: 'sum', 'avg', 'count', 'min', 'max', 'first', 'last'
     * @param {string} [alias] - Optional alias for result column
     * @returns {ReportExplorer} this (for chaining)
     */
    aggregate(field, operation, alias = null) {
        if (!this.aggregationResult?.groups) {
            // No grouping, aggregate entire dataset
            const result = this._aggregateValues(this.filteredData.map(r => r[field]), operation);
            this.aggregationResult = {
                single: true,
                field,
                operation,
                value: result
            };
            return this;
        }

        const resultAlias = alias ?? `${operation}_${field}`;

        this.aggregationResult.groups = this.aggregationResult.groups.map(group => ({
            ...group,
            aggregations: {
                ...(group.aggregations || {}),
                [resultAlias]: this._aggregateValues(group.rows.map(r => r[field]), operation)
            }
        }));

        this.breadcrumb.push({ action: 'aggregate', field, operation, alias: resultAlias });

        return this;
    }

    /**
     * Create pivot table
     *
     * @param {string} rowField - Field for rows
     * @param {string} colField - Field for columns
     * @param {string} valueField - Field to aggregate
     * @param {string} [operation='sum'] - Aggregation operation
     * @returns {Object} Pivot table
     */
    pivot(rowField, colField, valueField, operation = 'sum') {
        if (!this.filteredData || this.filteredData.length === 0) {
            return { success: false, error: 'No data to pivot' };
        }

        // Get unique values for rows and columns
        const rowValues = [...new Set(this.filteredData.map(r => r[rowField]))].sort();
        const colValues = [...new Set(this.filteredData.map(r => r[colField]))].sort();

        // Build pivot matrix
        const matrix = new Map();
        rowValues.forEach(rv => {
            const rowData = new Map();
            colValues.forEach(cv => rowData.set(cv, []));
            matrix.set(rv, rowData);
        });

        // Populate matrix
        this.filteredData.forEach(row => {
            const rv = row[rowField];
            const cv = row[colField];
            const val = row[valueField];

            if (matrix.has(rv) && matrix.get(rv).has(cv)) {
                matrix.get(rv).get(cv).push(val);
            }
        });

        // Aggregate
        const pivotTable = {
            rowField,
            colField,
            valueField,
            operation,
            columnHeaders: colValues,
            rows: rowValues.map(rv => ({
                rowValue: rv,
                cells: colValues.map(cv => {
                    const values = matrix.get(rv).get(cv);
                    return this._aggregateValues(values, operation);
                })
            }))
        };

        // Calculate row and column totals
        pivotTable.rowTotals = pivotTable.rows.map(row =>
            this._aggregateValues(row.cells.filter(c => c !== null), operation)
        );

        pivotTable.columnTotals = colValues.map((_, colIndex) =>
            this._aggregateValues(
                pivotTable.rows.map(row => row.cells[colIndex]).filter(c => c !== null),
                operation
            )
        );

        this.breadcrumb.push({ action: 'pivot', rowField, colField, valueField, operation });

        return pivotTable;
    }

    /**
     * Drill down into a specific dimension value
     *
     * @param {string} dimension - Dimension field
     * @param {*} value - Value to drill into
     * @returns {ReportExplorer} this (for chaining)
     */
    drillDown(dimension, value) {
        this.filter(dimension, '=', value);
        this.breadcrumb[this.breadcrumb.length - 1].action = 'drillDown';
        return this;
    }

    /**
     * Drill up (remove last filter)
     *
     * @returns {ReportExplorer} this (for chaining)
     */
    drillUp() {
        if (this.breadcrumb.length <= 1) return this;

        // Remove last action and reapply remaining
        this.breadcrumb.pop();
        this.filteredData = [...this.data];

        // Reapply all filters from breadcrumb
        this.breadcrumb.slice(1).forEach(action => {
            if (action.action === 'filter' || action.action === 'drillDown') {
                this.filter(action.field, action.operator, action.value);
            }
        });

        return this;
    }

    /**
     * Get current navigation breadcrumb
     *
     * @returns {Array} Breadcrumb trail
     */
    getBreadcrumb() {
        return this.breadcrumb.map(b => {
            if (b.action === 'load') return 'All Data';
            if (b.action === 'filter' || b.action === 'drillDown') {
                return `${b.field} ${b.operator} ${b.value}`;
            }
            if (b.action === 'groupBy') return `Group by ${b.fields.join(', ')}`;
            if (b.action === 'aggregate') return `${b.operation}(${b.field})`;
            return b.action;
        });
    }

    /**
     * Get current view data
     *
     * @param {Object} [options] - Options
     * @param {number} [options.limit] - Limit results
     * @param {number} [options.offset] - Skip results
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder='asc'] - Sort order: 'asc' or 'desc'
     * @returns {Object} Current view
     */
    getCurrentView(options = {}) {
        const { limit, offset = 0, sortBy, sortOrder = 'asc' } = options;

        let result;

        if (this.aggregationResult?.groups) {
            result = this.aggregationResult.groups.map(g => ({
                ...g.keyValues,
                ...g.aggregations,
                _rowCount: g.rows.length
            }));
        } else if (this.aggregationResult?.single) {
            return {
                type: 'single',
                field: this.aggregationResult.field,
                operation: this.aggregationResult.operation,
                value: this.aggregationResult.value
            };
        } else {
            result = [...this.filteredData];
        }

        // Sort
        if (sortBy) {
            result.sort((a, b) => {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return sortOrder === 'desc' ? -comparison : comparison;
            });
        }

        // Paginate
        const total = result.length;
        if (limit) {
            result = result.slice(offset, offset + limit);
        }

        return {
            type: this.aggregationResult?.groups ? 'grouped' : 'records',
            total,
            returned: result.length,
            offset,
            data: result,
            breadcrumb: this.getBreadcrumb()
        };
    }

    /**
     * Export current view to file
     *
     * @param {string} format - Format: 'csv', 'json', 'xlsx'
     * @param {string} [outputPath] - Output path (auto-generated if not provided)
     * @returns {Object} Export result
     */
    exportCurrentView(format, outputPath = null) {
        const view = this.getCurrentView();
        const data = view.data;

        const filename = outputPath ?? `export_${Date.now()}.${format}`;

        switch (format) {
            case 'json':
                fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
                break;

            case 'csv':
                const csv = this._toCSV(data);
                fs.writeFileSync(filename, csv, 'utf8');
                break;

            default:
                return { success: false, error: `Unsupported format: ${format}` };
        }

        return {
            success: true,
            path: filename,
            format,
            rowCount: data.length
        };
    }

    /**
     * Save current view configuration
     *
     * @param {string} viewName - Name for saved view
     * @returns {Object} Save result
     */
    saveView(viewName) {
        this.savedViews.set(viewName, {
            breadcrumb: [...this.breadcrumb],
            savedAt: new Date().toISOString()
        });

        return {
            success: true,
            viewName,
            breadcrumb: this.getBreadcrumb()
        };
    }

    /**
     * Load a saved view
     *
     * @param {string} viewName - Name of saved view
     * @returns {Object} Load result
     */
    loadView(viewName) {
        const saved = this.savedViews.get(viewName);

        if (!saved) {
            return { success: false, error: `View not found: ${viewName}` };
        }

        // Reset and reapply
        this.filteredData = [...this.data];
        this.aggregationResult = null;
        this.breadcrumb = [saved.breadcrumb[0]];

        saved.breadcrumb.slice(1).forEach(action => {
            switch (action.action) {
                case 'filter':
                case 'drillDown':
                    this.filter(action.field, action.operator, action.value);
                    break;
                case 'groupBy':
                    this.groupBy(action.fields);
                    break;
                case 'aggregate':
                    this.aggregate(action.field, action.operation, action.alias);
                    break;
            }
        });

        return {
            success: true,
            viewName,
            breadcrumb: this.getBreadcrumb()
        };
    }

    /**
     * Parse natural language query (simplified)
     *
     * @param {string} query - Natural language query
     * @returns {Object} Parsed query result
     */
    query(query) {
        const lowerQuery = query.toLowerCase();

        // Pattern: "show X by Y"
        const showByMatch = lowerQuery.match(/show\s+(\w+)\s+by\s+(\w+)/);
        if (showByMatch) {
            const [, metric, dimension] = showByMatch;
            return this.groupBy([this._findColumn(dimension)])
                       .aggregate(this._findColumn(metric), 'sum')
                       .getCurrentView();
        }

        // Pattern: "X where Y = Z"
        const whereMatch = lowerQuery.match(/where\s+(\w+)\s*(=|>|<|>=|<=)\s*['""]?([^'""\s]+)['""]?/);
        if (whereMatch) {
            const [, field, op, value] = whereMatch;
            return this.filter(this._findColumn(field), op, this._parseValue(value))
                       .getCurrentView();
        }

        // Pattern: "sum/avg/count of X"
        const aggMatch = lowerQuery.match(/(sum|average|avg|count|min|max)\s+(?:of\s+)?(\w+)/);
        if (aggMatch) {
            let [, operation, field] = aggMatch;
            if (operation === 'average') operation = 'avg';
            return this.aggregate(this._findColumn(field), operation)
                       .getCurrentView();
        }

        // Pattern: "top N by X"
        const topMatch = lowerQuery.match(/top\s+(\d+)\s+by\s+(\w+)/);
        if (topMatch) {
            const [, n, field] = topMatch;
            return this.getCurrentView({ limit: parseInt(n), sortBy: this._findColumn(field), sortOrder: 'desc' });
        }

        return {
            success: false,
            error: 'Could not parse query',
            supportedPatterns: [
                'show {metric} by {dimension}',
                'where {field} = {value}',
                'sum/avg/count of {field}',
                'top N by {field}'
            ]
        };
    }

    // ==================== Private Methods ====================

    /**
     * Analyze column types
     * @private
     */
    _analyzeColumns(data) {
        if (!data || data.length === 0) return [];

        const sample = data.slice(0, 100);
        const columns = Object.keys(sample[0]);

        return columns.map(col => {
            const values = sample.map(r => r[col]).filter(v => v != null);
            const numericCount = values.filter(v => typeof v === 'number' || !isNaN(parseFloat(v))).length;
            const dateCount = values.filter(v => !isNaN(Date.parse(v))).length;

            let type = 'string';
            if (numericCount > values.length * 0.8) type = 'number';
            else if (dateCount > values.length * 0.8) type = 'date';

            const uniqueCount = new Set(values).size;

            return {
                name: col,
                type,
                uniqueValues: uniqueCount,
                nullCount: data.length - values.length,
                sample: values.slice(0, 3)
            };
        });
    }

    /**
     * Perform aggregation
     * @private
     */
    _aggregateValues(values, operation) {
        const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));

        if (numericValues.length === 0 && operation !== 'count') {
            return null;
        }

        switch (operation) {
            case 'sum':
                return numericValues.reduce((a, b) => a + b, 0);
            case 'avg':
            case 'average':
                return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
            case 'count':
                return values.length;
            case 'min':
                return Math.min(...numericValues);
            case 'max':
                return Math.max(...numericValues);
            case 'first':
                return values[0];
            case 'last':
                return values[values.length - 1];
            default:
                return null;
        }
    }

    /**
     * Find best matching column name
     * @private
     */
    _findColumn(name) {
        if (!this.data || this.data.length === 0) return name;

        const columns = Object.keys(this.data[0]);
        const lowerName = name.toLowerCase();

        // Exact match
        const exact = columns.find(c => c.toLowerCase() === lowerName);
        if (exact) return exact;

        // Partial match
        const partial = columns.find(c => c.toLowerCase().includes(lowerName));
        if (partial) return partial;

        return name;
    }

    /**
     * Parse value from query string
     * @private
     */
    _parseValue(value) {
        const num = parseFloat(value);
        if (!isNaN(num)) return num;
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        return value;
    }

    /**
     * Convert data to CSV
     * @private
     */
    _toCSV(data) {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const rows = data.map(row =>
            headers.map(h => {
                const val = row[h];
                if (val == null) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        );

        return [headers.join(','), ...rows].join('\n');
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Report Explorer

Usage:
  node report-explorer.js --data <path> [options]

Options:
  --data <path>           Path to report JSON file (required)
  --query "<query>"       Natural language query
  --filter "<expr>"       Filter expression (field=value)
  --group <fields>        Group by fields (comma-separated)
  --agg <field:op>        Aggregate (field:sum|avg|count|min|max)
  --sort <field>          Sort by field
  --limit <n>             Limit results
  --format <type>         Output format: json, csv, table (default: table)
  --output <path>         Output file path
  --help                  Show this help message

Examples:
  node report-explorer.js --data ./report.json --filter "Stage=Closed Won" --agg "Amount:sum"
  node report-explorer.js --data ./report.json --group Region,Stage --agg Amount:sum
  node report-explorer.js --data ./report.json --query "show Amount by Stage"
  node report-explorer.js --data ./report.json --sort Amount --limit 10
        `);
        process.exit(0);
    }

    try {
        const dataPath = args.includes('--data') ? args[args.indexOf('--data') + 1] : null;
        const queryStr = args.includes('--query') ? args[args.indexOf('--query') + 1] : null;
        const filterStr = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : null;
        const groupFields = args.includes('--group') ? args[args.indexOf('--group') + 1].split(',') : null;
        const aggStr = args.includes('--agg') ? args[args.indexOf('--agg') + 1] : null;
        const sortBy = args.includes('--sort') ? args[args.indexOf('--sort') + 1] : null;
        const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
        const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'table';
        const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;

        if (!dataPath) {
            console.error('Error: --data argument is required');
            process.exit(1);
        }

        const explorer = new ReportExplorer();
        const loadResult = await explorer.loadReport(dataPath);

        if (!loadResult.success) {
            console.error(`Error loading data: ${loadResult.error}`);
            process.exit(1);
        }

        console.log(`Loaded ${loadResult.totalRows} rows with ${loadResult.columns.length} columns`);

        // Natural language query
        if (queryStr) {
            const result = explorer.query(queryStr);
            console.log(JSON.stringify(result, null, 2));
            return;
        }

        // Apply filter
        if (filterStr) {
            const [field, value] = filterStr.split('=');
            explorer.filter(field, '=', value);
        }

        // Apply grouping
        if (groupFields) {
            explorer.groupBy(groupFields);
        }

        // Apply aggregation
        if (aggStr) {
            const [field, op] = aggStr.split(':');
            explorer.aggregate(field, op);
        }

        // Get view
        const view = explorer.getCurrentView({ limit, sortBy, sortOrder: 'desc' });

        // Output
        if (outputPath) {
            const exportFormat = outputPath.endsWith('.csv') ? 'csv' : 'json';
            const result = explorer.exportCurrentView(exportFormat, outputPath);
            console.log(`Exported to ${result.path}`);
        } else if (format === 'json') {
            console.log(JSON.stringify(view, null, 2));
        } else {
            console.log(`\nResults (${view.total} total, showing ${view.returned}):`);
            console.table(view.data.slice(0, 20));
        }

    } catch (error) {
        console.error('\nError:');
        console.error(error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { ReportExplorer };
