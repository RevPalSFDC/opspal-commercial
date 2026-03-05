#!/usr/bin/env node

/**
 * Layout Rule Engine for Salesforce
 *
 * Intelligent field importance scoring system that determines which fields
 * should be prioritized on layouts based on:
 * - Field metadata (type, required, unique)
 * - Usage patterns (fill rate, update frequency)
 * - Business logic (validation rules, formulas)
 * - Persona requirements (from templates)
 *
 * Scoring Scale: 0-100
 *   90-100: Critical (must be on layout, first section)
 *   75-89:  Important (should be on layout, early sections)
 *   50-74:  Contextual (include if space permits, later sections)
 *   25-49:  Low Priority (consider omitting or conditional display)
 *   0-24:   Minimal (omit from default layout)
 *
 * Usage:
 *   const engine = new LayoutRuleEngine(orgAlias);
 *   await engine.init();
 *   const scores = await engine.scoreFields('Opportunity', 'sales-rep');
 *
 * @version 1.0.0
 * @created 2025-10-18
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { ensureSfAuth } = require('./sf-auth-sync');

class LayoutRuleEngine {
    /**
     * Initialize Layout Rule Engine
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.templatesDir = options.templatesDir || path.join(__dirname, '..', '..', 'templates', 'layouts');
        this.cache = new Map();
    }

    /**
     * Initialize rule engine
     */
    async init() {
        await ensureSfAuth({ orgAlias: this.orgAlias, verbose: this.verbose, requireAuth: true });

        if (this.verbose) {
            console.log(`✓ Layout Rule Engine initialized for org: ${this.orgAlias}`);
        }
    }

    /**
     * Score all fields for an object based on persona
     * @param {string} objectName - Salesforce object API name
     * @param {string} personaName - Persona template name
     * @param {Object} options - Scoring options
     * @returns {Promise<Array>} Sorted array of field scores
     */
    async scoreFields(objectName, personaName, options = {}) {
        if (this.verbose) {
            console.log(`\n🧮 Scoring fields for ${objectName} (persona: ${personaName})...\n`);
        }

        // Load persona template
        const persona = await this.loadPersonaTemplate(personaName);

        // Get field metadata from org
        const fieldMetadata = await this.getFieldMetadata(objectName);

        // Get usage statistics (optional, may not be available)
        const usageStats = options.includeUsage ? await this.getFieldUsageStats(objectName) : null;

        // Score each field
        const fieldScores = [];

        for (const field of fieldMetadata) {
            const score = this.calculateFieldScore(field, persona, objectName, usageStats);
            fieldScores.push({
                fieldName: field.name,
                label: field.label,
                type: field.type,
                score: score.total,
                breakdown: score.breakdown,
                priority: this.getPriorityLevel(score.total),
                recommendation: this.getFieldRecommendation(score.total, field)
            });
        }

        // Sort by score (highest first)
        fieldScores.sort((a, b) => b.score - a.score);

        if (this.verbose) {
            console.log(`✓ Scored ${fieldScores.length} fields`);
            console.log(`   Critical (90-100): ${fieldScores.filter(f => f.score >= 90).length}`);
            console.log(`   Important (75-89): ${fieldScores.filter(f => f.score >= 75 && f.score < 90).length}`);
            console.log(`   Contextual (50-74): ${fieldScores.filter(f => f.score >= 50 && f.score < 75).length}`);
            console.log(`   Low Priority (25-49): ${fieldScores.filter(f => f.score >= 25 && f.score < 50).length}`);
            console.log(`   Minimal (0-24): ${fieldScores.filter(f => f.score < 25).length}\n`);
        }

        return fieldScores;
    }

    /**
     * Calculate importance score for a single field
     * @private
     */
    calculateFieldScore(field, persona, objectName, usageStats) {
        const breakdown = {};
        let total = 0;

        // 1. Persona Priority (40 points max)
        const personaScore = this.scorePersonaPriority(field, persona, objectName);
        breakdown.personaPriority = personaScore;
        total += personaScore;

        // 2. Field Metadata (30 points max)
        const metadataScore = this.scoreFieldMetadata(field);
        breakdown.fieldMetadata = metadataScore;
        total += metadataScore;

        // 3. Usage Patterns (20 points max) - if available
        if (usageStats && usageStats[field.name]) {
            const usageScore = this.scoreUsagePattern(usageStats[field.name]);
            breakdown.usagePattern = usageScore;
            total += usageScore;
        } else {
            breakdown.usagePattern = 0;
        }

        // 4. Business Logic (10 points max)
        const businessScore = this.scoreBusinessLogic(field);
        breakdown.businessLogic = businessScore;
        total += businessScore;

        return {
            total: Math.round(total),
            breakdown: breakdown
        };
    }

    /**
     * Score based on persona template priorities
     * @private
     */
    scorePersonaPriority(field, persona, objectName) {
        const objectKey = objectName.toLowerCase();
        const fieldPriorities = persona.fieldPriorities && persona.fieldPriorities[objectKey];

        if (!fieldPriorities) {
            return 15; // Default moderate score if object not in template
        }

        // Check each priority level
        if (fieldPriorities.criticalFields && fieldPriorities.criticalFields.includes(field.name)) {
            return 65; // Boosted to ensure 90+ threshold (65 + 29 metadata = 94)
        }

        if (fieldPriorities.importantFields && fieldPriorities.importantFields.includes(field.name)) {
            return 55; // Boosted to ensure 75+ threshold (55 + 25 metadata = 80)
        }

        if (fieldPriorities.contextualFields && fieldPriorities.contextualFields.includes(field.name)) {
            return 20;
        }

        if (fieldPriorities.lowPriorityFields && fieldPriorities.lowPriorityFields.includes(field.name)) {
            return 5;
        }

        // Not explicitly mentioned in template
        return 15;
    }

    /**
     * Score based on field metadata characteristics
     * @private
     */
    scoreFieldMetadata(field) {
        let score = 0;

        // Required fields are important (15 points)
        if (field.required || field.nillable === false) {
            score += 15;
        }

        // Unique fields are often key identifiers (10 points)
        if (field.unique) {
            score += 10;
        }

        // Name/Label fields are critical (10 points)
        if (field.nameField || field.name === 'Name' || field.name.includes('Name')) {
            score += 10;
        }

        // Auto-number fields are often important IDs (8 points)
        if (field.autoNumber) {
            score += 8;
        }

        // Certain field types are more important
        const typeScore = this.getFieldTypeScore(field.type);
        score += typeScore;

        // Updateable fields more important than read-only (5 points)
        if (field.updateable && field.createable) {
            score += 5;
        }

        return Math.min(score, 30); // Cap at 30 points
    }

    /**
     * Get score adjustment based on field type
     * @private
     */
    getFieldTypeScore(fieldType) {
        const typeScores = {
            // High importance types
            'reference': 8,      // Lookup/Master-Detail relationships
            'picklist': 7,       // Status, Type, etc.
            'currency': 7,       // Amount fields
            'date': 6,           // Important dates
            'datetime': 6,
            'email': 6,
            'phone': 6,
            'url': 5,

            // Medium importance types
            'boolean': 5,        // Checkboxes
            'percent': 5,
            'double': 4,
            'int': 4,
            'string': 4,
            'textarea': 4,

            // Lower importance types
            'encryptedstring': 3,
            'multipicklist': 3,
            'location': 3,
            'address': 3,

            // Minimal importance types
            'id': 1,             // System fields
            'base64': 1,
            'time': 2
        };

        return typeScores[fieldType.toLowerCase()] || 3;
    }

    /**
     * Score based on usage patterns
     * @private
     */
    scoreUsagePattern(usageData) {
        let score = 0;

        // Fill rate (0-10 points)
        if (usageData.fillRate !== undefined) {
            if (usageData.fillRate >= 0.8) {
                score += 10; // 80%+ fill rate = highly used
            } else if (usageData.fillRate >= 0.5) {
                score += 7;
            } else if (usageData.fillRate >= 0.2) {
                score += 4;
            } else {
                score += 1; // Low fill rate = rarely used
            }
        }

        // Update frequency (0-10 points)
        if (usageData.updateFrequency !== undefined) {
            if (usageData.updateFrequency === 'high') {
                score += 10;
            } else if (usageData.updateFrequency === 'medium') {
                score += 6;
            } else if (usageData.updateFrequency === 'low') {
                score += 2;
            }
        }

        return Math.min(score, 20); // Cap at 20 points
    }

    /**
     * Score based on business logic involvement
     * @private
     */
    scoreBusinessLogic(field) {
        let score = 0;

        // Formula fields (5 points)
        if (field.calculated) {
            score += 5;
        }

        // Fields in validation rules (5 points) - would need to analyze validation rules
        // For now, give bonus to commonly validated field types
        if (field.type === 'email' || field.type === 'phone' || field.type === 'url') {
            score += 3;
        }

        // Defaulted fields (2 points)
        if (field.defaultValue || field.defaultValueFormula) {
            score += 2;
        }

        return Math.min(score, 10); // Cap at 10 points
    }

    /**
     * Get priority level from score
     * @private
     */
    getPriorityLevel(score) {
        if (score >= 90) return 'CRITICAL';
        if (score >= 75) return 'IMPORTANT';
        if (score >= 50) return 'CONTEXTUAL';
        if (score >= 25) return 'LOW';
        return 'MINIMAL';
    }

    /**
     * Get field recommendation based on score
     * @private
     */
    getFieldRecommendation(score, field) {
        if (score >= 90) {
            return `Must include in first section (${field.label})`;
        } else if (score >= 75) {
            return `Include in early sections (${field.label})`;
        } else if (score >= 50) {
            return `Include if space permits (${field.label})`;
        } else if (score >= 25) {
            return `Consider conditional display or omitting (${field.label})`;
        } else {
            return `Omit from default layout (${field.label})`;
        }
    }

    /**
     * Load persona template from JSON file
     * @private
     */
    async loadPersonaTemplate(personaName) {
        const cacheKey = `persona_${personaName}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const templatePath = path.join(this.templatesDir, 'personas', `${personaName}.json`);

        try {
            const templateContent = await fs.readFile(templatePath, 'utf8');
            const template = JSON.parse(templateContent);
            this.cache.set(cacheKey, template);
            return template;
        } catch (error) {
            throw new Error(`Failed to load persona template '${personaName}': ${error.message}`);
        }
    }

    /**
     * Get field metadata from Salesforce org
     * @private
     */
    async getFieldMetadata(objectName) {
        const cacheKey = `metadata_${objectName}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));

            if (result.status !== 0 || !result.result || !result.result.fields) {
                throw new Error('Failed to retrieve object metadata');
            }

            const fields = result.result.fields;
            this.cache.set(cacheKey, fields);

            return fields;

        } catch (error) {
            throw new Error(`Failed to get field metadata for ${objectName}: ${error.message}`);
        }
    }

    /**
     * Get field usage statistics (optional, requires analytics/reporting data)
     * @private
     */
    async getFieldUsageStats(objectName) {
        // This would query actual usage data from Salesforce
        // For Phase 2, return null (usage stats are optional enhancement)
        // In future, could query:
        // - Field history tracking
        // - SOQL query logs
        // - Report/Dashboard usage
        // - Field Audit Trail (if enabled)

        if (this.verbose) {
            console.log(`   Note: Usage statistics not available (optional feature)`);
        }

        return null;
    }

    /**
     * Generate section recommendations based on field scores
     * @param {Array} fieldScores - Scored fields from scoreFields()
     * @param {Object} persona - Persona template
     * @returns {Array} Recommended sections with field assignments
     */
    generateSectionRecommendations(fieldScores, persona, objectName) {
        const sections = [];
        const objectKey = objectName ? objectName.toLowerCase() : this.inferObjectFromFields(fieldScores);
        const usedFields = new Set();

        // Section 1: Critical fields (score >= 90)
        const criticalFields = fieldScores.filter(f => f.score >= 90);
        if (criticalFields.length > 0) {
            sections.push({
                label: 'Primary Information',
                priority: 1,
                fields: criticalFields.map(f => f.fieldName),
                fieldCount: criticalFields.length,
                reason: 'Critical fields required for core functionality'
            });
            criticalFields.forEach(f => usedFields.add(f.fieldName));
        }

        // Section 2: Important fields (score 75-89)
        const importantFields = fieldScores.filter(f => f.score >= 75 && f.score < 90);
        if (importantFields.length > 0) {
            // Split into subsections if too many (max 15 per section)
            const chunkSize = 15;
            for (let i = 0; i < importantFields.length; i += chunkSize) {
                const chunk = importantFields.slice(i, i + chunkSize);
                sections.push({
                    label: i === 0 ? 'Additional Details' : `Additional Details (${Math.floor(i / chunkSize) + 1})`,
                    priority: 2,
                    fields: chunk.map(f => f.fieldName),
                    fieldCount: chunk.length,
                    reason: 'Important fields for complete context'
                });
                chunk.forEach(f => usedFields.add(f.fieldName));
            }
        }

        // Section 3: Contextual fields (score 50-74), grouped by type/category
        const contextualFields = fieldScores.filter(f => f.score >= 50 && f.score < 75);
        if (contextualFields.length > 0) {
            sections.push({
                label: 'Supplemental Information',
                priority: 3,
                fields: contextualFields.slice(0, 20).map(f => f.fieldName), // Limit to 20
                fieldCount: Math.min(contextualFields.length, 20),
                reason: 'Contextual fields (consider conditional display)',
                conditional: contextualFields.length > 20 ? 'Show more fields conditionally' : null
            });
            contextualFields.slice(0, 20).forEach(f => usedFields.add(f.fieldName));
        }

        // FALLBACK: If insufficient sections generated (< 2), use persona template
        if (sections.length < 2) {
            const templateSections = objectKey && persona.sections ? persona.sections[objectKey] : null;
            const guidanceSections = this.resolveObjectGuidanceSections(persona, objectKey);

            if (templateSections || guidanceSections) {
                if (this.verbose) {
                    console.warn(`⚠️  Only ${sections.length} section(s) generated from scoring. Using persona guidance fallback for ${objectKey || 'unknown object'}.`);
                }
            }

            this.applyTemplateSections(sections, usedFields, fieldScores, templateSections, 'From persona template (scoring fallback)');
            this.applyTemplateSections(sections, usedFields, fieldScores, guidanceSections, 'From persona object guidance');
        }

        // FALLBACK: If still insufficient sections, use top-scoring fields
        if (sections.length < 2) {
            const fallbackFields = fieldScores
                .map(f => f.fieldName)
                .filter(fieldName => !usedFields.has(fieldName))
                .slice(0, 24);

            const labels = ['Primary Information', 'Additional Details', 'Supplemental Information'];
            const chunkSize = 8;

            for (let i = 0; i < fallbackFields.length && i / chunkSize < labels.length; i += chunkSize) {
                const chunk = fallbackFields.slice(i, i + chunkSize);
                if (chunk.length === 0) {
                    continue;
                }
                sections.push({
                    label: labels[Math.floor(i / chunkSize)],
                    priority: sections.length + 1,
                    fields: chunk,
                    fieldCount: chunk.length,
                    reason: 'Fallback from top-scoring fields',
                    isFallback: true
                });
                chunk.forEach(fieldName => usedFields.add(fieldName));
            }
        }

        return sections;
    }

    /**
     * Resolve persona object guidance sections by object name.
     * @private
     */
    resolveObjectGuidanceSections(persona, objectKey) {
        if (!persona.objectGuidance || !objectKey) {
            return null;
        }

        const match = Object.entries(persona.objectGuidance).find(
            ([key]) => key.toLowerCase() === objectKey
        );

        if (!match) {
            return null;
        }

        return match[1]?.sections || null;
    }

    /**
     * Apply template sections with field filtering and deduplication.
     * @private
     */
    applyTemplateSections(sections, usedFields, fieldScores, templateSections, reason) {
        if (!Array.isArray(templateSections)) {
            return;
        }

        templateSections.forEach(templateSection => {
            const label = templateSection.label || templateSection.name || `Section ${sections.length + 1}`;
            const fields = Array.isArray(templateSection.fields) ? templateSection.fields : [];
            const sectionFields = fields
                .filter(fieldName => fieldScores.find(f => f.fieldName === fieldName))
                .filter(fieldName => !usedFields.has(fieldName))
                .slice(0, 15);

            if (sectionFields.length === 0) {
                return;
            }

            sections.push({
                label: label,
                priority: templateSection.order || sections.length + 1,
                fields: sectionFields,
                fieldCount: sectionFields.length,
                reason: reason,
                isFallback: true
            });
            sectionFields.forEach(fieldName => usedFields.add(fieldName));
        });
    }

    /**
     * Infer object name from field scores (helper method)
     * @private
     */
    inferObjectFromFields(fieldScores) {
        // Check for object-specific fields to infer object type
        const fieldNames = fieldScores.map(f => f.fieldName);

        if (fieldNames.includes('StageName') || fieldNames.includes('Amount')) {
            return 'opportunity';
        } else if (fieldNames.includes('Company') && fieldNames.includes('Status') && fieldNames.includes('Rating')) {
            return 'lead';
        } else if (fieldNames.includes('AccountId') && fieldNames.includes('ReportsToId')) {
            return 'contact';
        } else if (fieldNames.includes('Type') && fieldNames.includes('Industry') && fieldNames.includes('AnnualRevenue')) {
            return 'account';
        } else if (fieldNames.includes('CaseNumber') || fieldNames.includes('Priority')) {
            return 'case';
        }

        return null;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        if (this.verbose) {
            console.log('✓ Rule engine cache cleared');
        }
    }
}

module.exports = LayoutRuleEngine;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
Usage: node layout-rule-engine.js <org-alias> <object-name> <persona> [options]

Options:
  --verbose           Show detailed scoring output
  --include-usage     Include usage statistics (if available)
  --output <file>     Save results to JSON file

Examples:
  node layout-rule-engine.js my-org Opportunity sales-rep --verbose
  node layout-rule-engine.js production Account executive --output account-scores.json
        `);
        process.exit(1);
    }

    const orgAlias = args[0];
    const objectName = args[1];
    const personaName = args[2];
    const verbose = args.includes('--verbose');
    const includeUsage = args.includes('--include-usage');
    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

    (async () => {
        try {
            const engine = new LayoutRuleEngine(orgAlias, { verbose });
            await engine.init();

            const fieldScores = await engine.scoreFields(objectName, personaName, { includeUsage });

            // Load persona for section recommendations
            const persona = await engine.loadPersonaTemplate(personaName);
            const sections = engine.generateSectionRecommendations(fieldScores, persona, objectName);

            const results = {
                object: objectName,
                persona: personaName,
                timestamp: new Date().toISOString(),
                fieldScores: fieldScores,
                sectionRecommendations: sections,
                summary: {
                    totalFields: fieldScores.length,
                    critical: fieldScores.filter(f => f.priority === 'CRITICAL').length,
                    important: fieldScores.filter(f => f.priority === 'IMPORTANT').length,
                    contextual: fieldScores.filter(f => f.priority === 'CONTEXTUAL').length,
                    lowPriority: fieldScores.filter(f => f.priority === 'LOW').length,
                    minimal: fieldScores.filter(f => f.priority === 'MINIMAL').length
                }
            };

            if (outputFile) {
                await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
                console.log(`\n✓ Results saved to: ${outputFile}\n`);
            } else {
                console.log('\n📊 Field Scoring Results:\n');
                console.log(JSON.stringify(results, null, 2));
            }

            console.log(`\n✓ Complete`);
            console.log(`   Total Fields: ${results.summary.totalFields}`);
            console.log(`   Recommended Sections: ${sections.length}`);

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
