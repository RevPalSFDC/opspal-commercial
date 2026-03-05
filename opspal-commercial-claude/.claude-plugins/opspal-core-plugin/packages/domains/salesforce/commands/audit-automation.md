---
description: Run comprehensive Salesforce automation audit with conflict detection and remediation planning
---

Run a complete automation inventory and conflict analysis audit on the specified Salesforce org.

The audit will:
- Inventory all automation components (Apex Triggers, Classes, Flows, Workflow Rules)
- Detect conflicts using 8 core rules (multiple triggers, undefined order, etc.)
- Assign risk scores and severity levels (CRITICAL → LOW)
- Generate executive reports (Markdown, CSV, JSON, HTML dashboard)
- Create remediation plans with code templates
- Track audit history for progress monitoring

**Target Org**: {org-alias}

**Options** (optional flags):
- `--skip-flows`: Skip flow analysis if timeouts occur
- `--objects Account,Contact,Lead`: Analyze specific objects only
- `--no-progress`: Disable progress indicators

**Output Location**: `instances/{org-alias}/automation-audit-{timestamp}/`

**Generated Artifacts**:
- Executive Summary (reports/Executive_Summary.md)
- Interactive Dashboard (dashboard/index.html)
- CSV Exports (Conflicts, Triggers, Workflow Rules)
- Remediation Plans with code templates
- Quick Reference guide

**Agent Used**: sfdc-automation-auditor

**Estimated Duration**: 10-15 minutes for comprehensive audit

**Post-Audit Commands**:
```bash
# View latest audit
cat instances/{org-alias}/latest-audit/reports/Quick_Reference.md

# Open dashboard
open instances/{org-alias}/latest-audit/dashboard/index.html

# View audit history
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/automation-audit-history.js {org-alias} list

# Compare with previous audit
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/automation-audit-history.js {org-alias} compare <baseline-id> latest
```

**Use the sfdc-automation-auditor agent to run a complete automation audit on the {org-alias} Salesforce org. Generate comprehensive reports, conflict analysis, and remediation plans.**
