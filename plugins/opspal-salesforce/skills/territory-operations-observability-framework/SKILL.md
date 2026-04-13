---
name: territory-operations-observability-framework
description: Salesforce Territory2 runtime operations framework for testing, deployment activation, monitoring, and troubleshooting. Use when territory changes are moving through production lifecycle and require operational safeguards.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Territory Operations Observability Framework

## When to Use This Skill

Use this skill when:
- Territory2 model changes are moving toward production activation
- Monitoring territory assignment outcomes after deployment
- Troubleshooting territory-related account/user assignment failures
- Running pre-activation validation for territory hierarchy changes

**Not for**: Territory model design and planning (use `territory-management`), territory discovery/analysis (use `sfdc-territory-discovery` agent), or assignment wizard operations (use `/territory-assignment-wizard`).

## Pre-Activation Validation

```bash
# Verify Territory2Model exists and is in correct state
sf data query --query "SELECT Id, DeveloperName, ActivatedDate FROM Territory2Model WHERE DeveloperName = '<ModelName>'" --target-org <org>

# Count territories in model
sf data query --query "SELECT COUNT(Id) FROM Territory2 WHERE Territory2ModelId = '<ModelId>'" --target-org <org>

# Check user assignments
sf data query --query "SELECT Territory2Id, UserId, IsActive FROM UserTerritory2Association WHERE Territory2.Territory2ModelId = '<ModelId>'" --target-org <org>
```

## Health Monitoring Signals

| Signal | Query | Threshold |
|--------|-------|-----------|
| Unassigned accounts | `SELECT COUNT(Id) FROM Account WHERE Territory2Id = null` | Increasing trend |
| Empty territories | Territories with 0 account assignments | >10% of territories |
| User coverage gaps | Users with 0 territory assignments | Any active rep without territory |
| Assignment rule errors | Check deployment logs | Any errors post-activation |

## Incident Triage

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Accounts lost territory | Model reactivation cleared assignments | Re-run assignment rules |
| Users see wrong accounts | Hierarchy change propagation delay | Wait 15-30 min, verify sharing rules |
| Assignment rules not firing | Model not activated after deploy | Activate model in Setup |
| Territory sharing errors | Sharing rules conflict with territory model | Check org-wide defaults |

## Workflow

1. Run pre-activation queries to baseline current state
2. Deploy and activate territory changes
3. Monitor assignment signals for 48 hours post-activation
4. Triage any assignment anomalies using the incident table

## Routing Boundaries

Use this skill for runtime operations and monitoring.
Use `territory-management` for modeling and design methodology.

## References

- [testing and validation](./testing-validation.md)
- [deployment activation](./deployment-activation.md)
- [monitoring maintenance](./monitoring-maintenance.md)
- [troubleshooting guide](./troubleshooting-guide.md)
