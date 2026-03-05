#!/usr/bin/env node

/**
 * Field Usage Aggregator for Reports
 *
 * Aggregates field usage across all reports to identify:
 * - Most commonly used fields
 * - Unused fields (especially critical ones)
 * - Object coverage (which objects are most/least reported on)
 *
 * Usage:
 *   node field-usage-aggregator.js --input <usage-metrics.json> --output <field-usage.json>
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs').promises;

class FieldUsageAggregator {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
        this.usageMetrics = null;
        this.fieldUsage = {};
        this.objectCoverage = {};
        this.schemaFields = [];
        this.unusedFields = [];
        this.unusedDetectionMode = 'usage-threshold';
    }

    /**
     * Load usage metrics JSON
     */
    async loadUsageMetrics() {
        console.log(`\n📖 Loading usage metrics from ${this.inputPath}...`);
        const data = await fs.readFile(this.inputPath, 'utf8');
        this.usageMetrics = JSON.parse(data);
        console.log(`✓ Loaded metadata for ${Object.keys(this.usageMetrics.reportFieldMetadata).length} reports`);
    }

    /**
     * Parse object from field name (e.g., "Account.Name" → "Account")
     */
    parseObjectFromField(fieldName) {
        if (!fieldName || typeof fieldName !== 'string') return 'Unknown';

        const parts = fieldName.split('.');
        return parts.length > 1 ? parts[0] : 'Unknown';
    }

    /**
     * Aggregate field usage across all reports
     */
    aggregateFieldUsage() {
        console.log('\n📊 Aggregating field usage across all reports...');

        for (const [reportId, metadata] of Object.entries(this.usageMetrics.reportFieldMetadata)) {
            // Skip reports with errors
            if (metadata.error) continue;

            const report = this.usageMetrics.reports.find(r => r.id === reportId);
            if (!report) continue;

            // Aggregate detail columns
            if (metadata.detailColumns && Array.isArray(metadata.detailColumns)) {
                metadata.detailColumns.forEach(field => {
                    if (!this.fieldUsage[field]) {
                        this.fieldUsage[field] = {
                            field: field,
                            object: this.parseObjectFromField(field),
                            usageCount: 0,
                            reports: []
                        };
                    }

                    this.fieldUsage[field].usageCount++;
                    this.fieldUsage[field].reports.push({
                        id: reportId,
                        name: report.name,
                        isActive: report.isActive
                    });
                });
            }

            // Aggregate aggregates (like SUM, AVG, etc.)
            if (metadata.aggregates && Array.isArray(metadata.aggregates)) {
                metadata.aggregates.forEach(field => {
                    if (!this.fieldUsage[field]) {
                        this.fieldUsage[field] = {
                            field: field,
                            object: this.parseObjectFromField(field),
                            usageCount: 0,
                            reports: []
                        };
                    }

                    this.fieldUsage[field].usageCount++;
                    this.fieldUsage[field].reports.push({
                        id: reportId,
                        name: report.name,
                        isActive: report.isActive
                    });
                });
            }

            // Track object coverage
            const reportType = metadata.reportType || 'Unknown';
            if (!this.objectCoverage[reportType]) {
                this.objectCoverage[reportType] = {
                    reportType: reportType,
                    reportCount: 0,
                    activeReportCount: 0
                };
            }

            this.objectCoverage[reportType].reportCount++;
            if (report.isActive) {
                this.objectCoverage[reportType].activeReportCount++;
            }
        }

        console.log(`✓ Aggregated ${Object.keys(this.fieldUsage).length} unique fields`);
        console.log(`✓ Tracked ${Object.keys(this.objectCoverage).length} report types`);
    }

    /**
     * Identify unused fields using available schema inventory when present.
     * Falls back to rarely-used detection when schema data is not available.
     */
    identifyUnusedFields() {
        console.log('\n🔍 Identifying unused/rarely-used fields...');

        this.schemaFields = this.collectSchemaFields();

        if (this.schemaFields.length > 0) {
            this.unusedDetectionMode = 'schema-diff';
            const usedFieldNames = new Set(Object.keys(this.fieldUsage).map(field => this.normalizeFieldToken(field)));

            this.unusedFields = this.schemaFields
                .filter((fieldName) => !usedFieldNames.has(this.normalizeFieldToken(fieldName)))
                .map((fieldName) => ({
                    field: fieldName,
                    object: this.parseObjectFromField(fieldName),
                    usageCount: 0,
                    reports: []
                }))
                .sort((a, b) => a.field.localeCompare(b.field));

            console.log(
                `✓ Found ${this.unusedFields.length} unused fields ` +
                `(schema: ${this.schemaFields.length}, used: ${usedFieldNames.size})`
            );
            return;
        }

        this.unusedDetectionMode = 'usage-threshold';
        const rarelyUsed = Object.values(this.fieldUsage)
            .filter(field => field.usageCount <= 1)
            .sort((a, b) => a.usageCount - b.usageCount);

        this.unusedFields = rarelyUsed.map(field => ({
            field: field.field,
            object: field.object,
            usageCount: field.usageCount,
            reports: field.reports.map(r => r.name)
        }));

        console.log(`✓ Found ${this.unusedFields.length} rarely used fields (≤1 usage)`);
    }

    /**
     * Collect schema field catalog from usage metrics payload.
     * Supports multiple producer formats.
     */
    collectSchemaFields() {
        const candidates = new Set();
        const addField = (value) => {
            const normalized = this.normalizeFieldToken(value);
            if (!normalized) return;
            // Ignore Salesforce pseudo-fields and non-token metadata strings
            if (!normalized.includes('.')) return;
            candidates.add(normalized);
        };

        const traverse = (node) => {
            if (!node) return;

            if (Array.isArray(node)) {
                node.forEach(traverse);
                return;
            }

            if (typeof node === 'string') {
                addField(node);
                return;
            }

            if (typeof node !== 'object') {
                return;
            }

            if (typeof node.field === 'string') addField(node.field);
            if (typeof node.apiName === 'string' && typeof node.object === 'string') {
                addField(`${node.object}.${node.apiName}`);
            }
            if (typeof node.fullName === 'string') addField(node.fullName);

            for (const value of Object.values(node)) {
                traverse(value);
            }
        };

        // Common schema locations produced by report auditing scripts.
        traverse(this.usageMetrics?.schemaFields);
        traverse(this.usageMetrics?.allFields);
        traverse(this.usageMetrics?.fieldCatalog);
        traverse(this.usageMetrics?.orgSchema?.fields);
        traverse(this.usageMetrics?.metadata?.availableFields);
        traverse(this.usageMetrics?.reportTypeFields);

        return [...candidates].sort((a, b) => a.localeCompare(b));
    }

    /**
     * Normalize field token for comparisons.
     */
    normalizeFieldToken(fieldName) {
        if (!fieldName || typeof fieldName !== 'string') return '';
        return fieldName
            .replace(/\s+/g, '')
            .replace(/__r\./g, '__r.')
            .trim();
    }

    /**
     * Generate field usage analysis
     */
    async generateFieldUsageJSON() {
        console.log(`\n💾 Saving field usage analysis to ${this.outputPath}...`);

        // Sort field usage by count (descending)
        const sortedFieldUsage = Object.values(this.fieldUsage)
            .sort((a, b) => b.usageCount - a.usageCount);

        // Top 20 most used fields
        const topFields = sortedFieldUsage.slice(0, 20).map(field => ({
            field: field.field,
            object: field.object,
            usageCount: field.usageCount,
            activeReports: field.reports.filter(r => r.isActive).length,
            totalReports: field.reports.length
        }));

        // Object coverage summary
        const objectCoverageSorted = Object.values(this.objectCoverage)
            .sort((a, b) => b.reportCount - a.reportCount);

        const output = {
            metadata: {
                inputFile: this.inputPath,
                generatedDate: new Date().toISOString(),
                generatedBy: 'field-usage-aggregator.js v1.0.0',
                orgAlias: this.usageMetrics.metadata.orgAlias,
                unusedDetectionMode: this.unusedDetectionMode
            },
            summary: {
                totalFields: Object.keys(this.fieldUsage).length,
                topFields: topFields,
                rarelyUsedFields: this.unusedFields.length,
                reportTypesCovered: Object.keys(this.objectCoverage).length,
                schemaFieldsDetected: this.schemaFields.length
            },
            fieldUsage: sortedFieldUsage,
            objectCoverage: objectCoverageSorted,
            schemaFields: this.schemaFields,
            rarelyUsedFields: this.unusedFields
        };

        await fs.writeFile(this.outputPath, JSON.stringify(output, null, 2));
        console.log(`✓ Saved field usage analysis`);

        // Print summary
        console.log(`\n📊 Field Usage Summary:`);
        console.log(`  Total unique fields: ${Object.keys(this.fieldUsage).length}`);
        console.log(`  Top 5 most used fields:`);
        topFields.slice(0, 5).forEach((field, i) => {
            console.log(`    ${i + 1}. ${field.field} (${field.usageCount} reports)`);
        });
        console.log(`  Rarely used fields: ${this.unusedFields.length}`);
    }

    /**
     * Execute full aggregation workflow
     */
    async execute() {
        console.log(`\n📊 Field Usage Aggregator for Reports`);

        try {
            await this.loadUsageMetrics();
            this.aggregateFieldUsage();
            this.identifyUnusedFields();
            await this.generateFieldUsageJSON();

            console.log(`\n✅ Field usage aggregation complete!`);
            return this.outputPath;
        } catch (error) {
            console.error(`\n❌ Aggregation failed: ${error.message}`);
            throw error;
        }
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            options.input = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            options.output = args[i + 1];
            i++;
        }
    }

    if (!options.input || !options.output) {
        console.error('Usage: node field-usage-aggregator.js --input <usage-metrics.json> --output <field-usage.json>');
        process.exit(1);
    }

    (async () => {
        try {
            const aggregator = new FieldUsageAggregator(options.input, options.output);
            await aggregator.execute();
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = FieldUsageAggregator;
