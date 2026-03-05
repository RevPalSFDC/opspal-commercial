#!/usr/bin/env node

/**
 * FlowBranchAnalyzer - Track Flow decision branch coverage during testing
 *
 * @module flow-branch-analyzer
 * @version 3.43.0
 * @description Analyzes which Flow decision branches were executed during testing,
 *              generates coverage reports, and creates test plans for uncovered branches.
 *              Part of Runbook 7: Flow Testing & Diagnostic Framework.
 *
 * @see docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md (Section 3)
 * @see docs/FLOW_DIAGNOSTIC_SCRIPT_INTERFACES.md (Section 5)
 *
 * @example
 * const { FlowBranchAnalyzer } = require('./flow-branch-analyzer');
 *
 * const analyzer = new FlowBranchAnalyzer('neonone');
 * const coverage = await analyzer.analyzeFlowCoverage('MyFlow', executionResults);
 *
 * console.log('Coverage:', coverage.coveragePercentage + '%');
 * if (coverage.coveragePercentage < 100) {
 *   const testPlan = await analyzer.generateTestPlan('MyFlow', coverage);
 *   console.log('Need', testPlan.estimatedTests, 'more tests');
 * }
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Custom error class for coverage analysis failures
 */
class CoverageAnalysisError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CoverageAnalysisError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, CoverageAnalysisError);
  }
}

/**
 * FlowBranchAnalyzer - Analyze Flow branch coverage
 */
class FlowBranchAnalyzer {
  /**
   * Create a new FlowBranchAnalyzer instance
   *
   * @param {string} orgAlias - Salesforce org alias
   * @param {object} options - Configuration options
   * @param {boolean} [options.verbose=false] - Enable detailed logging
   * @param {boolean} [options.trackLoops=true] - Track loop iterations
   * @param {boolean} [options.trackSubflows=true] - Track subflow executions
   */
  constructor(orgAlias, options = {}) {
    if (!orgAlias) {
      throw new CoverageAnalysisError('orgAlias is required', 'INVALID_ARGUMENT');
    }

    this.orgAlias = orgAlias;
    this.options = {
      verbose: false,
      trackLoops: true,
      trackSubflows: true,
      ...options
    };

    this.log = this.options.verbose ? console.log : () => {};
  }

  /**
   * Emit observability event
   * @private
   */
  _emitEvent(event) {
    const fullEvent = {
      ...event,
      orgAlias: this.orgAlias,
      timestamp: new Date().toISOString()
    };

    if (process.env.ENABLE_OBSERVABILITY === '1') {
      console.log(`[OBSERVABILITY] ${JSON.stringify(fullEvent)}`);
    }
  }

  /**
   * Execute SF CLI command
   * @private
   */
  _execSfCommand(command, timeout = 60000) {
    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output.trim();
    } catch (error) {
      throw new CoverageAnalysisError(
        `SF CLI command failed: ${error.message}`,
        'CLI_ERROR',
        { command }
      );
    }
  }

  /**
   * Retrieve Flow metadata to get all elements
   *
   * @private
   * @param {string} flowApiName - Flow API name
   * @returns {Promise<object>} Flow metadata with all elements
   */
  async _getFlowMetadata(flowApiName) {
    try {
      // Query Flow definition
      const query = `SELECT DeveloperName, ActiveVersionId FROM FlowDefinition WHERE DeveloperName = '${flowApiName}' LIMIT 1`;
      const command = `sf data query --query "${query}" --target-org ${this.orgAlias} --json`;

      const output = this._execSfCommand(command);
      const data = JSON.parse(output);

      if (data.status !== 0 || !data.result?.records?.length) {
        throw new CoverageAnalysisError(
          'Flow not found',
          'FLOW_NOT_FOUND',
          { flowApiName }
        );
      }

      const flowDef = data.result.records[0];

      // Get Flow version metadata (contains elements)
      // Note: Full element list requires metadata API retrieval
      // For this implementation, we'll use a simplified approach

      return {
        apiName: flowApiName,
        versionId: flowDef.ActiveVersionId,
        elements: [] // Would be populated from metadata API
      };

    } catch (error) {
      throw new CoverageAnalysisError(
        'Failed to retrieve Flow metadata',
        'METADATA_ERROR',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Analyze Flow coverage from execution results
   *
   * @param {string} flowApiName - Flow API name
   * @param {Array<ExecutionResult>} executionResults - Array of execution results from FlowExecutor
   * @returns {Promise<CoverageReport>} Coverage analysis
   *
   * @example
   * const coverage = await analyzer.analyzeFlowCoverage('MyFlow', [
   *   executionResult1,
   *   executionResult2,
   *   executionResult3
   * ]);
   *
   * console.log('Coverage:', coverage.coveragePercentage);
   * console.log('Uncovered branches:', coverage.uncoveredBranches.length);
   */
  async analyzeFlowCoverage(flowApiName, executionResults) {
    const startTime = Date.now();
    this.log(`\n=== Analyzing Flow Coverage: ${flowApiName} ===`);
    this.log(`Execution Results: ${executionResults.length}`);

    try {
      // Get Flow metadata to understand all possible elements
      const flowMetadata = await this._getFlowMetadata(flowApiName);

      // Track executed elements and decisions
      const elementExecutions = new Map(); // elementName -> count
      const decisionOutcomes = new Map(); // elementName -> { outcome -> count }
      const loopIterations = new Map(); // elementName -> total iterations
      const subflowExecutions = new Map(); // subflowName -> count

      // Process each execution result
      for (const execution of executionResults) {
        if (!execution.success) {
          this.log(`Skipping failed execution: ${execution.executionId}`);
          continue;
        }

        // Track elements executed
        if (execution.elementsExecuted) {
          execution.elementsExecuted.forEach(elementName => {
            elementExecutions.set(
              elementName,
              (elementExecutions.get(elementName) || 0) + 1
            );
          });
        }

        // Track decision outcomes
        if (execution.decisionsEvaluated) {
          execution.decisionsEvaluated.forEach(decision => {
            if (!decisionOutcomes.has(decision.elementName)) {
              decisionOutcomes.set(decision.elementName, {});
            }

            const outcomes = decisionOutcomes.get(decision.elementName);
            const branchName = decision.branchTaken || (decision.outcome ? 'true' : 'false');

            outcomes[branchName] = (outcomes[branchName] || 0) + 1;
          });
        }
      }

      // Build coverage report
      const report = {
        flowApiName,
        flowVersionNumber: null, // Would come from metadata
        totalExecutions: executionResults.length,
        totalElements: 0,
        elementsExecuted: 0,
        coveragePercentage: 0,
        elements: [],
        decisions: [],
        uncoveredElements: [],
        uncoveredBranches: [],
        loops: [],
        subflows: []
      };

      // Calculate coverage from tracked elements
      const allElements = Array.from(elementExecutions.keys());
      report.totalElements = allElements.length;
      report.elementsExecuted = allElements.length;

      // Process elements
      allElements.forEach(elementName => {
        report.elements.push({
          elementName,
          elementType: this._guessElementType(elementName),
          executionCount: elementExecutions.get(elementName),
          firstExecuted: null, // Would need execution timestamps
          lastExecuted: null
        });
      });

      // Process decisions for branch coverage
      for (const [elementName, outcomes] of decisionOutcomes.entries()) {
        const outcomeNames = Object.keys(outcomes);
        const totalOutcomes = this._estimateTotalOutcomes(elementName, outcomeNames);

        const decision = {
          elementName,
          totalOutcomes,
          outcomesCovered: outcomeNames.length,
          coveragePercentage: (outcomeNames.length / totalOutcomes) * 100,
          outcomes: outcomeNames.map(name => ({
            outcomeName: name,
            executionCount: outcomes[name],
            condition: 'Unknown' // Would need Flow XML to extract
          }))
        };

        report.decisions.push(decision);

        // Track uncovered branches
        if (decision.coveragePercentage < 100) {
          for (let i = outcomeNames.length; i < totalOutcomes; i++) {
            report.uncoveredBranches.push({
              decisionName: elementName,
              branchName: `Outcome_${i + 1}`,
              condition: 'Unknown'
            });
          }
        }
      }

      // Calculate overall coverage
      const totalCoverableItems = report.totalElements + report.uncoveredBranches.length;
      const coveredItems = report.elementsExecuted;

      if (totalCoverableItems > 0) {
        report.coveragePercentage = (coveredItems / totalCoverableItems) * 100;
      }

      this._emitEvent({
        type: 'flow_coverage_analysis',
        flowApiName,
        totalExecutions: report.totalExecutions,
        coveragePercentage: report.coveragePercentage,
        uncoveredElements: report.uncoveredElements.length,
        duration: Date.now() - startTime
      });

      this.log(`✓ Coverage: ${report.coveragePercentage.toFixed(1)}%`);
      this.log(`  Elements: ${report.elementsExecuted}/${report.totalElements}`);
      this.log(`  Uncovered branches: ${report.uncoveredBranches.length}`);

      return report;

    } catch (error) {
      this._emitEvent({
        type: 'flow_coverage_analysis',
        flowApiName,
        outcome: 'failure',
        duration: Date.now() - startTime,
        error: error.message
      });

      if (error instanceof CoverageAnalysisError) {
        throw error;
      }

      throw new CoverageAnalysisError(
        'Failed to analyze Flow coverage',
        'ANALYSIS_FAILED',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Guess element type from name
   * @private
   */
  _guessElementType(elementName) {
    const name = elementName.toLowerCase();
    if (name.includes('decision')) return 'Decision';
    if (name.includes('assignment')) return 'Assignment';
    if (name.includes('loop')) return 'Loop';
    if (name.includes('create')) return 'RecordCreate';
    if (name.includes('update')) return 'RecordUpdate';
    if (name.includes('get')) return 'RecordLookup';
    if (name.includes('delete')) return 'RecordDelete';
    return 'Unknown';
  }

  /**
   * Estimate total outcomes for a decision element
   * @private
   */
  _estimateTotalOutcomes(elementName, knownOutcomes) {
    // Simple heuristic: if we see 'true' or 'false', assume 2 outcomes
    // Otherwise, use number of known outcomes
    if (knownOutcomes.includes('true') || knownOutcomes.includes('false')) {
      return 2;
    }
    return knownOutcomes.length + 1; // Assume at least one uncovered
  }

  /**
   * Generate test plan to achieve full coverage
   *
   * @param {string} flowApiName - Flow API name
   * @param {CoverageReport} currentCoverage - Current coverage report
   * @returns {Promise<TestPlan>} Test plan for remaining coverage
   *
   * @example
   * if (coverage.coveragePercentage < 100) {
   *   const testPlan = await analyzer.generateTestPlan('MyFlow', coverage);
   *   console.log('Test cases needed:', testPlan.testCases);
   * }
   */
  async generateTestPlan(flowApiName, currentCoverage) {
    const startTime = Date.now();
    this.log(`\n=== Generating Test Plan: ${flowApiName} ===`);

    try {
      const testPlan = {
        flowApiName,
        currentCoverage: currentCoverage.coveragePercentage,
        targetCoverage: 100,
        testCases: [],
        estimatedTests: 0,
        estimatedDuration: 0
      };

      // Generate test cases for uncovered elements
      currentCoverage.uncoveredElements.forEach((elementName, index) => {
        testPlan.testCases.push({
          testName: `${elementName}_Coverage_${index + 1}`,
          objective: `Execute ${elementName} element`,
          targetElements: [elementName],
          targetBranches: [],
          suggestedTestData: {
            object: 'Unknown', // Would need Flow analysis
            recordData: {}
          },
          expectedOutcome: `${elementName} should execute`
        });
      });

      // Generate test cases for uncovered branches
      currentCoverage.uncoveredBranches.forEach((branch, index) => {
        testPlan.testCases.push({
          testName: `${branch.decisionName}_${branch.branchName}_Coverage`,
          objective: `Execute ${branch.branchName} branch of ${branch.decisionName}`,
          targetElements: [branch.decisionName],
          targetBranches: [branch.branchName],
          suggestedTestData: {
            object: 'Unknown',
            recordData: this._suggestTestDataForBranch(branch)
          },
          expectedOutcome: `Decision should take ${branch.branchName} path`
        });
      });

      testPlan.estimatedTests = testPlan.testCases.length;
      testPlan.estimatedDuration = testPlan.estimatedTests * 5; // 5 minutes per test

      this._emitEvent({
        type: 'flow_test_plan_generated',
        flowApiName,
        testsNeeded: testPlan.estimatedTests,
        duration: Date.now() - startTime
      });

      this.log(`✓ Test plan generated: ${testPlan.estimatedTests} tests needed`);
      return testPlan;

    } catch (error) {
      throw new CoverageAnalysisError(
        'Failed to generate test plan',
        'PLAN_GENERATION_FAILED',
        { flowApiName, error: error.message }
      );
    }
  }

  /**
   * Suggest test data for uncovered branch
   * @private
   */
  _suggestTestDataForBranch(branch) {
    // Parse condition if available to suggest data
    // This is a simplified heuristic

    if (branch.condition && branch.condition.includes('Status')) {
      return { Status__c: branch.branchName };
    }

    if (branch.condition && branch.condition.includes('Type')) {
      return { Type: branch.branchName };
    }

    return {
      // Generic placeholder
      Field__c: `Value to trigger ${branch.branchName}`
    };
  }

  /**
   * Export coverage report in various formats
   *
   * @param {CoverageReport} coverageReport - Coverage report
   * @param {string} format - Output format: 'html', 'markdown', 'json', 'csv'
   * @returns {string} Formatted report
   *
   * @example
   * const html = analyzer.exportCoverageReport(coverage, 'html');
   * fs.writeFileSync('coverage-report.html', html);
   */
  exportCoverageReport(coverageReport, format) {
    this.log(`\n=== Exporting Coverage Report (${format}) ===`);

    if (format === 'markdown') {
      return this._exportMarkdown(coverageReport);
    }

    if (format === 'html') {
      return this._exportHTML(coverageReport);
    }

    if (format === 'csv') {
      return this._exportCSV(coverageReport);
    }

    // Default: JSON
    return JSON.stringify(coverageReport, null, 2);
  }

  /**
   * Export as markdown
   * @private
   */
  _exportMarkdown(report) {
    let md = `# Flow Coverage Report\n\n`;
    md += `**Flow**: ${report.flowApiName}\n`;
    md += `**Total Executions**: ${report.totalExecutions}\n`;
    md += `**Coverage**: ${report.coveragePercentage.toFixed(1)}%\n`;
    md += `**Elements**: ${report.elementsExecuted}/${report.totalElements}\n\n`;

    md += `## Element Coverage\n\n`;
    md += `| Element | Type | Execution Count |\n`;
    md += `|---------|------|----------------|\n`;

    report.elements.forEach(element => {
      md += `| ${element.elementName} | ${element.elementType} | ${element.executionCount} |\n`;
    });

    md += `\n## Decision Coverage\n\n`;

    report.decisions.forEach(decision => {
      md += `### ${decision.elementName}\n`;
      md += `- **Coverage**: ${decision.coveragePercentage.toFixed(1)}% (${decision.outcomesCovered}/${decision.totalOutcomes} outcomes)\n\n`;

      md += `| Outcome | Execution Count |\n`;
      md += `|---------|----------------|\n`;

      decision.outcomes.forEach(outcome => {
        md += `| ${outcome.outcomeName} | ${outcome.executionCount} |\n`;
      });

      md += `\n`;
    });

    if (report.uncoveredBranches.length > 0) {
      md += `## Uncovered Branches\n\n`;

      report.uncoveredBranches.forEach(branch => {
        md += `- **${branch.decisionName}** → ${branch.branchName}\n`;
      });
    }

    return md;
  }

  /**
   * Export as HTML
   * @private
   */
  _exportHTML(report) {
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>Flow Coverage Report: ${report.flowApiName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #0176d3; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #0176d3; color: white; }
    .coverage-high { color: green; font-weight: bold; }
    .coverage-medium { color: orange; font-weight: bold; }
    .coverage-low { color: red; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Flow Coverage Report</h1>
  <p><strong>Flow:</strong> ${report.flowApiName}</p>
  <p><strong>Total Executions:</strong> ${report.totalExecutions}</p>
  <p><strong>Coverage:</strong> <span class="coverage-${report.coveragePercentage >= 80 ? 'high' : report.coveragePercentage >= 60 ? 'medium' : 'low'}">${report.coveragePercentage.toFixed(1)}%</span></p>

  <h2>Element Coverage</h2>
  <table>
    <tr><th>Element</th><th>Type</th><th>Execution Count</th></tr>`;

    report.elements.forEach(element => {
      html += `<tr><td>${element.elementName}</td><td>${element.elementType}</td><td>${element.executionCount}</td></tr>`;
    });

    html += `</table>

  <h2>Decision Coverage</h2>`;

    report.decisions.forEach(decision => {
      html += `<h3>${decision.elementName}</h3>
      <p>Coverage: ${decision.coveragePercentage.toFixed(1)}% (${decision.outcomesCovered}/${decision.totalOutcomes} outcomes)</p>
      <table>
        <tr><th>Outcome</th><th>Execution Count</th></tr>`;

      decision.outcomes.forEach(outcome => {
        html += `<tr><td>${outcome.outcomeName}</td><td>${outcome.executionCount}</td></tr>`;
      });

      html += `</table>`;
    });

    html += `</body></html>`;
    return html;
  }

  /**
   * Export as CSV
   * @private
   */
  _exportCSV(report) {
    let csv = `Element,Type,Execution Count\n`;

    report.elements.forEach(element => {
      csv += `"${element.elementName}","${element.elementType}",${element.executionCount}\n`;
    });

    return csv;
  }
}

// Export classes
module.exports = {
  FlowBranchAnalyzer,
  CoverageAnalysisError
};

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: flow-branch-analyzer.js <org-alias> <flow-api-name> [--results-file results.json]');
    console.error('       flow-branch-analyzer.js <org-alias> <flow-api-name> --generate-plan [--coverage-file coverage.json]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const flowApiName = args[1];

  const analyzer = new FlowBranchAnalyzer(orgAlias, { verbose: true });

  if (args.includes('--generate-plan')) {
    const coverageFile = args[args.indexOf('--coverage-file') + 1];

    if (!coverageFile) {
      console.error('--coverage-file required for --generate-plan');
      process.exit(1);
    }

    const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf-8'));

    analyzer.generateTestPlan(flowApiName, coverage)
      .then(testPlan => {
        console.log(JSON.stringify(testPlan, null, 2));
        process.exit(0);
      })
      .catch(error => {
        console.error('Test plan generation failed:', error.message);
        process.exit(1);
      });

  } else {
    const resultsFile = args[args.indexOf('--results-file') + 1];

    if (!resultsFile) {
      console.error('--results-file required for coverage analysis');
      process.exit(1);
    }

    const executionResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

    analyzer.analyzeFlowCoverage(flowApiName, executionResults)
      .then(coverage => {
        console.log(JSON.stringify(coverage, null, 2));
        process.exit(0);
      })
      .catch(error => {
        console.error('Coverage analysis failed:', error.message);
        process.exit(1);
      });
  }
}
