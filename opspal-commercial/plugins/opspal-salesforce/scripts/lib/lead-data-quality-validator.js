#!/usr/bin/env node

/**
 * Lead Data Quality Validator
 *
 * Instance-agnostic validator for Lead object data quality issues.
 * Identifies field population gaps, sync attribution issues, and
 * qualification rule effectiveness.
 *
 * Addresses reflection patterns:
 * - AnnualRevenue field population gaps
 * - Lead Source attribution issues
 * - Qualification criteria over-disqualification
 *
 * @module lead-data-quality-validator
 * @created 2026-01-22
 * @instance-agnostic true
 */

const { execSync } = require('child_process');

class LeadDataQualityValidator {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || null;
        this.verbose = options.verbose || false;
        this.thresholds = {
            minPopulationRate: options.minPopulationRate || 50, // Minimum % for critical fields
            minSourceAttribution: options.minSourceAttribution || 70, // Minimum % for lead source
            maxDisqualificationRate: options.maxDisqualificationRate || 30 // Max % disqualified
        };
        this.stats = {
            fieldsAnalyzed: 0,
            issuesFound: 0,
            criticalIssues: 0
        };
    }

    log(message) {
        if (this.verbose) {
            console.log(`[LeadDataQualityValidator] ${message}`);
        }
    }

    /**
     * Execute SOQL query against the target org
     * @param {string} query - SOQL query
     * @returns {Object} Query results
     */
    executeQuery(query) {
        if (!this.orgAlias) {
            throw new Error('Org alias is required for queries');
        }

        try {
            const cmd = `sf data query --query "${query.replace(/"/g, '\\"')}" --target-org ${this.orgAlias} --json`;
            this.log(`Executing: ${cmd}`);
            const result = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
            return JSON.parse(result);
        } catch (error) {
            this.log(`Query failed: ${error.message}`);
            return { result: { records: [] }, status: 1 };
        }
    }

    /**
     * Get all Lead fields dynamically (instance-agnostic)
     * @returns {Array} List of field names
     */
    async getLeadFields() {
        try {
            const cmd = `sf sobject describe Lead --target-org ${this.orgAlias} --json`;
            const result = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
            const data = JSON.parse(result);
            return data.result.fields.map(f => ({
                name: f.name,
                label: f.label,
                type: f.type,
                nillable: f.nillable,
                updateable: f.updateable
            }));
        } catch (error) {
            this.log(`Failed to get Lead fields: ${error.message}`);
            return [];
        }
    }

    /**
     * Analyze field population rates
     * @param {Array} fields - List of fields to analyze
     * @returns {Object} Population analysis results
     */
    async analyzeFieldPopulation(fields = null) {
        const targetFields = fields || [
            'AnnualRevenue',
            'NumberOfEmployees',
            'Industry',
            'LeadSource',
            'Email',
            'Phone',
            'Company',
            'Title'
        ];

        const results = {
            totalLeads: 0,
            fieldAnalysis: [],
            criticalGaps: [],
            recommendations: []
        };

        // Get total lead count
        const countQuery = "SELECT COUNT() FROM Lead";
        const countResult = this.executeQuery(countQuery);
        results.totalLeads = countResult.result?.totalSize || 0;

        if (results.totalLeads === 0) {
            return {
                ...results,
                error: 'No leads found in org'
            };
        }

        // Analyze each field
        for (const field of targetFields) {
            this.stats.fieldsAnalyzed++;

            // Query for non-null values
            const populatedQuery = `SELECT COUNT() FROM Lead WHERE ${field} != null`;
            const populatedResult = this.executeQuery(populatedQuery);
            const populatedCount = populatedResult.result?.totalSize || 0;

            const populationRate = Math.round((populatedCount / results.totalLeads) * 100);

            const fieldAnalysis = {
                field,
                totalRecords: results.totalLeads,
                populatedCount,
                populationRate,
                status: this.getPopulationStatus(populationRate, field)
            };

            results.fieldAnalysis.push(fieldAnalysis);

            // Check for critical gaps
            if (populationRate < this.thresholds.minPopulationRate && this.isCriticalField(field)) {
                results.criticalGaps.push({
                    field,
                    populationRate,
                    severity: populationRate === 0 ? 'CRITICAL' : 'HIGH',
                    impact: this.getFieldImpact(field)
                });
                this.stats.criticalIssues++;
            }
        }

        // Generate recommendations
        results.recommendations = this.generateRecommendations(results);
        this.stats.issuesFound = results.criticalGaps.length;

        return results;
    }

    /**
     * Analyze lead source attribution
     * @returns {Object} Attribution analysis
     */
    async analyzeSourceAttribution() {
        const results = {
            totalLeads: 0,
            attributedLeads: 0,
            attributionRate: 0,
            sourceDistribution: [],
            unattributedByStatus: [],
            recommendations: []
        };

        // Get total and attributed counts
        const totalQuery = "SELECT COUNT() FROM Lead";
        const totalResult = this.executeQuery(totalQuery);
        results.totalLeads = totalResult.result?.totalSize || 0;

        const attributedQuery = "SELECT COUNT() FROM Lead WHERE LeadSource != null";
        const attributedResult = this.executeQuery(attributedQuery);
        results.attributedLeads = attributedResult.result?.totalSize || 0;

        results.attributionRate = results.totalLeads > 0
            ? Math.round((results.attributedLeads / results.totalLeads) * 100)
            : 0;

        // Get source distribution
        const distributionQuery = "SELECT LeadSource, COUNT(Id) cnt FROM Lead WHERE LeadSource != null GROUP BY LeadSource ORDER BY COUNT(Id) DESC LIMIT 20";
        const distributionResult = this.executeQuery(distributionQuery);
        results.sourceDistribution = (distributionResult.result?.records || []).map(r => ({
            source: r.LeadSource,
            count: r.cnt,
            percentage: Math.round((r.cnt / results.totalLeads) * 100)
        }));

        // Check for unattributed leads by status
        const unattributedQuery = "SELECT Status, COUNT(Id) cnt FROM Lead WHERE LeadSource = null GROUP BY Status ORDER BY COUNT(Id) DESC LIMIT 10";
        const unattributedResult = this.executeQuery(unattributedQuery);
        results.unattributedByStatus = (unattributedResult.result?.records || []).map(r => ({
            status: r.Status,
            count: r.cnt
        }));

        // Flag if attribution is below threshold
        if (results.attributionRate < this.thresholds.minSourceAttribution) {
            this.stats.criticalIssues++;
            results.recommendations.push({
                priority: 'HIGH',
                issue: `Lead Source attribution is only ${results.attributionRate}% (threshold: ${this.thresholds.minSourceAttribution}%)`,
                action: 'Review lead capture forms and sync configurations to ensure LeadSource is being populated'
            });
        }

        return results;
    }

    /**
     * Analyze qualification status distribution
     * @returns {Object} Qualification analysis
     */
    async analyzeQualificationStatus() {
        const results = {
            totalLeads: 0,
            statusDistribution: [],
            disqualifiedAnalysis: {
                total: 0,
                rate: 0,
                reasons: []
            },
            potentialOverDisqualification: [],
            recommendations: []
        };

        // Get status distribution
        const statusQuery = "SELECT Status, COUNT(Id) cnt FROM Lead GROUP BY Status ORDER BY COUNT(Id) DESC";
        const statusResult = this.executeQuery(statusQuery);
        const records = statusResult.result?.records || [];

        results.totalLeads = records.reduce((sum, r) => sum + r.cnt, 0);
        results.statusDistribution = records.map(r => ({
            status: r.Status,
            count: r.cnt,
            percentage: Math.round((r.cnt / results.totalLeads) * 100)
        }));

        // Find disqualified/bad status leads
        const disqualifiedStatuses = results.statusDistribution.filter(s =>
            s.status && (
                s.status.toLowerCase().includes('disqualified') ||
                s.status.toLowerCase().includes('unqualified') ||
                s.status.toLowerCase().includes('bad') ||
                s.status.toLowerCase().includes('junk') ||
                s.status.toLowerCase().includes('dead')
            )
        );

        results.disqualifiedAnalysis.total = disqualifiedStatuses.reduce((sum, s) => sum + s.count, 0);
        results.disqualifiedAnalysis.rate = Math.round((results.disqualifiedAnalysis.total / results.totalLeads) * 100);

        // Check for over-disqualification
        if (results.disqualifiedAnalysis.rate > this.thresholds.maxDisqualificationRate) {
            this.stats.criticalIssues++;

            // Look for patterns in disqualified leads
            for (const status of disqualifiedStatuses) {
                // Check if disqualified leads have buyer signals
                const signalsQuery = `SELECT COUNT() FROM Lead WHERE Status = '${status.status}' AND (Description != null OR Email != null)`;
                const signalsResult = this.executeQuery(signalsQuery);
                const withSignals = signalsResult.result?.totalSize || 0;

                if (withSignals > status.count * 0.3) { // More than 30% have signals
                    results.potentialOverDisqualification.push({
                        status: status.status,
                        count: status.count,
                        withBuyerSignals: withSignals,
                        recommendation: `Review ${status.status} leads - ${Math.round((withSignals/status.count)*100)}% have buyer signals`
                    });
                }
            }

            results.recommendations.push({
                priority: 'HIGH',
                issue: `Disqualification rate is ${results.disqualifiedAnalysis.rate}% (threshold: ${this.thresholds.maxDisqualificationRate}%)`,
                action: 'Review qualification criteria - may be over-disqualifying leads with valid buyer intent'
            });
        }

        return results;
    }

    /**
     * Run full data quality validation
     * @returns {Object} Complete validation results
     */
    async validate() {
        console.log('═'.repeat(60));
        console.log('  LEAD DATA QUALITY VALIDATION');
        console.log('═'.repeat(60));
        console.log(`\nTarget Org: ${this.orgAlias || 'Not specified'}\n`);

        if (!this.orgAlias) {
            return {
                success: false,
                error: 'Org alias is required',
                usage: 'node lead-data-quality-validator.js --org <alias>'
            };
        }

        const results = {
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            fieldPopulation: await this.analyzeFieldPopulation(),
            sourceAttribution: await this.analyzeSourceAttribution(),
            qualificationStatus: await this.analyzeQualificationStatus(),
            stats: this.stats,
            overallHealth: 'UNKNOWN'
        };

        // Calculate overall health score
        results.overallHealth = this.calculateHealthScore(results);

        // Print summary
        this.printSummary(results);

        return results;
    }

    /**
     * Determine if a field is critical for business operations
     */
    isCriticalField(field) {
        const criticalFields = [
            'AnnualRevenue',
            'NumberOfEmployees',
            'LeadSource',
            'Email',
            'Company'
        ];
        return criticalFields.includes(field);
    }

    /**
     * Get population status based on rate
     */
    getPopulationStatus(rate, field) {
        if (rate === 0) return 'EMPTY';
        if (rate < 25) return 'CRITICAL';
        if (rate < 50) return 'LOW';
        if (rate < 75) return 'MODERATE';
        return 'HEALTHY';
    }

    /**
     * Get business impact description for a field
     */
    getFieldImpact(field) {
        const impacts = {
            'AnnualRevenue': 'Cannot segment by company size or prioritize high-value prospects',
            'NumberOfEmployees': 'Cannot assess company scale for targeting',
            'LeadSource': 'Cannot attribute marketing ROI or optimize channels',
            'Industry': 'Cannot perform industry-based segmentation or targeting',
            'Email': 'Cannot conduct email outreach or nurture campaigns',
            'Phone': 'Cannot perform phone-based sales outreach',
            'Company': 'Cannot identify or research the prospect organization',
            'Title': 'Cannot assess seniority or role fit'
        };
        return impacts[field] || 'May impact data-driven decision making';
    }

    /**
     * Generate recommendations based on analysis
     */
    generateRecommendations(results) {
        const recommendations = [];

        for (const gap of results.criticalGaps) {
            recommendations.push({
                priority: gap.severity === 'CRITICAL' ? 'P0' : 'P1',
                field: gap.field,
                issue: `${gap.field} has ${gap.populationRate}% population rate`,
                impact: gap.impact,
                actions: this.getFieldActions(gap.field)
            });
        }

        return recommendations;
    }

    /**
     * Get recommended actions to fix field population
     */
    getFieldActions(field) {
        const actions = {
            'AnnualRevenue': [
                'Integrate with data enrichment service (ZoomInfo, Clearbit, Apollo)',
                'Add AnnualRevenue to web forms where appropriate',
                'Create enrichment workflow to populate from Company data'
            ],
            'LeadSource': [
                'Audit all lead capture points (forms, imports, integrations)',
                'Configure marketing automation to pass LeadSource on sync',
                'Add default LeadSource values for manual entry'
            ],
            'NumberOfEmployees': [
                'Enable data enrichment integration',
                'Add to web forms as optional field',
                'Create batch enrichment job for existing leads'
            ]
        };
        return actions[field] || [
            'Review data capture points for this field',
            'Consider data enrichment options',
            'Audit integrations that should populate this field'
        ];
    }

    /**
     * Calculate overall health score
     */
    calculateHealthScore(results) {
        let score = 100;

        // Deduct for critical gaps
        score -= results.fieldPopulation.criticalGaps.length * 15;

        // Deduct for low attribution
        if (results.sourceAttribution.attributionRate < this.thresholds.minSourceAttribution) {
            score -= 20;
        }

        // Deduct for over-disqualification
        if (results.qualificationStatus.disqualifiedAnalysis.rate > this.thresholds.maxDisqualificationRate) {
            score -= 15;
        }

        if (score >= 80) return 'HEALTHY';
        if (score >= 60) return 'MODERATE';
        if (score >= 40) return 'AT_RISK';
        return 'CRITICAL';
    }

    /**
     * Print validation summary
     */
    printSummary(results) {
        console.log('\n' + '─'.repeat(60));
        console.log('  VALIDATION SUMMARY');
        console.log('─'.repeat(60));

        console.log(`\nOverall Health: ${results.overallHealth}`);
        console.log(`Fields Analyzed: ${this.stats.fieldsAnalyzed}`);
        console.log(`Issues Found: ${this.stats.issuesFound}`);
        console.log(`Critical Issues: ${this.stats.criticalIssues}`);

        if (results.fieldPopulation.criticalGaps.length > 0) {
            console.log('\n⚠️  Critical Field Gaps:');
            for (const gap of results.fieldPopulation.criticalGaps) {
                console.log(`   • ${gap.field}: ${gap.populationRate}% populated (${gap.severity})`);
            }
        }

        if (results.sourceAttribution.attributionRate < this.thresholds.minSourceAttribution) {
            console.log(`\n⚠️  Lead Source Attribution: ${results.sourceAttribution.attributionRate}% (below ${this.thresholds.minSourceAttribution}% threshold)`);
        }

        if (results.qualificationStatus.potentialOverDisqualification.length > 0) {
            console.log('\n⚠️  Potential Over-Disqualification:');
            for (const item of results.qualificationStatus.potentialOverDisqualification) {
                console.log(`   • ${item.status}: ${item.count} leads, ${item.withBuyerSignals} with buyer signals`);
            }
        }

        console.log('\n' + '═'.repeat(60));
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        orgAlias: null,
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--org':
            case '-o':
                options.orgAlias = args[++i];
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Lead Data Quality Validator

Usage:
  node lead-data-quality-validator.js --org <alias> [options]

Options:
  --org, -o <alias>    Target Salesforce org alias (required)
  --verbose, -v        Enable verbose output
  --help, -h           Show this help

Examples:
  node lead-data-quality-validator.js --org myorg
  node lead-data-quality-validator.js --org production --verbose

Output:
  Analyzes Lead object data quality including:
  - Field population rates
  - Lead source attribution
  - Qualification status distribution
  - Recommendations for improvement
                `);
                process.exit(0);
        }
    }

    const validator = new LeadDataQualityValidator(options);
    validator.validate()
        .then(results => {
            if (results.stats.criticalIssues > 0) {
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Validation failed:', error.message);
            process.exit(1);
        });
}

module.exports = { LeadDataQualityValidator };
