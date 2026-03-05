# Marketo API Null Handling (MANDATORY)

**Root Cause (P1 - Reflection Cohort schema/parse):**
Marketo REST API returns literal string `"null"` for empty fields, not JSON `null`.
Python/JavaScript truthiness checks treat `"null"` string as truthy, causing data issues.

## CRITICAL: Always Sanitize API Responses

**BEFORE processing any Marketo lead data:**

```javascript
const { sanitizeApiResponse, getField, isTruthy } = require('../scripts/lib/api-response-sanitizer');

// Sanitize entire response
const rawResponse = await mcp__marketo__lead_query({ filterType: 'email', filterValues: ['x@y.com'] });
const cleanResponse = sanitizeApiResponse(rawResponse);

// Safe field access (returns null for string 'null')
const sfdcId = getField(lead, 'sfdcId');
if (sfdcId) { /* actually has an ID */ }

// Check if truthy (handles string 'null')
if (isTruthy(lead.sfdcId)) { /* has valid ID */ }
```

## Common Fields That Return String 'null'

- `sfdcId`, `sfdcType`, `sfdcAccountId`, `sfdcContactId`, `sfdcLeadId`
- `company`, `title`, `phone`, `mobilePhone`
- `leadSource`, `leadStatus`, `acquisitionProgramId`
- `annualRevenue`, `numberOfEmployees`

## Helper Functions

| Function | Purpose |
|----------|---------|
| `sanitizeApiResponse(response)` | Converts all `"null"` strings to `null` in API response |
| `getField(obj, field, default)` | Safe field access, returns default if value is `"null"` |
| `isTruthy(value)` | Returns false for `null`, `undefined`, empty string, and `"null"` |
| `filterWithSfdcId(leads)` | Filter leads with valid (non-null) Salesforce IDs |
| `filterWithoutSfdcId(leads)` | Filter leads without Salesforce IDs |

## When to Use

- ✅ After ANY `mcp__marketo__lead_query` call
- ✅ Before checking if a field has a value
- ✅ Before filtering leads by Salesforce sync status
- ✅ When processing bulk export data

## Location

`scripts/lib/api-response-sanitizer.js`
