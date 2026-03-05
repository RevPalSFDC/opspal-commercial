#!/usr/bin/env node
/**
 * Structured Audit Example
 *
 * Demonstrates using StructuredFormatter for audit/analysis reports
 * with findings, risk assessments, and recommendations.
 *
 * This example shows a typical automation audit report using
 * the structured content formatter library.
 *
 * Usage:
 *   node structured-audit-example.js
 *
 * @version 1.0.0
 * @date 2025-11-04
 * @feature Claude Code v2.0.32 Integration
 */

const { StructuredFormatter } = require('../lib/structured-content-formatter');

class AutomationAuditor {
  constructor() {
    this.formatter = new StructuredFormatter();
  }

  /**
   * Generate automation audit report
   */
  generateReport(auditData) {
    let output = '';

    // Title
    output += this.formatter.section(
      `Automation Audit Report - ${auditData.orgName}`,
      { level: 1, emoji: '🔍' }
    );
    output += '\n';

    // Executive Summary
    output += this.formatter.section('Executive Summary', { type: 'summary', level: 2 });
    output += this.formatter.keyValuePairs({
      'Audit Date': auditData.auditDate,
      'Org Name': `${auditData.orgName} (${auditData.orgId})`,
      'Total Automations': auditData.totalAutomations,
      'Conflicts Detected': auditData.conflictsDetected,
      'Overall Risk': this.getRiskBadge(auditData.overallRisk)
    });
    output += '\n\n';

    // Inventory breakdown
    output += this.formatter.section('Automation Inventory', { type: 'metrics', level: 2 });
    output += this.formatter.table(
      auditData.inventory,
      {
        type: 'Automation Type',
        count: 'Count',
        active: 'Active',
        inactive: 'Inactive'
      }
    );
    output += '\n\n';

    // Conflict analysis
    output += this.formatter.section('Conflict Analysis', { type: 'analysis', level: 2 });
    output += this.formatter.metricsSummary({
      'Critical Issues': auditData.severityCounts.CRITICAL,
      'High Priority': auditData.severityCounts.HIGH,
      'Medium Priority': auditData.severityCounts.MEDIUM,
      'Low Priority': auditData.severityCounts.LOW,
      'Total Conflicts': auditData.conflictsDetected
    });
    output += '\n\n';

    // Top hotspots
    output += this.formatter.section('Object Hotspots', { type: 'warnings', level: 2 });
    output += this.formatter.table(
      auditData.hotspots,
      {
        object: 'Object',
        triggerCount: 'Triggers',
        flowCount: 'Flows',
        ruleCount: 'Rules',
        totalConflicts: 'Conflicts',
        risk: 'Risk'
      }
    );
    output += '\n\n';

    // Critical issues
    if (auditData.criticalIssues.length > 0) {
      output += this.formatter.section('Critical Issues (Immediate Action Required)', {
        type: 'errors',
        level: 2
      });

      auditData.criticalIssues.forEach((issue, index) => {
        output += `\n**${index + 1}. ${issue.title}**\n`;
        output += `- Object: ${issue.object}\n`;
        output += `- Impact: ${issue.impact}\n`;
        output += `- Action Required: ${issue.action}\n`;
        output += `- Est. Time: ${issue.estimatedTime}\n`;
      });
      output += '\n\n';
    }

    // Recommendations by priority
    output += this.formatter.section('Recommendations', { type: 'info', level: 2 });

    output += '\n**Immediate (This Week):**\n';
    output += this.formatter.numberedList(auditData.recommendations.immediate);

    output += '\n\n**Short Term (1-2 Weeks):**\n';
    output += this.formatter.numberedList(auditData.recommendations.shortTerm);

    output += '\n\n**Long Term (1-3 Months):**\n';
    output += this.formatter.numberedList(auditData.recommendations.longTerm);
    output += '\n\n';

    // Remediation estimate
    output += this.formatter.section('Remediation Estimate', { type: 'metrics', level: 2 });
    output += this.formatter.metricsSummary({
      'Total Effort': `${auditData.totalEffortHours} hours`,
      'Engineering Time': `${auditData.engineeringWeeks} weeks`,
      'Priority Issues': auditData.severityCounts.CRITICAL + auditData.severityCounts.HIGH,
      'Quick Wins': auditData.quickWinCount,
      'Estimated Cost Savings': `$${auditData.costSavings}/year`
    });
    output += '\n\n';

    // Risk assessment
    output += this.formatter.section('Risk Assessment', { type: 'security', level: 2 });

    const riskLevel = auditData.overallRisk;
    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
      output += this.formatter.errorBox(
        `Overall risk level: ${riskLevel}`,
        [
          `${auditData.severityCounts.CRITICAL} critical issues require immediate attention`,
          'Automation conflicts may cause data integrity issues',
          'Performance degradation likely in high-volume scenarios',
          'Recommend emergency remediation sprint'
        ]
      );
    } else if (riskLevel === 'MEDIUM') {
      output += this.formatter.warningBox(
        `Overall risk level: ${riskLevel}`,
        [
          'Multiple automations competing on same objects',
          'Recommend systematic cleanup within 30 days',
          'Monitor for performance issues'
        ]
      );
    } else {
      output += this.formatter.successBox(
        `Overall risk level: ${riskLevel}`,
        {
          'Automation Health': 'Good',
          'Conflicts': 'Minimal',
          'Performance': 'Optimal'
        }
      );
    }
    output += '\n\n';

    // Before/After comparison
    if (auditData.previousAudit) {
      output += this.formatter.section('Progress Since Last Audit', { type: 'metrics', level: 2 });
      output += this.formatter.comparisonTable([
        {
          item: 'Total Automations',
          before: auditData.previousAudit.totalAutomations,
          after: auditData.totalAutomations,
          change: this.calculateChange(
            auditData.previousAudit.totalAutomations,
            auditData.totalAutomations
          )
        },
        {
          item: 'Conflicts',
          before: auditData.previousAudit.conflicts,
          after: auditData.conflictsDetected,
          change: this.calculateChange(
            auditData.previousAudit.conflicts,
            auditData.conflictsDetected
          )
        },
        {
          item: 'Critical Issues',
          before: auditData.previousAudit.critical,
          after: auditData.severityCounts.CRITICAL,
          change: this.calculateChange(
            auditData.previousAudit.critical,
            auditData.severityCounts.CRITICAL
          )
        }
      ], { beforeLabel: 'Previous Audit', afterLabel: 'Current Audit' });
      output += '\n\n';
    }

    // Next steps
    output += this.formatter.section('Next Steps', { type: 'info', level: 2 });
    output += this.formatter.numberedList([
      'Review critical issues with development team',
      'Schedule remediation sprint (${auditData.engineeringWeeks} weeks)',
      'Implement trigger handler pattern on high-conflict objects',
      'Set up monitoring for automation execution times',
      'Schedule follow-up audit in 3 months'
    ]);
    output += '\n\n';

    // Report files
    output += this.formatter.section('Report Files', { type: 'documentation', level: 2 });
    output += this.formatter.bulletList([
      '`reports/Executive_Summary.md` - Complete leadership report',
      '`reports/Conflicts_Export.csv` - All conflicts in spreadsheet format',
      '`reports/Triggers_Inventory.csv` - Complete trigger list',
      '`reports/Metrics_Summary.json` - Machine-readable metrics',
      '`findings/Conflicts.json` - Raw conflict data'
    ]);
    output += '\n\n';

    // Footer
    output += '─'.repeat(80) + '\n';
    output += `Generated by: Automation Auditor v1.0\n`;
    output += `Report Date: ${new Date().toISOString()}\n`;
    output += `🤖 Generated with Claude Code - Structured Content Formatter\n`;

    return output;
  }

  getRiskBadge(risk) {
    const badges = {
      CRITICAL: '🔴 **CRITICAL**',
      HIGH: '🟠 **HIGH**',
      MEDIUM: '🟡 **MEDIUM**',
      LOW: '🟢 **LOW**'
    };
    return badges[risk] || risk;
  }

  calculateChange(oldValue, newValue) {
    const diff = newValue - oldValue;
    const percent = ((diff / oldValue) * 100).toFixed(1);
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff} (${sign}${percent}%)`;
  }
}

// Example audit data
const exampleAudit = {
  auditDate: '2025-11-04',
  orgName: 'Production',
  orgId: '00D1234567890ABC',
  totalAutomations: 187,
  conflictsDetected: 23,
  overallRisk: 'HIGH',
  inventory: [
    { type: 'Apex Triggers', count: 45, active: 42, inactive: 3 },
    { type: 'Flows', count: 78, active: 65, inactive: 13 },
    { type: 'Process Builder', count: 32, active: 28, inactive: 4 },
    { type: 'Workflow Rules', count: 32, active: 25, inactive: 7 }
  ],
  severityCounts: {
    CRITICAL: 5,
    HIGH: 8,
    MEDIUM: 7,
    LOW: 3
  },
  hotspots: [
    { object: 'Account', triggerCount: 5, flowCount: 8, ruleCount: 3, totalConflicts: 6, risk: '🔴 HIGH' },
    { object: 'Opportunity', triggerCount: 4, flowCount: 6, ruleCount: 2, totalConflicts: 5, risk: '🔴 HIGH' },
    { object: 'Lead', triggerCount: 3, flowCount: 4, ruleCount: 2, totalConflicts: 3, risk: '🟠 MEDIUM' },
    { object: 'Contact', triggerCount: 2, flowCount: 5, ruleCount: 1, totalConflicts: 2, risk: '🟡 LOW' },
    { object: 'Case', triggerCount: 3, flowCount: 3, ruleCount: 1, totalConflicts: 2, risk: '🟡 LOW' }
  ],
  criticalIssues: [
    {
      title: 'Multiple unordered triggers on Account',
      object: 'Account',
      impact: 'Race conditions causing data inconsistency',
      action: 'Consolidate to single trigger with handler class',
      estimatedTime: '8-12 hours'
    },
    {
      title: 'Flow and Process Builder conflict on Opportunity',
      object: 'Opportunity',
      impact: 'Duplicate field updates, performance degradation',
      action: 'Migrate Process Builder to Flow, disable old process',
      estimatedTime: '4-6 hours'
    }
  ],
  recommendations: {
    immediate: [
      'Consolidate 5 Account triggers into single handler pattern',
      'Disable conflicting Process Builder on Opportunity',
      'Fix critical ordering issue on Lead object'
    ],
    shortTerm: [
      'Migrate remaining Process Builders to Flows (32 total)',
      'Implement trigger handler framework',
      'Add unit tests for consolidated triggers'
    ],
    longTerm: [
      'Decommission Workflow Rules (32 total)',
      'Establish automation governance framework',
      'Implement automated conflict detection in CI/CD'
    ]
  },
  totalEffortHours: 120,
  engineeringWeeks: 3,
  quickWinCount: 8,
  costSavings: 48000,
  previousAudit: {
    totalAutomations: 175,
    conflicts: 28,
    critical: 7
  }
};

// Generate and display report
if (require.main === module) {
  const auditor = new AutomationAuditor();
  const report = auditor.generateReport(exampleAudit);

  console.log(report);

  console.log('\n' + '='.repeat(80));
  console.log('✅ Example audit report generated successfully!');
  console.log('='.repeat(80) + '\n');
}

module.exports = AutomationAuditor;
