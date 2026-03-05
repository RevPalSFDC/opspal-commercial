# SOQL Field Validation Requirements

> **MANDATORY**: Validate all fields before executing SOQL queries to prevent INVALID_FIELD errors.

## STOP: Before ANY SOQL on an Unfamiliar Object

If you have not queried this object in this session, you MUST run:

```bash
sf sobject describe <ObjectName> --target-org <org> --json | jq '.result.fields[].name'
```

**DO NOT guess field names. DO NOT assume standard relationship names.**
Territory2, CPQ, and junction objects have non-obvious field names that differ from standard patterns.

---

## Pre-Query Validation Protocol

Before executing ANY SOQL query, follow this checklist:

### Step 1: Identify Query Components

```
Query: SELECT Name, Contact__c, Amount FROM Opportunity WHERE StageName = 'Closed Won'
                 ↑
                 └── This field likely doesn't exist!
```

- **Object**: Opportunity (from FROM clause)
- **Fields**: Name, Contact__c, Amount (from SELECT clause)
- **Filter Fields**: StageName (from WHERE clause)

### Step 2: Validate Each Field

Use the field validator script:

```bash
# Validate a single field
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate-field.js" Opportunity Name

# Validate with specific org
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate-field.js" Opportunity Contact__c --org myorg
```

Or use sf CLI directly:

```bash
# List all fields on an object
sf sobject describe Opportunity -o myorg --json | jq '.result.fields[].name'

# Check for a specific field
sf sobject describe Opportunity -o myorg --json | jq '.result.fields[] | select(.name | test("Contact"; "i")) | .name'
```

### Step 3: Verify Relationship Fields

For cross-object queries (e.g., `Account.Name`), verify the relationship exists:

```bash
# List parent relationships (lookup/master-detail fields)
sf sobject describe Opportunity -o myorg --json | jq '.result.fields[] | select(.type == "reference") | {name: .name, relationshipName: .relationshipName}'

# List child relationships
sf sobject describe Opportunity -o myorg --json | jq '.result.childRelationships[] | {childSObject: .childSObject, relationshipName: .relationshipName}'
```

## Territory2 Object Field Reference

Territory2 objects have **non-obvious field names** that differ from standard Salesforce patterns. ALWAYS describe these objects before querying.

| Object | Common Wrong Field | Correct Field | Notes |
|--------|-------------------|---------------|-------|
| ObjectTerritory2Association | AccountId | **ObjectId** | Links Account to Territory2 |
| ObjectTerritory2Association | AccountName | N/A | Join to Account via ObjectId |
| UserTerritory2Association | RoleInTerritory | **RoleInTerritory2** | Note the "2" suffix |
| Territory2 | ParentId | **ParentTerritory2Id** | Not standard ParentId |
| Territory2 | ModelId | **Territory2ModelId** | Full compound name |
| User | Primary_Territory2_Name__c | N/A | **Does not exist** - query UserTerritory2Association instead |
| User | TerritoryId | N/A | **Does not exist on User** in Territory2 model |
| ObjectTerritory2Association | N/A | **AssociationCause** | Shows if record was created by rule ('Territory2AssignmentRule') or manually ('Territory2Manual'). Rule-created records CANNOT be API-deleted. |

**ALWAYS run `sf sobject describe <ObjectName>` before querying Territory2 objects.**
These objects have non-obvious field names that cause INVALID_FIELD errors.

---

## Common Invalid Field Patterns

| Invalid Pattern | Why It Fails | Correct Alternative |
|-----------------|--------------|---------------------|
| `Contact__c` on Opportunity | No such field exists | Use `ContactId` (standard lookup) or the relationship name |
| `Account__c` on Contact | Standard lookup is `AccountId` | Use `AccountId` |
| `Owner__c` on any object | Standard field is `OwnerId` | Use `OwnerId` |
| `CreatedBy__c` | Standard field is `CreatedById` | Use `CreatedById` |
| `LastModifiedBy__c` | Standard field is `LastModifiedById` | Use `LastModifiedById` |
| `Record_Type__c` | Standard field is `RecordTypeId` | Use `RecordTypeId` |

## Standard Field Naming Conventions

### Lookup Fields (References)

| Standard Lookups | API Name |
|-----------------|----------|
| Account (on Contact) | `AccountId` |
| Contact (on Opportunity) | Contact lookup not standard - check `OpportunityContactRole` |
| Owner | `OwnerId` |
| Parent Account | `ParentId` |
| Created By | `CreatedById` |
| Last Modified By | `LastModifiedById` |
| Record Type | `RecordTypeId` |

### Custom Lookups

Custom lookup fields follow the pattern: `Field_Name__c`

To query related object fields:
```sql
-- For custom lookup Field__c with relationship name Field__r
SELECT Field__r.Name FROM MyObject__c
```

## Relationship Query Patterns

### Parent-to-Child (Subquery)

```sql
-- Query child records via relationship name
SELECT Id, Name, (SELECT Id, Amount FROM Opportunities) FROM Account

-- Find relationship name
sf sobject describe Account --json | jq '.result.childRelationships[] | select(.childSObject == "Opportunity") | .relationshipName'
```

### Child-to-Parent (Dot Notation)

```sql
-- Query parent fields via relationship name
SELECT Id, Account.Name, Account.Industry FROM Opportunity

-- Find relationship name
sf sobject describe Opportunity --json | jq '.result.fields[] | select(.name == "AccountId") | .relationshipName'
```

## Error Recovery Workflow

If you receive an `INVALID_FIELD` error:

1. **Stop** - Don't retry the same query
2. **Describe** - Get the object's field list:
   ```bash
   sf sobject describe <ObjectName> -o <org> --json | jq '.result.fields[].name'
   ```
3. **Find** - Search for similar field names:
   ```bash
   sf sobject describe <ObjectName> -o <org> --json | jq '.result.fields[] | select(.name | test("<partial>"; "i")) | {name: .name, type: .type, label: .label}'
   ```
4. **Update** - Correct your query with the valid field name
5. **Validate** - Run the validator before executing:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/validate-field.js" <Object> <Field> --org <org>
   ```
6. **Execute** - Run the corrected query

## Caching Behavior

The field validator caches metadata for 24 hours to reduce API calls:
- Cache location: `~/.claude/cache/sf-metadata/<org>/<object>-fields.json`
- To force refresh: Delete the cache file or wait 24 hours
- Cache includes: field names, types, labels, and relationship names

## Query Result Completeness

Salesforce REST API silently truncates results at 2,000 records per batch and 50,000 total. The `done: true` flag is returned even when results are truncated, making it impossible to detect from the response alone.

### How to Detect Truncation

Check if `records.length` equals a known threshold:

```javascript
const { executeQuery, checkQueryCompleteness } = require('./safe-query-executor');

// Option 1: Use checkCompleteness option in executeQuery
const result = executeQuery(query, orgAlias, { checkCompleteness: true });
if (result._completeness && result._completeness.truncated) {
  console.warn(`Only got ${result._completeness.returnedCount} of ${result._completeness.totalCount} records`);
}

// Option 2: Check manually after query
const completeness = checkQueryCompleteness(query, result, orgAlias);
if (completeness.truncated) {
  // Use pagination library for complete results
}
```

### When to Use Pagination

| Record Count | Risk | Recommendation |
|-------------|------|----------------|
| < 2,000 | None | Standard query is fine |
| = 2,000 | HIGH | Likely truncated — run COUNT() to verify |
| 2,000 - 50,000 | Medium | Use QueryMore or Keyset pagination |
| >= 50,000 | HIGH | Use Bulk API via `salesforce-pagination.js` |

### Using the Pagination Library

```javascript
const { paginateQuery, selectStrategy } = require('./salesforce-pagination');

// Auto-selects strategy based on record count
const allRecords = await paginateQuery({
  query: 'SELECT Id, Name FROM Account',
  targetOrg: orgAlias
});
```

See `salesforce-pagination.js` for full documentation on Keyset, QueryMore, and Bulk API strategies.

## Integration with Smart Query Validator

For comprehensive query validation including field checking:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/smart-query-validator.js" \
  --query "SELECT Name, Contact__c FROM Opportunity" \
  --org myorg
```

This validates:
- All field names exist
- Relationship paths are valid
- Query syntax is correct
- API type is appropriate (REST vs Tooling)
