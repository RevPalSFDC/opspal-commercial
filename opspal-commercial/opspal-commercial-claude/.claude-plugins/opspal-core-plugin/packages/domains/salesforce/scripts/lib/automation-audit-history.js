#!/usr/bin/env node
/**
 * Automation Audit History & Comparison Tool
 *
 * Tracks automation audits over time and generates delta reports showing
 * remediation progress, new conflicts, and trend analysis.
 *
 * Features:
 * - List all audits for an org with summary metrics
 * - Compare two audits (delta report)
 * - Track remediation progress over time
 * - Generate trend charts (conflict count, risk scores)
 * - Identify new vs resolved conflicts
 * - Calculate improvement metrics
 *
 * Usage:
 *   node automation-audit-history.js <org-alias> <command> [options]
 *
 * Commands:
 *   list                     List all audits for org
 *   compare <audit1> <audit2> Compare two audits
 *   latest                   Show latest audit summary
 *   trends                   Show trends across all audits
 *
 * @version 1.0.0
 * @date 2025-10-08
 */

const fs = require('fs');
const path = require('path');
const { PathResolver, PathNotFoundError } = require('./multi-path-resolver');

class AutomationAuditHistory {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;

    // Quick Win: Use PathResolver instead of hardcoded path
    // Handles multiple path conventions automatically
    const resolver = new PathResolver({ verbose: false, throwOnNotFound: false });
    this.instanceDir = resolver.findInstancePath(orgAlias, {
      platform: 'salesforce',
      fromDirectory: path.join(__dirname, '../..')
    });

    // Fall back to default if not found (for backwards compatibility)
    if (!this.instanceDir) {
      this.instanceDir = `./instances/${orgAlias}`;
    }
  }

  /**
   * Find all audit directories for org
   */
  findAllAudits() {
    if (!fs.existsSync(this.instanceDir)) {
      return [];
    }

    const entries = fs.readdirSync(this.instanceDir, { withFileTypes: true });

    const audits = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('automation-audit-'))
      .map(entry => {
        const auditDir = path.join(this.instanceDir, entry.name);
        const metricsPath = path.join(auditDir, 'reports/Metrics_Summary.json');
        const conflictsPath = path.join(auditDir, 'findings/Conflicts.json');

        let metrics = null;
        let conflictCount = 0;

        try {
          if (fs.existsSync(metricsPath)) {
            metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
          }

          if (fs.existsSync(conflictsPath)) {
            const conflicts = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
            conflictCount = conflicts.length;
          }
        } catch (error) {
          console.warn(`Warning: Could not read metrics for ${entry.name}`);
        }

        return {
          id: entry.name,
          path: auditDir,
          timestamp: entry.name.replace('automation-audit-', ''),
          metrics: metrics,
          conflictCount: conflictCount
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Most recent first

    return audits;
  }

  /**
   * List all audits with summary
   */
  listAudits() {
    const audits = this.findAllAudits();

    if (audits.length === 0) {
      console.log(`No automation audits found for org: ${this.orgAlias}`);
      console.log(`\nTo create your first audit:`);
      console.log(`  Task: sfdc-automation-auditor`);
      console.log(`  Prompt: "Run complete automation audit on ${this.orgAlias}"`);
      return;
    }

    console.log(`\n📊 Automation Audit History for ${this.orgAlias}`);
    console.log(`Found ${audits.length} audit(s)\n`);
    console.log('═'.repeat(80));

    audits.forEach((audit, index) => {
      const date = new Date(parseInt(audit.timestamp));
      const dateStr = date.toISOString().split('T')[0];

      console.log(`\n${index + 1}. ${audit.id}`);
      console.log(`   Date: ${dateStr}`);

      if (audit.metrics) {
        console.log(`   Total Conflicts: ${audit.conflictCount}`);

        const severity = audit.metrics.conflicts?.bySeverity || {};
        if (severity.CRITICAL) console.log(`     CRITICAL: ${severity.CRITICAL}`);
        if (severity.HIGH) console.log(`     HIGH: ${severity.HIGH}`);
        if (severity.MEDIUM) console.log(`     MEDIUM: ${severity.MEDIUM}`);
        if (severity.LOW) console.log(`     LOW: ${severity.LOW}`);

        const risk = audit.metrics.riskAssessment?.overallRisk || 'UNKNOWN';
        console.log(`   Overall Risk: ${risk}`);

        const inventory = audit.metrics.inventory || {};
        console.log(`   Components: ${inventory.totalAutomations || 'N/A'} (${inventory.triggers || 0} triggers, ${inventory.flows || 0} flows)`);
      } else {
        console.log(`   Metrics: Not available`);
      }

      console.log(`   Path: ${audit.path}`);
    });

    console.log('\n' + '═'.repeat(80));

    // Show latest link
    const latestLink = path.join(this.instanceDir, 'latest-audit');
    if (fs.existsSync(latestLink)) {
      const latestTarget = fs.readlinkSync(latestLink);
      console.log(`\n📌 Latest Audit: ${latestTarget}`);
      console.log(`   Access via: ${latestLink}`);
    }

    console.log('');
  }

  /**
   * Compare two audits and generate delta report
   */
  compareAudits(auditId1, auditId2) {
    console.log(`\n🔍 Comparing Automation Audits\n`);

    const audit1 = this.loadAudit(auditId1);
    const audit2 = this.loadAudit(auditId2);

    if (!audit1 || !audit2) {
      console.error('Error: Could not load one or both audits');
      return;
    }

    const date1 = new Date(parseInt(audit1.id.replace('automation-audit-', '')));
    const date2 = new Date(parseInt(audit2.id.replace('automation-audit-', '')));

    console.log(`Baseline: ${audit1.id} (${date1.toISOString().split('T')[0]})`);
    console.log(`Current:  ${audit2.id} (${date2.toISOString().split('T')[0]})`);
    console.log('');
    console.log('═'.repeat(80));

    // Compare conflicts
    const delta = this.calculateDelta(audit1, audit2);

    console.log(`\n📊 Summary`);
    console.log(`   Total Conflicts: ${audit1.conflictCount} → ${audit2.conflictCount} (${this.formatDelta(delta.conflictCountDelta)})`);

    if (delta.conflictCountDelta < 0) {
      console.log(`   ✓ ${Math.abs(delta.conflictCountDelta)} conflict(s) resolved!`);
    } else if (delta.conflictCountDelta > 0) {
      console.log(`   ⚠ ${delta.conflictCountDelta} new conflict(s) detected`);
    } else {
      console.log(`   No change in conflict count`);
    }

    // Risk level changes
    if (audit1.metrics && audit2.metrics) {
      const risk1 = audit1.metrics.riskAssessment?.overallRisk || 'UNKNOWN';
      const risk2 = audit2.metrics.riskAssessment?.overallRisk || 'UNKNOWN';

      console.log(`   Overall Risk: ${risk1} → ${risk2}`);
    }

    // Severity breakdown
    console.log(`\n📈 By Severity:`);

    const sev1 = audit1.metrics?.conflicts?.bySeverity || {};
    const sev2 = audit2.metrics?.conflicts?.bySeverity || {};

    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
      const count1 = sev1[severity] || 0;
      const count2 = sev2[severity] || 0;
      const delta = count2 - count1;

      console.log(`   ${severity}: ${count1} → ${count2} (${this.formatDelta(delta)})`);
    });

    // New conflicts
    if (delta.newConflicts.length > 0) {
      console.log(`\n🆕 New Conflicts (${delta.newConflicts.length}):`);
      delta.newConflicts.slice(0, 5).forEach(conflict => {
        console.log(`   - ${conflict.object} (${conflict.severity}): ${conflict.triggerCount} triggers`);
      });

      if (delta.newConflicts.length > 5) {
        console.log(`   ... and ${delta.newConflicts.length - 5} more`);
      }
    }

    // Resolved conflicts
    if (delta.resolvedConflicts.length > 0) {
      console.log(`\n✅ Resolved Conflicts (${delta.resolvedConflicts.length}):`);
      delta.resolvedConflicts.slice(0, 5).forEach(conflict => {
        console.log(`   - ${conflict.object} (was ${conflict.severity}): ${conflict.triggerCount} triggers consolidated`);
      });

      if (delta.resolvedConflicts.length > 5) {
        console.log(`   ... and ${delta.resolvedConflicts.length - 5} more`);
      }
    }

    // Changed conflicts
    if (delta.changedConflicts.length > 0) {
      console.log(`\n🔄 Changed Conflicts (${delta.changedConflicts.length}):`);
      delta.changedConflicts.slice(0, 5).forEach(change => {
        console.log(`   - ${change.object}: ${change.oldTriggerCount} → ${change.newTriggerCount} triggers (${change.oldSeverity} → ${change.newSeverity})`);
      });

      if (delta.changedConflicts.length > 5) {
        console.log(`   ... and ${delta.changedConflicts.length - 5} more`);
      }
    }

    console.log('\n' + '═'.repeat(80));

    // Save comparison report
    const reportPath = path.join(
      audit2.path,
      'reports',
      `Comparison_vs_${audit1.id}.json`
    );

    fs.writeFileSync(reportPath, JSON.stringify(delta, null, 2), 'utf8');
    console.log(`\n💾 Comparison report saved to: ${reportPath}\n`);

    return delta;
  }

  /**
   * Load audit data
   */
  loadAudit(auditId) {
    let auditPath;

    // Handle 'latest' keyword
    if (auditId === 'latest') {
      const latestLink = path.join(this.instanceDir, 'latest-audit');
      if (fs.existsSync(latestLink)) {
        const target = fs.readlinkSync(latestLink);
        auditId = target;
      } else {
        const audits = this.findAllAudits();
        if (audits.length === 0) {
          console.error('No audits found');
          return null;
        }
        auditId = audits[0].id; // Most recent
      }
    }

    // Find audit directory
    if (auditId.startsWith('automation-audit-')) {
      auditPath = path.join(this.instanceDir, auditId);
    } else {
      auditPath = path.join(this.instanceDir, `automation-audit-${auditId}`);
    }

    if (!fs.existsSync(auditPath)) {
      console.error(`Audit not found: ${auditPath}`);
      return null;
    }

    // Load data
    const metricsPath = path.join(auditPath, 'reports/Metrics_Summary.json');
    const conflictsPath = path.join(auditPath, 'findings/Conflicts.json');

    const audit = {
      id: path.basename(auditPath),
      path: auditPath,
      metrics: null,
      conflicts: [],
      conflictCount: 0
    };

    if (fs.existsSync(metricsPath)) {
      audit.metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    }

    if (fs.existsSync(conflictsPath)) {
      audit.conflicts = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
      audit.conflictCount = audit.conflicts.length;
    }

    return audit;
  }

  /**
   * Calculate delta between two audits
   */
  calculateDelta(audit1, audit2) {
    const conflicts1 = audit1.conflicts || [];
    const conflicts2 = audit2.conflicts || [];

    // Create lookup maps by object
    const map1 = new Map(conflicts1.map(c => [c.object, c]));
    const map2 = new Map(conflicts2.map(c => [c.object, c]));

    // Find new conflicts (in audit2 but not audit1)
    const newConflicts = conflicts2.filter(c => !map1.has(c.object));

    // Find resolved conflicts (in audit1 but not audit2)
    const resolvedConflicts = conflicts1.filter(c => !map2.has(c.object));

    // Find changed conflicts (in both but different)
    const changedConflicts = [];
    conflicts2.forEach(c2 => {
      const c1 = map1.get(c2.object);
      if (c1 && (c1.triggerCount !== c2.triggerCount || c1.severity !== c2.severity)) {
        changedConflicts.push({
          object: c2.object,
          oldTriggerCount: c1.triggerCount,
          newTriggerCount: c2.triggerCount,
          oldSeverity: c1.severity,
          newSeverity: c2.severity,
          improvement: c1.triggerCount > c2.triggerCount
        });
      }
    });

    return {
      baseline: audit1.id,
      current: audit2.id,
      conflictCountDelta: audit2.conflictCount - audit1.conflictCount,
      newConflicts: newConflicts,
      resolvedConflicts: resolvedConflicts,
      changedConflicts: changedConflicts,
      summary: {
        totalNew: newConflicts.length,
        totalResolved: resolvedConflicts.length,
        totalChanged: changedConflicts.length,
        improvements: changedConflicts.filter(c => c.improvement).length,
        regressions: changedConflicts.filter(c => !c.improvement).length
      }
    };
  }

  /**
   * Format delta with +/- indicator
   */
  formatDelta(delta) {
    if (delta > 0) return `+${delta}`;
    if (delta < 0) return `${delta}`;
    return '0';
  }

  /**
   * Show latest audit summary
   */
  showLatest() {
    const audits = this.findAllAudits();

    if (audits.length === 0) {
      console.log(`No audits found for org: ${this.orgAlias}`);
      return;
    }

    const latest = audits[0];
    const date = new Date(parseInt(latest.timestamp));

    console.log(`\n📊 Latest Automation Audit for ${this.orgAlias}`);
    console.log(`Date: ${date.toISOString().split('T')[0]}\n`);

    if (latest.metrics) {
      console.log(`Total Conflicts: ${latest.conflictCount}`);

      const severity = latest.metrics.conflicts?.bySeverity || {};
      if (severity.CRITICAL) console.log(`  CRITICAL: ${severity.CRITICAL}`);
      if (severity.HIGH) console.log(`  HIGH: ${severity.HIGH}`);
      if (severity.MEDIUM) console.log(`  MEDIUM: ${severity.MEDIUM}`);
      if (severity.LOW) console.log(`  LOW: ${severity.LOW}`);

      console.log(`\nOverall Risk: ${latest.metrics.riskAssessment?.overallRisk || 'UNKNOWN'}`);

      const inventory = latest.metrics.inventory || {};
      console.log(`\nComponents Analyzed:`);
      console.log(`  Triggers: ${inventory.triggers || 0}`);
      console.log(`  Classes: ${inventory.classes || 0}`);
      console.log(`  Flows: ${inventory.flows || 0}`);
      console.log(`  Workflow Rules: ${inventory.workflowRules || 0}`);
    }

    console.log(`\nPath: ${latest.path}`);
    console.log(`Dashboard: ${latest.path}/dashboard/index.html`);
    console.log('');
  }

  /**
   * Generate trends across all audits
   */
  showTrends() {
    const audits = this.findAllAudits();

    if (audits.length < 2) {
      console.log(`\n⚠️ Need at least 2 audits to show trends`);
      console.log(`Current audits: ${audits.length}\n`);
      return;
    }

    console.log(`\n📈 Automation Audit Trends for ${this.orgAlias}`);
    console.log(`Based on ${audits.length} audit(s)\n`);
    console.log('═'.repeat(80));

    // Conflict count trend
    console.log(`\nConflict Count Over Time:`);
    audits.reverse().forEach((audit, index) => {
      const date = new Date(parseInt(audit.timestamp)).toISOString().split('T')[0];
      const bar = '█'.repeat(Math.min(audit.conflictCount, 50));
      console.log(`  ${date}: ${bar} ${audit.conflictCount}`);
    });

    // Calculate improvement rate
    if (audits.length >= 2) {
      const oldest = audits[0];
      const latest = audits[audits.length - 1];
      const improvement = oldest.conflictCount - latest.conflictCount;
      const improvementPct = Math.round((improvement / oldest.conflictCount) * 100);

      console.log(`\n📊 Overall Progress:`);
      console.log(`  Starting Conflicts: ${oldest.conflictCount}`);
      console.log(`  Current Conflicts: ${latest.conflictCount}`);
      console.log(`  Resolved: ${improvement} (${improvementPct}%)`);

      if (improvement > 0) {
        console.log(`  ✓ Positive trend - conflicts decreasing`);
      } else if (improvement < 0) {
        console.log(`  ⚠ Negative trend - conflicts increasing`);
      } else {
        console.log(`  = No change in conflict count`);
      }
    }

    console.log('\n' + '═'.repeat(80) + '\n');
  }
}

// CLI Execution
if (require.main === module) {
  const orgAlias = process.argv[2];
  const command = process.argv[3] || 'list';
  const arg1 = process.argv[4];
  const arg2 = process.argv[5];

  if (!orgAlias) {
    console.error('Usage: node automation-audit-history.js <org-alias> <command> [options]');
    console.error('');
    console.error('Commands:');
    console.error('  list                     List all audits for org');
    console.error('  latest                   Show latest audit summary');
    console.error('  compare <id1> <id2>      Compare two audits (use "latest" for most recent)');
    console.error('  trends                   Show trends across all audits');
    console.error('');
    console.error('Examples:');
    console.error('  node automation-audit-history.js neonone list');
    console.error('  node automation-audit-history.js neonone latest');
    console.error('  node automation-audit-history.js neonone compare 1759962799345 latest');
    console.error('  node automation-audit-history.js neonone trends');
    process.exit(1);
  }

  const history = new AutomationAuditHistory(orgAlias);

  try {
    switch (command) {
      case 'list':
        history.listAudits();
        break;

      case 'latest':
        history.showLatest();
        break;

      case 'compare':
        if (!arg1 || !arg2) {
          console.error('Error: compare command requires two audit IDs');
          console.error('Usage: node automation-audit-history.js <org> compare <audit-id-1> <audit-id-2>');
          process.exit(1);
        }
        history.compareAudits(arg1, arg2);
        break;

      case 'trends':
        history.showTrends();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Valid commands: list, latest, compare, trends');
        process.exit(1);
    }

    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = AutomationAuditHistory;
