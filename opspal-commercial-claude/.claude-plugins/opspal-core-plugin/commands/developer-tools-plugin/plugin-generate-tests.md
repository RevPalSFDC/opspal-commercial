---
description: Generate comprehensive test suites for plugins with auto-detection of testable functions and Jest scaffolding
allowed-tools: Read, Write, Grep, Glob, Bash, TodoWrite
model: claude-sonnet-4-5-20250929
thinking-mode: enabled
---

# Generate Plugin Test Suite

Automatically generate comprehensive test suites for OpsPal plugins to improve test coverage from <1% to 60%+.

## How It Works

This command will:
1. **Scan** all JavaScript files in the plugin for testable functions
2. **Analyze** function signatures, parameters, and async/sync patterns
3. **Generate** Jest test files with comprehensive test cases
4. **Create** test infrastructure (jest.config.js, package.json scripts)
5. **Validate** that generated tests run successfully

## Usage

### Generate Tests for Entire Plugin

```
User: "/plugin-generate-tests salesforce-plugin"

Agent will:
✅ Scan 334 JavaScript files
✅ Detect 892 testable functions
✅ Generate 127 test files in __tests__ directories
✅ Create 892 test cases (happy path, errors, edge cases)
✅ Set up Jest configuration
✅ Validate all tests pass
✅ Report: Test coverage 0% → 62%
```

### Generate Tests for Specific Script

```
User: "/plugin-generate-tests developer-tools-plugin --script=scripts/validate-plugin.js"

Agent will:
✅ Analyze validate-plugin.js
✅ Find 15 functions (validateManifest, checkStructure, etc.)
✅ Generate __tests__/validate-plugin.test.js
✅ Create 15 test cases with mocks
```

### Update Existing Tests

```
User: "/plugin-generate-tests hubspot-plugin --update"

Agent will:
⚠️  Find 12 existing test files
✅ Detect 45 new functions not yet tested
✅ Add missing test cases to existing files
✅ Update coverage: 23% → 67%
```

## Options

- `--script=<path>` - Generate tests for specific script only
- `--update` - Add missing test cases to existing test files
- `--dry-run` - Preview what would be generated without writing files
- `--verbose` - Show detailed output including analysis details

## What Gets Generated

### Test File Structure

For each script file (e.g., `scripts/lib/my-script.js`), generates:

```javascript
// scripts/lib/__tests__/my-script.test.js

const { myFunction, anotherFunction } = require('../my-script');

// Auto-detected mocks based on dependencies
jest.mock('fs/promises');
jest.mock('child_process');

describe('my-script', () => {
  describe('myFunction', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should my function correctly', async () => {
      // Arrange
      const expected = {};

      // Act
      const result = await myFunction(param1, param2);

      // Assert
      expect(result).toBeDefined();
      // TODO: Add specific assertions
    });

    it('should handle error cases', async () => {
      await expect(() => myFunction(/* invalid */)).toThrow();
    });
  });
});
```

### Test Infrastructure

Creates/updates:
- `jest.config.js` - Jest configuration with coverage thresholds
- `package.json` - Test scripts (test, test:coverage, test:watch)
- `__tests__/` directories - Organized test file structure

## Test Coverage Targets

The generated tests target:
- **60%** statement coverage
- **55%** branch coverage
- **60%** function coverage
- **60%** line coverage

## Example Session

```
User: "Generate tests for the developer-tools-plugin to get us to 60% coverage"

Agent:
🔍 Scanning developer-tools-plugin...
   Found 24 JavaScript files

   Detected 87 testable functions

📝 Generating test files...
   ✅ Generated validate-plugin.test.js (15 tests)
   ✅ Generated scaffold-plugin.test.js (8 tests)
   ✅ Generated generate-readme.test.js (12 tests)
   ...
   ✅ Generated version-manager.test.js (9 tests)

🔧 Setting up test infrastructure...
   ✅ Created jest.config.js
   ✅ Updated package.json with test scripts

🧪 Validating generated tests...
   📦 Installing Jest...
   ✅ All generated tests validated successfully

============================================================
✅ Test Generation Complete!

   Files scanned:        24
   Functions found:      87
   Test files created:   14
   Test cases generated: 87

============================================================

📋 Next steps:

   1. Review generated tests: .claude-plugins/developer-tools-plugin/scripts/__tests__/
   2. Run tests: cd .claude-plugins/developer-tools-plugin && npm test
   3. View coverage: npm run test:coverage
   4. Open coverage report: open coverage/lcov-report/index.html

User: "Great! Now run the tests to verify they all pass"

Agent runs: cd .claude-plugins/developer-tools-plugin && npm test

Test Suites: 14 passed, 14 total
Tests:       87 passed, 87 total
Coverage:    64.3% statements, 58.2% branches, 62.1% functions, 64.1% lines

✅ All tests pass! Coverage target achieved (60%+)
```

## Integration with CI/CD

After generating tests, the GitHub Actions workflow will automatically:
1. Run tests on every push
2. Check coverage meets 60% threshold
3. Upload coverage reports
4. Block PRs that reduce coverage

## Manual Test Improvement

Generated tests include TODO comments for you to:
1. **Add specific assertions** - Replace generic checks with expected values
2. **Add edge cases** - Test boundary conditions, null, empty inputs
3. **Improve mocks** - Configure mocks to match real behavior
4. **Add integration tests** - For complex multi-function workflows

## Best Practices

1. **Review Generated Tests** - Auto-generated tests are a starting point
2. **Run Tests Locally** - Verify all pass before committing
3. **Maintain Coverage** - Don't let coverage drop below 60%
4. **Update Tests with Code** - Re-run with --update when adding functions

## Troubleshooting

**"Some tests failing after generation"**
- Generated tests may need manual adjustments for complex logic
- Review TODO comments in test files
- Configure mocks to match dependencies

**"Coverage below 60%"**
- Re-run with --update to catch new functions
- Review excluded files in jest.config.js
- Add missing assertions to TODO sections

**"Jest not installed"**
- Run: `cd .claude-plugins/<plugin> && npm install`
- The generator adds jest to devDependencies

## Related Commands

- `/plugin-test` - Run integration tests for plugin installation
- `/plugin-validate` - Validate plugin structure and manifests

---

**Agent**: plugin-test-generator
**Script**: scripts/generate-test-suite.js
**Version**: 1.0.0
