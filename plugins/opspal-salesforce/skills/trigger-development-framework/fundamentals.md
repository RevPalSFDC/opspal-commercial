# Fundamentals

Primary source: `docs/runbooks/triggers/01-trigger-fundamentals.md`.

## Required intake

- Target object
- Required events (`before/after insert/update/delete/undelete`)
- Business invariants
- Failure tolerance and rollback plan

## Guardrails

- Keep trigger as thin router.
- Use one trigger per object.
- Branch by context variables, not by duplicated trigger files.
