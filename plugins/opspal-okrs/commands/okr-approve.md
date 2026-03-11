---
name: okr-approve
description: Approve and activate a draft OKR set, freeze the cycle baseline, and trigger downstream execution handoff
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> [--draft <path>] [--owner <name>] [--effective-date <YYYY-MM-DD>] [--activate-asana]"
intent: Move a draft OKR set into an approved active state after scoring, ownership, and evidence checks are complete.
dependencies: [opspal-okrs:okr-strategy-orchestrator, scored_or_ranked_initiatives, draft_cycle_artifact]
failure_modes: [draft_missing, approval_gate_not_met, owner_missing, asana_sync_failed]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - approve-okrs
  - activate-okrs
tags:
  - okr
  - approval
  - workflow
---

# /okr-approve Command

Approve a draft OKR set and move the cycle into active execution. This command is the formal approval gate after generation, scoring, and prioritization are complete.

## Usage

```bash
# Approve the default draft for a cycle
/okr-approve --org acme-corp --cycle Q3-2026

# Approve a specific draft file and assign an accountable owner
/okr-approve --org acme-corp --cycle Q3-2026 --draft ./drafts/okr-draft-q3.json --owner "VP Revenue"

# Activate execution handoff to Asana
/okr-approve --org acme-corp --cycle Q3-2026 --activate-asana
```

## What This Does

1. **Loads the selected draft** and validates it against cycle context
2. **Checks approval inputs** including objective ownership, initiative priorities, and evidence coverage
3. **Freezes the approved baseline** so future tracking compares against a stable target set
4. **Activates downstream workflows** including status tracking and optional Asana project sync
5. **Publishes an approval summary** with the approved scope, owners, and effective date

## Approval Gate Checklist

- Objectives have named owners
- Key Results have baselines and target stances
- Priority initiatives have been scored or ranked
- Material evidence gaps are documented
- Effective date and cycle scope are explicit

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Approved OKR set | `orgs/{org}/platforms/okr/{cycle}/approved/okr-{cycle}.json` | Frozen active-cycle baseline |
| Approval summary | `orgs/{org}/platforms/okr/{cycle}/reports/okr-approval-{cycle}.md` | Human-readable signoff summary |

## Execution

This command invokes the `okr-strategy-orchestrator` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-strategy-orchestrator',
  prompt: `Approve and activate OKRs for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Draft: ${draft || 'default cycle draft'}
    Owner: ${owner || 'existing draft owners'}
    Effective date: ${effectiveDate || 'today'}
    Activate Asana: ${activateAsana ? 'yes' : 'no'}

    Follow the approval workflow:
    1. Validate draft completeness
    2. Confirm initiative scoring and prioritization are represented
    3. Freeze approved baseline
    4. Trigger activation handoff and publish approval summary`
});
```

## Related Commands

- `/okr-generate` - Create the draft OKR set
- `/okr-score-initiative` - Evaluate proposed initiatives before approval
- `/okr-prioritize` - Finalize the initiative stack
- `/okr-status` - Track the approved cycle after activation
