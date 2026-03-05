#!/usr/bin/env node
/**
 * Flow Activation Verifier
 *
 * Verifies Flow activation status post-deployment and auto-activates if needed.
 *
 * Addresses: Cohort 3 (tool-contract) - 9 reflections, $36K ROI
 *
 * Prevention Targets:
 * - Flows deploying as Draft even with Active status
 * - Post-deploy activation failures not caught
 * - Missing validation of Flow activation requirements
 *
 * Features:
 * - Query FlowDefinition post-deployment
 * - Auto-activate Flows that should be Active
 * - Validate activation prerequisites
 * - Handle version conflicts
 *
 * Usage:
 *   node flow-activation-verifier.js verify <org-alias> <flow-name>
 *   node flow-activation-verifier.js activate <org-alias> <flow-name>
 *   node flow-activation-verifier.js list <org-alias> [--status Draft|Active]
 *   node flow-activation-verifier.js batch-verify <org-alias> --flows flow1,flow2
 *
 * @module flow-activation-verifier
 * @version 1.0.0
 * @created 2026-01-19
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STATUS = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  OBSOLETE: 'Obsolete',
  INACTIVE: 'InvalidDraft'
};

const PROCESS_TYPES = {
  AUTO_LAUNCHED: 'AutoLaunchedFlow',
  SCREEN: 'Flow',
  RECORD_TRIGGERED: 'RecordTriggeredFlow',
  SCHEDULED: 'AutoLaunchedFlow', // Scheduled flows are also AutoLaunchedFlow
  PLATFORM_EVENT: 'AutoLaunchedFlow'
};

class FlowActivationVerifier {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.timeout = options.timeout || 60000;
    this.stats = {
      verified: 0,
      activated: 0,
      failed: 0,
      skipped: 0
    };
  }

  log(message, level = 'info') {
    if (this.verbose || level === 'error') {
      const prefix = {
        info: '  ',
        warn: '  ',
        error: '  ',
        success: '  '
      };
      console.log(`${prefix[level] || '  '}${message}`);
    }
  }

  /**
   * Execute SF CLI command with error handling
   */
  executeCommand(command, parseJson = true) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (parseJson) {
        return JSON.parse(result);
      }
      return result;
    } catch (error) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout);
        } catch {
          // Not JSON
        }
      }
      throw error;
    }
  }

  /**
   * Get Flow information from org
   */
  async getFlowInfo(orgAlias, flowApiName) {
    const query = `
      SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, Description
      FROM FlowDefinition
      WHERE DeveloperName = '${flowApiName}'
    `.replace(/\n\s+/g, ' ').trim();

    const result = this.executeCommand(
      `sf data query --query "${query}" --target-org ${orgAlias} --use-tooling-api --json`
    );

    if (result.status === 0 && result.result?.records?.length > 0) {
      const flow = result.result.records[0];

      // Get version details if available
      if (flow.LatestVersionId) {
        const versionInfo = await this.getFlowVersionInfo(orgAlias, flow.LatestVersionId);
        flow.latestVersion = versionInfo;
      }

      if (flow.ActiveVersionId && flow.ActiveVersionId !== flow.LatestVersionId) {
        const activeVersionInfo = await this.getFlowVersionInfo(orgAlias, flow.ActiveVersionId);
        flow.activeVersion = activeVersionInfo;
      }

      return flow;
    }

    return null;
  }

  /**
   * Get Flow version details
   */
  async getFlowVersionInfo(orgAlias, versionId) {
    const query = `
      SELECT Id, VersionNumber, Status, ProcessType, Description
      FROM Flow
      WHERE Id = '${versionId}'
    `.replace(/\n\s+/g, ' ').trim();

    const result = this.executeCommand(
      `sf data query --query "${query}" --target-org ${orgAlias} --use-tooling-api --json`
    );

    if (result.status === 0 && result.result?.records?.length > 0) {
      return result.result.records[0];
    }

    return null;
  }

  /**
   * List all Flows in org
   */
  async listFlows(orgAlias, options = {}) {
    const { status = null, processType = null } = options;

    let query = `
      SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId
      FROM FlowDefinition
    `.replace(/\n\s+/g, ' ').trim();

    const result = this.executeCommand(
      `sf data query --query "${query}" --target-org ${orgAlias} --use-tooling-api --json`
    );

    if (result.status !== 0) {
      throw new Error(`Failed to list Flows: ${result.message}`);
    }

    let flows = result.result?.records || [];

    // Enrich with version info and filter
    const enriched = [];
    for (const flow of flows) {
      const isActive = !!flow.ActiveVersionId;
      const flowStatus = isActive ? STATUS.ACTIVE : STATUS.DRAFT;

      if (status && flowStatus !== status) {
        continue;
      }

      enriched.push({
        developerName: flow.DeveloperName,
        status: flowStatus,
        hasActiveVersion: isActive,
        activeVersionId: flow.ActiveVersionId,
        latestVersionId: flow.LatestVersionId,
        needsActivation: !isActive && flow.LatestVersionId
      });
    }

    return enriched;
  }

  /**
   * Verify Flow is in expected state
   */
  async verifyFlow(orgAlias, flowApiName, expectedStatus = STATUS.ACTIVE) {
    const result = {
      flowName: flowApiName,
      verified: false,
      actualStatus: null,
      expectedStatus: expectedStatus,
      needsActivation: false,
      errors: [],
      warnings: []
    };

    try {
      const flowInfo = await this.getFlowInfo(orgAlias, flowApiName);

      if (!flowInfo) {
        result.errors.push(`Flow '${flowApiName}' not found in org`);
        this.stats.failed++;
        return result;
      }

      // Determine actual status
      result.hasActiveVersion = !!flowInfo.ActiveVersionId;
      result.actualStatus = result.hasActiveVersion ? STATUS.ACTIVE : STATUS.DRAFT;
      result.latestVersionId = flowInfo.LatestVersionId;
      result.activeVersionId = flowInfo.ActiveVersionId;

      // Check if versions match
      result.versionsMatch = flowInfo.ActiveVersionId === flowInfo.LatestVersionId;

      if (!result.versionsMatch && result.hasActiveVersion) {
        result.warnings.push(
          `Active version (${flowInfo.ActiveVersionId}) differs from latest version (${flowInfo.LatestVersionId})`
        );
      }

      // Verify against expected status
      if (expectedStatus === STATUS.ACTIVE) {
        if (result.hasActiveVersion) {
          result.verified = true;
          this.stats.verified++;
        } else {
          result.needsActivation = true;
          result.errors.push(`Flow is ${STATUS.DRAFT} but expected ${STATUS.ACTIVE}`);
          this.stats.failed++;
        }
      } else if (expectedStatus === STATUS.DRAFT) {
        if (!result.hasActiveVersion) {
          result.verified = true;
          this.stats.verified++;
        } else {
          result.errors.push(`Flow is ${STATUS.ACTIVE} but expected ${STATUS.DRAFT}`);
          this.stats.failed++;
        }
      }

      // Add version info if available
      if (flowInfo.latestVersion) {
        result.latestVersionNumber = flowInfo.latestVersion.VersionNumber;
        result.processType = flowInfo.latestVersion.ProcessType;
      }

    } catch (error) {
      result.errors.push(`Verification failed: ${error.message}`);
      this.stats.failed++;
    }

    return result;
  }

  /**
   * Activate a Flow
   */
  async activateFlow(orgAlias, flowApiName, options = {}) {
    const { versionId = null, force = false } = options;

    const result = {
      flowName: flowApiName,
      activated: false,
      previousStatus: null,
      newStatus: null,
      errors: [],
      warnings: []
    };

    if (this.dryRun) {
      result.warnings.push('DRY RUN: Would activate flow');
      this.log(`[DRY RUN] Would activate Flow: ${flowApiName}`, 'info');
      return result;
    }

    try {
      // Get current Flow info
      const flowInfo = await this.getFlowInfo(orgAlias, flowApiName);

      if (!flowInfo) {
        result.errors.push(`Flow '${flowApiName}' not found`);
        this.stats.failed++;
        return result;
      }

      result.previousStatus = flowInfo.ActiveVersionId ? STATUS.ACTIVE : STATUS.DRAFT;

      // If already active with correct version, skip
      if (flowInfo.ActiveVersionId === flowInfo.LatestVersionId && !force) {
        result.warnings.push('Flow is already active with latest version');
        result.newStatus = STATUS.ACTIVE;
        this.stats.skipped++;
        return result;
      }

      // Determine which version to activate
      const targetVersionId = versionId || flowInfo.LatestVersionId;

      if (!targetVersionId) {
        result.errors.push('No version available to activate');
        this.stats.failed++;
        return result;
      }

      // Use Tooling API to update FlowDefinition
      const updateQuery = `
        {
          "ActiveVersionId": "${targetVersionId}"
        }
      `.trim();

      this.log(`Activating Flow ${flowApiName} (version: ${targetVersionId})...`, 'info');

      const updateResult = this.executeCommand(
        `sf data update record --sobject FlowDefinition --record-id ${flowInfo.Id} --values '{"ActiveVersionId":"${targetVersionId}"}' --target-org ${orgAlias} --use-tooling-api --json`
      );

      if (updateResult.status === 0) {
        result.activated = true;
        result.newStatus = STATUS.ACTIVE;
        result.activatedVersionId = targetVersionId;
        this.stats.activated++;
        this.log(`Successfully activated Flow: ${flowApiName}`, 'success');
      } else {
        result.errors.push(`Activation failed: ${updateResult.message || 'Unknown error'}`);
        this.stats.failed++;
      }

    } catch (error) {
      result.errors.push(`Activation error: ${error.message}`);
      this.stats.failed++;
    }

    return result;
  }

  /**
   * Batch verify multiple Flows
   */
  async batchVerify(orgAlias, flowNames, options = {}) {
    const { expectedStatus = STATUS.ACTIVE, autoActivate = false } = options;

    const results = {
      total: flowNames.length,
      verified: 0,
      needsActivation: 0,
      activated: 0,
      failed: 0,
      flows: []
    };

    for (const flowName of flowNames) {
      this.log(`Verifying: ${flowName}`, 'info');

      const verifyResult = await this.verifyFlow(orgAlias, flowName, expectedStatus);
      results.flows.push(verifyResult);

      if (verifyResult.verified) {
        results.verified++;
      } else if (verifyResult.needsActivation) {
        results.needsActivation++;

        if (autoActivate) {
          this.log(`Auto-activating: ${flowName}`, 'info');
          const activateResult = await this.activateFlow(orgAlias, flowName);

          if (activateResult.activated) {
            results.activated++;
            verifyResult.autoActivated = true;
          } else {
            results.failed++;
            verifyResult.activationErrors = activateResult.errors;
          }
        }
      } else {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Get activation prerequisites for a Flow
   */
  async getActivationPrerequisites(orgAlias, flowApiName) {
    const prereqs = {
      flowName: flowApiName,
      canActivate: true,
      requirements: [],
      warnings: []
    };

    try {
      const flowInfo = await this.getFlowInfo(orgAlias, flowApiName);

      if (!flowInfo) {
        prereqs.canActivate = false;
        prereqs.requirements.push('Flow not found in org');
        return prereqs;
      }

      // Check if there's a version to activate
      if (!flowInfo.LatestVersionId) {
        prereqs.canActivate = false;
        prereqs.requirements.push('No Flow version exists to activate');
        return prereqs;
      }

      // Get latest version details
      const versionInfo = flowInfo.latestVersion;

      if (versionInfo) {
        // Check for common activation blockers
        if (versionInfo.Status === 'InvalidDraft') {
          prereqs.canActivate = false;
          prereqs.requirements.push('Flow version is invalid - check for errors in Flow Builder');
        }

        // Record-triggered flows may have additional requirements
        if (versionInfo.ProcessType === PROCESS_TYPES.RECORD_TRIGGERED) {
          prereqs.warnings.push('Record-triggered Flow - ensure trigger object exists and is accessible');
        }

        // Screen flows may need permission sets
        if (versionInfo.ProcessType === PROCESS_TYPES.SCREEN) {
          prereqs.warnings.push('Screen Flow - ensure users have Run Flows permission');
        }
      }

      // Check if another version is already active
      if (flowInfo.ActiveVersionId && flowInfo.ActiveVersionId !== flowInfo.LatestVersionId) {
        prereqs.warnings.push(
          `Another version (${flowInfo.ActiveVersionId}) is currently active. ` +
          `Activating will deactivate it.`
        );
      }

    } catch (error) {
      prereqs.canActivate = false;
      prereqs.requirements.push(`Error checking prerequisites: ${error.message}`);
    }

    return prereqs;
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      verified: 0,
      activated: 0,
      failed: 0,
      skipped: 0
    };
  }
}

module.exports = FlowActivationVerifier;
module.exports.STATUS = STATUS;
module.exports.PROCESS_TYPES = PROCESS_TYPES;

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('Flow Activation Verifier');
    console.log('');
    console.log('Usage:');
    console.log('  node flow-activation-verifier.js verify <org-alias> <flow-name>');
    console.log('  node flow-activation-verifier.js activate <org-alias> <flow-name>');
    console.log('  node flow-activation-verifier.js list <org-alias> [--status Draft|Active]');
    console.log('  node flow-activation-verifier.js batch-verify <org-alias> --flows flow1,flow2 [--auto-activate]');
    console.log('  node flow-activation-verifier.js prereqs <org-alias> <flow-name>');
    console.log('');
    console.log('Options:');
    console.log('  --verbose        Show detailed output');
    console.log('  --dry-run        Show what would happen without making changes');
    console.log('  --json           Output as JSON');
    console.log('');
    process.exit(0);
  }

  const verbose = args.includes('--verbose');
  const dryRun = args.includes('--dry-run');
  const jsonOutput = args.includes('--json');

  const verifier = new FlowActivationVerifier({ verbose, dryRun });

  async function main() {
    try {
      let result;

      switch (command) {
        case 'verify': {
          const orgAlias = args[1];
          const flowName = args[2];

          if (!orgAlias || !flowName) {
            console.error('ERROR: org-alias and flow-name are required');
            process.exit(1);
          }

          result = await verifier.verifyFlow(orgAlias, flowName);
          break;
        }

        case 'activate': {
          const orgAlias = args[1];
          const flowName = args[2];

          if (!orgAlias || !flowName) {
            console.error('ERROR: org-alias and flow-name are required');
            process.exit(1);
          }

          result = await verifier.activateFlow(orgAlias, flowName);
          break;
        }

        case 'list': {
          const orgAlias = args[1];
          const statusIndex = args.indexOf('--status');
          const status = statusIndex > -1 ? args[statusIndex + 1] : null;

          if (!orgAlias) {
            console.error('ERROR: org-alias is required');
            process.exit(1);
          }

          result = await verifier.listFlows(orgAlias, { status });
          break;
        }

        case 'batch-verify': {
          const orgAlias = args[1];
          const flowsIndex = args.indexOf('--flows');
          const flowNames = flowsIndex > -1 ? args[flowsIndex + 1].split(',') : [];
          const autoActivate = args.includes('--auto-activate');

          if (!orgAlias || flowNames.length === 0) {
            console.error('ERROR: org-alias and --flows are required');
            process.exit(1);
          }

          result = await verifier.batchVerify(orgAlias, flowNames, { autoActivate });
          break;
        }

        case 'prereqs': {
          const orgAlias = args[1];
          const flowName = args[2];

          if (!orgAlias || !flowName) {
            console.error('ERROR: org-alias and flow-name are required');
            process.exit(1);
          }

          result = await verifier.getActivationPrerequisites(orgAlias, flowName);
          break;
        }

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Human-readable output
        if (result.verified !== undefined) {
          console.log(`\nFlow: ${result.flowName}`);
          console.log(`Status: ${result.actualStatus || 'Unknown'}`);
          console.log(`Verified: ${result.verified ? 'Yes' : 'No'}`);
          if (result.needsActivation) {
            console.log('Needs Activation: Yes');
          }
          if (result.errors?.length > 0) {
            console.log('\nErrors:');
            result.errors.forEach(e => console.log(`  - ${e}`));
          }
          if (result.warnings?.length > 0) {
            console.log('\nWarnings:');
            result.warnings.forEach(w => console.log(`  - ${w}`));
          }
        } else if (Array.isArray(result)) {
          console.log(`\nFlows (${result.length}):`);
          result.forEach(f => {
            const statusIcon = f.status === 'Active' ? '' : '';
            console.log(`  ${statusIcon} ${f.developerName} [${f.status}]`);
          });
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      }

      // Exit with appropriate code
      if (result.errors?.length > 0 || result.failed > 0) {
        process.exit(1);
      }

    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      if (verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  main();
}
