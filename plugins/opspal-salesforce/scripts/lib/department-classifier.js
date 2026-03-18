#!/usr/bin/env node

/**
 * Department Classifier for Reports & Dashboards
 *
 * Classifies reports and dashboards by department using multi-factor heuristics:
 * - Folder name keywords
 * - Field types (Opportunity → Sales, Campaign → Marketing, etc.)
 * - Owner profile/role/department
 * - Report type inference
 *
 * Usage:
 *   node department-classifier.js --input <usage-metrics.json> --output <department-classification.json>
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs').promises;
const path = require('path');

// Department classification rules
const DEPARTMENT_RULES = {
    // Folder name keywords (40% weight)
    folderKeywords: {
        Sales: ['sales', 'pipeline', 'quota', 'opportunity', 'opps', 'revenue', 'forecast', 'booking', 'deal'],
        Marketing: ['marketing', 'campaign', 'lead', 'mql', 'sql', 'demand', 'acquisition', 'funnel', 'conversion'],
        Support: ['support', 'case', 'ticket', 'service', 'helpdesk', 'incident', 'escalation'],
        'Customer Success': ['success', 'cs', 'renewal', 'churn', 'health', 'nps', 'csat', 'retention', 'adoption'],
        Finance: ['finance', 'accounting', 'ar', 'ap', 'billing', 'invoice', 'payment', 'revenue ops'],
        Executive: ['executive', 'board', 'ceo', 'cfo', 'cro', 'leadership', 'c-level', 'company'],
        Operations: ['operations', 'ops', 'admin', 'system', 'data', 'quality', 'governance']
    },

    // Report type keywords (10% weight)
    reportTypeKeywords: {
        Sales: ['opportunity', 'quote', 'contract', 'order'],
        Marketing: ['campaign', 'lead'],
        Support: ['case', 'solution', 'article'],
        'Customer Success': ['account', 'contact', 'renewal']
    },

    // Field keywords (30% weight) - inferred from report type or fields
    fieldKeywords: {
        Sales: ['amount', 'closeddate', 'stage', 'probability', 'forecastcategory', 'quota', 'booking'],
        Marketing: ['campaignmember', 'leadstatus', 'leadsource', 'mql', 'sql', 'attribution'],
        Support: ['casestatus', 'priority', 'escalated', 'sla', 'resolution'],
        'Customer Success': ['health', 'renewal', 'churn', 'nps', 'csat', 'adoption', 'expansion']
    },

    // Profile/Role keywords (20% weight)
    ownerKeywords: {
        Sales: ['sales', 'account executive', 'ae', 'sdr', 'bdr', 'sales dev', 'vp sales', 'cro'],
        Marketing: ['marketing', 'demand gen', 'content', 'digital', 'growth', 'vp marketing', 'cmo'],
        Support: ['support', 'service', 'agent', 'specialist', 'vp service'],
        'Customer Success': ['success', 'csm', 'customer success manager', 'vp customer success'],
        Finance: ['finance', 'accounting', 'controller', 'cfo'],
        Executive: ['ceo', 'cfo', 'cro', 'coo', 'president', 'executive', 'board'],
        Operations: ['operations', 'system admin', 'salesforce admin', 'ops']
    }
};

const WEIGHTS = {
    folderName: 0.40,
    reportType: 0.10,
    fields: 0.30,
    owner: 0.20
};

class DepartmentClassifier {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
        this.usageMetrics = null;
        this.classifications = {
            reports: [],
            dashboards: [],
            summary: {}
        };
    }

    /**
     * Load usage metrics JSON
     */
    async loadUsageMetrics() {
        console.log(`\n📖 Loading usage metrics from ${this.inputPath}...`);
        const data = await fs.readFile(this.inputPath, 'utf8');
        this.usageMetrics = JSON.parse(data);
        console.log(`✓ Loaded ${this.usageMetrics.reports.length} reports and ${this.usageMetrics.dashboards.length} dashboards`);
    }

    /**
     * Classify text against department keywords
     */
    classifyByKeywords(text, keywords, weight) {
        // Handle null, undefined, non-string types
        if (!text || typeof text !== 'string') return {};

        const lowerText = text.toLowerCase();
        const scores = {};

        for (const [dept, words] of Object.entries(keywords)) {
            const matches = words.filter(word => lowerText.includes(word));
            if (matches.length > 0) {
                scores[dept] = (matches.length / words.length) * weight;
            }
        }

        return scores;
    }

    /**
     * Classify a single report
     */
    classifyReport(report) {
        const scores = {};

        // Factor 1: Folder name (40% weight)
        const folderScores = this.classifyByKeywords(
            report.folderName,
            DEPARTMENT_RULES.folderKeywords,
            WEIGHTS.folderName
        );
        this.mergeScores(scores, folderScores);

        // Factor 2: Report type (10% weight) - from metadata if available
        const reportMetadata = this.usageMetrics.reportFieldMetadata[report.id];
        if (reportMetadata && reportMetadata.reportType) {
            const reportTypeScores = this.classifyByKeywords(
                reportMetadata.reportType,
                DEPARTMENT_RULES.reportTypeKeywords,
                WEIGHTS.reportType
            );
            this.mergeScores(scores, reportTypeScores);
        }

        // Factor 3: Fields (30% weight) - from metadata if available
        if (reportMetadata && reportMetadata.detailColumns) {
            // Ensure detailColumns is an array
            const columns = Array.isArray(reportMetadata.detailColumns)
                ? reportMetadata.detailColumns
                : [];
            const fieldsText = columns.join(' ');
            const fieldScores = this.classifyByKeywords(
                fieldsText,
                DEPARTMENT_RULES.fieldKeywords,
                WEIGHTS.fields
            );
            this.mergeScores(scores, fieldScores);
        }

        // Factor 4: Owner profile/role/department (20% weight)
        const ownerText = [
            report.ownerProfile,
            report.ownerRole,
            report.ownerDepartment,
            report.name  // Include report name as fallback
        ].join(' ');
        const ownerScores = this.classifyByKeywords(
            ownerText,
            DEPARTMENT_RULES.ownerKeywords,
            WEIGHTS.owner
        );
        this.mergeScores(scores, ownerScores);

        // Determine final classification
        const classification = this.selectTopDepartment(scores);

        return {
            id: report.id,
            name: report.name,
            department: classification.department,
            confidence: classification.confidence,
            scores: scores
        };
    }

    /**
     * Classify a single dashboard
     */
    classifyDashboard(dashboard) {
        const scores = {};

        // Factor 1: Folder name (40% weight)
        const folderScores = this.classifyByKeywords(
            dashboard.folderName,
            DEPARTMENT_RULES.folderKeywords,
            WEIGHTS.folderName
        );
        this.mergeScores(scores, folderScores);

        // Factor 2: Dashboard title (30% weight - similar to fields weight)
        const titleScores = this.classifyByKeywords(
            dashboard.title,
            DEPARTMENT_RULES.folderKeywords,  // Reuse folder keywords for title
            0.30
        );
        this.mergeScores(scores, titleScores);

        // Factor 3: Component reports (30% weight) - average department of component reports
        if (dashboard.componentReports && dashboard.componentReports.length > 0) {
            const componentDepts = {};
            dashboard.componentReports.forEach(reportId => {
                const reportClassification = this.classifications.reports.find(r => r.id === reportId);
                if (reportClassification && reportClassification.department !== 'Unknown') {
                    componentDepts[reportClassification.department] =
                        (componentDepts[reportClassification.department] || 0) + 1;
                }
            });

            // Convert counts to scores
            const totalComponents = Object.values(componentDepts).reduce((a, b) => a + b, 0);
            for (const [dept, count] of Object.entries(componentDepts)) {
                scores[dept] = (scores[dept] || 0) + (count / totalComponents) * 0.30;
            }
        }

        // Determine final classification
        const classification = this.selectTopDepartment(scores);

        return {
            id: dashboard.id,
            title: dashboard.title,
            department: classification.department,
            confidence: classification.confidence,
            scores: scores
        };
    }

    /**
     * Merge scores from multiple factors
     */
    mergeScores(target, source) {
        for (const [dept, score] of Object.entries(source)) {
            target[dept] = (target[dept] || 0) + score;
        }
    }

    /**
     * Select department with highest score
     */
    selectTopDepartment(scores) {
        if (Object.keys(scores).length === 0) {
            return { department: 'Unknown', confidence: 0.0 };
        }

        const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const [department, score] = entries[0];

        // Normalize confidence to 0.0-1.0 (max possible score is 1.0)
        const confidence = Math.min(score, 1.0);

        return { department, confidence };
    }

    /**
     * Classify all reports and dashboards
     */
    async classify() {
        console.log('\n🏢 Classifying reports and dashboards by department...');

        // Classify reports first (needed for dashboard classification)
        this.usageMetrics.reports.forEach(report => {
            const classification = this.classifyReport(report);
            this.classifications.reports.push(classification);
        });

        // Classify dashboards (uses report classifications)
        this.usageMetrics.dashboards.forEach(dashboard => {
            const classification = this.classifyDashboard(dashboard);
            this.classifications.dashboards.push(classification);
        });

        // Generate summary by department
        this.generateSummary();

        console.log(`✓ Classified ${this.classifications.reports.length} reports`);
        console.log(`✓ Classified ${this.classifications.dashboards.length} dashboards`);
    }

    /**
     * Generate summary statistics by department
     */
    generateSummary() {
        const summary = {};

        // Count reports by department
        this.classifications.reports.forEach(r => {
            if (!summary[r.department]) {
                summary[r.department] = {
                    department: r.department,
                    totalReports: 0,
                    activeReports: 0,
                    totalDashboards: 0,
                    activeDashboards: 0,
                    avgConfidence: 0,
                    confidenceSum: 0
                };
            }

            const report = this.usageMetrics.reports.find(rep => rep.id === r.id);
            summary[r.department].totalReports++;
            if (report && report.isActive) {
                summary[r.department].activeReports++;
            }
            summary[r.department].confidenceSum += r.confidence;
        });

        // Count dashboards by department
        this.classifications.dashboards.forEach(d => {
            if (!summary[d.department]) {
                summary[d.department] = {
                    department: d.department,
                    totalReports: 0,
                    activeReports: 0,
                    totalDashboards: 0,
                    activeDashboards: 0,
                    avgConfidence: 0,
                    confidenceSum: 0
                };
            }

            const dashboard = this.usageMetrics.dashboards.find(dash => dash.id === d.id);
            summary[d.department].totalDashboards++;
            if (dashboard && dashboard.isActive) {
                summary[d.department].activeDashboards++;
            }
            summary[d.department].confidenceSum += d.confidence;
        });

        // Calculate average confidence
        for (const dept of Object.values(summary)) {
            const totalItems = dept.totalReports + dept.totalDashboards;
            dept.avgConfidence = totalItems > 0
                ? (dept.confidenceSum / totalItems).toFixed(2)
                : 0;
            delete dept.confidenceSum;  // Remove intermediate value
        }

        this.classifications.summary = summary;
    }

    /**
     * Save classification results
     */
    async saveClassifications() {
        console.log(`\n💾 Saving classifications to ${this.outputPath}...`);

        const output = {
            metadata: {
                inputFile: this.inputPath,
                generatedDate: new Date().toISOString(),
                generatedBy: 'department-classifier.js v1.0.0',
                orgAlias: this.usageMetrics.metadata.orgAlias
            },
            weights: WEIGHTS,
            classifications: this.classifications
        };

        await fs.writeFile(this.outputPath, JSON.stringify(output, null, 2));
        console.log(`✓ Saved classifications`);

        // Print summary
        console.log(`\n📊 Department Summary:`);
        const summaryArray = Object.values(this.classifications.summary)
            .sort((a, b) => b.totalReports - a.totalReports);

        summaryArray.forEach(dept => {
            console.log(`  ${dept.department}: ${dept.totalReports} reports (${dept.activeReports} active), ${dept.totalDashboards} dashboards (${dept.activeDashboards} active), confidence: ${dept.avgConfidence}`);
        });
    }

    /**
     * Execute full classification workflow
     */
    async execute() {
        console.log(`\n🏢 Department Classifier for Reports & Dashboards`);

        try {
            await this.loadUsageMetrics();
            await this.classify();
            await this.saveClassifications();

            console.log(`\n✅ Classification complete!`);
            return this.outputPath;
        } catch (error) {
            console.error(`\n❌ Classification failed: ${error.message}`);
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
        console.error('Usage: node department-classifier.js --input <usage-metrics.json> --output <department-classification.json>');
        process.exit(1);
    }

    (async () => {
        try {
            const classifier = new DepartmentClassifier(options.input, options.output);
            await classifier.execute();
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = DepartmentClassifier;
