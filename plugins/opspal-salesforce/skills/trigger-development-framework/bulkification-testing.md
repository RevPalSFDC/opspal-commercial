# Bulkification and Testing

Primary sources:
- `docs/runbooks/triggers/03-bulkification-best-practices.md`
- `docs/runbooks/triggers/04-testing-code-coverage.md`

## Bulk rules

- Operate on collections only.
- Query outside loops.
- DML outside loops.
- Handle mixed-record input states.

## Test minimums

- Single-record happy path.
- 200-record bulk transaction.
- Negative/failure path.
- Idempotency or recursion behavior.
