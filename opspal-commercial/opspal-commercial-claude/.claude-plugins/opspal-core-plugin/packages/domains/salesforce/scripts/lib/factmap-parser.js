#!/usr/bin/env node

/**
 * Fact Map Parser and Normalizer for Salesforce Reports
 * 
 * Converts complex Salesforce report fact maps into tidy, chart-ready data structures.
 * Handles matrix, summary, and tabular report formats.
 * 
 * Fact map keys like "0!T", "1_0!T", "2_1_0!T" represent hierarchical groupings:
 * - Numbers represent grouping levels
 * - "!T" represents totals
 * - Underscores separate grouping indices
 */

const fs = require('fs').promises;
const path = require('path');

class FactMapParser {
    constructor() {
        this.debugMode = process.env.DEBUG === 'true';
    }

    /**
     * Parse a Salesforce report response and normalize the fact map
     * @param {Object} reportData - Raw Salesforce report response
     * @returns {Object} Normalized data structure
     */
    parseReportResponse(reportData) {
        if (!reportData || !reportData.factMap) {
            throw new Error('Invalid report data: missing factMap');
        }

        const { factMap, groupingsDown, groupingsAcross, reportMetadata } = reportData;
        const format = reportMetadata?.reportFormat || 'TABULAR';

        switch (format.toUpperCase()) {
            case 'TABULAR':
                return this.parseTabularReport(reportData);
            case 'SUMMARY':
                return this.parseSummaryReport(reportData);
            case 'MATRIX':
                return this.parseMatrixReport(reportData);
            default:
                throw new Error(`Unsupported report format: ${format}`);
        }
    }

    /**
     * Parse tabular report (simple row-based data)
     */
    parseTabularReport(reportData) {
        const { factMap, reportMetadata } = reportData;
        const rows = [];
        
        // Tabular reports have a single fact map key "T!T"
        const facts = factMap['T!T'];
        if (!facts || !facts.rows) {
            return { rows: [], columns: [], totals: {} };
        }

        // Extract column information
        const columns = reportMetadata.detailColumns || [];
        
        // Process each row
        facts.rows.forEach(row => {
            const rowData = {};
            row.dataCells.forEach((cell, index) => {
                const columnName = columns[index];
                rowData[columnName] = this.extractCellValue(cell);
            });
            rows.push(rowData);
        });

        return {
            format: 'TABULAR',
            rows,
            columns,
            totals: this.extractAggregates(facts.aggregates)
        };
    }

    /**
     * Parse summary report (grouped data with subtotals)
     */
    parseSummaryReport(reportData) {
        const { factMap, groupingsDown, reportMetadata } = reportData;
        const result = {
            format: 'SUMMARY',
            groups: [],
            series: [],
            totals: {}
        };

        // Process groupings hierarchy
        if (groupingsDown && groupingsDown.groupings) {
            result.groups = this.processGroupings(
                groupingsDown.groupings,
                factMap,
                reportMetadata
            );
        }

        // Extract grand totals
        const grandTotalKey = 'T!T';
        if (factMap[grandTotalKey]) {
            result.totals = this.extractAggregates(factMap[grandTotalKey].aggregates);
        }

        // Create chart-ready series
        result.series = this.createSeriesFromGroups(result.groups, reportMetadata);

        return result;
    }

    /**
     * Parse matrix report (cross-tab data)
     */
    parseMatrixReport(reportData) {
        const { factMap, groupingsDown, groupingsAcross, reportMetadata } = reportData;
        const result = {
            format: 'MATRIX',
            rowGroups: [],
            columnGroups: [],
            matrix: {},
            series: [],
            totals: {}
        };

        // Process row groupings
        if (groupingsDown && groupingsDown.groupings) {
            result.rowGroups = groupingsDown.groupings.map(g => ({
                key: g.key,
                label: g.label,
                value: g.value
            }));
        }

        // Process column groupings
        if (groupingsAcross && groupingsAcross.groupings) {
            result.columnGroups = groupingsAcross.groupings.map(g => ({
                key: g.key,
                label: g.label,
                value: g.value
            }));
        }

        // Build matrix data
        result.matrix = this.buildMatrix(
            factMap,
            result.rowGroups,
            result.columnGroups,
            reportMetadata
        );

        // Extract grand totals
        if (factMap['T!T']) {
            result.totals = this.extractAggregates(factMap['T!T'].aggregates);
        }

        // Create chart-ready series
        result.series = this.createMatrixSeries(result.matrix, reportMetadata);

        return result;
    }

    /**
     * Process hierarchical groupings recursively
     */
    processGroupings(groupings, factMap, metadata, level = 0, parentKey = '') {
        const results = [];

        groupings.forEach((group, index) => {
            const factKey = parentKey ? `${parentKey}_${index}` : `${index}`;
            const totalKey = `${factKey}!T`;
            
            const groupData = {
                level,
                key: group.key,
                label: group.label,
                value: group.value,
                factKey: totalKey,
                data: {},
                children: []
            };

            // Get aggregates for this grouping
            if (factMap[totalKey]) {
                groupData.data = this.extractAggregates(factMap[totalKey].aggregates);
                
                // Process detail rows if present
                if (factMap[totalKey].rows) {
                    groupData.rows = this.extractRows(factMap[totalKey].rows, metadata);
                }
            }

            // Process child groupings
            if (group.groupings && group.groupings.length > 0) {
                groupData.children = this.processGroupings(
                    group.groupings,
                    factMap,
                    metadata,
                    level + 1,
                    factKey
                );
            }

            results.push(groupData);
        });

        return results;
    }

    /**
     * Build matrix data structure
     */
    buildMatrix(factMap, rowGroups, columnGroups, metadata) {
        const matrix = {};

        // Initialize matrix structure
        rowGroups.forEach(row => {
            matrix[row.key] = {};
            columnGroups.forEach(col => {
                matrix[row.key][col.key] = {};
            });
        });

        // Populate matrix with fact map data
        Object.keys(factMap).forEach(factKey => {
            const parsed = this.parseFactMapKey(factKey);
            if (!parsed) return;

            const { rowIndex, colIndex, isTotal } = parsed;

            if (rowIndex !== null && colIndex !== null) {
                const row = rowGroups[rowIndex];
                const col = columnGroups[colIndex];
                
                if (row && col && factMap[factKey]) {
                    matrix[row.key][col.key] = this.extractAggregates(
                        factMap[factKey].aggregates
                    );
                }
            }
        });

        return matrix;
    }

    /**
     * Parse fact map key to extract indices
     * Examples: "0!T" -> {rowIndex: 0, isTotal: true}
     *          "1_0!T" -> {rowIndex: 1, colIndex: 0, isTotal: true}
     */
    parseFactMapKey(key) {
        if (!key || typeof key !== 'string') return null;

        const isTotal = key.endsWith('!T');
        const indexPart = isTotal ? key.slice(0, -2) : key;

        if (indexPart === 'T') {
            return { rowIndex: null, colIndex: null, isTotal: true };
        }

        const parts = indexPart.split('_').map(p => parseInt(p, 10));
        
        if (parts.length === 1) {
            return { rowIndex: parts[0], colIndex: null, isTotal };
        } else if (parts.length === 2) {
            return { rowIndex: parts[0], colIndex: parts[1], isTotal };
        }

        return { indices: parts, isTotal };
    }

    /**
     * Extract cell value from various cell formats
     */
    extractCellValue(cell) {
        if (!cell) return null;
        
        if (cell.value !== undefined) {
            return cell.value;
        }
        if (cell.label !== undefined) {
            return cell.label;
        }
        
        return cell;
    }

    /**
     * Extract aggregates from fact map aggregates array
     */
    extractAggregates(aggregates) {
        if (!aggregates || !Array.isArray(aggregates)) {
            return {};
        }

        const result = {};
        aggregates.forEach((agg, index) => {
            const key = `aggregate_${index}`;
            result[key] = {
                value: agg.value,
                label: agg.label || key,
                formattedValue: agg.formattedValue || agg.value
            };
        });
        return result;
    }

    /**
     * Extract rows from fact map rows
     */
    extractRows(rows, metadata) {
        if (!rows || !Array.isArray(rows)) return [];

        const columns = metadata.detailColumns || [];
        
        return rows.map(row => {
            const rowData = {};
            if (row.dataCells) {
                row.dataCells.forEach((cell, index) => {
                    const columnName = columns[index] || `column_${index}`;
                    rowData[columnName] = this.extractCellValue(cell);
                });
            }
            return rowData;
        });
    }

    /**
     * Create chart-ready series from grouped data
     */
    createSeriesFromGroups(groups, metadata) {
        const series = [];
        const aggregateColumns = metadata.aggregates || [];

        // Flatten groups into series
        const flattenGroups = (groups, parentLabel = '') => {
            groups.forEach(group => {
                const label = parentLabel ? `${parentLabel} - ${group.label}` : group.label;
                
                // Create a data point for each aggregate
                Object.keys(group.data).forEach(aggKey => {
                    const aggData = group.data[aggKey];
                    series.push({
                        category: label,
                        metric: aggData.label,
                        value: aggData.value,
                        formattedValue: aggData.formattedValue
                    });
                });

                // Process children
                if (group.children && group.children.length > 0) {
                    flattenGroups(group.children, label);
                }
            });
        };

        flattenGroups(groups);
        return series;
    }

    /**
     * Create chart-ready series from matrix data
     */
    createMatrixSeries(matrix, metadata) {
        const series = [];

        Object.keys(matrix).forEach(rowKey => {
            Object.keys(matrix[rowKey]).forEach(colKey => {
                const data = matrix[rowKey][colKey];
                Object.keys(data).forEach(metricKey => {
                    series.push({
                        row: rowKey,
                        column: colKey,
                        metric: data[metricKey].label,
                        value: data[metricKey].value,
                        formattedValue: data[metricKey].formattedValue
                    });
                });
            });
        });

        return series;
    }

    /**
     * Convert normalized data to CSV format
     */
    toCSV(normalizedData) {
        const { series } = normalizedData;
        if (!series || series.length === 0) return '';

        // Get all unique keys from series
        const headers = new Set();
        series.forEach(item => {
            Object.keys(item).forEach(key => headers.add(key));
        });

        const headerArray = Array.from(headers);
        const csv = [headerArray.join(',')];

        series.forEach(item => {
            const row = headerArray.map(header => {
                const value = item[header];
                // Escape commas and quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
            });
            csv.push(row.join(','));
        });

        return csv.join('\n');
    }

    /**
     * Convert normalized data to chart configuration
     */
    toChartConfig(normalizedData, chartType = 'bar') {
        const { series, format } = normalizedData;
        
        const config = {
            type: chartType,
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: `${format} Report` }
                }
            }
        };

        if (format === 'SUMMARY' || format === 'TABULAR') {
            // Group by metric
            const metricGroups = {};
            series.forEach(item => {
                const metric = item.metric || 'Value';
                if (!metricGroups[metric]) {
                    metricGroups[metric] = [];
                }
                metricGroups[metric].push(item);
            });

            // Create datasets
            Object.keys(metricGroups).forEach((metric, index) => {
                const data = metricGroups[metric];
                config.data.datasets.push({
                    label: metric,
                    data: data.map(d => d.value),
                    backgroundColor: this.getColor(index)
                });
                
                // Set labels from first dataset
                if (index === 0) {
                    config.data.labels = data.map(d => d.category || d.row || 'Item');
                }
            });
        } else if (format === 'MATRIX') {
            // For matrix, create stacked bar chart
            const rows = [...new Set(series.map(s => s.row))];
            const columns = [...new Set(series.map(s => s.column))];
            
            config.data.labels = rows;
            
            columns.forEach((col, index) => {
                config.data.datasets.push({
                    label: col,
                    data: rows.map(row => {
                        const item = series.find(s => s.row === row && s.column === col);
                        return item ? item.value : 0;
                    }),
                    backgroundColor: this.getColor(index)
                });
            });

            config.options.scales = {
                x: { stacked: true },
                y: { stacked: true }
            };
        }

        return config;
    }

    /**
     * Get color for chart dataset
     */
    getColor(index) {
        const colors = [
            'rgba(54, 162, 235, 0.8)',  // Blue
            'rgba(255, 99, 132, 0.8)',   // Red
            'rgba(75, 192, 192, 0.8)',   // Green
            'rgba(255, 206, 86, 0.8)',   // Yellow
            'rgba(153, 102, 255, 0.8)',  // Purple
            'rgba(255, 159, 64, 0.8)',   // Orange
            'rgba(199, 199, 199, 0.8)',  // Gray
            'rgba(83, 102, 255, 0.8)',   // Indigo
        ];
        return colors[index % colors.length];
    }

    /**
     * Debug logging
     */
    debug(message, data) {
        if (this.debugMode) {
            console.log(`[FactMapParser] ${message}`, data || '');
        }
    }
}

// Export for use in other modules
module.exports = FactMapParser;

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Fact Map Parser - Normalize Salesforce Report Data

Usage:
  node factmap-parser.js <report-file.json> [options]

Options:
  --format <type>   Output format: json, csv, chart (default: json)
  --output <file>   Output file path (default: stdout)
  --debug           Enable debug logging

Examples:
  node factmap-parser.js report.json --format csv --output report.csv
  node factmap-parser.js report.json --format chart --output chart-config.json
  
Input should be a JSON file containing Salesforce report response.
        `);
        process.exit(0);
    }

    const inputFile = args[0];
    const format = args.includes('--format') ? 
        args[args.indexOf('--format') + 1] : 'json';
    const outputFile = args.includes('--output') ? 
        args[args.indexOf('--output') + 1] : null;
    const debug = args.includes('--debug');

    if (debug) process.env.DEBUG = 'true';

    const parser = new FactMapParser();

    // Process the file
    (async () => {
        try {
            const data = await fs.readFile(inputFile, 'utf8');
            const reportData = JSON.parse(data);
            
            const normalized = parser.parseReportResponse(reportData);
            
            let output;
            switch (format) {
                case 'csv':
                    output = parser.toCSV(normalized);
                    break;
                case 'chart':
                    output = JSON.stringify(parser.toChartConfig(normalized), null, 2);
                    break;
                default:
                    output = JSON.stringify(normalized, null, 2);
            }

            if (outputFile) {
                await fs.writeFile(outputFile, output);
                console.log(`Output written to ${outputFile}`);
            } else {
                console.log(output);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}