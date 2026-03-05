# LLM Common Security Mistakes

## CRITICAL: Hallucinated Objects

**Root Cause**: LLMs see XML node names in metadata parsing code and incorrectly infer these are queryable Salesforce objects. They are NOT.

### Never Query These Objects

| Hallucinated Object | Why It Doesn't Exist | Correct Approach |
|---------------------|----------------------|------------------|
| `RecordTypeVisibility` | XML node in Profile metadata | Use MetadataRetriever, parse `recordTypeVisibilities` |
| `ApplicationVisibility` | XML node in Profile metadata | Use MetadataRetriever, parse `applicationVisibilities` |
| `FieldPermission` | XML node in Profile metadata | Use MetadataRetriever, parse `fieldPermissions` |
| `ObjectPermission` | XML node in Profile metadata | Use MetadataRetriever, parse `objectPermissions` |
| `TabVisibility` | XML node in Profile metadata | Use MetadataRetriever, parse `tabSettings` |

### Incorrect vs Correct Patterns

```sql
-- ❌ WRONG (Will be blocked by Error Prevention System)
SELECT RecordType.Name, IsDefault FROM RecordTypeVisibility WHERE SobjectType = 'Account'
```

```javascript
// ✅ CORRECT (Use Metadata API)
const MetadataRetriever = require('../../scripts/lib/metadata-retrieval-framework');
const retriever = new MetadataRetriever(orgAlias);
const profiles = await retriever.getProfiles();
// Returns parsed XML with all visibility settings
```

## Error Prevention System

The system automatically blocks queries against hallucinated objects:
- Pre-query validation
- Error message with correct approach
- Link to LLM_COMMON_MISTAKES.md

## Investigation Tools Pattern

### Mandatory Tool Usage

```bash
# Initialize cache once per org
node scripts/lib/org-metadata-cache.js init <org>

# Find security-related fields
node scripts/lib/org-metadata-cache.js find-field <org> Profile Object

# Validate EVERY SOQL query before execution
node scripts/lib/smart-query-validator.js <org> "<soql>"
```

### Pattern 1: Field Permission Discovery
```
Need to check field permissions
  ↓
1. Run: node scripts/lib/org-metadata-cache.js find-field <org> <object> <field>
2. Get field metadata including FLS requirements
3. Query actual permissions using validated SOQL
```

### Pattern 2: Profile/Permission Set Analysis
```
Analyzing user access
  ↓
1. Run: node scripts/lib/org-metadata-cache.js query <org>
2. Review profiles and permission sets
3. Build validated queries for specific permission checks
```

## Common Failure Patterns

### 1. Assuming Standard API Structure
```
❌ Assumption: "FieldPermissions is a standard object"
✅ Reality: Field permissions are embedded in Profile/PermissionSet metadata
```

### 2. Copying UI Labels
```
❌ Assumption: "Record Type Visibility" = RecordTypeVisibility object
✅ Reality: UI label doesn't map to API object
```

### 3. Inferring from Documentation
```
❌ Assumption: Metadata structure = SOQL queryable
✅ Reality: Metadata XML nodes are not objects
```

## Prevention Checklist

- [ ] Never assume object existence - verify first
- [ ] Use metadata cache for discovery
- [ ] Validate all queries before execution
- [ ] Check Error Prevention System warnings
- [ ] Reference LLM_COMMON_MISTAKES.md for known issues
