#!/usr/bin/env node

/**
 * UAT Report Generator
 *
 * Generates test execution reports in multiple formats:
 * - CSV: For spreadsheet analysis and tracking
 * - Markdown: For documentation and review
 * - JSON: For programmatic processing
 *
 * @module uat-report-generator
 * @version 1.0.0
 *
 * @example
 * const { UATReportGenerator } = require('./uat-report-generator');
 *
 * const generator = new UATReportGenerator(testResults);
 * await generator.generateMarkdown('./reports/uat-report.md');
 * await generator.generateCSV('./reports/uat-report.csv');
 * await generator.generateJSON('./reports/uat-report.json');
 */

const fs = require('fs');
const path = require('path');

/**
 * UAT Report Generator
 */
class UATReportGenerator {
  /**
   * Create a report generator
   * @param {Object} results - Test execution results from UATTestRunner
   * @param {Object} [options] - Generator options
   * @param {boolean} [options.includeEvidence=true] - Include evidence in reports
   * @param {boolean} [options.includeSteps=true] - Include step details
   * @param {string} [options.title] - Report title
   */
  constructor(results, options = {}) {
    this.results = results;
    this.includeEvidence = options.includeEvidence !== false;
    this.includeSteps = options.includeSteps !== false;
    this.title = options.title || 'UAT Test Execution Report';
  }

  /**
   * Generate Markdown report
   * @param {string} outputPath - Output file path
   * @returns {Promise<Object>} Generation result
   */
  async generateMarkdown(outputPath) {
    const content = this.buildMarkdown();

    try {
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, content, 'utf-8');

      return {
        success: true,
        path: outputPath,
        format: 'markdown',
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate CSV report
   * @param {string} outputPath - Output file path
   * @returns {Promise<Object>} Generation result
   */
  async generateCSV(outputPath) {
    const content = this.buildCSV();

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, content, 'utf-8');

      return {
        success: true,
        path: outputPath,
        format: 'csv',
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate JSON report
   * @param {string} outputPath - Output file path
   * @returns {Promise<Object>} Generation result
   */
  async generateJSON(outputPath) {
    const content = JSON.stringify(this.buildJSON(), null, 2);

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, content, 'utf-8');

      return {
        success: true,
        path: outputPath,
        format: 'json',
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate all report formats
   * @param {string} outputDir - Output directory
   * @param {string} [baseName='uat-report'] - Base file name
   * @returns {Promise<Object>} Generation results
   */
  async generateAll(outputDir, baseName = 'uat-report') {
    const timestamp = new Date().toISOString().split('T')[0];
    const prefix = `${baseName}-${timestamp}`;

    const results = await Promise.all([
      this.generateMarkdown(path.join(outputDir, `${prefix}.md`)),
      this.generateCSV(path.join(outputDir, `${prefix}.csv`)),
      this.generateJSON(path.join(outputDir, `${prefix}.json`))
    ]);

    return {
      success: results.every(r => r.success),
      reports: {
        markdown: results[0],
        csv: results[1],
        json: results[2]
      }
    };
  }

  /**
   * Build Markdown content
   * @returns {string} Markdown content
   */
  buildMarkdown() {
    const lines = [];
    const r = this.results;

    // Title and metadata
    lines.push(`# ${this.title}`);
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Platform:** ${r.platform}`);
    if (r.dryRun) lines.push('**Mode:** Dry Run');
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');

    const statusIcon = r.success ? '✅' : '❌';
    lines.push(`**Overall Status:** ${statusIcon} ${r.success ? 'PASSED' : 'FAILED'}`);
    lines.push('');

    // Summary table
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Test Cases | ${r.testCases.total} |`);
    lines.push(`| Passed | ${r.testCases.passed} |`);
    lines.push(`| Failed | ${r.testCases.failed} |`);
    lines.push(`| Partial (Manual) | ${r.testCases.partial} |`);
    lines.push(`| Pass Rate | ${r.testCases.passRate}% |`);
    lines.push(`| Total Steps | ${r.steps.total} |`);
    lines.push(`| Duration | ${r.execution.durationFormatted} |`);
    lines.push('');

    // Execution Details
    if (r.execution) {
      lines.push('## Execution Details');
      lines.push('');
      lines.push(`- **Start Time:** ${r.execution.startTime}`);
      lines.push(`- **End Time:** ${r.execution.endTime}`);
      lines.push(`- **Duration:** ${r.execution.durationFormatted}`);
      lines.push('');
    }

    // Test Case Results
    lines.push('## Test Case Results');
    lines.push('');

    if (r.results && r.results.length > 0) {
      for (const testCase of r.results) {
        const icon = testCase.status === 'passed' ? '✅' :
                     testCase.status === 'failed' ? '❌' :
                     testCase.status === 'partial' ? '⚠️' : '⏭️';

        lines.push(`### ${icon} ${testCase.scenario || testCase.userStory || 'Test Case'}`);
        lines.push('');

        if (testCase.epic) lines.push(`**Epic:** ${testCase.epic}`);
        if (testCase.userStory) lines.push(`**User Story:** ${testCase.userStory}`);
        lines.push(`**Status:** ${testCase.status.toUpperCase()}`);
        lines.push(`**Duration:** ${testCase.duration}ms`);
        lines.push('');

        // Step results
        if (this.includeSteps && testCase.steps && testCase.steps.length > 0) {
          lines.push('**Steps:**');
          lines.push('');
          lines.push('| # | Step | Status | Duration |');
          lines.push('|---|------|--------|----------|');

          for (const step of testCase.steps) {
            const stepIcon = step.status === 'passed' ? '✓' :
                            step.status === 'failed' ? '✗' :
                            step.status === 'manual' ? '?' :
                            step.status === 'skipped' ? '○' : '→';

            const stepDesc = (step.raw || step.action || 'Unknown step')
              .substring(0, 50)
              .replace(/\|/g, '\\|');

            lines.push(`| ${step.stepNumber} | ${stepDesc} | ${stepIcon} ${step.status} | ${step.duration || 0}ms |`);
          }
          lines.push('');

          // Failed step details
          const failedSteps = testCase.steps.filter(s => s.status === 'failed');
          if (failedSteps.length > 0) {
            lines.push('**Failures:**');
            lines.push('');
            for (const step of failedSteps) {
              lines.push(`- **Step ${step.stepNumber}:** ${step.error || 'Unknown error'}`);
            }
            lines.push('');
          }
        }
      }
    } else {
      lines.push('No test cases executed.');
      lines.push('');
    }

    // Evidence Summary
    if (this.includeEvidence && r.evidence && r.evidence.length > 0) {
      lines.push('## Evidence');
      lines.push('');
      lines.push('| Step | Record ID | Timestamp |');
      lines.push('|------|-----------|-----------|');

      for (const evidence of r.evidence) {
        if (evidence.evidence?.recordId) {
          lines.push(`| ${evidence.stepNumber} | ${evidence.evidence.recordId} | ${evidence.evidence.timestamp || 'N/A'} |`);
        }
      }
      lines.push('');
    }

    // Created Records
    if (r.createdRecords && r.createdRecords.length > 0) {
      lines.push('## Created Records');
      lines.push('');
      lines.push('Records created during test execution:');
      lines.push('');
      lines.push('| Object | Record ID |');
      lines.push('|--------|-----------|');

      for (const record of r.createdRecords) {
        lines.push(`| ${record.objectType} | ${record.id} |`);
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Report generated by UAT Test Framework*');

    return lines.join('\n');
  }

  /**
   * Build CSV content
   * @returns {string} CSV content
   */
  buildCSV() {
    const rows = [];
    const r = this.results;

    // Header row
    const headers = [
      'Epic',
      'User Story',
      'Scenario',
      'Status',
      'Steps Total',
      'Steps Passed',
      'Steps Failed',
      'Steps Manual',
      'Duration (ms)',
      'Tester Comments'
    ];
    rows.push(headers.map(h => this.escapeCSV(h)).join(','));

    // Data rows
    if (r.results && r.results.length > 0) {
      for (const testCase of r.results) {
        const stepsTotal = testCase.steps?.length || 0;
        const stepsPassed = testCase.steps?.filter(s => s.status === 'passed').length || 0;
        const stepsFailed = testCase.steps?.filter(s => s.status === 'failed').length || 0;
        const stepsManual = testCase.steps?.filter(s => s.status === 'manual').length || 0;

        // Build comments from failed steps
        const comments = testCase.steps
          ?.filter(s => s.status === 'failed' && s.error)
          .map(s => `Step ${s.stepNumber}: ${s.error}`)
          .join('; ') || '';

        const row = [
          testCase.epic || '',
          testCase.userStory || '',
          testCase.scenario || '',
          testCase.status.toUpperCase(),
          stepsTotal,
          stepsPassed,
          stepsFailed,
          stepsManual,
          testCase.duration || 0,
          comments
        ];

        rows.push(row.map(v => this.escapeCSV(v)).join(','));
      }
    }

    return rows.join('\n');
  }

  /**
   * Build JSON content
   * @returns {Object} JSON object
   */
  buildJSON() {
    return {
      report: {
        title: this.title,
        generatedAt: new Date().toISOString(),
        generator: 'UAT Test Framework v1.0.0'
      },
      summary: {
        success: this.results.success,
        platform: this.results.platform,
        dryRun: this.results.dryRun,
        testCases: this.results.testCases,
        steps: this.results.steps
      },
      execution: this.results.execution,
      results: this.results.results.map(tc => ({
        epic: tc.epic,
        userStory: tc.userStory,
        scenario: tc.scenario,
        status: tc.status,
        duration: tc.duration,
        steps: this.includeSteps ? tc.steps : undefined,
        stepSummary: {
          total: tc.steps?.length || 0,
          passed: tc.steps?.filter(s => s.status === 'passed').length || 0,
          failed: tc.steps?.filter(s => s.status === 'failed').length || 0,
          manual: tc.steps?.filter(s => s.status === 'manual').length || 0
        }
      })),
      evidence: this.includeEvidence ? this.results.evidence : undefined,
      createdRecords: this.results.createdRecords
    };
  }

  /**
   * Escape CSV value
   * @param {*} value - Value to escape
   * @returns {string} Escaped value
   */
  escapeCSV(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const str = String(value);

    // If contains comma, newline, or quote, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  /**
   * Get summary text (for console output)
   * @returns {string} Summary text
   */
  getSummaryText() {
    const r = this.results;
    const lines = [];

    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                  UAT TEST EXECUTION SUMMARY                ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Platform:   ${r.platform}`);
    lines.push(`Status:     ${r.success ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`Duration:   ${r.execution?.durationFormatted || 'N/A'}`);
    lines.push('');
    lines.push('Test Cases:');
    lines.push(`  Total:    ${r.testCases.total}`);
    lines.push(`  Passed:   ${r.testCases.passed}`);
    lines.push(`  Failed:   ${r.testCases.failed}`);
    lines.push(`  Partial:  ${r.testCases.partial}`);
    lines.push(`  Pass Rate: ${r.testCases.passRate}%`);
    lines.push('');
    lines.push('Steps:');
    lines.push(`  Total:    ${r.steps.total}`);
    lines.push(`  Passed:   ${r.steps.passed}`);
    lines.push(`  Failed:   ${r.steps.failed}`);
    lines.push(`  Manual:   ${r.steps.manual}`);

    if (r.testCases.failed > 0) {
      lines.push('');
      lines.push('Failed Test Cases:');
      for (const tc of r.results.filter(t => t.status === 'failed')) {
        lines.push(`  ✗ ${tc.scenario || tc.userStory}`);
      }
    }

    return lines.join('\n');
  }
}

module.exports = {
  UATReportGenerator
};
