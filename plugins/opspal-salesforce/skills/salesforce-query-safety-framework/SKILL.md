---
name: salesforce-query-safety-framework
description: Salesforce query safety framework for SOQL and jq preflight validation, command linting, and prevention of unsafe query/transform patterns in hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Query Safety Framework

Use this skill for query- and transform-safety validations before execution.

## Workflow

1. Parse command/query intent.
2. Validate SOQL safety and structure.
3. Validate jq expressions and data-shape assumptions.
4. Return blocking or advisory feedback.

## Routing Boundaries

Use this skill for hook validation of query command safety.
Use `performance-optimization-guide` for query tuning after safety passes.

## References

- [soql validator patterns](./soql-validator-patterns.md)
- [bash soql guardrails](./bash-soql-guardrails.md)
- [jq safety checks](./jq-safety-checks.md)
