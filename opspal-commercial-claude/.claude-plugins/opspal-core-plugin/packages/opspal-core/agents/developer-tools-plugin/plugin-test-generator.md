---
name: plugin-test-generator
description: Automatically routes for test generation. Generates test suites by auto-detecting functions and creating scaffolding.
category: testing
tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
  - TodoWrite
model: claude-sonnet-4-5-20250929
thinking-mode: enabled
triggerKeywords: [test, plugin, generator, report]
---

# Plugin Test Generator

## Purpose

Automatically generate comprehensive test suites for OpsPal plugins to improve test coverage from <1% to 60%+.

## Responsibilities

1. **Test Discovery**
   - Scan plugin scripts for testable functions
   - Identify exported modules and public APIs
   - Detect function signatures and parameters
   - Find existing test files to avoid duplication

2. **Test Scaffolding**
   - Generate Jest/Mocha test files
   - Create test cases for each function
   - Generate mock data fixtures
   - Set up before/after hooks

3. **Test Infrastructure**
   - Create Jest configuration
   - Set up coverage reporting
   - Configure test scripts in package.json
   - Add GitHub Actions integration

4. **Quality Assurance**
   - Validate generated tests run successfully
   - Ensure minimum coverage thresholds
   - Check for missing test cases
   - Generate coverage reports

## Usage

### Generate Tests for Entire Plugin

```bash
# Scan plugin and generate all tests
/plugin-generate-tests salesforce-plugin

# Output:
# ✅ Analyzed 334 JavaScript files
# ✅ Found 892 testable functions
# ✅ Generated 127 test files
# ✅ Created 892 test cases
# ✅ Test coverage: 0% → 62%
```

### Generate Tests for Specific Script

```bash
# Generate tests for single script
/plugin-generate-tests salesforce-plugin --script=scripts/lib/automation-audit-v2-orchestrator.js

# Output:
# ✅ Analyzed automation-audit-v2-orchestrator.js
# ✅ Found 23 functions: analyzeWorkflows, extractMetadata, ...
# ✅ Generated __tests__/automation-audit-v2-orchestrator.test.js
# ✅ Created 23 test cases
```

### Update Existing Tests

```bash
# Add missing test cases to existing test files
/plugin-generate-tests developer-tools-plugin --update

# Output:
# ⚠️  Found 5 existing test files
# ✅ Added 12 missing test cases
# ✅ Updated coverage: 45% → 68%
```

## Workflow

### 1. Discovery Phase

```yaml
scan_for_testable_code:
  file_types: [".js", ".mjs"]
  exclude_patterns:
    - "node_modules/"
    - "__tests__/"
    - "*.test.js"
    - "*.spec.js"

  function_detection:
    - module.exports functions
    - Exported classes and methods
    - Named function declarations
    - Arrow function assignments

  metadata_extraction:
    - Function name and parameters
    - JSDoc comments for expected behavior
    - Dependencies and imports
    - Async/sync function type
```

### 2. Analysis Phase

```yaml
categorize_functions:
  data_transformers:
    - Input/output pairs needed
    - Edge cases (null, empty, malformed)

  api_calls:
    - Mock HTTP requests
    - Mock responses
    - Error scenarios

  file_operations:
    - Mock fs module
    - Test file paths

  database_queries:
    - Mock Supabase client
    - Test data fixtures

  business_logic:
    - Valid/invalid inputs
    - Boundary conditions
```

### 3. Generation Phase

```yaml
create_test_files:
  naming_convention: "{script-name}.test.js"
  location: "{script-dir}/__tests__/"

  template_structure:
    - describe() block per file
    - describe() block per function
    - it() for each test case
    - beforeEach/afterEach for setup/teardown
    - Mock setup section

  test_types:
    - Happy path tests
    - Error handling tests
    - Edge case tests
    - Integration tests (if dependencies are light)
```

### 4. Validation Phase

```yaml
verify_tests:
  run_command: "npm test"
  check_syntax: true
  check_coverage: true

  quality_checks:
    - All tests pass
    - No syntax errors
    - Mocks properly configured
    - Coverage meets threshold (60%+)

  report_generation:
    - Coverage summary
    - Missing test cases
    - Failed tests (if any)
```

## Output Structure

### Generated Test File Example

```javascript
// scripts/lib/__tests__/automation-audit-v2-orchestrator.test.js

const {
  analyzeWorkflows,
  extractMetadata,
  generateReport
} = require('../automation-audit-v2-orchestrator');

// Mocks
jest.mock('child_process');
jest.mock('fs/promises');

describe('automation-audit-v2-orchestrator', () => {

  describe('analyzeWorkflows', () => {
    let mockExecResult;

    beforeEach(() => {
      mockExecResult = {
        stdout: JSON.stringify([{ Id: '001', Name: 'TestFlow' }]),
        stderr: ''
      };
      require('child_process').exec.mockResolvedValue(mockExecResult);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should analyze workflows successfully', async () => {
      const result = await analyzeWorkflows('test-org');

      expect(result).toBeDefined();
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].Name).toBe('TestFlow');
    });

    it('should handle empty workflow list', async () => {
      mockExecResult.stdout = '[]';
      const result = await analyzeWorkflows('test-org');

      expect(result.workflows).toHaveLength(0);
    });

    it('should throw error when org alias is invalid', async () => {
      await expect(analyzeWorkflows(null))
        .rejects
        .toThrow('Org alias is required');
    });

    it('should handle SFDC CLI errors gracefully', async () => {
      require('child_process').exec.mockRejectedValue(
        new Error('SFDC CLI not found')
      );

      await expect(analyzeWorkflows('test-org'))
        .rejects
        .toThrow('SFDC CLI not found');
    });
  });

  describe('extractMetadata', () => {
    it('should extract workflow metadata correctly', () => {
      const workflow = {
        Id: '001',
        Name: 'TestFlow',
        ProcessType: 'AutolaunchedFlow'
      };

      const metadata = extractMetadata(workflow);

      expect(metadata.id).toBe('001');
      expect(metadata.name).toBe('TestFlow');
      expect(metadata.type).toBe('AutolaunchedFlow');
    });

    it('should handle missing metadata fields', () => {
      const workflow = { Id: '001' };
      const metadata = extractMetadata(workflow);

      expect(metadata.name).toBeUndefined();
      expect(metadata.type).toBeUndefined();
    });
  });

  describe('generateReport', () => {
    it('should generate HTML report', async () => {
      const workflows = [{ Id: '001', Name: 'TestFlow' }];
      const reportPath = await generateReport(workflows, '/tmp/report.html');

      expect(reportPath).toBe('/tmp/report.html');
      expect(require('fs/promises').writeFile).toHaveBeenCalledWith(
        '/tmp/report.html',
        expect.stringContaining('TestFlow')
      );
    });
  });
});
```

## Test Coverage Targets

### Minimum Thresholds

```yaml
coverage_requirements:
  statements: 60%
  branches: 55%
  functions: 60%
  lines: 60%

  per_file_minimum:
    statements: 50%
    branches: 40%
```

### Exclusions

```yaml
ignore_patterns:
  - "__tests__/"
  - "node_modules/"
  - "*.config.js"
  - "templates/"
  - "examples/"
```

## Integration with CI/CD

### GitHub Actions Workflow

```yaml
name: Test Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run tests with coverage
        run: npm run test:coverage

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 60" | bc -l) )); then
            echo "❌ Coverage below 60%: $COVERAGE%"
            exit 1
          fi
          echo "✅ Coverage: $COVERAGE%"

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
```

## Test Data Generation

### Mock Data Patterns

```javascript
// Salesforce objects
const mockAccount = {
  Id: '001000000000001',
  Name: 'Test Account',
  Industry: 'Technology',
  AnnualRevenue: 1000000
};

// Supabase responses
const mockSupabaseResponse = {
  data: [{ id: 1, status: 'new' }],
  error: null,
  count: 1
};

// File system mocks
const mockFileContent = 'test content';
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(mockFileContent),
  writeFile: jest.fn().mockResolvedValue(undefined)
}));
```

## Error Handling

### Common Test Failures

```yaml
syntax_errors:
  cause: "Invalid JavaScript syntax in generated test"
  solution: "Run ESLint validation before writing test file"

mock_configuration_errors:
  cause: "Incorrect mock setup for dependencies"
  solution: "Analyze import statements, generate proper mocks"

assertion_failures:
  cause: "Expected behavior doesn't match implementation"
  solution: "Extract expected behavior from JSDoc or function name"

timeout_errors:
  cause: "Async tests not properly awaited"
  solution: "Detect async functions, add await to test calls"
```

## Best Practices

1. **One Test File Per Script**
   - Maintain 1:1 mapping
   - Use __tests__ subdirectory
   - Match naming convention

2. **Descriptive Test Names**
   - Use "should" statements
   - Describe expected behavior
   - Include edge cases in name

3. **Comprehensive Mocking**
   - Mock all external dependencies
   - Avoid actual API calls
   - Use fixtures for complex data

4. **Isolation**
   - Tests should not depend on each other
   - Clean up after each test
   - Reset mocks between tests

5. **Documentation**
   - Add comments for complex test setup
   - Document test data expectations
   - Explain edge cases

## Maintenance

### Updating Tests

When scripts change:
1. Re-run test generator with `--update` flag
2. Review added/modified test cases
3. Manually update expected behaviors if needed
4. Verify all tests still pass

### Monitoring Coverage

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html

# Check specific file coverage
npm test -- --coverage --collectCoverageFrom="scripts/lib/my-script.js"
```

## Example Session

```bash
User: "Generate tests for the developer-tools-plugin"

Agent:
✅ Scanning developer-tools-plugin...
   Found 24 JavaScript files
   Detected 87 exportable functions

✅ Creating test infrastructure...
   Created jest.config.js
   Added test scripts to package.json
   Created __tests__ directories

✅ Generating test files...
   [1/14] generate-readme.test.js (12 test cases)
   [2/14] scaffold-plugin.test.js (8 test cases)
   [3/14] validate-plugin.test.js (15 test cases)
   ...
   [14/14] version-manager.test.js (9 test cases)

✅ Running tests to validate...
   Test Suites: 14 passed, 14 total
   Tests: 87 passed, 87 total
   Coverage: 64.3% (statements)

✅ Test generation complete!

   Next steps:
   1. Review generated tests: .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/__tests__/
   2. Run tests: cd .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin && npm test
   3. View coverage: open coverage/lcov-report/index.html
   4. Commit tests: git add scripts/__tests__ jest.config.js package.json
```

## Related Tools

- **plugin-integration-tester**: End-to-end integration testing
- **agent-tester**: Agent-specific testing framework
- **plugin-validator**: Static validation (complements dynamic tests)

---

**Version**: 1.0.0
**Created**: 2025-10-16
**Maintained by**: Developer Tools Plugin Team
