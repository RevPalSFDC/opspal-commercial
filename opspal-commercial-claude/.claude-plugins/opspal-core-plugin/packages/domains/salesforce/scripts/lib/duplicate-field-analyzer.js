#!/usr/bin/env node

/**
 * Duplicate Field Analyzer
 * Identifies duplicate fields across Salesforce objects based on naming patterns
 * and semantic similarity to prevent field proliferation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DuplicateFieldAnalyzer {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
        this.verbose = options.verbose || false;
        this.outputFormat = options.outputFormat || 'table'; // table, json, csv

        // Common duplicate patterns
        this.duplicatePatterns = [
            // Date field variations
            { pattern: /^(.+?)_?Date$/i, group: 'date' },
            { pattern: /^(.+?)Date__c$/i, group: 'date' },
            { pattern: /^Date_?(.+?)$/i, group: 'date' },

            // Status field variations
            { pattern: /^(.+?)_?Status$/i, group: 'status' },
            { pattern: /^Status_?(.+?)$/i, group: 'status' },
            { pattern: /^(.+?)State$/i, group: 'status' },

            // Amount field variations
            { pattern: /^(.+?)_?Amount$/i, group: 'amount' },
            { pattern: /^Total_?(.+?)$/i, group: 'amount' },
            { pattern: /^(.+?)_?Value$/i, group: 'amount' },

            // ID field variations
            { pattern: /^(.+?)_?Id$/i, group: 'identifier' },
            { pattern: /^(.+?)_?ID$/i, group: 'identifier' },
            { pattern: /^(.+?)_?Identifier$/i, group: 'identifier' },

            // Count field variations
            { pattern: /^(.+?)_?Count$/i, group: 'count' },
            { pattern: /^Number_?Of_?(.+?)$/i, group: 'count' },
            { pattern: /^Total_?(.+?)_?Count$/i, group: 'count' }
        ];

        // Semantic similarity keywords
        this.semanticGroups = {
            temporal: ['date', 'time', 'datetime', 'timestamp', 'created', 'modified', 'updated'],
            status: ['status', 'state', 'stage', 'phase', 'condition'],
            quantity: ['amount', 'total', 'sum', 'value', 'price', 'cost'],
            identifier: ['id', 'identifier', 'code', 'number', 'key'],
            boolean: ['is', 'has', 'can', 'should', 'will', 'enabled', 'active']
        };
    }

    /**
     * Main analysis method
     */
    async analyzeObject(objectName) {
        console.log(`\n🔍 Analyzing ${objectName} for duplicate fields...`);
        console.log('='.repeat(60));

        try {
            // Get all fields for the object
            const fields = await this.getObjectFields(objectName);

            if (!fields || fields.length === 0) {
                console.log(`No custom fields found for ${objectName}`);
                return { duplicates: [], suggestions: [] };
            }

            // Analyze for duplicates
            const duplicates = this.findDuplicates(fields);

            // Generate consolidation suggestions
            const suggestions = this.generateSuggestions(duplicates);

            // Generate report
            const report = this.generateReport({
                objectName,
                totalFields: fields.length,
                duplicates,
                suggestions
            });

            // Display or save report
            this.outputReport(report, objectName);

            return {
                duplicates,
                suggestions,
                report
            };

        } catch (error) {
            console.error(`❌ Error analyzing object: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Get all fields for an object
     */
    async getObjectFields(objectName) {
        try {
            const cmd = `sf sobject describe --sobject ${objectName} --json --targetusername ${this.orgAlias}`;
            const result = execSync(cmd, { encoding: 'utf8' });
            const data = JSON.parse(result);

            if (!data.result || !data.result.fields) {
                throw new Error('Failed to retrieve field information');
            }

            // Filter to custom fields only
            const customFields = data.result.fields.filter(field =>
                field.name.endsWith('__c') || field.custom === true
            );

            return customFields.map(field => ({
                name: field.name,
                label: field.label,
                type: field.type,
                length: field.length,
                required: field.nillable === false,
                unique: field.unique,
                externalId: field.externalId,
                formula: field.calculated,
                createdDate: field.createdDate
            }));

        } catch (error) {
            this.log(`Error getting fields: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Find duplicate fields based on patterns and semantics
     */
    findDuplicates(fields) {
        const duplicateGroups = new Map();
        const processedFields = new Set();

        fields.forEach(field => {
            if (processedFields.has(field.name)) return;

            // Check for naming pattern duplicates
            const patternMatches = this.findPatternMatches(field, fields);

            // Check for semantic duplicates
            const semanticMatches = this.findSemanticMatches(field, fields);

            // Check for label similarity
            const labelMatches = this.findLabelMatches(field, fields);

            // Combine all matches
            const allMatches = new Set([
                ...patternMatches,
                ...semanticMatches,
                ...labelMatches
            ].filter(f => f.name !== field.name));

            if (allMatches.size > 0) {
                const groupKey = this.generateGroupKey(field);

                if (!duplicateGroups.has(groupKey)) {
                    duplicateGroups.set(groupKey, {
                        primary: field,
                        duplicates: [],
                        confidence: 0,
                        reason: []
                    });
                }

                const group = duplicateGroups.get(groupKey);
                allMatches.forEach(match => {
                    if (!group.duplicates.find(d => d.name === match.name)) {
                        group.duplicates.push(match);
                        processedFields.add(match.name);
                    }
                });

                // Calculate confidence score
                group.confidence = this.calculateConfidence(group);
                group.reason = this.generateReasons(field, group.duplicates);
            }
        });

        return Array.from(duplicateGroups.values())
            .filter(group => group.confidence > 0.3)
            .sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Find fields matching naming patterns
     */
    findPatternMatches(field, allFields) {
        const matches = [];
        const fieldNameLower = field.name.toLowerCase().replace(/__c$/, '');

        this.duplicatePatterns.forEach(pattern => {
            const match = fieldNameLower.match(pattern.pattern);
            if (match) {
                const basePattern = match[1] || match[0];

                allFields.forEach(otherField => {
                    if (otherField.name === field.name) return;

                    const otherNameLower = otherField.name.toLowerCase().replace(/__c$/, '');
                    const otherMatch = otherNameLower.match(pattern.pattern);

                    if (otherMatch) {
                        const otherBase = otherMatch[1] || otherMatch[0];
                        if (this.similarStrings(basePattern, otherBase)) {
                            matches.push(otherField);
                        }
                    }
                });
            }
        });

        return matches;
    }

    /**
     * Find semantically similar fields
     */
    findSemanticMatches(field, allFields) {
        const matches = [];
        const fieldNameLower = field.name.toLowerCase().replace(/__c$/, '');

        // Find which semantic group this field belongs to
        let fieldGroup = null;
        for (const [group, keywords] of Object.entries(this.semanticGroups)) {
            if (keywords.some(keyword => fieldNameLower.includes(keyword))) {
                fieldGroup = group;
                break;
            }
        }

        if (fieldGroup) {
            const groupKeywords = this.semanticGroups[fieldGroup];

            allFields.forEach(otherField => {
                if (otherField.name === field.name) return;

                const otherNameLower = otherField.name.toLowerCase().replace(/__c$/, '');

                // Check if other field contains any keyword from the same group
                if (groupKeywords.some(keyword => otherNameLower.includes(keyword))) {
                    // Additional type check for better accuracy
                    if (this.compatibleTypes(field.type, otherField.type)) {
                        matches.push(otherField);
                    }
                }
            });
        }

        return matches;
    }

    /**
     * Find fields with similar labels
     */
    findLabelMatches(field, allFields) {
        const matches = [];
        const fieldLabel = field.label.toLowerCase();

        allFields.forEach(otherField => {
            if (otherField.name === field.name) return;

            const otherLabel = otherField.label.toLowerCase();

            // Calculate label similarity
            const similarity = this.calculateLabelSimilarity(fieldLabel, otherLabel);

            if (similarity > 0.7) {
                matches.push(otherField);
            }
        });

        return matches;
    }

    /**
     * Calculate similarity between two strings
     */
    similarStrings(str1, str2) {
        const s1 = str1.toLowerCase().replace(/[_-]/g, '');
        const s2 = str2.toLowerCase().replace(/[_-]/g, '');

        // Exact match
        if (s1 === s2) return true;

        // One contains the other
        if (s1.includes(s2) || s2.includes(s1)) return true;

        // Levenshtein distance for close matches
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);

        return (maxLength - distance) / maxLength > 0.7;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Check if field types are compatible for being duplicates
     */
    compatibleTypes(type1, type2) {
        const typeGroups = {
            text: ['string', 'textarea', 'email', 'phone', 'url'],
            number: ['int', 'double', 'percent', 'currency'],
            date: ['date', 'datetime', 'time'],
            reference: ['reference', 'id'],
            boolean: ['boolean', 'checkbox']
        };

        for (const group of Object.values(typeGroups)) {
            if (group.includes(type1.toLowerCase()) && group.includes(type2.toLowerCase())) {
                return true;
            }
        }

        return type1.toLowerCase() === type2.toLowerCase();
    }

    /**
     * Calculate label similarity using various metrics
     */
    calculateLabelSimilarity(label1, label2) {
        // Remove common words
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];

        const words1 = label1.split(/\s+/).filter(w => !stopWords.includes(w));
        const words2 = label2.split(/\s+/).filter(w => !stopWords.includes(w));

        // Check for common words
        const commonWords = words1.filter(w => words2.includes(w));

        if (commonWords.length === 0) return 0;

        // Calculate Jaccard similarity
        const union = new Set([...words1, ...words2]);
        const intersection = commonWords.length;

        return intersection / union.size;
    }

    /**
     * Generate a unique key for a duplicate group
     */
    generateGroupKey(field) {
        const name = field.name.toLowerCase().replace(/__c$/, '');

        // Extract base name by removing common prefixes/suffixes
        const base = name
            .replace(/^(new|old|temp|tmp|test|backup|copy)_?/i, '')
            .replace(/_?(new|old|temp|tmp|test|backup|copy)$/i, '')
            .replace(/_?(date|time|status|amount|id|count)$/i, '');

        return base || name;
    }

    /**
     * Calculate confidence score for a duplicate group
     */
    calculateConfidence(group) {
        let score = 0;
        const factors = [];

        // Factor 1: Number of duplicates
        if (group.duplicates.length >= 3) {
            score += 0.3;
            factors.push('multiple_duplicates');
        } else if (group.duplicates.length >= 1) {
            score += 0.2;
            factors.push('has_duplicates');
        }

        // Factor 2: Type compatibility
        const allSameType = group.duplicates.every(d =>
            this.compatibleTypes(group.primary.type, d.type)
        );
        if (allSameType) {
            score += 0.3;
            factors.push('compatible_types');
        }

        // Factor 3: Label similarity
        const avgLabelSim = group.duplicates.reduce((sum, d) =>
            sum + this.calculateLabelSimilarity(group.primary.label, d.label), 0
        ) / group.duplicates.length;

        score += avgLabelSim * 0.2;
        if (avgLabelSim > 0.5) factors.push('similar_labels');

        // Factor 4: Name pattern matching
        const hasPatternMatch = group.duplicates.some(d =>
            this.similarStrings(
                group.primary.name.replace(/__c$/, ''),
                d.name.replace(/__c$/, '')
            )
        );
        if (hasPatternMatch) {
            score += 0.2;
            factors.push('pattern_match');
        }

        return Math.min(score, 1.0);
    }

    /**
     * Generate reasons for why fields are considered duplicates
     */
    generateReasons(primary, duplicates) {
        const reasons = [];

        duplicates.forEach(dup => {
            const fieldReasons = [];

            // Check name similarity
            if (this.similarStrings(
                primary.name.replace(/__c$/, ''),
                dup.name.replace(/__c$/, '')
            )) {
                fieldReasons.push('Similar field names');
            }

            // Check label similarity
            const labelSim = this.calculateLabelSimilarity(primary.label, dup.label);
            if (labelSim > 0.7) {
                fieldReasons.push('Similar labels');
            }

            // Check type compatibility
            if (this.compatibleTypes(primary.type, dup.type)) {
                fieldReasons.push('Compatible data types');
            }

            // Check semantic group
            const primaryLower = primary.name.toLowerCase();
            const dupLower = dup.name.toLowerCase();

            for (const [group, keywords] of Object.entries(this.semanticGroups)) {
                const primaryMatch = keywords.some(k => primaryLower.includes(k));
                const dupMatch = keywords.some(k => dupLower.includes(k));

                if (primaryMatch && dupMatch) {
                    fieldReasons.push(`Both contain ${group} keywords`);
                    break;
                }
            }

            if (fieldReasons.length > 0) {
                reasons.push({
                    field: dup.name,
                    reasons: fieldReasons
                });
            }
        });

        return reasons;
    }

    /**
     * Generate consolidation suggestions
     */
    generateSuggestions(duplicateGroups) {
        const suggestions = [];

        duplicateGroups.forEach(group => {
            if (group.confidence < 0.5) return;

            const suggestion = {
                confidence: group.confidence,
                priority: this.calculatePriority(group),
                fields: [group.primary.name, ...group.duplicates.map(d => d.name)],
                recommendation: '',
                actions: []
            };

            // Determine the best field to keep
            const bestField = this.selectBestField(group);

            suggestion.recommendation = `Keep "${bestField.name}" and migrate data from other fields`;

            // Generate migration actions
            suggestion.actions = this.generateMigrationActions(bestField, group);

            suggestions.push(suggestion);
        });

        return suggestions.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Select the best field to keep from a duplicate group
     */
    selectBestField(group) {
        const candidates = [group.primary, ...group.duplicates];

        // Score each field
        const scores = candidates.map(field => {
            let score = 0;

            // Prefer required fields
            if (field.required) score += 3;

            // Prefer older fields (likely more established)
            if (field.createdDate) {
                const age = Date.now() - new Date(field.createdDate).getTime();
                score += Math.log(age / (1000 * 60 * 60 * 24)) / 10; // Log of days
            }

            // Prefer non-formula fields
            if (!field.formula) score += 2;

            // Prefer fields with standard naming
            if (!field.name.includes('_old') && !field.name.includes('_temp')) {
                score += 1;
            }

            // Prefer fields without underscores in unusual places
            const underscoreCount = (field.name.match(/_/g) || []).length;
            score -= underscoreCount * 0.1;

            return { field, score };
        });

        scores.sort((a, b) => b.score - a.score);
        return scores[0].field;
    }

    /**
     * Calculate priority for addressing duplicate groups
     */
    calculatePriority(group) {
        let priority = group.confidence * 50;

        // Higher priority for more duplicates
        priority += group.duplicates.length * 10;

        // Higher priority for commonly used field types
        if (['string', 'reference', 'date'].includes(group.primary.type.toLowerCase())) {
            priority += 10;
        }

        // Higher priority if any field is required
        if (group.primary.required || group.duplicates.some(d => d.required)) {
            priority += 20;
        }

        return Math.min(priority, 100);
    }

    /**
     * Generate migration actions for consolidating fields
     */
    generateMigrationActions(bestField, group) {
        const actions = [];
        const fieldsToRemove = [group.primary, ...group.duplicates]
            .filter(f => f.name !== bestField.name);

        fieldsToRemove.forEach(field => {
            actions.push({
                type: 'migrate_data',
                description: `Migrate data from ${field.name} to ${bestField.name}`,
                query: `UPDATE [Object] SET ${bestField.name} = ${field.name} WHERE ${field.name} != null AND ${bestField.name} = null`
            });

            actions.push({
                type: 'update_references',
                description: `Update all references from ${field.name} to ${bestField.name}`,
                locations: ['Apex Classes', 'Triggers', 'Flows', 'Process Builders', 'Validation Rules']
            });

            actions.push({
                type: 'remove_field',
                description: `Delete field ${field.name}`,
                warning: 'Ensure all data is migrated and references updated first'
            });
        });

        return actions;
    }

    /**
     * Generate report
     */
    generateReport(data) {
        const { objectName, totalFields, duplicates, suggestions } = data;

        let report = `\n📊 Duplicate Field Analysis Report\n`;
        report += `${'='.repeat(60)}\n`;
        report += `Object: ${objectName}\n`;
        report += `Total Custom Fields: ${totalFields}\n`;
        report += `Duplicate Groups Found: ${duplicates.length}\n`;
        report += `Timestamp: ${new Date().toISOString()}\n\n`;

        if (duplicates.length > 0) {
            report += `🔍 Duplicate Groups:\n`;
            report += `${'='.repeat(60)}\n`;

            duplicates.forEach((group, index) => {
                report += `\nGroup ${index + 1} (Confidence: ${(group.confidence * 100).toFixed(0)}%):\n`;
                report += `  Primary: ${group.primary.name} (${group.primary.label})\n`;
                report += `  Type: ${group.primary.type}\n`;
                report += `  Duplicates:\n`;

                group.duplicates.forEach(dup => {
                    report += `    - ${dup.name} (${dup.label}) [${dup.type}]\n`;
                });

                report += `  Reasons:\n`;
                group.reason.forEach(r => {
                    report += `    - ${r.field}: ${r.reasons.join(', ')}\n`;
                });
            });
        }

        if (suggestions.length > 0) {
            report += `\n💡 Consolidation Suggestions:\n`;
            report += `${'='.repeat(60)}\n`;

            suggestions.forEach((suggestion, index) => {
                report += `\nSuggestion ${index + 1} (Priority: ${suggestion.priority.toFixed(0)}):\n`;
                report += `  Fields: ${suggestion.fields.join(', ')}\n`;
                report += `  Recommendation: ${suggestion.recommendation}\n`;
                report += `  Actions:\n`;

                suggestion.actions.forEach(action => {
                    report += `    - ${action.description}\n`;
                    if (action.warning) {
                        report += `      ⚠️ ${action.warning}\n`;
                    }
                });
            });
        }

        if (duplicates.length === 0) {
            report += `\n✅ No duplicate fields detected!\n`;
        }

        report += `\n${'='.repeat(60)}\n`;

        return report;
    }

    /**
     * Output report based on format
     */
    outputReport(report, objectName) {
        console.log(report);

        // Save to file
        const reportsDir = path.join(process.cwd(), 'field-analysis-reports');
        fs.mkdirSync(reportsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `duplicate-analysis-${objectName}-${timestamp}.txt`;
        const filePath = path.join(reportsDir, fileName);

        fs.writeFileSync(filePath, report);
        this.log(`Report saved to: ${filePath}`);

        // Also save JSON version for programmatic use
        const jsonFile = filePath.replace('.txt', '.json');
        fs.writeFileSync(jsonFile, JSON.stringify({
            objectName,
            timestamp: new Date().toISOString(),
            duplicates: this.duplicates,
            suggestions: this.suggestions
        }, null, 2));
    }

    /**
     * Analyze multiple objects
     */
    async analyzeMultipleObjects(objectNames) {
        const results = {};

        for (const objectName of objectNames) {
            results[objectName] = await this.analyzeObject(objectName);
        }

        // Generate summary report
        this.generateSummaryReport(results);

        return results;
    }

    /**
     * Generate summary report for multiple objects
     */
    generateSummaryReport(results) {
        let summary = `\n📈 Multi-Object Duplicate Analysis Summary\n`;
        summary += `${'='.repeat(60)}\n`;
        summary += `Objects Analyzed: ${Object.keys(results).length}\n`;
        summary += `Timestamp: ${new Date().toISOString()}\n\n`;

        let totalDuplicates = 0;
        let totalSuggestions = 0;

        Object.entries(results).forEach(([objectName, result]) => {
            if (result.duplicates) {
                totalDuplicates += result.duplicates.length;
                totalSuggestions += result.suggestions.length;

                summary += `\n${objectName}:\n`;
                summary += `  Duplicate Groups: ${result.duplicates.length}\n`;
                summary += `  Suggestions: ${result.suggestions.length}\n`;
            }
        });

        summary += `\nTotal Duplicate Groups: ${totalDuplicates}\n`;
        summary += `Total Suggestions: ${totalSuggestions}\n`;
        summary += `${'='.repeat(60)}\n`;

        console.log(summary);
    }

    /**
     * Logging helper
     */
    log(message, level = 'info') {
        if (this.verbose || level === 'error') {
            const prefix = level === 'error' ? '❌' : '📌';
            console.log(`${prefix} ${message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Usage: node duplicate-field-analyzer.js <ObjectName> [options]

Options:
  --org <alias>        Salesforce org alias
  --all                Analyze all custom objects
  --format <format>    Output format (table, json, csv)
  --verbose            Show detailed output

Examples:
  node duplicate-field-analyzer.js Account --org myorg
  node duplicate-field-analyzer.js "Account,Contact,Lead" --org myorg
  node duplicate-field-analyzer.js --all --org myorg
        `);
        process.exit(1);
    }

    const options = {
        orgAlias: args.find(a => a.startsWith('--org'))?.split('=')[1],
        verbose: args.includes('--verbose'),
        outputFormat: args.find(a => a.startsWith('--format'))?.split('=')[1] || 'table'
    };

    const analyzer = new DuplicateFieldAnalyzer(options);

    if (args.includes('--all')) {
        // Get all custom objects
        const cmd = `sf sobject list --sobject custom --json --targetusername ${options.orgAlias}`;
        const result = execSync(cmd, { encoding: 'utf8' });
        const objects = JSON.parse(result).result;

        analyzer.analyzeMultipleObjects(objects)
            .then(() => process.exit(0))
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    } else {
        const objectNames = args[0].split(',');

        if (objectNames.length > 1) {
            analyzer.analyzeMultipleObjects(objectNames)
                .then(() => process.exit(0))
                .catch(error => {
                    console.error(error);
                    process.exit(1);
                });
        } else {
            analyzer.analyzeObject(objectNames[0])
                .then(() => process.exit(0))
                .catch(error => {
                    console.error(error);
                    process.exit(1);
                });
        }
    }
}

module.exports = DuplicateFieldAnalyzer;