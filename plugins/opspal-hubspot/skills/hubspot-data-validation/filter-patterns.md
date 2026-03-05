# Filter Syntax Reference

## Operator Types

### String Operators
| Operator | Usage | Example |
|----------|-------|---------|
| IS_EQUAL_TO | Exact match | `"operator": "IS_EQUAL_TO", "value": "lead"` |
| IS_NOT_EQUAL_TO | Not exact match | `"operator": "IS_NOT_EQUAL_TO", "value": "customer"` |
| CONTAINS | Substring match | `"operator": "CONTAINS", "value": "corp"` |
| DOES_NOT_CONTAIN | No substring | `"operator": "DOES_NOT_CONTAIN", "value": "test"` |
| STARTS_WITH | Prefix match | `"operator": "STARTS_WITH", "value": "www"` |
| ENDS_WITH | Suffix match | `"operator": "ENDS_WITH", "value": ".com"` |
| IS_KNOWN | Has any value | `"operator": "IS_KNOWN"` |
| IS_UNKNOWN | Is empty/null | `"operator": "IS_UNKNOWN"` |

### Multi-String Operators
| Operator | Usage | Example |
|----------|-------|---------|
| IS_ANY_OF | In list | `"operator": "IS_ANY_OF", "values": ["a", "b"]` |
| IS_NONE_OF | Not in list | `"operator": "IS_NONE_OF", "values": ["x", "y"]` |

### Number Operators

**CRITICAL**: Use enum names, NOT symbols!

| Operator | Symbol | Correct Usage |
|----------|--------|---------------|
| IS_EQUAL_TO | = | `"operator": "IS_EQUAL_TO"` |
| IS_NOT_EQUAL_TO | != | `"operator": "IS_NOT_EQUAL_TO"` |
| IS_GREATER_THAN | > | `"operator": "IS_GREATER_THAN"` |
| IS_GREATER_THAN_OR_EQUAL_TO | >= | `"operator": "IS_GREATER_THAN_OR_EQUAL_TO"` |
| IS_LESS_THAN | < | `"operator": "IS_LESS_THAN"` |
| IS_LESS_THAN_OR_EQUAL_TO | <= | `"operator": "IS_LESS_THAN_OR_EQUAL_TO"` |
| IS_BETWEEN | range | `"operator": "IS_BETWEEN", "lowerBound": 0, "upperBound": 100` |

**WRONG**: `"operator": ">="` - This will fail!
**CORRECT**: `"operator": "IS_GREATER_THAN_OR_EQUAL_TO"`

### Date Operators
| Operator | Usage |
|----------|-------|
| IS_EQUAL_TO | Exact date |
| IS_BEFORE | Before date |
| IS_AFTER | After date |
| IS_WITHIN_LAST | Rolling window |
| IS_MORE_THAN_X_DAYS_AGO | Days ago |
| IS_LESS_THAN_X_DAYS_AGO | Within X days |

### Boolean Operators
| Operator | Usage |
|----------|-------|
| IS_EQUAL_TO | `"value": true` or `"value": false` |

## Operation Types

### Property Filter
```json
{
  "filterType": "PROPERTY",
  "property": "email",
  "operation": {
    "operationType": "STRING",
    "operator": "CONTAINS",
    "value": "@company.com"
  }
}
```

### operationType Reference
| operationType | For Properties |
|---------------|----------------|
| STRING | Text, single-line |
| MULTISTRING | Enumeration, checkbox |
| NUMBER | Number, currency |
| BOOL | Boolean/checkbox |
| DATE | Date properties |
| DATETIME | Date-time properties |
| UNIFIED_EVENTS | Event-based filters |

## Complex Filter Examples

### Multiple Conditions (AND)
```json
{
  "filterBranchType": "AND",
  "filterBranches": [],
  "filters": [
    {
      "filterType": "PROPERTY",
      "property": "lifecyclestage",
      "operation": {
        "operationType": "MULTISTRING",
        "operator": "IS_ANY_OF",
        "values": ["lead", "marketingqualifiedlead"]
      }
    },
    {
      "filterType": "PROPERTY",
      "property": "hs_email_domain",
      "operation": {
        "operationType": "STRING",
        "operator": "DOES_NOT_CONTAIN",
        "value": "gmail.com"
      }
    }
  ]
}
```

### Either/Or Conditions (OR branches)
```json
{
  "filterBranchType": "OR",
  "filterBranches": [
    {
      "filterBranchType": "AND",
      "filters": [/* condition set 1 */]
    },
    {
      "filterBranchType": "AND",
      "filters": [/* condition set 2 */]
    }
  ]
}
```

### Date Range Filter
```json
{
  "filterType": "PROPERTY",
  "property": "createdate",
  "operation": {
    "operationType": "DATE",
    "operator": "IS_BETWEEN",
    "lowerBoundTimestamp": 1609459200000,
    "upperBoundTimestamp": 1640995200000
  }
}
```

## Validation Checklist

Before submitting any filter:
- [ ] Top-level filterBranchType is "OR"
- [ ] All operators use enum names (not symbols)
- [ ] operationType matches property type
- [ ] Association IDs are correct (279 for Contact→Company)
- [ ] processingType is specified
- [ ] Nested AND branches have empty filterBranches array
