# Context7 API Documentation Integration Guide
# Version: 1.0.0
# Last Updated: 2025-10-27
#
# This file defines standard patterns for using Context7 MCP server
# to access up-to-date API documentation before generating code.
#
# **Usage**: @import ../../shared-docs/context7-usage-guide.md
#
# **Cacheable**: Yes - This pattern is stable and reused across 20+ agents

---

## Overview

Context7 is an MCP server that provides access to current API documentation for Salesforce, HubSpot, and other platforms. **ALWAYS** use Context7 before generating code that uses platform APIs to prevent using deprecated endpoints, incorrect syntax, or outdated patterns.

**Available via**: `mcp__context7__*` tools

---

## Why Use Context7?

### Problems It Prevents

1. **Deprecated API Versions**
   - ❌ Using Bulk API v1.0 (deprecated)
   - ✅ Using Bulk API v2.0 (current)

2. **Incorrect Batch Sizes**
   - ❌ Assuming 10,000 records/batch (old limit)
   - ✅ Checking current limits (varies by API version)

3. **Invalid Endpoint Patterns**
   - ❌ Using `/services/data/v45.0/...` (outdated version)
   - ✅ Using `/services/data/v62.0/...` (current)

4. **Outdated Syntax**
   - ❌ Using deprecated parameter names
   - ✅ Using current API syntax

---

## Pre-Code Generation Protocol

### MANDATORY: Check Context7 Before Generating Code

**ALWAYS follow this pattern:**

```
1. Identify API operation needed
2. Use Context7 to get current documentation
3. Verify syntax, endpoints, limits
4. Generate code using validated patterns
5. Include Context7 reference in code comments
```

---

## Common Usage Patterns

### Pattern 1: Salesforce Bulk API Operations

**Before generating bulk data import code:**

```bash
# Step 1: Get current Bulk API documentation
use context7 salesforce-bulk-api@latest

# Step 2: Verify patterns
- Bulk API v2.0 endpoint format
- Current batch size recommendations
- CSV header format requirements
- Field mapping syntax

# Step 3: Generate code using validated patterns
```

**Example Code Generation:**
```javascript
// ✅ CORRECT (after Context7 check)
// Reference: Context7 - salesforce-bulk-api@v2.0 (2025-10-27)

const bulkHandler = new BulkAPIv2Handler(orgAlias);

// Bulk API v2.0 endpoint pattern (validated via Context7)
const job = await bulkHandler.createJob({
    operation: 'insert',
    object: 'Account',
    lineEnding: 'LF'  // Current requirement
});
```

### Pattern 2: Salesforce REST API Operations

**Before generating REST API code:**

```bash
# Step 1: Get current REST API documentation
use context7 salesforce-rest-api@latest

# Step 2: Verify endpoints
- Current API version (v62.0 vs v45.0)
- Query parameter syntax
- Response format
- Error handling patterns

# Step 3: Generate code
```

**Example Code Generation:**
```javascript
// ✅ CORRECT (after Context7 check)
// Reference: Context7 - salesforce-rest-api@v62.0 (2025-10-27)

const endpoint = `/services/data/v62.0/query?q=${encodedSOQL}`;
const response = await sf.request(endpoint);
```

### Pattern 3: Salesforce Composite API

**Before generating composite API code:**

```bash
# Step 1: Get current Composite API documentation
use context7 salesforce-composite-api@latest

# Step 2: Verify structure
- Composite request format
- Sub-request limits (25 per composite)
- All-or-none behavior
- Reference ID patterns

# Step 3: Generate code
```

**Example Code Generation:**
```javascript
// ✅ CORRECT (after Context7 check)
// Reference: Context7 - salesforce-composite-api@v62.0 (2025-10-27)

const compositeRequest = {
    allOrNone: true,  // Current best practice
    compositeRequest: [
        {
            method: 'POST',
            url: '/services/data/v62.0/sobjects/Account',
            referenceId: 'refAccount',
            body: { Name: 'Acme Corp' }
        }
    ]
};
```

### Pattern 4: HubSpot API Operations

**Before generating HubSpot API code:**

```bash
# Step 1: Get current HubSpot API documentation
use context7 hubspot-api@latest

# Step 2: Verify patterns
- API version (v3 vs v1/v2)
- Authentication method
- Rate limiting rules
- Pagination syntax

# Step 3: Generate code
```

**Example Code Generation:**
```javascript
// ✅ CORRECT (after Context7 check)
// Reference: Context7 - hubspot-api@v3 (2025-10-27)

const { HubSpotClientV3 } = require('./hubspot-client-v3');

// HubSpot API v3 pattern (validated via Context7)
const client = new HubSpotClientV3({
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN
});

// Use getAll() for automatic pagination (v3 feature)
const contacts = await client.contacts.getAll();
```

---

## Context7 Tool Usage

### Available Tools (via MCP)

```javascript
// List available documentation
mcp__context7__list_sources()

// Get specific API documentation
mcp__context7__get_doc({
    source: 'salesforce-bulk-api',
    version: 'latest'  // or specific version like 'v62.0'
})

// Search documentation
mcp__context7__search({
    query: 'composite api limits',
    sources: ['salesforce-composite-api']
})
```

### Integration in Agent Code

```javascript
// Step 1: Check Context7 before code generation
const bulkApiDocs = await mcp__context7__get_doc({
    source: 'salesforce-bulk-api',
    version: 'latest'
});

// Step 2: Extract key patterns
const currentVersion = extractAPIVersion(bulkApiDocs);
const batchLimits = extractBatchLimits(bulkApiDocs);
const endpointPattern = extractEndpointPattern(bulkApiDocs);

// Step 3: Generate code using validated patterns
const code = generateBulkInsertCode({
    apiVersion: currentVersion,
    batchSize: batchLimits.recommended,
    endpoint: endpointPattern
});

// Step 4: Include Context7 reference in comments
code.comments.push(`// Reference: Context7 - ${source}@${currentVersion} (${new Date().toISOString().split('T')[0]})`);
```

---

## When to Use Context7

### Always Use For:
- ✅ Bulk API operations (data import/export)
- ✅ REST API endpoint generation
- ✅ Composite API request construction
- ✅ OAuth/authentication flows
- ✅ Webhook configuration
- ✅ API version upgrades

### Optional For:
- ⚠️ Simple SOQL queries (unless syntax changed)
- ⚠️ Basic CRUD operations (well-established patterns)
- ⚠️ UI operations (Lightning, Visualforce)

### Not Needed For:
- ❌ Pure JavaScript logic (no API calls)
- ❌ Database operations (internal schemas)
- ❌ File system operations
- ❌ Pure data transformations

---

## Error Prevention Examples

### Example 1: Preventing Deprecated Bulk API Usage

**Without Context7:**
```javascript
// ❌ WRONG: Uses deprecated Bulk API v1.0
const job = await connection.bulk.createJob({
    operation: 'insert',
    object: 'Account'
});
```

**With Context7:**
```bash
# Check Context7 first
use context7 salesforce-bulk-api@latest
# Result: Bulk API v1.0 deprecated, use v2.0
```

```javascript
// ✅ CORRECT: Uses current Bulk API v2.0
// Reference: Context7 - salesforce-bulk-api@v2.0 (2025-10-27)
const handler = new BulkAPIv2Handler(orgAlias);
const job = await handler.createJob({
    operation: 'insert',
    object: 'Account',
    lineEnding: 'LF'
});
```

### Example 2: Preventing Incorrect Batch Sizes

**Without Context7:**
```javascript
// ❌ WRONG: Assumes old batch size limits
const BATCH_SIZE = 10000;  // May be outdated
```

**With Context7:**
```bash
# Check Context7 first
use context7 salesforce-bulk-api@latest
# Result: Recommended batch size is 5,000 for optimal performance
```

```javascript
// ✅ CORRECT: Uses current recommendations
// Reference: Context7 - salesforce-bulk-api@v2.0 (2025-10-27)
const BATCH_SIZE = 5000;  // Validated via Context7
```

### Example 3: Preventing Invalid CSV Formats

**Without Context7:**
```javascript
// ❌ WRONG: Uses outdated CSV header format
const csv = `AccountId,Name,Industry\n...`;
```

**With Context7:**
```bash
# Check Context7 first
use context7 salesforce-bulk-api@latest
# Result: CSV must use specific line endings and encoding
```

```javascript
// ✅ CORRECT: Uses validated CSV format
// Reference: Context7 - salesforce-bulk-api@v2.0 (2025-10-27)
const csv = records.map(r =>
    `"${r.AccountId}","${r.Name}","${r.Industry}"`
).join('\n');  // LF line ending required
```

---

## Agent Integration Checklist

Before generating ANY code that uses platform APIs:

- [ ] **Identify API operation** (Bulk, REST, Composite, etc.)
- [ ] **Check Context7** for current documentation
- [ ] **Verify API version** (don't assume)
- [ ] **Validate endpoint patterns** (format, parameters)
- [ ] **Check limits** (batch sizes, rate limits)
- [ ] **Generate code** using validated patterns
- [ ] **Include Context7 reference** in code comments

---

## Common Context7 Sources

### Salesforce
- `salesforce-bulk-api@latest` - Bulk API v2.0 operations
- `salesforce-rest-api@latest` - REST API endpoints
- `salesforce-composite-api@latest` - Composite request patterns
- `salesforce-metadata-api@latest` - Metadata deployment patterns
- `salesforce-tooling-api@latest` - Tooling API for metadata queries

### HubSpot
- `hubspot-api@latest` - HubSpot API v3 patterns
- `hubspot-crm-api@latest` - CRM object operations
- `hubspot-workflows-api@latest` - Workflow automation
- `hubspot-automation-api@latest` - Marketing automation

---

## Best Practices

### 1. Always Reference Context7 in Generated Code

```javascript
// ✅ GOOD: Includes Context7 reference
// Reference: Context7 - salesforce-bulk-api@v2.0 (2025-10-27)
// Validated: Batch size 5,000, LF line endings, API v62.0

const handler = new BulkAPIv2Handler(orgAlias);
```

### 2. Check Context7 When API Errors Occur

If you encounter unexpected API errors:
1. Re-check Context7 for API changes
2. Verify current syntax/parameters
3. Update code to match current patterns
4. Document the fix

### 3. Keep Context7 References Updated

When updating old code:
1. Check Context7 for current patterns
2. Update code if deprecated
3. Update Context7 reference comment
4. Note what changed in commit message

### 4. Use Version-Specific References

```javascript
// ✅ GOOD: Version-specific reference
// Reference: Context7 - salesforce-rest-api@v62.0 (2025-10-27)

// ❌ BAD: Generic reference (no version)
// Reference: Salesforce API docs
```

---

## Troubleshooting

### Context7 Not Available

If Context7 MCP server is not available:
1. Check `.mcp.json` configuration
2. Verify MCP server is running: `claude mcp list`
3. Restart MCP server: `claude mcp restart context7`
4. Fall back to manual API documentation check (document source)

### Outdated Documentation

If Context7 returns outdated documentation:
1. Verify version specified: `@latest` vs `@v62.0`
2. Check Context7 last update date
3. Cross-reference with official platform docs
4. Report discrepancy to Context7 maintainer

---

## Related Documentation

- **MCP Configuration**: `.mcp.json` - Context7 server setup
- **Bulk API Handler**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/bulk-api-handler.js`
- **HubSpot Client**: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-client-v3.js`
- **Library Reference**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/agents/shared/library-reference.yaml`

---

## Version History

- **1.0.0** (2025-10-27): Initial extraction from multiple agents, standardized for cross-platform use
