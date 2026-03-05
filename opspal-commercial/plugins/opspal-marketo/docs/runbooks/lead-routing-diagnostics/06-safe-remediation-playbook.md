# 06 - Safe Remediation Playbook

## Default Safety Policy

- Read-only by default
- Explicit confirmation required for each write
- Idempotency key and before/after snapshots required

## Remediation Ladder

1. Contain:
   - deactivate suspected trigger campaign(s) when active loop is ongoing
2. Correct state:
   - update routing fields
   - add/remove static list gate
   - update program member status
3. Reprocess:
   - request trigger campaign for targeted lead set
4. Validate:
   - confirm expected activity and final state

## Preferred Write Primitives

- campaign activate/deactivate
- campaign request/schedule
- list add/remove
- program member add/update
- lead update/merge

## Required Audit Payload

- incident ID
- idempotency key
- operator confirmation timestamp
- write operations executed
- before/after snapshots
