module.exports = {
  testMatch: [
    '**/?(*.)+(spec|test).[jt]s?(x)'
  ],
  testPathIgnorePatterns: [
    '/plugins/opspal-core/test/hooks/unit/',
    '/plugins/opspal-core/test/hooks/integration/',
    '/dev-tools/developer-tools-plugin/test/hooks/unit/',
    '/dev-tools/developer-tools-plugin/test/hooks/integration/',
    '/\\.claude/scripts/lib/__tests__/factories/',
    '/\\.claude/scripts/__tests__/mocks/',
    '/plugins/opspal-core/scripts/lib/mermaid-lucid/__tests__/fixtures/',
    '/dev-tools/developer-tools-plugin/scripts/lib/__tests__/test-task-tool-invoker\\.js$',
    '/plugins/opspal-salesforce/tests/error-prevention-phase1\\.test\\.js$',
    '/plugins/opspal-core/tests/quality-gate-validator\\.test\\.js$'
  ]
};
