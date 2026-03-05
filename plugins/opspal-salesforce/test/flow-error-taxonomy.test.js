/**
 * Unit tests for FlowErrorTaxonomy
 * Tests error classification and retry strategy logic
 *
 * Run: node test/flow-error-taxonomy.test.js
 */

const FlowErrorTaxonomy = require('../scripts/lib/flow-error-taxonomy');

// Test helper
function createError(message) {
    const error = new Error(message);
    return error;
}

// Test runner
function runTests() {
    console.log('🧪 Running FlowErrorTaxonomy tests...\n');

    const taxonomy = new FlowErrorTaxonomy();
    let passed = 0;
    let failed = 0;
    const results = [];

    function test(name, fn) {
        try {
            fn();
            console.log(`✅ ${name}`);
            passed++;
            results.push({ name, passed: true });
        } catch (error) {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${error.message}`);
            failed++;
            results.push({ name, passed: false, error: error.message });
        }
    }

    function expect(value) {
        return {
            toBe(expected) {
                if (value !== expected) {
                    throw new Error(`Expected ${expected}, got ${value}`);
                }
            },
            toContain(expected) {
                if (!value.includes(expected)) {
                    throw new Error(`Expected to contain "${expected}", got "${value}"`);
                }
            },
            not: {
                toContain(expected) {
                    if (value.includes(expected)) {
                        throw new Error(`Expected not to contain "${expected}", but it did`);
                    }
                }
            }
        };
    }

    // === RECOVERABLE ERRORS ===
    console.log('📦 Testing RECOVERABLE errors:');

    test('Lock contention classification', () => {
        const error = createError('unable to lock row for update');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('RECOVERABLE');
        expect(classification.category).toBe('LOCK_CONTENTION');
        expect(classification.retryable).toBe(true);
        expect(classification.maxRetries).toBe(5);
        expect(classification.severity).toBe('MEDIUM');
    });

    test('Network timeout classification', () => {
        const error = createError('ETIMEDOUT: connection timeout');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('RECOVERABLE');
        expect(classification.category).toBe('NETWORK_TIMEOUT');
        expect(classification.retryable).toBe(true);
        expect(classification.maxRetries).toBe(3);
    });

    test('Rate limit classification', () => {
        const error = createError('rate limit exceeded');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('RECOVERABLE');
        expect(classification.category).toBe('RATE_LIMIT');
        expect(classification.retryable).toBe(true);
        expect(classification.maxRetries).toBe(5);
        expect(classification.severity).toBe('LOW');
    });

    test('Query timeout classification', () => {
        const error = createError('query timeout exceeded');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('RECOVERABLE');
        expect(classification.category).toBe('QUERY_TIMEOUT');
        expect(classification.retryable).toBe(true);
        expect(classification.maxRetries).toBe(2);
    });

    // === PERMANENT ERRORS ===
    console.log('\n📦 Testing PERMANENT errors:');

    test('Missing field classification', () => {
        const error = createError('field Custom_Field__c does not exist');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('PERMANENT');
        expect(classification.category).toBe('MISSING_FIELD');
        expect(classification.retryable).toBe(false);
        expect(classification.maxRetries).toBe(0);
        expect(classification.severity).toBe('HIGH');
    });

    test('Missing object classification', () => {
        const error = createError('object Custom_Object__c does not exist');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('PERMANENT');
        expect(classification.category).toBe('MISSING_OBJECT');
        expect(classification.retryable).toBe(false);
        expect(classification.severity).toBe('CRITICAL');
    });

    test('Invalid XML classification', () => {
        const error = createError('invalid xml structure - parse error');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('PERMANENT');
        expect(classification.category).toBe('INVALID_FLOW_XML');
        expect(classification.retryable).toBe(false);
    });

    test('Circular dependency classification', () => {
        const error = createError('circular dependency detected');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('PERMANENT');
        expect(classification.category).toBe('CIRCULAR_DEPENDENCY');
        expect(classification.retryable).toBe(false);
    });

    // === USER_INDUCED ERRORS ===
    console.log('\n📦 Testing USER_INDUCED errors:');

    test('Insufficient permission classification', () => {
        const error = createError('insufficient access permissions');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('USER_INDUCED');
        expect(classification.category).toBe('INSUFFICIENT_PERMISSION');
        expect(classification.retryable).toBe(false);
        expect(classification.userActionRequired).toBe(true);
    });

    test('Validation error classification', () => {
        const error = createError('validation rule failed');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('USER_INDUCED');
        expect(classification.category).toBe('VALIDATION_ERROR');
        expect(classification.retryable).toBe(false);
    });

    test('DML in loop classification', () => {
        const error = createError('dml operation inside loop detected');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('USER_INDUCED');
        expect(classification.category).toBe('DML_IN_LOOP');
        expect(classification.severity).toBe('CRITICAL');
    });

    // === SYSTEM_ERROR ERRORS ===
    console.log('\n📦 Testing SYSTEM_ERROR errors:');

    test('Governor limit classification', () => {
        const error = createError('too many SOQL queries: 101');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('SYSTEM_ERROR');
        expect(classification.category).toBe('GOVERNOR_LIMIT');
        expect(classification.retryable).toBe(false);
        expect(classification.severity).toBe('CRITICAL');
    });

    test('Apex error classification', () => {
        const error = createError('Apex error: System.NullPointerException');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('SYSTEM_ERROR');
        expect(classification.category).toBe('APEX_ERROR');
        expect(classification.retryable).toBe(false);
    });

    test('Platform unavailable classification (retryable)', () => {
        const error = createError('service unavailable - scheduled maintenance');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('SYSTEM_ERROR');
        expect(classification.category).toBe('PLATFORM_UNAVAILABLE');
        expect(classification.retryable).toBe(true);
        expect(classification.maxRetries).toBe(10);
    });

    // === UNKNOWN ERRORS ===
    console.log('\n📦 Testing UNKNOWN errors:');

    test('Unknown error classification', () => {
        const error = createError('some completely new error message');
        const classification = taxonomy.classify(error);

        expect(classification.class).toBe('UNKNOWN');
        expect(classification.category).toBe('UNKNOWN');
        expect(classification.retryable).toBe(false);
        expect(classification.userActionRequired).toBe(true);
    });

    // === RETRY STRATEGY ===
    console.log('\n📦 Testing Retry Strategy:');

    test('No retry for non-retryable errors', () => {
        const error = createError('field Custom_Field__c does not exist');
        const classification = taxonomy.classify(error);
        const strategy = taxonomy.getRetryStrategy(classification);

        expect(strategy.shouldRetry).toBe(false);
        expect(strategy.reason).toContain('not retryable');
    });

    test('Retry strategy for RECOVERABLE errors', () => {
        const error = createError('unable to lock row for update');
        const classification = taxonomy.classify(error);
        const strategy = taxonomy.getRetryStrategy(classification);

        expect(strategy.shouldRetry).toBe(true);
        expect(strategy.maxRetries).toBe(5);
        expect(strategy.baseDelay).toBe(1000);
        expect(strategy.exponentialBackoff).toBe(true);
        expect(strategy.jitter).toBe(true);
    });

    test('Correct base delays for different categories', () => {
        const testCases = [
            { message: 'unable to lock row', expectedDelay: 1000 },
            { message: 'ETIMEDOUT', expectedDelay: 2000 },
            { message: 'rate limit exceeded', expectedDelay: 5000 },
            { message: 'query timeout', expectedDelay: 3000 },
            { message: 'service unavailable', expectedDelay: 30000 }
        ];

        testCases.forEach(({ message, expectedDelay }) => {
            const classification = taxonomy.classify(createError(message));
            const strategy = taxonomy.getRetryStrategy(classification);

            if (strategy.shouldRetry) {
                expect(strategy.baseDelay).toBe(expectedDelay);
            }
        });
    });

    // === FORMAT OUTPUT ===
    console.log('\n📦 Testing Format Output:');

    test('Format classification for display', () => {
        const error = createError('unable to lock row for update');
        const classification = taxonomy.classify(error);
        const formatted = taxonomy.format(classification);

        expect(formatted).toContain('Class: RECOVERABLE');
        expect(formatted).toContain('Category: LOCK_CONTENTION');
        expect(formatted).toContain('Retryable: Yes');
        expect(formatted).toContain('Max Retries: 5');
        expect(formatted).toContain('Severity: MEDIUM');
    });

    test('Format non-retryable errors correctly', () => {
        const error = createError('field does not exist');
        const classification = taxonomy.classify(error);
        const formatted = taxonomy.format(classification);

        expect(formatted).toContain('Retryable: No');
        expect(formatted).not.toContain('Max Retries');
    });

    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Test Summary`);
    console.log(`${'='.repeat(80)}`);
    console.log(`  Total: ${passed + failed}`);
    console.log(`  ✅ Passed: ${passed} (${((passed / (passed + failed)) * 100).toFixed(1)}%)`);
    console.log(`  ❌ Failed: ${failed} (${((failed / (passed + failed)) * 100).toFixed(1)}%)`);

    if (failed > 0) {
        console.log(`\n  Failed tests:`);
        results.filter(r => !r.passed).forEach(r => {
            console.log(`    - ${r.name}: ${r.error}`);
        });
    }

    console.log(`${'='.repeat(80)}\n`);

    return failed === 0;
}

// Run tests if called directly
if (require.main === module) {
    const success = runTests();
    process.exit(success ? 0 : 1);
}

module.exports = { runTests };


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Flow Error Taxonomy', () => {
    it('should pass all tests', async () => {
      expect(typeof runTests).toBe('function');
      const result = await runTests();
      expect(result).not.toBe(false);
    });
  });
}
