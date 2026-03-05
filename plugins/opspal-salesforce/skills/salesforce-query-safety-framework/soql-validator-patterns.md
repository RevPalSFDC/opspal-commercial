# SOQL Validator Patterns

Primary source: `hooks/pre-soql-validation.sh`.

## Validation focus

- Missing limit/filters for high-volume objects.
- Disallowed destructive follow-up patterns.
- Syntax and context sanity checks.
