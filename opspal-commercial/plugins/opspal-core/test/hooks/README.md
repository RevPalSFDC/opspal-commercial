# Hook Testing Framework (P2-2)

This framework provides unit and integration tests for Claude Code hooks across all OpsPal plugins.

## Overview

- **134 hooks** across all plugins (hook directories only; node_modules and non-hook scripts excluded)
- **Unit tests**: Test each hook in isolation with mock inputs
- **Integration tests**: Test hook chains and interactions
- **Coverage reporting**: Track tested vs untested hooks
- **Current coverage**: 134/134 hooks (100%) from runner discovery
- **Hook directory coverage**: opspal-core 59/59, opspal-salesforce 37/37, opspal-hubspot 12/12, opspal-marketo 20/20, opspal-gtm-planning 1/1, opspal-ai-consult 1/1, root 4/4

## Directory Structure

```
test/hooks/
├── README.md                    # This file
├── runner.js                    # Main test runner
├── reporter.js                  # Coverage reporter
├── fixtures/                    # Test fixtures
│   ├── tool-inputs/            # Sample tool input JSON
│   ├── hook-outputs/           # Expected hook outputs
│   └── mock-env/               # Mock environment variables
├── unit/                        # Unit tests
│   ├── pre-task-agent-validator.test.js
│   ├── unified-router.test.js
│   └── ...
├── integration/                 # Integration tests
│   ├── routing-chain.test.js
│   ├── validation-chain.test.js
│   └── ...
└── coverage/                    # Generated coverage reports
    └── hook-coverage.json
```

## Running Tests

```bash
# Run all hook tests
npm run test:hooks

# Run specific test file
npm run test:hooks -- --file pre-task-agent-validator.test.js

# Run with coverage
npm run test:hooks -- --coverage

# Run integration tests only
npm run test:hooks -- --integration

# Verbose output
npm run test:hooks -- --verbose
```

## Writing Tests

### Unit Test Template

```javascript
const { HookTester } = require('../runner');

describe('pre-task-agent-validator', () => {
  const tester = new HookTester('plugins/opspal-core/hooks/pre-task-agent-validator.sh');

  test('resolves short agent name to fully-qualified', async () => {
    const result = await tester.run({
      input: { subagent_type: 'sfdc-cpq-assessor', prompt: 'test' },
      env: { CLAUDE_PLUGIN_ROOT: '/path/to/plugin' }
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.subagent_type).toBe('opspal-salesforce:sfdc-cpq-assessor');
  });

  test('blocks command invoked as agent', async () => {
    const result = await tester.run({
      input: { subagent_type: 'reflect', prompt: 'test' }
    });

    expect(result.hookSpecificOutput?.additionalContext).toContain('ERROR');
    expect(result.hookSpecificOutput?.additionalContext).toContain('COMMAND');
  });
});
```

### Integration Test Template

```javascript
const { HookChainTester } = require('../runner');

describe('routing chain', () => {
  const chain = new HookChainTester([
    'plugins/opspal-core/hooks/unified-router.sh',
    'plugins/opspal-core/hooks/pre-task-agent-validator.sh'
  ]);

  test('routes and validates CPQ request', async () => {
    const result = await chain.run({
      userPrompt: 'Run a CPQ assessment for acme-corp',
      expectedAgent: 'opspal-salesforce:sfdc-cpq-assessor'
    });

    expect(result.finalAgent).toBe('opspal-salesforce:sfdc-cpq-assessor');
    expect(result.allPassed).toBe(true);
  });
});
```

## Priority Hooks for Testing

### P0 - Critical (Must Test First)

| Hook | Plugin | Reason |
|------|--------|--------|
| `pre-task-agent-validator.sh` | opspal-core | Core routing validation |
| `unified-router.sh` | opspal-core | Primary routing logic |
| `pre-tool-use-contract-validation.sh` | opspal-core | Tool safety |
| `pre-commit-config-validation.sh` | opspal-core | Config integrity |
| `pre-operation-data-validator.sh` | opspal-core | Data quality |

### P1 - High Priority

| Hook | Plugin | Reason |
|------|--------|--------|
| `pre-task-template-injector.sh` | opspal-core | Branding consistency |
| `post-tool-use-contract-validation.sh` | opspal-core | Output verification |
| `pre-task-routing-clarity.sh` | opspal-core | Routing clarity |
| `session-context-loader.sh` | opspal-core | Context initialization |
| `pre-plan-scope-validation.sh` | opspal-core | Scope validation |

### P2 - Medium Priority

| Hook | Plugin | Reason |
|------|--------|--------|
| `post-audit-bluf-generator.sh` | opspal-core | Executive summaries |
| `pre-task-field-dictionary-injector.sh` | opspal-core | Field context |
| `post-reflect-strategy-update.sh` | opspal-core | Learning system |
| Platform-specific hooks | All | Platform operations |

### Salesforce Hook Coverage (Complete)

- ✅ All opspal-salesforce hooks covered (37/37, including .claude-plugin hooks)

### HubSpot Hook Coverage (Complete)

- ✅ All opspal-hubspot hooks covered (12/12, including post-install)

### Marketo Hook Coverage (Complete)

- ✅ All opspal-marketo hooks covered (20/20)

### Core Hook Coverage (Complete)

- ✅ All opspal-core hooks covered (59/59, including .claude-plugin hooks)
- Next targets: optional expansion to non-hook scripts or additional integration tests

## Coverage Goals

| Phase | Target Coverage | Timeline |
|-------|-----------------|----------|
| Phase 1 | P0 hooks (5 hooks, 100%) | Week 1 |
| Phase 2 | P1 hooks (5 hooks, 100%) | Week 2 |
| Phase 3 | P2 hooks (10 hooks, 100%) | Week 3 |
| Phase 4 | Remaining hooks (118 hooks, 50%) | Week 4+ |

**Overall Target**: 80% hook coverage by end of Phase 4

**Current Coverage**: 134/134 hooks (100%) with opspal-core + opspal-salesforce + opspal-hubspot + opspal-marketo + opspal-gtm-planning + opspal-ai-consult + root hooks at 100%

## Test Categories

### 1. Input Validation Tests
- Valid input passes through
- Invalid JSON handled gracefully
- Missing required fields caught

### 2. Output Format Tests
- Exit codes are correct
- JSON output is valid
- hookSpecificOutput format correct

### 3. Error Handling Tests
- Missing dependencies handled
- Timeout behavior correct
- Fail-open vs fail-closed logic

### 4. Edge Cases
- Empty input
- Very large input
- Special characters
- Unicode content

### 5. Integration Tests
- Hook chain execution
- State passing between hooks
- Metrics logging integration

## CI/CD Integration

Tests run automatically on:
- Pull requests to main
- Commits to main
- Nightly full test suite

```yaml
# .github/workflows/hook-tests.yml
name: Hook Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:hooks -- --coverage
      - name: Upload coverage
        uses: actions/upload-artifact@v3
        with:
          name: hook-coverage
          path: dev-tools/developer-tools-plugin/test/hooks/coverage/
```

## Reporting

Coverage reports are generated in JSON and HTML formats:

```bash
# Generate coverage report
npm run test:hooks -- --coverage --report

# View HTML report
open dev-tools/developer-tools-plugin/test/hooks/coverage/index.html
```

Report includes:
- Total hooks discovered
- Hooks with tests
- Hooks without tests
- Pass/fail statistics
- Execution time metrics
