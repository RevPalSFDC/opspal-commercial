#!/usr/bin/env node
/**
 * Automation Reporter
 *
 * Generates executive summaries, CSV exports, and formatted reports
 * from automation audit data.
 *
 * Features:
 * - Executive summary generation (Markdown)
 * - CSV export (conflicts, triggers, workflow rules)
 * - JSON summary report
 * - Quick reference guides
 * - Metrics dashboard
 *
 * Usage:
 *   node automation-reporter.js <audit-directory> [options]
 *
 * Options:
 *   --format=<csv|markdown|json|all>  Output format (default: all)
 *   --output=<dir>                     Output directory
 *
 * @version 1.0.0
 * @date 2025-10-08
 */

const fs = require('fs');
const path = require('path');
const { generateFooter, generateSimpleFooter } = require('./report-footer-generator');
const { RobustCSVParser } = require('./csv-schema-validator');

class AutomationReporter {
  constructor(auditDir) {
    this.auditDir = auditDir;
    this.rawDataPath = path.join(auditDir, 'raw/raw_data.json');
    this.conflictsPath = path.join(auditDir, 'findings/Conflicts.json');
    this.reportsDir = path.join(auditDir, 'reports');
    this.csvParser = new RobustCSVParser(); // Quick Win: Robust CSV generation

    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Load audit data from files
   */
  loadData() {
    console.log('Loading audit data...');

    this.rawData = JSON.parse(fs.readFileSync(this.rawDataPath, 'utf8'));
    this.conflicts = JSON.parse(fs.readFileSync(this.conflictsPath, 'utf8'));

    console.log(`Loaded ${this.conflicts.length} conflicts`);
    console.log(`Loaded ${this.rawData.triggers?.length || 0} triggers`);
    console.log(`Loaded ${this.rawData.classes?.length || 0} classes`);
    console.log(`Loaded ${this.rawData.flows?.length || 0} flows`);
    console.log(`Loaded ${this.rawData.workflowRules?.length || 0} workflow rules`);
  }

  /**
   * Generate CSV export of conflicts
   * Quick Win: Uses RobustCSVParser for automatic quoting and escaping
   */
  generateConflictsCSV() {
    console.log('Generating conflicts CSV...');

    // Convert to object-based rows for robust CSV generation
    const rows = this.conflicts.map(conflict => ({
      'Conflict ID': conflict.conflictId,
      'Severity': conflict.severity,
      'Object': conflict.object,
      'Trigger Count': conflict.triggerCount,
      'Rule': conflict.rule,
      'Evidence': conflict.evidence,
      'Impact': conflict.impact,
      'Priority': conflict.recommendation.priority,
      'Action': conflict.recommendation.action,
      'Estimated Time': conflict.recommendation.estimatedTime,
      'Complexity': conflict.recommendation.complexity
    }));

    // Quick Win: RobustCSVParser handles all quoting, commas, quotes automatically
    const csv = this.csvParser.generate(rows);

    // Add footer as comment
    const csvWithFooter = csv + '\n\n# ' + generateSimpleFooter('Automation Reporter - Conflicts Export', 'v1.0');

    const outputPath = path.join(this.reportsDir, 'Conflicts_Export.csv');
    fs.writeFileSync(outputPath, csvWithFooter, 'utf8');

    console.log(`✓ Conflicts CSV saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate CSV export of trigger inventory
   * Quick Win: Uses RobustCSVParser for automatic quoting and escaping
   */
  generateTriggersCSV() {
    console.log('Generating triggers CSV...');

    const triggers = this.rawData.triggers || [];

    // Convert to object-based rows for robust CSV generation
    const rows = triggers.map(trigger => ({
      'Trigger Name': trigger.Name,
      'Object': trigger.TableEnumOrId,
      'Events': (
        (trigger.UsageBeforeInsert ? 'beforeInsert ' : '') +
        (trigger.UsageAfterInsert ? 'afterInsert ' : '') +
        (trigger.UsageBeforeUpdate ? 'beforeUpdate ' : '') +
        (trigger.UsageAfterUpdate ? 'afterUpdate ' : '') +
        (trigger.UsageBeforeDelete ? 'beforeDelete ' : '') +
        (trigger.UsageAfterDelete ? 'afterDelete ' : '') +
        (trigger.UsageAfterUndelete ? 'afterUndelete ' : '')
      ).trim(),
      'Status': trigger.Status,
      'API Version': trigger.ApiVersion,
      'Created Date': trigger.CreatedDate,
      'Last Modified Date': trigger.LastModifiedDate
    }));

    // Quick Win: RobustCSVParser handles all quoting, commas, quotes automatically
    const csv = this.csvParser.generate(rows);

    // Add footer as comment
    const csvWithFooter = csv + '\n\n# ' + generateSimpleFooter('Automation Reporter - Triggers Inventory', 'v1.0');

    const outputPath = path.join(this.reportsDir, 'Triggers_Inventory.csv');
    fs.writeFileSync(outputPath, csvWithFooter, 'utf8');

    console.log(`✓ Triggers CSV saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate CSV export of workflow rules
   * Quick Win: Uses RobustCSVParser for automatic quoting and escaping
   */
  generateWorkflowRulesCSV() {
    console.log('Generating workflow rules CSV...');

    const workflowRules = this.rawData.workflowRules || [];

    // Convert to object-based rows for robust CSV generation
    const rows = workflowRules.map(rule => ({
      'Workflow Name': rule.Name,
      'Object': rule.EntityDefinition?.QualifiedApiName || rule.TableEnumOrId || 'Unknown',
      'Active': rule.Active ? 'Active' : 'Inactive',
      'Trigger Type': rule.TriggerType || 'Unknown',
      'Created Date': rule.CreatedDate || 'Unknown'
    }));

    // Quick Win: RobustCSVParser handles all quoting, commas, quotes automatically
    const csv = this.csvParser.generate(rows);

    // Add footer as comment
    const csvWithFooter = csv + '\n\n# ' + generateSimpleFooter('Automation Reporter - Workflow Rules Inventory', 'v1.0');

    const outputPath = path.join(this.reportsDir, 'Workflow_Rules_Inventory.csv');
    fs.writeFileSync(outputPath, csvWithFooter, 'utf8');

    console.log(`✓ Workflow Rules CSV saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate metrics summary JSON
   */
  generateMetricsSummary() {
    console.log('Generating metrics summary...');

    const triggers = this.rawData.triggers || [];
    const classes = this.rawData.classes || [];
    const flows = this.rawData.flows || [];
    const workflowRules = this.rawData.workflowRules || [];

    // Count triggers by severity
    const severityCounts = {
      CRITICAL: this.conflicts.filter(c => c.severity === 'CRITICAL').length,
      HIGH: this.conflicts.filter(c => c.severity === 'HIGH').length,
      MEDIUM: this.conflicts.filter(c => c.severity === 'MEDIUM').length,
      LOW: this.conflicts.filter(c => c.severity === 'LOW').length
    };

    // Count triggers by object
    const triggersByObject = {};
    triggers.forEach(trigger => {
      const obj = trigger.TableEnumOrId;
      triggersByObject[obj] = (triggersByObject[obj] || 0) + 1;
    });

    // Top 10 objects by trigger count
    const topObjects = Object.entries(triggersByObject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([object, count]) => ({ object, count }));

    // Calculate total remediation time
    const totalRemediationTime = this.conflicts.reduce((sum, conflict) => {
      const timeStr = conflict.recommendation.estimatedTime || '0-0 hours';
      const match = timeStr.match(/(\d+)-(\d+)/);
      if (match) {
        const avg = (parseInt(match[1]) + parseInt(match[2])) / 2;
        return sum + avg;
      }
      return sum;
    }, 0);

    const summary = {
      auditDate: new Date().toISOString().split('T')[0],
      orgId: this.rawData.orgInfo?.orgId || 'unknown',
      orgName: this.rawData.orgInfo?.orgAlias || 'unknown',
      inventory: {
        triggers: triggers.length,
        classes: classes.length,
        flows: flows.length,
        workflowRules: workflowRules.length,
        totalAutomations: triggers.length + flows.length + workflowRules.length
      },
      conflicts: {
        total: this.conflicts.length,
        bySeverity: severityCounts,
        topObjects: topObjects
      },
      metrics: {
        averageTriggersPerObject: (triggers.length / Object.keys(triggersByObject).length).toFixed(2),
        objectsWithMultipleTriggers: Object.values(triggersByObject).filter(count => count > 1).length,
        estimatedRemediationHours: Math.round(totalRemediationTime),
        estimatedRemediationWeeks: Math.ceil(totalRemediationTime / 40)
      },
      riskAssessment: {
        overallRisk: severityCounts.CRITICAL > 0 ? 'HIGH' :
                     severityCounts.HIGH > 5 ? 'MEDIUM' : 'LOW',
        criticalIssues: severityCounts.CRITICAL,
        highPriorityIssues: severityCounts.HIGH + severityCounts.CRITICAL
      }
    };

    const outputPath = path.join(this.reportsDir, 'Metrics_Summary.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log(`✓ Metrics summary saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate quick reference guide (Markdown)
   */
  generateQuickReference() {
    console.log('Generating quick reference guide...');

    const severityCounts = {
      CRITICAL: this.conflicts.filter(c => c.severity === 'CRITICAL').length,
      HIGH: this.conflicts.filter(c => c.severity === 'HIGH').length,
      MEDIUM: this.conflicts.filter(c => c.severity === 'MEDIUM').length,
      LOW: this.conflicts.filter(c => c.severity === 'LOW').length
    };

    // Group conflicts by object
    const conflictsByObject = {};
    this.conflicts.forEach(conflict => {
      if (!conflictsByObject[conflict.object]) {
        conflictsByObject[conflict.object] = [];
      }
      conflictsByObject[conflict.object].push(conflict);
    });

    // Sort objects by severity (CRITICAL first)
    const sortedObjects = Object.entries(conflictsByObject).sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return severityOrder[a[1][0].severity] - severityOrder[b[1][0].severity];
    });

    let markdown = `# Automation Audit - Quick Reference\n\n`;
    markdown += `**Generated**: ${new Date().toISOString().split('T')[0]}\n\n`;
    markdown += `---\n\n`;

    markdown += `## At a Glance\n\n`;
    markdown += `| Metric | Count |\n`;
    markdown += `|--------|-------|\n`;
    markdown += `| Total Conflicts | ${this.conflicts.length} |\n`;
    markdown += `| CRITICAL Issues | ${severityCounts.CRITICAL} |\n`;
    markdown += `| HIGH Issues | ${severityCounts.HIGH} |\n`;
    markdown += `| MEDIUM Issues | ${severityCounts.MEDIUM} |\n`;
    markdown += `| LOW Issues | ${severityCounts.LOW} |\n\n`;

    markdown += `## Priority Actions\n\n`;

    // CRITICAL conflicts
    const criticalConflicts = this.conflicts.filter(c => c.severity === 'CRITICAL');
    if (criticalConflicts.length > 0) {
      markdown += `### 🔴 CRITICAL (Immediate Action Required)\n\n`;
      criticalConflicts.forEach((conflict, idx) => {
        markdown += `${idx + 1}. **${conflict.object}** - ${conflict.triggerCount} triggers\n`;
        markdown += `   - ${conflict.evidence}\n`;
        markdown += `   - Action: ${conflict.recommendation.action}\n`;
        markdown += `   - Time: ${conflict.recommendation.estimatedTime}\n\n`;
      });
    }

    // HIGH conflicts
    const highConflicts = this.conflicts.filter(c => c.severity === 'HIGH');
    if (highConflicts.length > 0) {
      markdown += `### 🟠 HIGH (Plan Within Week)\n\n`;
      highConflicts.slice(0, 5).forEach((conflict, idx) => {
        markdown += `${idx + 1}. **${conflict.object}** - ${conflict.triggerCount} triggers\n`;
        markdown += `   - Time: ${conflict.recommendation.estimatedTime}\n\n`;
      });
    }

    markdown += `## Object Hotspots\n\n`;
    markdown += `| Object | Triggers | Severity |\n`;
    markdown += `|--------|----------|----------|\n`;

    sortedObjects.slice(0, 15).forEach(([object, conflicts]) => {
      const conflict = conflicts[0];
      markdown += `| ${object} | ${conflict.triggerCount} | ${conflict.severity} |\n`;
    });

    markdown += `\n## Next Steps\n\n`;
    markdown += `1. Review **Executive Summary** for detailed analysis\n`;
    markdown += `2. Start with **CRITICAL** conflicts (${severityCounts.CRITICAL} issues)\n`;
    markdown += `3. Use **Conflicts_Export.csv** for tracking\n`;
    markdown += `4. Reference **Triggers_Inventory.csv** for implementation\n\n`;

    markdown += `## File Reference\n\n`;
    markdown += `- \`reports/Executive_Summary.md\` - Complete leadership report\n`;
    markdown += `- \`reports/Conflicts_Export.csv\` - All conflicts in spreadsheet format\n`;
    markdown += `- \`reports/Triggers_Inventory.csv\` - Complete trigger list\n`;
    markdown += `- \`reports/Workflow_Rules_Inventory.csv\` - Workflow rule list\n`;
    markdown += `- \`reports/Metrics_Summary.json\` - Machine-readable metrics\n`;
    markdown += `- \`findings/Conflicts.json\` - Raw conflict data\n`;
    markdown += `- \`raw/raw_data.json\` - Complete audit data\n\n`;

    // Add footer
    markdown += generateFooter({
      tool: 'Automation Reporter',
      version: 'v1.0',
      reportType: 'Quick Reference Guide',
      format: 'markdown'
    });

    const outputPath = path.join(this.reportsDir, 'Quick_Reference.md');
    fs.writeFileSync(outputPath, markdown, 'utf8');

    console.log(`✓ Quick reference saved to: ${outputPath}`);
    return outputPath;
  }

  /**
   * Generate all reports
   */
  generateAll() {
    console.log('\n=== Automation Reporter ===\n');
    console.log(`Audit Directory: ${this.auditDir}\n`);

    this.loadData();

    const outputs = {
      conflictsCSV: this.generateConflictsCSV(),
      triggersCSV: this.generateTriggersCSV(),
      workflowRulesCSV: this.generateWorkflowRulesCSV(),
      metricsSummary: this.generateMetricsSummary(),
      quickReference: this.generateQuickReference()
    };

    console.log('\n=== Report Generation Complete ===\n');
    console.log('Generated Files:');
    Object.entries(outputs).forEach(([name, path]) => {
      console.log(`  - ${name}: ${path}`);
    });
    console.log('');

    return outputs;
  }
}

// CLI Execution
if (require.main === module) {
  const auditDir = process.argv[2];

  if (!auditDir) {
    console.error('Usage: node automation-reporter.js <audit-directory>');
    console.error('');
    console.error('Example:');
    console.error('  node automation-reporter.js instances/neonone/automation-audit-1234567890/');
    process.exit(1);
  }

  if (!fs.existsSync(auditDir)) {
    console.error(`Error: Audit directory not found: ${auditDir}`);
    process.exit(1);
  }

  const reporter = new AutomationReporter(auditDir);

  try {
    reporter.generateAll();
    console.log('✓ All reports generated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error generating reports:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = AutomationReporter;
