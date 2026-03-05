/**
 * Test Suite for User Expectation Tracker
 *
 * Tests:
 * 1. Record correction
 * 2. Set/get preferences
 * 3. Add validation rule
 * 4. Validate date format
 * 5. Validate naming convention
 * 6. Validate required fields
 * 7. Cross-session persistence
 * 8. Correction summary
 *
 * @version 1.0.0
 * @created 2025-10-26
 */

const UserExpectationTracker = require('../scripts/lib/user-expectation-tracker');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create temporary database for testing
const TEST_DB = path.join(os.tmpdir(), 'user-expectation-tracker-test.db');

function cleanupTestDB() {
    if (fs.existsSync(TEST_DB)) {
        fs.unlinkSync(TEST_DB);
    }
}

// Test 1: Record correction
async function testRecordCorrection() {
    console.log('\n🧪 Test 1: Record Correction');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    const correctionId = await tracker.recordCorrection(
        'cpq-assessment',
        'date-format',
        'Used MM/DD/YYYY format',
        'Expected YYYY-MM-DD format',
        { severity: 'high', pattern: '\\d{2}/\\d{2}/\\d{4}' }
    );

    await tracker.close();
    cleanupTestDB();

    if (correctionId > 0) {
        console.log('✅ PASS: Correction recorded successfully');
        console.log(`   Correction ID: ${correctionId}`);
        return true;
    } else {
        console.log('❌ FAIL: Correction not recorded');
        return false;
    }
}

// Test 2: Set and get preferences
async function testPreferences() {
    console.log('\n🧪 Test 2: Set and Get Preferences');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    await tracker.setPreference('cpq-assessment', 'date-format', 'YYYY-MM-DD', 'ISO 8601 date format');
    const value = await tracker.getPreference('cpq-assessment', 'date-format');

    await tracker.close();
    cleanupTestDB();

    if (value === 'YYYY-MM-DD') {
        console.log('✅ PASS: Preference set and retrieved correctly');
        console.log(`   Value: ${value}`);
        return true;
    } else {
        console.log('❌ FAIL: Preference not retrieved correctly');
        console.log(`   Expected: YYYY-MM-DD, Got: ${value}`);
        return false;
    }
}

// Test 3: Add validation rule
async function testAddValidationRule() {
    console.log('\n🧪 Test 3: Add Validation Rule');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    const ruleId = await tracker.addValidationRule(
        'cpq-assessment',
        'date-format',
        'YYYY-MM-DD',
        { description: 'ISO 8601 date format', severity: 'error' }
    );

    const rules = await tracker.getValidationRules('cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    if (ruleId > 0 && rules.length === 1) {
        console.log('✅ PASS: Validation rule added successfully');
        console.log(`   Rule ID: ${ruleId}`);
        console.log(`   Rules count: ${rules.length}`);
        return true;
    } else {
        console.log('❌ FAIL: Validation rule not added correctly');
        return false;
    }
}

// Test 4: Validate date format violation
async function testDateFormatValidation() {
    console.log('\n🧪 Test 4: Date Format Validation');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    // Add date format rule
    await tracker.addValidationRule(
        'cpq-assessment',
        'date-format',
        'YYYY-MM-DD',
        { description: 'Use ISO 8601 date format', severity: 'error' }
    );

    // Validate output with wrong date format
    const output = {
        report_date: '10/26/2025',  // Wrong format (MM/DD/YYYY)
        assessment_date: '2025-10-26'  // Correct format
    };

    const result = await tracker.validate(output, 'cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    const dateFormatViolation = result.violations.find(v => v.type === 'DATE_FORMAT_VIOLATION');

    if (dateFormatViolation && !result.valid) {
        console.log('✅ PASS: Date format violation detected');
        console.log(`   Message: ${dateFormatViolation.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Date format violation not detected');
        return false;
    }
}

// Test 5: Validate naming convention violation
async function testNamingConventionValidation() {
    console.log('\n🧪 Test 5: Naming Convention Validation');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    // Add naming convention rule (prefer snake_case)
    await tracker.addValidationRule(
        'cpq-assessment',
        'naming-convention',
        'snake_case',
        { description: 'Use snake_case for property names', severity: 'warning' }
    );

    // Validate output with camelCase naming
    const output = {
        assessmentDate: '2025-10-26',  // camelCase (wrong)
        report_status: 'complete'      // snake_case (correct)
    };

    const result = await tracker.validate(output, 'cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    const namingViolation = result.warnings.find(w => w.type === 'NAMING_CONVENTION_VIOLATION');

    if (namingViolation) {
        console.log('✅ PASS: Naming convention violation detected');
        console.log(`   Message: ${namingViolation.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Naming convention violation not detected');
        return false;
    }
}

// Test 6: Validate required field missing
async function testRequiredFieldValidation() {
    console.log('\n🧪 Test 6: Required Field Validation');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    // Add required field rule
    await tracker.addValidationRule(
        'cpq-assessment',
        'required-field',
        'summary',
        { description: 'Summary field is required', severity: 'error' }
    );

    // Validate output missing required field
    const output = {
        report_date: '2025-10-26',
        findings: ['Finding 1', 'Finding 2']
        // Missing: summary
    };

    const result = await tracker.validate(output, 'cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    const requiredFieldViolation = result.violations.find(v => v.type === 'REQUIRED_FIELD_MISSING');

    if (requiredFieldViolation && !result.valid) {
        console.log('✅ PASS: Required field violation detected');
        console.log(`   Message: ${requiredFieldViolation.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Required field violation not detected');
        return false;
    }
}

// Test 7: Cross-session persistence
async function testCrossSessionPersistence() {
    console.log('\n🧪 Test 7: Cross-Session Persistence');

    cleanupTestDB();

    // Session 1: Add rule
    const tracker1 = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker1.initialize();
    await tracker1.addValidationRule(
        'cpq-assessment',
        'date-format',
        'YYYY-MM-DD',
        { description: 'ISO 8601', severity: 'error' }
    );
    await tracker1.close();

    // Session 2: Retrieve rule
    const tracker2 = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker2.initialize();
    const rules = await tracker2.getValidationRules('cpq-assessment');
    await tracker2.close();

    cleanupTestDB();

    if (rules.length === 1 && rules[0].rule_pattern === 'YYYY-MM-DD') {
        console.log('✅ PASS: Cross-session persistence works');
        console.log(`   Rules persisted: ${rules.length}`);
        return true;
    } else {
        console.log('❌ FAIL: Cross-session persistence failed');
        return false;
    }
}

// Test 8: Correction summary
async function testCorrectionSummary() {
    console.log('\n🧪 Test 8: Correction Summary');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    // Record multiple corrections
    await tracker.recordCorrection('cpq-assessment', 'date-format', 'Wrong1', 'Expected1');
    await tracker.recordCorrection('cpq-assessment', 'date-format', 'Wrong2', 'Expected2');
    await tracker.recordCorrection('cpq-assessment', 'naming-convention', 'Wrong3', 'Expected3');

    const summary = await tracker.getCorrectionSummary('cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    const dateFormatCount = summary.find(s => s.category === 'date-format');
    const namingCount = summary.find(s => s.category === 'naming-convention');

    if (dateFormatCount && dateFormatCount.count === 2 && namingCount && namingCount.count === 1) {
        console.log('✅ PASS: Correction summary accurate');
        console.log(`   date-format: ${dateFormatCount.count} corrections`);
        console.log(`   naming-convention: ${namingCount.count} correction`);
        return true;
    } else {
        console.log('❌ FAIL: Correction summary incorrect');
        return false;
    }
}

// Test 9: Value range validation
async function testValueRangeValidation() {
    console.log('\n🧪 Test 9: Value Range Validation');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    // Add value range rule (score: 0-100)
    await tracker.addValidationRule(
        'cpq-assessment',
        'value-range',
        'score:0:100',
        { description: 'Score must be 0-100', severity: 'error' }
    );

    // Validate output with out-of-range value
    const output = {
        score: 150  // Out of range (> 100)
    };

    const result = await tracker.validate(output, 'cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    const rangeViolation = result.violations.find(v => v.type === 'VALUE_RANGE_VIOLATION');

    if (rangeViolation && !result.valid) {
        console.log('✅ PASS: Value range violation detected');
        console.log(`   Message: ${rangeViolation.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Value range violation not detected');
        return false;
    }
}

// Test 10: Valid output passes
async function testValidOutputPasses() {
    console.log('\n🧪 Test 10: Valid Output Passes');

    cleanupTestDB();

    const tracker = new UserExpectationTracker({ dbPath: TEST_DB });
    await tracker.initialize();

    // Add rules
    await tracker.addValidationRule('cpq-assessment', 'date-format', 'YYYY-MM-DD', { severity: 'error' });
    await tracker.addValidationRule('cpq-assessment', 'required-field', 'summary', { severity: 'error' });

    // Validate valid output
    const output = {
        report_date: '2025-10-26',  // Correct format
        assessment_date: '2025-10-25',
        summary: 'Complete CPQ assessment',  // Required field present
        findings: ['Finding 1', 'Finding 2']
    };

    const result = await tracker.validate(output, 'cpq-assessment');

    await tracker.close();
    cleanupTestDB();

    if (result.valid && result.violations.length === 0) {
        console.log('✅ PASS: Valid output passed validation');
        console.log(`   Violations: ${result.violations.length}`);
        console.log(`   Warnings: ${result.warnings.length}`);
        return true;
    } else {
        console.log('❌ FAIL: Valid output incorrectly flagged');
        console.log(`   Violations: ${result.violations.length}`);
        if (result.violations.length > 0) {
            result.violations.forEach(v => console.log(`     - ${v.message}`));
        }
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  User Expectation Tracker - Test Suite                  ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const tests = [
        testRecordCorrection,
        testPreferences,
        testAddValidationRule,
        testDateFormatValidation,
        testNamingConventionValidation,
        testRequiredFieldValidation,
        testCrossSessionPersistence,
        testCorrectionSummary,
        testValueRangeValidation,
        testValidOutputPasses
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

module.exports = { runAllTests };
