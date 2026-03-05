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

Use this skill for incident triage and remediation of campaign failures.

## Workflow

1. Capture incident intake and severity.
2. Run deterministic diagnostic sequence.
3. Identify likely root cause with evidence.
4. Propose remediation and request confirmation for writes.
5. Validate and document resolution.

## Routing Boundaries

Use this skill for campaign-level incidents.
Use `marketo-lead-routing-diagnostics` for lead routing timeline/race analysis.
Use `marketo-smart-campaign-api-reference` for endpoint lookup only.

## References

- [incident intake and routing](./incident-intake-routing.md)
- [diagnostic sequences](./diagnostics-sequences.md)
- [safe remediation](./safe-remediation.md)
- [communication patterns](./communication-patterns.md)
