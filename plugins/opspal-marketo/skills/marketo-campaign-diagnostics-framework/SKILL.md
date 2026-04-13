---
name: marketo-campaign-diagnostics-framework
description: Marketo campaign incident triage and diagnostics with structured intake, evidence-first root cause analysis, safe remediation ladder, and stakeholder communication. Use when smart campaigns fail or campaign behavior diverges from expectation.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
---

# Marketo Campaign Diagnostics Framework

## When to Use This Skill

- A smart campaign stopped triggering or is processing far fewer leads than expected
- Campaign flow steps are executing out of order or skipping steps entirely
- Email sends produced zero deliveries or unexpected suppression
- Token substitution failures are causing broken email content
- Campaign behavior diverged from expectation after a recent configuration change

**Not for**: lead-level routing path analysis (use `marketo-lead-routing-diagnostics`) or planned campaign launches (use `marketo-campaign-execution-operations`).

## Incident Severity Guide

| Symptom | Severity | First Action |
|---------|----------|-------------|
| Campaign fully stopped, 0 leads processed | P1 | Deactivate, snapshot Smart List, escalate |
| >50% leads skipping a flow step | P2 | Check filter logic and flow step constraints |
| Token not resolving in email | P2 | Audit program-level token definitions |
| Delayed processing (>2 hr lag) | P3 | Check API queue depth and concurrency limit |
| Single lead missing from flow | P4 | Trace lead activity log and membership |

## Workflow

1. **Intake and scope**: collect campaign ID, symptom description, first-observed time, affected lead count, and any recent configuration changes.
2. **Snapshot evidence**: call `mcp__marketo__campaign_get` and `mcp__marketo__campaign_get_smart_list` to capture current state before any changes.
3. **Run diagnostic sequence**: check Smart List rule evaluation (Are leads qualifying?), flow step constraints (Are wait steps or limits blocking?), email approval status, and token resolution.
4. **Reconstruct activity timeline**: use `mcp__marketo__analytics_activity_trace_window` on a sample of affected leads to identify where in the flow leads dropped off.
5. **Form root cause hypothesis**: match evidence to a known failure pattern (filter logic error, asset not approved, API rate limit, token missing).
6. **Propose remediation**: present the specific fix with before/after impact; require explicit approval before any write operation.
7. **Validate and document**: rerun a test lead through the campaign, confirm expected flow execution, and record resolution in the incident log.

## Routing Boundaries

Use this skill for campaign-level incidents.
Use `marketo-lead-routing-diagnostics` for lead routing timeline and race-condition analysis.
Use `marketo-smart-campaign-api-reference` for endpoint lookup only.

## References

- [incident intake and routing](./incident-intake-routing.md)
- [diagnostic sequences](./diagnostics-sequences.md)
- [safe remediation](./safe-remediation.md)
- [communication patterns](./communication-patterns.md)
