#!/usr/bin/env node

/**
 * Taxonomy Classifier
 *
 * Enhanced reflection classification using taxonomy rules:
 * - Keyword-based classification
 * - Pattern matching with regex
 * - Severity indicators
 * - Auto-tagging
 * - Prevention strategy suggestions
 *
 * Works alongside existing cohort-detector.js to reduce "unknown" classifications.
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: unknown cohort (13 reflections needing classification)
 */

const fs = require('fs');
const path = require('path');

class TaxonomyClassifier {
    constructor(options = {}) {
        this.verbose = options.verbose || false;

        // Load taxonomy rules
        const rulesPath = options.rulesPath || path.join(
            __dirname, '..', '..', 'config', 'reflection-taxonomy-rules.json'
        );

        this.rules = this._loadRules(rulesPath);
        this.categories = this.rules?.categories || {};
        this.classification = this.rules?.classification || {};
        this.autoTagging = this.rules?.autoTagging || {};
        this.severityIndicators = this.rules?.severityIndicators || {};
    }

    /**
     * Classify a reflection into taxonomy categories
     * @param {Object} reflection - Reflection data
     * @returns {Object} Classification result
     */
    classify(reflection) {
        const result = {
            categories: [],
            confidence: 0,
            severity: 'medium',
            tags: [],
            preventionStrategies: [],
            reasoning: []
        };

        // Extract text content from reflection
        const text = this._extractText(reflection);

        if (!text) {
            result.categories = [{ name: 'unknown', confidence: 0, reason: 'No text content' }];
            return result;
        }

        const textLower = text.toLowerCase();

        // Score each category
        const scores = [];

        for (const [categoryName, categoryConfig] of Object.entries(this.categories)) {
            const score = this._scoreCategory(textLower, categoryConfig);

            if (score.total > 0) {
                scores.push({
                    name: categoryName,
                    score: score.total,
                    confidence: score.confidence,
                    keywordMatches: score.keywordMatches,
                    patternMatches: score.patternMatches,
                    description: categoryConfig.description
                });
            }
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        // Take top categories (up to maxCategories)
        const maxCategories = this.classification?.maxCategories || 2;
        const topCategories = scores.slice(0, maxCategories);

        if (topCategories.length > 0) {
            result.categories = topCategories.map(s => ({
                name: s.name,
                confidence: s.confidence,
                reason: `Matched ${s.keywordMatches} keywords, ${s.patternMatches} patterns`,
                description: s.description
            }));

            result.confidence = topCategories[0].confidence;

            // Add prevention strategies from top category
            const topCategory = this.categories[topCategories[0].name];
            if (topCategory?.preventionStrategies) {
                result.preventionStrategies = topCategory.preventionStrategies;
            }

            result.reasoning.push(`Top match: ${topCategories[0].name} (${topCategories[0].score.toFixed(2)} score)`);
        } else {
            result.categories = [{ name: 'unknown', confidence: 0.1, reason: 'No category match' }];
        }

        // Determine severity
        result.severity = this._determineSeverity(textLower);

        // Auto-tag
        result.tags = this._autoTag(textLower);

        return result;
    }

    /**
     * Batch classify multiple reflections
     * @param {Array} reflections - Array of reflections
     * @returns {Object} Batch classification results
     */
    classifyBatch(reflections) {
        const results = {
            classified: [],
            summary: {
                total: reflections.length,
                byCategory: {},
                bySeverity: {},
                unknownCount: 0
            }
        };

        for (const reflection of reflections) {
            const classification = this.classify(reflection);

            results.classified.push({
                id: reflection.id,
                ...classification
            });

            // Update summary
            const topCategory = classification.categories[0]?.name || 'unknown';
            results.summary.byCategory[topCategory] = (results.summary.byCategory[topCategory] || 0) + 1;
            results.summary.bySeverity[classification.severity] = (results.summary.bySeverity[classification.severity] || 0) + 1;

            if (topCategory === 'unknown') {
                results.summary.unknownCount++;
            }
        }

        results.summary.unknownRate = results.summary.unknownCount / results.summary.total;

        return results;
    }

    /**
     * Suggest category for unclassified text
     * @param {string} text - Text to analyze
     * @returns {Object} Category suggestion
     */
    suggestCategory(text) {
        const textLower = text.toLowerCase();
        const suggestions = [];

        for (const [categoryName, categoryConfig] of Object.entries(this.categories)) {
            const score = this._scoreCategory(textLower, categoryConfig);

            if (score.total > 0) {
                suggestions.push({
                    category: categoryName,
                    score: score.total,
                    confidence: score.confidence,
                    matchedKeywords: score.matchedKeywords,
                    matchedPatterns: score.matchedPatterns
                });
            }
        }

        suggestions.sort((a, b) => b.score - a.score);

        return {
            topSuggestion: suggestions[0] || null,
            allSuggestions: suggestions.slice(0, 3),
            text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        };
    }

    /**
     * Get prevention strategies for a category
     * @param {string} categoryName - Category name
     * @returns {Array} Prevention strategies
     */
    getPreventionStrategies(categoryName) {
        const category = this.categories[categoryName];
        return category?.preventionStrategies || [];
    }

    /**
     * Get all category names
     * @returns {Array} Category names
     */
    getCategoryNames() {
        return Object.keys(this.categories);
    }

    /**
     * Get category info
     * @param {string} categoryName - Category name
     * @returns {Object} Category info
     */
    getCategoryInfo(categoryName) {
        const category = this.categories[categoryName];
        if (!category) return null;

        return {
            name: categoryName,
            description: category.description,
            severity: category.severity,
            keywordCount: category.keywords?.length || 0,
            patternCount: category.patterns?.length || 0,
            preventionStrategies: category.preventionStrategies || []
        };
    }

    // === Private Methods ===

    _loadRules(rulesPath) {
        try {
            if (fs.existsSync(rulesPath)) {
                return JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`Failed to load taxonomy rules: ${error.message}`);
            }
        }

        // Return default rules if file not found
        return this._getDefaultRules();
    }

    _getDefaultRules() {
        return {
            categories: {
                'schema/parse': {
                    description: 'Schema and parsing issues',
                    severity: 'high',
                    keywords: ['field type', 'schema', 'parse', 'deploy', 'metadata'],
                    patterns: ['deployment.*failed', 'cannot.*convert'],
                    preventionStrategies: ['Validate schemas before deployment']
                },
                'config/env': {
                    description: 'Configuration and environment issues',
                    severity: 'high',
                    keywords: ['environment', 'config', 'variable', 'path'],
                    patterns: ['not.*found', 'undefined'],
                    preventionStrategies: ['Validate environment at startup']
                },
                'data-quality': {
                    description: 'Data quality issues',
                    severity: 'medium',
                    keywords: ['null', 'empty', 'invalid', 'orphan'],
                    patterns: ['unexpected.*null', 'zero.*records'],
                    preventionStrategies: ['Use data quality gates']
                }
            },
            severityIndicators: {
                critical: ['data loss', 'production', 'security'],
                high: ['failed', 'error', 'blocked'],
                medium: ['warning', 'deprecated'],
                low: ['suggestion', 'minor']
            },
            autoTagging: {
                enabled: true,
                rules: [
                    { pattern: 'SOQL|query', tags: ['salesforce'] },
                    { pattern: 'HubSpot', tags: ['hubspot'] }
                ]
            }
        };
    }

    _extractText(reflection) {
        const parts = [];

        // Common text fields in reflections
        if (reflection.title) parts.push(reflection.title);
        if (reflection.description) parts.push(reflection.description);
        if (reflection.summary) parts.push(reflection.summary);
        if (reflection.content) parts.push(reflection.content);
        if (reflection.error_message) parts.push(reflection.error_message);

        // Data object fields
        if (reflection.data) {
            if (reflection.data.error) parts.push(reflection.data.error);
            if (reflection.data.message) parts.push(reflection.data.message);
            if (reflection.data.summary) parts.push(reflection.data.summary);

            // Issues array
            if (Array.isArray(reflection.data.issues_identified)) {
                for (const issue of reflection.data.issues_identified) {
                    if (issue.description) parts.push(issue.description);
                    if (issue.root_cause) parts.push(issue.root_cause);
                }
            }
        }

        return parts.join(' ');
    }

    _scoreCategory(textLower, categoryConfig) {
        const result = {
            total: 0,
            confidence: 0,
            keywordMatches: 0,
            patternMatches: 0,
            matchedKeywords: [],
            matchedPatterns: []
        };

        // Score keywords (1 point each)
        if (categoryConfig.keywords) {
            for (const keyword of categoryConfig.keywords) {
                if (textLower.includes(keyword.toLowerCase())) {
                    result.keywordMatches++;
                    result.matchedKeywords.push(keyword);
                }
            }
        }

        // Score patterns (2 points each for regex match)
        if (categoryConfig.patterns) {
            for (const pattern of categoryConfig.patterns) {
                try {
                    const regex = new RegExp(pattern, 'i');
                    if (regex.test(textLower)) {
                        result.patternMatches++;
                        result.matchedPatterns.push(pattern);
                    }
                } catch (e) {
                    // Invalid regex, skip
                }
            }
        }

        // Calculate total score
        result.total = result.keywordMatches + (result.patternMatches * 2);

        // Calculate confidence
        const maxPossible = (categoryConfig.keywords?.length || 0) + ((categoryConfig.patterns?.length || 0) * 2);
        result.confidence = maxPossible > 0 ? Math.min(1.0, result.total / (maxPossible * 0.3)) : 0;

        return result;
    }

    _determineSeverity(textLower) {
        for (const [severity, indicators] of Object.entries(this.severityIndicators)) {
            for (const indicator of indicators || []) {
                if (textLower.includes(indicator.toLowerCase())) {
                    return severity;
                }
            }
        }
        return 'medium';
    }

    _autoTag(textLower) {
        const tags = new Set();

        if (this.autoTagging?.enabled && this.autoTagging?.rules) {
            for (const rule of this.autoTagging.rules) {
                try {
                    const regex = new RegExp(rule.pattern, 'i');
                    if (regex.test(textLower)) {
                        for (const tag of rule.tags || []) {
                            tags.add(tag);
                        }
                    }
                } catch (e) {
                    // Invalid regex, skip
                }
            }
        }

        return Array.from(tags);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const classifier = new TaxonomyClassifier({ verbose: true });

    switch (command) {
        case 'classify':
            const text = args.slice(1).join(' ');
            if (!text) {
                console.error('Usage: taxonomy-classifier classify "error text to classify"');
                process.exit(1);
            }
            const suggestion = classifier.suggestCategory(text);
            console.log(JSON.stringify(suggestion, null, 2));
            break;

        case 'categories':
            const categories = classifier.getCategoryNames();
            console.log('\nAvailable Categories:\n');
            for (const name of categories) {
                const info = classifier.getCategoryInfo(name);
                console.log(`  ${name}`);
                console.log(`    ${info.description}`);
                console.log(`    Severity: ${info.severity}`);
                console.log(`    Keywords: ${info.keywordCount}, Patterns: ${info.patternCount}`);
                console.log('');
            }
            break;

        case 'prevention':
            const categoryName = args[1];
            if (!categoryName) {
                console.error('Usage: taxonomy-classifier prevention <category>');
                process.exit(1);
            }
            const strategies = classifier.getPreventionStrategies(categoryName);
            if (strategies.length > 0) {
                console.log(`\nPrevention strategies for ${categoryName}:\n`);
                for (const strategy of strategies) {
                    console.log(`  - ${strategy}`);
                }
            } else {
                console.log(`No prevention strategies defined for ${categoryName}`);
            }
            break;

        case 'batch':
            const filePath = args[1];
            if (!filePath) {
                console.error('Usage: taxonomy-classifier batch <reflections.json>');
                process.exit(1);
            }
            try {
                const reflections = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                const results = classifier.classifyBatch(Array.isArray(reflections) ? reflections : [reflections]);
                console.log(JSON.stringify(results, null, 2));
            } catch (e) {
                console.error(`Error: ${e.message}`);
                process.exit(1);
            }
            break;

        default:
            console.log(`
Taxonomy Classifier - Enhanced reflection classification

Usage:
  taxonomy-classifier classify "error text"     Classify text into category
  taxonomy-classifier categories                List all categories
  taxonomy-classifier prevention <category>     Get prevention strategies
  taxonomy-classifier batch <reflections.json>  Batch classify reflections

Examples:
  taxonomy-classifier classify "deployment failed due to field type mismatch"
  taxonomy-classifier prevention schema/parse
  taxonomy-classifier batch ./reflections.json

Categories:
  - schema/parse: Field types, deployments, metadata
  - config/env: Environment variables, paths
  - tool-contract: Input/output validation
  - data-quality: NULL handling, validation
  - external-api: Rate limits, timeouts
  - auth/permissions: Access control
  - api-deprecation: Outdated APIs
  - timing/race: Concurrency issues
  - resource-limit: Governor limits
  - integration-sync: Cross-system sync
  - user-input: Input validation
            `);
    }
}

module.exports = { TaxonomyClassifier };
