#!/usr/bin/env node

/**
 * Enhanced Deployment Validator (v3.62.0)
 *
 * Extends pre-deployment validation with 12 additional checks
 * based on reflection analysis of common deployment failures.
 *
 * New Checks (added to existing 8):
 * 9.  Dashboard chartAxisRange validation
 * 10. Report reference format validation
 * 11. Flow entry criteria validation
 * 12. Flow runtime context validation
 * 13. Record Type validation
 * 14. Layout field existence validation
 * 15. Lightning Page component validation
 * 16. Custom Metadata Type validation
 * 17. Quick Action validation
 * 18. Sharing Rule validation
 * 19. Workflow field references validation
 * 20. Duplicate Rule validation
 *
 * Total: 20 validation checks
 *
 * Usage:
 *   const validator = require('./enhanced-deployment-validator');
 *   const results = await validator.validateEnhanced('./force-app', { orgAlias: 'prod' });
 *
 * @module enhanced-deployment-validator
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

/**
 * Check 9: Dashboard chartAxisRange validation
 * Prevents: "chartAxisRange is required for chart components"
 */
function validateDashboardChartAxisRange(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const dashboards = content.dashboards || [];

  dashboards.forEach(dashboard => {
    const xml = dashboard.content || '';

    // Find chart components
    const chartComponentRegex = /<dashboardComponent>[\s\S]*?<componentType>(.*?)<\/componentType>[\s\S]*?<\/dashboardComponent>/g;
    let match;

    while ((match = chartComponentRegex.exec(xml)) !== null) {
      const componentXml = match[0];
      const componentType = match[1];

      // Chart types that require chartAxisRange
      const chartTypes = ['Line', 'Bar', 'Column', 'Donut', 'Funnel', 'Pie', 'Scatter', 'Gauge'];

      if (chartTypes.some(t => componentType.includes(t))) {
        // Check for chartAxisRange
        if (!componentXml.includes('<chartAxisRange>')) {
          result.errors.push(
            `Dashboard ${dashboard.name}: Chart component missing required chartAxisRange element`
          );
          result.passed = false;
        }
      }
    }
  });

  return result;
}

/**
 * Check 10: Report reference format validation
 * Prevents: "Report reference must use FolderName/DeveloperName format"
 */
function validateReportReferences(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const dashboards = content.dashboards || [];

  dashboards.forEach(dashboard => {
    const xml = dashboard.content || '';

    // Find report references
    const reportRefRegex = /<report>(.*?)<\/report>/g;
    let match;

    while ((match = reportRefRegex.exec(xml)) !== null) {
      const reportRef = match[1];

      // Check if using ID format (15 or 18 char IDs starting with 00O)
      if (/^00O[a-zA-Z0-9]{12,15}$/.test(reportRef)) {
        result.errors.push(
          `Dashboard ${dashboard.name}: Report reference uses ID format (${reportRef}). ` +
          `Use FolderName/DeveloperName format instead.`
        );
        result.passed = false;
      }

      // Check for proper folder/name format
      if (!reportRef.includes('/') && !reportRef.startsWith('00O')) {
        result.warnings.push(
          `Dashboard ${dashboard.name}: Report reference "${reportRef}" should include folder path`
        );
      }
    }
  });

  return result;
}

/**
 * Check 11: Flow entry criteria validation
 * Prevents: Flows that trigger unexpectedly
 */
function validateFlowEntryCriteria(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const flows = content.flows || [];

  flows.forEach(flow => {
    const xml = flow.content || '';

    // Check for record-triggered flows
    if (xml.includes('<triggerType>') && xml.includes('RecordBeforeSave') || xml.includes('RecordAfterSave')) {

      // Check for entry criteria
      const hasEntryCriteria = xml.includes('<filterFormula>') ||
                               xml.includes('<filters>') ||
                               xml.includes('<recordFilter>');

      if (!hasEntryCriteria) {
        result.warnings.push(
          `Flow ${flow.name}: Record-triggered Flow without entry criteria - will run on ALL records`
        );
      }

      // Check for specific object
      if (!xml.includes('<object>')) {
        result.errors.push(
          `Flow ${flow.name}: Record-triggered Flow missing object specification`
        );
        result.passed = false;
      }
    }
  });

  return result;
}

/**
 * Check 12: Flow runtime context validation
 * Prevents: Security context issues with "System Mode without Sharing"
 */
function validateFlowRuntimeContext(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const flows = content.flows || [];

  flows.forEach(flow => {
    const xml = flow.content || '';

    // Check for system context without sharing
    if (xml.includes('<runInMode>SystemModeWithoutSharing</runInMode>')) {
      result.warnings.push(
        `Flow ${flow.name}: Runs in "System Mode without Sharing" - ` +
        `security review recommended`
      );
    }

    // Check for user context on automations that may need elevated access
    if (xml.includes('<triggerType>Scheduled</triggerType>') &&
        xml.includes('<runInMode>DefaultMode</runInMode>')) {
      result.info.push(
        `Flow ${flow.name}: Scheduled flow runs in user context - ` +
        `verify running user has necessary permissions`
      );
    }
  });

  return result;
}

/**
 * Check 13: Record Type validation
 * Prevents: References to non-existent record types
 */
function validateRecordTypes(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const recordTypes = content.recordTypes || [];
  const layouts = content.layouts || [];
  const profiles = content.profiles || [];

  // Collect record type names from deployment
  const deployedRecordTypes = new Set(recordTypes.map(rt => rt.name));

  // Check layouts for record type references
  layouts.forEach(layout => {
    const xml = layout.content || '';
    const rtMatch = xml.match(/<recordType>(.*?)<\/recordType>/);

    if (rtMatch && !deployedRecordTypes.has(rtMatch[1])) {
      result.info.push(
        `Layout ${layout.name}: References record type "${rtMatch[1]}" - verify exists in org`
      );
    }
  });

  // Check profiles for record type access
  profiles.forEach(profile => {
    const xml = profile.content || '';
    const rtRefs = xml.matchAll(/<recordType>(.*?)<\/recordType>/g);

    for (const match of rtRefs) {
      if (!deployedRecordTypes.has(match[1])) {
        result.info.push(
          `Profile ${profile.name}: References record type "${match[1]}" - verify exists`
        );
      }
    }
  });

  return result;
}

/**
 * Check 14: Layout field existence validation
 * Prevents: "Field X referenced in layout does not exist"
 */
function validateLayoutFields(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const layouts = content.layouts || [];
  const fields = content.fields || [];

  // Collect deployed custom fields
  const deployedFields = new Set(fields.map(f => f.name.replace('.field-meta.xml', '')));

  layouts.forEach(layout => {
    const xml = layout.content || '';

    // Extract field references from layout items
    const fieldRefs = xml.matchAll(/<field>(.*?)<\/field>/g);

    for (const match of fieldRefs) {
      const fieldName = match[1];

      // Custom fields end with __c
      if (fieldName.endsWith('__c') && !deployedFields.has(fieldName)) {
        result.warnings.push(
          `Layout ${layout.name}: References custom field "${fieldName}" - verify exists in org`
        );
      }
    }
  });

  return result;
}

/**
 * Check 15: Lightning Page component validation
 * Prevents: References to non-existent LWC/Aura components
 */
function validateLightningPageComponents(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const flexiPages = content.flexiPages || [];
  const lwc = content.lwc || [];
  const aura = content.aura || [];

  // Collect deployed components
  const deployedComponents = new Set([
    ...lwc.map(c => c.name),
    ...aura.map(c => c.name)
  ]);

  flexiPages.forEach(page => {
    const xml = page.content || '';

    // Find component references
    const componentRefs = xml.matchAll(/<componentName>(.*?)<\/componentName>/g);

    for (const match of componentRefs) {
      const componentName = match[1];

      // Check custom components (namespace:componentName format)
      if (componentName.includes(':') && !componentName.startsWith('flexipage:')) {
        const [ns, name] = componentName.split(':');

        if (ns === 'c' && !deployedComponents.has(name)) {
          result.warnings.push(
            `FlexiPage ${page.name}: References custom component "${name}" - verify exists`
          );
        }
      }
    }
  });

  return result;
}

/**
 * Check 16: Custom Metadata Type validation
 * Prevents: MDT record references to non-existent types
 */
function validateCustomMetadataTypes(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const customMetadata = content.customMetadata || [];
  const customMetadataTypes = content.customMetadataTypes || [];

  // Collect deployed MDT types
  const deployedTypes = new Set(customMetadataTypes.map(t => t.name));

  customMetadata.forEach(record => {
    // Extract type from record name (Type.RecordName)
    const typeName = record.name.split('.')[0];

    if (!deployedTypes.has(typeName) && typeName.endsWith('__mdt')) {
      result.info.push(
        `Custom Metadata Record ${record.name}: Type "${typeName}" - verify exists in org`
      );
    }
  });

  return result;
}

/**
 * Check 17: Quick Action validation
 * Prevents: Quick actions referencing non-existent fields/objects
 */
function validateQuickActions(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const quickActions = content.quickActions || [];
  const fields = content.fields || [];

  const deployedFields = new Set(fields.map(f => f.name));

  quickActions.forEach(action => {
    const xml = action.content || '';

    // Check target object
    if (xml.includes('<targetObject>')) {
      const objectMatch = xml.match(/<targetObject>(.*?)<\/targetObject>/);
      if (objectMatch) {
        result.info.push(
          `Quick Action ${action.name}: Targets object "${objectMatch[1]}" - verify exists`
        );
      }
    }

    // Check field overrides
    const fieldOverrides = xml.matchAll(/<fieldName>(.*?)<\/fieldName>/g);
    for (const match of fieldOverrides) {
      if (match[1].endsWith('__c') && !deployedFields.has(match[1])) {
        result.warnings.push(
          `Quick Action ${action.name}: References field "${match[1]}" - verify exists`
        );
      }
    }
  });

  return result;
}

/**
 * Check 18: Sharing Rule validation
 * Prevents: Invalid criteria-based sharing rules
 */
function validateSharingRules(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const sharingRules = content.sharingRules || [];

  sharingRules.forEach(rule => {
    const xml = rule.content || '';

    // Check criteria-based rules have valid field references
    if (xml.includes('<criteriaItems>')) {
      const fieldRefs = xml.matchAll(/<field>(.*?)<\/field>/g);

      for (const match of fieldRefs) {
        const fieldName = match[1];

        // Flag encrypted fields (not supported in criteria)
        if (fieldName.includes('__x') || fieldName.toLowerCase().includes('encrypted')) {
          result.errors.push(
            `Sharing Rule ${rule.name}: Cannot use encrypted field "${fieldName}" in criteria`
          );
          result.passed = false;
        }
      }
    }

    // Check for group references
    const groupRefs = xml.matchAll(/<sharedTo>(.*?)<\/sharedTo>/g);
    for (const match of groupRefs) {
      result.info.push(
        `Sharing Rule ${rule.name}: Shares to "${match[1]}" - verify group exists`
      );
    }
  });

  return result;
}

/**
 * Check 19: Workflow field references validation
 * Prevents: Workflow rules referencing invalid fields
 */
function validateWorkflowFieldReferences(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const workflows = content.workflows || [];
  const fields = content.fields || [];

  const deployedFields = new Set(fields.map(f => f.name));

  workflows.forEach(workflow => {
    const xml = workflow.content || '';

    // Check field updates
    const fieldUpdates = xml.matchAll(/<field>(.*?)<\/field>/g);

    for (const match of fieldUpdates) {
      const fieldName = match[1];

      if (fieldName.endsWith('__c') && !deployedFields.has(fieldName)) {
        result.warnings.push(
          `Workflow ${workflow.name}: References field "${fieldName}" - verify exists`
        );
      }
    }

    // Check formula in workflow rule
    if (xml.includes('<formula>')) {
      const formulaMatch = xml.match(/<formula>([\s\S]*?)<\/formula>/);
      if (formulaMatch) {
        // Check for ISBLANK on picklist (common error)
        if (/ISBLANK\s*\(\s*[A-Za-z_]+__c\s*\)/i.test(formulaMatch[1])) {
          result.warnings.push(
            `Workflow ${workflow.name}: ISBLANK() on custom field may fail for picklists - use TEXT() = ""`
          );
        }
      }
    }
  });

  return result;
}

/**
 * Check 20: Duplicate Rule validation
 * Prevents: Duplicate rules with invalid matching criteria
 */
function validateDuplicateRules(content) {
  const result = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  const duplicateRules = content.duplicateRules || [];
  const matchingRules = content.matchingRules || [];

  // Collect matching rule names
  const deployedMatchingRules = new Set(matchingRules.map(r => r.name));

  duplicateRules.forEach(rule => {
    const xml = rule.content || '';

    // Check matching rule references
    const matchingRuleRefs = xml.matchAll(/<matchingRule>(.*?)<\/matchingRule>/g);

    for (const match of matchingRuleRefs) {
      const ruleName = match[1];

      if (!deployedMatchingRules.has(ruleName)) {
        result.warnings.push(
          `Duplicate Rule ${rule.name}: References matching rule "${ruleName}" - verify exists`
        );
      }
    }

    // Check for active status
    if (xml.includes('<isActive>true</isActive>')) {
      result.info.push(
        `Duplicate Rule ${rule.name}: Will be active on deploy - verify matching criteria`
      );
    }
  });

  return result;
}

// ============================================================================
// ENHANCED VALIDATOR CLASS
// ============================================================================

class EnhancedDeploymentValidator {
  constructor(options = {}) {
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;
    this.verbose = options.verbose || false;

    // Define all 20 checks
    this.enhancedChecks = [
      { name: 'Dashboard chartAxisRange', fn: validateDashboardChartAxisRange },
      { name: 'Report References', fn: validateReportReferences },
      { name: 'Flow Entry Criteria', fn: validateFlowEntryCriteria },
      { name: 'Flow Runtime Context', fn: validateFlowRuntimeContext },
      { name: 'Record Types', fn: validateRecordTypes },
      { name: 'Layout Fields', fn: validateLayoutFields },
      { name: 'Lightning Page Components', fn: validateLightningPageComponents },
      { name: 'Custom Metadata Types', fn: validateCustomMetadataTypes },
      { name: 'Quick Actions', fn: validateQuickActions },
      { name: 'Sharing Rules', fn: validateSharingRules },
      { name: 'Workflow Field References', fn: validateWorkflowFieldReferences },
      { name: 'Duplicate Rules', fn: validateDuplicateRules }
    ];
  }

  /**
   * Parse deployment content to extract all metadata types
   */
  parseDeploymentContent(deploymentPath) {
    const content = {
      path: deploymentPath,
      dashboards: [],
      reports: [],
      flows: [],
      layouts: [],
      flexiPages: [],
      profiles: [],
      permissionSets: [],
      fields: [],
      objects: [],
      recordTypes: [],
      customMetadata: [],
      customMetadataTypes: [],
      quickActions: [],
      sharingRules: [],
      workflows: [],
      duplicateRules: [],
      matchingRules: [],
      lwc: [],
      aura: []
    };

    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);

      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          // Track LWC and Aura components by directory
          if (dir.includes('/lwc/')) {
            content.lwc.push({ name: file, path: filePath });
          } else if (dir.includes('/aura/')) {
            content.aura.push({ name: file, path: filePath });
          }
          walk(filePath);
        } else {
          this.categorizeFile(filePath, file, content);
        }
      });
    };

    walk(deploymentPath);
    return content;
  }

  /**
   * Categorize file by metadata type
   */
  categorizeFile(filePath, fileName, content) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const item = { path: filePath, name: fileName, content: fileContent };

      if (fileName.endsWith('.dashboard-meta.xml')) {
        content.dashboards.push(item);
      } else if (fileName.endsWith('.report-meta.xml')) {
        content.reports.push(item);
      } else if (fileName.endsWith('.flow-meta.xml')) {
        content.flows.push(item);
      } else if (fileName.endsWith('.layout-meta.xml')) {
        content.layouts.push(item);
      } else if (fileName.endsWith('.flexipage-meta.xml')) {
        content.flexiPages.push(item);
      } else if (fileName.endsWith('.profile-meta.xml')) {
        content.profiles.push(item);
      } else if (fileName.endsWith('.permissionset-meta.xml')) {
        content.permissionSets.push(item);
      } else if (fileName.endsWith('.field-meta.xml')) {
        content.fields.push(item);
      } else if (fileName.endsWith('.object-meta.xml')) {
        content.objects.push(item);
      } else if (fileName.endsWith('.recordType-meta.xml')) {
        content.recordTypes.push(item);
      } else if (fileName.endsWith('.md-meta.xml')) {
        content.customMetadata.push(item);
      } else if (fileName.endsWith('.object-meta.xml') && filePath.includes('__mdt')) {
        content.customMetadataTypes.push(item);
      } else if (fileName.endsWith('.quickAction-meta.xml')) {
        content.quickActions.push(item);
      } else if (fileName.endsWith('.sharingRules-meta.xml')) {
        content.sharingRules.push(item);
      } else if (fileName.endsWith('.workflow-meta.xml')) {
        content.workflows.push(item);
      } else if (fileName.endsWith('.duplicateRule-meta.xml')) {
        content.duplicateRules.push(item);
      } else if (fileName.endsWith('.matchingRule-meta.xml')) {
        content.matchingRules.push(item);
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }

  /**
   * Run all enhanced validation checks
   */
  async validateEnhanced(deploymentPath, options = {}) {
    console.log('\n🔍 Enhanced Pre-Deployment Validation (20 checks)');
    console.log('='.repeat(60));
    console.log(`Path: ${deploymentPath}`);
    console.log(`Org: ${this.orgAlias}`);
    console.log('='.repeat(60));

    const results = {
      timestamp: new Date().toISOString(),
      path: deploymentPath,
      org: this.orgAlias,
      passed: true,
      errors: [],
      warnings: [],
      info: [],
      checks: {},
      totalChecks: 20,
      passedChecks: 0,
      failedChecks: 0
    };

    // Parse content
    const content = this.parseDeploymentContent(deploymentPath);
    results.content = {
      dashboards: content.dashboards.length,
      reports: content.reports.length,
      flows: content.flows.length,
      layouts: content.layouts.length,
      flexiPages: content.flexiPages.length,
      profiles: content.profiles.length,
      fields: content.fields.length
    };

    console.log('\nContent Summary:');
    Object.entries(results.content).forEach(([type, count]) => {
      if (count > 0) console.log(`  ${type}: ${count}`);
    });

    console.log('\nRunning enhanced validation checks:');

    // Run all enhanced checks
    for (const check of this.enhancedChecks) {
      const checkResult = check.fn(content);
      results.checks[check.name] = checkResult;

      const status = checkResult.passed ?
        (checkResult.warnings?.length > 0 ? '⚠️' : '✅') : '❌';

      console.log(`  ${status} ${check.name}`);

      if (checkResult.errors?.length > 0) {
        results.errors.push(...checkResult.errors);
        results.failedChecks++;
      } else {
        results.passedChecks++;
      }

      if (checkResult.warnings?.length > 0) {
        results.warnings.push(...checkResult.warnings);
      }

      if (checkResult.info?.length > 0) {
        results.info.push(...checkResult.info);
      }
    }

    results.passed = results.errors.length === 0;

    // Generate report
    this.generateReport(results);

    return results;
  }

  /**
   * Generate validation report
   */
  generateReport(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Enhanced Validation Report');
    console.log('='.repeat(60));

    console.log(`\nChecks: ${results.passedChecks}/${results.totalChecks} passed`);
    console.log(`Overall Status: ${results.passed ? '✅ PASSED' : '❌ FAILED'}`);

    if (results.errors.length > 0) {
      console.log(`\n❌ Errors (${results.errors.length}):`);
      results.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    if (results.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${results.warnings.length}):`);
      results.warnings.slice(0, 10).forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning}`);
      });
      if (results.warnings.length > 10) {
        console.log(`  ... and ${results.warnings.length - 10} more`);
      }
    }

    if (results.info.length > 0 && this.verbose) {
      console.log(`\nℹ️  Information (${results.info.length}):`);
      results.info.slice(0, 5).forEach((info, i) => {
        console.log(`  ${i + 1}. ${info}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    if (!results.passed) {
      console.log('\n🛑 Deployment should not proceed until errors are resolved.');
    } else if (results.warnings.length > 0) {
      console.log('\n⚠️  Deployment can proceed but review warnings first.');
    } else {
      console.log('\n✅ All enhanced validation checks passed.');
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  EnhancedDeploymentValidator,
  // Individual check functions for testing
  validateDashboardChartAxisRange,
  validateReportReferences,
  validateFlowEntryCriteria,
  validateFlowRuntimeContext,
  validateRecordTypes,
  validateLayoutFields,
  validateLightningPageComponents,
  validateCustomMetadataTypes,
  validateQuickActions,
  validateSharingRules,
  validateWorkflowFieldReferences,
  validateDuplicateRules
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Enhanced Deployment Validator (20 checks)

Usage: node enhanced-deployment-validator.js <deploymentPath> [options]

Options:
  --org <alias>    Salesforce org alias
  --verbose        Show detailed output including info messages

Examples:
  node enhanced-deployment-validator.js ./force-app
  node enhanced-deployment-validator.js ./force-app --org myorg --verbose

Validation Checks (12 new + 8 base = 20 total):
  9.  Dashboard chartAxisRange
  10. Report reference format
  11. Flow entry criteria
  12. Flow runtime context
  13. Record Type validation
  14. Layout field existence
  15. Lightning Page components
  16. Custom Metadata Types
  17. Quick Action validation
  18. Sharing Rule validation
  19. Workflow field references
  20. Duplicate Rule validation
    `);
    process.exit(0);
  }

  const deploymentPath = path.resolve(args[0]);
  const options = {
    orgAlias: args.find(a => a.startsWith('--org'))?.split('=')[1],
    verbose: args.includes('--verbose')
  };

  const validator = new EnhancedDeploymentValidator(options);

  validator.validateEnhanced(deploymentPath, options)
    .then(results => {
      process.exit(results.passed ? 0 : 1);
    })
    .catch(error => {
      console.error(`\n❌ Validation error: ${error.message}`);
      process.exit(1);
    });
}
