/**
 * RevPal Agents Main Entry Point
 * Automatically enforces no-mocks policy for all requires
 */

// AUTO-ENFORCE NO-MOCKS POLICY
// This runs automatically when the project is required/imported
if (process.env.NO_MOCKS !== '0') {
    process.env.NO_MOCKS = '1';

    // Install guard for main process
    try {
        const RuntimeMockGuard = require('./scripts/lib/runtime-mock-guard.js');
        const guard = new RuntimeMockGuard();
        guard.install({ skipInterval: true });
    } catch (error) {
        // Silent fail in production
        if (process.env.DEBUG) {
            console.error('[RevPal] Mock guard initialization:', error.message);
        }
    }
}

// Export project utilities
module.exports = {
    // Export DataAccessError for use by other modules
    DataAccessError: require('./scripts/lib/data-access-error').DataAccessError,

    // Export SafeQueryExecutor
    SafeQueryExecutor: require('./scripts/lib/safe-query-executor'),

    // Export RuntimeMockGuard for manual installation if needed
    RuntimeMockGuard: require('./scripts/lib/runtime-mock-guard'),

    // Project info
    version: require('./package.json').version,

    // Policy enforcement status
    noMocksEnabled: process.env.NO_MOCKS === '1'
};