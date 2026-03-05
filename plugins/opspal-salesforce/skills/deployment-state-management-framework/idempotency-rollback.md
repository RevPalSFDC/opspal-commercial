# Idempotency and Rollback

Primary source: `docs/runbooks/deployment-state-management/README.md`.

## Idempotency rules

- Re-running deployment should converge on same target state.
- Avoid non-deterministic sequencing without barriers.

## Rollback rules

- Predefine rollback criteria.
- Tie rollback to named checkpoint.
