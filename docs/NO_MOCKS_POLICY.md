# No-Mocks Policy Enforcement

## Overview

This repository enforces a strict **NO MOCKS** policy to ensure data integrity and trustworthiness. All data must come from real, authoritative sources. If data is unavailable or errors occur, the system must fail fast and report the issue clearly.

## Policy Statement

**ZERO TOLERANCE**: No mock, fake, stubbed, sampled, or placeholder data is permitted in production code or runtime execution.

### The Only Exception

- **Agent Name**: `mock-data-generator`
- **Scope**: This agent alone may generate mock data when explicitly invoked for test dataset creation
- **Usage**: Must never be imported or executed by any production/runtime script

## Enforcement Mechanisms

### 1. Runtime Guard (NO_MOCKS=1)

Set the environment variable to enable runtime enforcement:

```bash
export NO_MOCKS=1
```

The runtime guard will:
- Prevent loading of mock libraries (faker, nock, sinon, etc.)
- Block access to mock file paths (*/mock/*, */fixture/*, etc.)
- Exit with error if violations are detected

### 2. DataAccessError Class

All data access failures must throw a `DataAccessError`:

```javascript
const { DataAccessError } = require('./scripts/lib/data-access-error');

// When data cannot be accessed
throw new DataAccessError(
    'Salesforce',
    'Connection timeout',
    { endpoint: '/api/query', timeout: 5000 }
);
```

**Standard Error Message Format**:
```
DATA ACCESS FAILURE: <source> <reason>. No mock or fabricated data used.
```

### 3. Safe Query Executor

Use the `SafeQueryExecutor` for all queries:

```javascript
const SafeQueryExecutor = require('./scripts/lib/safe-query-executor');

const executor = new SafeQueryExecutor({
    enforceRealData: true  // Default: true
});

// Will throw DataAccessError if query fails
const result = await executor.executeQuery(soqlQuery);
```

### 4. CI Validation

Run validation in CI/CD pipelines:

```bash
# Full validation
npm run validate:no-mocks

# Quick check
npm run ci:full

# Install runtime guard
npm run guard:install
```

## Implementation Checklist

### ✅ Completed

- [x] DataAccessError class created
- [x] RuntimeMockGuard implemented
- [x] CI validation script added
- [x] SafeQueryExecutor updated
- [x] Mock data generator disabled
- [x] Package.json scripts added
- [x] Entry points protected

### 🚧 Required Actions

For any remaining mock usage:

1. **Remove Mock Libraries**
   ```bash
   npm uninstall --save faker chance casual msw nock sinon testdouble
   npm uninstall --save-dev nock  # Keep only in devDependencies if needed for tests
   ```

2. **Replace Mock Data Patterns**
   - Search for: `mock`, `fixture`, `fake`, `stub`, `sample`, `lorem`, `faker`
   - Replace with real data sources or explicit failures

3. **Update Data Access Code**
   ```javascript
   // ❌ BAD: Returning fake data on failure
   try {
       data = await fetchData();
   } catch (e) {
       data = { items: [] };  // Don't do this!
   }

   // ✅ GOOD: Fail fast with clear error
   try {
       data = await fetchData();
   } catch (e) {
       throw new DataAccessError('API', e.message, { endpoint });
   }
   ```

4. **Enable Runtime Guards**
   ```javascript
   // Add to entry points (first lines)
   const RuntimeMockGuard = require('./scripts/lib/runtime-mock-guard');
   const guard = new RuntimeMockGuard();
   guard.install();
   ```

## Monitoring & Detection

### Real-time Detection

The system monitors for:
- Generic naming patterns: `Lead 1`, `Opportunity 23`
- Round percentages: `15%`, `30%`, `45%`
- Fake Salesforce IDs: `00Q000000000000045`
- Common placeholders: `Example Corp`, `John Doe`, `Lorem Ipsum`

### Query Verification

All queries are logged with metadata:
```json
{
    "queryId": "q_1234567890_abcd",
    "dataSource": "MCP_SALESFORCE",
    "timestamp": "2025-09-22T10:00:00Z",
    "success": true,
    "recordCount": 42,
    "confidence": 0.99
}
```

### Data Source Labels

- ✅ **VERIFIED**: Live data from actual query
- ⚠️ **SIMULATED**: Explicitly requested example (only in mock-data-generator)
- ❌ **FAILED**: Query attempted but failed
- ❓ **UNKNOWN**: Source cannot be determined

## Compliance Enforcement

1. **First Violation**: Warning with education
2. **Second Violation**: Agent/script disabled pending fix
3. **Third Violation**: Complete rewrite required

## Quick Reference

### Environment Variables
```bash
NO_MOCKS=1                              # Enable strict enforcement
ALLOWED_MOCK_AGENT_NAME=mock-data-generator  # Override allowed agent name
```

### NPM Scripts
```bash
npm run validate:no-mocks   # Run full validation
npm run guard:install        # Install runtime guard
npm run ci:full             # Complete CI checks
```

### Import Statements
```javascript
const { DataAccessError, requireRealData } = require('./scripts/lib/data-access-error');
const RuntimeMockGuard = require('./scripts/lib/runtime-mock-guard');
const SafeQueryExecutor = require('./scripts/lib/safe-query-executor');
```

## Migration Guide

If you have existing code with mock data:

1. **Identify Mock Usage**
   ```bash
   bash scripts/ci/validate-no-mocks.sh
   ```

2. **Create Real Data Sources**
   - Use sandbox/staging environments
   - Query actual test systems
   - Use the designated mock-data-generator ONLY when necessary

3. **Update Error Handling**
   - Replace empty fallbacks with DataAccessError
   - Add proper error context
   - Log failures for observability

4. **Test with NO_MOCKS=1**
   ```bash
   NO_MOCKS=1 npm test
   NO_MOCKS=1 npm start
   ```

## Support

For questions or exceptions, contact the engineering team.

**Remember**: Real data = Real confidence. No shortcuts, no fabrication.

---

enforce(no-mocks): Policy enforced as of 2025-09-22