---
description: Run comprehensive audit of Marketo instance covering leads, programs, and sync
argument-hint: "[instance] [--scope=full|quick] [--focus=leads|programs|campaigns|emails|sync]"
---

# Full Marketo Instance Audit

Run a comprehensive audit of your Marketo instance covering lead quality, program performance, automation health, and email deliverability.

## Usage

```
/marketo-audit [instance] [--scope=full|quick] [--focus=area]
```

## Parameters

- `instance` - (Optional) Instance ID to audit. Uses current instance if not specified.
- `--scope` - Audit scope: `full` (all areas) or `quick` (key metrics only)
- `--focus` - Focus on specific area: `leads`, `programs`, `campaigns`, `emails`, `sync`

## What This Command Does

1. **Lead Quality Analysis**
   - Database health and completeness
   - Duplicate detection
   - Stale lead identification
   - Scoring model validation

2. **Program Performance**
   - ROI by program and channel
   - Success rate analysis
   - Attribution modeling
   - Cost efficiency metrics

3. **Automation Health**
   - Smart campaign inventory
   - Trigger conflict detection
   - Cascade dependency mapping
   - Execution order analysis

4. **Email Deliverability**
   - Bounce and spam rates
   - Engagement trends
   - Compliance audit (CAN-SPAM, GDPR)
   - Template quality review

5. **Sync Health** (if SFDC connected)
   - Connection status
   - Error rate analysis
   - Field mapping validation
   - Queue depth check

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MARKETO INSTANCE AUDIT REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instance: production-instance
Audit Date: 2025-12-05
Scope: Full

## Overall Health Score: 78/100 (Good)

| Area | Score | Status |
|------|-------|--------|
| Lead Quality | 82 | ✅ Good |
| Program ROI | 71 | ⚠️ Fair |
| Automation | 85 | ✅ Good |
| Deliverability | 74 | ⚠️ Fair |
| Sync Health | 79 | ✅ Good |

## Critical Issues (3)
1. [HIGH] 15% bounce rate on newsletter emails
2. [HIGH] 3 trigger campaigns with circular dependencies
3. [MEDIUM] 25% of leads have no activity in 180+ days

## Top Recommendations
1. Clean up 12,500 stale leads (no activity >180 days)
2. Review and fix circular campaign dependencies
3. Implement email validation on forms
```

## Related Agents

This command orchestrates the following agents:
- `marketo-lead-quality-assessor`
- `marketo-program-roi-assessor`
- `marketo-automation-auditor`
- `marketo-email-deliverability-auditor`
- `marketo-sfdc-sync-specialist` (if applicable)

## Output Location

Reports are saved to:
```
portals/{instance}/assessments/
├── full-audit-{date}.json
├── full-audit-{date}.md
└── full-audit-{date}-executive-summary.md
```

## Related Commands

- `/marketo-governance-audit` - Governance audit and evidence collection
- `/marketo-preflight` - Pre-operation validation
