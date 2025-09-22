#!/usr/bin/env node

/**
 * DISABLED: Mock data generation is prohibited
 *
 * This script has been disabled to comply with the no-mocks policy.
 * All data must come from real, authoritative sources.
 *
 * If you need test data:
 * 1. Use a dedicated test environment with real data
 * 2. Query actual sandbox/staging systems
 * 3. Use the allowed mock-data-generator agent ONLY when explicitly needed
 *
 * Original file moved to: generate-test-data.js.DISABLED
 */

const { DataAccessError } = require('../../../scripts/lib/data-access-error');

console.error('❌ ERROR: Mock data generation is prohibited');
console.error('');
console.error('This script has been disabled to enforce data integrity.');
console.error('All data must come from real, authoritative sources.');
console.error('');
console.error('Alternatives:');
console.error('1. Use a real test/sandbox environment');
console.error('2. Query actual staging systems');
console.error('3. If mock data is absolutely required, use the designated mock-data-generator agent');
console.error('');

throw new DataAccessError(
    'Mock Data Generator',
    'Script disabled - mock data generation is prohibited',
    {
        originalScript: 'generate-test-data.js',
        policy: 'NO_MOCKS=1',
        allowedException: 'mock-data-generator agent only'
    }
);