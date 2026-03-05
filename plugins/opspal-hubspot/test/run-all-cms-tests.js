#!/usr/bin/env node

/**
 * Test Runner for HubSpot CMS Pages API
 *
 * Runs all test suites:
 * - Unit tests for HubSpot CMS Pages Manager
 * - Unit tests for HubSpot CMS Publishing Controller
 * - Integration tests for end-to-end workflows
 *
 * Usage:
 *   node test/run-all-cms-tests.js
 *   node test/run-all-cms-tests.js --unit
 *   node test/run-all-cms-tests.js --integration
 *   node test/run-all-cms-tests.js --verbose
 *
 * @version 1.0.0
 * @created 2025-11-04
 */

const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const runUnitOnly = args.includes('--unit');
const runIntegrationOnly = args.includes('--integration');
const verbose = args.includes('--verbose');

// Test suite modules
const pagesManagerTests = require('./hubspot-cms-pages-manager.manual');
const publishingControllerTests = require('./hubspot-cms-publishing-controller.manual');
const integrationTests = require('./cms-integration.manual');

// Suppress console output unless verbose
const originalLog = console.log;
const originalError = console.error;

function suppressOutput() {
    if (!verbose) {
        console.log = () => {};
        console.error = () => {};
    }
}

function restoreOutput() {
    console.log = originalLog;
    console.error = originalError;
}

// Run test suite with result tracking
async function runTestSuite(name, testModule) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Running: ${name}`);
    console.log('═'.repeat(60));

    let passed = false;
    let error = null;

    try {
        suppressOutput();
        await testModule.runAllTests();
        passed = true;
    } catch (err) {
        error = err;
        passed = false;
    } finally {
        restoreOutput();
    }

    return { name, passed, error };
}

// Main test runner
async function runAllTests() {
    const startTime = Date.now();

    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   HubSpot CMS Pages API - Complete Test Suite            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    const results = [];

    // Run unit tests
    if (!runIntegrationOnly) {
        console.log('📦 Unit Tests');
        console.log('─'.repeat(60));

        const pagesManagerResult = await runTestSuite(
            'HubSpot CMS Pages Manager',
            pagesManagerTests
        );
        results.push(pagesManagerResult);

        const publishingControllerResult = await runTestSuite(
            'HubSpot CMS Publishing Controller',
            publishingControllerTests
        );
        results.push(publishingControllerResult);
    }

    // Run integration tests
    if (!runUnitOnly) {
        console.log('\n🔗 Integration Tests');
        console.log('─'.repeat(60));

        const integrationResult = await runTestSuite(
            'CMS Pages API Integration',
            integrationTests
        );
        results.push(integrationResult);
    }

    // Calculate summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    const totalSuites = results.length;
    const passedSuites = results.filter(r => r.passed).length;
    const failedSuites = results.filter(r => !r.passed).length;

    // Display summary
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║   Test Summary                                            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    // Suite results
    results.forEach(result => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status}  ${result.name}`);
        if (!result.passed && result.error) {
            console.log(`       Error: ${result.error.message}`);
        }
    });

    console.log('');
    console.log('─'.repeat(60));
    console.log(`Total Suites:  ${totalSuites}`);
    console.log(`Passed:        ${passedSuites} ✅`);
    console.log(`Failed:        ${failedSuites} ❌`);
    console.log(`Duration:      ${duration}s`);
    console.log(`Success Rate:  ${((passedSuites / totalSuites) * 100).toFixed(1)}%`);
    console.log('─'.repeat(60));
    console.log('');

    // Exit with appropriate code
    if (failedSuites > 0) {
        console.log('❌ Some tests failed. See details above.');
        process.exit(1);
    } else {
        console.log('✅ All tests passed!');
        process.exit(0);
    }
}

// Display help
function displayHelp() {
    console.log('');
    console.log('HubSpot CMS Pages API Test Runner');
    console.log('═'.repeat(60));
    console.log('');
    console.log('Usage:');
    console.log('  node test/run-all-cms-tests.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --unit          Run unit tests only');
    console.log('  --integration   Run integration tests only');
    console.log('  --verbose       Show detailed test output');
    console.log('  --help          Display this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node test/run-all-cms-tests.js');
    console.log('  node test/run-all-cms-tests.js --unit --verbose');
    console.log('  node test/run-all-cms-tests.js --integration');
    console.log('');
}

// Handle help flag
if (args.includes('--help') || args.includes('-h')) {
    displayHelp();
    process.exit(0);
}

// Run tests
runAllTests().catch(err => {
    restoreOutput();
    console.error('\n❌ Fatal error running tests:');
    console.error(err);
    process.exit(1);
});
