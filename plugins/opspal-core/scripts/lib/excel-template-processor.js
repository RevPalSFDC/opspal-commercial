/**
 * Excel Template Processor for RevOps Reporting
 *
 * Generates professionally formatted Excel reports with:
 * - Multi-sheet workbooks
 * - Conditional formatting
 * - Charts and visualizations
 * - Benchmark comparisons
 * - Methodology appendix
 *
 * @module excel-template-processor
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Excel Template Processor Class
 * Generates formatted Excel workbooks for RevOps reports
 */
class ExcelTemplateProcessor {
    constructor(options = {}) {
        this.options = {
            companyName: options.companyName || 'Company',
            reportTitle: options.reportTitle || 'RevOps Report',
            generatedBy: options.generatedBy || 'RevOps Reporting Assistant',
            dateFormat: options.dateFormat || 'YYYY-MM-DD',
            currencyFormat: options.currencyFormat || '$#,##0.00',
            percentFormat: options.percentFormat || '0.00%',
            ...options
        };

        this.sheets = [];
        this.styles = this._initializeStyles();
        this.charts = [];
    }

    /**
     * Initialize standard styles for the workbook
     * @private
     */
    _initializeStyles() {
        return {
            header: {
                font: { bold: true, size: 12, color: 'FFFFFF' },
                fill: { type: 'solid', color: '2E5A88' },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: { bottom: { style: 'thin', color: '000000' } }
            },
            subHeader: {
                font: { bold: true, size: 11, color: '2E5A88' },
                fill: { type: 'solid', color: 'E8F0F8' },
                alignment: { horizontal: 'left' }
            },
            data: {
                font: { size: 10 },
                alignment: { vertical: 'center' },
                border: { bottom: { style: 'hair', color: 'CCCCCC' } }
            },
            dataAlt: {
                font: { size: 10 },
                fill: { type: 'solid', color: 'F9F9F9' },
                alignment: { vertical: 'center' },
                border: { bottom: { style: 'hair', color: 'CCCCCC' } }
            },
            currency: {
                numFmt: '$#,##0.00'
            },
            percent: {
                numFmt: '0.00%'
            },
            number: {
                numFmt: '#,##0'
            },
            date: {
                numFmt: 'yyyy-mm-dd'
            },
            good: {
                font: { color: '006600' },
                fill: { type: 'solid', color: 'C6EFCE' }
            },
            warning: {
                font: { color: '9C5700' },
                fill: { type: 'solid', color: 'FFEB9C' }
            },
            bad: {
                font: { color: '9C0006' },
                fill: { type: 'solid', color: 'FFC7CE' }
            },
            title: {
                font: { bold: true, size: 16, color: '2E5A88' },
                alignment: { horizontal: 'left' }
            },
            subtitle: {
                font: { size: 11, color: '666666', italic: true },
                alignment: { horizontal: 'left' }
            }
        };
    }

    /**
     * Add a data sheet to the workbook
     * @param {Object} sheetConfig - Sheet configuration
     */
    addDataSheet(sheetConfig) {
        const sheet = {
            name: sheetConfig.name || `Sheet${this.sheets.length + 1}`,
            type: 'data',
            title: sheetConfig.title,
            subtitle: sheetConfig.subtitle,
            columns: sheetConfig.columns || [],
            data: sheetConfig.data || [],
            totals: sheetConfig.totals || null,
            conditionalFormatting: sheetConfig.conditionalFormatting || [],
            freezePane: sheetConfig.freezePane !== false,
            autoFilter: sheetConfig.autoFilter !== false,
            columnWidths: sheetConfig.columnWidths || {}
        };

        this.sheets.push(sheet);
        return this;
    }

    /**
     * Add an executive summary sheet
     * @param {Object} summaryConfig - Summary configuration
     */
    addSummarySheet(summaryConfig) {
        const sheet = {
            name: summaryConfig.name || 'Executive Summary',
            type: 'summary',
            title: summaryConfig.title || 'Executive Summary',
            subtitle: summaryConfig.subtitle,
            bluf: summaryConfig.bluf, // Bottom Line Up Front
            keyMetrics: summaryConfig.keyMetrics || [],
            highlights: summaryConfig.highlights || [],
            recommendations: summaryConfig.recommendations || [],
            period: summaryConfig.period
        };

        this.sheets.push(sheet);
        return this;
    }

    /**
     * Add a KPI dashboard sheet
     * @param {Object} dashboardConfig - Dashboard configuration
     */
    addDashboardSheet(dashboardConfig) {
        const sheet = {
            name: dashboardConfig.name || 'KPI Dashboard',
            type: 'dashboard',
            title: dashboardConfig.title || 'KPI Dashboard',
            kpis: dashboardConfig.kpis || [],
            benchmarkComparisons: dashboardConfig.benchmarkComparisons || [],
            trendData: dashboardConfig.trendData || [],
            period: dashboardConfig.period
        };

        this.sheets.push(sheet);
        return this;
    }

    /**
     * Add a methodology appendix sheet
     * @param {Object} methodologyConfig - Methodology configuration
     */
    addMethodologySheet(methodologyConfig) {
        const sheet = {
            name: methodologyConfig.name || 'Methodology',
            type: 'methodology',
            title: methodologyConfig.title || 'Methodology & Data Sources',
            dataSources: methodologyConfig.dataSources || [],
            formulas: methodologyConfig.formulas || [],
            assumptions: methodologyConfig.assumptions || [],
            exclusions: methodologyConfig.exclusions || [],
            queries: methodologyConfig.queries || [],
            benchmarkSources: methodologyConfig.benchmarkSources || []
        };

        this.sheets.push(sheet);
        return this;
    }

    /**
     * Add a chart configuration
     * @param {Object} chartConfig - Chart configuration
     */
    addChart(chartConfig) {
        this.charts.push({
            sheetName: chartConfig.sheetName,
            type: chartConfig.type || 'line', // line, bar, column, pie, area
            title: chartConfig.title,
            dataRange: chartConfig.dataRange,
            categoryRange: chartConfig.categoryRange,
            position: chartConfig.position || { col: 0, row: 0 },
            size: chartConfig.size || { width: 600, height: 400 },
            legend: chartConfig.legend !== false,
            colors: chartConfig.colors || ['2E5A88', '5B9BD5', '70AD47', 'FFC000', 'FF6B6B']
        });
        return this;
    }

    /**
     * Generate the workbook structure (without external dependencies)
     * Returns a structured object that can be used with xlsx/exceljs
     * @returns {Object} Workbook structure
     */
    generate() {
        const workbook = {
            creator: this.options.generatedBy,
            created: new Date(),
            modified: new Date(),
            properties: {
                title: this.options.reportTitle,
                subject: 'RevOps Report',
                company: this.options.companyName
            },
            sheets: [],
            charts: this.charts
        };

        for (const sheet of this.sheets) {
            const generatedSheet = this._generateSheet(sheet);
            workbook.sheets.push(generatedSheet);
        }

        return workbook;
    }

    /**
     * Generate a single sheet
     * @private
     */
    _generateSheet(sheet) {
        switch (sheet.type) {
            case 'data':
                return this._generateDataSheet(sheet);
            case 'summary':
                return this._generateSummarySheet(sheet);
            case 'dashboard':
                return this._generateDashboardSheet(sheet);
            case 'methodology':
                return this._generateMethodologySheet(sheet);
            default:
                return this._generateDataSheet(sheet);
        }
    }

    /**
     * Generate a data sheet
     * @private
     */
    _generateDataSheet(sheet) {
        const rows = [];
        let currentRow = 1;

        // Title row
        if (sheet.title) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: sheet.title, style: 'title', colspan: sheet.columns.length }]
            });
        }

        // Subtitle row
        if (sheet.subtitle) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: sheet.subtitle, style: 'subtitle', colspan: sheet.columns.length }]
            });
            currentRow++; // Empty row after subtitle
        }

        // Header row
        const headerRow = {
            row: currentRow++,
            cells: sheet.columns.map((col, idx) => ({
                col: idx + 1,
                value: col.header || col.key,
                style: 'header'
            }))
        };
        rows.push(headerRow);

        // Data rows
        const headerRowNum = currentRow - 1;
        sheet.data.forEach((record, rowIdx) => {
            const dataRow = {
                row: currentRow++,
                cells: sheet.columns.map((col, colIdx) => {
                    let value = record[col.key];
                    let style = rowIdx % 2 === 0 ? 'data' : 'dataAlt';
                    let format = col.format;

                    // Apply conditional formatting
                    const condFormat = this._evaluateConditionalFormat(
                        sheet.conditionalFormatting,
                        col.key,
                        value,
                        record
                    );
                    if (condFormat) {
                        style = condFormat;
                    }

                    return {
                        col: colIdx + 1,
                        value: value,
                        style: style,
                        format: format
                    };
                })
            };
            rows.push(dataRow);
        });

        // Totals row
        if (sheet.totals) {
            const totalsRow = {
                row: currentRow++,
                cells: sheet.columns.map((col, colIdx) => ({
                    col: colIdx + 1,
                    value: sheet.totals[col.key] || '',
                    style: 'subHeader',
                    format: col.format
                }))
            };
            rows.push(totalsRow);
        }

        return {
            name: sheet.name,
            type: 'data',
            rows: rows,
            columns: sheet.columns.map((col, idx) => ({
                index: idx + 1,
                width: sheet.columnWidths[col.key] || this._calculateColumnWidth(col, sheet.data),
                key: col.key
            })),
            freezePane: sheet.freezePane ? { row: headerRowNum, col: 0 } : null,
            autoFilter: sheet.autoFilter ? {
                from: { row: headerRowNum, col: 1 },
                to: { row: currentRow - 1, col: sheet.columns.length }
            } : null
        };
    }

    /**
     * Generate a summary sheet
     * @private
     */
    _generateSummarySheet(sheet) {
        const rows = [];
        let currentRow = 1;

        // Title
        rows.push({
            row: currentRow++,
            cells: [{ col: 1, value: sheet.title, style: 'title', colspan: 4 }]
        });

        if (sheet.subtitle) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: sheet.subtitle, style: 'subtitle', colspan: 4 }]
            });
        }

        if (sheet.period) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: `Period: ${sheet.period}`, style: 'subtitle', colspan: 4 }]
            });
        }

        currentRow++; // Empty row

        // BLUF (Bottom Line Up Front)
        if (sheet.bluf) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Bottom Line', style: 'subHeader', colspan: 4 }]
            });
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: sheet.bluf, style: 'data', colspan: 4 }]
            });
            currentRow++;
        }

        // Key Metrics
        if (sheet.keyMetrics.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Key Metrics', style: 'subHeader', colspan: 4 }]
            });
            rows.push({
                row: currentRow++,
                cells: [
                    { col: 1, value: 'Metric', style: 'header' },
                    { col: 2, value: 'Value', style: 'header' },
                    { col: 3, value: 'Target', style: 'header' },
                    { col: 4, value: 'Status', style: 'header' }
                ]
            });

            for (const metric of sheet.keyMetrics) {
                const status = this._getMetricStatus(metric.value, metric.target, metric.higherIsBetter);
                rows.push({
                    row: currentRow++,
                    cells: [
                        { col: 1, value: metric.name, style: 'data' },
                        { col: 2, value: metric.value, style: 'data', format: metric.format },
                        { col: 3, value: metric.target, style: 'data', format: metric.format },
                        { col: 4, value: status.label, style: status.style }
                    ]
                });
            }
            currentRow++;
        }

        // Highlights
        if (sheet.highlights.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Key Highlights', style: 'subHeader', colspan: 4 }]
            });
            for (const highlight of sheet.highlights) {
                rows.push({
                    row: currentRow++,
                    cells: [{ col: 1, value: `• ${highlight}`, style: 'data', colspan: 4 }]
                });
            }
            currentRow++;
        }

        // Recommendations
        if (sheet.recommendations.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Recommendations', style: 'subHeader', colspan: 4 }]
            });
            for (let i = 0; i < sheet.recommendations.length; i++) {
                rows.push({
                    row: currentRow++,
                    cells: [{ col: 1, value: `${i + 1}. ${sheet.recommendations[i]}`, style: 'data', colspan: 4 }]
                });
            }
        }

        return {
            name: sheet.name,
            type: 'summary',
            rows: rows,
            columns: [
                { index: 1, width: 30 },
                { index: 2, width: 20 },
                { index: 3, width: 20 },
                { index: 4, width: 15 }
            ]
        };
    }

    /**
     * Generate a dashboard sheet
     * @private
     */
    _generateDashboardSheet(sheet) {
        const rows = [];
        let currentRow = 1;

        // Title
        rows.push({
            row: currentRow++,
            cells: [{ col: 1, value: sheet.title, style: 'title', colspan: 6 }]
        });

        if (sheet.period) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: `Period: ${sheet.period}`, style: 'subtitle', colspan: 6 }]
            });
        }

        currentRow++;

        // KPI Cards (2x3 grid)
        if (sheet.kpis.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'KPI Overview', style: 'subHeader', colspan: 6 }]
            });

            // Header row for KPI table
            rows.push({
                row: currentRow++,
                cells: [
                    { col: 1, value: 'KPI', style: 'header' },
                    { col: 2, value: 'Current', style: 'header' },
                    { col: 3, value: 'Previous', style: 'header' },
                    { col: 4, value: 'Change', style: 'header' },
                    { col: 5, value: 'Benchmark', style: 'header' },
                    { col: 6, value: 'Status', style: 'header' }
                ]
            });

            for (const kpi of sheet.kpis) {
                const change = kpi.previous ? ((kpi.current - kpi.previous) / kpi.previous * 100) : null;
                const changeStr = change !== null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : 'N/A';
                const status = this._evaluateKPIStatus(kpi);

                rows.push({
                    row: currentRow++,
                    cells: [
                        { col: 1, value: kpi.name, style: 'data' },
                        { col: 2, value: kpi.current, style: 'data', format: kpi.format },
                        { col: 3, value: kpi.previous || 'N/A', style: 'data', format: kpi.format },
                        { col: 4, value: changeStr, style: change >= 0 ? 'good' : 'bad' },
                        { col: 5, value: kpi.benchmark || 'N/A', style: 'data', format: kpi.format },
                        { col: 6, value: status.label, style: status.style }
                    ]
                });
            }
            currentRow++;
        }

        // Benchmark Comparisons
        if (sheet.benchmarkComparisons.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Benchmark Comparisons', style: 'subHeader', colspan: 6 }]
            });

            rows.push({
                row: currentRow++,
                cells: [
                    { col: 1, value: 'Metric', style: 'header' },
                    { col: 2, value: 'Your Value', style: 'header' },
                    { col: 3, value: 'Industry Avg', style: 'header' },
                    { col: 4, value: 'Top Quartile', style: 'header' },
                    { col: 5, value: 'Percentile', style: 'header' },
                    { col: 6, value: 'Assessment', style: 'header' }
                ]
            });

            for (const comp of sheet.benchmarkComparisons) {
                rows.push({
                    row: currentRow++,
                    cells: [
                        { col: 1, value: comp.metric, style: 'data' },
                        { col: 2, value: comp.value, style: 'data', format: comp.format },
                        { col: 3, value: comp.industryAvg, style: 'data', format: comp.format },
                        { col: 4, value: comp.topQuartile, style: 'data', format: comp.format },
                        { col: 5, value: comp.percentile ? `${comp.percentile}th` : 'N/A', style: 'data' },
                        { col: 6, value: comp.assessment, style: this._getAssessmentStyle(comp.assessment) }
                    ]
                });
            }
        }

        return {
            name: sheet.name,
            type: 'dashboard',
            rows: rows,
            columns: [
                { index: 1, width: 25 },
                { index: 2, width: 15 },
                { index: 3, width: 15 },
                { index: 4, width: 15 },
                { index: 5, width: 15 },
                { index: 6, width: 15 }
            ]
        };
    }

    /**
     * Generate a methodology sheet
     * @private
     */
    _generateMethodologySheet(sheet) {
        const rows = [];
        let currentRow = 1;

        // Title
        rows.push({
            row: currentRow++,
            cells: [{ col: 1, value: sheet.title, style: 'title', colspan: 3 }]
        });
        currentRow++;

        // Data Sources
        if (sheet.dataSources.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Data Sources', style: 'subHeader', colspan: 3 }]
            });
            rows.push({
                row: currentRow++,
                cells: [
                    { col: 1, value: 'Source', style: 'header' },
                    { col: 2, value: 'Object/Table', style: 'header' },
                    { col: 3, value: 'Record Count', style: 'header' }
                ]
            });

            for (const source of sheet.dataSources) {
                rows.push({
                    row: currentRow++,
                    cells: [
                        { col: 1, value: source.platform || source.source, style: 'data' },
                        { col: 2, value: source.object || source.type, style: 'data' },
                        { col: 3, value: source.recordCount || source.records || 'N/A', style: 'data', format: 'number' }
                    ]
                });
            }
            currentRow++;
        }

        // Formulas
        if (sheet.formulas.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Formulas & Calculations', style: 'subHeader', colspan: 3 }]
            });
            rows.push({
                row: currentRow++,
                cells: [
                    { col: 1, value: 'Metric', style: 'header' },
                    { col: 2, value: 'Formula', style: 'header', colspan: 2 }
                ]
            });

            for (const formula of sheet.formulas) {
                rows.push({
                    row: currentRow++,
                    cells: [
                        { col: 1, value: formula.kpiName || formula.metric || formula.name, style: 'data' },
                        { col: 2, value: formula.formula, style: 'data', colspan: 2 }
                    ]
                });
            }
            currentRow++;
        }

        // Assumptions
        if (sheet.assumptions.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Assumptions', style: 'subHeader', colspan: 3 }]
            });

            for (const assumption of sheet.assumptions) {
                const text = typeof assumption === 'string' ? assumption : assumption.assumption;
                const rationale = typeof assumption === 'object' ? assumption.rationale : null;
                rows.push({
                    row: currentRow++,
                    cells: [{
                        col: 1,
                        value: `• ${text}${rationale ? ` (${rationale})` : ''}`,
                        style: 'data',
                        colspan: 3
                    }]
                });
            }
            currentRow++;
        }

        // Exclusions
        if (sheet.exclusions.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Data Exclusions', style: 'subHeader', colspan: 3 }]
            });

            for (const exclusion of sheet.exclusions) {
                const text = typeof exclusion === 'string' ? exclusion : exclusion.exclusion;
                const reason = typeof exclusion === 'object' ? exclusion.reason : null;
                rows.push({
                    row: currentRow++,
                    cells: [{
                        col: 1,
                        value: `• ${text}${reason ? `: ${reason}` : ''}`,
                        style: 'data',
                        colspan: 3
                    }]
                });
            }
            currentRow++;
        }

        // Queries
        if (sheet.queries.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Queries Executed', style: 'subHeader', colspan: 3 }]
            });

            for (const query of sheet.queries) {
                rows.push({
                    row: currentRow++,
                    cells: [{
                        col: 1,
                        value: `${query.platform || 'Query'}: ${query.purpose || query.description || ''}`,
                        style: 'subHeader',
                        colspan: 3
                    }]
                });
                rows.push({
                    row: currentRow++,
                    cells: [{
                        col: 1,
                        value: query.query || query.soql || query.text,
                        style: 'data',
                        colspan: 3
                    }]
                });
                currentRow++;
            }
        }

        // Benchmark Sources
        if (sheet.benchmarkSources.length > 0) {
            rows.push({
                row: currentRow++,
                cells: [{ col: 1, value: 'Benchmark Sources', style: 'subHeader', colspan: 3 }]
            });

            for (const source of sheet.benchmarkSources) {
                rows.push({
                    row: currentRow++,
                    cells: [{
                        col: 1,
                        value: `• ${source.name || source}: ${source.url || source.description || ''}`,
                        style: 'data',
                        colspan: 3
                    }]
                });
            }
        }

        // Generation timestamp
        currentRow++;
        rows.push({
            row: currentRow++,
            cells: [{
                col: 1,
                value: `Generated: ${new Date().toISOString()}`,
                style: 'subtitle',
                colspan: 3
            }]
        });
        rows.push({
            row: currentRow++,
            cells: [{
                col: 1,
                value: `Generated by: ${this.options.generatedBy}`,
                style: 'subtitle',
                colspan: 3
            }]
        });

        return {
            name: sheet.name,
            type: 'methodology',
            rows: rows,
            columns: [
                { index: 1, width: 25 },
                { index: 2, width: 40 },
                { index: 3, width: 20 }
            ]
        };
    }

    /**
     * Evaluate conditional formatting
     * @private
     */
    _evaluateConditionalFormat(rules, columnKey, value, record) {
        for (const rule of rules) {
            if (rule.column !== columnKey) continue;

            switch (rule.type) {
                case 'threshold':
                    if (rule.good && value >= rule.good) return 'good';
                    if (rule.bad && value <= rule.bad) return 'bad';
                    if (rule.warning) return 'warning';
                    break;

                case 'comparison':
                    const compareValue = record[rule.compareColumn];
                    if (rule.operator === '>' && value > compareValue) return rule.style;
                    if (rule.operator === '<' && value < compareValue) return rule.style;
                    if (rule.operator === '>=' && value >= compareValue) return rule.style;
                    if (rule.operator === '<=' && value <= compareValue) return rule.style;
                    break;

                case 'contains':
                    if (String(value).toLowerCase().includes(rule.value.toLowerCase())) {
                        return rule.style;
                    }
                    break;
            }
        }
        return null;
    }

    /**
     * Calculate optimal column width
     * @private
     */
    _calculateColumnWidth(column, data) {
        const headerLength = (column.header || column.key).length;
        let maxDataLength = 0;

        for (const record of data) {
            const value = record[column.key];
            const valueLength = String(value || '').length;
            if (valueLength > maxDataLength) {
                maxDataLength = valueLength;
            }
        }

        // Apply format-specific adjustments
        if (column.format === 'currency') maxDataLength = Math.max(maxDataLength, 12);
        if (column.format === 'percent') maxDataLength = Math.max(maxDataLength, 8);

        return Math.min(Math.max(headerLength, maxDataLength) + 2, 50);
    }

    /**
     * Get metric status based on value vs target
     * @private
     */
    _getMetricStatus(value, target, higherIsBetter = true) {
        if (target === undefined || target === null) {
            return { label: 'N/A', style: 'data' };
        }

        const ratio = value / target;

        if (higherIsBetter) {
            if (ratio >= 1) return { label: 'On Track', style: 'good' };
            if (ratio >= 0.8) return { label: 'At Risk', style: 'warning' };
            return { label: 'Below Target', style: 'bad' };
        } else {
            if (ratio <= 1) return { label: 'On Track', style: 'good' };
            if (ratio <= 1.2) return { label: 'At Risk', style: 'warning' };
            return { label: 'Above Target', style: 'bad' };
        }
    }

    /**
     * Evaluate KPI status
     * @private
     */
    _evaluateKPIStatus(kpi) {
        if (kpi.benchmark === undefined || kpi.benchmark === null) {
            return { label: 'No Benchmark', style: 'data' };
        }

        const ratio = kpi.current / kpi.benchmark;
        const higherIsBetter = kpi.higherIsBetter !== false;

        if (higherIsBetter) {
            if (ratio >= 1.1) return { label: 'Excellent', style: 'good' };
            if (ratio >= 0.9) return { label: 'Good', style: 'good' };
            if (ratio >= 0.7) return { label: 'Fair', style: 'warning' };
            return { label: 'Needs Improvement', style: 'bad' };
        } else {
            if (ratio <= 0.9) return { label: 'Excellent', style: 'good' };
            if (ratio <= 1.1) return { label: 'Good', style: 'good' };
            if (ratio <= 1.3) return { label: 'Fair', style: 'warning' };
            return { label: 'Needs Improvement', style: 'bad' };
        }
    }

    /**
     * Get style for assessment text
     * @private
     */
    _getAssessmentStyle(assessment) {
        const lower = (assessment || '').toLowerCase();
        if (lower.includes('excellent') || lower.includes('strong') || lower.includes('above')) {
            return 'good';
        }
        if (lower.includes('average') || lower.includes('fair') || lower.includes('moderate')) {
            return 'warning';
        }
        if (lower.includes('below') || lower.includes('weak') || lower.includes('poor')) {
            return 'bad';
        }
        return 'data';
    }

    /**
     * Export to CSV (for simple single-sheet export)
     * @param {number} sheetIndex - Index of sheet to export
     * @returns {string} CSV content
     */
    toCSV(sheetIndex = 0) {
        const workbook = this.generate();
        const sheet = workbook.sheets[sheetIndex];

        if (!sheet) {
            throw new Error(`Sheet at index ${sheetIndex} not found`);
        }

        const lines = [];

        for (const row of sheet.rows) {
            const values = row.cells.map(cell => {
                let value = cell.value;
                if (value === null || value === undefined) value = '';
                value = String(value);
                // Escape quotes and wrap in quotes if contains comma or quote
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            });
            lines.push(values.join(','));
        }

        return lines.join('\n');
    }

    /**
     * Export to JSON (for debugging or further processing)
     * @returns {Object} Complete workbook structure
     */
    toJSON() {
        return this.generate();
    }

    /**
     * Get styles object (for external Excel libraries)
     * @returns {Object} Styles configuration
     */
    getStyles() {
        return this.styles;
    }
}

/**
 * Create a pre-configured RevOps report workbook
 * @param {Object} reportData - Report data
 * @returns {ExcelTemplateProcessor} Configured processor
 */
function createRevOpsWorkbook(reportData) {
    const processor = new ExcelTemplateProcessor({
        companyName: reportData.companyName,
        reportTitle: reportData.title,
        generatedBy: 'RevOps Reporting Assistant'
    });

    // Executive Summary
    if (reportData.summary) {
        processor.addSummarySheet({
            name: 'Executive Summary',
            title: reportData.title,
            subtitle: `${reportData.companyName} - RevOps Analysis`,
            period: reportData.period,
            bluf: reportData.summary.bluf,
            keyMetrics: reportData.summary.keyMetrics || [],
            highlights: reportData.summary.highlights || [],
            recommendations: reportData.summary.recommendations || []
        });
    }

    // KPI Dashboard
    if (reportData.kpis) {
        processor.addDashboardSheet({
            name: 'KPI Dashboard',
            title: 'Key Performance Indicators',
            period: reportData.period,
            kpis: reportData.kpis,
            benchmarkComparisons: reportData.benchmarkComparisons || []
        });
    }

    // Data sheets
    if (reportData.dataSheets) {
        for (const dataSheet of reportData.dataSheets) {
            processor.addDataSheet(dataSheet);
        }
    }

    // Methodology
    if (reportData.methodology) {
        processor.addMethodologySheet({
            name: 'Methodology',
            title: 'Methodology & Data Sources',
            dataSources: reportData.methodology.dataSources || [],
            formulas: reportData.methodology.formulas || [],
            assumptions: reportData.methodology.assumptions || [],
            exclusions: reportData.methodology.exclusions || [],
            queries: reportData.methodology.queries || [],
            benchmarkSources: reportData.methodology.benchmarkSources || []
        });
    }

    return processor;
}

// Export for use by other modules
module.exports = {
    ExcelTemplateProcessor,
    createRevOpsWorkbook
};

// CLI interface for testing
if (require.main === module) {
    console.log('Excel Template Processor - Demo\n');
    console.log('================================\n');

    // Create sample report
    const processor = createRevOpsWorkbook({
        companyName: 'Acme Corp',
        title: 'Q4 2024 RevOps Analysis',
        period: 'October 1 - December 31, 2024',
        summary: {
            bluf: 'ARR growth of 28% YoY exceeded target. NRR at 112% indicates strong expansion. Pipeline coverage at 3.2x is healthy for Q1.',
            keyMetrics: [
                { name: 'ARR', value: 12500000, target: 10000000, format: 'currency', higherIsBetter: true },
                { name: 'NRR', value: 1.12, target: 1.10, format: 'percent', higherIsBetter: true },
                { name: 'CAC Payback', value: 14, target: 12, format: 'number', higherIsBetter: false }
            ],
            highlights: [
                'Enterprise segment grew 45% YoY',
                'Churn reduced from 8% to 5%',
                'Sales cycle shortened by 15 days'
            ],
            recommendations: [
                'Invest in enterprise sales capacity',
                'Implement expansion playbook for mid-market',
                'Focus on reducing CAC in SMB segment'
            ]
        },
        kpis: [
            { name: 'ARR', current: 12500000, previous: 9750000, benchmark: 10000000, format: 'currency' },
            { name: 'MRR', current: 1041667, previous: 812500, benchmark: 833333, format: 'currency' },
            { name: 'NRR', current: 1.12, previous: 1.08, benchmark: 1.10, format: 'percent' },
            { name: 'GRR', current: 0.92, previous: 0.89, benchmark: 0.90, format: 'percent' },
            { name: 'CAC', current: 15000, previous: 18000, benchmark: 12000, format: 'currency', higherIsBetter: false },
            { name: 'LTV:CAC', current: 4.2, previous: 3.5, benchmark: 3.0, format: 'number' }
        ],
        benchmarkComparisons: [
            { metric: 'ARR Growth', value: 0.28, industryAvg: 0.20, topQuartile: 0.30, percentile: 72, format: 'percent', assessment: 'Above Average' },
            { metric: 'NRR', value: 1.12, industryAvg: 1.02, topQuartile: 1.15, percentile: 78, format: 'percent', assessment: 'Strong' },
            { metric: 'CAC Payback', value: 14, industryAvg: 18, topQuartile: 12, percentile: 65, format: 'number', assessment: 'Good' }
        ],
        dataSheets: [
            {
                name: 'Revenue by Segment',
                title: 'Revenue Breakdown by Customer Segment',
                subtitle: 'Q4 2024',
                columns: [
                    { key: 'segment', header: 'Segment' },
                    { key: 'arr', header: 'ARR', format: 'currency' },
                    { key: 'customers', header: 'Customers', format: 'number' },
                    { key: 'avgDealSize', header: 'Avg Deal Size', format: 'currency' },
                    { key: 'growth', header: 'YoY Growth', format: 'percent' }
                ],
                data: [
                    { segment: 'Enterprise', arr: 6250000, customers: 25, avgDealSize: 250000, growth: 0.45 },
                    { segment: 'Mid-Market', arr: 4375000, customers: 125, avgDealSize: 35000, growth: 0.22 },
                    { segment: 'SMB', arr: 1875000, customers: 750, avgDealSize: 2500, growth: 0.15 }
                ],
                totals: { segment: 'Total', arr: 12500000, customers: 900, avgDealSize: 13889, growth: 0.28 },
                conditionalFormatting: [
                    { column: 'growth', type: 'threshold', good: 0.25, warning: 0.15, bad: 0.05 }
                ]
            }
        ],
        methodology: {
            dataSources: [
                { platform: 'Salesforce', object: 'Opportunity', recordCount: 2847 },
                { platform: 'Salesforce', object: 'Account', recordCount: 900 },
                { platform: 'HubSpot', object: 'Deals', recordCount: 1523 }
            ],
            formulas: [
                { metric: 'ARR', formula: 'Sum of Opportunity.Amount where Type IN (Renewal, Subscription) × 12' },
                { metric: 'NRR', formula: '(Starting MRR + Expansion - Contraction - Churn) / Starting MRR × 100' },
                { metric: 'CAC', formula: '(Sales Spend + Marketing Spend) / New Customers Acquired' }
            ],
            assumptions: [
                { assumption: 'Opportunities with Type=Renewal treated as recurring revenue', rationale: 'Company billing model' },
                { assumption: 'Currency: USD base (no conversion)', rationale: 'Single currency reporting' }
            ],
            exclusions: [
                { exclusion: 'Test accounts excluded', reason: 'Account.Name contains "Test" or "Demo"' },
                { exclusion: 'Churned customers before Q4 excluded', reason: 'Focus on active customer base' }
            ],
            queries: [
                { platform: 'Salesforce', purpose: 'ARR Calculation', query: 'SELECT SUM(Amount) FROM Opportunity WHERE IsWon=true AND Type IN (\'Renewal\', \'Subscription\')' }
            ],
            benchmarkSources: [
                { name: 'KeyBanc SaaS Benchmarks 2024', url: 'https://keybanccm.com/saas-survey' },
                { name: 'OpenView Expansion SaaS Benchmarks', url: 'https://openviewpartners.com/benchmarks' }
            ]
        }
    });

    const workbook = processor.generate();

    console.log('Generated Workbook Structure:');
    console.log('-----------------------------');
    console.log(`Sheets: ${workbook.sheets.length}`);
    workbook.sheets.forEach((sheet, idx) => {
        console.log(`  ${idx + 1}. ${sheet.name} (${sheet.type}) - ${sheet.rows.length} rows`);
    });
    console.log(`\nCharts: ${workbook.charts.length}`);

    console.log('\n\nCSV Export (Revenue by Segment):');
    console.log('---------------------------------');
    // Find the data sheet index
    const dataSheetIndex = workbook.sheets.findIndex(s => s.name === 'Revenue by Segment');
    if (dataSheetIndex >= 0) {
        console.log(processor.toCSV(dataSheetIndex));
    }

    console.log('\n\nJSON Structure (partial):');
    console.log('-------------------------');
    const json = processor.toJSON();
    console.log(JSON.stringify({
        properties: json.properties,
        sheetCount: json.sheets.length,
        sheetNames: json.sheets.map(s => s.name)
    }, null, 2));
}
