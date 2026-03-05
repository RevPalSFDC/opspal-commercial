# Salesforce Plugin - User Guide

This file provides guidance when using the Salesforce Plugin with Claude Code.

## Plugin Overview

The **Salesforce Plugin** provides comprehensive Salesforce operations with 88 agents, 474 scripts, 46 commands, and 28 hooks. It includes automatic error prevention, metadata management, CPQ/RevOps assessments, and deployment orchestration.

**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

```bash
# Installation
/plugin marketplace add RevPalSFDC/opspal-internal-marketplace
/plugin install opspal-salesforce@revpal-internal-plugins

# Verify
/agents  # Should show 82 Salesforce agents
```

## Key Features

### Validation Framework (NEW)

**Comprehensive validation system preventing 611 errors annually ($30,618 ROI)**

The Validation Framework provides automatic error prevention through 5 validation stages:

1. **Schema Validation** - Validates data structure against JSON schemas
2. **Parse Error Handling** - Auto-fixes JSON/XML/CSV parsing issues
3. **Data Quality** - Detects synthetic data and quality issues (4-layer scoring)
4. **Tool Contract** - Validates sf CLI invocations before execution
5. **Permission Validation** - Checks bulk operations and field-level security

**Automatic Hooks** (already enabled):
- `pre-reflection-submit.sh` - Validates reflections before submission
- `pre-tool-execution.sh` - Validates sf CLI and MCP tool calls

**Quick Commands**:
```bash
# Test tool contract validation
node ../opspal-core/scripts/lib/tool-contract-validator.js validate sf_data_query \
  --params '{"query":"SELECT Id FROM Account"}'

# Test data quality validation
node scripts/lib/enhanced-data-quality-framework.js validate \
  --query-result ./result.json --expected-schema ./schema.json

# Test permission validation
node scripts/lib/validators/enhanced-permission-validator.js validate-bulk \
  --object Account --operation delete --record-ids 123,456

# Generate validation dashboard
node ../opspal-core/scripts/lib/validation-dashboard-generator.js generate --days 30

# Temporarily disable validation
export SKIP_VALIDATION=1              # All validation
export SKIP_TOOL_VALIDATION=1         # Tool validation only
```

**Documentation**: See `../../docs/VALIDATION_FRAMEWORK_GUIDE.md` for complete guide

**Performance**:
- <500ms total validation time
- <10ms schema validation
- <100ms data quality check
- <5ms tool contract validation
- 95%+ pass rate for legitimate operations

**Common Validations**:
- ✅ FlowDefinitionView queries require `--use-tooling-api`
- ✅ Picklist formulas must use `TEXT()` not `ISBLANK()`
- ✅ Field History Tracking limit (max 20 per object)
- ✅ Mixed operators in OR conditions auto-corrected
- ✅ Synthetic data detection (Lead 1, Test Account, etc.)
- ✅ Bulk operation permission checks before execution

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

### API Type Router (NEW)

**Intelligent API selection** - Automatically suggests the optimal Salesforce API based on task type, operation, and scale.

**Prevents wrong-API errors:**
- REST API on Tooling-only objects (FlowDefinitionView, ApexClass) → Suggests `--use-tooling-api`
- REST API for 200+ records → Suggests Bulk API
- Sequential operations → Suggests Composite API for batching

**CLI Commands:**
```bash
# Check if command uses optimal API
node scripts/lib/api-type-router.js check 'sf data query --query "SELECT Id FROM FlowDefinitionView"'

# Get API recommendation
node scripts/lib/api-type-router.js recommend '{"type":"data","operation":"read","recordCount":500}'

# Get fallback on error
node scripts/lib/api-type-router.js alternative REST REQUEST_LIMIT_EXCEEDED

# List Tooling API objects
node scripts/lib/api-type-router.js list-tooling
```

**Environment Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `SF_API_ROUTING_ENABLED` | `1` | Enable/disable API routing suggestions |
| `SF_BULK_THRESHOLD` | `200` | Records before suggesting Bulk API |
| `SF_COMPOSITE_THRESHOLD` | `2` | Operations before suggesting Composite API |

**Related Files:**
- `scripts/lib/api-type-router.js` - Core routing logic
- `scripts/lib/api-fallback-mapper.js` - Error-to-API mapping
- `config/api-routing-config.json` - Pluggable rules
- `skills/api-selection-guide/api-selection-guide.md` - Comprehensive runbook

### Pre-Deployment Validation

**MANDATORY before every deployment:**

```bash
# Base validation (8 checks)
node scripts/sfdc-pre-deployment-validator.js [org-alias] [deployment-path]

# Enhanced validation (20 checks)
node scripts/lib/enhanced-deployment-validator.js [org-alias] [deployment-path]
```

**Critical checks**: Field History Tracking limits (max 20/object), picklist formula validation, object relationship verification, governor limits.

### Parallel Deployment Pipeline

**3-5x speedup** for batch deployments:

```bash
node scripts/lib/parallel-deployment-pipeline.js [org-alias] --source ./force-app --parallel 5
```

### Instance-Agnostic Metadata Framework

All agents use **zero-hardcoded metadata retrieval** - validation rules, flows, layouts, profiles discovered dynamically.

### Template Variations System (NEW - v3.66.0)

**Context-aware deployment** for reports and dashboards - single templates adapt to different org configurations.

**Variation Dimensions:**
| Dimension | Options |
|-----------|---------|
| Complexity | simple, standard, advanced |
| Quoting System | native, cpq, hybrid (auto-detected) |
| GTM Model | field-sales, inside-sales, plg |
| Company Size | enterprise, mid-market, smb |

**Quick Start:**
```bash
# Auto-detect variation based on org
node scripts/lib/report-template-deployer.js deploy my-pipeline --org my-org

# Explicit variation
node scripts/lib/report-template-deployer.js deploy my-pipeline --org my-org --variation cpq

# Check CPQ detection
node scripts/lib/cpq-detector.js my-org
```

**Coverage:** 18 dashboard templates + 115 report templates with 4.2 variations average.

**Documentation:** `docs/TEMPLATE_VARIATIONS_GUIDE.md`

### User Reports Extraction & Template Generation (NEW - v3.70.0)

**Extract reports/dashboards from any user** and generate intelligent, reusable templates.

**Key Features:**
- **5-phase pipeline**: Discovery → Metadata → Analysis → Template → Validation
- **100% instance-agnostic**: No personal names, company names, or org identifiers
- **Auto-categorization**: Sales, Marketing, Customer Success functions
- **Portability scoring**: Standard vs custom field ratio
- **CPQ variations**: Automatic SBQQ field substitutions

**Quick Start:**
```bash
# Extract all reports from a user
/extract-user-reports --org my-org --user "Jane Doe"

# Or use the script directly
node scripts/lib/user-reports-extractor.js --org my-org --user "Jane Doe"
```

**Output Structure:**
```
templates/reports/best-practices/
├── sales/{executive,manager,individual}/bp-*.json
├── marketing/{executive,manager,individual}/bp-*.json
└── customer-success/{executive,manager,individual}/bp-*.json
```

**Template Schema:**
- `templateMetadata` - ID, name, function, audience, tags
- `variations` - simple, standard, cpq, enterprise
- `orgAdaptation` - Field fallbacks, portability requirements
- `reportMetadata` - Salesforce Analytics API format

**Trigger keywords**: "extract report", "user report template", "report template"

**Live-First Mode** (Default):
The Analytics Discovery API now defaults to **live-first mode** - always querying the live Salesforce org first, with cache used only as fallback on API failure. This ensures you always get current data.

| Variable | Default | Description |
|----------|---------|-------------|
| `ANALYTICS_LIVE_FIRST` | `true` | Query live org first, cache as fallback |
| `CACHE_TTL_HOURS` | `24` | Cache expiration (used for fallback) |
| `ANALYTICS_CACHE_DIR` | `.analytics-cache/` | Cache location |

To revert to cache-first behavior (not recommended): `export ANALYTICS_LIVE_FIRST=false`

**Documentation:** `templates/reports/best-practices/README.md`

### Live-First Caching System (v3.70.0+)

**Comprehensive live-first caching** across all Salesforce cache systems. By default, all cache systems now query live Salesforce orgs first, using cached data only as fallback on API failures. This prevents stale data issues that caused template variations to use wrong quoting systems or missed custom fields/objects.

**Architecture:**
- Query live API first (default behavior)
- Cache results for fallback use
- Use cached data only when API fails (with warning)
- Per-component environment variable control

**Global Control:**
```bash
# Disable live-first for all components (not recommended)
export GLOBAL_LIVE_FIRST=false
```

**Per-Component Environment Variables:**

| Variable | Default | Component | Risk if Disabled |
|----------|---------|-----------|------------------|
| `GLOBAL_LIVE_FIRST` | `true` | All caches | Stale data across all systems |
| `ANALYTICS_LIVE_FIRST` | `true` | Analytics Discovery | Report templates use wrong variations |
| `CPQ_LIVE_FIRST` | `true` | CPQ Detection | CPQ changes not detected immediately |
| `METADATA_LIVE_FIRST` | `true` | Org Metadata Cache | Custom objects/fields invisible |
| `FIELD_MAPPING_LIVE_FIRST` | `true` | Field Mapping Cache | Old mappings cause report errors |
| `FIELD_METADATA_LIVE_FIRST` | `true` | Field Metadata Cache | Field definitions not validated |
| `REPORT_TYPE_LIVE_FIRST` | `true` | Report Type Cache | UI→API mapping stale |
| `VARIATION_LIVE_FIRST` | `true` | Variation Resolver | GTM model changes not detected |
| `CONTEXT_LIVE_FIRST` | `true` | Pre-task hooks | Org context stale |
| `SOQL_LIVE_FIRST` | `true` | SOQL Enhancer | Org quirks mappings stale |

**Fallback Behavior:**
When API calls fail in live-first mode:
1. Cache is used as fallback (if available)
2. Warning is logged with timestamp
3. Cache staleness is tracked in metrics

**Verification:**
```bash
# Check if live-first is active for a component
node scripts/lib/cpq-detector.js --check-live-first

# Force cache-first for testing (single run)
GLOBAL_LIVE_FIRST=false node scripts/lib/cpq-detector.js my-org
```

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
node scripts/lib/response-sanity-checker.js verify <response-file>

# Multi-run consistency check (Best-of-N)
node scripts/lib/best-of-n-verifier.js compare run1.txt run2.txt run3.txt

# Post-generation refinement
node scripts/lib/iterative-refiner.js refine <response-file> <sources-file>
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
node scripts/lib/flow-validator.js MyFlow.xml

# CI/CD integration
node scripts/lib/flow-validator.js MyFlow.xml --sarif --output report.sarif

# Auto-fix
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run
```

**8 auto-fixes**: Hard-coded IDs, missing descriptions, outdated API versions, deprecated patterns, missing fault paths, copy naming, unused variables, unconnected elements.

**Configuration**: Create `.flow-validator.yml` for org-specific rules and exceptions.

**Full documentation**: `docs/FLOW_SCANNER_INTEGRATION.md`, `docs/FLOW_SCANNER_QUICK_REFERENCE.md`

## Flow Segmentation System (NEW)

**Intelligent flow editing** with complexity-aware segmentation, auto-detection of logical patterns, and safe edit modes.

### When to Use

| Complexity | Risk Level | Recommended Mode |
|------------|------------|------------------|
| 0-5 | Low | `/flow-edit` (Quick Edit Mode) |
| 6-9 | Medium | Standard editing or segmentation |
| 10-19 | High | `/flow-interactive-build` (Segmentation) |
| 20+ | Critical | Segmentation + consider refactoring |

### Commands

```bash
# Quick edits for simple flows (complexity < 10)
/flow-edit <FlowName> "<instruction>" --org <alias>
/flow-edit Account_Processing "Change Status_Check label to 'Active Check'" --org prod
/flow-edit Lead_Router "Add assignment Stage = 'Qualified'" --dry-run

# Analyze existing flow for segment patterns
/flow-analyze-segments <FlowName> --org <alias>
/flow-analyze-segments Account_Processing --output json --suggest
/flow-analyze-segments --file ./flows/MyFlow.flow-meta.xml

# Extract elements to subflow
/flow-extract-subflow <FlowName> --segment <SegmentName> --org <alias>
/flow-extract-subflow <FlowName> --elements "Check_1,Check_2" --preview
/flow-extract-subflow <FlowName> --interactive --org prod

# Full segmentation mode (enhanced with new stages)
/flow-interactive-build <FlowName> --org <alias>
```

### Key Features

**Automatic Segment Detection**: Recognizes 5 logical patterns in existing flows:
- **Validation** - Decision clusters at flow start (budget: 5 points)
- **Enrichment** - recordLookups + assignments (budget: 8 points)
- **Routing** - Dense decision clusters with branching (budget: 6 points)
- **Notification** - Email/Chatter actions at end (budget: 4 points)
- **Loop Processing** - Loops with record operations (budget: 10 points)

**API Version Guard**: Proactive checks before adding elements that require specific API versions.

**Quick Edit Mode**: 4-stage validation (syntax, references, variables, api-version) in <500ms for simple changes.

**On-Demand Extraction**: Preview impact before extracting segments to subflows.

### Interactive Build Stages

| Stage | Purpose |
|-------|---------|
| 0 | Complexity Analysis - determines if segmentation beneficial |
| 1 | Flow Loading |
| 1.5 | Segment Suggestion Review (for existing flows) |
| 1.6 | Interactive Partition Mode (manual reassignment) |
| 2-5 | Standard segmentation workflow |

### Configuration

- `config/flow-segmentation-config.json` - Thresholds, templates, pattern detection
- `config/flow-api-version-compatibility.json` - Element version requirements

### Related Files

- `scripts/lib/flow-segment-analyzer.js` - Pattern detection
- `scripts/lib/flow-quick-editor.js` - Quick edit mode
- `scripts/lib/flow-api-version-guard.js` - Version compatibility
- `scripts/lib/flow-complexity-advisor.js` - Threshold guidance

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

### Upsert Operations (6 agents)
`sfdc-upsert-orchestrator`, `sfdc-upsert-matcher`, `sfdc-lead-auto-converter`, `sfdc-ownership-router`, `sfdc-enrichment-manager`, `sfdc-upsert-error-handler`

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

### Analytics & Intelligence (NEW - 2 agents)
`win-loss-analyzer` - Win/loss pattern analysis and competitive intelligence
`compliance-report-generator` - SOC2, GDPR, HIPAA compliance report generation

**Full agent reference**: See `/agents` command or `docs/AGENTS_REFERENCE.md`

## Common Commands

```bash
# Discovery & Analysis
/sfdc-discovery              # Read-only org analysis
/audit-automation            # Automation audit
/audit-reports               # 6-month reports usage audit
/assess-permissions          # Permission set assessment
/extract-user-reports        # Extract user reports → templates

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

# Flow Segmentation
/flow-edit                   # Quick edits (low complexity)
/flow-analyze-segments       # Analyze flow patterns
/flow-extract-subflow        # Extract to subflow
/flow-interactive-build      # Full segmentation mode

# Upsert & Lead Conversion
/upsert import               # Import records from CSV/JSON
/upsert match                # Preview matching without changes
/upsert enrich               # Enrich existing records
/upsert convert              # Convert qualified Leads
/upsert retry                # Process error queue
/upsert status               # Show operation status
/lead-convert diagnose       # Analyze Lead conversion blockers
/lead-convert preview        # Preview conversion results
/lead-convert batch          # Batch convert Leads

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
node scripts/lib/deployment-source-validator.js validate-source ./force-app
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

## Client-Centric Folder Migration

**Migrate Salesforce instance data to org-centric structure**

The plugin supports dual-path resolution for both legacy and client-centric folder structures.

### Path Resolution

```bash
# Resolve path for an org (works with both structures)
node scripts/lib/org-context-manager.js resolve <org-alias>

# Migrate context to org-centric structure
node scripts/lib/org-context-manager.js migrate <org-alias> --org <org-slug>
```

### Supported Structures

| Structure | Path Pattern | Priority |
|-----------|--------------|----------|
| Org-Centric (New) | `orgs/{org}/platforms/salesforce/{instance}/` | 1 |
| Legacy Platform | `instances/salesforce/{org}/` | 2 |
| Legacy Simple | `instances/{org}/` | 3 |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ORG_SLUG` | Org identifier for org-centric paths |
| `SF_TARGET_ORG` | Salesforce org alias |
| `INSTANCE_PATH` | Direct path override |

### Full Migration

Use the opspal-core migration command:
```bash
/migrate-schema --dry-run  # Preview
/migrate-schema --only-org acme  # Migrate single org
```

**Full documentation**: See `skills/client-centric-migration/SKILL.md` in opspal-core

## Troubleshooting

### "Sibling tool call errored" (Sub-Agent Script Resolution)

**Symptom:** When invoking sub-agents like `sfdc-query-specialist`, you see:
```
Error: Sibling tool call errored
Waiting…d /workspace -name "org-metadata-cache.js" -type f 2>/dev/null
Waiting…d /workspace -name "smart-query-validator.js" -type f 2>/dev/null
```

**Root Cause:** Sub-agent is running with a different working directory and can't find scripts. When it issues parallel `find` commands and one fails, all sibling tool calls abort.

**Solution 1: Set CLAUDE_PLUGIN_ROOT** (Recommended)
```bash
# Set before invoking sub-agents
export CLAUDE_PLUGIN_ROOT="/path/to/opspal-salesforce"

# Or use the plugin path resolver
eval $(node /path/to/opspal-core/scripts/lib/plugin-path-resolver.js export opspal-salesforce)
```

**Solution 2: Check Plugin Path Resolver**
```bash
# Verify plugin can be resolved
node /path/to/opspal-core/scripts/lib/plugin-path-resolver.js check opspal-salesforce

# List all available plugins
node /path/to/opspal-core/scripts/lib/plugin-path-resolver.js list

# Get the export command
node /path/to/opspal-core/scripts/lib/plugin-path-resolver.js export opspal-salesforce
```

**Solution 3: Use Absolute Paths in Agent**
Agents should always use resolved paths for scripts:
```bash
# In agent instructions
SCRIPT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(pwd)}"
node "${SCRIPT_ROOT}/scripts/lib/org-metadata-cache.js" init <org>
```

**Prevention:** The `sfdc-query-specialist`, `sfdc-discovery`, and `sfdc-state-discovery` agents now include Script Path Resolution guidance that prevents this issue.

### "No source-backed components present"
```bash
node scripts/lib/deployment-source-validator.js validate-source ./force-app
```

### FlowVersionView Query Errors
Auto-corrected: `ApiName` → `DeveloperName`

### Mixed Operators in OR
Auto-corrected by error prevention system.

## Hook Health Check

```bash
bash scripts/diagnose-hook-health.sh
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
**Version**: 4.0.1 | **Updated**: 2026-02-03
