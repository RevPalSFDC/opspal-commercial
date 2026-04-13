---
name: marketo-campaign-execution-operations
description: Marketo campaign execution operations for activation readiness, email blast delivery, webinar and engagement program launches, and lead quality bulk operations. Use when running day-to-day campaign production workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Task
---

# Marketo Campaign Execution Operations

## When to Use This Skill

- Activating a new smart campaign or batch email blast for the first time
- Launching a webinar or event program (registration, confirmation, reminder sequence)
- Running a lead quality bulk operation (score reset, status update, list import before activation)
- Executing the day-of send workflow including final suppression checks and seed list validation
- Monitoring first-hour delivery health and deciding whether to continue or abort a send

**Not for**: debugging a campaign that is already live and misbehaving (use `marketo-campaign-diagnostics-framework`) or designing campaign logic from scratch (use `marketo-campaign-builder`).

## Pre-Launch Checklist Summary

| Gate | Check | Block if Failed |
|------|-------|----------------|
| Asset approval | Email, LP, and form all approved | Yes |
| Smart List size | Estimated audience within expected range | Yes |
| Suppression lists | Unsubscribes and bounces excluded | Yes |
| Tokens | All program tokens defined and non-empty | Yes |
| Seed list | Internal addresses in CC/BCC | No (warn) |
| Communication limit | Campaign exempt or within daily cap | Yes |
| Test send | Rendered correctly in at least 2 clients | Yes |

## Workflow

1. **Run activation readiness check**: verify all assets are approved, tokens populated, and Smart List returns expected lead count.
2. **Confirm suppression**: validate that global unsubscribe, hard-bounce, and marketing-suspended lists are applied as flow filters or Smart List exclusions.
3. **Execute the send or activation**: for batch, call `mcp__marketo__campaign_schedule`; for trigger, call `mcp__marketo__campaign_activate`. For programs, ensure asset approval order: Form → Email → Landing Page.
4. **Monitor first-hour health**: check delivery rate, open rate, and bounce rate at 15 and 60 minutes post-send. Flag if delivery rate drops below 80%.
5. **Assess first-day performance**: compare against historical benchmarks; identify segments with low engagement for follow-up.
6. **Execute follow-up operations**: queue re-send to non-openers, route high-engagement leads to sales, and update program statuses in Marketo.

## Routing Boundaries

Use this skill for campaign operations and planned launches.
Use `marketo-campaign-diagnostics-framework` for active incidents and root-cause investigations.
Use `marketo-rollout-gates-framework` before any high-risk production activation.

## References

- [activation checklist](./activation-checklist.md)
- [email blast operations](./email-blast-operations.md)
- [webinar and program operations](./webinar-program-operations.md)
- [lead quality and bulk operations](./lead-quality-bulk-ops.md)
