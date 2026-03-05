# Bash SOQL Guardrails

Primary source: `hooks/pre-bash-soql-validator.sh`.

## Guardrails

- Detect SOQL in shell commands before execution.
- Validate org targeting and query shape.
- Provide corrective suggestions when blocking.
