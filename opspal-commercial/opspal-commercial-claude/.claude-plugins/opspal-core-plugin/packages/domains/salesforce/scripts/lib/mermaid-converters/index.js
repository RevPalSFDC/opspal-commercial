/**
 * Mermaid Converters - Index
 *
 * Central export point for all Mermaid diagram converters.
 *
 * @module mermaid-converters
 * @version 1.0.0
 * @date 2025-10-20
 */

const { automationCascadeToFlowchart } = require('./automation-cascade-to-flowchart');
const { dependencyToERD, executionOrderToFlowchart } = require('./dependency-to-erd');
const { gtmFlowToFlowchart, attributionToSequence } = require('./gtm-flow-to-flowchart');
const {
  dashboardDependenciesToFlowchart,
  fieldUsageToERD,
  departmentCoverageToFlowchart,
  staleReportsToDecisionTree
} = require('./usage-data-to-diagrams');

module.exports = {
  // Automation Audit Converters
  automationCascadeToFlowchart,

  // Dependency Analysis Converters
  dependencyToERD,
  executionOrderToFlowchart,

  // RevOps Assessment Converters
  gtmFlowToFlowchart,
  attributionToSequence,

  // Reports Usage Audit Converters
  dashboardDependenciesToFlowchart,
  fieldUsageToERD,
  departmentCoverageToFlowchart,
  staleReportsToDecisionTree
};
