---
name: slo-sla-operations-guard
description: Classify SLO and SLA breaches, assign response priority, and map remediation workflows.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:realtime-dashboard-coordinator
version: 1.0.0
---

# slo-sla-operations-guard

## When to Use This Skill

- An alert fires indicating Gong sync latency, Salesforce API failure rate, or HubSpot webhook freshness is outside defined objectives
- Classifying whether a metric breach is transient (single spike) or sustained (trend exceeding the error budget) before escalating
- Mapping a detected breach to the correct response priority and runbook path based on service criticality
- Producing the escalation decision record that feeds into the incident commander workflow
- Reviewing and updating SLO/SLA definitions when thresholds need recalibration after a postmortem

**Not for**: Real-time monitoring infrastructure setup — this skill operates on breach data that has already been detected and surfaced by monitoring tools.

## SLO Breach Classification

| Breach Type | Condition | Response Priority |
|-------------|-----------|-----------------|
| Error rate | >1% failures sustained >5 min | P1 — escalate immediately |
| Latency | p99 >5s sustained >10 min | P2 — investigate, alert IC |
| Freshness | Data staleness >30 min for critical pipelines | P2 — escalate if no recovery |
| Error budget burn | >20% of monthly budget in 1 hour | P1 — freeze non-critical deploys |
| Transient spike | Single breach, auto-recovered <2 min | P4 — log only, no escalation |

## Workflow

1. Load the SLO/SLA definitions for the affected service — confirm thresholds, error budget, and escalation contacts are current.
2. Pull current metrics: retrieve the specific failure-rate, latency percentile, or freshness value that triggered the alert.
3. Classify the breach: determine if it is transient (auto-recovered) or sustained (still breaching); apply the classification table above.
4. Check error budget: calculate remaining budget for the current window — if <20% remains, freeze non-essential deploys regardless of current breach status.
5. Generate the priority response plan: assign the response tier, cite the relevant runbook, and identify the escalation owner.
6. Produce the escalation decision record with all supporting evidence and hand off to the incident commander (see `incident-commander-checklist`).

## Safety Checks

- Apply policy thresholds consistently — do not adjust severity based on time of day or subjective assessment
- Separate transient from sustained breaches before escalating: a single spike that auto-recovered does not warrant a P1 response
- Require objective metric evidence (timestamped values from monitoring system) for every classification decision
