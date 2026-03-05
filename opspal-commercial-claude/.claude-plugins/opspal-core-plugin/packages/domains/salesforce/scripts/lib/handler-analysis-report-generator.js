#!/usr/bin/env node

/**
 * Handler Analysis Report Generator
 *
 * Purpose: Generate human-readable markdown analysis reports from handler
 * inventory with patterns, risks, and migration recommendations.
 *
 * Features:
 * - Handler pattern summary (base class distribution)
 * - Risk classification breakdown (LOW/MEDIUM/HIGH counts)
 * - Migration priority list (HIGH risk first)
 * - Best practices recommendations
 * - Handler-to-trigger association matrix
 * - Governor limit risk summary
 *
 * Usage:
 *   const generator = new HandlerAnalysisReportGenerator();
 *   await generator.generateReport(inventory, outputDir);
 *
 * @version 1.0.0
 * @date 2025-10-29
 */

const fs = require('fs');
const path = require('path');

class HandlerAnalysisReportGenerator {
    constructor(options = {}) {
        this.verbose = options.verbose !== false;
    }

    /**
     * Generate markdown analysis report
     * @param {Array<Object>} inventory - Handler inventory JSON
     * @param {string} outputDir - Output directory
     * @returns {string} Path to generated report
     */
    async generateReport(inventory, outputDir) {
        console.log('\n📝 Generating handler analysis report...\n');

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputFile = path.join(outputDir, 'handler-analysis-summary.md');

        // Generate report sections
        const sections = [];

        sections.push(this.generateHeader());
        sections.push(this.generateExecutiveSummary(inventory));
        sections.push(this.generateHandlerPatternSummary(inventory));
        sections.push(this.generateRiskClassification(inventory));
        sections.push(this.generateMigrationPriority(inventory));
        sections.push(this.generateGovernorLimitRisks(inventory));
        sections.push(this.generateBestPractices(inventory));
        sections.push(this.generateHandlerTriggerMatrix(inventory));

        // Write report
        const reportContent = sections.join('\n\n');
        fs.writeFileSync(outputFile, reportContent, 'utf8');

        console.log(`📄 Saved analysis report: ${outputFile}\n`);

        return outputFile;
    }

    /**
     * Generate report header
     */
    generateHeader() {
        const timestamp = new Date().toISOString();

        return `# Apex Handler & Trigger Inventory Analysis

**Generated**: ${timestamp}
**Report Version**: 1.0.0

---`;
    }

    /**
     * Generate executive summary
     */
    generateExecutiveSummary(inventory) {
        const totalTriggers = inventory.length;

        let totalHandlers = 0;
        let inlineTriggers = 0;
        let highRiskCount = 0;
        let mediumRiskCount = 0;
        let lowRiskCount = 0;

        const handlerSet = new Set();

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                if (!handler.className) {
                    inlineTriggers++;
                } else {
                    handlerSet.add(handler.className);
                }

                if (handler.migrationImpact === 'HIGH') highRiskCount++;
                else if (handler.migrationImpact === 'MEDIUM') mediumRiskCount++;
                else if (handler.migrationImpact === 'LOW') lowRiskCount++;
            }
        }

        totalHandlers = handlerSet.size;

        return `## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Triggers** | ${totalTriggers} |
| **Total Handler Classes** | ${totalHandlers} |
| **Inline Triggers** (No Handler) | ${inlineTriggers} |
| **HIGH Risk Handlers** | ${highRiskCount} |
| **MEDIUM Risk Handlers** | ${mediumRiskCount} |
| **LOW Risk Handlers** | ${lowRiskCount} |

### Key Findings

${this.generateKeyFindings(inventory, highRiskCount, mediumRiskCount, totalHandlers, inlineTriggers)}`;
    }

    /**
     * Generate key findings
     */
    generateKeyFindings(inventory, highRiskCount, mediumRiskCount, totalHandlers, inlineTriggers) {
        const findings = [];

        if (highRiskCount > 0) {
            findings.push(`- **${highRiskCount} HIGH risk handlers** require immediate attention before migration`);
        }

        if (mediumRiskCount > 0) {
            findings.push(`- **${mediumRiskCount} MEDIUM risk handlers** need careful planning for migration`);
        }

        if (inlineTriggers > 0) {
            findings.push(`- **${inlineTriggers} triggers use inline logic** - consider refactoring to handler pattern`);
        }

        const calloutsCount = inventory.flatMap(e => e.handlerClasses).filter(h => h.doesCallout).length;
        if (calloutsCount > 0) {
            findings.push(`- **${calloutsCount} handlers make callouts** - async handling required`);
        }

        const hardCodedIdsCount = inventory.flatMap(e => e.handlerClasses).filter(h => h.hardCodedIds.length > 0).length;
        if (hardCodedIdsCount > 0) {
            findings.push(`- **${hardCodedIdsCount} handlers contain hard-coded IDs** - migration blocker`);
        }

        if (findings.length === 0) {
            findings.push('- All handlers follow best practices with minimal migration risk');
        }

        return findings.join('\n');
    }

    /**
     * Generate handler pattern summary
     */
    generateHandlerPatternSummary(inventory) {
        const baseClassCount = new Map();

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                const baseClass = handler.baseClass || 'None';
                baseClassCount.set(baseClass, (baseClassCount.get(baseClass) || 0) + 1);
            }
        }

        const sortedClasses = Array.from(baseClassCount.entries())
            .sort((a, b) => b[1] - a[1]);

        let table = `## Handler Pattern Summary

| Base Class / Pattern | Count | Percentage |
|---------------------|-------|------------|
`;

        const total = Array.from(baseClassCount.values()).reduce((a, b) => a + b, 0);

        for (const [baseClass, count] of sortedClasses) {
            const percentage = ((count / total) * 100).toFixed(1);
            table += `| ${baseClass} | ${count} | ${percentage}% |\n`;
        }

        return table;
    }

    /**
     * Generate risk classification
     */
    generateRiskClassification(inventory) {
        const highRisk = [];
        const mediumRisk = [];
        const lowRisk = [];

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                const item = {
                    handler: handler.className || 'Inline Logic',
                    trigger: entry.triggerName,
                    object: entry.objectName,
                    reasons: []
                };

                // Determine reasons
                if (handler.doesCallout) item.reasons.push('Callouts');
                if (handler.hardCodedIds.length > 0) item.reasons.push(`Hard-coded IDs (${handler.hardCodedIds.length})`);
                if (handler.bulkSafetyFindings.some(f => f.includes('RISK'))) item.reasons.push('Bulk Safety Issues');
                if (handler.asyncWork.length > 0) item.reasons.push(`Async (${handler.asyncWork.join(', ')})`);

                if (handler.migrationImpact === 'HIGH') {
                    highRisk.push(item);
                } else if (handler.migrationImpact === 'MEDIUM') {
                    mediumRisk.push(item);
                } else {
                    lowRisk.push(item);
                }
            }
        }

        let report = `## Risk Classification\n\n`;

        // HIGH Risk
        if (highRisk.length > 0) {
            report += `### HIGH Risk Handlers (${highRisk.length})\n\n`;
            report += `| Handler | Trigger | Object | Risk Factors |\n`;
            report += `|---------|---------|--------|-------------|\n`;

            for (const item of highRisk) {
                report += `| ${item.handler} | ${item.trigger} | ${item.object} | ${item.reasons.join(', ') || 'Multiple'} |\n`;
            }

            report += '\n';
        }

        // MEDIUM Risk
        if (mediumRisk.length > 0) {
            report += `### MEDIUM Risk Handlers (${mediumRisk.length})\n\n`;
            report += `| Handler | Trigger | Object | Risk Factors |\n`;
            report += `|---------|---------|--------|-------------|\n`;

            for (const item of mediumRisk.slice(0, 10)) { // Top 10
                report += `| ${item.handler} | ${item.trigger} | ${item.object} | ${item.reasons.join(', ') || 'Moderate'} |\n`;
            }

            if (mediumRisk.length > 10) {
                report += `| ... | ... | ... | (${mediumRisk.length - 10} more) |\n`;
            }

            report += '\n';
        }

        return report;
    }

    /**
     * Generate migration priority list
     */
    generateMigrationPriority(inventory) {
        const priorities = [];

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                priorities.push({
                    handler: handler.className || 'Inline Logic',
                    trigger: entry.triggerName,
                    object: entry.objectName,
                    impact: handler.migrationImpact,
                    coverage: handler.approxCoverage,
                    score: this.calculatePriorityScore(handler)
                });
            }
        }

        // Sort by score (highest first)
        priorities.sort((a, b) => b.score - a.score);

        let report = `## Migration Priority List\n\n`;
        report += `Sorted by migration complexity and risk (highest priority first).\n\n`;
        report += `| Priority | Handler | Trigger | Object | Impact | Coverage | Score |\n`;
        report += `|----------|---------|---------|--------|--------|----------|-------|\n`;

        for (let i = 0; i < Math.min(20, priorities.length); i++) {
            const item = priorities[i];
            report += `| ${i + 1} | ${item.handler} | ${item.trigger} | ${item.object} | ${item.impact} | ${item.coverage}% | ${item.score} |\n`;
        }

        if (priorities.length > 20) {
            report += `| ... | ... | ... | ... | ... | ... | (${priorities.length - 20} more) |\n`;
        }

        return report;
    }

    /**
     * Calculate priority score
     */
    calculatePriorityScore(handler) {
        let score = 0;

        // Impact scoring
        if (handler.migrationImpact === 'HIGH') score += 10;
        else if (handler.migrationImpact === 'MEDIUM') score += 5;
        else score += 1;

        // Risk factors
        if (handler.doesCallout) score += 3;
        if (handler.hardCodedIds.length > 0) score += 3;
        if (handler.bulkSafetyFindings.some(f => f.includes('RISK'))) score += 2;
        if (handler.asyncWork.length > 0) score += 2;

        // Coverage penalty (low coverage = higher priority)
        if (handler.approxCoverage < 75) score += 2;

        return score;
    }

    /**
     * Generate governor limit risks
     */
    generateGovernorLimitRisks(inventory) {
        const riskyHandlers = [];

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                const risks = handler.bulkSafetyFindings.filter(f => f.includes('RISK'));

                if (risks.length > 0) {
                    riskyHandlers.push({
                        handler: handler.className || 'Inline Logic',
                        trigger: entry.triggerName,
                        object: entry.objectName,
                        risks: risks
                    });
                }
            }
        }

        if (riskyHandlers.length === 0) {
            return `## Governor Limit Risks\n\n✅ No governor limit risks detected. All handlers follow bulk-safe patterns.`;
        }

        let report = `## Governor Limit Risks\n\n`;
        report += `⚠️ **${riskyHandlers.length} handlers** have potential governor limit issues:\n\n`;
        report += `| Handler | Trigger | Object | Issue |\n`;
        report += `|---------|---------|--------|-------|\n`;

        for (const item of riskyHandlers) {
            report += `| ${item.handler} | ${item.trigger} | ${item.object} | ${item.risks.join('; ')} |\n`;
        }

        return report;
    }

    /**
     * Generate best practices recommendations
     */
    generateBestPractices(inventory) {
        let report = `## Best Practices & Recommendations\n\n`;

        // Check for common issues
        const inlineCount = inventory.filter(e => e.handlerClasses.some(h => !h.className)).length;
        const noRecursionGuard = inventory.filter(e =>
            e.handlerClasses.some(h => !h.baseClass || h.baseClass === 'None')
        ).length;

        if (inlineCount > 0) {
            report += `### 1. Refactor Inline Trigger Logic\n\n`;
            report += `**${inlineCount} triggers** contain inline logic without handler classes. `;
            report += `Consider refactoring to use the handler pattern for better testability and maintainability.\n\n`;
        }

        if (noRecursionGuard > 0) {
            report += `### 2. Implement Recursion Guards\n\n`;
            report += `**${noRecursionGuard} handlers** do not extend a standard base class. `;
            report += `Consider using TriggerHandler or fflib_SObjectDomain for built-in recursion protection.\n\n`;
        }

        report += `### 3. Migration to Flow Considerations\n\n`;
        report += `When migrating triggers to Flow:\n`;
        report += `- **LOW impact handlers**: Good candidates for Flow migration\n`;
        report += `- **MEDIUM impact handlers**: May require hybrid approach (Flow + Apex Invocable)\n`;
        report += `- **HIGH impact handlers**: Keep as Apex, focus on optimization\n\n`;

        report += `### 4. Test Coverage Improvements\n\n`;
        const lowCoverage = inventory.flatMap(e => e.handlerClasses).filter(h => h.approxCoverage < 75);
        if (lowCoverage.length > 0) {
            report += `**${lowCoverage.length} handlers** have test coverage below 75%. Prioritize test improvements before migration.\n\n`;
        } else {
            report += `✅ All handlers have adequate test coverage (≥75%).\n\n`;
        }

        return report;
    }

    /**
     * Generate handler-trigger matrix
     */
    generateHandlerTriggerMatrix(inventory) {
        const handlerMap = new Map();

        for (const entry of inventory) {
            for (const handler of entry.handlerClasses) {
                if (!handler.className) continue;

                if (!handlerMap.has(handler.className)) {
                    handlerMap.set(handler.className, {
                        triggers: [],
                        objects: new Set()
                    });
                }

                const data = handlerMap.get(handler.className);
                data.triggers.push(entry.triggerName);
                data.objects.add(entry.objectName);
            }
        }

        let report = `## Handler-Trigger Association Matrix\n\n`;
        report += `| Handler Class | Triggers | Objects | Multi-Object |\n`;
        report += `|---------------|----------|---------|-------------|\n`;

        for (const [handler, data] of handlerMap.entries()) {
            const isMultiObject = data.objects.size > 1;
            report += `| ${handler} | ${data.triggers.join(', ')} | ${Array.from(data.objects).join(', ')} | ${isMultiObject ? 'Yes ⚠️' : 'No'} |\n`;
        }

        return report;
    }
}

module.exports = HandlerAnalysisReportGenerator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node handler-analysis-report-generator.js <inventory-json-file> <output-dir>');
        console.error('Example: node handler-analysis-report-generator.js ./inventory.json ./output');
        process.exit(1);
    }

    const jsonFile = args[0];
    const outputDir = args[1];

    (async () => {
        try {
            // Load JSON
            const inventory = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

            const generator = new HandlerAnalysisReportGenerator({ verbose: true });
            await generator.generateReport(inventory, outputDir);

            console.log('✅ Analysis report generation complete!\n');
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}
