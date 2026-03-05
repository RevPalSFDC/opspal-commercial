#!/usr/bin/env node

/**
 * Remediation Plan Generator
 *
 * Generates comprehensive markdown reports from field collision analysis.
 * Produces two key deliverables:
 * 1. FIELD_COLLISION_ANALYSIS.md - Technical deep-dive with detailed collision info
 * 2. PRIORITIZED_REMEDIATION_PLAN.md - Sprint-by-sprint implementation roadmap
 *
 * Features:
 * - Executive summaries with key metrics
 * - Detailed collision breakdowns with business context
 * - Sprint planning with goals, capacity, and timelines
 * - Quick wins identification
 * - Implementation guidelines and success criteria
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

const fs = require('fs');
const path = require('path');

class RemediationPlanGenerator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.orgName = options.orgName || 'Salesforce Org';
        this.auditDate = options.auditDate || new Date().toISOString().split('T')[0];
    }

    /**
     * Generate both reports
     * @param {Object} analysisResults - Results from FieldCollisionAnalyzer
     * @param {Object} sprintPlan - Results from PrioritizationEngine
     * @returns {Object} {analysisReport, remediationPlan}
     */
    generateReports(analysisResults, sprintPlan) {
        const analysisReport = this.generateCollisionAnalysis(analysisResults);
        const remediationPlan = this.generateRemediationPlan(analysisResults, sprintPlan);

        return {
            analysisReport,
            remediationPlan
        };
    }

    /**
     * Generate FIELD_COLLISION_ANALYSIS.md
     * @param {Object} analysisResults - Results from FieldCollisionAnalyzer
     * @returns {string} Markdown report
     */
    generateCollisionAnalysis(analysisResults) {
        let md = '';

        // Header
        md += this.renderHeader('Field Collision Analysis', this.orgName, this.auditDate);

        // Executive Summary
        md += this.renderAnalysisExecutiveSummary(analysisResults);

        // Top 10 Collisions
        md += this.renderTopCollisions(analysisResults);

        // Statistics
        md += this.renderStatistics(analysisResults);

        // Detailed Findings
        md += this.renderDetailedFindings(analysisResults);

        // Appendix
        md += this.renderAnalysisAppendix();

        return md;
    }

    /**
     * Generate PRIORITIZED_REMEDIATION_PLAN.md
     * @param {Object} analysisResults - Results from FieldCollisionAnalyzer
     * @param {Object} sprintPlan - Results from PrioritizationEngine
     * @returns {string} Markdown report
     */
    generateRemediationPlan(analysisResults, sprintPlan) {
        let md = '';

        // Header
        md += this.renderHeader('Prioritized Remediation Plan', this.orgName, this.auditDate);

        // Executive Summary
        md += this.renderPlanExecutiveSummary(sprintPlan);

        // Quick Wins
        md += this.renderQuickWins(sprintPlan);

        // Sprint Details
        md += this.renderSprintPlanning(sprintPlan, analysisResults);

        // Implementation Timeline
        md += this.renderTimeline(sprintPlan);

        // Implementation Guidelines
        md += this.renderImplementationGuidelines();

        // Appendix
        md += this.renderPlanAppendix();

        return md;
    }

    // ========================================
    // ANALYSIS REPORT SECTIONS
    // ========================================

    /**
     * Render analysis executive summary
     */
    renderAnalysisExecutiveSummary(analysisResults) {
        const { totalCollisions, criticalCollisions, highCollisions } = analysisResults;

        let md = '## Executive Summary\n\n';
        md += `This report analyzes **${totalCollisions} field-level automation collisions** detected in ${this.orgName}.\n\n`;

        md += '### Key Findings\n\n';
        md += '| Metric | Count | Percentage |\n';
        md += '|--------|-------|------------|\n';
        md += `| Total Collisions | ${totalCollisions} | 100% |\n`;
        md += `| 🔴 CRITICAL | ${criticalCollisions} | ${this.percent(criticalCollisions, totalCollisions)}% |\n`;
        md += `| 🟠 HIGH | ${highCollisions} | ${this.percent(highCollisions, totalCollisions)}% |\n`;
        md += `| 🟡 MEDIUM | ${totalCollisions - criticalCollisions - highCollisions} | ${this.percent(totalCollisions - criticalCollisions - highCollisions, totalCollisions)}% |\n\n`;

        md += '### Impact\n\n';
        if (criticalCollisions > 0) {
            md += `⚠️ **${criticalCollisions} CRITICAL collision(s)** create data corruption risk. Multiple automations writing to the same field can cause unpredictable "last write wins" behavior.\n\n`;
        }
        if (highCollisions > 0) {
            md += `⚡ **${highCollisions} HIGH-severity collision(s)** may cause race conditions and intermittent data inconsistencies.\n\n`;
        }

        md += '### Recommendation\n\n';
        md += 'Prioritize remediation of CRITICAL collisions in the first sprint. See **PRIORITIZED_REMEDIATION_PLAN.md** for detailed implementation roadmap.\n\n';

        md += '---\n\n';
        return md;
    }

    /**
     * Render top collisions
     */
    renderTopCollisions(analysisResults) {
        const topCollisions = analysisResults.topCollisions || [];

        let md = '## Top 10 Field Collisions by Business Impact\n\n';
        md += 'Ranked by priority score (severity + automation count + field criticality + business impact - complexity).\n\n';

        if (topCollisions.length === 0) {
            md += '_No field collisions detected._\n\n';
            return md;
        }

        topCollisions.forEach((collision, index) => {
            const rank = index + 1;
            const field = collision.field || 'Unknown';
            const object = collision.object || 'Unknown';
            const severity = collision.severity || 'UNKNOWN';
            const collisionType = collision.collisionCategory?.collisionType || 'UNKNOWN';
            const priorityScore = collision.priorityScore || 0;
            const automationCount = collision.involved?.length || 0;

            md += `### ${rank}. ${object}.${field}\n\n`;
            md += `${this.renderSeverityBadge(severity)} **Priority Score: ${priorityScore}**\n\n`;
            md += `- **Collision Type**: ${collisionType}\n`;
            md += `- **Automations Involved**: ${automationCount}\n`;
            md += `- **Field**: \`${field}\`\n`;
            md += `- **Object**: \`${object}\`\n\n`;

            md += '**Impact**: ';
            const category = collision.collisionCategory;
            if (category && category.severityJustification) {
                md += category.severityJustification + '\n\n';
            } else {
                md += 'Multiple automations accessing this field may cause data inconsistencies.\n\n';
            }
        });

        md += '---\n\n';
        return md;
    }

    /**
     * Render statistics
     */
    renderStatistics(analysisResults) {
        const allCollisions = analysisResults.allCollisions || [];

        let md = '## Statistics\n\n';

        // By Object
        const byObject = this.groupBy(allCollisions, 'object');
        md += '### By Object\n\n';
        md += '| Object | Collisions | CRITICAL | HIGH | MEDIUM |\n';
        md += '|--------|------------|----------|------|--------|\n';
        Object.keys(byObject).sort((a, b) => byObject[b].length - byObject[a].length).forEach(obj => {
            const collisions = byObject[obj];
            const critical = collisions.filter(c => c.severity === 'CRITICAL').length;
            const high = collisions.filter(c => c.severity === 'HIGH').length;
            const medium = collisions.filter(c => c.severity === 'MEDIUM').length;
            md += `| ${obj} | ${collisions.length} | ${critical} | ${high} | ${medium} |\n`;
        });
        md += '\n';

        // By Collision Type
        const byType = this.groupBy(allCollisions, c => c.collisionCategory?.collisionType || 'UNKNOWN');
        md += '### By Collision Type\n\n';
        md += '| Collision Type | Count | Description |\n';
        md += '|----------------|-------|-------------|\n';
        Object.keys(byType).sort((a, b) => byType[b].length - byType[a].length).forEach(type => {
            const count = byType[type].length;
            const desc = this.getCollisionTypeDescription(type);
            md += `| ${type} | ${count} | ${desc} |\n`;
        });
        md += '\n';

        md += '---\n\n';
        return md;
    }

    /**
     * Render detailed findings
     */
    renderDetailedFindings(analysisResults) {
        const allCollisions = analysisResults.allCollisions || [];

        let md = '## Detailed Findings\n\n';
        md += `This section provides comprehensive details for all ${allCollisions.length} field collisions.\n\n`;

        // Group by severity
        const critical = allCollisions.filter(c => c.severity === 'CRITICAL');
        const high = allCollisions.filter(c => c.severity === 'HIGH');
        const medium = allCollisions.filter(c => c.severity === 'MEDIUM');
        const low = allCollisions.filter(c => c.severity === 'LOW');

        if (critical.length > 0) {
            md += '### 🔴 CRITICAL Collisions\n\n';
            critical.forEach(c => {
                md += this.renderCollisionDetail(c);
            });
        }

        if (high.length > 0) {
            md += '### 🟠 HIGH Collisions\n\n';
            high.forEach(c => {
                md += this.renderCollisionDetail(c);
            });
        }

        if (medium.length > 0) {
            md += '### 🟡 MEDIUM Collisions\n\n';
            medium.forEach(c => {
                md += this.renderCollisionDetail(c);
            });
        }

        if (low.length > 0) {
            md += '### 🔵 LOW Collisions\n\n';
            low.forEach(c => {
                md += this.renderCollisionDetail(c);
            });
        }

        return md;
    }

    /**
     * Render collision detail
     */
    renderCollisionDetail(collision) {
        const field = collision.field || 'Unknown';
        const object = collision.object || 'Unknown';
        const category = collision.collisionCategory || {};
        const involved = collision.involved || [];

        let md = `#### ${object}.${field}\n\n`;
        md += `**Collision ID**: \`${collision.conflictId}\`\n\n`;
        md += `- **Type**: ${category.collisionType || 'UNKNOWN'}\n`;
        md += `- **Severity**: ${this.renderSeverityBadge(collision.severity)}\n`;
        md += `- **Priority Score**: ${collision.priorityScore || 'N/A'}\n`;
        md += `- **Write Count**: ${category.writeCount || 0}\n`;
        md += `- **Read Count**: ${category.readCount || 0}\n\n`;

        md += '**Involved Automations**:\n\n';
        involved.forEach(auto => {
            md += `- ${auto.type}: \`${auto.name}\` (${auto.id})\n`;
        });
        md += '\n';

        if (category.operationBreakdown && category.operationBreakdown.length > 0) {
            md += '**Operation Breakdown**:\n\n';
            md += '| Automation | Operation | Context |\n';
            md += '|------------|-----------|--------|\n';
            category.operationBreakdown.forEach(op => {
                md += `| ${op.automation} | ${op.operation} | ${op.context || 'N/A'} |\n`;
            });
            md += '\n';
        }

        // Field Write Details (NEW in v3.25.1 - includes execution context and conditions)
        if (collision.fieldWriteDetails && collision.fieldWriteDetails.length > 0) {
            md += '**Execution Details**:\n\n';
            md += '| Automation | Trigger Context | Write Type | Condition | Formula |\n';
            md += '|------------|-----------------|------------|-----------|----------|\n';
            collision.fieldWriteDetails.forEach(detail => {
                const context = detail.executionContext || 'N/A';
                const writeType = detail.writeType || 'N/A';
                const condition = detail.writeCondition || '-';
                const formula = detail.writeFormula || '-';
                md += `| ${detail.automationName} | ${context} | ${writeType} | ${condition} | ${formula} |\n`;
            });
            md += '\n';
        }

        if (collision.recommendation) {
            md += '**Recommended Approach**: ' + (collision.recommendation.approach || 'Review and consolidate') + '\n\n';
        }

        md += '---\n\n';
        return md;
    }

    /**
     * Render analysis appendix
     */
    renderAnalysisAppendix() {
        let md = '## Appendix: Understanding Field Collisions\n\n';

        md += '### Collision Types\n\n';
        md += '| Type | Description | Risk Level |\n';
        md += '|------|-------------|------------|\n';
        md += '| WRITE_WRITE | Multiple automations write to same field | 🔴 CRITICAL |\n';
        md += '| READ_WRITE | Mix of reads and writes on same field | 🟠 HIGH |\n';
        md += '| READ_WRITE_SINGLE | Single automation both reads and writes | 🟡 MEDIUM |\n';
        md += '| READ_READ | Multiple automations read same field | 🔵 LOW |\n';
        md += '| UNKNOWN | Unclear collision pattern | 🟡 MEDIUM |\n\n';

        md += '### Priority Scoring\n\n';
        md += 'Priority scores combine multiple factors:\n\n';
        md += '- **Severity**: CRITICAL (100 pts), HIGH (50 pts), MEDIUM (20 pts), LOW (5 pts)\n';
        md += '- **Automation Count**: 10 points per automation involved\n';
        md += '- **Field Criticality**: Based on field importance (e.g., OwnerId = 50 pts)\n';
        md += '- **Business Impact**: Based on object (e.g., Opportunity = 50 pts)\n';
        md += '- **Complexity Penalty**: Reduces priority for complex fixes\n\n';

        md += '---\n\n';
        return md;
    }

    // ========================================
    // REMEDIATION PLAN SECTIONS
    // ========================================

    /**
     * Render plan executive summary
     */
    renderPlanExecutiveSummary(sprintPlan) {
        const summary = sprintPlan.summary || {};

        let md = '## Executive Summary\n\n';
        md += `This plan prioritizes **${summary.totalCollisions} field collision(s)** into **${summary.totalSprints} sprint(s)** for systematic remediation.\n\n`;

        md += '### Plan Overview\n\n';
        md += '| Metric | Value |\n';
        md += '|--------|-------|\n';
        md += `| Total Collisions | ${summary.totalCollisions} |\n`;
        md += `| Total Effort | ${summary.totalEffort} story points |\n`;
        md += `| Sprint Count | ${summary.totalSprints} |\n`;
        md += `| Estimated Duration | ${summary.estimatedWeeks} weeks (${summary.estimatedMonths} months) |\n`;
        md += `| Average Effort per Collision | ${summary.averageEffortPerCollision} points |\n`;
        md += `| Capacity Utilization | ${summary.capacityUtilization}% |\n\n`;

        md += '### Severity Breakdown\n\n';
        md += '| Severity | Count |\n';
        md += '|----------|-------|\n';
        md += `| 🔴 CRITICAL | ${summary.criticalCollisions} |\n`;
        md += `| 🟠 HIGH | ${summary.highCollisions} |\n`;
        md += `| 🟡 MEDIUM | ${summary.mediumCollisions} |\n`;
        md += `| 🔵 LOW | ${summary.lowCollisions} |\n\n`;

        md += '---\n\n';
        return md;
    }

    /**
     * Render quick wins
     */
    renderQuickWins(sprintPlan) {
        const quickWins = sprintPlan.summary?.quickWins || [];

        let md = '## Quick Wins 🎯\n\n';
        md += 'These high-impact, low-effort collisions should be prioritized for early resolution:\n\n';

        if (quickWins.length === 0) {
            md += '_No quick wins identified._\n\n';
            md += '---\n\n';
            return md;
        }

        md += '| Rank | Field | Object | Severity | Effort | Priority Score |\n';
        md += '|------|-------|--------|----------|--------|----------------|\n';
        quickWins.forEach((qw, index) => {
            md += `| ${index + 1} | ${qw.field} | ${qw.object} | ${this.renderSeverityBadge(qw.severity)} | ${qw.effort} pts | ${qw.priorityScore} |\n`;
        });
        md += '\n';

        md += '**Recommendation**: Address these quick wins in the first 1-2 weeks to build momentum and demonstrate early value.\n\n';

        md += '---\n\n';
        return md;
    }

    /**
     * Render sprint planning
     */
    renderSprintPlanning(sprintPlan, analysisResults) {
        const sprints = sprintPlan.sprints || [];

        let md = '## Sprint Planning\n\n';
        md += 'Detailed breakdown of each sprint with goals, collisions, and capacity planning.\n\n';

        sprints.forEach(sprint => {
            md += this.renderSprintDetail(sprint, analysisResults);
        });

        return md;
    }

    /**
     * Render sprint detail
     */
    renderSprintDetail(sprint, analysisResults) {
        let md = `### ${sprint.name}\n\n`;

        md += '**Overview**:\n\n';
        md += '| Metric | Value |\n';
        md += '|--------|-------|\n';
        md += `| Risk Level | ${this.renderRiskBadge(sprint.riskLevel)} |\n`;
        md += `| Total Effort | ${sprint.totalEffort} story points |\n`;
        md += `| Capacity Utilization | ${sprint.capacityUtilization}% |\n`;
        md += `| Collisions | ${sprint.collisions.length} |\n`;
        md += `| Objects | ${sprint.objects.join(', ')} |\n\n`;

        md += '**Goals**:\n\n';
        sprint.goals.forEach(goal => {
            md += `- ${goal}\n`;
        });
        md += '\n';

        if (sprint.dependencies && sprint.dependencies.length > 0) {
            md += '**Dependencies**:\n\n';
            sprint.dependencies.forEach(dep => {
                md += `- ⚠️ ${dep}\n`;
            });
            md += '\n';
        }

        md += '**Collisions to Remediate**:\n\n';
        md += '| Rank | Field | Object | Severity | Effort | Type |\n';
        md += '|------|-------|--------|----------|--------|------|\n';
        sprint.collisions.forEach(collision => {
            const field = collision.field || 'Unknown';
            const object = collision.object || 'Unknown';
            const severity = collision.severity || 'UNKNOWN';
            const effort = collision.estimatedEffort || 'N/A';
            const type = collision.collisionCategory?.collisionType || 'UNKNOWN';
            const rank = collision.ranking || '-';

            md += `| ${rank} | ${field} | ${object} | ${this.renderSeverityBadge(severity)} | ${effort} pts | ${type} |\n`;
        });
        md += '\n';

        md += '---\n\n';
        return md;
    }

    /**
     * Render timeline
     */
    renderTimeline(sprintPlan) {
        const sprints = sprintPlan.sprints || [];

        let md = '## Implementation Timeline\n\n';

        md += 'High-level timeline for remediation work:\n\n';

        md += '| Sprint | Week Range | Goals | Risk |\n';
        md += '|--------|------------|-------|------|\n';

        let weekOffset = 0;
        sprints.forEach(sprint => {
            const startWeek = weekOffset + 1;
            const endWeek = weekOffset + 2; // Assuming 2-week sprints
            const goalsShort = sprint.goals[0] || 'Complete sprint collisions';
            md += `| ${sprint.name} | Week ${startWeek}-${endWeek} | ${goalsShort} | ${this.renderRiskBadge(sprint.riskLevel)} |\n`;
            weekOffset += 2;
        });
        md += '\n';

        md += '---\n\n';
        return md;
    }

    /**
     * Render implementation guidelines
     */
    renderImplementationGuidelines() {
        let md = '## Implementation Guidelines\n\n';

        md += '### General Approach\n\n';
        md += '1. **Analyze Current State**: Review all automations touching the field\n';
        md += '2. **Identify Primary Automation**: Determine which automation should own the write operation\n';
        md += '3. **Consolidate Logic**: Merge other write operations into the primary automation\n';
        md += '4. **Test Thoroughly**: Validate with 200-record bulk operations\n';
        md += '5. **Deploy with Monitoring**: Watch for data anomalies post-deployment\n\n';

        md += '### Collision-Specific Strategies\n\n';
        md += '#### WRITE_WRITE Collisions\n\n';
        md += '- **Strategy**: Consolidate all write logic into single automation\n';
        md += '- **Complexity**: HIGH - Requires careful merge of business logic\n';
        md += '- **Testing**: Critical - Ensure all original logic preserved\n\n';

        md += '#### READ_WRITE Collisions\n\n';
        md += '- **Strategy**: Ensure deterministic execution order OR consolidate\n';
        md += '- **Complexity**: MEDIUM - Sequencing or merging\n';
        md += '- **Testing**: Moderate - Verify field values are correct\n\n';

        md += '#### READ_WRITE_SINGLE Collisions\n\n';
        md += '- **Strategy**: Refactor to separate read and write concerns\n';
        md += '- **Complexity**: LOW - Usually straightforward refactor\n';
        md += '- **Testing**: Standard - Basic functional validation\n\n';

        md += '### Success Criteria\n\n';
        md += 'For each collision remediation:\n\n';
        md += '- ✅ Only one automation writes to the field\n';
        md += '- ✅ Field value is deterministic and predictable\n';
        md += '- ✅ All existing test cases pass\n';
        md += '- ✅ Bulk operations (200 records) complete successfully\n';
        md += '- ✅ Manual testing confirms correct field behavior\n';
        md += '- ✅ Stakeholder sign-off (for CRITICAL collisions)\n\n';

        md += '---\n\n';
        return md;
    }

    /**
     * Render plan appendix
     */
    renderPlanAppendix() {
        let md = '## Appendix: Sprint Planning Methodology\n\n';

        md += '### Capacity Model\n\n';
        md += '- **Sprint Length**: 2 weeks\n';
        md += '- **Team Velocity**: 40 story points per sprint\n';
        md += '- **Buffer**: 20% for unknowns and technical debt\n';
        md += '- **Available Capacity**: 32 story points per sprint\n\n';

        md += '### Effort Estimation\n\n';
        md += '| Collision Type | Base Effort | Notes |\n';
        md += '|----------------|-------------|-------|\n';
        md += '| WRITE_WRITE | 8 points | High effort - careful consolidation required |\n';
        md += '| READ_WRITE | 5 points | Medium effort - sequencing or consolidation |\n';
        md += '| READ_WRITE_SINGLE | 3 points | Low effort - refactor single automation |\n';
        md += '| READ_READ | 2 points | Very low effort - documentation only |\n';
        md += '| UNKNOWN | 5 points | Medium effort - investigation required |\n\n';

        md += '**Multipliers**:\n';
        md += '- Automation count > 3: 1.5x multiplier\n';
        md += '- CRITICAL severity: 1.3x multiplier (extra testing)\n\n';

        md += '### Prioritization Logic\n\n';
        md += '1. **CRITICAL collisions first**: Data corruption risk must be addressed immediately\n';
        md += '2. **Object-based grouping**: Fix all collisions on same object together for efficiency\n';
        md += '3. **Dependency ordering**: Parent objects (Account) before children (Contact)\n';
        md += '4. **Capacity constraints**: Respect sprint velocity and max items per sprint\n\n';

        md += '---\n\n';
        return md;
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Render document header
     */
    renderHeader(title, orgName, date) {
        let md = `# ${title}\n\n`;
        md += `**Organization**: ${orgName}\n\n`;
        md += `**Audit Date**: ${date}\n\n`;
        md += `**Generated**: ${new Date().toISOString()}\n\n`;
        md += '---\n\n';
        return md;
    }

    /**
     * Render severity badge
     */
    renderSeverityBadge(severity) {
        const badges = {
            'CRITICAL': '🔴 CRITICAL',
            'HIGH': '🟠 HIGH',
            'MEDIUM': '🟡 MEDIUM',
            'LOW': '🔵 LOW'
        };
        return badges[severity] || '⚪ UNKNOWN';
    }

    /**
     * Render risk badge
     */
    renderRiskBadge(risk) {
        const badges = {
            'HIGH': '🔴 HIGH',
            'MEDIUM': '🟡 MEDIUM',
            'LOW': '🟢 LOW'
        };
        return badges[risk] || '⚪ UNKNOWN';
    }

    /**
     * Calculate percentage
     */
    percent(value, total) {
        if (total === 0) return 0;
        return Math.round((value / total) * 100);
    }

    /**
     * Group array by property
     */
    groupBy(array, property) {
        return array.reduce((acc, item) => {
            const key = typeof property === 'function' ? property(item) : item[property];
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});
    }

    /**
     * Get collision type description
     */
    getCollisionTypeDescription(type) {
        const descriptions = {
            'WRITE_WRITE': 'Multiple automations writing to same field',
            'READ_WRITE': 'Mix of reads and writes on same field',
            'READ_WRITE_SINGLE': 'Single automation both reads and writes',
            'READ_READ': 'Multiple automations reading same field',
            'UNKNOWN': 'Unclear collision pattern - manual review needed'
        };
        return descriptions[type] || 'Unknown collision pattern';
    }
}

module.exports = RemediationPlanGenerator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node remediation-plan-generator.js <analysis-results.json> <sprint-plan.json> [--org-name "Org"] [--verbose]');
        console.log('');
        console.log('Generates markdown reports from field collision analysis.');
        console.log('');
        console.log('Example:');
        console.log('  node remediation-plan-generator.js analysis.json sprint-plan.json --org-name "gamma-corp"');
        process.exit(1);
    }

    const analysisFile = args[0];
    const sprintFile = args[1];
    const verbose = args.includes('--verbose');

    const orgNameIndex = args.indexOf('--org-name');
    const orgName = orgNameIndex !== -1 && args[orgNameIndex + 1] ? args[orgNameIndex + 1] : 'Salesforce Org';

    if (!fs.existsSync(analysisFile)) {
        console.error(`Error: File not found: ${analysisFile}`);
        process.exit(1);
    }

    if (!fs.existsSync(sprintFile)) {
        console.error(`Error: File not found: ${sprintFile}`);
        process.exit(1);
    }

    const analysisResults = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
    const sprintPlan = JSON.parse(fs.readFileSync(sprintFile, 'utf8'));

    const generator = new RemediationPlanGenerator({ verbose, orgName });
    const reports = generator.generateReports(analysisResults, sprintPlan);

    // Write reports
    const outputDir = path.dirname(analysisFile);
    const analysisPath = path.join(outputDir, 'FIELD_COLLISION_ANALYSIS.md');
    const planPath = path.join(outputDir, 'PRIORITIZED_REMEDIATION_PLAN.md');

    fs.writeFileSync(analysisPath, reports.analysisReport);
    fs.writeFileSync(planPath, reports.remediationPlan);

    console.log('\n=== Reports Generated ===\n');
    console.log(`✓ Analysis: ${analysisPath}`);
    console.log(`✓ Plan: ${planPath}`);
    console.log('');
}
