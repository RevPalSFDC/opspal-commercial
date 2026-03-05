# jq Safety Checks

Primary source: `hooks/pre-bash-jq-validator.sh`.

## Checks

- Ensure jq filters are present and valid.
- Catch common null/shape assumptions.
- Enforce predictable parsing patterns in automation scripts.
