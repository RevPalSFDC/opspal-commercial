/**
 * Jest Configuration for Cross-Platform Plugin
 *
 * Coverage targets:
 * - UAT framework: 85%+ (pure functions, well-defined inputs/outputs)
 * - RevOps Reporting: 85%+ (Phase 6 QA comprehensive coverage)
 * - Mermaid/Lucid: 80%+ (existing coverage maintained)
 * - General scripts: 80%+ (default threshold)
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js',
    '**/test/task-graph/**/*.test.js',
    '**/test/hooks/**/*.test.js',  // Hook unit and integration tests
    '**/test/*.test.js'  // Root-level test files
  ],

  // Files to ignore during testing
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__fixtures__/',
    '/templates/'
  ],

  // Coverage collection
  collectCoverageFrom: [
    'scripts/lib/**/*.js',
    '!scripts/lib/__tests__/**',
    '!scripts/lib/__fixtures__/**',
    '!scripts/lib/**/index.js',
    '!**/node_modules/**',
    '!**/test/**'
  ],

  // Coverage thresholds by path
  // Note: Thresholds are goals, not hard requirements during development
  coverageThreshold: {
    // UAT Framework - good coverage targets
    'scripts/lib/uat-csv-parser.js': {
      statements: 75,
      branches: 75,
      functions: 85,
      lines: 75
    },
    'scripts/lib/uat-step-executor.js': {
      statements: 65,
      branches: 55,
      functions: 70,
      lines: 65
    },
    'scripts/lib/uat-report-generator.js': {
      statements: 90,
      branches: 70,
      functions: 100,
      lines: 90
    },
    'scripts/lib/uat-test-runner.js': {
      statements: 5,   // Integration-heavy, tested via integration tests
      branches: 5,
      functions: 3,
      lines: 5
    },
    'scripts/lib/uat-test-case-builder.js': {
      statements: 85,
      branches: 80,
      functions: 100,
      lines: 85
    },

    // RevOps Reporting - Phase 6 QA comprehensive coverage
    'scripts/lib/revops-kpi-knowledge-base.js': {
      statements: 85,
      branches: 80,
      functions: 90,
      lines: 85
    },
    'scripts/lib/methodology-generator.js': {
      statements: 85,
      branches: 80,
      functions: 90,
      lines: 85
    },
    'scripts/lib/trend-analysis-engine.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    'scripts/lib/kpi-forecaster.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    'scripts/lib/kpi-alert-monitor.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    'scripts/lib/cohort-analysis-engine.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    'scripts/lib/report-explorer.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },
    'scripts/lib/report-version-manager.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    },

    // Task Graph Framework - comprehensive coverage targets
    'scripts/lib/task-graph/*.js': {
      statements: 80,
      branches: 75,
      functions: 85,
      lines: 80
    }
  },

  // Coverage reporters
  coverageReporters: [
    'text',           // Console output
    'text-summary',   // Brief summary
    'lcov',           // For CI/CD integration
    'html'            // Human-readable reports
  ],

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Verbose output
  verbose: true,

  // Test timeout (10 seconds for E2E tests)
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Setup files to run before tests
  setupFilesAfterEnv: [],

  // Module name mapper for path aliases (if needed)
  moduleNameMapper: {},

  // Transform files (none needed for Node.js)
  transform: {},

  // Files to collect coverage from even if not tested directly
  forceCoverageMatch: [
    '**/uat-*.js'
  ],

  // Reporters for test results
  reporters: ['default'],

  // Projects for parallel test execution (optional)
  // projects: [],

  // Global setup/teardown (if needed)
  // globalSetup: './test/setup.js',
  // globalTeardown: './test/teardown.js'
};
