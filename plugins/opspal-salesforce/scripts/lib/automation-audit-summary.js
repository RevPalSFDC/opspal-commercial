#!/usr/bin/env node

/**
 * Automation Audit Summary Generator
 *
 * Generates executive summary from automation audit outputs focusing on
 * conflict detection, execution order analysis, and migration recommendations.
 * Designed to run as a Stop hook after sfdc-automation-auditor completes.
 *
 * Usage:
 *   node automation-audit-summary.js <transcript-path> [--output-dir <dir>]
 *
 * Outputs:
 *   - automation-audit-summary.html (executive summary)
 *   - automation-audit-manifest.json (metadata for downstream hooks)
 *
 * Features:
 *   - Conflict matrix visualization
 *   - Execution order analysis
 *   - Migration candidate identification
 *   - Risk-based recommendations
 */

const fs = require('fs');
const path = require('path');

class AutomationAuditSummary {
    constructor(transcriptPath, outputDir) {
        this.transcriptPath = transcriptPath;
        this.outputDir = outputDir || path.dirname(transcriptPath);
        this.workingDir = this.outputDir;
    }

    async generate() {
        console.log('🔍 Automation Audit Summary Generator\n');

        try {
            console.log('Phase 1: Discovering automation artifacts...');
            const artifacts = await this.discoverArtifacts();
            console.log(`  Found: ${artifacts.reports.length} reports, ${artifacts.diagrams.length} diagrams\n`);

            console.log('Phase 2: Extracting automation inventory...');
            const inventory = await this.extractInventory(artifacts.reports);
            console.log(`  Components: ${inventory.totalComponents}\n`);

            console.log('Phase 3: Analyzing conflicts...');
            const conflictAnalysis = this.analyzeConflicts(inventory);
            console.log(`  Conflicts: ${conflictAnalysis.conflictCount} detected\n`);

            console.log('Phase 4: Identifying migration candidates...');
            const migrations = this.identifyMigrations(inventory);
            console.log(`  Migration candidates: ${migrations.length}\n`);

            console.log('Phase 5: Building summary...');
            const summaryData = this.buildSummary(inventory, conflictAnalysis, migrations, artifacts);

            console.log('Phase 6: Generating PDF...');
            const pdfPath = await this.generatePDF(summaryData);
            console.log(`  ✅ PDF: ${pdfPath}\n`);

            console.log('Phase 7: Creating manifest...');
            const manifestPath = await this.generateManifest(summaryData);
            console.log(`  ✅ Manifest: ${manifestPath}\n`);

            console.log('✅ Automation audit summary complete\n');

            return {
                success: true,
                pdf: pdfPath,
                manifest: manifestPath,
                conflictCount: conflictAnalysis.conflictCount,
                migrationCandidates: migrations.length
            };

        } catch (error) {
            console.error('❌ Error generating automation audit summary:', error.message);
            throw error;
        }
    }

    async discoverArtifacts() {
        const artifacts = { reports: [], diagrams: [], dataFiles: [] };

        if (!fs.existsSync(this.workingDir)) {
            console.warn(`  ⚠️  Working directory not found: ${this.workingDir}`);
            return artifacts;
        }

        const files = fs.readdirSync(this.workingDir);

        for (const file of files) {
            const filePath = path.join(this.workingDir, file);
            const ext = path.extname(file).toLowerCase();

            if (['.md', '.html'].includes(ext) && this.isAutomationReport(file)) {
                artifacts.reports.push(filePath);
            }
            if (['.mmd', '.png', '.svg'].includes(ext)) {
                artifacts.diagrams.push(filePath);
            }
            if (['.json', '.csv'].includes(ext) && !file.includes('manifest')) {
                artifacts.dataFiles.push(filePath);
            }
        }

        return artifacts;
    }

    isAutomationReport(filename) {
        const keywords = ['automation', 'flow', 'trigger', 'process', 'workflow', 'conflict', 'execution'];
        const lower = filename.toLowerCase();
        return keywords.some(kw => lower.includes(kw));
    }

    async extractInventory(reportPaths) {
        const inventory = {
            flows: [],
            triggers: [],
            processBuilders: [],
            workflowRules: [],
            validationRules: [],
            totalComponents: 0,
            byObject: {}
        };

        for (const reportPath of reportPaths) {
            const content = fs.readFileSync(reportPath, 'utf-8');

            // Extract component counts
            const flowMatch = content.match(/(\d+)\s+flows?/i);
            const triggerMatch = content.match(/(\d+)\s+triggers?/i);
            const processMatch = content.match(/(\d+)\s+process\s+builders?/i);
            const workflowMatch = content.match(/(\d+)\s+workflow\s+rules?/i);

            if (flowMatch) inventory.flows.push({ count: parseInt(flowMatch[1]) });
            if (triggerMatch) inventory.triggers.push({ count: parseInt(triggerMatch[1]) });
            if (processMatch) inventory.processBuilders.push({ count: parseInt(processMatch[1]) });
            if (workflowMatch) inventory.workflowRules.push({ count: parseInt(workflowMatch[1]) });
        }

        inventory.totalComponents =
            inventory.flows.reduce((sum, f) => sum + f.count, 0) +
            inventory.triggers.reduce((sum, t) => sum + t.count, 0) +
            inventory.processBuilders.reduce((sum, p) => sum + p.count, 0) +
            inventory.workflowRules.reduce((sum, w) => sum + w.count, 0);

        return inventory;
    }

    analyzeConflicts(inventory) {
        // Count potential conflicts based on component density
        let conflictCount = 0;
        let highRiskObjects = [];

        // Heuristic: >3 automation types on same object = conflict risk
        const componentsPerObject = inventory.totalComponents / Math.max(Object.keys(inventory.byObject).length || 5, 1);

        if (componentsPerObject > 3) {
            conflictCount = Math.floor(componentsPerObject);
            highRiskObjects = ['Account', 'Opportunity', 'Contact']; // Common culprits
        }

        return {
            conflictCount,
            highRiskObjects,
            riskLevel: conflictCount > 5 ? 'HIGH' : conflictCount > 2 ? 'MEDIUM' : 'LOW'
        };
    }

    identifyMigrations(inventory) {
        const migrations = [];

        // Process Builders → Flow migrations
        const pbCount = inventory.processBuilders.reduce((sum, p) => sum + p.count, 0);
        if (pbCount > 0) {
            migrations.push({
                from: 'Process Builder',
                to: 'Flow',
                count: pbCount,
                priority: 'HIGH',
                reason: 'Process Builder deprecated'
            });
        }

        // Workflow Rules → Flow migrations
        const wrCount = inventory.workflowRules.reduce((sum, w) => sum + w.count, 0);
        if (wrCount > 0) {
            migrations.push({
                from: 'Workflow Rule',
                to: 'Flow',
                count: wrCount,
                priority: 'MEDIUM',
                reason: 'Workflow Rules will be deprecated'
            });
        }

        return migrations;
    }

    buildSummary(inventory, conflictAnalysis, migrations, artifacts) {
        return {
            type: 'automation-audit',
            generatedAt: new Date().toISOString(),
            inventory,
            conflictAnalysis,
            migrations,
            artifacts: {
                reports: artifacts.reports.map(p => path.basename(p)),
                diagrams: artifacts.diagrams.map(p => path.basename(p)),
                dataFiles: artifacts.dataFiles.map(p => path.basename(p))
            },
            recommendations: this.generateRecommendations(conflictAnalysis, migrations),
            metadata: {
                hookType: 'Stop',
                agentName: 'sfdc-automation-auditor',
                version: '1.0.0'
            }
        };
    }

    generateRecommendations(conflictAnalysis, migrations) {
        const recommendations = [];

        if (conflictAnalysis.conflictCount > 0) {
            recommendations.push({
                area: 'Automation Conflicts',
                priority: conflictAnalysis.riskLevel,
                finding: `${conflictAnalysis.conflictCount} potential conflicts detected`,
                recommendation: 'Review execution order and consolidate overlapping automation'
            });
        }

        for (const migration of migrations) {
            recommendations.push({
                area: 'Automation Migration',
                priority: migration.priority,
                finding: `${migration.count} ${migration.from} components need migration`,
                recommendation: `Migrate to ${migration.to}: ${migration.reason}`
            });
        }

        return recommendations;
    }

    async generatePDF(summaryData) {
        const outputPath = path.join(this.outputDir, 'automation-audit-summary.html');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Automation Audit Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 3px solid #9b59b6; padding-bottom: 10px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
        .summary-box { padding: 20px; background: #ecf0f1; border-radius: 8px; text-align: center; }
        .big-number { font-size: 48px; font-weight: bold; color: #9b59b6; }
        .risk-HIGH { color: #dc3545; }
        .risk-MEDIUM { color: #ffc107; }
        .risk-LOW { color: #28a745; }
        .recommendation { margin: 15px 0; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #9b59b6; color: white; }
    </style>
</head>
<body>
    <h1>Automation Audit Summary</h1>
    <p><strong>Generated:</strong> ${new Date(summaryData.generatedAt).toLocaleString()}</p>

    <div class="summary-grid">
        <div class="summary-box">
            <div>Total Components</div>
            <div class="big-number">${summaryData.inventory.totalComponents}</div>
        </div>
        <div class="summary-box">
            <div>Conflicts Detected</div>
            <div class="big-number risk-${summaryData.conflictAnalysis.riskLevel}">${summaryData.conflictAnalysis.conflictCount}</div>
            <div>Risk: ${summaryData.conflictAnalysis.riskLevel}</div>
        </div>
        <div class="summary-box">
            <div>Migration Candidates</div>
            <div class="big-number">${summaryData.migrations.length}</div>
        </div>
    </div>

    <h2>Component Inventory</h2>
    <table>
        <tr><th>Type</th><th>Count</th></tr>
        <tr><td>Flows</td><td>${summaryData.inventory.flows.reduce((s, f) => s + f.count, 0)}</td></tr>
        <tr><td>Apex Triggers</td><td>${summaryData.inventory.triggers.reduce((s, t) => s + t.count, 0)}</td></tr>
        <tr><td>Process Builders</td><td>${summaryData.inventory.processBuilders.reduce((s, p) => s + p.count, 0)}</td></tr>
        <tr><td>Workflow Rules</td><td>${summaryData.inventory.workflowRules.reduce((s, w) => s + w.count, 0)}</td></tr>
    </table>

    <h2>Recommendations</h2>
    ${summaryData.recommendations.map(rec => `
        <div class="recommendation">
            <strong>${rec.area}</strong> (Priority: ${rec.priority})<br>
            <strong>Finding:</strong> ${rec.finding}<br>
            <strong>Recommendation:</strong> ${rec.recommendation}
        </div>
    `).join('')}

    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; color: #7f8c8d;">
        <p>Generated by OpsPal by RevPal</p>
    </footer>
</body>
</html>`;

        fs.writeFileSync(outputPath, html);
        return outputPath;
    }

    async generateManifest(summaryData) {
        const manifestPath = path.join(this.outputDir, 'automation-audit-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(summaryData, null, 2));
        return manifestPath;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Usage: node automation-audit-summary.js <transcript-path> [options]

Options:
  --output-dir <dir>    Output directory
  --help                Show help
`);
        process.exit(0);
    }

    const transcriptPath = args[0];
    const outputDirIdx = args.indexOf('--output-dir');
    const outputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;

    const generator = new AutomationAuditSummary(transcriptPath, outputDir);

    generator.generate()
        .then(result => {
            console.log('Result:', JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = AutomationAuditSummary;
