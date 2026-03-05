/**
 * Jest Configuration for Gate Validation Tests
 * =============================================
 */

module.exports = {
    maxWorkers: '50%',
    // Test environment
    testEnvironment: 'node',
    
    // Root directory
    rootDir: '.',
    
    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js'
    ],
    
    // Coverage configuration
    collectCoverage: true,
    collectCoverageFrom: [
        'agents/execution/**/*.js',
        'scripts/lib/**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/__tests__/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    
    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    
    // Test timeout
    testTimeout: 30000,
    
    // Setup files
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    
    // Module paths
    modulePaths: ['<rootDir>'],
    
    // Transform files
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    
    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/temp/',
        '/.rollback/',
        '/instances/',
        '/error-logging/package.json',
        '/.venv/',
        '/.venv-new/'
    ],
    // Reduce noise from nested environments
    watchPathIgnorePatterns: [
        '/instances/',
        '/.venv/',
        '/.venv-new/',
        '/error-logging/package.json'
    ],

    modulePathIgnorePatterns: [
        '<rootDir>/instances/',
        '<rootDir>/.venv/',
        '<rootDir>/.venv-new/',
        '<rootDir>/error-logging/node_modules/'
    ],
    
    // Module name mapper for imports
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@agents/(.*)$': '<rootDir>/agents/$1',
        '^@scripts/(.*)$': '<rootDir>/scripts/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1'
    },
    
    // Verbose output
    verbose: true,
    
    // Clear mocks between tests
    clearMocks: true,
    
    // Restore mocks between tests
    restoreMocks: true,
    
    // Test reporter
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: './test-results',
                outputName: 'junit.xml'
            }
        ]
    ]
};
