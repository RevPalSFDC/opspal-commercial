# Marketo Governance Runbook Series

**Version**: 1.0.0
**Status**: Draft for live verification
**Last Updated**: 2026-01-07
**Series Completion**: 100% (4 of 4 runbooks)

---

## Overview

This series defines RevPal's governance and health operating model for Marketo Engage (Prime tier). It is designed to be manual-first, with clear evidence sources and validation steps that can be executed in the Marketo UI. Automation hooks are referenced only where stable and optional.

**Outcomes**:
- Consistent governance controls across sandbox and production
- Reliable health baselines and audit cadence
- Repeatable operational workflows with rollback steps
- Troubleshooting playbooks and known pitfalls

---

## Runbooks in This Series

### 01. Instance Health and Governance Foundations
**File**: `01-instance-health-governance-foundations.md`

**Purpose**: Establish governance controls, instance standards, and baseline health checks.

---

### 02. Automation and Performance Guardrails
**File**: `02-automation-performance-guardrails.md`

**Purpose**: Prevent trigger overload, enforce qualification rules, and protect campaign queue performance.

---

### 03. Operational Workflows and Incident Response
**File**: `03-operational-workflows-incident-response.md`

**Purpose**: Provide step-by-step workflows for sandbox to prod deployment, audits, and incidents.

---

### 04. Troubleshooting, Pitfalls, and SFDC Mapping
**File**: `04-troubleshooting-pitfalls-sfdc-mapping.md`

**Purpose**: Resolve common issues, avoid pitfalls, and reference Marketo to Salesforce object mapping.

---

## Quick Start

1. **Start with Runbook 01** to align on standards and baselines.
2. **Use Runbook 02** before adding or changing automation.
3. **Follow Runbook 03** for deployments and incidents.
4. **Reference Runbook 04** when diagnosing issues or planning SFDC alignment.

---

## Cross-References

- **Quarterly Audit**: `../assessments/quarterly-audit-procedure.md`
- **API Optimization**: `../performance/api-optimization-guide.md`
- **Trigger Campaign Best Practices**: `../campaign-operations/trigger-campaign-best-practices.md`
- **Salesforce Sync Troubleshooting**: `../integrations/salesforce-sync-troubleshooting.md`
- **Campaign Diagnostics**: `../campaign-diagnostics/README.md`

---

## Validation Notes

This series is validated manually in production environments. Record evidence in:

```
portals/{instance}/governance/
├── audits/
├── incident-logs/
└── evidence/
```

## Automation Entry Point

Use the governance audit collector for hybrid checks:

```
node scripts/lib/governance-audit-collector.js --instance production --mode hybrid --required-tags "Region,Product Line" --evidence-file portals/production/governance/evidence/evidence.json
```

Evidence template:

```
docs/runbooks/governance/templates/governance-evidence-template.json
```
