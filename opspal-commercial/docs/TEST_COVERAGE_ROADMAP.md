# Test Coverage Roadmap to 70%

This document outlines the phased approach to reaching 70%+ test coverage for the OpsPal Plugin Marketplace.

## Current State (2026-01-08)

| Metric | Current | Target |
|--------|---------|--------|
| Statements | 10.51% | 70% |
| Branches | 9.85% | 70% |
| Functions | 12.41% | 70% |
| Lines | 10.45% | 70% |

**Test Suite Status:**
- Total test suites: 181
- Passing: 142 (78%)
- Failing: 38 (21%)
- Skipped: 1

**Tests:**
- Total tests: 5,500
- Passing: 5,381 (97.8%)
- Failing: 117 (2.1%)
- Skipped: 2

## Phased Approach

### Phase 1: Foundation (Target: 15%)

**Goal:** Fix failing tests and establish baseline

**Actions:**
1. Fix 38 failing test suites
   - Timeout issues in flow-permission-escalator.test.js
   - Export issues in developer-tools-plugin tests
   - Empty test suite in test/utils.test.js

2. Fix function export issues in developer-tools-plugin:
   - generate-test-suite.test.js - main/name not exported
   - test-plugin-installation.test.js - search not exported
   - scaffold-plugin.test.js - question not exported
   - validate-plugin.test.js - findScripts not exported

3. Increase test timeouts for long-running tests

**Scripts to Prioritize:**
- `scripts/lib/detect-stub-agents.js` - NEW script, needs tests
- Core validation scripts
- Schema registry

### Phase 2: Core Coverage (Target: 35%)

**Goal:** Cover critical validation and query paths

**Plugins to Focus:**
1. **salesforce-plugin** (680 scripts)
   - Flow validators
   - Deployment managers
   - Query executors
   - Permission orchestrators

2. **opspal-core** (318 scripts)
   - Task graph engine
   - Validation framework
   - Web visualization

**Test Creation Strategy:**
- Create shared test utilities
- Mock MCP server responses
- Create test data fixtures

### Phase 3: Operations Coverage (Target: 50%)

**Goal:** Cover deployment and data operations

**Focus Areas:**
1. Deployment pipelines
2. Data import/export managers
3. Metadata operations
4. Batch processors

**Test Types:**
- Unit tests for pure functions
- Integration tests for pipelines
- Snapshot tests for outputs

### Phase 4: Full Coverage (Target: 70%)

**Goal:** Comprehensive coverage including edge cases

**Remaining Areas:**
1. Orchestration scripts
2. Integration handlers
3. Error recovery paths
4. Edge cases and boundary conditions

## Testing Infrastructure

### Test Utilities Location
```
test-utils/
├── mocks/
│   ├── mcp-responses.js    # Mock MCP tool responses
│   ├── salesforce-api.js   # Mock SF API responses
│   └── hubspot-api.js      # Mock HS API responses
├── fixtures/
│   ├── metadata/           # Sample metadata files
│   ├── flows/              # Sample Flow XML
│   └── records/            # Sample record data
└── helpers/
    ├── test-setup.js       # Common test setup
    ├── assertions.js       # Custom Jest assertions
    └── generators.js       # Test data generators
```

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run tests for specific plugin
npm run test:salesforce
npm run test:hubspot
npm run test:cross-platform

# Run tests in watch mode (development)
npm run test:watch

# Run CI-optimized tests
npm run test:ci

# Run coverage report
npm run test:coverage
```

### Coverage Reporting

Coverage reports are generated in:
- `coverage/` directory
- `coverage/lcov-report/index.html` - HTML report
- `coverage/lcov.info` - For CI integration

### CI/CD Integration

Add to `.github/workflows/validate-plugins.yml`:

```yaml
- name: Run Tests
  run: npm run test:ci

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true
    verbose: true
```

## Critical Scripts Requiring Tests

### Salesforce Plugin (Priority Order)

| Script | Priority | Current Tests |
|--------|----------|---------------|
| flow-deployment-manager.js | P0 | Yes |
| permission-set-orchestrator.js | P0 | Yes |
| metadata-deployment-validator.js | P0 | No |
| safe-query-executor.js | P0 | Partial |
| cpq-assessor-core.js | P1 | Yes |
| revops-auditor-core.js | P1 | Yes |
| automation-auditor-core.js | P1 | Partial |

### HubSpot Plugin (Priority Order)

| Script | Priority | Current Tests |
|--------|----------|---------------|
| uat-hubspot-adapter.js | P0 | Yes |
| workflow-validator.js | P0 | No |
| contact-dedup-engine.js | P1 | No |
| batch-processor.js | P1 | No |

### OpsPal Core (Priority Order)

| Script | Priority | Current Tests |
|--------|----------|---------------|
| task-graph-engine.js | P0 | No |
| validation-dashboard-generator.js | P0 | No |
| schema-registry.js | P1 | Partial |
| tool-contract-validator.js | P1 | No |

## Definition of Done

A script is considered adequately tested when:

1. **Unit Coverage**: ≥70% line coverage
2. **Branch Coverage**: ≥60% branch coverage
3. **Edge Cases**: Common error paths tested
4. **Integration**: Works with real MCP responses (in integration tests)
5. **Documentation**: Test file includes description of what's tested

## Tracking Progress

Update this document monthly with:
- Current coverage percentages
- Scripts newly covered
- Blockers and issues

### Progress Log

| Date | Statements | Branches | Functions | Lines | Notes |
|------|------------|----------|-----------|-------|-------|
| 2026-01-08 | 10.51% | 9.85% | 12.41% | 10.45% | Baseline |

---

**Last Updated:** 2026-01-08
**Owner:** RevPal Engineering
