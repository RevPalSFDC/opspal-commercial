# HubSpot Agent Standards

**Version:** 2.0.0
**Created:** 2025-10-19
**Plugin:** hubspot-core-plugin
**Status:** ✅ Mandatory for All Agents

---

## Overview

This document defines **mandatory standards** for all HubSpot agents in the hubspot-core-plugin ecosystem. These standards ensure consistency, performance, safety, and maintainability across all agent operations.

**All agents MUST follow these standards without exception.**

---

## 1. MANDATORY: Bulk Operations Best Practices

**ALL agents performing data operations MUST follow:**

@import ../../docs/BULK_OPERATIONS_PLAYBOOK.md

### Pre-Script Checklist

Before generating ANY HubSpot data operation code, agents MUST verify:

1. ✅ **Can this use batch endpoints?** (v3/objects/{type}/batch/*)
   - If >10 records → REQUIRED to use batch
   - Never use sequential loops for batch-eligible operations

2. ✅ **Is dataset >10k records?** → Use Imports API
   - ALWAYS use `scripts/lib/imports-api-wrapper.js`
   - Never use batch create for large datasets

3. ✅ **Are there sequential loops?** → Parallelize
   - Look for: `for (const x of xs) { await ... }`
   - Refactor to use batch wrappers with `maxConcurrent`

4. ✅ **Using associations?** → Use v4 batch associations
   - NEVER use v3 associations API
   - ALWAYS use `scripts/lib/batch-associations-v4.js`

5. ✅ **Doing upserts?** → Use batch/upsert endpoint
   - Never implement check-then-create patterns
   - ALWAYS use `scripts/lib/batch-upsert-helper.js`

### Decision Tree for Data Operations

```
Record Count?
├─ <10 records → Single/batch API (either acceptable)
├─ 10-10k records → REQUIRED: Batch endpoints (100/call) + parallelize (10 concurrent)
└─ >10k records → REQUIRED: Imports API (async, 80M rows/day capacity)

Operation Type?
├─ Create → batch-update-wrapper.js (batchCreate)
├─ Update → batch-update-wrapper.js (batchUpdate)
├─ Upsert → batch-upsert-helper.js
├─ Delete → batch-update-wrapper.js (batchDelete) + BACKUP
├─ Associations → batch-associations-v4.js
└─ Import → imports-api-wrapper.js
```

### Mandatory Library Usage

| Scenario | Required Library | Rationale |
|----------|-----------------|-----------|
| Update >10 records | `batch-update-wrapper.js` | 10-100x faster than sequential |
| Create/update uncertainty | `batch-upsert-helper.js` | Eliminates check-then-create (2x calls) |
| Any associations | `batch-associations-v4.js` | v4 batch (100x faster than v3 sequential) |
| Import >10k records | `imports-api-wrapper.js` | Only way to handle large datasets |
| Property metadata | `batch-property-metadata.js` | Eliminates N+1 patterns (70-90% improvement) |

---

## 2. MANDATORY: API Safeguard Pre-Flight Validation

**ALWAYS validate payloads BEFORE API calls** to prevent HubSpot API errors.

Reference documentation: @import ../../docs/HUBSPOT_API_LIMITATIONS.md

### Required Validation Steps

```javascript
const validator = require('../scripts/lib/hubspot-api-validator');
const safeDelete = require('../scripts/lib/safe-delete-wrapper');

// 1. Validate bulk operations before execution
const bulkOp = {
  action: 'DELETE',
  count: recordIds.length,
  backup: './.hubspot-backups/records.json',
  validated: true
};
const bulkResult = validator.validateBulkOperation(bulkOp);
if (!bulkResult.valid) {
  throw new Error(`Bulk operation validation failed: ${bulkResult.errors.join(', ')}`);
}

// 2. Use safe-delete-wrapper for ALL delete operations
const deleteResult = await safeDelete.deleteWithSafety(
  objectType,
  recordIds,
  {
    backupDir: './.hubspot-backups',
    reason: 'data-cleanup',
    confirmed: false,  // Requires user confirmation
    deletedBy: userEmail
  }
);

// 3. Log validation results
validator.logValidation('Data Operation', result);
```

### Critical Rules

1. **NEVER use raw `.archive()` or `.delete()`** - Always use safe-delete-wrapper
2. **ALWAYS validate before API calls** - Pre-flight validation is mandatory
3. **ALWAYS create backups** - Delete operations require backups
4. **ALWAYS log validation results** - Use validator.logValidation()

---

## 3. MANDATORY: HubSpotClientV3 Implementation

**ALL agents MUST use the HubSpotClientV3 wrapper** for consistency, rate limiting, and error handling.

### Why HubSpotClientV3?

- ✅ Automatic rate limit handling (100 req/10s)
- ✅ Exponential backoff on 429 errors
- ✅ Complete pagination support (getAll methods)
- ✅ Retry logic for transient failures
- ✅ Consistent error handling
- ✅ Request/response logging

### Required Initialization

```javascript
const HubSpotClientV3 = require('../lib/hubspot-client-v3');

const client = new HubSpotClientV3({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID
});
```

### Critical Requirements

1. **ALWAYS use HubSpotClientV3** for ALL HubSpot API operations
2. **NEVER use deprecated v1/v2 endpoints**
3. **ALWAYS implement complete pagination** using getAll() methods
4. **ALWAYS respect rate limits** (automatic with HubSpotClientV3)
5. **NEVER generate fake data** - fail fast if API unavailable

### Memory-Efficient Patterns for Large Datasets

```javascript
// ❌ BAD: Load all records into memory
const allContacts = await client.getAllContacts(); // OOM on large datasets!

// ✅ GOOD: Use generator pattern for streaming
async function* exportLargeDataset(objectType) {
  let after = undefined;
  while (true) {
    const page = await client.get(`/crm/v3/objects/${objectType}`, {
      limit: 100,
      after
    });
    yield page.results;
    if (!page.paging?.next?.after) break;
    after = page.paging.next.after;
  }
}

// Process in chunks without loading all into memory
for await (const batch of exportLargeDataset('contacts')) {
  processBatch(batch); // Process 100 at a time
}
```

---

## 4. MANDATORY: Pagination Standards

### Pagination Settings

All search/query operations MUST use these settings:

```javascript
const PAGINATION_CONFIG = {
  page_size: 100,              // HubSpot maximum
  max_total_records: 10000,    // Safety limit for search API
  rate_limit_delay: 100,       // ms between pages
  retry_on_rate_limit: true,   // Exponential backoff
  always_paginate: true        // NEVER assume single page
};
```

### Critical Rules

1. **NEVER assume all results fit in one page**
   - ALWAYS check `paging.next.after` and loop until undefined

2. **NEVER use small page sizes (<100)**
   - Always use maximum (100) to minimize API calls

3. **For datasets >10k records**
   - Use Exports API (not Search API - has 10k limit)
   - OR use streaming generator pattern

### Example: Complete Pagination

```javascript
async function getAllRecordsComplete(objectType, filters = {}) {
  const allRecords = [];
  let after = undefined;

  while (true) {
    const response = await client.post(`/crm/v3/objects/${objectType}/search`, {
      filterGroups: filters.filterGroups || [],
      properties: filters.properties || [],
      limit: 100,
      after
    });

    allRecords.push(...response.results);

    // CRITICAL: Check for next page
    if (!response.paging?.next?.after) {
      break; // No more pages
    }

    after = response.paging.next.after;

    // Safety check: Search API has 10k limit
    if (allRecords.length >= 10000) {
      console.warn('⚠️  Reached Search API 10k limit. Use Exports API for larger datasets.');
      break;
    }

    // Rate limiting between pages
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return allRecords;
}
```

---

## 5. MANDATORY: Error Handling Standards

### Required Error Handling Pattern

```javascript
try {
  const result = await hubspotOperation();

  // Validate result
  if (!result.success) {
    throw new Error(`Operation failed: ${result.error}`);
  }

  return result;

} catch (error) {
  // 1. Log error with context
  console.error(`HubSpot operation failed:`, {
    operation: 'updateContacts',
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });

  // 2. Handle specific error types
  if (error.statusCode === 429) {
    console.warn('⚠️  Rate limit hit - operation will auto-retry');
    // HubSpotClientV3 handles this automatically
  }

  if (error.statusCode === 400) {
    console.error('❌ Validation error - check payload:', error.body);
  }

  // 3. NEVER swallow errors - re-throw or return error object
  throw error; // OR return { success: false, error: error.message }
}
```

### Error Types to Handle

| Status Code | Error Type | Action |
|-------------|-----------|--------|
| 400 | Validation Error | Log payload, throw error |
| 401 | Authentication Error | Refresh token, retry once |
| 429 | Rate Limit | Exponential backoff (automatic) |
| 500-599 | Server Error | Retry with backoff |
| Network Error | Timeout/DNS | Retry with backoff |

---

## 6. MANDATORY: Data Integrity & Safety

### No-Mocks Policy

**ZERO TOLERANCE**: All data MUST come from real, authoritative sources.

```javascript
// ❌ PROHIBITED: Fake/mock data
const fakeContacts = [
  { email: 'john.doe@example.com', name: 'John Doe' }
];

// ✅ REQUIRED: Real data from HubSpot API
const realContacts = await client.get('/crm/v3/objects/contacts');
```

**Enforcement:**
- All data operations MUST include query execution evidence
- NEVER generate synthetic data without explicit "SIMULATED DATA" labeling
- ALWAYS fail explicitly when queries cannot be executed

### Delete Safety Protocol (5 Steps)

**NEVER skip any step** - All 5 are mandatory for destructive operations:

1. **Backup**: Export records to `.hubspot-backups/`
2. **Validate**: Confirm associations transferred (if merge scenario)
3. **Confirm**: Require explicit user confirmation
4. **Delete**: Execute deletion
5. **Audit**: Write audit log with timestamp, reason, deleted IDs

```javascript
// ALWAYS use safe-delete-wrapper
const safeDelete = require('../scripts/lib/safe-delete-wrapper');

const result = await safeDelete.deleteWithSafety(
  'companies',
  companyIds,
  {
    backupDir: './.hubspot-backups',
    reason: 'Duplicate company cleanup',
    validateAssociations: true,
    survivorId: primaryCompanyId,
    confirmed: false,  // REQUIRED: User must confirm
    deletedBy: process.env.USER_EMAIL
  }
);
```

---

## 7. MANDATORY: Context7 Integration for API Accuracy

**CRITICAL**: Before generating ANY HubSpot API code, use Context7 for current documentation.

### Pre-Code Generation Steps

1. **Bulk APIs**: "use context7 @hubspot/api-client@latest"
2. **Import/Export**: Verify latest batch operation patterns
3. **ETL patterns**: Check current transformation methods
4. **Association APIs**: Confirm cross-object linking syntax

This prevents:
- ❌ Deprecated bulk operation endpoints
- ❌ Invalid batch size limits
- ❌ Outdated import/export formats
- ❌ Incorrect association types

---

## 8. Agent Frontmatter Requirements

All agents MUST include this in frontmatter:

```yaml
---
name: hubspot-[agent-name]
description: [clear description of agent purpose]
tools:
  - mcp__hubspot-enhanced-v3__*  # HubSpot MCP tools
  - Read
  - Write
  - TodoWrite
  - Grep
  - Bash
performance_requirements:
  - ALWAYS follow @import ../docs/shared/HUBSPOT_AGENT_STANDARDS.md
  - Use batch endpoints for >10 records
  - Use Imports API for >10k records
  - Parallelize independent operations
  - NO sequential loops without justification
safety_requirements:
  - ALWAYS use safe-delete-wrapper for destructive operations
  - ALWAYS validate payloads with hubspot-api-validator
  - ALWAYS create backups before deletes
---
```

---

## 9. Performance Benchmarks & Expectations

All agents performing bulk operations MUST meet these benchmarks:

| Operation | Record Count | Expected Duration | Max API Calls |
|-----------|--------------|-------------------|---------------|
| Batch Create | 1000 | <3 seconds | 10 calls |
| Batch Update | 1000 | <3 seconds | 10 calls |
| Batch Upsert | 1000 | <3 seconds | 10 calls |
| Batch Delete | 1000 | <5 seconds | 10 calls + backup |
| Batch Associations | 1000 | <3 seconds | 10 calls |
| Import (Async) | 50,000 | <10 minutes | 1 call |

**If agent performance is below benchmarks:**
1. Run `scripts/benchmark-bulk-operations.js` to identify bottlenecks
2. Check for sequential bias (grep for `for.*await`)
3. Verify using batch wrappers (not raw API calls)
4. Submit reflection via `/reflect` with performance data

---

## 10. Testing Requirements

### Required Test Coverage

All agents with data operations MUST have:

1. **Unit tests** for core logic (>80% coverage)
2. **Integration tests** for HubSpot API calls (simulation mode)
3. **Benchmark tests** for performance validation

### Test Template

```javascript
describe('hubspot-contact-manager', () => {
  it('should use batch update for >10 records', async () => {
    const contacts = Array(100).fill({ email: 'test@example.com' });

    const result = await agent.updateContacts(contacts);

    // Verify batch operation was used
    expect(result.apiCallCount).toBeLessThanOrEqual(10); // Not 100!
    expect(result.usedBatchAPI).toBe(true);
  });

  it('should use Imports API for >10k records', async () => {
    const contacts = Array(50000).fill({ email: 'test@example.com' });

    const result = await agent.importContacts(contacts);

    // Verify Imports API was used
    expect(result.method).toBe('IMPORTS_API');
    expect(result.apiCallCount).toBe(1); // Just 1 import call!
  });
});
```

---

## 11. Documentation Standards

### Required Documentation in Each Agent

1. **Core Capabilities** - What the agent does
2. **Performance Optimization** - Which batch wrappers it uses
3. **Safety Protocols** - Validation and backup procedures
4. **Example Usage** - Code snippets with batch patterns
5. **Troubleshooting** - Common errors and solutions

### Example Agent Documentation

```markdown
## Performance Optimization ⚡

This agent uses **batch metadata pattern** for faster execution:

```bash
node scripts/lib/hubspot-contact-manager-optimizer.js
```

**Performance Benefits:**
- 84-97% improvement over baseline
- 32.70x max speedup on complex scenarios
- Batch API calls eliminate N+1 patterns
- Intelligent caching (1-hour TTL)

**Batch Operations Used:**
- `batch-update-wrapper.js` for contact updates
- `batch-property-metadata.js` for property lookups
- `batch-associations-v4.js` for contact-company associations
```

---

## Summary: Pre-Task Agent Checklist

**Before executing ANY HubSpot task, agents MUST:**

- [ ] ✅ Check record count - use appropriate method (batch/imports)
- [ ] ✅ Identify sequential loops - refactor to batch wrappers
- [ ] ✅ Verify using v4 API - especially for associations
- [ ] ✅ Validate payloads - use hubspot-api-validator.js
- [ ] ✅ Plan for pagination - ALWAYS check paging.next.after
- [ ] ✅ Use HubSpotClientV3 - for all API operations
- [ ] ✅ For deletes - use safe-delete-wrapper (MANDATORY)
- [ ] ✅ For large datasets - use generator patterns (avoid OOM)
- [ ] ✅ Check Context7 - verify latest API patterns

**If ANY checkbox is unchecked → STOP and address before proceeding.**

---

## Questions or Issues?

Submit a reflection via `/reflect` with category "agent-standards" if you:
- Need clarification on any standard
- Find an agent not following standards
- Discover a gap in the standards
- Have improvement suggestions

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-10-19 | Added bulk operations playbook integration |
| 1.0.0 | 2025-10-13 | Initial standards document |

---

**Last Updated:** 2025-10-19
**Version:** 2.0.0
**Mandatory:** Yes - All agents MUST follow
**Maintained By:** hubspot-core-plugin team
