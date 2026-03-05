#!/usr/bin/env node

/**
 * Quality Gate Validator - Test Suite
 *
 * Tests for quality-gate-validator.js
 *
 * Usage:
 *   node tests/quality-gate-validator.test.js
 *
 * @version 1.0.0
 * @created 2025-10-24
 */

const fs = require('fs');
const path = require('path');
const QualityGateValidator = require('../scripts/lib/quality-gate-validator');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ ${message}`);
        testsPassed++;
    } else {
        console.error(`❌ ${message}`);
        testsFailed++;
    }
}

async function runTests() {
    console.log('=== Quality Gate Validator Test Suite ===\n');

    // Test 1: Validator initialization
    console.log('Test 1: Validator Initialization');
    const validator = new QualityGateValidator({ verbose: false });
    assert(validator !== null, 'Validator should initialize');
    assert(validator.rules !== null, 'Rules should be loaded');
    console.log('');

    // Test 2: Report generation - file exists
    console.log('Test 2: Report Generation - File Exists Check');
    const testFile = '/tmp/test-report-qg.md';
    fs.writeFileSync(testFile, '# Test Report\n\n## Summary\nTest\n\n## Findings\nTest\n\n## Recommendations\nTest');

    const result1 = await validator.validate(
        { type: 'report_generation' },
        { filePath: testFile, status: 'success' }
    );

    assert(result1.passed === true, 'Report with file should pass');
    assert(result1.checks.length > 0, 'Should have run checks');
    fs.unlinkSync(testFile); // Cleanup
    console.log('');

    // Test 3: Report generation - missing file
    console.log('Test 3: Report Generation - Missing File');
    const result2 = await validator.validate(
        { type: 'report_generation' },
        { filePath: '/nonexistent/file.md', status: 'success' }
    );

    assert(result2.passed === false, 'Report with missing file should fail');
    assert(result2.criticalFailures.length > 0, 'Should have critical failures');
    console.log('');

    // Test 4: Deployment - success validation
    console.log('Test 4: Deployment - Success Validation');
    const result3 = await validator.validate(
        { type: 'deployment' },
        {
            status: 'success',
            deploymentStatus: 'Succeeded',
            verified: true,
            testResults: { passed: 10, failed: 0 }
        }
    );

    assert(result3.passed === true, 'Successful deployment should pass');
    assert(result3.failedChecks.length === 0, 'Should have no failed checks');
    console.log('');

    // Test 5: Deployment - no verification
    console.log('Test 5: Deployment - No Verification');
    const result4 = await validator.validate(
        { type: 'deployment' },
        {
            status: 'success',
            deploymentStatus: 'Succeeded',
            verified: false
        }
    );

    assert(result4.passed === false, 'Deployment without verification should fail');
    assert(result4.failedChecks.length > 0, 'Should have failed checks');
    assert(result4.recommendations.length > 0, 'Should provide recommendations');
    console.log('');

    // Test 6: Data operation - record count match
    console.log('Test 6: Data Operation - Record Count Match');
    const result5 = await validator.validate(
        { type: 'data_operation' },
        {
            status: 'completed',
            recordsExpected: 100,
            recordsProcessed: 100,
            errorCount: 0
        }
    );

    assert(result5.passed === true, 'Data operation with matching counts should pass');
    console.log('');

    // Test 7: Data operation - record count mismatch
    console.log('Test 7: Data Operation - Record Count Mismatch');
    const result6 = await validator.validate(
        { type: 'data_operation' },
        {
            status: 'completed',
            recordsExpected: 100,
            recordsProcessed: 95,
            errorCount: 5
        }
    );

    assert(result6.passed === false, 'Data operation with mismatched counts should fail');
    console.log('');

    // Test 8: Configuration - applied and verified
    console.log('Test 8: Configuration - Applied and Verified');
    const result7 = await validator.validate(
        { type: 'configuration' },
        {
            applied: true,
            verified: true,
            configurationSet: true
        }
    );

    assert(result7.passed === true, 'Verified configuration should pass');
    console.log('');

    // Test 9: Unknown task type
    console.log('Test 9: Unknown Task Type');
    const result8 = await validator.validate(
        { type: 'unknown_type' },
        { status: 'success' }
    );

    assert(result8.passed === true, 'Unknown task type should pass (no rules)');
    console.log('');

    // Test 10: Statistics tracking
    console.log('Test 10: Statistics Tracking');
    const stats = validator.getStats();
    assert(stats.totalValidations > 0, 'Should track total validations');
    assert(stats.successRate !== 'N/A', 'Should calculate success rate');
    console.log(`Statistics: ${JSON.stringify(stats, null, 2)}`);
    console.log('');

    // Test 11: No placeholders validator
    console.log('Test 11: No Placeholders Check');
    const testFileWithPlaceholders = '/tmp/test-with-placeholders.md';
    fs.writeFileSync(testFileWithPlaceholders, '# Test Report\n\n[TODO] Complete this section\n\n## Summary\nTest');

    const result9 = await validator.validate(
        { type: 'report_generation' },
        { filePath: testFileWithPlaceholders, status: 'success' }
    );

    assert(result9.passed === false, 'Report with placeholders should fail');
    assert(result9.failedChecks.some(check => check.name === 'data_completeness'), 'Should detect placeholder check failure');
    fs.unlinkSync(testFileWithPlaceholders); // Cleanup
    console.log('');

    // Test 12: Required sections validator
    console.log('Test 12: Required Sections Check');
    const testFileWithoutSections = '/tmp/test-without-sections.md';
    fs.writeFileSync(testFileWithoutSections, '# Test Report\n\nSome content without required sections.');

    const result10 = await validator.validate(
        { type: 'report_generation' },
        { filePath: testFileWithoutSections, status: 'success' }
    );

    assert(result10.passed === false, 'Report without required sections should fail');
    assert(result10.failedChecks.some(check => check.name === 'minimum_sections'), 'Should detect missing sections');
    fs.unlinkSync(testFileWithoutSections); // Cleanup
    console.log('');

    // Summary
    console.log('=== Test Summary ===');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`Total: ${testsPassed + testsFailed}`);

    return testsFailed === 0;
}

// Run tests
runTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
});
