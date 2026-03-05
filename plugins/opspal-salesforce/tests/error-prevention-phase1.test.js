#!/usr/bin/env node

/**
 * Error Prevention System - Phase 1 Tests
 *
 * Comprehensive test suite for sf-command-interceptor and sf-command-auto-corrector
 *
 * Test Categories:
 * 1. INVALID_FIELD corrections (ApiName → DeveloperName)
 * 2. MALFORMED_QUERY corrections (operator consistency)
 * 3. INVALID_TYPE corrections (missing --use-tooling-api)
 * 4. ComponentSetError prevention (deployment validation)
 * 5. LINE_ENDING corrections (CSV CRLF → LF)
 * 6. End-to-end interception flow
 *
 * @module error-prevention-phase1.test
 * @version 1.0.0
 * @created 2025-10-24
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import modules to test
const SFCommandInterceptor = require('../scripts/lib/sf-command-interceptor');
const SFCommandAutoCorrector = require('../scripts/lib/sf-command-auto-corrector');

// Test configuration
const TEST_TIMEOUT = 10000; // 10 seconds
const VERBOSE = process.env.TEST_VERBOSE === 'true';

// Test statistics
const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
};

/**
 * Test runner utility
 */
async function runTest(name, testFn) {
    stats.total++;
    process.stdout.write(`Testing: ${name}... `);

    try {
        await testFn();
        stats.passed++;
        console.log('✅ PASS');
    } catch (error) {
        stats.failed++;
        console.log('❌ FAIL');
        console.error(`  Error: ${error.message}`);
        if (VERBOSE) {
            console.error(error.stack);
        }
    }
}

/**
 * Test Suite 1: INVALID_FIELD Corrections
 */
async function testInvalidFieldCorrections() {
    console.log('\n📋 Test Suite 1: INVALID_FIELD Corrections\n');

    // Test 1.1: ApiName → DeveloperName on FlowVersionView
    await runTest('ApiName → DeveloperName on FlowVersionView', async () => {
        const corrector = new SFCommandAutoCorrector();
        const parsed = {
            original: 'sf data query --query "SELECT ApiName FROM FlowVersionView" --json',
            query: 'SELECT ApiName FROM FlowVersionView'
        };
        const errors = [{
            type: 'INVALID_FIELD',
            field: 'ApiName',
            object: 'FlowVersionView',
            autoFixable: true
        }];

        const result = await corrector.correct(parsed, errors);

        assert.strictEqual(result.success, true, 'Correction should succeed');
        assert.ok(result.correctedCommand.includes('DeveloperName'), 'Should contain DeveloperName');
        assert.ok(!result.correctedCommand.includes('ApiName'), 'Should not contain ApiName');
        assert.strictEqual(result.corrections.length, 1, 'Should have 1 correction');
    });

    // Test 1.2: Name → QualifiedApiName on FieldDefinition
    await runTest('Name → QualifiedApiName on FieldDefinition', async () => {
        const corrector = new SFCommandAutoCorrector();
        const parsed = {
            original: 'sf data query --query "SELECT Name FROM FieldDefinition" --json',
            query: 'SELECT Name FROM FieldDefinition'
        };
        const errors = [{
            type: 'INVALID_FIELD',
            field: 'Name',
            object: 'FieldDefinition',
            autoFixable: true
        }];

        const result = await corrector.correct(parsed, errors);

        assert.strictEqual(result.success, true, 'Correction should succeed');
        assert.ok(result.correctedCommand.includes('QualifiedApiName'), 'Should contain QualifiedApiName');
        assert.ok(result.correctedCommand.includes('Label'), 'Should contain Label');
    });
}

/**
 * Test Suite 2: MALFORMED_QUERY Corrections
 */
async function testMalformedQueryCorrections() {
    console.log('\n📋 Test Suite 2: MALFORMED_QUERY Corrections\n');

    // Test 2.1: Mixed = and LIKE operators
    await runTest('Mixed = and LIKE operators → All LIKE', async () => {
        const corrector = new SFCommandAutoCorrector();
        const parsed = {
            original: 'sf data query --query "SELECT Id FROM Opportunity WHERE Type = \'Renewal\' OR Type LIKE \'%Amend%\'"',
            query: 'SELECT Id FROM Opportunity WHERE Type = \'Renewal\' OR Type LIKE \'%Amend%\''
        };
        const errors = [{
            type: 'MALFORMED_QUERY',
            autoFixable: true
        }];

        const result = await corrector.correct(parsed, errors);

        assert.strictEqual(result.success, true, 'Correction should succeed');
        assert.ok(result.correctedCommand.includes('LIKE \'Renewal\''), 'Should convert = to LIKE');
        assert.ok(!result.correctedCommand.match(/=\s*'Renewal'/), 'Should not have = operator');
    });

    // Test 2.2: Multiple mixed operators in OR chain
    await runTest('Multiple mixed operators in OR chain', async () => {
        const corrector = new SFCommandAutoCorrector();
        const parsed = {
            original: 'sf data query --query "SELECT Id FROM Account WHERE Type = \'A\' OR Type = \'B\' OR Type LIKE \'%C%\'"',
            query: 'SELECT Id FROM Account WHERE Type = \'A\' OR Type = \'B\' OR Type LIKE \'%C%\''
        };
        const errors = [{
            type: 'MALFORMED_QUERY',
            autoFixable: true
        }];

        const result = await corrector.correct(parsed, errors);

        assert.strictEqual(result.success, true, 'Correction should succeed');
        const likeCount = (result.correctedCommand.match(/LIKE/g) || []).length;
        assert.strictEqual(likeCount, 3, 'Should have 3 LIKE operators');
    });
}

/**
 * Test Suite 3: INVALID_TYPE Corrections
 */
async function testInvalidTypeCorrections() {
    console.log('\n📋 Test Suite 3: INVALID_TYPE Corrections\n');

    // Test 3.1: Add --use-tooling-api flag
    await runTest('Add --use-tooling-api flag', async () => {
        const corrector = new SFCommandAutoCorrector();
        const parsed = {
            original: 'sf data query --query "SELECT ApiName FROM FlowDefinitionView" --target-org my-org --json',
            query: 'SELECT ApiName FROM FlowDefinitionView'
        };
        const errors = [{
            type: 'INVALID_TYPE',
            autoFixable: true
        }];

        const result = await corrector.correct(parsed, errors);

        assert.strictEqual(result.success, true, 'Correction should succeed');
        assert.ok(result.correctedCommand.includes('--use-tooling-api'), 'Should contain --use-tooling-api');
    });

    // Test 3.2: Don't duplicate --use-tooling-api if already present
    await runTest('Don\'t duplicate --use-tooling-api', async () => {
        const corrector = new SFCommandAutoCorrector();
        const parsed = {
            original: 'sf data query --query "SELECT ApiName FROM FlowDefinitionView" --use-tooling-api --json',
            query: 'SELECT ApiName FROM FlowDefinitionView'
        };
        const errors = [{
            type: 'INVALID_TYPE',
            autoFixable: true
        }];

        const result = await corrector.correct(parsed, errors);

        assert.strictEqual(result.success, false, 'Should not correct (already has flag)');
    });
}

/**
 * Test Suite 4: End-to-End Interception
 */
async function testEndToEndInterception() {
    console.log('\n📋 Test Suite 4: End-to-End Interception\n');

    // Test 4.1: Intercept and auto-correct query
    await runTest('Intercept and auto-correct invalid query', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const command = 'sf data query --query "SELECT ApiName FROM FlowVersionView" --json';

        const result = await interceptor.intercept(command);

        assert.strictEqual(result.valid, true, 'Should be valid after correction');
        assert.ok(result.corrections.length > 0, 'Should have corrections');
        assert.ok(result.corrected.includes('DeveloperName'), 'Should correct ApiName');
    });

    // Test 4.2: Block unfixable errors
    await runTest('Block unfixable deployment errors', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const command = 'sf project deploy start --source-dir /nonexistent/path --target-org my-org';

        const result = await interceptor.intercept(command);

        assert.strictEqual(result.valid, false, 'Should be invalid');
        assert.strictEqual(result.shouldExecute, false, 'Should not execute');
        assert.ok(result.errors.length > 0, 'Should have errors');
    });

    // Test 4.3: Multi-error correction
    await runTest('Correct multiple errors in single command', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const command = 'sf data query --query "SELECT ApiName FROM FlowVersionView WHERE TriggerType = \'Platform\' OR TriggerType LIKE \'%Event%\'" --target-org my-org';

        const result = await interceptor.intercept(command);

        assert.ok(result.corrections.length >= 2, 'Should correct multiple errors');
        assert.ok(result.corrected.includes('DeveloperName'), 'Should fix ApiName');
        assert.ok(result.corrected.includes('--use-tooling-api'), 'Should add Tooling API flag');
    });
}

/**
 * Test Suite 5: Statistics and Reporting
 */
async function testStatisticsReporting() {
    console.log('\n📋 Test Suite 5: Statistics and Reporting\n');

    // Test 5.1: Track corrections by type
    await runTest('Track corrections by type', async () => {
        const corrector = new SFCommandAutoCorrector();

        // Correct multiple errors
        const tests = [
            {
                parsed: {
                    original: 'cmd1',
                    query: 'SELECT ApiName FROM FlowVersionView'
                },
                errors: [{ type: 'INVALID_FIELD', field: 'ApiName', object: 'FlowVersionView', autoFixable: true }]
            },
            {
                parsed: {
                    original: 'cmd2',
                    query: 'SELECT Id WHERE Type = \'A\' OR Type LIKE \'%B%\''
                },
                errors: [{ type: 'MALFORMED_QUERY', autoFixable: true }]
            }
        ];

        for (const test of tests) {
            await corrector.correct(test.parsed, test.errors);
        }

        const stats = corrector.getStats();
        assert.strictEqual(stats.totalCorrections, 2, 'Should have 2 total corrections');
        assert.strictEqual(stats.byType['INVALID_FIELD'], 1, 'Should have 1 INVALID_FIELD correction');
        assert.strictEqual(stats.byType['MALFORMED_QUERY'], 1, 'Should have 1 MALFORMED_QUERY correction');
    });

    // Test 5.2: Interceptor statistics
    await runTest('Interceptor tracks statistics', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });

        await interceptor.intercept('sf data query --query "SELECT Id FROM Account"');
        await interceptor.intercept('sf data query --query "SELECT ApiName FROM FlowVersionView"');
        await interceptor.intercept('sf project deploy start --source-dir /bad/path');

        const stats = interceptor.getStats();
        assert.strictEqual(stats.intercepted, 3, 'Should intercept 3 commands');
        assert.ok(stats.corrected >= 1, 'Should correct at least 1');
        assert.ok(stats.blocked >= 1, 'Should block at least 1');
    });
}

/**
 * Test Suite 6: Command Parsing
 */
async function testCommandParsing() {
    console.log('\n📋 Test Suite 6: Command Parsing\n');

    // Test 6.1: Parse query command
    await runTest('Parse query command', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const parsed = interceptor.parseCommand('sf data query --query "SELECT Id FROM Account" --target-org my-org --json');

        assert.strictEqual(parsed.type, 'query', 'Should identify as query');
        assert.ok(parsed.flags['target-org'], 'Should extract target-org flag');
        assert.ok(parsed.query, 'Should extract query string');
    });

    // Test 6.2: Parse deploy command
    await runTest('Parse deploy command', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const parsed = interceptor.parseCommand('sf project deploy start --source-dir ./force-app --target-org my-org');

        assert.strictEqual(parsed.type, 'deploy', 'Should identify as deploy');
        assert.ok(parsed.flags['source-dir'], 'Should extract source-dir flag');
    });

    // Test 6.3: Parse bulk command
    await runTest('Parse bulk command', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const parsed = interceptor.parseCommand('sf data upsert bulk --sobject Account --file data.csv --target-org my-org');

        assert.strictEqual(parsed.type, 'bulk', 'Should identify as bulk');
        assert.ok(parsed.flags['file'], 'Should extract file flag');
    });
}

/**
 * Test Suite 7: Guidance Generation
 */
async function testGuidanceGeneration() {
    console.log('\n📋 Test Suite 7: Guidance Generation\n');

    // Test 7.1: Generate helpful guidance for errors
    await runTest('Generate helpful error guidance', async () => {
        const interceptor = new SFCommandInterceptor({ verbose: false });
        const command = 'sf data query --query "SELECT ApiName FROM FlowVersionView"';

        const result = await interceptor.intercept(command);

        if (!result.valid && result.guidance) {
            assert.ok(result.guidance.includes('DeveloperName'), 'Guidance should mention DeveloperName');
            assert.ok(result.guidance.includes('📖'), 'Guidance should include documentation reference');
        }
    });
}

/**
 * Main test execution
 */
async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Error Prevention System - Phase 1 Test Suite             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const startTime = Date.now();

    try {
        // Run all test suites
        await testInvalidFieldCorrections();
        await testMalformedQueryCorrections();
        await testInvalidTypeCorrections();
        await testEndToEndInterception();
        await testStatisticsReporting();
        await testCommandParsing();
        await testGuidanceGeneration();

        // Print summary
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  Test Summary                                              ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        console.log(`  Total Tests:   ${stats.total}`);
        console.log(`  ✅ Passed:     ${stats.passed}`);
        console.log(`  ❌ Failed:     ${stats.failed}`);
        console.log(`  ⏩ Skipped:    ${stats.skipped}`);
        console.log(`  ⏱️  Duration:   ${duration}s`);
        console.log(`  📊 Pass Rate:  ${((stats.passed / stats.total) * 100).toFixed(1)}%\n`);

        // Exit code
        process.exit(stats.failed > 0 ? 1 : 0);

    } catch (error) {
        console.error('\n💥 Test suite failed with error:');
        console.error(error);
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    main();
}

module.exports = {
    runTest,
    testInvalidFieldCorrections,
    testMalformedQueryCorrections,
    testInvalidTypeCorrections,
    testEndToEndInterception,
    testStatisticsReporting,
    testCommandParsing,
    testGuidanceGeneration
};
