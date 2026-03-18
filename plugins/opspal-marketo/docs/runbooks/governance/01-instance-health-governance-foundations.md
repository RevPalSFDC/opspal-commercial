# Instance Health and Governance Foundations

## Purpose

Establish the governance controls, instance standards, and baseline health checks required to keep a Marketo Engage (Prime) instance stable, compliant, and scalable.

## Scope

- Applies to production and sandbox instances
- Manual-first execution with UI evidence
- Covers governance controls, instance standards, and health baselines

## Roles and Responsibilities

| Role | Primary Responsibilities | Evidence Owner |
|------|--------------------------|----------------|
| Marketo Admin | Governance controls, approvals, access, audit trail | Admin export logs |
| RevOps Ops Lead | Health baselines, audit cadence, incident escalation | Governance evidence |
| Campaign Manager | Naming, folders, tokens, approvals | Program documentation |
| Integration Owner | API users, sync health, field mapping | Sync logs |
| Compliance Lead | Data retention, opt-out governance | Compliance log |

## Governance Controls (Prime Tier)

### 1. Audit Trail
**Purpose**: Track asset, user, and configuration changes.

**Manual Check**:
- Admin > Audit Trail (Security)
- Export monthly CSV for 6-month retention

**Evidence**:
- `portals/{instance}/governance/evidence/audit-trail-{date}.csv`

### 2. Campaign Inspector
**Purpose**: Locate trigger usage and risky flow steps.

**Manual Check**:
- Admin > Treasure Chest > Campaign Inspector (enable if needed)
- Search for risky steps (Change Data Value, Sync to CRM)

**Evidence**:
- Screenshot of findings or export summary

### 3. Notifications and Alerts
**Purpose**: Surface system issues (sync errors, idle triggers, failures).

**Manual Check**:
- Top nav bell icon
- Review weekly and after deployments

**Evidence**:
- Screenshot with date or summary log

### 4. Communication Limits
**Purpose**: Prevent over-emailing and protect deliverability.

**Manual Check**:
- Admin > Communication Limits
- Verify defaults and exceptions

**Evidence**:
- Screenshot and recorded limit values

### 5. Smart Campaign Qualification Rules
**Purpose**: Prevent repeated or runaway execution.

**Manual Check**:
- Each trigger campaign must specify qualification rules
- Avoid "Every time" unless justified

**Evidence**:
- List of exceptions and owner approvals

### 6. Idle Trigger Auto-Cleanup
**Purpose**: Reduce load by deactivating dormant triggers.

**Manual Check**:
- Review notifications about idle triggers
- Validate deactivations against program lifecycle

**Evidence**:
- Deactivation log with approvals

### 7. Workspaces and Partitions
**Purpose**: Enforce access boundaries without duplicating data.

**Manual Check**:
- Admin > Workspaces and Partitions
- Review workspace access quarterly

**Evidence**:
- Workspace access matrix

### 8. Templates, Tags, and Channels
**Purpose**: Enforce consistent program design and reporting.

**Manual Check**:
- Admin > Tags
- Ensure required tags are configured and enforced

**Evidence**:
- Tag and channel inventory export

### 9. Field Management
**Purpose**: Control data integrity and source restrictions.

**Manual Check**:
- Admin > Field Management
- Review blocked updates and field usage

**Evidence**:
- Field inventory snapshot

### 10. Asset Approvals
**Purpose**: Ensure content review before use.

**Manual Check**:
- Design Studio and Marketing Activities
- Confirm approval workflow and owners

**Evidence**:
- Approval checklist for production assets

## Instance Standards

### Naming Convention
**Format**: `YYYY-QX [Program Type] - [Campaign Name]`

**Examples**:
- `2026-Q1 Webinar - Product Launch`
- `2026-Q1 Nurture - Trial Follow Up`
- `Evergreen Ops - Data Hygiene`

### Folder Structure
```
Marketing Activities/
├── 2026/
│   ├── Q1/
│   ├── Q2/
├── Operational/
├── Shared Assets/
└── Archive/
```

### Tags and Channels
- Require at least: Region, Product Line, Campaign Type
- Enforce channel status consistency for reporting

### Tokens and Snippets
- Use tokens for environment-specific values
- Use snippets for legal and footer content
- Review quarterly for stale content

## Data Governance

### Data Retention
- Activity retention: 25 months default
- Export critical activities monthly if longer retention needed

### Duplicate Prevention
- Enforce dedupe on email or external ID
- Avoid multi-partition duplicates

### Unsubscribe Governance
- Use Durable Unsubscribe
- Maintain global suppression list

## Security and Compliance

- API users must be API-only with least privilege
- IP allowlist for API users when available
- Quarterly user access review
- Document data deletion requests and approvals

## Health Baselines

Establish baselines in the first audit, then alert on deviations.

| Area | Baseline Source | Alert Signal |
|------|-----------------|--------------|
| Trigger count | Campaign Inspector | +30% in 30 days |
| Campaign queue | Campaign Queue UI | Persistent backlog |
| API usage | Admin > Web Services | >80% daily quota |
| Sync latency | Admin > Salesforce | >15 min average |
| Bounce rate | Email Performance | >5% hard bounce |
| Duplicate rate | Lead report | >2% duplicates |

## Cadence

### Daily
- Check Notifications
- Review campaign queue for backlog

### Weekly
- Review active triggers
- Check communication limits impact

### Monthly
- Export Audit Trail
- Review API usage trends

### Quarterly
- Full instance audit
- Review workspace access
- Update governance standards

## Pre-Change Governance Checklist

- [ ] Change ticket and owner recorded
- [ ] Sandbox test completed
- [ ] Dependencies validated (fields, tags, templates)
- [ ] Rollback plan documented
- [ ] Approval recorded
- [ ] Evidence saved in governance folder

## Operationalization

Use the governance audit command to combine manual evidence with automated checks:

```
/marketo-governance-audit [instance] --mode=hybrid --required-tags=Region,Product Line
```

Evidence template:

```
docs/runbooks/governance/templates/governance-evidence-template.json
```

Generated reports are stored in:

```
portals/{instance}/governance/audits/
```

## Related Runbooks

- `../assessments/quarterly-audit-procedure.md`
- `../campaign-operations/trigger-campaign-best-practices.md`
- `../performance/api-optimization-guide.md`
- `../integrations/salesforce-sync-troubleshooting.md`
- `../campaign-diagnostics/README.md`
