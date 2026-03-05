---
description: Run a governance audit with manual evidence and automated checks
argument-hint: "[instance] [--mode=manual|hybrid] [--required-tags=TagA,TagB]"
---

# Marketo Governance Audit

Run a governance audit that combines manual evidence collection with automated checks from instance inventory.

## Usage

```
/marketo-governance-audit [instance] [--mode=manual|hybrid] [--required-tags=TagA,TagB]
```

## Parameters

- `instance` - (Optional) Instance ID. Uses current instance if not specified.
- `--mode` - `manual` (evidence checklist only) or `hybrid` (manual + automated checks)
- `--required-tags` - Comma-separated list of required program tags (e.g., `Region,Product Line`)

## Automation (Hybrid Mode)

Run the collector script to pull inventory and generate the report:

```
node scripts/lib/governance-audit-collector.js --instance production --mode hybrid --required-tags "Region,Product Line" --evidence-file portals/production/governance/evidence/evidence.json
```

For large instances, cap the inventory pull:

```
node scripts/lib/governance-audit-collector.js --instance production --mode hybrid --max-records 5000
```

Use the evidence template:

```
docs/runbooks/governance/templates/governance-evidence-template.json
```

**Prerequisite**: Marketo API credentials must be configured via `portals/config.json` or environment variables.

If no evidence file is provided, the collector looks for:

```
portals/{instance}/governance/evidence/evidence.json
```

## What This Command Does

1. **Collect Instance Inventory** (hybrid mode)
   - Programs, campaigns, channels, tags
   - Trigger vs batch counts

2. **Collect Manual Evidence** (all modes)
   - Audit Trail export
   - Campaign Inspector review
   - Notifications review
   - Communication limits verification
   - Approval workflow confirmation
   - Workspace access review

3. **Generate Governance Report**
   - Naming compliance
   - Tag coverage
   - Trigger health
   - Evidence gaps

## Output Location

```
portals/{instance}/governance/
├── audits/
│   ├── governance-audit-{date}.json
│   └── governance-audit-{date}.md
└── evidence/
```

## Related Scripts

- `scripts/lib/governance-audit-runner.js`
- `scripts/lib/instance-quirks-detector.js`

## Related Runbooks

- `docs/runbooks/governance/01-instance-health-governance-foundations.md`
- `docs/runbooks/governance/02-automation-performance-guardrails.md`
- `docs/runbooks/governance/03-operational-workflows-incident-response.md`
