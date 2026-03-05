#!/usr/bin/env node

/**
 * Flow Change Detector
 *
 * Purpose: Detect potentially problematic changes in Salesforce Flow metadata,
 * particularly around change detection settings that can cause flows to fire
 * unexpectedly on every record update.
 *
 * Key Detections:
 * 1. Removal of doesRequireRecordChangedToMeetCriteria without explicit IsChanged
 * 2. High trigger order flows (>100) with change detection concerns
 * 3. Record-triggered flows without proper change detection
 * 4. Before vs After trigger considerations
 *
 * Usage:
 *   node flow-change-detector.js [options] <flow-xml-path>
 *
 * Options:
 *   --org <alias>      Salesforce org to compare against
 *   --compare-org      Compare local flow against org version
 *   --trigger-order    Show trigger order analysis
 *   --fix-suggestions  Generate fix suggestions
 *   --json             Output as JSON
 *   --verbose          Detailed analysis output
 *
 * Exit Codes:
 *   0 - No issues detected
 *   1 - Warnings detected (non-blocking)
 *   2 - Errors detected (potentially blocking)
 *   3 - Execution error
 *
 * @module flow-change-detector
 * @version 1.0.0
 * @since 2025-12-05
 * @reflection-cohort idempotency/state
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Trigger order thresholds
  triggerOrder: {
    warning: 100,   // Warn if trigger order > 100
    critical: 200,  // Critical if trigger order > 200
  },

  // Known problematic patterns
  problematicPatterns: [
    {
      pattern: /doesRequireRecordChangedToMeetCriteria.*false/i,
      message: 'doesRequireRecordChangedToMeetCriteria is set to false',
      severity: 'warning',
      suggestion: 'Add explicit ISCHANGED() conditions to entry criteria',
    },
    {
      pattern: /<triggerType>RecordAfterSave<\/triggerType>(?![\s\S]*doesRequireRecordChangedToMeetCriteria)/i,
      message: 'After-save trigger without explicit change detection setting',
      severity: 'info',
      suggestion: 'Consider adding doesRequireRecordChangedToMeetCriteria or ISCHANGED() conditions',
    },
  ],

  // Fields that commonly trigger unintended flow runs
  volatileFields: [
    'LastModifiedDate',
    'LastModifiedById',
    'SystemModstamp',
    'LastViewedDate',
    'LastReferencedDate',
  ],
};

// =============================================================================
// XML Parsing Utilities
// =============================================================================

/**
 * Simple XML value extractor (no external dependencies)
 */
function extractXmlValue(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Extract all occurrences of a tag value
 */
function extractAllXmlValues(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'gi');
  const values = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1]);
  }
  return values;
}

/**
 * Check if XML contains a tag
 */
function hasXmlTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>`, 'i');
  return regex.test(xml);
}

/**
 * Extract tag with attributes
 */
function extractXmlBlock(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

// =============================================================================
// Flow Analysis Functions
// =============================================================================

/**
 * Parse flow metadata from XML
 */
function parseFlowMetadata(flowXml) {
  return {
    apiVersion: extractXmlValue(flowXml, 'apiVersion'),
    label: extractXmlValue(flowXml, 'label'),
    processType: extractXmlValue(flowXml, 'processType'),
    status: extractXmlValue(flowXml, 'status'),
    triggerType: extractXmlValue(flowXml, 'triggerType'),
    triggerOrder: parseInt(extractXmlValue(flowXml, 'triggerOrder') || '0', 10),
    objectType: extractXmlValue(flowXml, 'objectType') || extractXmlValue(flowXml, 'object'),
    doesRequireRecordChangedToMeetCriteria: extractXmlValue(flowXml, 'doesRequireRecordChangedToMeetCriteria'),
    recordTriggerType: extractXmlValue(flowXml, 'recordTriggerType'),
  };
}

/**
 * Extract entry conditions from flow
 */
function extractEntryConditions(flowXml) {
  const conditions = [];

  // Look for recordFilter conditions
  const filters = extractXmlBlock(flowXml, 'recordFilter');
  for (const filter of filters) {
    conditions.push({
      type: 'recordFilter',
      field: extractXmlValue(filter, 'field'),
      operator: extractXmlValue(filter, 'operator'),
      value: extractXmlValue(filter, 'value') || extractXmlValue(filter, 'stringValue'),
    });
  }

  // Look for formula conditions in entry criteria
  const formulas = extractXmlBlock(flowXml, 'formula');
  for (const formula of formulas) {
    const formulaText = formula.replace(/<\/?formula>/gi, '').trim();
    if (formulaText.includes('ISCHANGED') || formulaText.includes('ISNEW') || formulaText.includes('PRIORVALUE')) {
      conditions.push({
        type: 'formula',
        formula: formulaText,
        hasIsChanged: formulaText.includes('ISCHANGED'),
        hasIsNew: formulaText.includes('ISNEW'),
        hasPriorValue: formulaText.includes('PRIORVALUE'),
      });
    }
  }

  return conditions;
}

/**
 * Detect change detection issues
 */
function detectChangeDetectionIssues(flowXml, metadata) {
  const issues = [];

  // Check if it's a record-triggered flow
  const isRecordTriggered =
    metadata.processType === 'AutoLaunchedFlow' &&
    (metadata.triggerType === 'RecordAfterSave' ||
     metadata.triggerType === 'RecordBeforeSave' ||
     metadata.recordTriggerType);

  if (!isRecordTriggered) {
    return issues; // Not applicable
  }

  // Check doesRequireRecordChangedToMeetCriteria
  const requiresChange = metadata.doesRequireRecordChangedToMeetCriteria;
  const conditions = extractEntryConditions(flowXml);
  const hasExplicitIsChanged = conditions.some(c => c.hasIsChanged);

  // Issue 1: Change detection disabled without explicit ISCHANGED
  if (requiresChange === 'false' && !hasExplicitIsChanged) {
    issues.push({
      severity: 'error',
      code: 'CHANGE_DETECTION_DISABLED',
      message: 'doesRequireRecordChangedToMeetCriteria is false without explicit ISCHANGED() in entry criteria',
      impact: 'Flow will run on EVERY record update, not just when criteria fields change',
      recommendation: 'Add ISCHANGED(FieldName) conditions to entry criteria to prevent unnecessary executions',
      affectedElement: 'start',
    });
  }

  // Issue 2: Missing change detection entirely (no flag, no ISCHANGED)
  if (!requiresChange && !hasExplicitIsChanged && metadata.triggerType === 'RecordAfterSave') {
    issues.push({
      severity: 'warning',
      code: 'NO_CHANGE_DETECTION',
      message: 'After-save trigger without explicit change detection',
      impact: 'Flow may run on updates that don\'t affect relevant fields',
      recommendation: 'Consider adding doesRequireRecordChangedToMeetCriteria="true" or explicit ISCHANGED() conditions',
      affectedElement: 'start',
    });
  }

  // Issue 3: High trigger order with change detection concerns
  if (metadata.triggerOrder > CONFIG.triggerOrder.warning) {
    const severity = metadata.triggerOrder > CONFIG.triggerOrder.critical ? 'error' : 'warning';
    issues.push({
      severity,
      code: 'HIGH_TRIGGER_ORDER',
      message: `Trigger order ${metadata.triggerOrder} is ${severity === 'error' ? 'critically' : ''} high`,
      impact: 'Flow runs after many other automations; fields may already be changed, affecting ISCHANGED() behavior',
      recommendation: 'Use explicit ISCHANGED() instead of doesRequireRecordChangedToMeetCriteria for trigger order > 100',
      affectedElement: 'start',
      triggerOrder: metadata.triggerOrder,
    });

    // Additional check: High trigger order + relying on doesRequireRecordChangedToMeetCriteria
    if (requiresChange === 'true' && !hasExplicitIsChanged) {
      issues.push({
        severity: 'error',
        code: 'HIGH_ORDER_IMPLICIT_CHANGE_DETECTION',
        message: 'High trigger order flow relies on implicit change detection',
        impact: 'Changes made by earlier automations will be invisible to doesRequireRecordChangedToMeetCriteria',
        recommendation: 'Replace doesRequireRecordChangedToMeetCriteria with explicit ISCHANGED() conditions',
        affectedElement: 'start',
      });
    }
  }

  return issues;
}

/**
 * Compare flow versions for change detection changes
 */
function compareFlowVersions(localXml, orgXml) {
  const localMeta = parseFlowMetadata(localXml);
  const orgMeta = parseFlowMetadata(orgXml);

  const changes = [];

  // Check if change detection was removed
  if (orgMeta.doesRequireRecordChangedToMeetCriteria === 'true' &&
      localMeta.doesRequireRecordChangedToMeetCriteria !== 'true') {
    changes.push({
      type: 'change_detection_removed',
      severity: 'error',
      message: 'doesRequireRecordChangedToMeetCriteria was removed or set to false',
      before: 'true',
      after: localMeta.doesRequireRecordChangedToMeetCriteria || 'not specified',
      impact: 'Flow will now run on every update instead of only when criteria fields change',
    });
  }

  // Check trigger order changes
  if (localMeta.triggerOrder !== orgMeta.triggerOrder) {
    const severity = localMeta.triggerOrder > CONFIG.triggerOrder.warning ? 'warning' : 'info';
    changes.push({
      type: 'trigger_order_changed',
      severity,
      message: `Trigger order changed from ${orgMeta.triggerOrder} to ${localMeta.triggerOrder}`,
      before: orgMeta.triggerOrder,
      after: localMeta.triggerOrder,
      impact: localMeta.triggerOrder > orgMeta.triggerOrder
        ? 'Flow now runs later in the execution order'
        : 'Flow now runs earlier in the execution order',
    });
  }

  // Check trigger type changes
  if (localMeta.triggerType !== orgMeta.triggerType) {
    changes.push({
      type: 'trigger_type_changed',
      severity: 'warning',
      message: `Trigger type changed from ${orgMeta.triggerType} to ${localMeta.triggerType}`,
      before: orgMeta.triggerType,
      after: localMeta.triggerType,
      impact: 'Flow execution timing has changed',
    });
  }

  return {
    local: localMeta,
    org: orgMeta,
    changes,
  };
}

/**
 * Generate fix suggestions for issues
 */
function generateFixSuggestions(issues, metadata) {
  const suggestions = [];

  for (const issue of issues) {
    switch (issue.code) {
      case 'CHANGE_DETECTION_DISABLED':
      case 'NO_CHANGE_DETECTION':
        suggestions.push({
          issue: issue.code,
          fix: 'Add ISCHANGED() to entry criteria',
          example: `
<!-- Add to entry criteria formula -->
<formula>
  AND(
    ISCHANGED({$Prior_Field__c}),
    /* other conditions */
  )
</formula>
`,
          alternativeFix: 'Set doesRequireRecordChangedToMeetCriteria to true',
          alternativeExample: `
<doesRequireRecordChangedToMeetCriteria>true</doesRequireRecordChangedToMeetCriteria>
`,
        });
        break;

      case 'HIGH_ORDER_IMPLICIT_CHANGE_DETECTION':
        suggestions.push({
          issue: issue.code,
          fix: 'Replace implicit with explicit change detection',
          example: `
<!-- Remove doesRequireRecordChangedToMeetCriteria and add explicit conditions -->
<recordFilter>
  <field>Status</field>
  <operator>EqualTo</operator>
  <value><stringValue>Active</stringValue></value>
</recordFilter>
<!-- Add formula condition with ISCHANGED -->
<entryConditions>
  <formula>ISCHANGED(Status)</formula>
  <triggerType>RecordAfterSave</triggerType>
</entryConditions>
`,
          note: `With trigger order ${metadata.triggerOrder}, earlier automations may have already changed the record, making the implicit change detection unreliable.`,
        });
        break;

      case 'HIGH_TRIGGER_ORDER':
        suggestions.push({
          issue: issue.code,
          fix: 'Review automation order or use explicit ISCHANGED()',
          recommendation: [
            'Consider lowering trigger order if possible',
            'Use explicit ISCHANGED() instead of relying on doesRequireRecordChangedToMeetCriteria',
            'Document why high trigger order is necessary',
          ],
        });
        break;
    }
  }

  return suggestions;
}

// =============================================================================
// Org Integration
// =============================================================================

/**
 * Get flow from org for comparison
 */
function getFlowFromOrg(flowName, orgAlias) {
  try {
    const result = execSync(
      `sf project retrieve start --metadata "Flow:${flowName}" --target-org "${orgAlias}" --json 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );

    const data = JSON.parse(result);
    if (data.status !== 0) {
      return null;
    }

    // Find the retrieved flow file
    const flowPath = path.join(process.cwd(), 'force-app', 'main', 'default', 'flows', `${flowName}.flow-meta.xml`);
    if (fs.existsSync(flowPath)) {
      return fs.readFileSync(flowPath, 'utf8');
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Get all record-triggered flows from org
 */
function getRecordTriggeredFlows(orgAlias) {
  try {
    const result = execSync(
      `sf data query --query "SELECT DeveloperName, ProcessType, TriggerType FROM FlowVersionView WHERE Status = 'Active' AND ProcessType = 'AutoLaunchedFlow'" --target-org "${orgAlias}" --use-tooling-api --json 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );

    const data = JSON.parse(result);
    if (data.status === 0 && data.result?.records) {
      return data.result.records.filter(f =>
        f.TriggerType === 'RecordAfterSave' ||
        f.TriggerType === 'RecordBeforeSave' ||
        f.TriggerType === 'RecordAfterDelete'
      );
    }

    return [];
  } catch (e) {
    return [];
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json'),
    compareOrg: args.includes('--compare-org'),
    triggerOrder: args.includes('--trigger-order'),
    fixSuggestions: args.includes('--fix-suggestions'),
  };

  // Parse named arguments
  const getArg = (name) => {
    const index = args.findIndex(a => a === `--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };

  const orgAlias = getArg('org');

  // Find flow path (positional argument)
  const flowPath = args.find(a => !a.startsWith('--') && (a.endsWith('.xml') || fs.existsSync(a)));

  if (!flowPath) {
    console.log(`
Flow Change Detector

Analyzes Salesforce Flows for change detection issues that can cause
flows to fire on every record update.

Usage:
  node flow-change-detector.js [options] <flow-xml-path>

Options:
  --org <alias>       Salesforce org alias
  --compare-org       Compare local flow against org version
  --trigger-order     Include trigger order analysis
  --fix-suggestions   Generate fix suggestions
  --json              Output as JSON
  --verbose           Detailed analysis

Examples:
  # Analyze a local flow file
  node flow-change-detector.js ./force-app/main/default/flows/MyFlow.flow-meta.xml

  # Compare against org version
  node flow-change-detector.js ./flows/MyFlow.flow-meta.xml --compare-org --org myorg

  # Full analysis with fixes
  node flow-change-detector.js ./flows/MyFlow.flow-meta.xml --fix-suggestions --verbose

Common Issues Detected:
  - doesRequireRecordChangedToMeetCriteria removed without ISCHANGED()
  - High trigger order (>100) with implicit change detection
  - Missing change detection on after-save triggers
`);
    process.exit(0);
  }

  // Read and parse flow
  if (!fs.existsSync(flowPath)) {
    console.error(`Error: Flow file not found: ${flowPath}`);
    process.exit(3);
  }

  const flowXml = fs.readFileSync(flowPath, 'utf8');
  const metadata = parseFlowMetadata(flowXml);
  const issues = detectChangeDetectionIssues(flowXml, metadata);
  const conditions = extractEntryConditions(flowXml);

  // Compare with org if requested
  let comparison = null;
  if (options.compareOrg && orgAlias && metadata.label) {
    const orgXml = getFlowFromOrg(metadata.label, orgAlias);
    if (orgXml) {
      comparison = compareFlowVersions(flowXml, orgXml);
    }
  }

  // Generate fix suggestions if requested
  let suggestions = [];
  if (options.fixSuggestions && issues.length > 0) {
    suggestions = generateFixSuggestions(issues, metadata);
  }

  // Build result
  const result = {
    flowPath,
    metadata,
    entryConditions: conditions,
    issues,
    comparison,
    suggestions,
    summary: {
      totalIssues: issues.length,
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
    },
  };

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n=== Flow Change Detection Analysis ===`);
    console.log(`Flow: ${metadata.label || path.basename(flowPath)}`);
    console.log(`Process Type: ${metadata.processType}`);
    console.log(`Trigger Type: ${metadata.triggerType || 'N/A'}`);
    console.log(`Trigger Order: ${metadata.triggerOrder}`);
    console.log(`Change Detection: ${metadata.doesRequireRecordChangedToMeetCriteria || 'not specified'}`);

    if (conditions.length > 0) {
      console.log(`\nEntry Conditions (${conditions.length}):`);
      for (const cond of conditions) {
        if (cond.type === 'formula') {
          console.log(`  - Formula: ${cond.formula.substring(0, 50)}...`);
          if (cond.hasIsChanged) console.log(`    [Has ISCHANGED]`);
        } else {
          console.log(`  - ${cond.field} ${cond.operator} ${cond.value}`);
        }
      }
    }

    if (issues.length > 0) {
      console.log(`\n=== Issues Detected (${issues.length}) ===`);
      for (const issue of issues) {
        const icon = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️';
        console.log(`\n${icon} ${issue.code}`);
        console.log(`   ${issue.message}`);
        console.log(`   Impact: ${issue.impact}`);
        console.log(`   Recommendation: ${issue.recommendation}`);
      }
    } else {
      console.log(`\n✅ No change detection issues found`);
    }

    if (comparison && comparison.changes.length > 0) {
      console.log(`\n=== Version Comparison ===`);
      for (const change of comparison.changes) {
        const icon = change.severity === 'error' ? '🔴' : change.severity === 'warning' ? '🟡' : 'ℹ️';
        console.log(`\n${icon} ${change.type}`);
        console.log(`   ${change.message}`);
        console.log(`   Before: ${change.before}`);
        console.log(`   After: ${change.after}`);
        console.log(`   Impact: ${change.impact}`);
      }
    }

    if (suggestions.length > 0) {
      console.log(`\n=== Fix Suggestions ===`);
      for (const sug of suggestions) {
        console.log(`\nFor ${sug.issue}:`);
        console.log(`  Fix: ${sug.fix}`);
        if (sug.example) {
          console.log(`  Example:`);
          console.log(sug.example);
        }
        if (sug.alternativeFix) {
          console.log(`  Alternative: ${sug.alternativeFix}`);
        }
        if (sug.recommendation) {
          console.log(`  Recommendations:`);
          for (const rec of sug.recommendation) {
            console.log(`    - ${rec}`);
          }
        }
      }
    }
  }

  // Exit code based on issues
  if (result.summary.errors > 0) {
    process.exit(2);
  } else if (result.summary.warnings > 0) {
    process.exit(1);
  }
  process.exit(0);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  parseFlowMetadata,
  extractEntryConditions,
  detectChangeDetectionIssues,
  compareFlowVersions,
  generateFixSuggestions,
  getFlowFromOrg,
  getRecordTriggeredFlows,
  CONFIG,
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(3);
  });
}
