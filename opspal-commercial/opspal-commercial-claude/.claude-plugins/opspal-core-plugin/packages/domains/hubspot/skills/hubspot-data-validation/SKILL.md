---
name: hubspot-data-validation
description: HubSpot Lists API validation patterns and common error prevention. Use when creating or updating lists, filtering contacts, validating property rules, handling list membership criteria, or troubleshooting Lists API errors. Provides error taxonomy, filter syntax reference, and proven solutions.
allowed-tools: Read, Grep, Glob
---

# HubSpot Data Validation

## When to Use This Skill

- Creating or updating HubSpot lists programmatically
- Debugging Lists API errors (400 Bad Request)
- Validating filter criteria before API calls
- Understanding HubSpot's filter syntax requirements
- Preventing common Lists API mistakes

## Quick Reference

### Top 4 Lists API Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Wrong Association ID | Using 280 instead of 279 | Use `CONTACT_TO_COMPANY: 279` |
| Invalid Operator | Using `>=` instead of enum | Use `IS_GREATER_THAN_OR_EQUAL_TO` |
| Missing operationType | Omitting required field | Always include `"operationType": "UNIFIED_EVENTS"` |
| Invalid Filter Structure | Wrong nesting | Use OR-with-nested-AND pattern |

### Correct Filter Structure

```json
{
  "filterBranch": {
    "filterBranchType": "OR",
    "filterBranches": [
      {
        "filterBranchType": "AND",
        "filterBranches": [],
        "filters": [/* your filters here */]
      }
    ]
  }
}
```

### Validation Commands

```bash
# Validate list definition before API call
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-list-validator.js validate <list-json>

# Test filter syntax
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/hubspot-filter-tester.js test <filter-json>
```

## Detailed Documentation

See supporting files:
- `property-rules.md` - Property validation requirements
- `list-membership.md` - List criteria patterns
- `filter-patterns.md` - Filter syntax reference
- `import-validation.md` - Batch import rules
