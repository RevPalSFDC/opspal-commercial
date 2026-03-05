# Salesforce Plugin - Usage Guide

**Version**: 3.51.0
**Last Updated**: 2025-11-24

## Quick Start

```bash
# Install
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install salesforce-plugin@revpal-internal-plugins

# Verify
/agents | grep sfdc
```

## Core Agent Categories

| Category | Key Agents | Use When |
|----------|-----------|----------|
| **Orchestration** | `sfdc-orchestrator`, `sfdc-planner` | Complex multi-step operations |
| **Metadata** | `sfdc-metadata-manager`, `sfdc-deployment-manager` | Deployments, field changes |
| **Assessment** | `sfdc-cpq-assessor`, `sfdc-revops-auditor` | CPQ/RevOps evaluations |
| **Security** | `sfdc-security-admin`, `sfdc-permission-orchestrator` | Profiles, permission sets |
| **Data** | `sfdc-data-operations`, `sfdc-query-specialist` | Imports, exports, queries |
| **Reports** | `sfdc-reports-dashboards`, `sfdc-dashboard-designer` | Report/dashboard creation |
| **Automation** | `sfdc-automation-builder`, `sfdc-automation-auditor` | Flows, validation rules |

## Common Workflows

### Run CPQ Assessment

```
User: "Run CPQ assessment for production org"

→ Automatically routes to sfdc-cpq-assessor
→ Produces:
   - CPQ health score (0-100)
   - Configuration analysis
   - Pricing complexity metrics
   - Recommendations with ROI
```

### Deploy Metadata

```
User: "Deploy validation rules to production"

→ Routes to sfdc-deployment-manager
→ Process:
   1. Pre-flight validation
   2. Package.xml generation
   3. Deployment with test execution
   4. Verification
```

### Create Permission Sets

```
User: "Create permission set for Sales Manager role"

→ Routes to sfdc-permission-orchestrator
→ Uses two-tier architecture:
   - Tier 1: Foundational FLS/CRUD
   - Tier 2: Role-specific composition
```

### Build Reports

```
User: "Create pipeline report with stage breakdown"

→ Routes to sfdc-reports-dashboards
→ Validates:
   - Report type compatibility
   - Field availability
   - Filter logic
```

### Import Data

```
User: "Import contacts from CSV"

→ Routes to sfdc-data-import-manager
→ Process:
   1. CSV validation (schema, data types)
   2. Field mapping
   3. Bulk API selection (based on volume)
   4. Execution with verification
```

### Export Data

```
User: "Backup all Account records"

→ Routes to sfdc-data-export-manager
→ Process:
   1. Pre-flight validation
   2. Intelligent field selection (70-90% reduction)
   3. Streaming export (for >50K records)
   4. Backup validation
```

## Essential Commands

```bash
# Discovery
/sfdc-discovery              # Read-only org analysis

# Audits
/audit-automation            # Automation conflict detection
/audit-reports              # 6-month usage audit
/assess-permissions         # Permission fragmentation analysis
/q2c-audit                  # Quote-to-Cash audit with diagrams

# Automation
/create-validation-rule     # Validation rule wizard
/create-trigger             # Apex trigger wizard
/create-permission-set      # Permission set wizard

# Flow Development
/flow-segment-start         # Start Flow segment
/flow-segment-complete      # Complete current segment
/flow-diagnose              # Comprehensive Flow diagnostics

# Quality
/qa-execute                 # Run QA tests
/qa-review                  # Review existing reports
/reflect                    # Submit session reflection

# Utilities
/checkdependencies          # Verify plugin dependencies
/routing-help               # Agent routing guide
/suggest-agent              # Get agent recommendation
```

## Automatic Features

### Error Prevention System

**Enabled by default** - Intercepts SF CLI commands:

- Auto-corrects `ApiName` → `DeveloperName` on FlowVersionView
- Fixes mixed LIKE/= operators
- Adds missing `--use-tooling-api`
- Validates deployment sources
- Fixes CSV line endings

**Disable**: `ERROR_PREVENTION_ENABLED=false sf data query ...`

### Sub-Agent Boost

**Enabled by default** - Prepends "Using appropriate sub-agents..." to prompts:

- 70%+ sub-agent utilization
- 80% error reduction
- 60-90% time savings

**Disable**: `export ENABLE_SUBAGENT_BOOST=0`

### Agent Governance

**Automatic risk assessment** for operations:

| Risk Level | Score | Behavior |
|------------|-------|----------|
| LOW | 0-30 | Proceed with logging |
| MEDIUM | 31-50 | Enhanced monitoring |
| HIGH | 51-70 | Approval required |
| CRITICAL | 71+ | Blocked, executive approval |

## Data Operations Quick Reference

### API Selection by Volume

| Records | API | Tool |
|---------|-----|------|
| <10 | Standard | `sf data create` |
| 10-200 | Batch loop | For loop |
| 200-10K | Composite | `composite-api.js` |
| >10K | Bulk 2.0 | `bulk-api-handler.js` |

### Export Strategy by Size

| Records | Fields | Strategy |
|---------|--------|----------|
| <10K | <100 | Standard export |
| 10K-50K | Any | Batched query |
| >50K | Any | Streaming export |
| Any | >200 | Intelligent field selection |

## Living Runbook Integration

**All agents load org-specific context before operations:**

```bash
# View runbook
/view-runbook [org-alias]

# Generate from observations
/generate-runbook [org-alias]
```

**Benefits**:
- 40-80% reduction in redundant analysis
- 30-60% faster assessments
- Proven strategies reused

## Troubleshooting

### "No source-backed components"

**Fix**: Validate structure:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/deployment-source-validator.js validate-source ./force-app
```

### FlowVersionView Query Error

**Fix**: Already auto-corrected by Error Prevention System

### SOQL Mixed Operators

**Bad**: `WHERE Type = 'Renewal' OR Type LIKE '%Renew%'`
**Good**: `WHERE Type LIKE 'Renewal' OR Type LIKE '%Renew%'`

### Agent Not Found

```bash
/checkdependencies --install  # Verify dependencies
/agents                       # List available agents
```

### Deployment Fails

```bash
# Pre-deployment validation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/sfdc-pre-deployment-validator.js [org] [path]
```

## Environment Variables

```bash
# Required
export SALESFORCE_ORG_ALIAS="production"

# Optional
export ERROR_PREVENTION_ENABLED=1
export ENABLE_SUBAGENT_BOOST=1
export ROUTING_VERBOSE=0
```

---

**Full Documentation**: See CLAUDE.md for comprehensive feature documentation.
