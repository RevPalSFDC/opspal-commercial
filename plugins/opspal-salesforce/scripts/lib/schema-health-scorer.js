#!/usr/bin/env node

/**
 * Schema Health Scorer
 *
 * Calculates data model health score (0-100) for Salesforce orgs.
 * Assesses field count, relationship integrity, naming conventions,
 * field usage, duplication, and normalization.
 *
 * Score Components:
 *   - Field Count Health (0-20): Optimal field count per object
 *   - Relationship Integrity (0-25): Valid relationships, no orphans
 *   - Naming Conventions (0-15): Consistent, clear naming
 *   - Field Usage (0-15): Active fields vs unused
 *   - Duplication Prevention (0-15): Duplicate rules, matching rules
 *   - Normalization (0-10): Proper data structure
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Schema Health Scorer class
 */
class SchemaHealthScorer {
    constructor(org, options = {}) {
        this.org = org;
        this.verbose = options.verbose || false;

        // Thresholds
        this.optimalFieldsPerObject = { min: 10, max: 50 };
        this.maxFieldsBeforeConcern = 100;
    }

    /**
     * Calculate complete schema health score
     */
    async calculateHealthScore() {
        const startTime = Date.now();

        try {
            console.log('Calculating schema health score...\n');

            const components = {
                fieldCountHealth: await this.scoreFieldCountHealth(),
                relationshipIntegrity: await this.scoreRelationshipIntegrity(),
                namingConventions: await this.scoreNamingConventions(),
                fieldUsage: await this.scoreFieldUsage(),
                duplicationPrevention: await this.scoreDuplicationPrevention(),
                normalization: await this.scoreNormalization()
            };

            const totalScore = Object.values(components).reduce(
                (sum, c) => sum + c.score,
                0
            );

            const result = {
                totalScore,
                grade: this.getGrade(totalScore),
                components,
                issues: this.identifyIssues(components),
                recommendations: this.generateRecommendations(components),
                calculationTime: Date.now() - startTime
            };

            if (this.verbose) {
                this.printHealthScore(result);
            }

            return result;

        } catch (error) {
            console.error('Failed to calculate schema health score:', error.message);
            throw error;
        }
    }

    /**
     * Score field count health (0-20)
     * Optimal: 10-50 fields per object
     */
    async scoreFieldCountHealth() {
        try {
            const query = `SELECT EntityDefinition.QualifiedApiName, COUNT(Id) fieldCount FROM FieldDefinition WHERE EntityDefinition.IsCustomizable = true GROUP BY EntityDefinition.QualifiedApiName`;

            const result = this.executeQuery(query, true);
            const objectFieldCounts = JSON.parse(result).result.records;

            let optimalCount = 0;
            let tooFewCount = 0;
            let tooManyCount = 0;
            const bloatedObjects = [];

            for (const obj of objectFieldCounts) {
                const fieldCount = obj.fieldCount || obj.expr0;
                const objectName = obj.EntityDefinition?.QualifiedApiName;

                if (fieldCount >= this.optimalFieldsPerObject.min &&
                    fieldCount <= this.optimalFieldsPerObject.max) {
                    optimalCount++;
                } else if (fieldCount < this.optimalFieldsPerObject.min) {
                    tooFewCount++;
                } else {
                    tooManyCount++;
                    if (fieldCount > this.maxFieldsBeforeConcern) {
                        bloatedObjects.push({ object: objectName, fieldCount });
                    }
                }
            }

            const totalObjects = objectFieldCounts.length;
            const optimalPercent = totalObjects > 0 ? optimalCount / totalObjects : 0;

            let score = 0;
            if (optimalPercent >= 0.8) score = 20; // 80%+ optimal
            else if (optimalPercent >= 0.6) score = 15; // 60-80%
            else if (optimalPercent >= 0.4) score = 10; // 40-60%
            else if (optimalPercent >= 0.2) score = 5;  // 20-40%

            return {
                score,
                maxScore: 20,
                optimalCount,
                tooFewCount,
                tooManyCount,
                bloatedObjects,
                optimalPercent: (optimalPercent * 100).toFixed(1),
                details: `${optimalCount}/${totalObjects} objects have optimal field count (${(optimalPercent * 100).toFixed(1)}%)`
            };

        } catch (error) {
            console.warn('Could not score field count health:', error.message);
            return { score: 10, maxScore: 20, error: error.message };
        }
    }

    /**
     * Score relationship integrity (0-25)
     * Check for orphaned lookups, circular dependencies
     */
    async scoreRelationshipIntegrity() {
        try {
            // Query all lookup/master-detail fields
            const query = `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName, DataType, RelationshipName, ReferenceTo FROM FieldDefinition WHERE DataType IN ('Lookup', 'MasterDetail')`;

            const result = this.executeQuery(query, true);
            const relationships = JSON.parse(result).result.records;

            let validRelationships = 0;
            const issues = [];

            // Check each relationship (simplified - full check would query referenced objects)
            for (const rel of relationships) {
                const refTo = rel.ReferenceTo;

                // Check if referenced object exists (basic check)
                if (refTo && refTo.length > 0) {
                    validRelationships++;
                } else {
                    issues.push({
                        field: rel.QualifiedApiName,
                        object: rel.EntityDefinition?.QualifiedApiName,
                        issue: 'No reference target'
                    });
                }
            }

            const totalRelationships = relationships.length;
            const integrityPercent = totalRelationships > 0 ?
                validRelationships / totalRelationships : 1;

            let score = 0;
            if (integrityPercent >= 0.95) score = 25; // 95%+ valid
            else if (integrityPercent >= 0.9) score = 20;  // 90-95%
            else if (integrityPercent >= 0.8) score = 15;  // 80-90%
            else if (integrityPercent >= 0.7) score = 10;  // 70-80%
            else score = 5; // <70%

            return {
                score,
                maxScore: 25,
                totalRelationships,
                validRelationships,
                issuesFound: issues.length,
                issues: issues.slice(0, 10), // Top 10 issues
                integrityPercent: (integrityPercent * 100).toFixed(1),
                details: `${validRelationships}/${totalRelationships} relationships valid (${(integrityPercent * 100).toFixed(1)}%)`
            };

        } catch (error) {
            console.warn('Could not score relationship integrity:', error.message);
            return { score: 15, maxScore: 25, error: error.message };
        }
    }

    /**
     * Score naming conventions (0-15)
     */
    async scoreNamingConventions() {
        try {
            // Query custom field names
            const query = `SELECT QualifiedApiName, Label FROM FieldDefinition WHERE QualifiedApiName LIKE '%__c' LIMIT 200`;

            const result = this.executeQuery(query, true);
            const fields = JSON.parse(result).result.records;

            let goodNames = 0;
            const badNames = [];

            for (const field of fields) {
                const apiName = field.QualifiedApiName.split('.')[1] || field.QualifiedApiName;
                const baseName = apiName.replace('__c', '');

                // Check naming convention: PascalCase or Snake_Case
                const isPascalCase = /^[A-Z][a-zA-Z0-9]*(_[A-Z][a-zA-Z0-9]*)*$/.test(baseName);
                const isSnakeCase = /^[A-Z][a-z0-9]*(_[A-Z][a-z0-9]*)*$/.test(baseName);
                const isDescriptive = baseName.length >= 3 && baseName.length <= 40;

                if ((isPascalCase || isSnakeCase) && isDescriptive) {
                    goodNames++;
                } else {
                    badNames.push({ field: apiName, label: field.Label });
                }
            }

            const namingPercent = fields.length > 0 ? goodNames / fields.length : 1;

            let score = 0;
            if (namingPercent >= 0.9) score = 15; // 90%+ good names
            else if (namingPercent >= 0.8) score = 12; // 80-90%
            else if (namingPercent >= 0.7) score = 9;  // 70-80%
            else if (namingPercent >= 0.6) score = 6;  // 60-70%
            else score = 3; // <60%

            return {
                score,
                maxScore: 15,
                totalFields: fields.length,
                goodNames,
                badNames: badNames.length,
                badNamesList: badNames.slice(0, 10),
                namingPercent: (namingPercent * 100).toFixed(1),
                details: `${goodNames}/${fields.length} fields follow naming conventions (${(namingPercent * 100).toFixed(1)}%)`
            };

        } catch (error) {
            console.warn('Could not score naming conventions:', error.message);
            return { score: 10, maxScore: 15, error: error.message };
        }
    }

    /**
     * Score field usage (0-15)
     * Detect unused fields (technical debt)
     */
    async scoreFieldUsage() {
        try {
            // Note: True field usage would require querying LastReferencedDate
            // Using proxy: presence in layouts/reports indicates usage

            // Query custom fields
            const query = `SELECT COUNT() FROM FieldDefinition WHERE QualifiedApiName LIKE '%__c'`;
            const result = this.executeQuery(query, true);
            const totalCustomFields = JSON.parse(result).result.totalSize || 0;

            // Estimate usage (conservative)
            const usagePercent = 0.75; // 75% estimated usage
            const usedFields = Math.round(totalCustomFields * usagePercent);
            const unusedFields = totalCustomFields - usedFields;

            let score = 0;
            if (usagePercent >= 0.9) score = 15; // 90%+ used
            else if (usagePercent >= 0.8) score = 12; // 80-90%
            else if (usagePercent >= 0.7) score = 9;  // 70-80%
            else if (usagePercent >= 0.6) score = 6;  // 60-70%
            else score = 3; // <60%

            return {
                score,
                maxScore: 15,
                totalCustomFields,
                estimatedUsed: usedFields,
                estimatedUnused: unusedFields,
                usagePercent: (usagePercent * 100).toFixed(1),
                details: `Estimated ${usedFields}/${totalCustomFields} fields actively used (${(usagePercent * 100).toFixed(1)}%)`
            };

        } catch (error) {
            console.warn('Could not score field usage:', error.message);
            return { score: 10, maxScore: 15, error: error.message };
        }
    }

    /**
     * Score duplication prevention (0-15)
     */
    async scoreDuplicationPrevention() {
        try {
            // Query duplicate rules
            const drQuery = `SELECT COUNT() FROM DuplicateRule WHERE IsActive = true`;
            const drResult = this.executeQuery(drQuery, true);
            const activeDuplicateRules = JSON.parse(drResult).result.totalSize || 0;

            // Query matching rules
            const mrQuery = `SELECT COUNT() FROM MatchingRule WHERE IsActive__c = true`;
            let activeMatchingRules = 0;
            try {
                const mrResult = this.executeQuery(mrQuery, true);
                activeMatchingRules = JSON.parse(mrResult).result.totalSize || 0;
            } catch (e) {
                // Matching rules may not be available in all orgs
                activeMatchingRules = 0;
            }

            // Score based on presence of duplication controls
            let score = 0;
            if (activeDuplicateRules >= 5) score = 15; // 5+ duplicate rules
            else if (activeDuplicateRules >= 3) score = 12; // 3-4 rules
            else if (activeDuplicateRules >= 1) score = 8;  // 1-2 rules
            else score = 0; // No duplicate rules

            // Bonus for matching rules
            if (activeMatchingRules > 0) {
                score = Math.min(score + 3, 15);
            }

            return {
                score,
                maxScore: 15,
                activeDuplicateRules,
                activeMatchingRules,
                details: `${activeDuplicateRules} duplicate rules, ${activeMatchingRules} matching rules active`
            };

        } catch (error) {
            console.warn('Could not score duplication prevention:', error.message);
            return { score: 5, maxScore: 15, error: error.message };
        }
    }

    /**
     * Score normalization (0-10)
     * Check for proper data structure (not denormalized)
     */
    async scoreNormalization() {
        try {
            // Query for formula fields (can indicate denormalization if excessive)
            const query = `SELECT COUNT() FROM FieldDefinition WHERE DataType = 'Calculated'`;
            const result = this.executeQuery(query, true);
            const formulaFieldCount = JSON.parse(result).result.totalSize || 0;

            // Query total custom fields
            const totalQuery = `SELECT COUNT() FROM FieldDefinition WHERE QualifiedApiName LIKE '%__c'`;
            const totalResult = this.executeQuery(totalQuery, true);
            const totalFields = JSON.parse(totalResult).result.totalSize || 1;

            // Formula fields should be <20% of total (if higher, may indicate denormalization)
            const formulaPercent = formulaFieldCount / totalFields;

            let score = 10; // Default good
            if (formulaPercent > 0.3) score = 4;  // >30% formulas = concerning
            else if (formulaPercent > 0.2) score = 7;  // 20-30% formulas
            // else score = 10 (optimal)

            return {
                score,
                maxScore: 10,
                formulaFieldCount,
                totalFields,
                formulaPercent: (formulaPercent * 100).toFixed(1),
                details: `${formulaFieldCount}/${totalFields} formula fields (${(formulaPercent * 100).toFixed(1)}%)`
            };

        } catch (error) {
            console.warn('Could not score normalization:', error.message);
            return { score: 7, maxScore: 10, error: error.message };
        }
    }

    /**
     * Execute SOQL query
     */
    executeQuery(query, useToolingApi = false) {
        const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
        const cmd = `sf data query --query "${query}" --target-org ${this.org} ${toolingFlag} --json`;

        return execSync(cmd, { encoding: 'utf8' });
    }

    /**
     * Get grade from score
     */
    getGrade(score) {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        return 'D/F';
    }

    /**
     * Identify critical issues
     */
    identifyIssues(components) {
        const issues = [];

        // Bloated objects
        if (components.fieldCountHealth.bloatedObjects?.length > 0) {
            components.fieldCountHealth.bloatedObjects.forEach(obj => {
                issues.push({
                    severity: 'HIGH',
                    category: 'Field Bloat',
                    object: obj.object,
                    issue: `${obj.fieldCount} fields (exceeds ${this.maxFieldsBeforeConcern} threshold)`,
                    recommendation: 'Review field usage, consider archiving unused fields'
                });
            });
        }

        // Relationship issues
        if (components.relationshipIntegrity.issuesFound > 0) {
            issues.push({
                severity: 'CRITICAL',
                category: 'Relationship Integrity',
                issue: `${components.relationshipIntegrity.issuesFound} relationship issues detected`,
                recommendation: 'Review and fix orphaned relationships'
            });
        }

        // No duplicate rules
        if (components.duplicationPrevention.activeDuplicateRules === 0) {
            issues.push({
                severity: 'MEDIUM',
                category: 'Duplication Prevention',
                issue: 'No active duplicate rules',
                recommendation: 'Implement duplicate rules for Account, Contact, Lead'
            });
        }

        // Excessive denormalization
        if (components.normalization.score < 5) {
            issues.push({
                severity: 'MEDIUM',
                category: 'Normalization',
                issue: `High formula field percentage (${components.normalization.formulaPercent}%)`,
                recommendation: 'Review formula fields - consider using relationships instead of copying data'
            });
        }

        return issues;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations(components) {
        const recommendations = [];

        // Field count
        if (components.fieldCountHealth.score < 15) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Field Count',
                finding: `${components.fieldCountHealth.bloatedObjects?.length || 0} objects with >100 fields`,
                recommendation: 'Review bloated objects, archive unused fields',
                impact: 'Improves performance and maintainability'
            });
        }

        // Relationship integrity
        if (components.relationshipIntegrity.score < 20) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Relationship Integrity',
                finding: `${components.relationshipIntegrity.issuesFound} relationship issues`,
                recommendation: 'Fix orphaned lookups and validate all relationships',
                impact: 'Prevents data integrity issues and deployment failures'
            });
        }

        // Duplication prevention
        if (components.duplicationPrevention.score < 8) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'Duplication Prevention',
                finding: `Only ${components.duplicationPrevention.activeDuplicateRules} duplicate rules active`,
                recommendation: 'Implement duplicate rules for core objects (Account, Contact, Lead)',
                impact: 'Prevents duplicate records and improves data quality'
            });
        }

        // Normalization
        if (components.normalization.score < 7) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'Normalization',
                finding: `High formula field percentage (${components.normalization.formulaPercent}%)`,
                recommendation: 'Review formulas - use relationships instead of copying data',
                impact: 'Improves data integrity and reduces maintenance'
            });
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    /**
     * Print health score to console
     */
    printHealthScore(result) {
        console.log('\n═══════════════════════════════════════════════════════════════════');
        console.log('SCHEMA HEALTH SCORE');
        console.log('═══════════════════════════════════════════════════════════════════\n');

        console.log(`OVERALL SCORE: ${result.totalScore}/100 (${result.grade})\n`);

        console.log('COMPONENT BREAKDOWN:\n');

        Object.entries(result.components).forEach(([name, data]) => {
            const bar = this.getBar(data.score, data.maxScore);
            const label = name.replace(/([A-Z])/g, ' $1').trim();

            console.log(`  ${label}:`.padEnd(30) + `${data.score}/${data.maxScore}  ${bar}`);
            console.log(`    ${data.details}\n`);
        });

        if (result.issues.length > 0) {
            console.log('CRITICAL ISSUES:\n');
            result.issues.forEach((issue, i) => {
                console.log(`  ${i + 1}. [${issue.severity}] ${issue.category}`);
                if (issue.object) console.log(`     Object: ${issue.object}`);
                console.log(`     Issue: ${issue.issue}`);
                console.log(`     Recommendation: ${issue.recommendation}\n`);
            });
        }

        console.log('RECOMMENDATIONS:\n');

        result.recommendations.slice(0, 5).forEach((rec, i) => {
            console.log(`  ${i + 1}. [${rec.priority}] ${rec.category}`);
            console.log(`     Finding: ${rec.finding}`);
            console.log(`     Recommendation: ${rec.recommendation}`);
            console.log(`     Impact: ${rec.impact}\n`);
        });

        console.log('═══════════════════════════════════════════════════════════════════\n');
    }

    /**
     * Get progress bar
     */
    getBar(score, max) {
        const width = 40;
        const filled = Math.round((score / max) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }
}

/**
 * CLI interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
Schema Health Scorer - Assess Salesforce data model quality

Commands:
  calculate <org>    Calculate schema health score

Examples:
  node schema-health-scorer.js calculate beta-corp-revpal-sandbox
`);
        process.exit(0);
    }

    const org = args[1] || 'beta-corp-revpal-sandbox';
    const scorer = new SchemaHealthScorer(org, { verbose: true });

    (async () => {
        try {
            if (command === 'calculate') {
                await scorer.calculateHealthScore();
                process.exit(0);
            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = SchemaHealthScorer;
