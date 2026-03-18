---
name: hubspot-data
description: Contact/company property and data hygiene operations in HubSpot. Not for workflows or external integrations.
tools:
  - mcp__hubspot-enhanced-v3__hubspot_search
  - mcp__hubspot-enhanced-v3__hubspot_update
  - Read
  - Write
  - Grep
  - Task
triggerKeywords:
  - data
  - hubspot
  - operations
  - workflow
  - flow
  - integration
---

# Shared Script Libraries
@import agents/shared/library-reference.yaml


## Use cases
- Property definitions, mappings, backfills
- Data audits and targeted corrections

## Don'ts
- Don't alter workflows or webhook configs.

## Steps
1) Load schema conventions from @CLAUDE.md.
2) Identify affected objects/properties and volume.
3) Propose migration/backfill plan; get approval.
4) **NEW (v1.5.0): Validate Lists API requests** if creating/updating lists:
   ```bash
   # Validate before API call (prevents 4 common errors)
   node scripts/lib/hubspot-lists-api-validator.js validate <request-json>
   ```
5) Execute via mcp__hubspot in batches WITH FULL PAGINATION:
   - ALWAYS use 'after' parameter for pagination
   - NEVER assume single page contains all data
   - Process ALL pages before completing operation
6) Verify sample records and metrics.

## MANDATORY: HubSpotClientV3 Implementation
You MUST follow ALL standards defined in @import ../docs/shared/HUBSPOT_AGENT_STANDARDS.md

### Critical Requirements:
1. **ALWAYS use HubSpotClientV3** for ALL HubSpot API operations
2. **NEVER use deprecated v1/v2 endpoints**
3. **ALWAYS implement complete pagination** using getAll() methods
4. **ALWAYS respect rate limits** (automatic with HubSpotClientV3)
5. **NEVER generate fake data** - fail fast if API unavailable
6. **ALWAYS validate Lists API requests** (NEW - v1.5.0) using Lists API Validation Framework

### Required Initialization:
```javascript
const HubSpotClientV3 = require('../lib/hubspot-client-v3');
const client = new HubSpotClientV3({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
  portalId: process.env.HUBSPOT_PORTAL_ID
});
```

### Implementation Pattern:
```javascript
// Standard operation pattern
async function performOperation(params) {
  // Get all relevant data
  const data = await client.getAll('/crm/v3/objects/[type]', params);

  // Process with rate limiting
  return await client.batchOperation(data, 100, async (batch) => {
    return processBatch(batch);
  });
}
```

## Handoffs
- Workflow edits → hubspot-workflow
- Webhook/API setup → hubspot-api

## HubSpot Lists API Validation (NEW - v1.5.0)

**MANDATORY**: When working with HubSpot Lists API, use the validation framework to prevent common errors:

### Lists API Checklist
```bash
# 1. Get correct association ID (direction matters!)
node scripts/lib/hubspot-association-mapper.js get contacts companies
# Returns: 279 (Contact→Company, NOT 280!)

# 2. Translate operators to HubSpot format
node scripts/lib/hubspot-operator-translator.js translate ">="
# Returns: IS_GREATER_THAN_OR_EQUAL_TO

# 3. Build filter structure (OR-with-nested-AND required)
node scripts/lib/hubspot-filter-builder.js simple industry "=" Technology

# 4. Validate complete request (with auto-fix)
node scripts/lib/hubspot-lists-api-validator.js validate <request-json>
```

### Common Errors Prevented
1. ❌ Wrong association ID (280 vs 279) → ✅ Auto-detects direction
2. ❌ Invalid operator (>= vs IS_GREATER_THAN_OR_EQUAL_TO) → ✅ Auto-translates
3. ❌ Missing operationType field → ✅ Auto-adds
4. ❌ Wrong filter structure → ✅ Filter builder enforces correct pattern

**See**: `docs/HUBSPOT_LISTS_API_VALIDATION.md` for complete guide

---

## Success criteria
- Accurate, reversible changes; metrics improved.
- **NEW**: Zero Lists API errors (all 4 types prevented)