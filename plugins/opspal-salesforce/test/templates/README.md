# Test Templates

This directory contains reusable test templates for critical scripts and hooks in the salesforce-plugin.

## Available Templates

### 1. `critical-script.test.template.js`

**Purpose**: Unit testing JavaScript/Node.js scripts

**Use for**:
- Script libraries (`scripts/lib/*.js`)
- Data processors
- Validators
- Utility functions

**Features**:
- BDD-style `describe`/`it` structure
- Mock utilities for dependencies
- Fixtures for test data
- Test categories: Constructor, Core Functionality, Edge Cases, Error Handling, Input Validation, Performance

**Usage**:
```bash
# Copy template
cp test/templates/critical-script.test.template.js test/my-script.test.js

# Replace placeholders
# - [SCRIPT_NAME]: Name of the script
# - [SCRIPT_PATH]: Path to the script (e.g., '../scripts/lib/my-script')
# - [DESCRIPTION]: Brief description
# - [DATE]: Current date

# Edit test file to add actual tests
code test/my-script.test.js

# Run tests
node test/my-script.test.js
```

### 2. `hook.test.template.sh`

**Purpose**: Testing bash hooks

**Use for**:
- UserPromptSubmit hooks
- Pre-command validation hooks
- Post-operation observation hooks
- Error handler integration testing

**Features**:
- Pre-flight checks (existence, executability, syntax)
- Test utilities (assert_equals, assert_contains, assert_exit_code)
- Standard test cases: basic execution, empty input, special characters, timeout, concurrent execution
- Debug mode support

**Usage**:
```bash
# Copy template
cp test/templates/hook.test.template.sh test/my-hook.test.sh

# Replace placeholders
# - [HOOK_NAME]: Name of the hook
# - [HOOK_PATH]: Path to the hook script
# - [DESCRIPTION]: Brief description
# - [DATE]: Current date

# Make executable
chmod +x test/my-hook.test.sh

# Run tests
bash test/my-hook.test.sh

# Run with debug output
DEBUG=1 bash test/my-hook.test.sh
```

## Test Categories

### Critical Scripts (Must Have Tests)

The following scripts are considered critical and should have comprehensive tests:

| Script | Status | Test File |
|--------|--------|-----------|
| `task-router.js` | ⚠️ Needs tests | - |
| `complexity-scorer.js` | ⚠️ Needs tests | - |
| `merge-executor.js` | ✅ Has tests | `merge-executor.test.js` |
| `deployment-source-validator.js` | ⚠️ Needs tests | - |
| `query-lint.js` | ⚠️ Needs tests | - |
| `error-handler.sh` | ⚠️ Needs tests | - |

### Critical Hooks (Must Have Tests)

| Hook | Status | Test File |
|------|--------|-----------|
| `user-prompt-router.sh` | ⚠️ Needs tests | - |
| `agent-usage-validator.sh` | ⚠️ Needs tests | - |
| `pre-sf-command-validation.sh` | ⚠️ Needs tests | - |
| `pre-deployment-validation.sh` | ⚠️ Needs tests | - |

## Test Requirements

### Minimum Coverage

Each critical script/hook should have tests covering:

1. **Happy Path**: Normal operation with valid input
2. **Edge Cases**: Empty input, null values, large datasets
3. **Error Handling**: Invalid input, network failures, timeouts
4. **Security**: Input sanitization, injection prevention

### Test Naming Convention

```
<script-name>.<category>.test.js
<hook-name>.test.sh
```

Examples:
- `task-router.unit.test.js`
- `merge-executor.integration.test.js`
- `user-prompt-router.test.sh`

### Running Tests

```bash
# Run all tests in this plugin
npm test

# Run specific test file
node test/my-script.test.js

# Run hook tests
bash test/my-hook.test.sh

# Run with coverage (if configured)
npm run test:coverage
```

## Contributing

When adding new critical scripts or hooks:

1. Copy the appropriate template
2. Replace all placeholders
3. Add actual test cases (don't leave placeholder assertions)
4. Update the status table above
5. Ensure tests pass before committing

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Services**: Don't make real API calls in unit tests
3. **Fast Tests**: Unit tests should run in < 100ms each
4. **Descriptive Names**: Test names should describe the behavior being tested
5. **Assert One Thing**: Each test should have a single assertion focus
6. **Clean Up**: Tests should not leave artifacts (temp files, env changes)

## Related Documentation

- [Error Handler Library](../../hooks/lib/error-handler.sh)
- [Hook Testing Guide](../../../TESTING_HOOKS.md)
- [Quality Standards](../../../docs/QUALITY_STANDARDS.md)
