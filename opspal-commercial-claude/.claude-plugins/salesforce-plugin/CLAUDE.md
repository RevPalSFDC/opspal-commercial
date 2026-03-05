# Salesforce Plugin - User Guide

This file provides guidance when using the Salesforce Plugin with Claude Code.

## Plugin Overview

The **Salesforce Plugin** provides comprehensive Salesforce operations with 82 agents, 470 scripts, 44 commands, and 28 hooks. It includes automatic error prevention, metadata management, CPQ/RevOps assessments, and deployment orchestration.

**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

```bash
# Installation
/plugin marketplace add RevPalSFDC/opspal-internal-marketplace
/plugin install salesforce-plugin@revpal-internal-plugins

# Verify
/agents  # Should show 82 Salesforce agents
```

## Key Features

### Sub-Agent Utilization Booster

**Automatic** - Prepends agent routing to every message. Reduces errors by 80%, saves 60-90% time.

**Requirements**: `jq` (`brew install jq` / `sudo apt-get install jq`)

**Disable**: `export ENABLE_SUBAGENT_BOOST=0`

### Automatic Error Prevention System

**Enabled by default** - Auto-corrects common errors in `sf data query`, `sf project deploy`, `sf data upsert`:
- `ApiName` → `DeveloperName` on FlowVersionView
- Mixed LIKE/= operators in OR conditions
- Missing `--use-tooling-api` flags
- CSV line endings

**95% success rate** preventing deployment failures.

### Pre-Deployment Validation

**MANDATORY before every deployment:**

```bash
# Base validation (8 checks)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/sfdc-pre-deployment-validator.js [org-alias] [deployment-path]

# Enhanced validation (20 checks)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/enhanced-deployment-validator.js [org-alias] [deployment-path]
```

**Critical checks**: Field History Tracking limits (max 20/object), picklist formula validation, object relationship verification, governor limits.

### Parallel Deployment Pipeline

**3-5x speedup** for batch deployments:

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/parallel-deployment-pipeline.js [org-alias] --source ./force-app --parallel 5
```

### Instance-Agnostic Metadata Framework

All agents use **zero-hardcoded metadata retrieval** - validation rules, flows, layouts, profiles discovered dynamically.

### Permission Set Management

**Two-tier architecture**:
- **Tier 1**: Foundational (FLS, object access)
- **Tier 2**: Role-specific composed sets
- Merge-safe operations with automatic conflict resolution

### Hallucination Prevention System

**Multi-layer protection** for RevOps/CPQ assessments based on Anthropic's official guidelines:

**Grounding Protocol**:
- All agents extract verbatim quotes from query results BEFORE analysis
- Claims must reference specific source IDs (e.g., `[query_001]`)
- Uncited claims are automatically flagged and retracted

**Knowledge Restriction**:
- Agents NEVER use training data for specific metrics
- No estimated "typical" values or industry benchmarks from memory
- Always state "No data available" rather than guessing

**Chain-of-Thought Reasoning**:
- All calculated metrics require `<reasoning>` blocks
- Step-by-step verification with sanity checks
- Confidence levels reported for each calculation

**Verification Tools**:
```bash
# Check response for hallucination patterns
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/response-sanity-checker.js verify <response-file>

# Multi-run consistency check (Best-of-N)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/best-of-n-verifier.js compare run1.txt run2.txt run3.txt

# Post-generation refinement
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/iterative-refiner.js refine <response-file> <sources-file>
```

**Benchmark Research Agent** (`benchmark-research-agent`):
- Retrieves verified industry benchmarks with full citations
- Zero Training Data Policy - only uses web search for current data
- Returns benchmarks with source, date, sample size, and methodology

**Agents with hallucination prevention**: `sfdc-revops-auditor`, `sfdc-cpq-assessor`

## Flow Authoring Toolkit

**Complete Flow development system** with CLI, templates, and batch operations.

```bash
# Core commands
flow create MyFlow --type Record-Triggered --object Account
flow add MyFlow.xml "Add decision Status_Check if Status equals Active"
flow validate MyFlow.xml --best-practices --governor-limits
flow deploy MyFlow.xml --activate

# Templates
flow template list --category core
flow template apply lead-assignment --name CA_Lead_Assignment --params "..."

# Batch operations (5-10x faster)
flow batch validate "./flows/*.xml" --parallel 5
flow batch deploy "./flows/*.xml" --activate --parallel 3
```

**6 templates**: lead-assignment, opportunity-validation, account-enrichment, case-escalation, task-reminder, contact-deduplication

**Documentation**: `docs/PHASE_4.1_COMPLETE.md`

## Flow Scanner Integration

**Enhanced validation** with SARIF output, auto-fix, and configurable rules.

```bash
# Basic validation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml

# CI/CD integration
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --sarif --output report.sarif

# Auto-fix
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run
```

**8 auto-fixes**: Hard-coded IDs, missing descriptions, outdated API versions, deprecated patterns, missing fault paths, copy naming, unused variables, unconnected elements.

**Configuration**: Create `.flow-validator.yml` for org-specific rules and exceptions.

**Full documentation**: `docs/FLOW_SCANNER_INTEGRATION.md`, `docs/FLOW_SCANNER_QUICK_REFERENCE.md`

## Flow XML Runbooks

**6 comprehensive runbooks** at `docs/runbooks/flow-xml-development/`:

| Runbook | Topics |
|---------|--------|
| 01 | XML scaffolding, CLI commands, element templates |
| 02 | 6 core templates, business scenarios, pattern selection |
| 03 | Template-driven, NLP modification, direct XML editing |
| 04 | 11-stage validation, best practices, bulkification |
| 05 | 4 deployment strategies, testing lifecycle, rollback |
| 06 | Performance monitoring, optimization, maintenance |

```bash
flow runbook --list          # List all
flow runbook 4               # View specific
flow runbook --search validation
```

## Living Runbook System

**Agents check org-specific runbooks** before operations to leverage institutional knowledge.

**70+ agents** have runbook integration including: `sfdc-cpq-assessor`, `sfdc-revops-auditor`, `sfdc-automation-auditor`, `sfdc-deployment-manager`, `sfdc-data-operations`.

**Commands**:
```bash
/view-runbook [org-alias]      # View org runbook
/generate-runbook [org-alias]  # Generate from observations
/diff-runbook [org-alias]      # Compare versions
```

**Benefits**: 40-80% reduction in redundant analysis, 30-60% faster assessments.

**Full documentation**: `docs/LIVING_RUNBOOK_SYSTEM.md`, `docs/AGENT_RUNBOOK_INTEGRATION.md`

## Available Agents

### Core (4 agents)
`sfdc-orchestrator`, `sfdc-planner`, `sfdc-state-discovery`, `sfdc-conflict-resolver`

### Metadata (4 agents)
`sfdc-metadata-manager`, `sfdc-metadata-analyzer`, `sfdc-remediation-executor`, `sfdc-quality-auditor`

### Deployment (3 agents)
`sfdc-deployment-manager`, `sfdc-merge-orchestrator`, `sfdc-dependency-analyzer`

### Assessment (4 agents)
`sfdc-cpq-assessor`, `sfdc-revops-auditor`, `sfdc-automation-auditor`, `sfdc-architecture-auditor`

### Security (4 agents)
`sfdc-security-admin`, `sfdc-permission-orchestrator`, `sfdc-permission-assessor`, `permission-segmentation-specialist`

### Data (3 agents)
`sfdc-data-operations`, `sfdc-query-specialist`, `sfdc-dedup-safety-copilot`

### Reports (5 agents)
`sfdc-reports-dashboards`, `sfdc-report-designer`, `sfdc-dashboard-designer`, `sfdc-report-validator`, `sfdc-reports-usage-auditor`

### Automation (3 agents)
`sfdc-automation-builder`, `validation-rule-orchestrator`, `validation-rule-segmentation-specialist`

### Triggers (2 agents)
`trigger-orchestrator`, `trigger-segmentation-specialist`

### Layouts (3 agents)
`sfdc-layout-analyzer`, `sfdc-layout-generator`, `sfdc-layout-deployer`

### Territory (6 agents)
`sfdc-territory-orchestrator`, `sfdc-territory-discovery`, `sfdc-territory-planner`, `sfdc-territory-deployment`, `sfdc-territory-assignment`, `sfdc-territory-monitor`

### Development (2 agents)
`sfdc-apex-developer`, `sfdc-lightning-developer`

### Specialized (4 agents)
`sfdc-cpq-specialist`, `sfdc-sales-operations`, `sfdc-service-cloud-admin`, `sfdc-integration-specialist`

### Flow (3 agents)
`flow-template-specialist`, `flow-batch-operator`, `flow-diagnostician`

**Full agent reference**: See `/agents` command or `docs/AGENTS_REFERENCE.md`

## Common Commands

```bash
# Discovery & Analysis
/sfdc-discovery              # Read-only org analysis
/audit-automation            # Automation audit
/audit-reports               # 6-month reports usage audit
/assess-permissions          # Permission set assessment

# Creation Wizards
/create-validation-rule      # Validation rule wizard
/create-trigger              # Apex trigger wizard
/create-permission-set       # Permission set wizard

# Layout Management
/analyze-layout              # Analyze layouts
/design-layout               # Generate persona-based layout
/deploy-layout               # Deploy with validation/rollback

# Territory Management
/territory-discovery         # Analyze territory config
/territory-validator         # Pre-validate operations
/territory-assign            # Assignment wizard

# Debug Logging
/debug-start                 # Start with presets
/debug-stop                  # Stop and cleanup
/apex-logs                   # View/retrieve logs
/debug-cleanup               # Full cleanup
/monitor-logs                # Real-time monitoring

# Utilities
/checkdependencies           # Check plugin deps
/reflect                     # Submit reflection
/routing-help                # Routing rules
```

## Best Practices

### Environment-First Discovery

**ALWAYS query org directly**:
```bash
sf data query --query "SELECT DeveloperName FROM FlexiPage WHERE EntityDefinitionId = 'Account'" --use-tooling-api
sf sobject describe Account | jq '.fields[].name'
```

### SOQL Validation

**Within OR conditions, operators must match**:
```sql
-- ❌ WRONG
WHERE Type = 'Renewal' OR Type LIKE '%Renew%'

-- ✅ CORRECT
WHERE Type IN ('Renewal') OR Type LIKE '%Renew%'
```

### Deployment Validation

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/deployment-source-validator.js validate-source ./force-app
```

## Error Prevention Patterns

### Field History Tracking
```bash
sf data query --query "SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' AND IsFieldHistoryTracked = true" --use-tooling-api
```
**Max 20 fields per object** - exceeding causes deployment failure.

### Picklist Formulas
```javascript
// ❌ WRONG: ISBLANK(Picklist__c) or ISNULL(Picklist__c)
// ✅ CORRECT: TEXT(Picklist__c) = ""
```

## Troubleshooting

### "No source-backed components present"
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/deployment-source-validator.js validate-source ./force-app
```

### FlowVersionView Query Errors
Auto-corrected: `ApiName` → `DeveloperName`

### Mixed Operators in OR
Auto-corrected by error prevention system.

## Hook Health Check

```bash
bash .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/diagnose-hook-health.sh
```

Checks: executable, syntax, dependencies (jq, node, bc), basic execution.

## Documentation

- **docs/** - Guides and references
- **CHANGELOG.md** - Version history
- **TESTING_HOOKS.md** (repo root) - Hook testing

## Support

- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- `/reflect` - Submit feedback

---
**Version**: 3.64.0 | **Updated**: 2025-12-19
