/**
 * Test Suite for Agent Deliverable Validator
 *
 * Tests:
 * 1. Missing required file detection
 * 2. Empty file detection
 * 3. JSON format validation
 * 4. CSV format validation
 * 5. Placeholder content detection
 * 6. Generic content detection
 * 7. Success criteria validation
 * 8. Valid deliverables passing
 *
 * @version 1.0.0
 * @created 2025-10-26
 */

const AgentDeliverableValidator = require('../scripts/lib/agent-deliverable-validator');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create temporary test directory
const TEST_DIR = path.join(os.tmpdir(), 'agent-deliverable-validator-test');

function setupTestDir() {
    if (!fs.existsSync(TEST_DIR)) {
        fs.mkdirSync(TEST_DIR, { recursive: true });
    }
}

function cleanupTestDir() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

// Test 1: Missing required file
async function testMissingRequiredFile() {
    console.log('\n🧪 Test 1: Missing Required File');

    setupTestDir();

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate report',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'nonexistent.json', format: 'json', required: true }
        ],
        successCriteria: []
    });

    const missingError = result.errors.find(e => e.type === 'MISSING_FILE');

    cleanupTestDir();

    if (missingError && !result.valid) {
        console.log('✅ PASS: Missing file error detected');
        console.log(`   Message: ${missingError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Missing file error not detected');
        return false;
    }
}

// Test 2: Empty file detection
async function testEmptyFile() {
    console.log('\n🧪 Test 2: Empty File Detection');

    setupTestDir();

    // Create empty file
    const emptyFile = path.join(TEST_DIR, 'empty.json');
    fs.writeFileSync(emptyFile, '');

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate report',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'empty.json', format: 'json', required: true }
        ],
        successCriteria: []
    });

    const emptyError = result.errors.find(e => e.type === 'EMPTY_FILE');

    cleanupTestDir();

    if (emptyError && !result.valid) {
        console.log('✅ PASS: Empty file detected');
        console.log(`   Message: ${emptyError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Empty file not detected');
        return false;
    }
}

// Test 3: Invalid JSON format
async function testInvalidJSON() {
    console.log('\n🧪 Test 3: Invalid JSON Format');

    setupTestDir();

    // Create invalid JSON file
    const invalidJSON = path.join(TEST_DIR, 'invalid.json');
    fs.writeFileSync(invalidJSON, '{ "key": "value" invalid }');

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate JSON report',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'invalid.json', format: 'json', required: true }
        ],
        successCriteria: []
    });

    const formatError = result.errors.find(e => e.type === 'FORMAT_ERROR');

    cleanupTestDir();

    if (formatError && !result.valid) {
        console.log('✅ PASS: Invalid JSON detected');
        console.log(`   Message: ${formatError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Invalid JSON not detected');
        return false;
    }
}

// Test 4: CSV validation (header-only)
async function testCSVHeaderOnly() {
    console.log('\n🧪 Test 4: CSV Header Only (Warning)');

    setupTestDir();

    // Create CSV with only headers
    const csvFile = path.join(TEST_DIR, 'data.csv');
    fs.writeFileSync(csvFile, 'Name,Email,Status\n');

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate CSV export',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'data.csv', format: 'csv', required: true }
        ],
        successCriteria: []
    });

    const headerWarning = result.warnings.find(w => w.type === 'CSV_HEADER_ONLY');

    cleanupTestDir();

    if (headerWarning) {
        console.log('✅ PASS: CSV header-only warning detected');
        console.log(`   Message: ${headerWarning.message}`);
        return true;
    } else {
        console.log('❌ FAIL: CSV header-only warning not detected');
        return false;
    }
}

// Test 5: Placeholder content detection
async function testPlaceholderContent() {
    console.log('\n🧪 Test 5: Placeholder Content Detection');

    setupTestDir();

    // Create file with placeholder content
    const placeholderFile = path.join(TEST_DIR, 'report.md');
    fs.writeFileSync(placeholderFile, `
# Report

## Summary
TODO: Add summary here

## Analysis
PLACEHOLDER content for analysis section

## Recommendations
FIXME: Complete this section
    `.trim());

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate report',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'report.md', format: 'markdown', required: true }
        ],
        successCriteria: []
    });

    const placeholderError = result.errors.find(e => e.type === 'PLACEHOLDER_CONTENT');

    cleanupTestDir();

    if (placeholderError && !result.valid) {
        console.log('✅ PASS: Placeholder content detected');
        console.log(`   Message: ${placeholderError.message}`);
        console.log(`   Count: ${placeholderError.count}`);
        return true;
    } else {
        console.log('❌ FAIL: Placeholder content not detected');
        return false;
    }
}

// Test 6: Generic content detection
async function testGenericContent() {
    console.log('\n🧪 Test 6: Generic Content Detection');

    setupTestDir();

    // Create file with generic content
    const genericFile = path.join(TEST_DIR, 'contacts.csv');
    fs.writeFileSync(genericFile, `
Name,Email,Status
John Doe,test@example.com,Active
Jane Doe,jane@example.com,Active
Foo Bar,foo@example.com,Inactive
John Doe,johndoe@example.com,Active
Sample Data,sample@example.com,Active
    `.trim());

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Export contacts',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'contacts.csv', format: 'csv', required: true }
        ],
        successCriteria: []
    });

    const genericWarning = result.warnings.find(w => w.type === 'GENERIC_CONTENT');

    cleanupTestDir();

    if (genericWarning) {
        console.log('✅ PASS: Generic content detected');
        console.log(`   Message: ${genericWarning.message}`);
        console.log(`   Examples: ${genericWarning.examples.join(', ')}`);
        return true;
    } else {
        console.log('❌ FAIL: Generic content not detected');
        return false;
    }
}

// Test 7: Success criteria file existence
async function testSuccessCriteriaFile() {
    console.log('\n🧪 Test 7: Success Criteria File Existence');

    setupTestDir();

    // Create one file but not the other
    const file1 = path.join(TEST_DIR, 'report.json');
    fs.writeFileSync(file1, '{"status": "complete"}');

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate reports',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'report.json', format: 'json', required: true }
        ],
        successCriteria: [
            'report.json created',
            'summary.pdf created'  // This file doesn't exist
        ]
    });

    const criterionError = result.errors.find(e =>
        e.type === 'CRITERION_NOT_MET' && e.criterion.includes('summary.pdf')
    );

    cleanupTestDir();

    if (criterionError && !result.valid) {
        console.log('✅ PASS: Missing file criterion detected');
        console.log(`   Message: ${criterionError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Missing file criterion not detected');
        return false;
    }
}

// Test 8: Valid deliverables pass
async function testValidDeliverables() {
    console.log('\n🧪 Test 8: Valid Deliverables Pass');

    setupTestDir();

    // Create valid files
    const jsonFile = path.join(TEST_DIR, 'report.json');
    fs.writeFileSync(jsonFile, JSON.stringify({
        title: 'Assessment Report',
        findings: [
            { category: 'Data Quality', score: 85 },
            { category: 'Process Efficiency', score: 92 }
        ],
        recommendations: [
            'Implement automated validation',
            'Review duplicate detection rules'
        ]
    }, null, 2));

    const mdFile = path.join(TEST_DIR, 'summary.md');
    fs.writeFileSync(mdFile, `
# Assessment Summary

## Overview
This assessment analyzed data quality and process efficiency for the customer database.

## Key Findings
- Data quality score: 85/100
- Process efficiency score: 92/100

## Recommendations
1. Implement automated validation
2. Review duplicate detection rules
    `.trim());

    const csvFile = path.join(TEST_DIR, 'data.csv');
    fs.writeFileSync(csvFile, `
Category,Score,Status
Data Quality,85,Good
Process Efficiency,92,Excellent
User Adoption,78,Good
    `.trim());

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate assessment report with JSON, Markdown, and CSV',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'report.json', format: 'json', required: true },
            { path: 'summary.md', format: 'markdown', required: true },
            { path: 'data.csv', format: 'csv', required: true }
        ],
        successCriteria: [
            'report.json created',
            'summary.md created',
            'data.csv created'
        ]
    });

    cleanupTestDir();

    if (result.valid && result.errors.length === 0) {
        console.log('✅ PASS: Valid deliverables passed validation');
        console.log(`   Deliverables: ${result.metadata.deliverablesValid}/${result.metadata.deliverablesChecked}`);
        console.log(`   Criteria: ${result.metadata.criteriaMet}/${result.metadata.criteriaChecked}`);
        return true;
    } else {
        console.log('❌ FAIL: Valid deliverables incorrectly flagged as invalid');
        console.log(`   Errors: ${result.errors.length}`);
        if (result.errors.length > 0) {
            result.errors.forEach(err => console.log(`     - ${err.message}`));
        }
        return false;
    }
}

// Test 9: Optional missing file (warning only)
async function testOptionalMissingFile() {
    console.log('\n🧪 Test 9: Optional Missing File (Warning Only)');

    setupTestDir();

    // Create only required file
    const requiredFile = path.join(TEST_DIR, 'report.json');
    fs.writeFileSync(requiredFile, '{"status": "complete"}');

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate report',
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'report.json', format: 'json', required: true },
            { path: 'optional.pdf', format: 'pdf', required: false }
        ],
        successCriteria: []
    });

    const optionalWarning = result.warnings.find(w =>
        w.message.includes('[OPTIONAL]') && w.message.includes('optional.pdf')
    );

    cleanupTestDir();

    if (optionalWarning && result.errors.length === 0) {
        console.log('✅ PASS: Optional file generates warning, not error');
        console.log(`   Message: ${optionalWarning.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Optional file handling incorrect');
        console.log(`   Errors: ${result.errors.length}`);
        console.log(`   Warnings: ${result.warnings.length}`);
        return false;
    }
}

// Test 10: Cross-check with task description
async function testCrossCheckTask() {
    console.log('\n🧪 Test 10: Cross-Check with Task Description');

    setupTestDir();

    // Create JSON file but task mentions PDF
    const jsonFile = path.join(TEST_DIR, 'report.json');
    fs.writeFileSync(jsonFile, '{"status": "complete"}');

    const validator = new AgentDeliverableValidator();
    const result = await validator.validate({
        taskDescription: 'Generate PDF report with summary',  // Mentions PDF
        workingDirectory: TEST_DIR,
        deliverables: [
            { path: 'report.json', format: 'json', required: true }  // Only JSON provided
        ],
        successCriteria: []
    });

    const missingFormatWarning = result.warnings.find(w =>
        w.type === 'MISSING_EXPECTED_FORMAT' && w.format === 'pdf'
    );

    cleanupTestDir();

    if (missingFormatWarning) {
        console.log('✅ PASS: Task mentions PDF but no PDF deliverable - warning issued');
        console.log(`   Message: ${missingFormatWarning.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Missing format cross-check not detected');
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  Agent Deliverable Validator - Test Suite               ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const tests = [
        testMissingRequiredFile,
        testEmptyFile,
        testInvalidJSON,
        testCSVHeaderOnly,
        testPlaceholderContent,
        testGenericContent,
        testSuccessCriteriaFile,
        testValidDeliverables,
        testOptionalMissingFile,
        testCrossCheckTask
    ];

    const results = [];

    for (const test of tests) {
        try {
            const passed = await test();
            results.push(passed);
        } catch (error) {
            console.log(`❌ FAIL: ${error.message}`);
            console.error(error.stack);
            results.push(false);
            // Test runner: Continue running remaining tests after failure
        }
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                            ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log(`\n  Passed: ${passed}/${total}`);
    console.log(`  Failed: ${total - passed}/${total}`);

    if (passed === total) {
        console.log('\n  ✅ All tests passed!\n');
        process.exit(0);
    } else {
        console.log('\n  ❌ Some tests failed\n');
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runAllTests();
}

// Jest wrapper - allows this to be run both standalone and via Jest
describe('AgentDeliverableValidator', () => {
    it('should pass all validation tests', async () => {
        // Capture console output
        const originalLog = console.log;
        const logs = [];
        console.log = (...args) => logs.push(args.join(' '));

        try {
            // Run all custom tests
            const tests = [
                testMissingRequiredFile,
                testEmptyFile,
                testInvalidJSON,
                testCSVHeaderOnly,
                testPlaceholderContent,
                testGenericContent,
                testSuccessCriteriaFile,
                testValidDeliverables,
                testOptionalMissingFile,
                testCrossCheckTask
            ];

            const results = [];
            for (const test of tests) {
                try {
                    const passed = await test();
                    results.push(passed);
                } catch (error) {
                    results.push(false);
                }
            }

            // Cleanup temp directory
            if (require('fs').existsSync(TEST_DIR)) {
                require('fs').rmSync(TEST_DIR, { recursive: true, force: true });
            }

            const passed = results.filter(r => r).length;
            const total = results.length;

            expect(passed).toBe(total);
        } finally {
            console.log = originalLog;
        }
    });
});

module.exports = { runAllTests };
