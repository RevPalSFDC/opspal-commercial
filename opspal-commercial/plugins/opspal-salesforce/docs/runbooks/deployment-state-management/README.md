# Deployment State Management Runbook

This runbook addresses stateful deployment operations, state verification between cycles, and idempotent deployment patterns derived from 18+ reflection incidents.

## Overview

| Metric | Value |
|--------|-------|
| Reflection Count | 18 |
| Primary Cohort | idempotency/state |
| Priority | P0 |
| Annual ROI | $54,000 |
| Root Cause | No deployment state management framework |

## Contents

1. [Deployment Lifecycle](./01-deployment-lifecycle.md)
2. [State Verification](./02-state-verification.md)
3. [Idempotent Patterns](./03-idempotent-patterns.md)
4. [Parallel Operation Barriers](./04-parallel-barriers.md)
5. [Rollback Procedures](./05-rollback-procedures.md)

## Quick Reference

### The State Management Problem

From reflection data: "Multiple deploy-retrieve-fix cycles caused confusion about which flow versions were active and what state the org was in."

### Deployment Lifecycle Stages

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   RETRIEVE  │ ──▶ │   COMPARE   │ ──▶ │  VALIDATE   │
│  Current    │     │  Local vs   │     │  Pre-deploy │
│  Org State  │     │  Org Diff   │     │  Checks     │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CONFIRM   │ ◀── │   VERIFY    │ ◀── │   DEPLOY    │
│  Success    │     │  Post-deploy│     │  Execute    │
│  Handoff    │     │  State      │     │  Changes    │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Key Commands

```bash
# Full lifecycle deployment
node scripts/lib/stateful-deployment-orchestrator.js deploy \
  --source ./force-app \
  --target production \
  --verify

# State verification only
sf project retrieve start --target-org production --metadata Flow:My_Flow
sf data query --query "SELECT Status FROM FlowVersionView WHERE FlowDefinitionId = 'XXX'" --use-tooling-api

# Idempotent re-deployment
node scripts/lib/stateful-deployment-orchestrator.js redeploy \
  --component My_Flow \
  --ensure-active
```

### Pre-Deployment Checklist

- [ ] Retrieved current org state
- [ ] Generated diff between local and org
- [ ] Validated all dependencies present
- [ ] Confirmed deployment plan with user
- [ ] Set up rollback checkpoint

### Post-Deployment Checklist

- [ ] Queried org to verify deployment status
- [ ] Confirmed active versions match expected
- [ ] Tested affected functionality
- [ ] Updated runbook with observations
- [ ] Cleared rollback checkpoint (or executed rollback)

## Common Issues Addressed

| Issue | Cause | Prevention |
|-------|-------|------------|
| "Which version is active?" | No post-deploy verification | Query FlowVersionView after deploy |
| "Deploy seems stuck" | No state visibility | Add progress tracking |
| "Rolled back wrong version" | No checkpoint management | Use labeled rollback points |
| "Orphan deletion failed" | Race condition | Parallel operation barriers |

## Idempotency Principles

### What is Idempotent Deployment?

> An idempotent deployment produces the same result regardless of how many times it's executed.

### Why It Matters

From [industry research](https://www.rajnishkumarjha.com/understanding-idempotent-configuration-in-devops/):
- **Consistency**: System ends up in same state regardless of starting point
- **Reliability**: Automated pipelines can run repeatedly without manual intervention
- **Recovery**: Failed deployments can be re-run safely

### Idempotency Patterns for Salesforce

| Pattern | Implementation |
|---------|---------------|
| Upsert over Insert | Use External ID for custom objects |
| Check-then-deploy | Query state before deploying |
| Stateless components | Avoid sequence dependencies |
| Declarative over imperative | Metadata API over Apex for config |

## Sources

- [Gearset: Salesforce Deployment Best Practices](https://gearset.com/blog/salesforce-deployment-best-practices/)
- [Hutte: Salesforce DevOps Guide 2024](https://hutte.io/trails/salesforce-devops/)
- [Salesforce: DevOps Best Practices](https://www.salesforce.com/platform/devops-tools/what-is-devops/devops-best-practices/)
- [State of Salesforce DevOps 2024](https://gearset.com/devops-report/2024/)
