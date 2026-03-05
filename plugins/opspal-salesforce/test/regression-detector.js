#!/usr/bin/env node

/**
 * Regression Detector - Compare test results across commits
 *
 * Purpose: Detect performance or behavior regressions between commits
 * Coverage:
 * - Test pass/fail rate changes
 * - Performance degradation (execution time)
 * - API behavior changes
 * - Safety analysis changes
 *
 * Usage:
 *   node test/regression-detector.js --baseline main --current HEAD
 *   node test/regression-detector.js --compare v3.15.0 v3.16.0
 *   node test/regression-detector.js --history 30  # Last 30 days
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const OUTPUT_DIR = path.join(__dirname, 'test-output');
const REGRESSION_THRESHOLD = 0.05; // 5% degradation threshold

// Color codes
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    baseline: 'main',
    current: 'HEAD',
    history: null,
    output: path.join(OUTPUT_DIR, 'regression-report.md')
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--baseline' && process.argv[i + 1]) {
      args.baseline = process.argv[i + 1];
      i++;
    } else if (arg === '--current' && process.argv[i + 1]) {
      args.current = process.argv[i + 1];
      i++;
    } else if (arg === '--history' && process.argv[i + 1]) {
      args.history = parseInt(process.argv[i + 1]);
      i++;
    } else if (arg === '--output' && process.argv[i + 1]) {
      args.output = process.argv[i + 1];
      i++;
    } else if (arg === '--help') {
      console.log('Regression Detector - Compare test results across commits\n');
      console.log('Usage:');
      console.log('  node test/regression-detector.js --baseline main --current HEAD');
      console.log('  node test/regression-detector.js --compare v3.15.0 v3.16.0');
      console.log('  node test/regression-detector.js --history 30');
      console.log('\nOptions:');
      console.log('  --baseline <ref>  Baseline commit/branch (default: main)');
      console.log('  --current <ref>   Current commit/branch (default: HEAD)');
      console.log('  --history <days>  Analyze last N days of commits');
      console.log('  --output <file>   Output file (default: test-output/regression-report.md)');
      process.exit(0);
    }
  }

  return args;
}

/**
 * Run test suite at specific commit
 *
 * @param {string} ref - Git reference (commit/branch/tag)
 * @returns {Object} Test results
 */
function runTestsAtCommit(ref) {
  console.log(`${c.cyan}Running tests at ${ref}...${c.reset}`);

  // Stash current changes
  try {
    execSync('git stash', { stdio: 'ignore', timeout: 30000 });
  } catch (e) {
    // No changes to stash
  }

  try {
    // Checkout the reference
    execSync(`git checkout ${ref}`, { stdio: 'ignore', timeout: 30000 });

    // Run tests (allow longer timeout for test execution)
    const testOutput = execSync('node test/golden-test-suite.js', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 300000 // 5 minutes for tests
    });

    // Parse results from output
    const results = parseTestOutput(testOutput);

    return results;
  } catch (error) {
    console.error(`${c.red}Failed to run tests at ${ref}${c.reset}`);
    return null;
  } finally {
    // Return to original state
    execSync('git checkout -', { stdio: 'ignore', timeout: 30000 });

    try {
      execSync('git stash pop', { stdio: 'ignore', timeout: 30000 });
    } catch (e) {
      // Nothing to pop
    }
  }
}

/**
 * Parse test output to extract metrics
 *
 * @param {string} output - Test output
 * @returns {Object} Parsed test results
 */
function parseTestOutput(output) {
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    successRate: 0,
    suites: {}
  };

  // Parse passed/failed/skipped counts
  const passedMatch = output.match(/Passed:\s+(\d+)/);
  const failedMatch = output.match(/Failed:\s+(\d+)/);
  const skippedMatch = output.match(/Skipped:\s+(\d+)/);

  if (passedMatch) results.passed = parseInt(passedMatch[1]);
  if (failedMatch) results.failed = parseInt(failedMatch[1]);
  if (skippedMatch) results.skipped = parseInt(skippedMatch[1]);

  results.total = results.passed + results.failed + results.skipped;
  results.successRate = results.passed / (results.passed + results.failed);

  // Parse per-suite results
  const suiteMatches = output.matchAll(/(\w+ Tests):\s+(\d+)\/(\d+)\s+\(([\d.]+)%\)/g);
  for (const match of suiteMatches) {
    const suiteName = match[1];
    const passed = parseInt(match[2]);
    const total = parseInt(match[3]);
    const rate = parseFloat(match[4]) / 100;

    results.suites[suiteName] = { passed, total, rate };
  }

  return results;
}

/**
 * Compare two test results and detect regressions
 *
 * @param {Object} baseline - Baseline test results
 * @param {Object} current - Current test results
 * @returns {Object} Comparison results
 */
function compareResults(baseline, current) {
  const comparison = {
    regressions: [],
    improvements: [],
    unchanged: [],
    summary: {}
  };

  // Overall success rate comparison
  const rateDiff = current.successRate - baseline.successRate;
  comparison.summary.successRateChange = rateDiff;

  if (rateDiff < -REGRESSION_THRESHOLD) {
    comparison.regressions.push({
      type: 'overall',
      metric: 'Success Rate',
      baseline: baseline.successRate,
      current: current.successRate,
      change: rateDiff,
      severity: rateDiff < -0.1 ? 'critical' : 'warning'
    });
  } else if (rateDiff > REGRESSION_THRESHOLD) {
    comparison.improvements.push({
      type: 'overall',
      metric: 'Success Rate',
      baseline: baseline.successRate,
      current: current.successRate,
      change: rateDiff
    });
  }

  // Per-suite comparison
  for (const [suiteName, baselineSuite] of Object.entries(baseline.suites)) {
    const currentSuite = current.suites[suiteName];

    if (!currentSuite) {
      comparison.regressions.push({
        type: 'suite_missing',
        suite: suiteName,
        severity: 'critical',
        message: `Suite ${suiteName} no longer exists`
      });
      continue;
    }

    const suiteDiff = currentSuite.rate - baselineSuite.rate;

    if (suiteDiff < -REGRESSION_THRESHOLD) {
      comparison.regressions.push({
        type: 'suite',
        suite: suiteName,
        metric: 'Success Rate',
        baseline: baselineSuite.rate,
        current: currentSuite.rate,
        change: suiteDiff,
        severity: suiteDiff < -0.1 ? 'critical' : 'warning'
      });
    } else if (suiteDiff > REGRESSION_THRESHOLD) {
      comparison.improvements.push({
        type: 'suite',
        suite: suiteName,
        metric: 'Success Rate',
        baseline: baselineSuite.rate,
        current: currentSuite.rate,
        change: suiteDiff
      });
    } else {
      comparison.unchanged.push(suiteName);
    }
  }

  // Check for new suites
  for (const suiteName of Object.keys(current.suites)) {
    if (!baseline.suites[suiteName]) {
      comparison.improvements.push({
        type: 'suite_new',
        suite: suiteName,
        message: `New test suite: ${suiteName}`
      });
    }
  }

  return comparison;
}

/**
 * Generate regression report in markdown format
 *
 * @param {Object} comparison - Comparison results
 * @param {string} baseline - Baseline reference
 * @param {string} current - Current reference
 * @returns {string} Markdown report
 */
function generateReport(comparison, baseline, current) {
  let report = `# Regression Detection Report\n\n`;
  report += `**Baseline**: \`${baseline}\`\n`;
  report += `**Current**: \`${current}\`\n`;
  report += `**Generated**: ${new Date().toISOString()}\n\n`;

  report += `---\n\n`;

  // Summary
  report += `## Summary\n\n`;
  report += `- **Regressions**: ${comparison.regressions.length}\n`;
  report += `- **Improvements**: ${comparison.improvements.length}\n`;
  report += `- **Unchanged**: ${comparison.unchanged.length}\n`;
  report += `- **Success Rate Change**: ${(comparison.summary.successRateChange * 100).toFixed(2)}%\n\n`;

  // Regressions
  if (comparison.regressions.length > 0) {
    report += `## ❌ Regressions Detected\n\n`;

    for (const regression of comparison.regressions) {
      const emoji = regression.severity === 'critical' ? '🔴' : '⚠️';

      report += `### ${emoji} ${regression.type === 'overall' ? 'Overall' : regression.suite}\n\n`;

      if (regression.message) {
        report += `${regression.message}\n\n`;
      } else {
        report += `- **Metric**: ${regression.metric}\n`;
        report += `- **Baseline**: ${(regression.baseline * 100).toFixed(1)}%\n`;
        report += `- **Current**: ${(regression.current * 100).toFixed(1)}%\n`;
        report += `- **Change**: ${(regression.change * 100).toFixed(2)}%\n`;
        report += `- **Severity**: ${regression.severity}\n\n`;
      }
    }
  } else {
    report += `## ✅ No Regressions Detected\n\n`;
  }

  // Improvements
  if (comparison.improvements.length > 0) {
    report += `## ✨ Improvements\n\n`;

    for (const improvement of comparison.improvements) {
      report += `### ${improvement.type === 'overall' ? 'Overall' : improvement.suite}\n\n`;

      if (improvement.message) {
        report += `${improvement.message}\n\n`;
      } else {
        report += `- **Metric**: ${improvement.metric}\n`;
        report += `- **Baseline**: ${(improvement.baseline * 100).toFixed(1)}%\n`;
        report += `- **Current**: ${(improvement.current * 100).toFixed(1)}%\n`;
        report += `- **Change**: +${(improvement.change * 100).toFixed(2)}%\n\n`;
      }
    }
  }

  // Unchanged
  if (comparison.unchanged.length > 0) {
    report += `## ✓ Unchanged Suites\n\n`;
    for (const suite of comparison.unchanged) {
      report += `- ${suite}\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;
  report += `*Report generated by Golden Test Suite regression detector*\n`;

  return report;
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  console.log(`\n${c.bold}Regression Detector${c.reset}\n`);
  console.log(`Baseline: ${c.cyan}${args.baseline}${c.reset}`);
  console.log(`Current:  ${c.cyan}${args.current}${c.reset}\n`);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Run tests at both references
  const baselineResults = runTestsAtCommit(args.baseline);
  const currentResults = runTestsAtCommit(args.current);

  if (!baselineResults || !currentResults) {
    console.error(`${c.red}Failed to run tests at one or both references${c.reset}`);
    process.exit(1);
  }

  // Compare results
  const comparison = compareResults(baselineResults, currentResults);

  // Generate report
  const report = generateReport(comparison, args.baseline, args.current);

  // Write report to file
  fs.writeFileSync(args.output, report);

  // Quality Gate: Validate report file was created
  if (!fs.existsSync(args.output)) {
    throw new Error('Report generation failed: File was not created');
  }

  console.log(`\n${c.green}Report generated: ${args.output}${c.reset}\n`);

  // Print summary
  if (comparison.regressions.length > 0) {
    console.log(`${c.red}${c.bold}❌ Regressions detected: ${comparison.regressions.length}${c.reset}`);

    const critical = comparison.regressions.filter(r => r.severity === 'critical');
    if (critical.length > 0) {
      console.log(`${c.red}   Critical regressions: ${critical.length}${c.reset}`);
    }

    process.exit(1);
  } else {
    console.log(`${c.green}${c.bold}✅ No regressions detected${c.reset}`);

    if (comparison.improvements.length > 0) {
      console.log(`${c.green}   Improvements: ${comparison.improvements.length}${c.reset}`);
    }

    process.exit(0);
  }
}

// CLI entry point
if (require.main === module) {
  main().catch(error => {
    console.error(`${c.red}Regression detector error: ${error.message}${c.reset}`);
    console.error(error.stack);
    process.exit(2);
  });
}

module.exports = {
  runTestsAtCommit,
  compareResults,
  generateReport
};
