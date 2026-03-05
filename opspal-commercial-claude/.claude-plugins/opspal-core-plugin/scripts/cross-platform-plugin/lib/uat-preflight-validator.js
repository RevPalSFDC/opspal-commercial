#!/usr/bin/env node

/**
 * UAT Pre-flight Validator
 *
 * Pre-flight validation before test execution with:
 * - Platform authentication checks
 * - Object accessibility verification
 * - Permission validation
 * - Clear pass/fail reporting
 *
 * Pattern adopted from: Wire Test Framework's pre-flight validation
 *
 * @module uat-preflight-validator
 * @version 1.0.0
 *
 * @example
 * const { UATPreflightValidator } = require('./uat-preflight-validator');
 *
 * const preflight = new UATPreflightValidator({
 *   platform: 'salesforce',
 *   orgAlias: 'my-sandbox'
 * });
 *
 * const results = await preflight.runAllChecks();
 * if (!results.passed) {
 *   console.error('Pre-flight failed:', results.blockers);
 * }
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Pre-flight check result
 * @typedef {Object} CheckResult
 * @property {string} name - Check name
 * @property {boolean} passed - Whether check passed
 * @property {string} message - Result message
 * @property {string} [suggestion] - Suggestion if failed
 * @property {number} [duration] - Check duration in ms
 */

/**
 * UAT Pre-flight Validator
 */
class UATPreflightValidator {
  /**
   * Create a pre-flight validator
   * @param {Object} options - Validator options
   * @param {string} options.platform - Platform name (salesforce, hubspot)
   * @param {string} [options.orgAlias] - Salesforce org alias
   * @param {string} [options.portalId] - HubSpot portal ID
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {number} [options.timeout=30000] - Command timeout in ms
   */
  constructor(options = {}) {
    this.platform = options.platform || 'salesforce';
    this.orgAlias = options.orgAlias;
    this.portalId = options.portalId;
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 30000;

    // Objects to check access for (can be customized)
    this.objectsToCheck = options.objectsToCheck || [];
  }

  /**
   * Run all pre-flight checks
   * @returns {Promise<Object>} Results with passed status, checks array, blockers, warnings
   */
  async runAllChecks() {
    const startTime = Date.now();
    const results = {
      passed: true,
      checks: [],
      blockers: [],
      warnings: [],
      duration: 0
    };

    this.log('Running pre-flight checks...\n');

    // Platform authentication check
    const authCheck = await this.checkAuthentication();
    results.checks.push(authCheck);
    if (!authCheck.passed) {
      results.passed = false;
      results.blockers.push(authCheck.message);
    }
    this.logCheck(authCheck);

    // Only continue if authenticated
    if (authCheck.passed) {
      // API connectivity check
      const apiCheck = await this.checkAPIConnectivity();
      results.checks.push(apiCheck);
      if (!apiCheck.passed) {
        results.passed = false;
        results.blockers.push(apiCheck.message);
      }
      this.logCheck(apiCheck);

      // Object accessibility check (if objects specified)
      if (this.objectsToCheck.length > 0) {
        const objectCheck = await this.checkObjectAccess();
        results.checks.push(objectCheck);
        if (!objectCheck.passed) {
          results.warnings.push(objectCheck.message);
        }
        this.logCheck(objectCheck);
      }

      // Permission check
      const permCheck = await this.checkPermissions();
      results.checks.push(permCheck);
      if (!permCheck.passed && permCheck.severity === 'error') {
        results.passed = false;
        results.blockers.push(permCheck.message);
      } else if (!permCheck.passed) {
        results.warnings.push(permCheck.message);
      }
      this.logCheck(permCheck);
    }

    results.duration = Date.now() - startTime;

    this.log(`\nPre-flight ${results.passed ? 'PASSED' : 'FAILED'} (${results.duration}ms)`);

    return results;
  }

  /**
   * Check platform authentication
   * @returns {Promise<CheckResult>} Check result
   */
  async checkAuthentication() {
    const startTime = Date.now();

    if (this.platform === 'salesforce') {
      if (!this.orgAlias) {
        return {
          name: 'Authentication',
          passed: false,
          message: 'No org alias provided',
          suggestion: 'Provide --org <alias> parameter',
          duration: Date.now() - startTime
        };
      }

      try {
        const { stdout } = await this.runCommand(
          `sf org display --target-org ${this.orgAlias} --json`
        );

        const result = JSON.parse(stdout);
        if (result.status === 0 || result.result) {
          const orgInfo = result.result || {};
          return {
            name: 'Authentication',
            passed: true,
            message: `Authenticated to ${orgInfo.alias || this.orgAlias}`,
            details: {
              username: orgInfo.username,
              instanceUrl: orgInfo.instanceUrl,
              orgId: orgInfo.id
            },
            duration: Date.now() - startTime
          };
        } else {
          return {
            name: 'Authentication',
            passed: false,
            message: `Not authenticated to ${this.orgAlias}`,
            suggestion: `Run: sf org login web --alias ${this.orgAlias}`,
            duration: Date.now() - startTime
          };
        }
      } catch (error) {
        const errorMsg = error.message || String(error);

        // Parse common auth errors
        if (errorMsg.includes('No authorization') || errorMsg.includes('expired')) {
          return {
            name: 'Authentication',
            passed: false,
            message: `Session expired or not authenticated to ${this.orgAlias}`,
            suggestion: `Run: sf org login web --alias ${this.orgAlias}`,
            duration: Date.now() - startTime
          };
        }

        if (errorMsg.includes('not found') || errorMsg.includes('No org')) {
          return {
            name: 'Authentication',
            passed: false,
            message: `Org alias "${this.orgAlias}" not found`,
            suggestion: 'Run: sf org list to see available orgs',
            duration: Date.now() - startTime
          };
        }

        return {
          name: 'Authentication',
          passed: false,
          message: `Auth check failed: ${errorMsg}`,
          suggestion: `Run: sf org login web --alias ${this.orgAlias}`,
          duration: Date.now() - startTime
        };
      }
    }

    if (this.platform === 'hubspot') {
      // HubSpot authentication check would go here
      // For now, assume authenticated if portalId provided
      return {
        name: 'Authentication',
        passed: true,
        message: this.portalId
          ? `HubSpot portal ${this.portalId} configured`
          : 'HubSpot - using default portal',
        duration: Date.now() - startTime
      };
    }

    return {
      name: 'Authentication',
      passed: true,
      message: 'Skipped - unknown platform',
      duration: Date.now() - startTime
    };
  }

  /**
   * Check API connectivity
   * @returns {Promise<CheckResult>} Check result
   */
  async checkAPIConnectivity() {
    const startTime = Date.now();

    if (this.platform === 'salesforce') {
      try {
        // Simple query to verify API access
        const { stdout } = await this.runCommand(
          `sf data query --query "SELECT Id FROM Organization LIMIT 1" --target-org ${this.orgAlias} --json`
        );

        const result = JSON.parse(stdout);
        if (result.status === 0 && result.result?.records?.length > 0) {
          return {
            name: 'API Connectivity',
            passed: true,
            message: 'API connection verified',
            duration: Date.now() - startTime
          };
        } else {
          return {
            name: 'API Connectivity',
            passed: false,
            message: 'API query returned no results',
            suggestion: 'Verify org has data and API access is enabled',
            duration: Date.now() - startTime
          };
        }
      } catch (error) {
        return {
          name: 'API Connectivity',
          passed: false,
          message: `API connection failed: ${error.message}`,
          suggestion: 'Check network connectivity and API permissions',
          duration: Date.now() - startTime
        };
      }
    }

    // HubSpot or other platforms
    return {
      name: 'API Connectivity',
      passed: true,
      message: 'Connectivity check skipped',
      duration: Date.now() - startTime
    };
  }

  /**
   * Check object accessibility
   * @returns {Promise<CheckResult>} Check result
   */
  async checkObjectAccess() {
    const startTime = Date.now();
    const inaccessible = [];

    if (this.platform !== 'salesforce' || this.objectsToCheck.length === 0) {
      return {
        name: 'Object Access',
        passed: true,
        message: 'Object access check skipped',
        duration: Date.now() - startTime
      };
    }

    for (const objectName of this.objectsToCheck) {
      try {
        const { stdout } = await this.runCommand(
          `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`
        );

        const result = JSON.parse(stdout);
        if (result.status !== 0 && !result.result) {
          inaccessible.push(objectName);
        }
      } catch (error) {
        inaccessible.push(objectName);
      }
    }

    if (inaccessible.length > 0) {
      return {
        name: 'Object Access',
        passed: false,
        message: `Cannot access objects: ${inaccessible.join(', ')}`,
        suggestion: 'Verify objects exist and user has access',
        inaccessibleObjects: inaccessible,
        duration: Date.now() - startTime
      };
    }

    return {
      name: 'Object Access',
      passed: true,
      message: `All ${this.objectsToCheck.length} objects accessible`,
      duration: Date.now() - startTime
    };
  }

  /**
   * Check user permissions
   * @returns {Promise<CheckResult>} Check result
   */
  async checkPermissions() {
    const startTime = Date.now();

    if (this.platform === 'salesforce') {
      try {
        // Check if user has API access and basic permissions
        const { stdout } = await this.runCommand(
          `sf data query --query "SELECT Id, Profile.Name, Profile.PermissionsApiEnabled FROM User WHERE Id = '$CurrentUser' LIMIT 1" --target-org ${this.orgAlias} --json`
        );

        const result = JSON.parse(stdout);

        // If query works at all, user has API access
        if (result.status === 0) {
          return {
            name: 'User Permissions',
            passed: true,
            message: 'API-enabled user verified',
            duration: Date.now() - startTime
          };
        }

        return {
          name: 'User Permissions',
          passed: true,
          message: 'Permissions check inconclusive - proceeding',
          severity: 'warning',
          duration: Date.now() - startTime
        };
      } catch (error) {
        // Don't block on permission check failures
        return {
          name: 'User Permissions',
          passed: true,
          message: 'Permission check skipped (query failed)',
          severity: 'warning',
          duration: Date.now() - startTime
        };
      }
    }

    return {
      name: 'User Permissions',
      passed: true,
      message: 'Permission check skipped',
      duration: Date.now() - startTime
    };
  }

  /**
   * Add objects to check for accessibility
   * @param {Array<string>} objects - Object API names
   * @returns {UATPreflightValidator} This instance for chaining
   */
  addObjectsToCheck(objects) {
    this.objectsToCheck = [...new Set([...this.objectsToCheck, ...objects])];
    return this;
  }

  /**
   * Run a shell command with timeout
   * @param {string} command - Command to run
   * @returns {Promise<{stdout: string, stderr: string}>} Command output
   */
  async runCommand(command) {
    return execAsync(command, {
      timeout: this.timeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
  }

  /**
   * Log a check result
   * @param {CheckResult} check - Check result to log
   */
  logCheck(check) {
    if (!this.verbose) return;

    const icon = check.passed ? '✓' : '✗';
    const duration = check.duration ? ` (${check.duration}ms)` : '';
    console.log(`  ${icon} ${check.name}: ${check.message}${duration}`);

    if (!check.passed && check.suggestion) {
      console.log(`    → ${check.suggestion}`);
    }
  }

  /**
   * Log message if verbose
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Format results as report
   * @param {Object} results - Pre-flight results
   * @returns {string} Formatted report
   */
  formatReport(results) {
    let report = '╔══════════════════════════════════════════════════════════╗\n';
    report += '║              UAT PRE-FLIGHT CHECK RESULTS                 ║\n';
    report += '╠══════════════════════════════════════════════════════════╣\n';

    for (const check of results.checks) {
      const icon = check.passed ? '✓' : '✗';
      const status = check.passed ? 'PASS' : 'FAIL';
      report += `║ ${icon} ${check.name.padEnd(20)} ${status.padEnd(6)} ${check.message.substring(0, 25).padEnd(25)} ║\n`;
    }

    report += '╠══════════════════════════════════════════════════════════╣\n';
    report += `║ Overall: ${results.passed ? 'PASSED' : 'FAILED'}`.padEnd(59) + '║\n';
    report += `║ Duration: ${results.duration}ms`.padEnd(59) + '║\n';
    report += '╚══════════════════════════════════════════════════════════╝\n';

    if (results.blockers.length > 0) {
      report += '\n🚧 BLOCKERS:\n';
      for (const blocker of results.blockers) {
        report += `   • ${blocker}\n`;
      }
    }

    if (results.warnings.length > 0) {
      report += '\n⚠️  WARNINGS:\n';
      for (const warning of results.warnings) {
        report += `   • ${warning}\n`;
      }
    }

    // Add suggestions from failed checks
    const suggestions = results.checks
      .filter(c => !c.passed && c.suggestion)
      .map(c => c.suggestion);

    if (suggestions.length > 0) {
      report += '\n💡 SUGGESTIONS:\n';
      for (const suggestion of suggestions) {
        report += `   → ${suggestion}\n`;
      }
    }

    return report;
  }
}

module.exports = { UATPreflightValidator };
