#!/usr/bin/env node

/**
 * HubSpot Portal Context Manager
 *
 * Persists and retrieves portal-level context across assessments to prevent
 * re-analyzing the same areas and maintain institutional knowledge.
 *
 * Adapted from SFDC org-context-manager.js
 *
 * Usage:
 *   node scripts/lib/portal-context-manager.js load <portal-name>
 *   node scripts/lib/portal-context-manager.js update <portal-name> --assessment <path>
 *   node scripts/lib/portal-context-manager.js cross-reference <portal-name>
 *   node scripts/lib/portal-context-manager.js summary <portal-name>
 */

const fs = require('fs');
const path = require('path');

class PortalContextManager {
    constructor(portalName) {
        this.portalName = portalName;
        this.portalsDir = path.join(__dirname, '../../portals');
        this.portalDir = path.join(this.portalsDir, portalName);
        this.contextPath = path.join(this.portalDir, 'PORTAL_CONTEXT.json');
        this.context = this.loadContext();
    }

    loadContext() {
        if (fs.existsSync(this.contextPath)) {
            return JSON.parse(fs.readFileSync(this.contextPath, 'utf8'));
        }

        // Initialize new context
        return {
            portalName: this.portalName,
            assessments: [],
            configurations: {},
            integrations: [],
            dataQualityHistory: [],
            workflowPatterns: [],
            propertyChanges: [],
            lastUpdated: new Date().toISOString(),
            metadata: {
                totalAssessments: 0,
                firstAssessment: null,
                lastAssessment: null
            }
        };
    }

    saveContext() {
        if (!fs.existsSync(this.portalDir)) {
            fs.mkdirSync(this.portalDir, { recursive: true });
        }

        this.context.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.contextPath, JSON.stringify(this.context, null, 2));
        console.log(`✅ Context saved to: ${this.contextPath}`);
    }

    addAssessment(assessmentData) {
        const assessment = {
            id: `assessment-${Date.now()}`,
            date: new Date().toISOString(),
            type: assessmentData.type || 'general',
            framework: assessmentData.framework || 'unknown',
            scope: assessmentData.scope || [],
            findings: assessmentData.findings || [],
            recommendations: assessmentData.recommendations || [],
            path: assessmentData.path || null,
            status: assessmentData.status || 'completed'
        };

        this.context.assessments.push(assessment);
        this.context.metadata.totalAssessments = this.context.assessments.length;

        if (!this.context.metadata.firstAssessment) {
            this.context.metadata.firstAssessment = assessment.date;
        }
        this.context.metadata.lastAssessment = assessment.date;

        console.log(`✅ Added assessment: ${assessment.type} (${assessment.framework})`);
        return assessment;
    }

    updateFromAssessmentFile(assessmentPath) {
        if (!fs.existsSync(assessmentPath)) {
            throw new Error(`Assessment file not found: ${assessmentPath}`);
        }

        const assessmentData = JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
        this.addAssessment({
            ...assessmentData,
            path: assessmentPath
        });

        this.saveContext();
    }

    crossReferenceAssessments() {
        console.log('\n🔍 Cross-Referencing Assessments');
        console.log('=================================\n');

        const scopeMap = {};
        this.context.assessments.forEach(assessment => {
            assessment.scope.forEach(area => {
                if (!scopeMap[area]) {
                    scopeMap[area] = [];
                }
                scopeMap[area].push({
                    date: assessment.date,
                    type: assessment.type,
                    id: assessment.id
                });
            });
        });

        // Find overlapping areas
        const overlaps = Object.entries(scopeMap)
            .filter(([, assessments]) => assessments.length > 1)
            .map(([area, assessments]) => ({
                area,
                count: assessments.length,
                assessments
            }));

        if (overlaps.length > 0) {
            console.log('📊 Overlapping Assessment Areas:\n');
            overlaps.forEach(overlap => {
                console.log(`  ${overlap.area} (${overlap.count} assessments)`);
                overlap.assessments.forEach(a => {
                    console.log(`    - ${a.type} on ${a.date.split('T')[0]}`);
                });
                console.log('');
            });
        } else {
            console.log('No overlapping assessment areas found.');
        }

        return overlaps;
    }

    generateSummary() {
        const summary = {
            portal: this.portalName,
            totalAssessments: this.context.metadata.totalAssessments,
            assessmentTypes: {},
            frameworks: {},
            recentFindings: [],
            recommendationThemes: {}
        };

        // Count assessment types
        this.context.assessments.forEach(assessment => {
            summary.assessmentTypes[assessment.type] = (summary.assessmentTypes[assessment.type] || 0) + 1;
            summary.frameworks[assessment.framework] = (summary.frameworks[assessment.framework] || 0) + 1;

            // Collect recent findings
            if (assessment.findings) {
                assessment.findings.forEach(finding => {
                    summary.recentFindings.push({
                        date: assessment.date,
                        type: assessment.type,
                        finding: finding
                    });
                });
            }

            // Track recommendation themes
            if (assessment.recommendations) {
                assessment.recommendations.forEach(rec => {
                    const theme = this.categorizeRecommendation(rec);
                    summary.recommendationThemes[theme] = (summary.recommendationThemes[theme] || 0) + 1;
                });
            }
        });

        // Sort recent findings by date (most recent first)
        summary.recentFindings.sort((a, b) => new Date(b.date) - new Date(a.date));
        summary.recentFindings = summary.recentFindings.slice(0, 10);

        return summary;
    }

    categorizeRecommendation(recommendation) {
        const recLower = recommendation.toLowerCase();
        if (recLower.includes('data quality') || recLower.includes('cleanup')) return 'Data Quality';
        if (recLower.includes('workflow') || recLower.includes('automation')) return 'Automation';
        if (recLower.includes('integration')) return 'Integration';
        if (recLower.includes('property') || recLower.includes('field')) return 'Data Model';
        if (recLower.includes('reporting') || recLower.includes('dashboard')) return 'Analytics';
        if (recLower.includes('process')) return 'Process';
        return 'Other';
    }

    printSummary() {
        const summary = this.generateSummary();

        console.log('\n📊 Portal Assessment Summary');
        console.log('============================\n');
        console.log(`Portal: ${summary.portal}`);
        console.log(`Total Assessments: ${summary.totalAssessments}\n`);

        console.log('Assessment Types:');
        Object.entries(summary.assessmentTypes).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count}`);
        });

        console.log('\nFrameworks Used:');
        Object.entries(summary.frameworks).forEach(([framework, count]) => {
            console.log(`  - ${framework}: ${count}`);
        });

        console.log('\nRecommendation Themes:');
        Object.entries(summary.recommendationThemes)
            .sort(([, a], [, b]) => b - a)
            .forEach(([theme, count]) => {
                console.log(`  - ${theme}: ${count}`);
            });

        if (summary.recentFindings.length > 0) {
            console.log('\nRecent Findings (Top 5):');
            summary.recentFindings.slice(0, 5).forEach((item, i) => {
                console.log(`  ${i + 1}. [${item.type}] ${item.finding.substring(0, 80)}...`);
            });
        }
    }

    saveSummary() {
        const summaryPath = path.join(this.portalDir, 'PORTAL_SUMMARY.md');
        const summary = this.generateSummary();

        const lines = [];
        lines.push(`# Portal Assessment Summary: ${summary.portal}`);
        lines.push(`**Generated:** ${new Date().toISOString()}`);
        lines.push(`**Total Assessments:** ${summary.totalAssessments}\n`);

        lines.push('## Assessment Types');
        Object.entries(summary.assessmentTypes).forEach(([type, count]) => {
            lines.push(`- **${type}**: ${count}`);
        });

        lines.push('\n## Frameworks Used');
        Object.entries(summary.frameworks).forEach(([framework, count]) => {
            lines.push(`- **${framework}**: ${count}`);
        });

        lines.push('\n## Recommendation Themes');
        Object.entries(summary.recommendationThemes)
            .sort(([, a], [, b]) => b - a)
            .forEach(([theme, count]) => {
                lines.push(`- **${theme}**: ${count}`);
            });

        if (summary.recentFindings.length > 0) {
            lines.push('\n## Recent Findings');
            summary.recentFindings.forEach((item, i) => {
                lines.push(`${i + 1}. **[${item.type}]** ${item.finding}`);
            });
        }

        fs.writeFileSync(summaryPath, lines.join('\n'));
        console.log(`\n✅ Summary saved to: ${summaryPath}`);
    }

    exportContext() {
        console.log(JSON.stringify(this.context, null, 2));
    }

    getAssessmentsByType(type) {
        return this.context.assessments.filter(a => a.type === type);
    }

    getRecentAssessments(limit = 5) {
        return this.context.assessments
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);
    }
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const portalName = args[1];

    if (!command || !portalName) {
        console.log('Usage:');
        console.log('  node portal-context-manager.js load <portal-name>');
        console.log('  node portal-context-manager.js update <portal-name> --assessment <path>');
        console.log('  node portal-context-manager.js cross-reference <portal-name>');
        console.log('  node portal-context-manager.js summary <portal-name>');
        console.log('  node portal-context-manager.js export <portal-name>');
        process.exit(1);
    }

    const manager = new PortalContextManager(portalName);

    try {
        switch (command) {
            case 'load':
                manager.exportContext();
                break;

            case 'update':
                const assessmentPath = args[args.indexOf('--assessment') + 1];
                if (!assessmentPath) {
                    console.error('❌ --assessment <path> required');
                    process.exit(1);
                }
                manager.updateFromAssessmentFile(assessmentPath);
                break;

            case 'cross-reference':
                manager.crossReferenceAssessments();
                break;

            case 'summary':
                manager.printSummary();
                manager.saveSummary();
                break;

            case 'export':
                manager.exportContext();
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { PortalContextManager };
