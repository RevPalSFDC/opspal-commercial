/**
 * Auto-initialization for No-Mocks Policy
 * This file is automatically loaded by any Node.js process in this project
 * to enforce the no-mocks policy without requiring user configuration.
 */

// Auto-enable NO_MOCKS if not explicitly disabled
if (process.env.NO_MOCKS !== '0') {
    process.env.NO_MOCKS = '1';

    // Only install guard for non-test files
    const isTestFile = process.argv.some(arg =>
        arg.includes('test') ||
        arg.includes('spec') ||
        arg.includes('jest') ||
        arg.includes('mocha')
    );

    // Skip for certain allowed exceptions
    const isAllowedException = process.argv.some(arg =>
        arg.includes('mock-data-generator')
    );

    if (!isTestFile && !isAllowedException) {
        try {
            const RuntimeMockGuard = require('./scripts/lib/runtime-mock-guard.js');
            const guard = new RuntimeMockGuard();
            guard.install({ skipInterval: true });

            // Silent success - no console output to avoid cluttering
        } catch (error) {
            // If guard fails to load, continue but log to stderr
            if (process.env.DEBUG_NO_MOCKS) {
                console.error('[no-mocks-init] Warning: Could not load RuntimeMockGuard:', error.message);
            }
        }
    }
}