# Remediation and Audit Payload

Primary source: `docs/runbooks/lead-routing-diagnostics/06-safe-remediation-playbook.md`.

## Safety controls

- Read-only default.
- Confirmation before each write.
- Idempotency key.
- Before/after snapshots.

## Required audit fields

- Incident ID
- Idempotency key
- Confirmation timestamp
- Write actions performed
