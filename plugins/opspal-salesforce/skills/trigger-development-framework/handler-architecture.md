# Handler Architecture

Primary source: `docs/runbooks/triggers/02-handler-pattern-architecture.md`.

## Standard pattern

- `Trigger` file handles event dispatch only.
- `Handler` classes own domain logic.
- Shared services own DML/query operations.
- Recursion guard prevents re-entry loops.

## Review checklist

- No business logic in trigger body.
- No hardcoded IDs.
- No cross-object side effects without explicit requirement.
