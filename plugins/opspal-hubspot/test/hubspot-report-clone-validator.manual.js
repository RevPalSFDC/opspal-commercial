/**
 * Test Suite for HubSpot Report Clone Validator
 *
 * Tests:
 * 1. Source report not found
 * 2. Target list not found
 * 3. Object type mismatch (Contact report → Company list)
 * 4. Object type match (Contact report → Contact list)
 * 5. Permission validation (read-only list)
 * 6. Valid clone operation
 *
 * @version 1.0.0
 * @created 2025-10-26
 */

const HubSpotReportCloneValidator = require('../scripts/lib/hubspot-report-clone-validator');

// Mock API responses
const mockReports = {
    'report-contact-123': {
        id: 'report-contact-123',
        name: 'Contact Report',
        objectType: 'CONTACT',
        readOnly: false
    },
    'report-company-456': {
        id: 'report-company-456',
        name: 'Company Report',
        objectType: 'COMPANY',
        readOnly: false
    }
};

const mockLists = {
    'list-contact-789': {
        listId: 'list-contact-789',
        name: 'Contact List',
        objectTypeId: 'CONTACT',
        readOnly: false,
        archived: false,
        metaData: { size: 100 }
    },
    'list-company-012': {
        listId: 'list-company-012',
        name: 'Company List',
        objectTypeId: 'COMPANY',
        readOnly: false,
        archived: false,
        metaData: { size: 50 }
    },
    'list-readonly-345': {
        listId: 'list-readonly-345',
        name: 'Read-Only List',
        objectTypeId: 'CONTACT',
        readOnly: true,
        archived: false,
        metaData: { size: 200 }
    }
};

// Create mock validator with mocked API calls
class MockHubSpotReportCloneValidator extends HubSpotReportCloneValidator {
    async getReport(reportId) {
        return mockReports[reportId] || null;
    }

    async getList(listId) {
        return mockLists[listId] || null;
    }
}

// Test 1: Source report not found
async function testSourceReportNotFound() {
    console.log('\n🧪 Test 1: Source Report Not Found');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'nonexistent-report',
        targetListId: 'list-contact-789'
    });

    const reportNotFoundError = result.errors.find(e => e.type === 'REPORT_NOT_FOUND');

    if (reportNotFoundError && !result.valid) {
        console.log('✅ PASS: Source report not found error detected');
        console.log(`   Message: ${reportNotFoundError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Source report not found error not detected');
        return false;
    }
}

// Test 2: Target list not found
async function testTargetListNotFound() {
    console.log('\n🧪 Test 2: Target List Not Found');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'report-contact-123',
        targetListId: 'nonexistent-list'
    });

    const listNotFoundError = result.errors.find(e => e.type === 'LIST_NOT_FOUND');

    if (listNotFoundError && !result.valid) {
        console.log('✅ PASS: Target list not found error detected');
        console.log(`   Message: ${listNotFoundError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Target list not found error not detected');
        return false;
    }
}

// Test 3: Object type mismatch
async function testObjectTypeMismatch() {
    console.log('\n🧪 Test 3: Object Type Mismatch');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'report-contact-123', // CONTACT report
        targetListId: 'list-company-012'      // COMPANY list
    });

    const mismatchError = result.errors.find(e => e.type === 'OBJECT_TYPE_MISMATCH');

    if (mismatchError && !result.valid) {
        console.log('✅ PASS: Object type mismatch detected');
        console.log(`   Message: ${mismatchError.message}`);
        console.log(`   Source: ${mismatchError.sourceObjectType}, Target: ${mismatchError.targetObjectType}`);
        return true;
    } else {
        console.log('❌ FAIL: Object type mismatch not detected');
        return false;
    }
}

// Test 4: Object type match
async function testObjectTypeMatch() {
    console.log('\n🧪 Test 4: Object Type Match');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'report-contact-123', // CONTACT report
        targetListId: 'list-contact-789'      // CONTACT list
    });

    const mismatchError = result.errors.find(e => e.type === 'OBJECT_TYPE_MISMATCH');

    if (!mismatchError && result.metadata.objectTypeMatch) {
        console.log('✅ PASS: Object types match correctly');
        console.log(`   Both are CONTACT type`);
        return true;
    } else {
        console.log('❌ FAIL: Object type match not detected correctly');
        return false;
    }
}

// Test 5: Permission validation (read-only list)
async function testPermissionValidation() {
    console.log('\n🧪 Test 5: Permission Validation (Read-Only List)');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'report-contact-123',
        targetListId: 'list-readonly-345' // Read-only list
    });

    const permissionError = result.errors.find(e => e.type === 'PERMISSION_DENIED');

    if (permissionError && !result.valid) {
        console.log('✅ PASS: Permission error detected for read-only list');
        console.log(`   Message: ${permissionError.message}`);
        return true;
    } else {
        console.log('❌ FAIL: Permission error not detected for read-only list');
        return false;
    }
}

// Test 6: Valid clone operation
async function testValidCloneOperation() {
    console.log('\n🧪 Test 6: Valid Clone Operation');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'report-contact-123',
        targetListId: 'list-contact-789'
    });

    if (result.valid && result.errors.length === 0) {
        console.log('✅ PASS: Valid clone operation passed validation');
        console.log(`   Object types match: ${result.metadata.objectTypeMatch}`);
        console.log(`   Permissions valid: ${result.metadata.permissionsValid}`);
        return true;
    } else {
        console.log('❌ FAIL: Valid clone operation incorrectly flagged as invalid');
        console.log(`   Errors: ${result.errors.length}`);
        if (result.errors.length > 0) {
            result.errors.forEach(err => console.log(`     - ${err.message}`));
        }
        return false;
    }
}

// Test 7: Missing required fields
async function testMissingFields() {
    console.log('\n🧪 Test 7: Missing Required Fields');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        // Missing both sourceReportId and targetListId
    });

    const missingFieldErrors = result.errors.filter(e => e.type === 'MISSING_FIELD');

    if (missingFieldErrors.length === 2 && !result.valid) {
        console.log('✅ PASS: Missing required fields detected');
        console.log(`   Found ${missingFieldErrors.length} missing field errors`);
        return true;
    } else {
        console.log('❌ FAIL: Missing required fields not detected correctly');
        console.log(`   Expected 2 errors, got ${missingFieldErrors.length}`);
        return false;
    }
}

// Test 8: Company to Company valid clone
async function testCompanyToCompanyClone() {
    console.log('\n🧪 Test 8: Company to Company Clone (Valid)');

    const validator = new MockHubSpotReportCloneValidator('test-portal', 'test-token');
    const result = await validator.validate({
        sourceReportId: 'report-company-456', // COMPANY report
        targetListId: 'list-company-012'      // COMPANY list
    });

    if (result.valid && result.errors.length === 0) {
        console.log('✅ PASS: Company to Company clone validated successfully');
        return true;
    } else {
        console.log('❌ FAIL: Company to Company clone incorrectly flagged as invalid');
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  HubSpot Report Clone Validator - Test Suite            ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const tests = [
        testSourceReportNotFound,
        testTargetListNotFound,
        testObjectTypeMismatch,
        testObjectTypeMatch,
        testPermissionValidation,
        testValidCloneOperation,
        testMissingFields,
        testCompanyToCompanyClone
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
