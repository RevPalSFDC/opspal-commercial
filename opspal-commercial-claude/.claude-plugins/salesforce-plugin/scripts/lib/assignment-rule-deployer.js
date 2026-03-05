#!/usr/bin/env node

/**
 * Assignment Rule Deployer
 *
 * Deploy Assignment Rules via Salesforce Metadata API, build XML payloads,
 * handle activation/deactivation, and manage rule lifecycle.
 *
 * @module assignment-rule-deployer
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildAssignmentRuleXML } = require('./assignment-rule-parser');

/**
 * Build package.xml manifest for Assignment Rules
 *
 * @private
 * @param {string} objectType - Object type (Lead, Case)
 * @param {string} apiVersion - API version (default: 62.0)
 * @returns {string} package.xml content
 */
function buildPackageXML(objectType, apiVersion = '62.0') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectType}</members>
        <name>AssignmentRules</name>
    </types>
    <version>${apiVersion}</version>
</Package>`;
}

/**
 * Create temporary deployment directory structure
 *
 * @private
 * @param {string} ruleXML - Assignment rule XML content
 * @param {string} objectType - Object type (Lead, Case)
 * @returns {string} Temporary directory path
 */
function createDeploymentPackage(ruleXML, objectType) {
  const tmpDir = path.join(require('os').tmpdir(), `assignment-rules-${Date.now()}`);
  const assignmentRulesDir = path.join(tmpDir, 'assignmentRules');

  // Create directory structure
  fs.mkdirSync(assignmentRulesDir, { recursive: true });

  // Write Assignment Rules XML
  const ruleFile = path.join(assignmentRulesDir, `${objectType}.assignmentRules-meta.xml`);
  fs.writeFileSync(ruleFile, ruleXML, 'utf8');

  // Write package.xml
  const packageXML = buildPackageXML(objectType);
  fs.writeFileSync(path.join(tmpDir, 'package.xml'), packageXML, 'utf8');

  return tmpDir;
}

/**
 * Deploy Assignment Rule to Salesforce org
 *
 * @param {string} ruleXML - Assignment rule XML content
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} [options] - Deployment options
 * @param {boolean} [options.checkOnly=false] - Validate only (don't deploy)
 * @param {boolean} [options.testLevel='NoTestRun'] - Test level
 * @param {number} [options.timeout=600] - Timeout in seconds
 * @returns {Promise<Object>} Deployment result
 *
 * @example
 * const result = await deployRule(ruleXML, 'myorg', { checkOnly: true });
 * if (result.success) {
 *   console.log('Validation passed');
 * }
 */
async function deployRule(ruleXML, orgAlias, options = {}) {
  const {
    checkOnly = false,
    testLevel = 'NoTestRun',
    timeout = 600
  } = options;

  // Parse XML to get object type
  const objectTypeMatch = ruleXML.match(/<fullName>(\w+)<\/fullName>/);
  if (!objectTypeMatch) {
    throw new Error('Cannot determine object type from XML (missing <fullName>)');
  }
  const objectType = objectTypeMatch[1];

  let tmpDir;

  try {
    // Create deployment package
    tmpDir = createDeploymentPackage(ruleXML, objectType);

    // Build deployment command
    const flags = [
      `--source-dir ${tmpDir}`,
      `--target-org ${orgAlias}`,
      `--wait ${timeout}`,
      `--test-level ${testLevel}`,
      '--json'
    ];

    if (checkOnly) {
      flags.push('--dry-run');
    }

    const command = `sf project deploy start ${flags.join(' ')}`;

    console.log(`${checkOnly ? 'Validating' : 'Deploying'} Assignment Rules for ${objectType}...`);

    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(output);

    if (result.status !== 0) {
      return {
        success: false,
        objectType,
        error: result.message || 'Deployment failed',
        details: result.result
      };
    }

    const deployResult = result.result;

    return {
      success: deployResult.status === 'Succeeded',
      objectType,
      deploymentId: deployResult.id,
      status: deployResult.status,
      checkOnly,
      componentsDeployed: deployResult.numberComponentsDeployed,
      componentsTotal: deployResult.numberComponentsTotal,
      testsFailed: deployResult.numberTestsFailed,
      testsCompleted: deployResult.numberTestsCompleted,
      details: deployResult
    };

  } catch (error) {
    // Try to parse error as JSON
    try {
      const errorResult = JSON.parse(error.stdout || error.stderr || '{}');
      return {
        success: false,
        objectType,
        error: errorResult.message || error.message,
        details: errorResult.result
      };
    } catch {
      return {
        success: false,
        objectType,
        error: error.message,
        stderr: error.stderr
      };
    }
  } finally {
    // Cleanup temp directory
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

/**
 * Retrieve existing Assignment Rules from org
 *
 * @param {string} objectType - Object type (Lead, Case)
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Promise<string>} Assignment rules XML
 *
 * @example
 * const xml = await retrieveExistingRules('Lead', 'myorg');
 * console.log(xml);
 */
async function retrieveExistingRules(objectType, orgAlias) {
  const tmpDir = path.join(require('os').tmpdir(), `assignment-rules-retrieve-${Date.now()}`);

  try {
    // Create directory
    fs.mkdirSync(tmpDir, { recursive: true });

    // Write package.xml
    const packageXML = buildPackageXML(objectType);
    fs.writeFileSync(path.join(tmpDir, 'package.xml'), packageXML, 'utf8');

    // Retrieve via Metadata API
    const command = `sf project retrieve start --manifest ${path.join(tmpDir, 'package.xml')} --target-org ${orgAlias} --json`;

    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const result = JSON.parse(output);

    if (result.status !== 0) {
      throw new Error(result.message || 'Retrieve failed');
    }

    // Read retrieved file
    const retrievedFile = path.join('force-app', 'main', 'default', 'assignmentRules', `${objectType}.assignmentRules-meta.xml`);

    if (!fs.existsSync(retrievedFile)) {
      throw new Error(`Retrieved file not found: ${retrievedFile}`);
    }

    const xml = fs.readFileSync(retrievedFile, 'utf8');
    return xml;

  } finally {
    // Cleanup
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

/**
 * Activate assignment rule (sets active=true, deactivates others)
 *
 * @param {string} ruleName - Name of rule to activate
 * @param {string} objectType - Object type (Lead, Case)
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Promise<Object>} Activation result
 *
 * @example
 * const result = await activateRule('Healthcare_Routing', 'Lead', 'myorg');
 * if (result.success) {
 *   console.log(`Activated: ${result.activatedRule}`);
 * }
 */
async function activateRule(ruleName, objectType, orgAlias) {
  try {
    // Retrieve existing rules
    const existingXML = await retrieveExistingRules(objectType, orgAlias);

    // Parse and modify
    const { parseRuleMetadata } = require('./assignment-rule-parser');
    const parsed = parseRuleMetadata(existingXML);

    let found = false;
    let previouslyActive = null;

    // Set target rule to active, others to inactive
    parsed.assignmentRules.forEach(rule => {
      if (rule.name === ruleName) {
        if (rule.active) {
          return {
            success: true,
            message: `Rule '${ruleName}' is already active`,
            alreadyActive: true
          };
        }
        rule.active = true;
        found = true;
      } else if (rule.active) {
        previouslyActive = rule.name;
        rule.active = false;
      }
    });

    if (!found) {
      return {
        success: false,
        error: `Rule '${ruleName}' not found`,
        availableRules: parsed.assignmentRules.map(r => r.name)
      };
    }

    // Build updated XML
    const updatedXML = buildAssignmentRuleXML(parsed);

    // Deploy
    const deployResult = await deployRule(updatedXML, orgAlias);

    if (deployResult.success) {
      return {
        success: true,
        activatedRule: ruleName,
        deactivatedRule: previouslyActive,
        objectType,
        deploymentId: deployResult.deploymentId
      };
    } else {
      return {
        success: false,
        error: `Failed to activate rule: ${deployResult.error}`,
        details: deployResult
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Deactivate assignment rule (sets active=false)
 *
 * @param {string} ruleName - Name of rule to deactivate
 * @param {string} objectType - Object type (Lead, Case)
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Promise<Object>} Deactivation result
 */
async function deactivateRule(ruleName, objectType, orgAlias) {
  try {
    // Retrieve existing rules
    const existingXML = await retrieveExistingRules(objectType, orgAlias);

    // Parse and modify
    const { parseRuleMetadata } = require('./assignment-rule-parser');
    const parsed = parseRuleMetadata(existingXML);

    let found = false;

    parsed.assignmentRules.forEach(rule => {
      if (rule.name === ruleName) {
        if (!rule.active) {
          return {
            success: true,
            message: `Rule '${ruleName}' is already inactive`,
            alreadyInactive: true
          };
        }
        rule.active = false;
        found = true;
      }
    });

    if (!found) {
      return {
        success: false,
        error: `Rule '${ruleName}' not found`,
        availableRules: parsed.assignmentRules.map(r => r.name)
      };
    }

    // Build updated XML
    const updatedXML = buildAssignmentRuleXML(parsed);

    // Deploy
    const deployResult = await deployRule(updatedXML, orgAlias);

    if (deployResult.success) {
      return {
        success: true,
        deactivatedRule: ruleName,
        objectType,
        deploymentId: deployResult.deploymentId
      };
    } else {
      return {
        success: false,
        error: `Failed to deactivate rule: ${deployResult.error}`,
        details: deployResult
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete assignment rule
 *
 * Note: Deleting rules requires removing from XML and redeploying.
 * If it's the only rule, consider deactivating instead.
 *
 * @param {string} ruleName - Name of rule to delete
 * @param {string} objectType - Object type (Lead, Case)
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Promise<Object>} Deletion result
 */
async function deleteRule(ruleName, objectType, orgAlias) {
  try {
    // Retrieve existing rules
    const existingXML = await retrieveExistingRules(objectType, orgAlias);

    // Parse and filter
    const { parseRuleMetadata } = require('./assignment-rule-parser');
    const parsed = parseRuleMetadata(existingXML);

    const beforeCount = parsed.assignmentRules.length;
    parsed.assignmentRules = parsed.assignmentRules.filter(rule => rule.name !== ruleName);
    const afterCount = parsed.assignmentRules.length;

    if (beforeCount === afterCount) {
      return {
        success: false,
        error: `Rule '${ruleName}' not found`,
        availableRules: parsed.assignmentRules.map(r => r.name)
      };
    }

    if (afterCount === 0) {
      return {
        success: false,
        error: 'Cannot delete the only rule. Deactivate it instead.',
        recommendation: 'Use deactivateRule() to keep rule but disable it'
      };
    }

    // Build updated XML
    const updatedXML = buildAssignmentRuleXML(parsed);

    // Deploy
    const deployResult = await deployRule(updatedXML, orgAlias);

    if (deployResult.success) {
      return {
        success: true,
        deletedRule: ruleName,
        objectType,
        remainingRules: afterCount,
        deploymentId: deployResult.deploymentId
      };
    } else {
      return {
        success: false,
        error: `Failed to delete rule: ${deployResult.error}`,
        details: deployResult
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Backup existing assignment rules before modification
 *
 * @param {string} objectType - Object type (Lead, Case)
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} [backupDir='./backups'] - Backup directory
 * @returns {Promise<string>} Path to backup file
 *
 * @example
 * const backupPath = await backupRules('Lead', 'myorg');
 * console.log(`Backup saved to: ${backupPath}`);
 */
async function backupRules(objectType, orgAlias, backupDir = './backups') {
  try {
    // Retrieve existing rules
    const xml = await retrieveExistingRules(objectType, orgAlias);

    // Create backup directory
    const timestampedDir = path.join(backupDir, 'assignment-rules', objectType);
    fs.mkdirSync(timestampedDir, { recursive: true });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${objectType}_${timestamp}.assignmentRules-meta.xml`;
    const backupPath = path.join(timestampedDir, filename);

    // Write backup
    fs.writeFileSync(backupPath, xml, 'utf8');

    return backupPath;

  } catch (error) {
    throw new Error(`Failed to backup rules: ${error.message}`);
  }
}

/**
 * Restore assignment rules from backup
 *
 * @param {string} backupPath - Path to backup file
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Promise<Object>} Restore result
 */
async function restoreFromBackup(backupPath, orgAlias) {
  try {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    const xml = fs.readFileSync(backupPath, 'utf8');

    // Extract object type from XML
    const objectTypeMatch = xml.match(/<fullName>(\w+)<\/fullName>/);
    if (!objectTypeMatch) {
      throw new Error('Cannot determine object type from backup file');
    }
    const objectType = objectTypeMatch[1];

    // Deploy backup
    const deployResult = await deployRule(xml, orgAlias);

    if (deployResult.success) {
      return {
        success: true,
        message: 'Rules restored successfully',
        objectType,
        backupPath,
        deploymentId: deployResult.deploymentId
      };
    } else {
      return {
        success: false,
        error: `Failed to restore: ${deployResult.error}`,
        details: deployResult
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Export functions
module.exports = {
  deployRule,
  retrieveExistingRules,
  activateRule,
  deactivateRule,
  deleteRule,
  backupRules,
  restoreFromBackup
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node assignment-rule-deployer.js <action> <object-type> [org-alias] [options]');
    console.error('');
    console.error('Actions:');
    console.error('  deploy <xml-file> <org-alias>              Deploy assignment rules from XML file');
    console.error('  validate <xml-file> <org-alias>            Validate assignment rules (check-only)');
    console.error('  retrieve <object-type> <org-alias>         Retrieve existing rules');
    console.error('  activate <rule-name> <object-type> <org>   Activate rule');
    console.error('  deactivate <rule-name> <object-type> <org> Deactivate rule');
    console.error('  delete <rule-name> <object-type> <org>     Delete rule');
    console.error('  backup <object-type> <org-alias>           Backup existing rules');
    console.error('');
    console.error('Examples:');
    console.error('  node assignment-rule-deployer.js deploy Lead.xml myorg');
    console.error('  node assignment-rule-deployer.js validate Lead.xml myorg');
    console.error('  node assignment-rule-deployer.js retrieve Lead myorg');
    console.error('  node assignment-rule-deployer.js activate Healthcare_Rule Lead myorg');
    console.error('  node assignment-rule-deployer.js backup Lead myorg');
    process.exit(1);
  }

  const action = args[0];

  (async () => {
    try {
      switch (action) {
        case 'deploy':
        case 'validate': {
          const [, xmlFile, orgAlias] = args;
          if (!fs.existsSync(xmlFile)) {
            throw new Error(`File not found: ${xmlFile}`);
          }

          const xml = fs.readFileSync(xmlFile, 'utf8');
          const result = await deployRule(xml, orgAlias, { checkOnly: action === 'validate' });

          if (result.success) {
            console.log(`✓ ${action === 'validate' ? 'Validation' : 'Deployment'} succeeded`);
            console.log(`  Object: ${result.objectType}`);
            console.log(`  Components: ${result.componentsDeployed}/${result.componentsTotal}`);
            console.log(`  Deployment ID: ${result.deploymentId}`);
          } else {
            console.error(`✗ ${action === 'validate' ? 'Validation' : 'Deployment'} failed`);
            console.error(`  Error: ${result.error}`);
            process.exit(1);
          }
          break;
        }

        case 'retrieve': {
          const [, objectType, orgAlias] = args;
          const xml = await retrieveExistingRules(objectType, orgAlias);
          console.log(xml);
          break;
        }

        case 'activate': {
          const [, ruleName, objectType, orgAlias] = args;
          const result = await activateRule(ruleName, objectType, orgAlias);

          if (result.success) {
            console.log(`✓ Rule activated: ${result.activatedRule}`);
            if (result.deactivatedRule) {
              console.log(`  Deactivated: ${result.deactivatedRule}`);
            }
            console.log(`  Deployment ID: ${result.deploymentId}`);
          } else {
            console.error(`✗ Activation failed: ${result.error}`);
            process.exit(1);
          }
          break;
        }

        case 'deactivate': {
          const [, ruleName, objectType, orgAlias] = args;
          const result = await deactivateRule(ruleName, objectType, orgAlias);

          if (result.success) {
            console.log(`✓ Rule deactivated: ${result.deactivatedRule}`);
            console.log(`  Deployment ID: ${result.deploymentId}`);
          } else {
            console.error(`✗ Deactivation failed: ${result.error}`);
            process.exit(1);
          }
          break;
        }

        case 'delete': {
          const [, ruleName, objectType, orgAlias] = args;
          const result = await deleteRule(ruleName, objectType, orgAlias);

          if (result.success) {
            console.log(`✓ Rule deleted: ${result.deletedRule}`);
            console.log(`  Remaining rules: ${result.remainingRules}`);
            console.log(`  Deployment ID: ${result.deploymentId}`);
          } else {
            console.error(`✗ Deletion failed: ${result.error}`);
            if (result.recommendation) {
              console.error(`  Recommendation: ${result.recommendation}`);
            }
            process.exit(1);
          }
          break;
        }

        case 'backup': {
          const [, objectType, orgAlias] = args;
          const backupPath = await backupRules(objectType, orgAlias);
          console.log(`✓ Backup created: ${backupPath}`);
          break;
        }

        default:
          console.error(`Unknown action: ${action}`);
          process.exit(1);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
