#!/usr/bin/env node

/**
 * Conflict Report Generator
 *
 * Generates human-readable markdown report from Conflicts.json
 *
 * Features:
 * - Executive summary with severity breakdown
 * - Top objects with most conflicts
 * - Detailed conflict listings by severity
 * - Remediation recommendations
 * - Trigger consolidation suggestions
 *
 * @version 1.0.0
 * @date 2025-10-21
 */

const fs = require('fs');
const path = require('path');

class ConflictReportGenerator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Generate human-readable conflict report
     * @param {Array} conflicts - Conflict data from Conflicts.json
     * @param {string} outputPath - Path to save markdown report
     * @returns {string} Generated markdown content
     */
    generateReport(conflicts, outputPath) {
        if (!Array.isArray(conflicts) || conflicts.length === 0) {
            return this.generateNoConflictsReport(outputPath);
        }

        const report = [];

        // Header
        report.push('# Automation Conflict Analysis Report');
        report.push('');
        report.push(`**Generated**: ${new Date().toISOString()}`);
        report.push(`**Total Conflicts Detected**: ${conflicts.length}`);
        report.push('');
        report.push('---');
        report.push('');

        // Executive Summary
        report.push('## Executive Summary');
        report.push('');
        report.push(this.generateExecutiveSummary(conflicts));
        report.push('');

        // Severity Breakdown
        report.push('## Severity Breakdown');
        report.push('');
        report.push(this.generateSeverityBreakdown(conflicts));
        report.push('');

        // Top Objects
        report.push('## Top Objects with Conflicts');
        report.push('');
        report.push(this.generateTopObjectsTable(conflicts));
        report.push('');

        // Critical Conflicts (detailed)
        const criticalConflicts = conflicts.filter(c => c.severity === 'CRITICAL');
        if (criticalConflicts.length > 0) {
            report.push('## Critical Conflicts (Immediate Action Required)');
            report.push('');
            report.push(this.generateDetailedConflicts(criticalConflicts));
            report.push('');
        }

        // High Priority Conflicts (summary)
        const highConflicts = conflicts.filter(c => c.severity === 'HIGH');
        if (highConflicts.length > 0) {
            report.push('## High-Priority Conflicts (Address Soon)');
            report.push('');
            report.push(this.generateDetailedConflicts(highConflicts));
            report.push('');
        }

        // Medium Priority Conflicts (summary)
        const mediumConflicts = conflicts.filter(c => c.severity === 'MEDIUM');
        if (mediumConflicts.length > 0) {
            report.push('## Medium-Priority Conflicts (Planned Maintenance)');
            report.push('');
            report.push(this.generateSummaryConflicts(mediumConflicts));
            report.push('');
        }

        // Remediation Recommendations
        report.push('## Remediation Recommendations');
        report.push('');
        report.push(this.generateRemediationRecommendations(conflicts));
        report.push('');

        // Trigger Consolidation Opportunities
        report.push('## Trigger Consolidation Opportunities');
        report.push('');
        report.push(this.generateConsolidationOpportunities(conflicts));
        report.push('');

        const markdown = report.join('\n');

        if (outputPath) {
            fs.writeFileSync(outputPath, markdown, 'utf8');
            if (this.verbose) {
                console.log(`✅ Conflict report saved to: ${outputPath}`);
            }
        }

        return markdown;
    }

    /**
     * Generate executive summary
     */
    generateExecutiveSummary(conflicts) {
        const summary = [];

        // Count by severity
        const severityCounts = this.countBySeverity(conflicts);
        const criticalCount = severityCounts.CRITICAL || 0;
        const highCount = severityCounts.HIGH || 0;
        const mediumCount = severityCounts.MEDIUM || 0;

        // Calculate percentages
        const total = conflicts.length;
        const criticalPct = ((criticalCount / total) * 100).toFixed(1);
        const highPct = ((highCount / total) * 100).toFixed(1);
        const mediumPct = ((mediumCount / total) * 100).toFixed(1);

        summary.push(`This Salesforce org has **${total} automation conflicts** requiring attention.`);
        summary.push('');

        if (criticalCount > 0) {
            summary.push(`⚠️ **${criticalCount} CRITICAL conflicts** (${criticalPct}%) require immediate action to prevent data integrity issues and governor limit exceptions.`);
        }

        if (highCount > 0) {
            summary.push(`🔴 **${highCount} HIGH-priority conflicts** (${highPct}%) should be addressed soon to reduce execution order uncertainty and performance risks.`);
        }

        if (mediumCount > 0) {
            summary.push(`🟡 **${mediumCount} MEDIUM-priority conflicts** (${mediumPct}%) can be addressed in planned maintenance windows.`);
        }

        summary.push('');
        summary.push('**Primary Issue**: Multiple Apex triggers on the same object+event combination create undefined execution order, potential race conditions, and increased governor limit consumption.');

        return summary.join('\n');
    }

    /**
     * Generate severity breakdown table
     */
    generateSeverityBreakdown(conflicts) {
        const severityCounts = this.countBySeverity(conflicts);
        const total = conflicts.length;

        const table = [];
        table.push('| Severity | Count | Percentage | Impact | Timeframe |');
        table.push('|----------|-------|------------|--------|-----------|');

        const severities = [
            { level: 'CRITICAL', impact: 'Data integrity risk, governor limit exceptions', timeframe: 'Immediate (1-2 weeks)' },
            { level: 'HIGH', impact: 'Race conditions, performance degradation', timeframe: 'Soon (1-2 months)' },
            { level: 'MEDIUM', impact: 'Execution order uncertainty', timeframe: 'Planned (2-6 months)' },
            { level: 'LOW', impact: 'Minimal risk', timeframe: 'Optional' }
        ];

        severities.forEach(({ level, impact, timeframe }) => {
            const count = severityCounts[level] || 0;
            const pct = count > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%';
            table.push(`| ${level} | ${count} | ${pct} | ${impact} | ${timeframe} |`);
        });

        return table.join('\n');
    }

    /**
     * Generate top objects table
     */
    generateTopObjectsTable(conflicts) {
        // Count conflicts by object
        const objectCounts = {};
        conflicts.forEach(c => {
            objectCounts[c.object] = (objectCounts[c.object] || 0) + 1;
        });

        // Sort by count descending
        const sorted = Object.entries(objectCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15); // Top 15

        const table = [];
        table.push('| Object | Conflicts | Triggers Involved | Highest Severity |');
        table.push('|--------|-----------|-------------------|------------------|');

        sorted.forEach(([object, count]) => {
            const objectConflicts = conflicts.filter(c => c.object === object);
            const triggerCount = this.countUniqueTriggers(objectConflicts);
            const highestSeverity = this.getHighestSeverity(objectConflicts);

            table.push(`| ${object} | ${count} | ${triggerCount} | ${highestSeverity} |`);
        });

        return table.join('\n');
    }

    /**
     * Generate detailed conflict listings
     */
    generateDetailedConflicts(conflicts) {
        const details = [];

        conflicts.forEach((conflict, index) => {
            details.push(`### ${index + 1}. ${conflict.object} - ${conflict.event}`);
            details.push('');
            details.push(`**Severity**: ${conflict.severity}`);
            details.push(`**Conflict ID**: ${conflict.conflictId}`);
            details.push(`**Trigger Count**: ${conflict.triggerCount}`);
            details.push('');

            // Severity rationale
            if (conflict.severityRationale) {
                details.push('**Risk Assessment**:');
                const rationale = conflict.severityRationale;
                if (rationale.reasons && rationale.reasons.length > 0) {
                    rationale.reasons.forEach(reason => {
                        details.push(`- ${reason}`);
                    });
                }
                details.push('');
            }

            // Involved triggers
            details.push('**Involved Triggers**:');
            conflict.involved.forEach(trigger => {
                details.push(`- ${trigger.name} (${trigger.id})`);
            });
            details.push('');

            // Remediation suggestion
            details.push('**Recommended Action**:');
            details.push(this.getRemediationSuggestion(conflict));
            details.push('');
            details.push('---');
            details.push('');
        });

        return details.join('\n');
    }

    /**
     * Generate summary for medium-priority conflicts
     */
    generateSummaryConflicts(conflicts) {
        const summary = [];

        // Group by object
        const byObject = {};
        conflicts.forEach(c => {
            if (!byObject[c.object]) {
                byObject[c.object] = [];
            }
            byObject[c.object].push(c);
        });

        Object.entries(byObject).forEach(([object, objConflicts]) => {
            summary.push(`### ${object} (${objConflicts.length} conflicts)`);
            summary.push('');
            objConflicts.forEach(c => {
                const triggers = c.involved.map(t => t.name).join(', ');
                summary.push(`- **${c.event}**: ${c.triggerCount} triggers (${triggers})`);
            });
            summary.push('');
        });

        return summary.join('\n');
    }

    /**
     * Generate remediation recommendations
     */
    generateRemediationRecommendations(conflicts) {
        const recommendations = [];

        recommendations.push('### General Strategy');
        recommendations.push('');
        recommendations.push('1. **Trigger Consolidation**: Merge multiple triggers into a single trigger per object+event combination');
        recommendations.push('2. **Trigger Handler Pattern**: Implement a trigger handler framework for organized, testable code');
        recommendations.push('3. **Execution Order Control**: Use trigger handler with explicit ordering when consolidation isn\'t immediately feasible');
        recommendations.push('4. **Governor Limit Optimization**: Bulkify operations and reduce SOQL/DML calls');
        recommendations.push('');

        recommendations.push('### Priority-Based Approach');
        recommendations.push('');

        const criticalCount = conflicts.filter(c => c.severity === 'CRITICAL').length;
        if (criticalCount > 0) {
            recommendations.push(`#### Phase 1: Critical Conflicts (${criticalCount} conflicts)`);
            recommendations.push('');
            recommendations.push('**Timeline**: 1-2 weeks');
            recommendations.push('');
            recommendations.push('**Actions**:');
            recommendations.push('- Immediately consolidate triggers on Account, Contact, Lead, Opportunity objects');
            recommendations.push('- Focus on objects with 5+ triggers first');
            recommendations.push('- Implement trigger handler framework for these objects');
            recommendations.push('- Add comprehensive test coverage');
            recommendations.push('');
        }

        const highCount = conflicts.filter(c => c.severity === 'HIGH').length;
        if (highCount > 0) {
            recommendations.push(`#### Phase 2: High-Priority Conflicts (${highCount} conflicts)`);
            recommendations.push('');
            recommendations.push('**Timeline**: 1-2 months');
            recommendations.push('');
            recommendations.push('**Actions**:');
            recommendations.push('- Consolidate triggers on standard objects with 3-4 triggers');
            recommendations.push('- Extend trigger handler framework to these objects');
            recommendations.push('- Review and optimize governor limit consumption');
            recommendations.push('');
        }

        const mediumCount = conflicts.filter(c => c.severity === 'MEDIUM').length;
        if (mediumCount > 0) {
            recommendations.push(`#### Phase 3: Medium-Priority Conflicts (${mediumCount} conflicts)`);
            recommendations.push('');
            recommendations.push('**Timeline**: 2-6 months');
            recommendations.push('');
            recommendations.push('**Actions**:');
            recommendations.push('- Address remaining objects with 2 triggers');
            recommendations.push('- Establish trigger governance policy');
            recommendations.push('- Document trigger execution order for all consolidated triggers');
            recommendations.push('');
        }

        return recommendations.join('\n');
    }

    /**
     * Generate consolidation opportunities
     */
    generateConsolidationOpportunities(conflicts) {
        const opportunities = [];

        // Group conflicts by object to identify consolidation candidates
        const byObject = {};
        conflicts.forEach(c => {
            if (!byObject[c.object]) {
                byObject[c.object] = {
                    conflicts: [],
                    triggers: new Set()
                };
            }
            byObject[c.object].conflicts.push(c);
            c.involved.forEach(t => byObject[c.object].triggers.add(t.name));
        });

        // Sort by number of unique triggers (best consolidation candidates first)
        const sorted = Object.entries(byObject)
            .map(([object, data]) => ({
                object,
                conflictCount: data.conflicts.length,
                triggerCount: data.triggers.size,
                triggers: Array.from(data.triggers)
            }))
            .sort((a, b) => b.triggerCount - a.triggerCount)
            .slice(0, 10);

        opportunities.push('The following objects present the best opportunities for trigger consolidation:');
        opportunities.push('');

        const table = [];
        table.push('| Object | Conflicts | Triggers to Merge | Estimated Effort | Impact |');
        table.push('|--------|-----------|-------------------|------------------|--------|');

        sorted.forEach(({ object, conflictCount, triggerCount, triggers }) => {
            const effort = this.estimateEffort(triggerCount);
            const impact = this.estimateImpact(conflictCount);
            table.push(`| ${object} | ${conflictCount} | ${triggerCount} | ${effort} | ${impact} |`);
        });

        opportunities.push(table.join('\n'));
        opportunities.push('');

        opportunities.push('**Effort Estimates**:');
        opportunities.push('- **Low**: 1-2 days (2-3 triggers, simple logic)');
        opportunities.push('- **Medium**: 3-5 days (4-5 triggers, moderate complexity)');
        opportunities.push('- **High**: 1-2 weeks (6+ triggers, complex logic)');

        return opportunities.join('\n');
    }

    /**
     * Generate "no conflicts" report
     */
    generateNoConflictsReport(outputPath) {
        const report = [
            '# Automation Conflict Analysis Report',
            '',
            `**Generated**: ${new Date().toISOString()}`,
            '**Total Conflicts Detected**: 0',
            '',
            '---',
            '',
            '## Summary',
            '',
            '✅ **No automation conflicts detected.**',
            '',
            'This Salesforce org has optimal trigger architecture with no multiple triggers on the same object+event combinations.',
            ''
        ].join('\n');

        if (outputPath) {
            fs.writeFileSync(outputPath, report, 'utf8');
        }

        return report;
    }

    // Helper methods

    countBySeverity(conflicts) {
        const counts = {};
        conflicts.forEach(c => {
            counts[c.severity] = (counts[c.severity] || 0) + 1;
        });
        return counts;
    }

    countUniqueTriggers(conflicts) {
        const triggers = new Set();
        conflicts.forEach(c => {
            c.involved.forEach(t => triggers.add(t.name));
        });
        return triggers.size;
    }

    getHighestSeverity(conflicts) {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return conflicts.reduce((highest, c) => {
            return severityOrder[c.severity] < severityOrder[highest] ? c.severity : highest;
        }, 'LOW');
    }

    getRemediationSuggestion(conflict) {
        const count = conflict.triggerCount;

        if (count >= 5) {
            return `Consolidate all ${count} triggers into a single trigger with a trigger handler framework. This is critical to prevent governor limit exceptions and ensure predictable execution order.`;
        } else if (count >= 3) {
            return `Merge these ${count} triggers into a single trigger. Consider implementing a trigger handler pattern for better maintainability.`;
        } else {
            return `Consolidate these ${count} triggers into a single trigger to ensure predictable execution order.`;
        }
    }

    estimateEffort(triggerCount) {
        if (triggerCount <= 3) return 'Low';
        if (triggerCount <= 5) return 'Medium';
        return 'High';
    }

    estimateImpact(conflictCount) {
        if (conflictCount >= 5) return 'Critical';
        if (conflictCount >= 3) return 'High';
        return 'Medium';
    }
}

module.exports = ConflictReportGenerator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node conflict-report-generator.js <conflicts.json> [output.md]');
        console.log('');
        console.log('Generates human-readable conflict analysis report from Conflicts.json');
        console.log('');
        console.log('Arguments:');
        console.log('  conflicts.json - Path to Conflicts.json file');
        console.log('  output.md      - Optional output path for markdown report');
        console.log('');
        console.log('Example:');
        console.log('  node conflict-report-generator.js findings/Conflicts.json CONFLICT_ANALYSIS.md');
        process.exit(1);
    }

    const conflictsPath = args[0];
    const outputPath = args[1];

    if (!fs.existsSync(conflictsPath)) {
        console.error(`Error: File not found: ${conflictsPath}`);
        process.exit(1);
    }

    try {
        const conflictsData = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
        const generator = new ConflictReportGenerator({ verbose: true });
        const report = generator.generateReport(conflictsData, outputPath);

        if (!outputPath) {
            console.log(report);
        } else {
            console.log(`\n✅ Conflict report generated successfully`);
            console.log(`📄 Report saved to: ${outputPath}`);
        }
    } catch (error) {
        console.error(`Error generating report: ${error.message}`);
        process.exit(1);
    }
}
