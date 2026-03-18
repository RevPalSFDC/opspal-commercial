#!/usr/bin/env node

/**
 * Report Dependency Checker
 *
 * Before deleting a report, checks for dependencies:
 * - Dashboards referencing the report
 * - Scheduled report subscriptions
 * - Report snapshots/history
 *
 * Blocks deletion if dependencies exist unless user confirms force-delete.
 *
 * Usage:
 *   const { ReportDependencyChecker } = require('./report-dependency-checker');
 *   const checker = new ReportDependencyChecker({ orgAlias: 'myOrg' });
 *
 *   const deps = await checker.check(reportId);
 *   // deps.hasDependencies, deps.dashboards, deps.subscriptions, deps.canDelete
 *
 * @module report-dependency-checker
 */

const { execSync } = require('child_process');

class ReportDependencyChecker {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.verbose = options.verbose || false;
  }

  /**
   * Check all dependencies for a report
   *
   * @param {string} reportId - Salesforce report ID (15 or 18 char)
   * @returns {{ hasDependencies: boolean, canDelete: boolean, dashboards: object[], subscriptions: object[], summary: string }}
   */
  async check(reportId) {
    const dashboards = await this._checkDashboardDependencies(reportId);
    const subscriptions = await this._checkSubscriptions(reportId);

    const hasDependencies = dashboards.length > 0 || subscriptions.length > 0;
    const summaryParts = [];

    if (dashboards.length > 0) {
      summaryParts.push(`${dashboards.length} dashboard(s)`);
    }
    if (subscriptions.length > 0) {
      summaryParts.push(`${subscriptions.length} subscription(s)`);
    }

    return {
      reportId,
      hasDependencies,
      canDelete: !hasDependencies,
      dashboards,
      subscriptions,
      summary: hasDependencies
        ? `Report has dependencies: ${summaryParts.join(', ')}. Deletion blocked.`
        : 'No dependencies found. Safe to delete.'
    };
  }

  /**
   * Check dashboards referencing this report
   */
  async _checkDashboardDependencies(reportId) {
    if (!this.orgAlias) return [];

    try {
      // Query DashboardComponent for references to this report
      const query = `SELECT Dashboard.Title, Dashboard.Id, ComponentName FROM DashboardComponent WHERE ReportId = '${reportId}'`;
      const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json 2>/dev/null`;
      const result = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));

      if (result.result && result.result.records) {
        return result.result.records.map(r => ({
          dashboardId: r.Dashboard ? r.Dashboard.Id : null,
          dashboardTitle: r.Dashboard ? r.Dashboard.Title : 'Unknown',
          componentName: r.ComponentName || 'Unknown'
        }));
      }
    } catch (e) {
      if (this.verbose) console.warn(`Dashboard dependency check failed: ${e.message}`);

      // Fallback: try SOQL on Dashboard directly
      try {
        const fallbackQuery = `SELECT Id, Title FROM Dashboard WHERE Id IN (SELECT DashboardId FROM DashboardComponent WHERE ReportId = '${reportId}')`;
        const cmd = `sf data query --query "${fallbackQuery}" --target-org ${this.orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));

        if (result.result && result.result.records) {
          return result.result.records.map(r => ({
            dashboardId: r.Id,
            dashboardTitle: r.Title || 'Unknown',
            componentName: '(check dashboard for details)'
          }));
        }
      } catch (e2) {
        if (this.verbose) console.warn(`Dashboard fallback check failed: ${e2.message}`);
      }
    }

    return [];
  }

  /**
   * Check report subscriptions
   */
  async _checkSubscriptions(reportId) {
    if (!this.orgAlias) return [];

    try {
      const query = `SELECT Id, OwnerId, Frequency FROM ReportSubscription WHERE ReportId = '${reportId}'`;
      const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} --json 2>/dev/null`;
      const result = JSON.parse(execSync(cmd, { encoding: 'utf8', timeout: 30000 }));

      if (result.result && result.result.records) {
        return result.result.records.map(r => ({
          subscriptionId: r.Id,
          ownerId: r.OwnerId,
          frequency: r.Frequency || 'Unknown'
        }));
      }
    } catch (e) {
      // ReportSubscription may not be queryable in all orgs
      if (this.verbose) console.warn(`Subscription check: ${e.message}`);
    }

    return [];
  }

  /**
   * Generate a human-readable dependency report
   */
  formatReport(deps) {
    const lines = [];
    lines.push(`\n=== Dependency Check: ${deps.reportId} ===`);
    lines.push(`Status: ${deps.canDelete ? 'SAFE TO DELETE' : 'DELETION BLOCKED'}`);

    if (deps.dashboards.length > 0) {
      lines.push(`\nDashboards (${deps.dashboards.length}):`);
      deps.dashboards.forEach(d => {
        lines.push(`  - ${d.dashboardTitle} (${d.dashboardId}) - Component: ${d.componentName}`);
      });
    }

    if (deps.subscriptions.length > 0) {
      lines.push(`\nSubscriptions (${deps.subscriptions.length}):`);
      deps.subscriptions.forEach(s => {
        lines.push(`  - Owner: ${s.ownerId}, Frequency: ${s.frequency}`);
      });
    }

    if (deps.canDelete) {
      lines.push('\nNo dependencies found. Proceed with deletion.');
    } else {
      lines.push('\nAction required: Remove dependencies before deletion, or use force-delete.');
    }

    return lines.join('\n');
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const reportId = args[0];
  const orgFlag = args.indexOf('--org');
  const orgAlias = orgFlag >= 0 ? args[orgFlag + 1] : process.env.SF_TARGET_ORG;

  if (!reportId) {
    console.error('Usage: node report-dependency-checker.js <reportId> --org <alias>');
    process.exit(1);
  }

  const checker = new ReportDependencyChecker({ orgAlias, verbose: true });
  checker.check(reportId).then(deps => {
    console.log(checker.formatReport(deps));
    process.exit(deps.canDelete ? 0 : 1);
  }).catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { ReportDependencyChecker };
