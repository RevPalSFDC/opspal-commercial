module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/scripts/lib/__tests__/**/*.test.js',
    '**/scripts/lib/__tests__/**/*.spec.js',
    '**/test/integration/template-framework-integration.test.js'
  ],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'scripts/lib/assignment-rule*.js',
    'scripts/lib/assignee-validator.js',
    'scripts/lib/criteria-evaluator.js',
    'scripts/lib/validators/assignment-rule-validator.js',
    'scripts/lib/validators/assignee-access-validator.js',
    '!scripts/lib/__tests__/**',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 10000,
  verbose: true,
  bail: false
};
