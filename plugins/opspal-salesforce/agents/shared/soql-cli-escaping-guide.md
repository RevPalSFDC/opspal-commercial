# SOQL CLI Escaping Guide

**MANDATORY for all SOQL queries via CLI**: Use shell-safe operators.

## Why This Matters

**Root Cause (P3 - Reflection Cohort tool-contract)**: Bash shell escapes `!=` as `\!=` which Salesforce SOQL parser rejects.

**Blast Radius**: LOW - Query failures, not data corruption.

## Required Pattern

```sql
-- WRONG - != gets escaped by bash as \!=
WHERE Status != 'Closed'

-- CORRECT - <> is shell-safe and SOQL-equivalent
WHERE Status <> 'Closed'
```

## Full Operator Reference

| Operator | Shell Safety | Recommendation |
|----------|-------------|----------------|
| `=` | Safe | Use as-is |
| `<>` | Safe | **Preferred for not-equal** |
| `!=` | UNSAFE | Avoid - use `<>` instead |
| `<` | Safe | Use as-is |
| `>` | Safe* | Quote the query string |
| `<=` | Safe | Use as-is |
| `>=` | Safe | Use as-is |
| `LIKE` | Safe | Use as-is |
| `IN` | Safe | Use as-is |

## Examples

```bash
# WRONG - bash escapes !=
sf data query -o my-org --query "SELECT Id FROM Account WHERE Status != 'Active'"
# Error: MALFORMED_QUERY

# CORRECT - use <>
sf data query -o my-org --query "SELECT Id FROM Account WHERE Status <> 'Active'"
# Success!

# ALSO CORRECT - escape the entire query
sf data query -o my-org --query 'SELECT Id FROM Account WHERE Status != '"'"'Active'"'"''
# Works but harder to read - prefer <>
```

## Programmatic Query Building

When building SOQL programmatically, use the query validator:

```javascript
const { validateQuery } = require('./scripts/lib/smart-query-validator');

// Auto-converts != to <>
const safeQuery = validateQuery(orgAlias, query, { autoFix: true });
```

## Quick Validation

```bash
# Validate query before execution
node scripts/lib/smart-query-validator.js <org> "<query>"
```

## See Also

- `scripts/lib/smart-query-validator.js` - Query validation with auto-fix
- `agents/sfdc-query-specialist.md` - Query building agent

---
**Source**: Reflection Cohort - tool-contract (P3)
**Version**: 1.0.0
**Date**: 2026-01-30
