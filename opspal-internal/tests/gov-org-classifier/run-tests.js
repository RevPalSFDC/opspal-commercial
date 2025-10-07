#!/usr/bin/env node

/**
 * Government Organization Classifier Test Runner
 *
 * Runs comprehensive test suite for the gov-org-classifier system.
 * Tests normalizer, matcher, and full classification pipeline.
 *
 * @module run-tests
 */

const fs = require('fs');
const path = require('path');
const GovOrgNormalizer = require('../../scripts/lib/gov-org-normalizer');
const GovOrgBucketMatcher = require('../../scripts/lib/gov-org-bucket-matcher');

class GovOrgClassifierTester {
  constructor() {
    this.normalizer = new GovOrgNormalizer();
    this.matcher = new GovOrgBucketMatcher();

    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      failures: []
    };
  }

  /**
   * Load all test case files
   */
  loadTestCases() {
    const testDir = __dirname;
    const testFiles = fs.readdirSync(testDir).filter(f => f.startsWith('test-cases-') && f.endsWith('.json'));

    const allTests = [];

    for (const file of testFiles) {
      const filePath = path.join(testDir, file);
      const tests = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const category = file.replace('test-cases-', '').replace('.json', '');

      tests.forEach(test => {
        test.category = category;
        allTests.push(test);
      });
    }

    return allTests;
  }

  /**
   * Run a single test case
   */
  async runTest(testCase) {
    try {
      // Normalize input
      const normalized = this.normalizer.normalize(testCase.input);

      // Match to bucket
      const classification = this.matcher.match(normalized, testCase.input);

      // Check if bucket matches expected
      const bucketMatch = classification.bucket === testCase.expected.bucket;

      // Check if confidence meets threshold
      const confidencePass = classification.confidence >= testCase.expected.min_confidence;

      const passed = bucketMatch && confidencePass;

      return {
        passed,
        testCase,
        classification,
        normalized,
        bucketMatch,
        confidencePass
      };
    } catch (error) {
      return {
        passed: false,
        testCase,
        error: error.message
      };
    }
  }

  /**
   * Run all test cases
   */
  async runAllTests() {
    console.log('🧪 Running Government Organization Classifier Test Suite\n');

    const testCases = this.loadTestCases();
    this.stats.total = testCases.length;

    console.log(`   Found ${testCases.length} test cases\n`);

    // Group tests by category
    const testsByCategory = {};
    testCases.forEach(test => {
      if (!testsByCategory[test.category]) {
        testsByCategory[test.category] = [];
      }
      testsByCategory[test.category].push(test);
    });

    // Run tests by category
    for (const [category, tests] of Object.entries(testsByCategory)) {
      console.log(`\n📂 Category: ${category}`);
      console.log('─'.repeat(60));

      for (const test of tests) {
        const result = await this.runTest(test);

        if (result.passed) {
          this.stats.passed++;
          console.log(`   ✅ ${test.name}`);
          console.log(`      Bucket: ${result.classification.bucket} (${(result.classification.confidence * 100).toFixed(0)}%)`);
        } else {
          this.stats.failed++;
          this.stats.failures.push(result);

          console.log(`   ❌ ${test.name}`);

          if (result.error) {
            console.log(`      Error: ${result.error}`);
          } else {
            if (!result.bucketMatch) {
              console.log(`      Expected: ${test.expected.bucket}`);
              console.log(`      Got: ${result.classification.bucket}`);
            }
            if (!result.confidencePass) {
              console.log(`      Expected confidence: ≥${test.expected.min_confidence}`);
              console.log(`      Got: ${result.classification.confidence.toFixed(2)}`);
            }
            console.log(`      Rationale: ${result.classification.rationale}`);
          }
        }
      }
    }

    // Print summary
    this.printSummary();

    // Generate detailed report
    this.generateReport();
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests:     ${this.stats.total}`);
    console.log(`Passed:          ${this.stats.passed} (${Math.round((this.stats.passed / this.stats.total) * 100)}%)`);
    console.log(`Failed:          ${this.stats.failed} (${Math.round((this.stats.failed / this.stats.total) * 100)}%)`);
    console.log('='.repeat(60));

    if (this.stats.failed > 0) {
      console.log(`\n⚠️  ${this.stats.failed} test(s) failed. See test-report.json for details.`);
    } else {
      console.log('\n✅ All tests passed!');
    }
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      failures: this.stats.failures.map(f => ({
        name: f.testCase.name,
        category: f.testCase.category,
        input: f.testCase.input,
        expected: f.testCase.expected,
        actual: f.classification ? {
          bucket: f.classification.bucket,
          confidence: f.classification.confidence,
          rationale: f.classification.rationale
        } : null,
        error: f.error || null
      }))
    };

    const reportPath = path.join(__dirname, 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n📄 Detailed report saved to: ${reportPath}\n`);
  }
}

// CLI interface
if (require.main === module) {
  const tester = new GovOrgClassifierTester();

  tester.runAllTests()
    .then(() => {
      process.exit(tester.stats.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Test runner failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

module.exports = GovOrgClassifierTester;
