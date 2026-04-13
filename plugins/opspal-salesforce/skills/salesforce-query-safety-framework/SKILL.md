---
name: salesforce-query-safety-framework
description: Salesforce query safety framework for SOQL and jq preflight validation, command linting, and prevention of unsafe query/transform patterns in hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Query Safety Framework

## When to Use This Skill

Use this skill when:
- Validating SOQL queries before execution in hooks
- Preventing dangerous query patterns (no WHERE clause, SELECT all fields)
- Linting `sf data query` commands for common mistakes
- Validating jq expressions that process query results

**Not for**: Large result pagination (use `soql-large-result-paging-framework`), query performance optimization (use `performance-optimization-guide`), or API quota tracking (use `salesforce-runtime-telemetry-and-api-quota-framework`).

## Dangerous Query Patterns

| Pattern | Risk | Hook Action |
|---------|------|-------------|
| No WHERE clause on large object | Full table scan, API limit exhaustion | Block with suggestion to add filter |
| `SELECT *` equivalent (all fields) | Excessive payload, performance | Warn: use specific fields |
| Unescaped user input in query | SOQL injection | Block: use parameterized patterns |
| Mixed operators in OR clause | Incorrect results | Auto-correct per CLAUDE.md rules |
| `LIKE` without wildcard | Behaves as exact match | Warn: use `=` instead |
| Nested subquery > 1 level | Governor limit risk | Warn: consider separate queries |

## SOQL Validation Checks

```bash
# Auto-corrected patterns (handled by pre-tool-execution hook):
# 1. ApiName → DeveloperName on FlowVersionView
# 2. Mixed LIKE/= operators in OR conditions
# 3. Missing --use-tooling-api for Tooling-only objects

# Tooling API objects that REQUIRE --use-tooling-api:
# FlowDefinition, FlowDefinitionView, FlowVersionView, ApexClass,
# ApexTrigger, ValidationRule, CustomField (metadata), ApexCodeCoverageAggregate
```

## jq Safety Checks

- Validate jq expression syntax before piping query results
- Check for `.result.records[]` path (standard sf CLI JSON structure)
- Handle empty result sets (`.records | length == 0`)

## Workflow

1. Parse the SOQL string from the tool call arguments
2. Check against dangerous pattern list
3. Apply auto-corrections for known fixable patterns
4. Return advisory or block decision with corrected query suggestion

## Routing Boundaries

Use this skill for hook validation of query command safety.
Use `performance-optimization-guide` for query tuning after safety passes.

## References

- [soql validator patterns](./soql-validator-patterns.md)
- [bash soql guardrails](./bash-soql-guardrails.md)
- [jq safety checks](./jq-safety-checks.md)
