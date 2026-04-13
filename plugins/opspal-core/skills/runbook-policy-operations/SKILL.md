---
name: runbook-policy-operations
description: Operate hook-based runbook policy injection and compliance checks for operational workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# runbook-policy-operations

## When to Use This Skill

- A hook needs to inject the correct domain runbook reference into Claude's context at session start or task start
- A post-task compliance check must verify that a runbook was consulted before a high-risk operation (deployment, bulk delete) was executed
- Runbook reminders are not surfacing consistently — sometimes shown, sometimes skipped — and the injection logic needs hardening
- A new operational domain (e.g., Attio CRM, n8n automation) needs runbook policy hooks wired up for the first time
- The `Stop` hook must emit a compliance summary confirming which runbooks were referenced during the session

**Not for**: authoring runbook content — use `runbook-domain-router` for routing to the right runbook or the runbook-specific agents for content generation.

## Runbook Injection Policy

| Trigger Condition | Injected Runbook Reference | Injection Point |
|------------------|---------------------------|----------------|
| Task involves Salesforce deploy | `opspal-salesforce:operations-readiness-framework` | PreToolUse on `sf deploy` |
| Task involves bulk data operation | `opspal-core:batch-operation-advisory-framework` | PreToolUse on `Bash` with bulk keyword |
| Session starts with RevOps audit intent | `opspal-salesforce:revops-assessment-framework` | Session start hook |
| Task involves territory or quota | `opspal-gtm-planning:gtm-annual-planning-framework` | Routing hook on GTM keywords |
| Post-task on any production change | Compliance summary referencing consulted runbooks | `Stop` hook |

## Workflow

1. **Identify the injection trigger**: read the hook trigger surface — which tool, event type, and keyword pattern should activate the runbook injection.
2. **Select the correct runbook reference**: consult `./runbook-injection.md` for the canonical mapping of trigger conditions to runbook identifiers; do not infer the runbook from context alone.
3. **Implement injection**: in the hook script, append the runbook reference to the prompt context using the standard injection envelope:
   ```json
   {"type": "runbook_reminder", "runbook": "opspal-salesforce:operations-readiness-framework", "reason": "Salesforce deploy detected"}
   ```
4. **Validate injection timing**: confirm the injection fires before the risky tool executes (PreToolUse), not after; PostToolUse injection is for compliance logging only.
5. **Implement reminder enforcement**: configure `./reminder-enforcement.md` rules to re-inject the runbook reference if the user proceeds past a warning without acknowledging it.
6. **Add post-task compliance check**: in the `Stop` hook, verify session logs show at least one runbook reference for each high-risk operation class; emit a compliance summary using the format in `./compliance-checks.md`.
7. **Test injection and compliance paths**: confirm (a) runbook is injected on trigger, (b) compliance check passes when runbook was consulted, (c) compliance check fails gracefully when runbook was skipped.

## Routing Boundaries

Use this skill for runbook policy injection hooks and post-task compliance verification.
Defer to `runbook-domain-router` for routing ambiguous requests to the correct runbook domain, and to `runbook-linkage-linter` for validating runbook reference integrity.

## References

- [Runbook Injection Operations](./runbook-injection.md)
- [Runbook Reminder Enforcement](./reminder-enforcement.md)
- [Post-Task Compliance Checks](./compliance-checks.md)
