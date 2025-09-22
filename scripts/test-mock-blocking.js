#!/usr/bin/env node

/**
 * Test Mock Blocking
 * Verifies that the no-mocks policy actually prevents mock data usage
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧪 Testing Mock Blocking Enforcement');
console.log('====================================\n');

let testsPassed = 0;
let testsFailed = 0;

// Test 1: Verify DataAccessError works
function testDataAccessError() {
    console.log('Test 1: DataAccessError enforcement');

    const testCode = `
const { DataAccessError, requireRealData } = require('${process.cwd()}/scripts/lib/data-access-error.js');

// Test 1: Empty data should throw
try {
    requireRealData('TestSource', []);
    console.log('❌ Failed to throw on empty data');
    process.exit(1);
} catch (error) {
    if (error instanceof DataAccessError) {
        console.log('✅ Correctly threw DataAccessError on empty data');
    } else {
        console.log('❌ Wrong error type:', error.constructor.name);
        process.exit(1);
    }
}

// Test 2: Mock pattern should throw
try {
    requireRealData('TestSource', { name: 'John Doe', company: 'Example Corp' });
    console.log('❌ Failed to detect mock pattern');
    process.exit(1);
} catch (error) {
    if (error instanceof DataAccessError && error.message.includes('mock/synthetic')) {
        console.log('✅ Correctly detected mock data pattern');
    } else {
        console.log('❌ Failed to detect mock pattern');
        process.exit(1);
    }
}

// Test 3: Real data should pass
try {
    const realData = requireRealData('TestSource', {
        name: 'Christopher Smith',
        company: 'RevPal Inc',
        id: 'usr_2024_abc123'
    });
    console.log('✅ Real data passed validation');
} catch (error) {
    console.log('❌ Real data was incorrectly rejected:', error.message);
    process.exit(1);
}
`;

    const testFile = path.join(os.tmpdir(), 'test-data-access.js');
    fs.writeFileSync(testFile, testCode);

    return new Promise((resolve) => {
        const child = spawn('node', [testFile], {
            env: process.env
        });

        let output = '';
        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.on('close', (code) => {
            fs.unlinkSync(testFile);
            console.log(output);

            if (code === 0) {
                testsPassed++;
                console.log('✅ Test 1 PASSED\n');
            } else {
                testsFailed++;
                console.log('❌ Test 1 FAILED\n');
            }
            resolve();
        });
    });
}

// Test 2: Verify RuntimeMockGuard blocks modules
function testRuntimeGuard() {
    console.log('Test 2: RuntimeMockGuard module blocking');

    const testCode = `
const RuntimeMockGuard = require('${process.cwd()}/scripts/lib/runtime-mock-guard.js');
const guard = new RuntimeMockGuard();
guard.install({ skipInterval: true });

// This should exit the process
try {
    eval("require('faker')");
    console.log('❌ Faker was not blocked');
    process.exit(1);
} catch (error) {
    // Should not reach here - guard should exit process
    console.log('✅ Module require was intercepted');
    process.exit(0);
}
`;

    const testFile = path.join(os.tmpdir(), 'test-guard.js');
    fs.writeFileSync(testFile, testCode);

    return new Promise((resolve) => {
        const child = spawn('node', [testFile], {
            env: { ...process.env, NO_MOCKS: '1' }
        });

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            fs.unlinkSync(testFile);

            if (errorOutput.includes('MOCK POLICY VIOLATION') && code === 1) {
                console.log('✅ RuntimeMockGuard correctly blocked faker module');
                testsPassed++;
                console.log('✅ Test 2 PASSED\n');
            } else if (output.includes('Module require was intercepted')) {
                console.log('✅ Module blocking worked via try/catch');
                testsPassed++;
                console.log('✅ Test 2 PASSED\n');
            } else {
                console.log('❌ RuntimeMockGuard did not block module properly');
                console.log('Output:', output);
                console.log('Error:', errorOutput);
                testsFailed++;
                console.log('❌ Test 2 FAILED\n');
            }
            resolve();
        });
    });
}

// Test 3: Verify SafeQueryExecutor enforces real data
function testSafeQueryExecutor() {
    console.log('Test 3: SafeQueryExecutor real data enforcement');

    const testCode = `
const SafeQueryExecutor = require('${process.cwd()}/scripts/lib/safe-query-executor.js');

async function runTest() {
    const executor = new SafeQueryExecutor({
        enforceRealData: true,
        logQueries: false
    });

    // Test: Empty query result should throw
    try {
        // Mock the execution to return empty
        executor.executeMCPQuery = async () => null;
        executor.executeCLIQuery = async () => null;

        await executor.executeQuery('SELECT Id FROM Lead LIMIT 1');
        console.log('❌ Failed to throw on no data source');
        process.exit(1);
    } catch (error) {
        if (error.name === 'QueryExecutionError' || error.name === 'DataAccessError') {
            console.log('✅ Correctly threw on no data source available');
        } else {
            console.log('❌ Wrong error type:', error.name);
            process.exit(1);
        }
    }

    console.log('✅ SafeQueryExecutor enforces real data');
}

runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
`;

    const testFile = path.join(os.tmpdir(), 'test-query-executor.js');
    fs.writeFileSync(testFile, testCode);

    return new Promise((resolve) => {
        const child = spawn('node', [testFile], {
            env: { ...process.env, NO_MOCKS: '1' }
        });

        let output = '';
        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            output += data.toString();
        });

        child.on('close', (code) => {
            fs.unlinkSync(testFile);
            console.log(output);

            if (code === 0 && output.includes('enforces real data')) {
                testsPassed++;
                console.log('✅ Test 3 PASSED\n');
            } else {
                testsFailed++;
                console.log('❌ Test 3 FAILED\n');
            }
            resolve();
        });
    });
}

// Run all tests
async function runAllTests() {
    await testDataAccessError();
    await testRuntimeGuard();
    await testSafeQueryExecutor();

    console.log('=====================================');
    console.log('Test Results Summary');
    console.log('=====================================');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log('');

    if (testsFailed === 0) {
        console.log('🎉 All mock blocking tests PASSED!');
        console.log('The no-mocks policy is properly enforced.');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Review the implementation.');
        process.exit(1);
    }
}

// Main execution
runAllTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
});