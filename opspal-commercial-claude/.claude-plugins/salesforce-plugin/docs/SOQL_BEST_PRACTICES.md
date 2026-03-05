# SOQL Best Practices & Common Pitfalls

**Last Updated**: 2025-10-24
**API Version**: 62.0
**Purpose**: Prevent SOQL query errors and optimize query performance

## Overview

This document covers common SOQL patterns that cause errors, performance issues, and anti-patterns discovered in production usage.

---

## Table of Contents

1. [Operator Consistency in OR Conditions](#operator-consistency)
2. [Field Availability by Object](#field-availability)
3. [Tooling API Requirements](#tooling-api)
4. [Query Optimization](#query-optimization)
5. [Common Error Patterns](#common-errors)
6. [Code Examples](#code-examples)

---

## 1. Operator Consistency in OR Conditions {#operator-consistency}

### ❌ ERROR: "The same comparison operation (LIKE or =) must be specified for all OR conditions"

**Salesforce SOQL Rule**: Within a single OR chain, all comparisons must use the same operator type.

### Why This Error Occurs

Salesforce query optimizer requires consistent operators within OR conditions to build efficient execution plans.

### ❌ Bad Examples

```sql
-- WRONG: Mixing = and LIKE
SELECT Id, Name, Type
FROM Opportunity
WHERE Type = 'Renewal' OR Type = 'Amendment' OR Type LIKE '%Renew%' OR Type LIKE '%Amend%'

-- WRONG: Mixing exact and pattern match
SELECT Id, ThreadIdentifier, MessageIdentifier
FROM EmailMessage
WHERE ThreadIdentifier = 'ABC123' OR MessageIdentifier LIKE '%ABC%'

-- WRONG: Different operators in same OR chain
SELECT Id, Status
FROM Case
WHERE Status = 'New' OR Status = 'Escalated' OR Priority LIKE '%High%'
```

### ✅ Good Examples - Solution 1: Make All LIKE

```sql
-- CORRECT: All LIKE operators (most flexible)
SELECT Id, Name, Type
FROM Opportunity
WHERE Type LIKE 'Renewal' OR Type LIKE 'Amendment' OR Type LIKE '%Renew%' OR Type LIKE '%Amend%'

-- CORRECT: Consistent LIKE for email matching
SELECT Id, ThreadIdentifier, MessageIdentifier
FROM EmailMessage
WHERE ThreadIdentifier LIKE 'ABC123' OR MessageIdentifier LIKE '%ABC%'
```

**Pros**:
- Simple to implement
- Works for all value types
- No performance impact for exact matches (LIKE 'exact' same speed as = 'exact')

**Cons**:
- Slightly less readable for exact matches

### ✅ Good Examples - Solution 2: Use IN with Nested OR

```sql
-- BEST: Separate exact matches with IN, keep LIKE for patterns
SELECT Id, Name, Type
FROM Opportunity
WHERE Type IN ('Renewal', 'Amendment') OR Type LIKE '%Renew%' OR Type LIKE '%Amend%'

-- BEST: Use IN for multiple exact values
SELECT Id, Status, Priority
FROM Case
WHERE Status IN ('New', 'Escalated') OR Priority LIKE '%High%'
```

**Pros**:
- Most readable
- Optimal performance
- Clear separation of exact vs pattern matching

**Cons**:
- Slightly more complex query structure

### ✅ Good Examples - Solution 3: Use Nested Conditions

```sql
-- ACCEPTABLE: Group operators with parentheses
SELECT Id, Name, Type
FROM Opportunity
WHERE (Type = 'Renewal' OR Type = 'Amendment') OR (Type LIKE '%Renew%' OR Type LIKE '%Amend%')

-- ACCEPTABLE: Separate exact and pattern matches
SELECT Id, Status
FROM Case
WHERE (Status = 'New' OR Status = 'Escalated') OR (Priority LIKE '%High%' OR Priority LIKE '%Critical%')
```

**Pros**:
- Logically groups different match types
- Acceptable to Salesforce query optimizer

**Cons**:
- More verbose
- Harder to read with many conditions

### Decision Matrix

| Scenario | Best Approach | Example |
|----------|--------------|---------|
| 2-3 exact values only | `IN ('Val1', 'Val2')` | `Type IN ('Renewal', 'Amendment')` |
| All pattern matches | All `LIKE` | `LIKE '%Renew%' OR LIKE '%Amend%'` |
| Mix of exact + patterns | `IN (...)` OR `LIKE` | `Type IN ('X', 'Y') OR Type LIKE '%Z%'` |
| Complex logic | Nested conditions | `(A = 'X' OR A = 'Y') OR (B LIKE '%Z%')` |

---

## 2. Field Availability by Object {#field-availability}

### Common "No such column" Errors

#### Error: Field doesn't exist on queried object

**Root Causes**:
1. Wrong object chosen for query
2. Field name typo
3. Field requires relationship traversal
4. Object doesn't support certain fields

### Object-Specific Field Restrictions

#### Flow Objects

| Object | Has ApiName? | Has DeveloperName? | Use This Field |
|--------|-------------|-------------------|----------------|
| FlowDefinitionView | ✅ YES | ✅ YES | ApiName (preferred) |
| FlowVersionView | ❌ NO | ✅ YES | DeveloperName |
| Flow | ❌ NO | Via Definition.* | Definition.DeveloperName |

**See**: [SALESFORCE_TOOLING_API_FLOW_OBJECTS.md](./SALESFORCE_TOOLING_API_FLOW_OBJECTS.md) for complete reference

#### FieldDefinition Object

```sql
-- ❌ WRONG: FieldDefinition doesn't have 'Name' field
SELECT Name FROM FieldDefinition WHERE EntityDefinitionId = 'Account'

-- ✅ CORRECT: Use QualifiedApiName and Label
SELECT QualifiedApiName, Label FROM FieldDefinition WHERE EntityDefinitionId = 'Account'
```

#### Custom Objects

```sql
-- ❌ WRONG: Using standard field names on custom objects
SELECT Name FROM MyCustomObject__c  -- May not exist

-- ✅ CORRECT: Check field existence first
SELECT Id, Custom_Name__c FROM MyCustomObject__c

-- ✅ BETTER: Query FieldDefinition to discover available fields
SELECT QualifiedApiName
FROM FieldDefinition
WHERE EntityDefinition.QualifiedApiName = 'MyCustomObject__c'
```

### Field Validation Pattern

```javascript
/**
 * Validate field exists before querying
 */
async function validateField(objectName, fieldName, orgAlias) {
    const query = `
        SELECT QualifiedApiName
        FROM FieldDefinition
        WHERE EntityDefinition.QualifiedApiName = '${objectName}'
        AND QualifiedApiName = '${fieldName}'
    `;

    const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --use-tooling-api --json`;
    const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

    if (result.result?.records?.length === 0) {
        throw new Error(`Field ${fieldName} does not exist on ${objectName}`);
    }

    return true;
}
```

---

## 3. Tooling API Requirements {#tooling-api}

### ❌ ERROR: "sObject type 'FlowDefinitionView' is not supported"

**Root Cause**: Querying Tooling API objects without `--use-tooling-api` flag.

### Tooling API Objects (Require --use-tooling-api)

- Flow, FlowDefinition, FlowDefinitionView, FlowVersionView
- ValidationRule
- Layout, FlexiPage
- FieldDefinition, EntityDefinition
- ApexClass, ApexTrigger, ApexPage
- PermissionSet, Profile (for certain queries)

### ❌ Wrong

```bash
# WRONG: Missing --use-tooling-api flag
sf data query \
  --query "SELECT ApiName FROM FlowDefinitionView" \
  --target-org my-org
```

### ✅ Correct

```bash
# CORRECT: Includes --use-tooling-api
sf data query \
  --query "SELECT ApiName FROM FlowDefinitionView WHERE IsActive = true" \
  --target-org my-org \
  --use-tooling-api
```

### Detection Pattern

```bash
# Regex to find missing --use-tooling-api
grep -E "sf data query.*FROM (Flow|ValidationRule|Layout|FlexiPage|FieldDefinition)" \
  | grep -v "use-tooling-api"
```

---

## 4. Query Optimization {#query-optimization}

### Selective Queries

```sql
-- ❌ BAD: Non-selective query (full table scan)
SELECT Id, Name FROM Account WHERE Industry = 'Technology'

-- ✅ GOOD: Selective with indexed field
SELECT Id, Name FROM Account WHERE CreatedDate = TODAY AND Industry = 'Technology'

-- ✅ BETTER: Use indexed fields first
SELECT Id, Name FROM Account WHERE Id IN (
    SELECT AccountId FROM Opportunity WHERE CloseDate = THIS_MONTH
) AND Industry = 'Technology'
```

### Relationship Queries

```sql
-- ❌ BAD: Multiple queries (N+1 problem)
-- Query 1: Get Opportunities
SELECT Id FROM Opportunity WHERE StageName = 'Closed Won'
-- Query 2-N: Get Account for each Opportunity (executed N times)

-- ✅ GOOD: Single query with relationship
SELECT Id, Account.Name, Account.Industry FROM Opportunity WHERE StageName = 'Closed Won'

-- ✅ GOOD: Subquery for child records
SELECT Id, Name, (SELECT Id, Name FROM Contacts WHERE Email != null) FROM Account
```

### Field Selection

```sql
-- ❌ BAD: Requesting unnecessary fields
SELECT Id, Name, Description, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, ...
FROM Account
WHERE Name LIKE '%Test%'

-- ✅ GOOD: Only necessary fields
SELECT Id, Name FROM Account WHERE Name LIKE '%Test%'

-- Note: SOQL doesn't support SELECT * (this is a good thing!)
```

### Query Limits

```sql
-- ❌ BAD: No LIMIT (returns all records, may timeout)
SELECT Id, Name FROM Account WHERE Industry = 'Technology'

-- ✅ GOOD: Use LIMIT for pagination
SELECT Id, Name FROM Account WHERE Industry = 'Technology' ORDER BY Name LIMIT 200

-- ✅ GOOD: With OFFSET for pagination
SELECT Id, Name FROM Account WHERE Industry = 'Technology' ORDER BY Name LIMIT 200 OFFSET 200
```

---

## 5. Common Error Patterns {#common-errors}

### Error: "unexpected token: '(' at column X"

**Cause**: Invalid syntax, often missing closing parenthesis or quote

```sql
-- ❌ WRONG: Missing closing parenthesis
SELECT Id FROM Account WHERE Name IN ('Test', 'Demo'

-- ✅ CORRECT
SELECT Id FROM Account WHERE Name IN ('Test', 'Demo')

-- ❌ WRONG: Unescaped quote in string
SELECT Id FROM Account WHERE Name = 'O'Reilly'

-- ✅ CORRECT: Escape single quote with backslash
SELECT Id FROM Account WHERE Name = 'O\\'Reilly'
```

### Error: "Bind variables only allowed in Apex code"

**Cause**: Using `:variable` syntax outside of Apex

```sql
-- ❌ WRONG: Bind variable in sf CLI query
SELECT Id FROM Account WHERE Name = :accountName

-- ✅ CORRECT: Use string interpolation in code
const accountName = 'Acme Corp';
const query = `SELECT Id FROM Account WHERE Name = '${accountName}'`;
```

### Error: "Aggregate query has too many rows"

**Cause**: GROUP BY query returning >2000 groups

```sql
-- ❌ WRONG: Too many groups
SELECT AccountId, COUNT(Id) FROM Opportunity GROUP BY AccountId

-- ✅ CORRECT: Add HAVING to filter
SELECT AccountId, COUNT(Id) cnt FROM Opportunity GROUP BY AccountId HAVING COUNT(Id) > 5

-- ✅ CORRECT: Add WHERE to pre-filter
SELECT AccountId, COUNT(Id) FROM Opportunity WHERE CloseDate = THIS_YEAR GROUP BY AccountId
```

### Error: "Implementation restriction: Can only reference Id, SystemModstamp, IsDeleted"

**Cause**: Invalid field in WHERE clause for certain queries

```sql
-- ❌ WRONG: Cannot use custom fields in certain contexts
SELECT Id FROM Account WHERE LastModifiedDate = YESTERDAY AND Custom_Field__c = 'Value'

-- ✅ CORRECT: Use indexed fields only
SELECT Id FROM Account WHERE LastModifiedDate = YESTERDAY
```

---

## 6. Code Examples {#code-examples}

### JavaScript/Node.js

```javascript
const { execSync } = require('child_process');

/**
 * Safe SOQL query builder
 */
class SOQLQueryBuilder {
    constructor(objectName, orgAlias) {
        this.objectName = objectName;
        this.orgAlias = orgAlias;
        this.fields = [];
        this.conditions = [];
        this.orderBy = null;
        this.limitValue = null;
        this.useToolingAPI = false;
    }

    select(...fields) {
        this.fields.push(...fields);
        return this;
    }

    where(field, operator, value) {
        // Escape single quotes
        const escapedValue = typeof value === 'string'
            ? value.replace(/'/g, "\\'")
            : value;

        this.conditions.push(`${field} ${operator} '${escapedValue}'`);
        return this;
    }

    whereIn(field, values) {
        const escapedValues = values.map(v =>
            typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v
        );
        this.conditions.push(`${field} IN (${escapedValues.join(', ')})`);
        return this;
    }

    whereLike(field, pattern) {
        const escapedPattern = pattern.replace(/'/g, "\\'");
        this.conditions.push(`${field} LIKE '${escapedPattern}'`);
        return this;
    }

    order(field, direction = 'ASC') {
        this.orderBy = `${field} ${direction}`;
        return this;
    }

    limit(value) {
        this.limitValue = value;
        return this;
    }

    toolingAPI() {
        this.useToolingAPI = true;
        return this;
    }

    build() {
        let query = `SELECT ${this.fields.join(', ')} FROM ${this.objectName}`;

        if (this.conditions.length > 0) {
            query += ` WHERE ${this.conditions.join(' AND ')}`;
        }

        if (this.orderBy) {
            query += ` ORDER BY ${this.orderBy}`;
        }

        if (this.limitValue) {
            query += ` LIMIT ${this.limitValue}`;
        }

        return query;
    }

    async execute() {
        const query = this.build();
        const toolingFlag = this.useToolingAPI ? '--use-tooling-api' : '';

        const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} ${toolingFlag} --json`;

        try {
            const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const result = JSON.parse(output);

            if (result.status !== 0) {
                throw new Error(result.message || 'Query failed');
            }

            return result.result?.records || [];
        } catch (error) {
            throw new Error(`SOQL query failed: ${error.message}\nQuery: ${query}`);
        }
    }
}

// ✅ Usage Example
async function queryOpportunities(orgAlias) {
    const builder = new SOQLQueryBuilder('Opportunity', orgAlias);

    const opportunities = await builder
        .select('Id', 'Name', 'StageName', 'CloseDate')
        .whereIn('Type', ['Renewal', 'Amendment'])
        .whereLike('Name', '%2025%')
        .order('CloseDate', 'DESC')
        .limit(100)
        .execute();

    return opportunities;
}

// ✅ Tooling API Example
async function queryFlows(orgAlias) {
    const builder = new SOQLQueryBuilder('FlowDefinitionView', orgAlias);

    const flows = await builder
        .select('ApiName', 'TriggerObjectOrEvent', 'TriggerType')
        .where('IsActive', '=', true)
        .toolingAPI()
        .execute();

    return flows;
}
```

### Bash/Shell

```bash
#!/bin/bash

# ✅ Safe SOQL query function with validation
safe_soql_query() {
    local query="$1"
    local org_alias="$2"
    local use_tooling="${3:-false}"

    # Validate inputs
    if [[ -z "$query" ]] || [[ -z "$org_alias" ]]; then
        echo "Error: Query and org alias required" >&2
        return 1
    fi

    # Build command
    local cmd="sf data query --query \"$query\" --target-org $org_alias --json"

    if [[ "$use_tooling" == "true" ]]; then
        cmd="$cmd --use-tooling-api"
    fi

    # Execute and parse
    local result
    if result=$(eval "$cmd" 2>&1); then
        echo "$result" | jq '.result.records'
    else
        echo "Query failed: $result" >&2
        return 1
    fi
}

# ✅ Usage with operator consistency
query_opportunities() {
    local org="$1"

    # CORRECT: All LIKE operators
    local query="SELECT Id, Name, Type FROM Opportunity WHERE Type LIKE 'Renewal' OR Type LIKE 'Amendment' OR Type LIKE '%Renew%'"

    safe_soql_query "$query" "$org" "false"
}

# ✅ Usage with Tooling API
query_flows() {
    local org="$1"

    # CORRECT: Tooling API with proper flag
    local query="SELECT ApiName, TriggerObjectOrEvent FROM FlowDefinitionView WHERE IsActive = true"

    safe_soql_query "$query" "$org" "true"
}
```

---

## Quick Reference Checklist

Before executing any SOQL query, verify:

- [ ] **Operator Consistency**: All OR conditions use same operator (= or LIKE)
- [ ] **Field Existence**: Field exists on target object
- [ ] **Tooling API Flag**: Added `--use-tooling-api` for Tooling objects
- [ ] **Quotes Escaped**: Single quotes in strings escaped with `\'`
- [ ] **Relationship Syntax**: Used dot notation for relationship fields (e.g., `Account.Name`)
- [ ] **LIMIT Clause**: Added LIMIT for large result sets
- [ ] **Indexed Fields**: WHERE clause uses indexed fields when possible
- [ ] **Field Selection**: Only selecting necessary fields

---

## Related Documentation

- [Tooling API Flow Objects Reference](./SALESFORCE_TOOLING_API_FLOW_OBJECTS.md)
- [Salesforce SOQL and SOSL Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/)
- [Query Plan Tool](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_query_plan_tool.htm)
- [Salesforce Query Performance](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/langCon_apex_SOQL_VLSQ.htm)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-24 | Initial documentation covering operator consistency and common errors |

---

## Maintenance

Update this document when:
- New error patterns identified in production
- Salesforce introduces SOQL syntax changes
- Query performance best practices evolve

**Maintainer**: RevPal Engineering
**Review Frequency**: Quarterly
