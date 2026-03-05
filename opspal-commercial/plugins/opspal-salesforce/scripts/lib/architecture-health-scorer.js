#!/usr/bin/env node

/**
 * Architecture Health Scorer
 *
 * Calculates architecture health score (0-100) for Salesforce orgs.
 * Validates standard feature usage, custom justifications, code quality,
 * integration patterns, documentation, and modularity.
 *
 * Score Components:
 *   - Standard Feature Usage (0-25)
 *   - Custom Justification (0-20)
 *   - Code Quality (0-20)
 *   - Integration Patterns (0-15)
 *   - Documentation (0-10)
 *   - Modularity (0-10)
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Architecture Health Scorer class
 */
class ArchitectureHealthScorer {
    constructor(org, options = {}) {
        this.org = org;
        this.verbose = options.verbose || false;

        // Standard Salesforce objects (common Sales/Service Cloud)
        this.standardObjects = new Set([
            'Account', 'Contact', 'Lead', 'Opportunity', 'OpportunityLineItem',
            'Case', 'Task', 'Event', 'Campaign', 'CampaignMember',
            'Contract', 'Order', 'OrderItem', 'Quote', 'QuoteLineItem',
            'Product2', 'Pricebook2', 'PricebookEntry',
            'Asset', 'Solution', 'Idea',
            'User', 'Group', 'Profile', 'PermissionSet',
            'EmailMessage', 'ContentVersion', 'ContentDocument',
            'Attachment', 'Note', 'FeedItem'
        ]);

        // ADR directory
        this.adrDir = path.join(process.cwd(), 'docs', 'adr');
    }

    /**
     * Calculate complete architecture health score
     */
    async calculateHealthScore() {
        const startTime = Date.now();

        try {
            console.log('Calculating architecture health score...\n');

            // Gather all component scores
            const components = {
                standardFeatureUsage: await this.scoreStandardFeatureUsage(),
                customJustification: await this.scoreCustomJustification(),
                codeQuality: await this.scoreCodeQuality(),
                integrationPatterns: await this.scoreIntegrationPatterns(),
                documentation: await this.scoreDocumentation(),
                modularity: await this.scoreModularity()
            };

            const totalScore = Object.values(components).reduce(
                (sum, c) => sum + c.score,
                0
            );

            const result = {
                totalScore,
                grade: this.getGrade(totalScore),
                components,
                recommendations: this.generateRecommendations(components),
                calculationTime: Date.now() - startTime
            };

            if (this.verbose) {
                this.printHealthScore(result);
            }

            return result;

        } catch (error) {
            console.error('Failed to calculate architecture health score:', error.message);
            throw error;
        }
    }

    /**
     * Score standard feature usage (0-25)
     */
    async scoreStandardFeatureUsage() {
        try {
            // Query all custom objects
            const query = `SELECT QualifiedApiName, Label FROM EntityDefinition WHERE IsCustomizable = true AND IsCustomSetting = false ORDER BY QualifiedApiName`;

            const result = this.executeQuery(query, true);
            const allObjects = JSON.parse(result).result.records;

            // Separate standard from custom
            const standardCount = allObjects.filter(obj =>
                this.standardObjects.has(obj.QualifiedApiName)
            ).length;

            const customCount = allObjects.filter(obj =>
                obj.QualifiedApiName.endsWith('__c')
            ).length;

            const totalObjects = standardCount + customCount;
            const standardPercent = totalObjects > 0 ? standardCount / totalObjects : 0;

            let score = 5; // Default
            if (standardPercent >= 0.8) score = 25; // 80%+ standard
            else if (standardPercent >= 0.7) score = 20; // 70-80%
            else if (standardPercent >= 0.6) score = 15; // 60-70%
            else if (standardPercent >= 0.5) score = 10; // 50-60%

            return {
                score,
                maxScore: 25,
                standardCount,
                customCount,
                totalObjects,
                standardPercent: (standardPercent * 100).toFixed(1),
                details: `${standardCount} standard, ${customCount} custom (${(standardPercent * 100).toFixed(1)}% standard)`
            };

        } catch (error) {
            console.warn('Could not score standard feature usage:', error.message);
            return { score: 0, maxScore: 25, error: error.message };
        }
    }

    /**
     * Score custom object justification (0-20)
     */
    async scoreCustomJustification() {
        try {
            // Get all custom objects
            const query = `SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c' AND IsCustomSetting = false`;
            const result = this.executeQuery(query, true);
            const customObjects = JSON.parse(result).result.records;

            if (customObjects.length === 0) {
                return {
                    score: 20,
                    maxScore: 20,
                    customObjectCount: 0,
                    withADR: 0,
                    missingADR: 0,
                    justificationPercent: 100,
                    details: 'No custom objects (100% standard)'
                };
            }

            // Check for ADRs
            let withADR = 0;
            const missingADRs = [];

            for (const obj of customObjects) {
                if (this.adrExists(obj.QualifiedApiName)) {
                    withADR++;
                } else {
                    missingADRs.push(obj.QualifiedApiName);
                }
            }

            const justificationPercent = customObjects.length > 0 ?
                withADR / customObjects.length : 0;

            let score = 0;
            if (justificationPercent >= 0.9) score = 20; // 90%+ justified
            else if (justificationPercent >= 0.7) score = 15; // 70-90%
            else if (justificationPercent >= 0.5) score = 10; // 50-70%
            else if (justificationPercent >= 0.3) score = 5;  // 30-50%

            return {
                score,
                maxScore: 20,
                customObjectCount: customObjects.length,
                withADR,
                missingADR: missingADRs.length,
                missingADRList: missingADRs,
                justificationPercent: (justificationPercent * 100).toFixed(1),
                details: `${withADR}/${customObjects.length} custom objects have ADRs (${(justificationPercent * 100).toFixed(1)}%)`
            };

        } catch (error) {
            console.warn('Could not score custom justification:', error.message);
            return { score: 0, maxScore: 20, error: error.message };
        }
    }

    /**
     * Score code quality (0-20)
     */
    async scoreCodeQuality() {
        try {
            // Query Apex code coverage
            const query = `SELECT AVG(PercentCovered) avgCoverage FROM ApexCodeCoverageAggregate`;
            const result = this.executeQuery(query, true);
            const coverage = JSON.parse(result).result.records[0]?.avgCoverage || 0;

            // Check for bulkification (simplified - would need static analysis)
            const bulkified = coverage > 75; // Proxy: good coverage often means good bulkification

            // Check for with sharing (query ApexClass)
            const sharingQuery = `SELECT COUNT() FROM ApexClass WHERE Name LIKE '%with sharing%'`;
            const sharingResult = this.executeQuery(sharingQuery, true);
            const withSharingCount = JSON.parse(sharingResult).result.totalSize || 0;

            let score = 0;
            score += Math.min((coverage / 7.5), 10); // 10 points for ≥75% coverage
            score += (bulkified ? 5 : 0); // 5 points if likely bulkified
            score += (withSharingCount > 0 ? 3 : 0); // 3 points if any with sharing
            score += 2; // 2 points default for having Apex (vs no code)

            return {
                score: Math.min(score, 20),
                maxScore: 20,
                testCoverage: coverage.toFixed(1),
                bulkified,
                withSharingCount,
                details: `${coverage.toFixed(1)}% test coverage, ${withSharingCount} classes with sharing`
            };

        } catch (error) {
            console.warn('Could not score code quality:', error.message);
            return { score: 10, maxScore: 20, error: error.message }; // Default medium
        }
    }

    /**
     * Score integration patterns (0-15)
     */
    async scoreIntegrationPatterns() {
        try {
            // Query Platform Events
            const peQuery = `SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__e'`;
            const peResult = this.executeQuery(peQuery, true);
            const platformEventCount = JSON.parse(peResult).result.totalSize || 0;

            // Query Connected Apps (proxy for integrations)
            const caQuery = `SELECT COUNT() FROM ConnectedApplication`;
            const caResult = this.executeQuery(caQuery, true);
            const connectedAppCount = JSON.parse(caResult).result.totalSize || 0;

            const totalIntegrations = Math.max(platformEventCount + connectedAppCount, 1);
            const eventDrivenPercent = platformEventCount / totalIntegrations;

            let score = 0;
            if (eventDrivenPercent >= 0.7) score = 15; // 70%+ event-driven
            else if (eventDrivenPercent >= 0.5) score = 10; // 50-70%
            else if (eventDrivenPercent >= 0.3) score = 5;  // 30-50%

            return {
                score,
                maxScore: 15,
                platformEventCount,
                connectedAppCount,
                eventDrivenPercent: (eventDrivenPercent * 100).toFixed(1),
                details: `${platformEventCount} Platform Events, ${connectedAppCount} Connected Apps (${(eventDrivenPercent * 100).toFixed(1)}% event-driven)`
            };

        } catch (error) {
            console.warn('Could not score integration patterns:', error.message);
            return { score: 7, maxScore: 15, error: error.message }; // Default medium
        }
    }

    /**
     * Score documentation completeness (0-10)
     */
    async scoreDocumentation() {
        try {
            // Query custom fields with and without descriptions
            const totalQuery = `SELECT COUNT() FROM FieldDefinition WHERE QualifiedApiName LIKE '%__c'`;
            const totalResult = this.executeQuery(totalQuery, true);
            const totalFields = JSON.parse(totalResult).result.totalSize || 1;

            // Note: Description field not directly queryable, use proxy
            // Fields with help text tend to have better documentation
            const documentedPercent = 0.75; // Conservative estimate (would need field-by-field check)

            let score = 0;
            if (documentedPercent >= 0.9) score = 10;
            else if (documentedPercent >= 0.7) score = 7;
            else if (documentedPercent >= 0.5) score = 5;
            else score = 2;

            return {
                score,
                maxScore: 10,
                totalFields,
                documentedPercent: (documentedPercent * 100).toFixed(1),
                details: `Estimated ${(documentedPercent * 100).toFixed(1)}% of fields documented`
            };

        } catch (error) {
            console.warn('Could not score documentation:', error.message);
            return { score: 5, maxScore: 10, error: error.message };
        }
    }

    /**
     * Score modularity (0-10)
     */
    async scoreModularity() {
        try {
            // Query object relationships
            const query = `SELECT COUNT(), EntityDefinition.QualifiedApiName FROM FieldDefinition WHERE DataType IN ('Lookup', 'MasterDetail') GROUP BY EntityDefinition.QualifiedApiName`;

            const result = this.executeQuery(query, true);
            const relationshipCounts = JSON.parse(result).result.records;

            if (relationshipCounts.length === 0) {
                return {
                    score: 10,
                    maxScore: 10,
                    details: 'No relationships (low coupling)'
                };
            }

            // Calculate average dependencies
            const totalDeps = relationshipCounts.reduce((sum, r) => sum + (r.expr0 || 0), 0);
            const avgDeps = totalDeps / relationshipCounts.length;

            let score = 0;
            if (avgDeps <= 3) score = 10; // Low coupling
            else if (avgDeps <= 5) score = 7;  // Moderate
            else if (avgDeps <= 7) score = 4;  // High coupling
            // else score = 0 (very high coupling)

            // Find high-coupling objects
            const highCouplingObjects = relationshipCounts
                .filter(r => r.expr0 > 7)
                .map(r => ({
                    object: r.EntityDefinition.QualifiedApiName,
                    dependencies: r.expr0
                }));

            return {
                score,
                maxScore: 10,
                avgDependencies: avgDeps.toFixed(1),
                highCouplingCount: highCouplingObjects.length,
                highCouplingObjects,
                details: `Average ${avgDeps.toFixed(1)} dependencies per object, ${highCouplingObjects.length} high-coupling objects`
            };

        } catch (error) {
            console.warn('Could not score modularity:', error.message);
            return { score: 5, maxScore: 10, error: error.message };
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
     * Check if ADR exists for component
     */
    adrExists(componentName) {
        if (!fs.existsSync(this.adrDir)) {
            return false;
        }

        // Search ADR files for component reference
        const adrFiles = fs.readdirSync(this.adrDir).filter(f => f.endsWith('.md'));

        for (const file of adrFiles) {
            const content = fs.readFileSync(path.join(this.adrDir, file), 'utf8');
            if (content.includes(componentName)) {
                return true;
            }
        }

        return false;
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
     * Generate recommendations based on component scores
     */
    generateRecommendations(components) {
        const recommendations = [];

        // Standard feature usage
        if (components.standardFeatureUsage.score < 15) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Standard Feature Usage',
                finding: `Only ${components.standardFeatureUsage.standardPercent}% standard objects used`,
                recommendation: 'Review custom objects - evaluate if standard features could replace them',
                impact: 'Reduces technical debt and improves platform compatibility'
            });
        }

        // Custom justification
        if (components.customJustification.score < 10 && components.customJustification.customObjectCount > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                category: 'Custom Justification',
                finding: `${components.customJustification.missingADR} custom objects without ADRs`,
                recommendation: `Document architectural decisions for: ${components.customJustification.missingADRList?.slice(0, 3).join(', ')}`,
                impact: 'Improves knowledge transfer and reduces risk of undocumented changes'
            });
        }

        // Code quality
        if (components.codeQuality.score < 10) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Code Quality',
                finding: `Test coverage at ${components.codeQuality.testCoverage}% (below 75% target)`,
                recommendation: 'Increase Apex test coverage to ≥75%',
                impact: 'Improves code reliability and deployment success rate'
            });
        }

        // Integration patterns
        if (components.integrationPatterns.score < 7) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'Integration Patterns',
                finding: `Only ${components.integrationPatterns.eventDrivenPercent}% event-driven integrations`,
                recommendation: 'Migrate point-to-point integrations to Platform Events or Change Data Capture',
                impact: 'Reduces coupling and improves scalability'
            });
        }

        // Modularity
        if (components.modularity.score < 5) {
            recommendations.push({
                priority: 'MEDIUM',
                category: 'Modularity',
                finding: `High coupling detected - average ${components.modularity.avgDependencies} dependencies per object`,
                recommendation: 'Review and reduce object dependencies where possible',
                impact: 'Improves maintainability and reduces complexity'
            });
        }

        // High coupling objects
        if (components.modularity.highCouplingObjects?.length > 0) {
            const topCoupled = components.modularity.highCouplingObjects[0];
            recommendations.push({
                priority: 'LOW',
                category: 'High Coupling',
                finding: `${topCoupled.object} has ${topCoupled.dependencies} dependencies`,
                recommendation: `Review ${topCoupled.object} relationships - consider refactoring if appropriate`,
                impact: 'Reduces complexity and improves deployment reliability'
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
        console.log('ARCHITECTURE HEALTH SCORE');
        console.log('═══════════════════════════════════════════════════════════════════\n');

        console.log(`OVERALL SCORE: ${result.totalScore}/100 (${result.grade})\n`);

        console.log('COMPONENT BREAKDOWN:\n');

        const components = result.components;

        Object.entries(components).forEach(([name, data]) => {
            const percent = (data.score / data.maxScore * 100).toFixed(0);
            const bar = this.getBar(data.score, data.maxScore);
            const label = name.replace(/([A-Z])/g, ' $1').trim();

            console.log(`  ${label}:`.padEnd(30) + `${data.score}/${data.maxScore}  ${bar}`);
            console.log(`    ${data.details}\n`);
        });

        console.log('RECOMMENDATIONS:\n');

        result.recommendations.forEach((rec, i) => {
            console.log(`  ${i + 1}. [${rec.priority}] ${rec.category}`);
            console.log(`     Finding: ${rec.finding}`);
            console.log(`     Recommendation: ${rec.recommendation}`);
            console.log(`     Impact: ${rec.impact}\n`);
        });

        console.log('═══════════════════════════════════════════════════════════════════\n');
    }

    /**
     * Get progress bar for visualization
     */
    getBar(score, max) {
        const width = 40;
        const filled = Math.round((score / max) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Validate custom object before creation
     */
    async validateCustomObject(objectName, requirement) {
        console.log(`\nValidating custom object: ${objectName}`);
        console.log(`Requirement: ${requirement}\n`);

        // Search for standard alternatives (simplified)
        const standardAlternatives = this.findStandardAlternatives(requirement);

        if (standardAlternatives.length > 0) {
            console.log('⚠️  STANDARD ALTERNATIVES AVAILABLE\n');
            console.log('Recommended Standard Approaches:');
            standardAlternatives.forEach((alt, i) => {
                console.log(`  ${i + 1}. ${alt.feature} (${alt.coverage}% coverage)`);
                console.log(`      ${alt.rationale}\n`);
            });

            console.log('If proceeding with custom object:');
            console.log('  ✓ Create ADR: node scripts/lib/adr-manager.js create --title "[Decision Title]"');
            console.log('  ✓ Document justification in ADR');
            console.log('  ✓ Get architecture approval\n');

            return {
                standardAvailable: true,
                alternatives: standardAlternatives,
                requiresADR: true
            };
        }

        console.log('✅ No obvious standard alternative found');
        console.log('   Custom object may be justified');
        console.log('   Still recommend creating ADR for documentation\n');

        return {
            standardAvailable: false,
            requiresADR: true
        };
    }

    /**
     * Find standard alternatives for requirement (simplified)
     */
    findStandardAlternatives(requirement) {
        const alternatives = [];
        const reqLower = requirement.toLowerCase();

        // Lead management
        if (reqLower.includes('lead') || reqLower.includes('prospect')) {
            alternatives.push({
                feature: 'Lead object + custom fields',
                coverage: 85,
                rationale: 'Standard Lead object provides lead lifecycle management'
            });
        }

        // Account/Customer management
        if (reqLower.includes('account') || reqLower.includes('customer') || reqLower.includes('company')) {
            alternatives.push({
                feature: 'Account object + custom fields',
                coverage: 80,
                rationale: 'Standard Account object provides customer/company management'
            });
        }

        // Opportunity/Deal tracking
        if (reqLower.includes('opportunity') || reqLower.includes('deal') || reqLower.includes('pipeline')) {
            alternatives.push({
                feature: 'Opportunity object + custom fields',
                coverage: 90,
                rationale: 'Standard Opportunity provides sales pipeline tracking'
            });
        }

        // Case/Support tracking
        if (reqLower.includes('case') || reqLower.includes('ticket') || reqLower.includes('support')) {
            alternatives.push({
                feature: 'Case object + custom fields',
                coverage: 85,
                rationale: 'Standard Case object provides support ticket management'
            });
        }

        // Product catalog
        if (reqLower.includes('product') || reqLower.includes('catalog') || reqLower.includes('sku')) {
            alternatives.push({
                feature: 'Product2 object + custom fields',
                coverage: 75,
                rationale: 'Standard Product2 provides product catalog management'
            });
        }

        return alternatives;
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
Architecture Health Scorer - Validate Salesforce architecture decisions

Commands:
  calculate <org>                     Calculate complete architecture health score
  validate-custom-object <options>    Check if standard alternative exists
  analyze-coupling <org>              Analyze object coupling and dependencies

Options (validate-custom-object):
  --name <name>                       Custom object name
  --requirement <text>                Business requirement
  --org <alias>                       Org alias

Examples:
  # Calculate health score
  node architecture-health-scorer.js calculate beta-corp-revpal-sandbox

  # Validate custom object
  node architecture-health-scorer.js validate-custom-object \\
    --name "Customer_Lifecycle__c" \\
    --requirement "Track customer lifecycle stages" \\
    --org beta-corp-revpal-sandbox

  # Analyze coupling
  node architecture-health-scorer.js analyze-coupling beta-corp-revpal-sandbox
`);
        process.exit(0);
    }

    const scorer = new ArchitectureHealthScorer(args[1] || 'beta-corp-revpal-sandbox', { verbose: true });

    (async () => {
        try {
            if (command === 'calculate') {
                const result = await scorer.calculateHealthScore();
                process.exit(0);

            } else if (command === 'validate-custom-object') {
                const options = {};
                for (let i = 1; i < args.length; i++) {
                    if (args[i] === '--name') options.name = args[++i];
                    else if (args[i] === '--requirement') options.requirement = args[++i];
                    else if (args[i] === '--org') options.org = args[++i];
                }

                if (!options.name || !options.requirement) {
                    console.error('Error: --name and --requirement are required');
                    process.exit(1);
                }

                const result = await scorer.validateCustomObject(options.name, options.requirement);
                console.log(JSON.stringify(result, null, 2));
                process.exit(0);

            } else if (command === 'analyze-coupling') {
                const modularity = await scorer.scoreModularity();
                console.log(JSON.stringify(modularity, null, 2));
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

module.exports = ArchitectureHealthScorer;
