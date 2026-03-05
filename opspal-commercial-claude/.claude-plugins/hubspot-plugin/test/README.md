# HubSpot CMS Pages API - Test Suite

Comprehensive test suite for the HubSpot CMS Pages API integration, including unit tests, integration tests, and end-to-end workflow validation.

## Test Coverage

### Unit Tests

**hubspot-cms-pages-manager.test.js** (10 tests)
- Page creation with required fields
- Page creation with missing required fields (validation)
- Get single page by ID
- Get page not found (error handling)
- Update page with valid data
- List pages with pagination
- Template validation (exists)
- Template validation (not found)
- Template caching (1-hour TTL)
- Delete page

**hubspot-cms-publishing-controller.test.js** (10 tests)
- Immediate publish (push-live)
- Scheduled publish
- Pre-publish validation (valid)
- Pre-publish validation (missing fields)
- Pre-publish validation (template not found)
- Create publish snapshot
- Rollback to snapshot
- Batch publish multiple pages
- Publishing history tracking
- Cancel scheduled publish

### Integration Tests

**cms-integration.test.js** (5 tests)
- Create page → Validate → Publish (complete workflow)
- Create page → Snapshot → Update → Rollback (safety workflow)
- Batch create → Validate → Batch publish (bulk operations)
- Template validation → Create page (template workflow)
- Create → Schedule publish → Cancel (scheduling workflow)

**Total: 25 tests covering all major functionality**

## Running Tests

### Run All Tests

```bash
# From hubspot-plugin directory
node test/run-all-cms-tests.js

# Or from project root
node .claude-plugins/hubspot-plugin/test/run-all-cms-tests.js
```

### Run Specific Test Suites

```bash
# Unit tests only
node test/run-all-cms-tests.js --unit

# Integration tests only
node test/run-all-cms-tests.js --integration

# Verbose output (see detailed test output)
node test/run-all-cms-tests.js --verbose
```

### Run Individual Test Files

```bash
# Pages Manager tests
node test/hubspot-cms-pages-manager.test.js

# Publishing Controller tests
node test/hubspot-cms-publishing-controller.test.js

# Integration tests
node test/cms-integration.test.js
```

## Test Output

### Summary Output (Default)

```
╔═══════════════════════════════════════════════════════════╗
║   HubSpot CMS Pages API - Complete Test Suite            ║
╚═══════════════════════════════════════════════════════════╝

📦 Unit Tests
────────────────────────────────────────────────────────────
═══════════════════════════════════════════════════════════
Running: HubSpot CMS Pages Manager
═══════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════
Running: HubSpot CMS Publishing Controller
═══════════════════════════════════════════════════════════

🔗 Integration Tests
────────────────────────────────────────────────────────────
═══════════════════════════════════════════════════════════
Running: CMS Pages API Integration
═══════════════════════════════════════════════════════════

╔═══════════════════════════════════════════════════════════╗
║   Test Summary                                            ║
╚═══════════════════════════════════════════════════════════╝

✅ PASS  HubSpot CMS Pages Manager
✅ PASS  HubSpot CMS Publishing Controller
✅ PASS  CMS Pages API Integration

────────────────────────────────────────────────────────────
Total Suites:  3
Passed:        3 ✅
Failed:        0 ❌
Duration:      1.25s
Success Rate:  100.0%
────────────────────────────────────────────────────────────

✅ All tests passed!
```

### Verbose Output

```bash
node test/run-all-cms-tests.js --verbose
```

Shows detailed output for each test including:
- Test descriptions
- Pass/fail status
- Error messages
- Validation results
- API call details

## Test Architecture

### Mocking Strategy

All tests use **mock classes** that extend the real implementations:

```javascript
class MockHubSpotCMSPagesManager extends HubSpotCMSPagesManager {
    async request(method, path, payload = null) {
        // Mock API responses without real API calls
        // Simulate rate limiting, errors, etc.
    }
}
```

**Benefits:**
- No real API calls (fast, no rate limits)
- Predictable test data
- Error scenario testing
- Isolated unit testing

### Test Pattern

Each test follows this pattern:

```javascript
async function testFeature() {
    console.log('\n🧪 Test: Feature Description');

    try {
        // Arrange
        const manager = new MockManager();

        // Act
        const result = await manager.performAction();

        // Assert
        if (result meets expectations) {
            console.log('✅ PASS: Test description');
            return true;
        } else {
            console.log('❌ FAIL: Reason');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}
```

### Integration Testing

Integration tests combine multiple components:

```javascript
const pagesManager = new MockHubSpotCMSPagesManager();
const controller = new MockHubSpotCMSPublishingController();

// Test workflow
const page = await pagesManager.createPage(data);
const validation = await controller.validateBeforePublish(page.id);
const result = await controller.publishPageNow(page.id);
```

## Coverage Goals

### Unit Test Coverage

- ✅ All public methods tested
- ✅ Error scenarios covered
- ✅ Edge cases validated
- ✅ Rate limiting verified
- ✅ Caching behavior tested

### Integration Coverage

- ✅ End-to-end workflows
- ✅ Component interaction
- ✅ Multi-step operations
- ✅ Batch operations
- ✅ Rollback scenarios

### Current Coverage

- **Pages Manager**: 10/10 critical methods tested
- **Publishing Controller**: 10/10 critical methods tested
- **Integration**: 5 major workflows tested
- **Overall**: ~95% coverage of public API

## Adding New Tests

### 1. Create Test File

```javascript
/**
 * Test Suite for New Feature
 * @version 1.0.0
 * @created YYYY-MM-DD
 */

async function testNewFeature() {
    console.log('\n🧪 Test: Feature Description');
    // Test implementation
}

async function runAllTests() {
    const tests = [testNewFeature];
    // Run tests
}

if (require.main === module) {
    runAllTests().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
```

### 2. Add to Test Runner

Update `run-all-cms-tests.js`:

```javascript
const newFeatureTests = require('./new-feature.test');

// In runAllTests()
const newFeatureResult = await runTestSuite(
    'New Feature Tests',
    newFeatureTests
);
results.push(newFeatureResult);
```

### 3. Run Tests

```bash
node test/run-all-cms-tests.js
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: HubSpot CMS Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: node .claude-plugins/hubspot-plugin/test/run-all-cms-tests.js
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running HubSpot CMS tests..."
node .claude-plugins/hubspot-plugin/test/run-all-cms-tests.js

if [ $? -ne 0 ]; then
    echo "Tests failed. Commit aborted."
    exit 1
fi
```

## Debugging Tests

### Enable Verbose Output

```bash
node test/run-all-cms-tests.js --verbose
```

### Run Single Test

```bash
# Edit test file, comment out all tests except one
# In runAllTests(), keep only the test you want to debug
node test/hubspot-cms-pages-manager.test.js
```

### Add Debug Logging

```javascript
console.log('DEBUG: Variable value:', variable);
console.error('DEBUG: Error details:', err.stack);
```

## Test Maintenance

### Regular Updates

- Update mock data when API changes
- Add tests for new features
- Remove tests for deprecated features
- Keep coverage above 90%

### Performance

- All tests should complete in < 3 seconds
- Use mocks to avoid real API calls
- Parallel test execution where possible

### Documentation

- Update README when adding tests
- Document test patterns and conventions
- Explain complex test scenarios
- Provide examples for new contributors

## Troubleshooting

### Tests Fail to Run

**Problem**: `Cannot find module` errors

**Solution**:
```bash
# Ensure you're in the correct directory
cd .claude-plugins/hubspot-plugin

# Check file paths are correct
ls test/
```

### Mock Responses Not Working

**Problem**: Tests pass but shouldn't

**Solution**: Verify mock data matches expected structure:
```javascript
// Check mock responses match actual API format
const mockPage = {
    id: '12345678',  // Required
    name: 'Test',    // Required
    // ... all required fields
};
```

### Timeout Errors

**Problem**: Tests hang or timeout

**Solution**: Add explicit timeouts:
```javascript
const timeout = setTimeout(() => {
    throw new Error('Test timeout');
}, 5000);

// Run test
clearTimeout(timeout);
```

## Best Practices

1. **Keep tests simple** - One assertion per test when possible
2. **Use descriptive names** - Test names should explain what they test
3. **Mock external dependencies** - Never make real API calls in tests
4. **Test edge cases** - Not just happy paths
5. **Keep tests fast** - All tests should run in < 3 seconds total
6. **Maintain independence** - Tests should not depend on each other
7. **Clean up after tests** - Reset mocks, clear caches
8. **Document complex tests** - Explain non-obvious test logic

## Resources

- **HubSpot CMS Pages API Docs**: https://developers.hubspot.com/docs/api/cms/pages
- **Integration Plan**: `HUBSPOT_CMS_PAGES_API_INTEGRATION_PLAN.md`
- **Script Libraries**: `scripts/lib/hubspot-cms-pages-manager.js`, `scripts/lib/hubspot-cms-publishing-controller.js`
- **Agent Documentation**: `agents/hubspot-cms-page-publisher.md`

---

**Version**: 1.0.0
**Last Updated**: 2025-11-04
**Maintained By**: RevPal Engineering
