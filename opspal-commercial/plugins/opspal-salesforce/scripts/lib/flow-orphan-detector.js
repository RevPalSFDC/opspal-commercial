/**
 * Flow Orphan Detector
 *
 * Detects orphaned decision branches in Salesforce Flows where
 * decision outcomes have null connectors (no actions connected).
 *
 * Related reflections: fa998934
 * ROI: $6,000/yr
 *
 * @module flow-orphan-detector
 */

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

// Issue severities based on impact
const SEVERITY = {
  CRITICAL: 'critical',  // Logic path with no action - data not being processed
  HIGH: 'high',          // Missing default path - edge cases not handled
  MEDIUM: 'medium',      // Orphaned elements - cleanup needed
  LOW: 'low'             // Informational - potential optimization
};

/**
 * Parse Flow XML file
 * @param {string} flowPath - Path to Flow XML file
 * @returns {Object} Parsed flow metadata
 */
function parseFlowXml(flowPath) {
  const xml = fs.readFileSync(flowPath, 'utf8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (name) => {
      // Always treat these as arrays for consistent processing
      return ['decisions', 'rules', 'conditions', 'assignments',
        'recordCreates', 'recordUpdates', 'recordDeletes',
        'recordLookups', 'screens', 'subflows', 'loops',
        'collectionProcessors', 'actionCalls'].includes(name);
    }
  });

  const parsed = parser.parse(xml);
  return parsed.Flow || parsed;
}

/**
 * Ensure value is an array
 * @param {*} value - Value to convert
 * @returns {Array}
 */
function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Build a map of all element names in the flow
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Set<string>} Set of element names
 */
function buildElementMap(flowMetadata) {
  const elements = new Set();

  // Collect all element types
  const elementTypes = [
    'decisions', 'assignments', 'recordCreates', 'recordUpdates',
    'recordDeletes', 'recordLookups', 'screens', 'subflows',
    'loops', 'collectionProcessors', 'actionCalls', 'waits'
  ];

  for (const type of elementTypes) {
    const items = ensureArray(flowMetadata[type]);
    for (const item of items) {
      if (item?.name) {
        elements.add(item.name);
      }
    }
  }

  return elements;
}

/**
 * Find all connectors in the flow
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Object} Map of source elements to their targets
 */
function buildConnectorMap(flowMetadata) {
  const connectors = {};

  // Helper to add connector
  const addConnector = (source, target, label = 'default') => {
    if (!connectors[source]) {
      connectors[source] = [];
    }
    connectors[source].push({ target, label });
  };

  // Start element
  if (flowMetadata.start?.connector?.targetReference) {
    addConnector('$start', flowMetadata.start.connector.targetReference, 'start');
  }

  // Process all element types with connectors
  const elementTypes = [
    'decisions', 'assignments', 'recordCreates', 'recordUpdates',
    'recordDeletes', 'recordLookups', 'screens', 'subflows',
    'loops', 'collectionProcessors', 'actionCalls'
  ];

  for (const type of elementTypes) {
    const items = ensureArray(flowMetadata[type]);

    for (const item of items) {
      if (!item?.name) continue;

      // Standard connector
      if (item.connector?.targetReference) {
        addConnector(item.name, item.connector.targetReference);
      }

      // Fault connector
      if (item.faultConnector?.targetReference) {
        addConnector(item.name, item.faultConnector.targetReference, 'fault');
      }

      // Decision-specific connectors
      if (type === 'decisions') {
        // Default connector
        if (item.defaultConnector?.targetReference) {
          addConnector(item.name, item.defaultConnector.targetReference, 'default');
        }

        // Rule connectors
        const rules = ensureArray(item.rules);
        for (const rule of rules) {
          if (rule?.connector?.targetReference) {
            addConnector(item.name, rule.connector.targetReference, rule.label || rule.name);
          }
        }
      }

      // Loop connectors
      if (type === 'loops') {
        if (item.nextValueConnector?.targetReference) {
          addConnector(item.name, item.nextValueConnector.targetReference, 'next');
        }
        if (item.noMoreValuesConnector?.targetReference) {
          addConnector(item.name, item.noMoreValuesConnector.targetReference, 'done');
        }
      }
    }
  }

  return connectors;
}

/**
 * Detect orphaned decision branches
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Object[]} Array of orphaned branch findings
 */
function detectOrphanedDecisionBranches(flowMetadata) {
  const orphans = [];

  const decisions = ensureArray(flowMetadata.decisions);

  for (const decision of decisions) {
    if (!decision?.name) continue;

    // Check default connector
    const hasDefaultTarget = decision.defaultConnector?.targetReference;
    const hasDefaultLabel = decision.defaultConnectorLabel;

    if (!hasDefaultTarget) {
      orphans.push({
        type: 'orphaned_default_branch',
        severity: SEVERITY.HIGH,
        decisionName: decision.name,
        branchName: 'Default Outcome',
        branchLabel: hasDefaultLabel || 'Default',
        description: `Decision "${decision.name}" has no action for the default outcome`,
        impact: 'Records that don\'t match any rule will pass through without being processed',
        recommendation: 'Add an element to handle the default case, or document why no action is needed'
      });
    }

    // Check each rule outcome
    const rules = ensureArray(decision.rules);

    for (const rule of rules) {
      if (!rule) continue;

      const hasRuleTarget = rule.connector?.targetReference;
      const ruleLabel = rule.label || rule.name || 'Unnamed Rule';

      if (!hasRuleTarget) {
        // Determine severity based on rule conditions
        const conditions = ensureArray(rule.conditions);
        const hasConditions = conditions.length > 0;

        orphans.push({
          type: 'orphaned_rule_branch',
          severity: hasConditions ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
          decisionName: decision.name,
          branchName: rule.name,
          branchLabel: ruleLabel,
          conditionCount: conditions.length,
          description: `Decision "${decision.name}" outcome "${ruleLabel}" has no connected action`,
          impact: hasConditions
            ? `Records matching ${conditions.length} condition(s) will not be processed`
            : 'Branch exists but has no conditions or actions',
          recommendation: 'Connect this outcome to an appropriate element (assignment, record update, etc.)'
        });
      }
    }
  }

  return orphans;
}

/**
 * Find unreachable elements (not connected from any source)
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Object[]} Array of unreachable element findings
 */
function detectUnreachableElements(flowMetadata) {
  const unreachable = [];
  const elements = buildElementMap(flowMetadata);
  const connectors = buildConnectorMap(flowMetadata);

  // Find all elements that are targets of connectors
  const reachable = new Set();

  for (const targets of Object.values(connectors)) {
    for (const { target } of targets) {
      reachable.add(target);
    }
  }

  // Check which elements are not reachable
  for (const element of elements) {
    if (!reachable.has(element)) {
      unreachable.push({
        type: 'unreachable_element',
        severity: SEVERITY.MEDIUM,
        elementName: element,
        description: `Element "${element}" is not connected from any other element`,
        impact: 'This element will never be executed',
        recommendation: 'Connect this element to the flow or remove it if no longer needed'
      });
    }
  }

  return unreachable;
}

/**
 * Detect missing fault paths on DML operations
 * @param {Object} flowMetadata - Parsed flow metadata
 * @returns {Object[]} Array of missing fault path findings
 */
function detectMissingFaultPaths(flowMetadata) {
  const missing = [];

  const dmlTypes = ['recordCreates', 'recordUpdates', 'recordDeletes'];

  for (const type of dmlTypes) {
    const operations = ensureArray(flowMetadata[type]);

    for (const op of operations) {
      if (!op?.name) continue;

      if (!op.faultConnector?.targetReference) {
        missing.push({
          type: 'missing_fault_path',
          severity: SEVERITY.MEDIUM,
          elementName: op.name,
          operationType: type.replace('record', '').replace('s', ''),
          objectName: op.object || 'Unknown',
          description: `${type.replace('record', '').replace('s', '')} operation "${op.name}" has no fault path`,
          impact: 'If this operation fails, the flow will throw an unhandled exception',
          recommendation: 'Add a fault connector to gracefully handle errors'
        });
      }
    }
  }

  return missing;
}

/**
 * Full flow analysis for orphaned elements
 * @param {string} flowPath - Path to Flow XML file
 * @param {Object} options - Analysis options
 * @returns {Object} Complete analysis result
 */
function analyzeFlow(flowPath, options = {}) {
  const result = {
    flowPath,
    flowName: path.basename(flowPath, '.flow-meta.xml'),
    timestamp: new Date().toISOString(),
    healthy: true,
    findings: [],
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0
    },
    recommendations: []
  };

  // Check file exists
  if (!fs.existsSync(flowPath)) {
    result.healthy = false;
    result.findings.push({
      type: 'file_not_found',
      severity: SEVERITY.CRITICAL,
      description: `Flow file not found: ${flowPath}`
    });
    return result;
  }

  try {
    // Parse flow
    const flowMetadata = parseFlowXml(flowPath);

    // Run all detections
    const orphanedBranches = detectOrphanedDecisionBranches(flowMetadata);
    const unreachableElements = detectUnreachableElements(flowMetadata);
    const missingFaultPaths = options.checkFaultPaths !== false
      ? detectMissingFaultPaths(flowMetadata)
      : [];

    // Combine findings
    result.findings = [
      ...orphanedBranches,
      ...unreachableElements,
      ...missingFaultPaths
    ];

    // Calculate summary
    for (const finding of result.findings) {
      result.summary[finding.severity]++;
      result.summary.total++;
    }

    // Determine health
    if (result.summary.critical > 0 || result.summary.high > 0) {
      result.healthy = false;
    }

    // Generate recommendations
    const uniqueRecommendations = new Set(result.findings.map(f => f.recommendation));
    result.recommendations = [...uniqueRecommendations];

    if (result.healthy) {
      result.recommendations.push('Flow structure looks healthy - no orphaned elements detected');
    }

  } catch (err) {
    result.healthy = false;
    result.findings.push({
      type: 'parse_error',
      severity: SEVERITY.CRITICAL,
      description: `Failed to parse Flow: ${err.message}`
    });
  }

  return result;
}

/**
 * Analyze all flows in a directory
 * @param {string} dirPath - Path to directory containing Flow files
 * @param {Object} options - Analysis options
 * @returns {Object} Aggregate analysis result
 */
function analyzeFlowDirectory(dirPath, options = {}) {
  const result = {
    directory: dirPath,
    timestamp: new Date().toISOString(),
    flowsAnalyzed: 0,
    healthyFlows: 0,
    unhealthyFlows: 0,
    flows: [],
    aggregateSummary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0
    }
  };

  // Find all flow files
  const files = fs.readdirSync(dirPath).filter(f =>
    f.endsWith('.flow-meta.xml') || f.endsWith('.flow')
  );

  for (const file of files) {
    const flowPath = path.join(dirPath, file);
    const flowResult = analyzeFlow(flowPath, options);

    result.flowsAnalyzed++;
    result.flows.push(flowResult);

    if (flowResult.healthy) {
      result.healthyFlows++;
    } else {
      result.unhealthyFlows++;
    }

    // Aggregate summary
    for (const severity of ['critical', 'high', 'medium', 'low', 'total']) {
      result.aggregateSummary[severity] += flowResult.summary[severity];
    }
  }

  return result;
}

/**
 * Generate a human-readable report
 * @param {Object} analysisResult - Result from analyzeFlow
 * @returns {string} Formatted report
 */
function generateReport(analysisResult) {
  let report = [];

  report.push(`Flow Orphan Analysis Report`);
  report.push(`=`.repeat(50));
  report.push(`Flow: ${analysisResult.flowName}`);
  report.push(`Analyzed: ${analysisResult.timestamp}`);
  report.push(`Status: ${analysisResult.healthy ? 'HEALTHY' : 'ISSUES FOUND'}`);
  report.push(``);

  report.push(`Summary:`);
  report.push(`  Critical: ${analysisResult.summary.critical}`);
  report.push(`  High: ${analysisResult.summary.high}`);
  report.push(`  Medium: ${analysisResult.summary.medium}`);
  report.push(`  Low: ${analysisResult.summary.low}`);
  report.push(``);

  if (analysisResult.findings.length > 0) {
    report.push(`Findings:`);
    report.push(`-`.repeat(50));

    for (const finding of analysisResult.findings) {
      report.push(``);
      report.push(`[${finding.severity.toUpperCase()}] ${finding.type}`);
      if (finding.decisionName) {
        report.push(`  Decision: ${finding.decisionName}`);
      }
      if (finding.branchLabel) {
        report.push(`  Branch: ${finding.branchLabel}`);
      }
      if (finding.elementName) {
        report.push(`  Element: ${finding.elementName}`);
      }
      report.push(`  Description: ${finding.description}`);
      report.push(`  Impact: ${finding.impact}`);
      report.push(`  Recommendation: ${finding.recommendation}`);
    }
  }

  report.push(``);
  report.push(`Recommendations:`);
  for (const rec of analysisResult.recommendations) {
    report.push(`  - ${rec}`);
  }

  return report.join('\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'analyze':
      if (!args[1]) {
        console.error('Usage: flow-orphan-detector.js analyze <flow-path> [--report]');
        process.exit(1);
      }
      const showReport = args.includes('--report');
      const flowResult = analyzeFlow(args[1]);

      if (showReport) {
        console.log(generateReport(flowResult));
      } else {
        console.log(JSON.stringify(flowResult, null, 2));
      }
      process.exit(flowResult.healthy ? 0 : 1);
      break;

    case 'analyze-dir':
      if (!args[1]) {
        console.error('Usage: flow-orphan-detector.js analyze-dir <directory>');
        process.exit(1);
      }
      const dirResult = analyzeFlowDirectory(args[1]);
      console.log(JSON.stringify(dirResult, null, 2));
      process.exit(dirResult.unhealthyFlows === 0 ? 0 : 1);
      break;

    case 'report':
      if (!args[1]) {
        console.error('Usage: flow-orphan-detector.js report <flow-path>');
        process.exit(1);
      }
      const reportResult = analyzeFlow(args[1]);
      console.log(generateReport(reportResult));
      break;

    default:
      console.log(`Flow Orphan Detector

Usage:
  flow-orphan-detector.js analyze <flow-path> [--report]  Analyze single Flow
  flow-orphan-detector.js analyze-dir <directory>         Analyze all Flows in directory
  flow-orphan-detector.js report <flow-path>              Generate human-readable report

Detects:
  - Orphaned decision branches (outcomes with no connected elements)
  - Unreachable elements (not connected from any source)
  - Missing fault paths on DML operations

Severity Levels:
  CRITICAL - Logic path with conditions but no action (data not processed)
  HIGH     - Missing default path (edge cases unhandled)
  MEDIUM   - Orphaned/unreachable elements (cleanup needed)
  LOW      - Informational (optimization opportunity)

Examples:
  # Analyze a single Flow
  node flow-orphan-detector.js analyze MyFlow.flow-meta.xml

  # Generate readable report
  node flow-orphan-detector.js report MyFlow.flow-meta.xml

  # Analyze all Flows in a directory
  node flow-orphan-detector.js analyze-dir force-app/main/default/flows/
`);
  }
}

module.exports = {
  SEVERITY,
  parseFlowXml,
  buildElementMap,
  buildConnectorMap,
  detectOrphanedDecisionBranches,
  detectUnreachableElements,
  detectMissingFaultPaths,
  analyzeFlow,
  analyzeFlowDirectory,
  generateReport
};
