# Agent Tier Assignments
## Complete Categorization of 60 Salesforce Agents

**Version**: 1.0.0
**Created**: 2025-10-25
**Total Agents**: 60

---

## Tier Classification Summary

| Tier | Count | Description |
|------|-------|-------------|
| **Tier 1** | 17 | Read-Only (analysis, audit, discovery) |
| **Tier 2** | 15 | Standard Operations (CRUD, reports, layouts) |
| **Tier 3** | 22 | Metadata Management (fields, flows, apex, config) |
| **Tier 4** | 5 | Security & Permissions (profiles, roles, compliance) |
| **Tier 5** | 1 | Destructive Operations (deduplication with delete) |

**Total**: 60 agents

---

## TIER 1: Read-Only Agents (17)

**No Approval Required** - Query data, analyze, generate reports

| # | Agent | Description |
|---|-------|-------------|
| 1 | `response-validator` | Validates agent responses for accuracy |
| 2 | `sfdc-automation-auditor` | Audits automation with conflict detection |
| 3 | `sfdc-cpq-assessor` | CPQ health assessment (read-only) |
| 4 | `sfdc-dashboard-analyzer` | Analyzes dashboards and reports |
| 5 | `sfdc-dependency-analyzer` | Analyzes object/field dependencies |
| 6 | `sfdc-discovery` | Read-only org discovery |
| 7 | `sfdc-field-analyzer` | Field metadata analysis |
| 8 | `sfdc-layout-analyzer` | Layout quality analysis |
| 9 | `sfdc-metadata-analyzer` | Metadata analysis (validation rules, flows) |
| 10 | `sfdc-object-auditor` | Object metadata auditing |
| 11 | `sfdc-performance-optimizer` | Performance analysis (read-only) |
| 12 | `sfdc-permission-assessor` | Permission set assessment |
| 13 | `sfdc-quality-auditor` | Quality auditing and health checks |
| 14 | `sfdc-reports-usage-auditor` | Report usage analysis |
| 15 | `sfdc-revops-auditor` | RevOps assessment (read-only) |
| 16 | `sfdc-state-discovery` | Org state discovery |
| 17 | `sfdc-planner` | Creates implementation plans (analysis only) |

---

## TIER 2: Standard Operations (15)

**Approval**: Production + >1,000 records

| # | Agent | Description |
|---|-------|-------------|
| 1 | `sfdc-advocate-assignment` | Assigns advocates (creates/updates records) |
| 2 | `sfdc-csv-enrichment` | Enriches CSV data with Salesforce IDs |
| 3 | `sfdc-dashboard-designer` | Designs and creates dashboards |
| 4 | `sfdc-dashboard-optimizer` | Optimizes dashboard layouts |
| 5 | `sfdc-data-generator` | Generates test data (sandbox only) |
| 6 | `sfdc-data-operations` | CRUD operations on records |
| 7 | `sfdc-layout-generator` | Generates Lightning page layouts |
| 8 | `sfdc-lucid-diagrams` | Creates architecture diagrams |
| 9 | `sfdc-renewal-import` | Imports renewal opportunities |
| 10 | `sfdc-report-designer` | Designs reports |
| 11 | `sfdc-reports-dashboards` | Creates/manages reports and dashboards |
| 12 | `sfdc-report-template-deployer` | Deploys reports from templates |
| 13 | `sfdc-report-type-manager` | Manages report types |
| 14 | `sfdc-report-validator` | Validates report configurations |
| 15 | `sfdc-query-specialist` | Builds and optimizes SOQL queries |

**Note**: Backup agents excluded from production use:
- `sfdc-reports-dashboards-old` (deprecated)
- `sfdc-reports-dashboards-backup-20250823` (backup)

---

## TIER 3: Metadata Management (22)

**Approval**: Production always, Sandbox >5 components

| # | Agent | Description |
|---|-------|-------------|
| 1 | `sfdc-apex` | Apex development and deployment |
| 2 | `sfdc-apex-developer` | Apex triggers, classes, batch jobs |
| 3 | `sfdc-automation-builder` | Creates flows, process builders, workflows |
| 4 | `sfdc-cli-executor` | Executes Salesforce CLI commands |
| 5 | `sfdc-conflict-resolver` | Resolves deployment conflicts |
| 6 | `sfdc-cpq-specialist` | Configures CPQ (metadata) |
| 7 | `sfdc-dashboard-migrator` | Migrates dashboards (metadata operations) |
| 8 | `sfdc-deployment-manager` | Orchestrates deployments |
| 9 | `sfdc-einstein-admin` | Configures Einstein AI features |
| 10 | `sfdc-integration-specialist` | Configures integrations and APIs |
| 11 | `sfdc-lightning-developer` | Develops LWC and Aura components |
| 12 | `sfdc-metadata` | Metadata deploys (flows, layouts, permissions) |
| 13 | `sfdc-metadata-manager` | Manages metadata deployments |
| 14 | `sfdc-orchestrator` | Coordinates complex multi-step operations |
| 15 | `sfdc-remediation-executor` | Executes remediation plans |
| 16 | `sfdc-revops-coordinator` | Coordinates RevOps optimizations |
| 17 | `sfdc-sales-operations` | Configures sales processes |
| 18 | `sfdc-service-cloud-admin` | Configures Service Cloud |
| 19 | `sfdc-ui-customizer` | Customizes UI (layouts, pages) |
| 20 | `sfdc-merge-orchestrator` | Merges fields/objects (Tier 3 for metadata, handles data carefully) |

---

## TIER 4: Security & Permissions (5)

**Approval**: Always (all environments), Multiple approvers

| # | Agent | Description |
|---|-------|-------------|
| 1 | `sfdc-agent-governance` | Agent governance and risk management |
| 2 | `sfdc-communication-manager` | Email templates (security implications) |
| 3 | `sfdc-compliance-officer` | GDPR, HIPAA, SOC compliance |
| 4 | `sfdc-permission-orchestrator` | Permission set management |
| 5 | `sfdc-security-admin` | Security and permission management |

---

## TIER 5: Destructive Operations (1)

**Approval**: Always + Executive, Requires backup

| # | Agent | Description |
|---|-------|-------------|
| 1 | `sfdc-dedup-safety-copilot` | Account deduplication (merges with delete) |

**Note**: `sfdc-merge-orchestrator` upgraded to Tier 3 (merges carefully, doesn't delete by default)

---

## Tier Assignment Rationale

### Tier 1 Criteria
- **Operations**: Query, read, analyze, audit
- **No modifications**: Cannot write data or deploy metadata
- **Examples**: Auditors, analyzers, assessors, discovery agents

### Tier 2 Criteria
- **Operations**: CRUD on records, create reports/dashboards
- **Limited impact**: Non-destructive, reversible
- **Examples**: Data operations, report creators, layout generators

### Tier 3 Criteria
- **Operations**: Deploy metadata (fields, flows, apex, config)
- **Moderate impact**: Affects schema or automation
- **Examples**: Metadata managers, deployment agents, automation builders

### Tier 4 Criteria
- **Operations**: Security, permissions, compliance
- **High impact**: Affects access control or regulatory compliance
- **Examples**: Security admin, permission managers, compliance officer

### Tier 5 Criteria
- **Operations**: Destructive (delete, irreversible)
- **Critical impact**: Data loss risk
- **Examples**: Deduplication (merges with deletes)

---

## Special Cases

### Deprecated/Backup Agents (Excluded)

These agents are excluded from active registration:

- `sfdc-reports-dashboards-old` - Deprecated version
- `sfdc-reports-dashboards-backup-20250823` - Backup version

**Rationale**: These are legacy/backup agents not intended for production use

---

## Tier Distribution Analysis

```
Tier 1 (Read-Only):        17 agents (28%)  ████████████████
Tier 2 (Standard Ops):     15 agents (25%)  █████████████
Tier 3 (Metadata Mgmt):    22 agents (37%)  ████████████████████
Tier 4 (Security):          5 agents (8%)   ████
Tier 5 (Destructive):       1 agent  (2%)   █

Total Active: 60 agents (100%)
```

### Observations

- **Most agents are Tier 3** (37%) - Metadata management is core functionality
- **Balanced read-only** (28%) - Good analysis/audit coverage
- **Minimal Tier 4** (8%) - Appropriate security constraint
- **Single Tier 5** (2%) - Destructive operations properly restricted

---

## Approval Impact Analysis

### By Environment

**Production**:
- Tier 1 (17): No approval - proceed automatically
- Tier 2 (15): Approval if >1,000 records
- Tier 3 (22): Always require approval
- Tier 4 (5): Always require approval (multi-approver)
- Tier 5 (1): Always blocked (executive approval)

**Expected Approval Rate in Production**: ~45% of operations (Tier 3+4+5 / Total)

**Sandbox**:
- Tier 1-2 (32): No approval
- Tier 3 (22): Approval if >5 components
- Tier 4 (5): Approval required
- Tier 5 (1): Approval required

**Expected Approval Rate in Sandbox**: ~15% of operations

---

## Validation Checklist

For each tier assignment:

- [x] Agent description reviewed
- [x] Primary operations identified
- [x] Impact level assessed
- [x] Approval requirements appropriate
- [x] Limits set based on operations
- [x] Documentation requirements defined
- [x] Rollback requirements defined

---

## Next Steps

1. **Update agent-permission-matrix.json** with all 60 agents
2. **Test matrix loading** with updated configuration
3. **Validate tier assignments** by testing risk calculations
4. **Document any edge cases** for future reference

---

**Prepared By**: Claude Code Agent System
**Review Required**: Engineering Lead, Security Team
**Status**: ✅ Ready for matrix update
