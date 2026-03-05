# Agent Model Tier Recommendations

**Generated**: 2025-12-29 | **Updated**: 2026-02-05
**Total Agents Analyzed**: 221
**Primary Model**: Opus 4.6 (orchestrating)

This document provides model tier recommendations for all sub-agents based on task complexity analysis. With Opus as the primary orchestrating model, we optimize for cost-efficiency and latency by using appropriate model tiers for delegated tasks.

---

## Model Selection Criteria

### 🟢 Haiku (Fast, Low Cost)
**Best for**: Simple, well-defined tasks that don't require deep reasoning
- Read-only discovery/queries
- Simple validation checks
- CLI command execution
- Basic routing/delegation
- Format conversions
- Status checks
- Single-step operations

### 🟡 Sonnet (Balanced)
**Best for**: Moderate complexity tasks requiring some reasoning
- Code generation and review
- Multi-step analysis
- Report and diagram generation
- Standard assessments
- Integration work
- Data operations with business logic
- Most orchestration tasks

### 🔴 Opus (Complex Reasoning)
**Best for**: Tasks requiring sophisticated judgment and deep analysis
- Strategic planning with multiple trade-offs
- Complex audits (CPQ, RevOps, Architecture)
- Cross-platform orchestration with dependencies
- High-stakes decisions with significant consequences
- Novel problem-solving requiring creativity
- Tasks where errors are costly
- Complex debugging and root cause analysis

---

## Tier Recommendations by Plugin

### Salesforce Plugin (84 agents)

#### 🟢 HAIKU Tier (18 agents)
Simple, read-only, or execution-focused tasks

| Agent | Reasoning |
|-------|-----------|
| `sfdc-discovery` | Read-only org analysis, simple queries |
| `sfdc-cli-executor` | Command execution, no complex reasoning |
| `sfdc-query-specialist` | SOQL query building, well-defined patterns |
| `sfdc-object-auditor` | Basic metadata inspection |
| `sfdc-layout-analyzer` | Layout analysis, pattern matching |
| `sfdc-field-analyzer` | Field discovery, straightforward analysis |
| `sfdc-api-monitor` | API usage tracking, metrics collection |
| `sfdc-territory-discovery` | Read-only territory analysis |
| `sfdc-territory-monitor` | Status monitoring, health checks |
| `flow-log-analyst` | Log parsing, pattern extraction |
| `apex-debug-analyst` | Debug log analysis |
| `sfdc-report-type-manager` | Report type discovery |
| `sfdc-report-template-deployer` | Template application |
| `sfdc-csv-enrichment` | Data transformation |
| `sfdc-data-export-manager` | Export operations |
| `permission-segmentation-specialist` | Segment building (guided) |
| `trigger-segmentation-specialist` | Trigger segment building |
| `validation-rule-segmentation-specialist` | Rule segment building |

#### 🟡 SONNET Tier (52 agents)
Moderate complexity, multi-step analysis, code generation

| Agent | Reasoning |
|-------|-----------|
| `sfdc-automation-auditor` | Flow/automation analysis, conflict detection |
| `sfdc-architecture-auditor` | Architecture validation |
| `sfdc-quality-auditor` | Metadata quality analysis |
| `sfdc-reports-usage-auditor` | Usage pattern analysis |
| `sfdc-metadata-manager` | Metadata operations with validation |
| `sfdc-metadata-analyzer` | Dynamic metadata extraction |
| `sfdc-remediation-executor` | Phased fix execution |
| `sfdc-deployment-manager` | Deployment with validation pipeline |
| `sfdc-merge-orchestrator` | Object/field merge operations |
| `sfdc-dependency-analyzer` | Dependency mapping |
| `sfdc-conflict-resolver` | Conflict detection and resolution |
| `sfdc-state-discovery` | Comprehensive state analysis |
| `sfdc-security-admin` | Security operations |
| `sfdc-permission-orchestrator` | Permission set management |
| `sfdc-permission-assessor` | Permission analysis |
| `sfdc-reports-dashboards` | Report/dashboard creation |
| `sfdc-report-designer` | Report design |
| `sfdc-report-validator` | Report validation |
| `sfdc-dashboard-analyzer` | Dashboard analysis |
| `sfdc-dashboard-designer` | Dashboard design |
| `sfdc-dashboard-migrator` | Dashboard migration |
| `sfdc-dashboard-optimizer` | Dashboard optimization |
| `sfdc-data-operations` | Data import/export orchestration |
| `sfdc-data-import-manager` | Import operations |
| `sfdc-data-generator` | Test data generation |
| `sfdc-dedup-safety-copilot` | Deduplication with safety checks |
| `sfdc-automation-builder` | Flow/automation creation |
| `trigger-orchestrator` | Apex trigger creation |
| `validation-rule-orchestrator` | Validation rule management |
| `sfdc-layout-generator` | Layout generation |
| `sfdc-layout-deployer` | Layout deployment |
| `sfdc-territory-orchestrator` | Territory management |
| `sfdc-territory-planner` | Territory planning |
| `sfdc-territory-deployment` | Territory deployment |
| `sfdc-territory-assignment` | Territory assignments |
| `sfdc-apex-developer` | Apex code development |
| `sfdc-apex` | Apex operations |
| `sfdc-lightning-developer` | LWC/Aura development |
| `sfdc-ui-customizer` | UI customization |
| `sfdc-cpq-specialist` | CPQ configuration |
| `sfdc-sales-operations` | Sales ops management |
| `sfdc-service-cloud-admin` | Service Cloud config |
| `sfdc-integration-specialist` | Integration work |
| `sfdc-communication-manager` | Email templates |
| `sfdc-assignment-rules-manager` | Assignment rules |
| `sfdc-advocate-assignment` | Advocate provisioning |
| `sfdc-renewal-import` | Renewal imports |
| `sfdc-lucid-diagrams` | Lucid diagram generation |
| `flow-template-specialist` | Flow templates |
| `flow-batch-operator` | Batch flow operations |

#### 🔴 OPUS Tier (14 agents)
Complex reasoning, strategic planning, high-stakes decisions

| Agent | Reasoning |
|-------|-----------|
| `sfdc-orchestrator` | Master coordination, complex dependency management |
| `sfdc-planner` | Strategic planning with impact analysis |
| `sfdc-revops-coordinator` | Cross-domain RevOps coordination |
| `sfdc-cpq-assessor` | Complex CPQ audits with multi-domain analysis (promoted from haiku v2.1.32) |
| `sfdc-revops-auditor` | Multi-domain statistical analysis (promoted from sonnet v2.1.32) |
| `response-validator` | Hallucination detection requires best reasoning (promoted from sonnet v2.1.32) |
| `benchmark-research-agent` | Citation accuracy for industry benchmarks (promoted from sonnet v2.1.32) |
| `sfdc-agent-governance` | Risk assessment, compliance decisions |
| `sfdc-compliance-officer` | Regulatory compliance (GDPR, HIPAA, SOC) |
| `sfdc-einstein-admin` | AI/ML configuration decisions |
| `sfdc-performance-optimizer` | Performance optimization strategy |
| `flow-diagnostician` | Complex flow troubleshooting |
| `flow-test-orchestrator` | Test orchestration |
| `response-validator` | Hallucination detection, plausibility reasoning |
| `benchmark-research-agent` | Industry benchmark research |
| `sfdc-metadata` | Complex metadata deployments |

---

### HubSpot Plugin (44 agents)

#### 🟢 HAIKU Tier (12 agents)

| Agent | Reasoning |
|-------|-----------|
| `hubspot-property-manager` | Property CRUD operations |
| `hubspot-contact-manager` | Contact operations |
| `hubspot-sfdc-sync-scraper` | Sync status analysis |
| `hubspot-web-enricher` | Data enrichment |
| `hubspot-adoption-tracker` | Adoption metrics |
| `hubspot-schema-automation-agent` | Schema operations |
| `hubspot-cms-page-publisher` | Page publishing |
| `hubspot-landing-page-manager` | Landing page ops |
| `hubspot-form-builder` | Form creation |
| `hubspot-seo-site-crawler` | Site crawling |
| `hubspot-file-extractor` | File extraction |
| `hubspot-admin-specialist` | Admin operations |

#### 🟡 SONNET Tier (26 agents)

| Agent | Reasoning |
|-------|-----------|
| `hubspot-workflow` | Workflow logic design |
| `hubspot-workflow-builder` | Workflow creation |
| `hubspot-workflow-auditor` | Workflow analysis |
| `hubspot-data` | Data operations |
| `hubspot-data-operations-manager` | Data management |
| `hubspot-data-hygiene-specialist` | Data quality |
| `hubspot-api` | API integration |
| `hubspot-integration-specialist` | External integrations |
| `hubspot-assessment-analyzer` | Assessment analysis |
| `hubspot-analytics-reporter` | Analytics reporting |
| `hubspot-attribution-analyst` | Attribution modeling |
| `hubspot-marketing-automation` | Marketing automation |
| `hubspot-email-campaign-manager` | Email campaigns |
| `hubspot-lead-scoring-specialist` | Lead scoring |
| `hubspot-sdr-operations` | SDR workflows |
| `hubspot-pipeline-manager` | Pipeline management |
| `hubspot-territory-manager` | Territory management |
| `hubspot-revenue-intelligence` | Revenue analytics |
| `hubspot-renewals-specialist` | Renewal management |
| `hubspot-plg-foundation` | PLG setup |
| `hubspot-reporting-builder` | Report building |
| `hubspot-service-hub-manager` | Service Hub config |
| `hubspot-commerce-manager` | Commerce operations |
| `hubspot-stripe-connector` | Stripe integration |
| `hubspot-cms-content-manager` | CMS management |
| `hubspot-seo-optimizer` | SEO optimization |

#### 🔴 OPUS Tier (6 agents)

| Agent | Reasoning |
|-------|-----------|
| `hubspot-orchestrator` | Complex multi-step coordination |
| `hubspot-governance-enforcer` | Governance policy decisions |
| `hubspot-autonomous-operations` | Self-sufficient complex ops |
| `hubspot-ai-revenue-intelligence` | AI-powered revenue insights |
| `hubspot-conversation-intelligence` | Complex conversation analysis |
| `hubspot-seo-competitor-analyzer` | Competitive analysis |

---

### OpsPal Core (36 agents)

#### 🟢 HAIKU Tier (10 agents)

| Agent | Reasoning |
|-------|-----------|
| `instance-manager` | Instance operations |
| `instance-backup` | Backup operations |
| `instance-sync` | Sync operations |
| `platform-instance-manager` | Platform switching |
| `n8n-execution-monitor` | Execution monitoring |
| `plugin-doctor` | Plugin health checks |
| `environment-profile-manager` | Environment config |
| `task-scheduler` | Task scheduling |
| `asana-task-manager` | Asana operations |
| `visual-regression-tester` | Visual comparison |

#### 🟡 SONNET Tier (20 agents)

| Agent | Reasoning |
|-------|-----------|
| `diagram-generator` | Mermaid diagram generation |
| `pdf-generator` | PDF document generation |
| `intelligent-intake-orchestrator` | NL-driven project intake |
| `implementation-planner` | Implementation planning |
| `project-connect` | Project connection |
| `n8n-workflow-builder` | n8n workflow creation |
| `n8n-integration-orchestrator` | Integration orchestration |
| `n8n-lifecycle-manager` | Lifecycle management |
| `n8n-optimizer` | Workflow optimization |
| `uat-orchestrator` | UAT test orchestration |
| `playwright-browser-controller` | Browser automation |
| `live-wire-sync-test-orchestrator` | Sync testing |
| `revops-data-quality-orchestrator` | Data quality orchestration |
| `revops-dedup-specialist` | Deduplication |
| `revops-reporting-assistant` | Reporting assistance |
| `sales-funnel-diagnostic` | Funnel analysis |
| `solution-analyzer` | Solution analysis |
| `solution-deployment-orchestrator` | Solution deployment |
| `solution-catalog-manager` | Catalog management |
| `ui-documentation-generator` | UI docs generation |

#### 🔴 OPUS Tier (6 agents)

| Agent | Reasoning |
|-------|-----------|
| `sequential-planner` | Complex multi-step planning with revision |
| `task-graph-orchestrator` | DAG decomposition and execution |
| `solution-runbook-generator` | Comprehensive runbook generation |
| `google-slides-generator` | Complex presentation creation |
| `solution-template-manager` | Template strategy |
| `instance-deployer` | Multi-platform deployment |

---

### Marketo Plugin (23 agents)

#### 🟢 HAIKU Tier (6 agents)

| Agent | Reasoning |
|-------|-----------|
| `marketo-instance-discovery` | Instance discovery |
| `marketo-lead-manager` | Lead operations |
| `marketo-landing-page-manager` | Landing page ops |
| `marketo-form-builder` | Form creation |
| `marketo-data-operations` | Data operations |
| `marketo-email-deliverability-auditor` | Deliverability checks |

#### 🟡 SONNET Tier (14 agents)

| Agent | Reasoning |
|-------|-----------|
| `marketo-campaign-builder` | Campaign creation |
| `marketo-program-architect` | Program design |
| `marketo-program-roi-assessor` | ROI analysis |
| `marketo-webinar-orchestrator` | Webinar management |
| `marketo-email-specialist` | Email operations |
| `marketo-lead-quality-assessor` | Lead quality analysis |
| `marketo-lead-scoring-architect` | Lead scoring design |
| `marketo-mql-handoff-orchestrator` | MQL handoff |
| `marketo-analytics-assessor` | Analytics analysis |
| `marketo-automation-auditor` | Automation audit |
| `marketo-sfdc-sync-specialist` | SFDC sync |
| `marketo-hubspot-bridge` | HubSpot integration |
| `marketo-integration-specialist` | Integration work |
| `marketo-performance-optimizer` | Performance optimization |

#### 🔴 OPUS Tier (3 agents)

| Agent | Reasoning |
|-------|-----------|
| `marketo-orchestrator` | Complex orchestration |
| `marketo-revenue-cycle-analyst` | Revenue cycle analysis |
| `marketo-governance-enforcer` | Governance decisions |

---

### GTM Planning Plugin (7 agents)

#### 🟡 SONNET Tier (5 agents)

| Agent | Reasoning |
|-------|-----------|
| `gtm-strategy-planner` | Strategy planning |
| `gtm-territory-designer` | Territory design |
| `gtm-quota-capacity` | Quota modeling |
| `gtm-comp-planner` | Compensation planning |
| `gtm-data-insights` | Data insights |

#### 🔴 OPUS Tier (2 agents)

| Agent | Reasoning |
|-------|-----------|
| `gtm-planning-orchestrator` | Complex multi-agent GTM coordination (promoted to opus v2.1.32) |
| `gtm-attribution-governance` | Attribution governance |

---

### Developer Tools Plugin (16 core agents)

#### 🟢 HAIKU Tier (8 agents)

| Agent | Reasoning |
|-------|-----------|
| `plugin-validator` | Plugin validation |
| `plugin-scaffolder` | Plugin scaffolding |
| `plugin-documenter` | Documentation generation |
| `mcp-config-cli` | MCP CLI config |
| `mcp-config-desktop` | MCP desktop config |
| `plugin-dependency-tracker` | Dependency tracking |
| `supervisor-auditor` | Audit checks |
| `agent-tester` | Agent testing |

#### 🟡 SONNET Tier (6 agents)

| Agent | Reasoning |
|-------|-----------|
| `agent-developer` | Agent development |
| `agent-quality-analyzer` | Quality analysis |
| `plugin-integration-tester` | Integration testing |
| `plugin-test-generator` | Test generation |
| `plugin-catalog-manager` | Catalog management |
| `plugin-release-manager` | Release management |

#### 🔴 OPUS Tier (2 agents)

| Agent | Reasoning |
|-------|-----------|
| `plugin-publisher` | Complex publishing decisions |
| `project-maintainer` | Project maintenance strategy |

---

### Root/Shared Agents (6 agents)

#### 🟡 SONNET Tier (5 agents)

| Agent | Reasoning |
|-------|-----------|
| `supabase-reflection-analyst` | Reflection analysis |
| `supabase-cohort-detector` | Cohort detection |
| `supabase-fix-planner` | Fix planning |
| `supabase-asana-bridge` | Asana integration |
| `supabase-workflow-manager` | Workflow management |

#### 🔴 OPUS Tier (1 agent)

| Agent | Reasoning |
|-------|-----------|
| `supabase-recurrence-detector` | Complex pattern detection |

---

### Data Hygiene & Monday Plugins (8 agents)

#### 🟢 HAIKU Tier (4 agents)

| Agent | Reasoning |
|-------|-----------|
| `monday-board-manager` | Board operations |
| `monday-item-manager` | Item operations |
| `monday-file-extractor` | File extraction |
| `monday-file-catalog-generator` | Catalog generation |

#### 🟡 SONNET Tier (4 agents)

| Agent | Reasoning |
|-------|-----------|
| `sfdc-hubspot-dedup-orchestrator` | Cross-platform dedup |
| `contact-dedup-orchestrator` | Contact deduplication |
| `monday-batch-operator` | Batch operations |
| `monday-board-analyzer` | Board analysis |

---

## Summary Statistics

| Tier | Count | Percentage | Typical Use Cases |
|------|-------|------------|-------------------|
| 🟢 Haiku | 58 | 26% | Discovery, queries, simple ops |
| 🟡 Sonnet | 127 | 57% | Analysis, generation, standard work |
| 🔴 Opus | 36 | 17% | Complex reasoning, orchestration |

---

## Implementation Recommendations

### 1. Add Model Specification to Agent Frontmatter

```yaml
---
name: agent-name
model: haiku  # or sonnet, opus
description: ...
---
```

### 2. Current vs Recommended

| Current State | Recommended Change |
|---------------|-------------------|
| Most agents: no model specified | Add explicit `model:` field |
| ✅ All `preferredModel:` fields migrated to `model:` | Completed v2.1.32 (18 agents) |
| ✅ `sfdc-cpq-assessor`: promoted haiku → opus | Bug fix: was on weakest model |
| ✅ `sfdc-revops-auditor`: promoted sonnet → opus | Multi-domain statistical analysis |
| ✅ `response-validator`: promoted sonnet → opus | Hallucination detection |
| ✅ `benchmark-research-agent`: promoted sonnet → opus | Citation accuracy |
| ✅ `gtm-planning-orchestrator`: promoted sonnet → opus | Complex GTM coordination |

### 3. Dynamic Escalation Pattern

Consider implementing dynamic escalation where an agent can request a more capable model if it encounters complexity beyond its tier:

```yaml
model: sonnet
escalation:
  trigger: complexity_threshold
  escalate_to: opus
  conditions:
    - error_count > 3
    - confidence < 0.5
    - cross_platform_detected
```

### 4. Cost-Benefit Analysis

| Tier | Relative Cost | Relative Latency | When to Use |
|------|---------------|------------------|-------------|
| Haiku | 1x | ~0.5x | High volume, simple tasks |
| Sonnet | ~3x | 1x | Standard workloads |
| Opus | ~15x | ~2x | Complex, high-value tasks |

**Recommendation**: Default to Sonnet for most work, use Haiku for high-volume simple operations, reserve Opus for truly complex orchestration and strategic planning.

---

## Future: Effort-Aware Model Selection

### Overview

Opus 4.6 introduces **adaptive thinking** with effort levels (`low`, `medium`, `high`, `max`) that control how much reasoning the model applies. This adds a second dimension to model selection beyond just choosing Haiku/Sonnet/Opus.

> **STATUS**: Effort levels are an API-level feature. Claude Code does not yet expose them in agent frontmatter. The mapping below is for future use when the feature becomes available. See `docs/ADAPTIVE_THINKING_GUIDE.md` for full details.

### Planned Complexity-to-Effort Mapping

Our `complexity-rubric.json` scores tasks 0-8+. The natural effort mapping:

| Complexity Score | Effort Level | Current Model Tier |
|-----------------|--------------|-------------------|
| 0-2 | `low` | Haiku |
| 3-4 | `medium` | Sonnet |
| 5-6 | `high` | Sonnet/Opus |
| 7+ | `max` | Opus |

### Opus Agents That Would Benefit from `max` Effort

These agents perform the deepest analysis and would benefit most from extended thinking:

| Agent | Why `max` Effort Helps |
|-------|----------------------|
| `sfdc-cpq-assessor` | Multi-domain CPQ analysis, pricing rule evaluation |
| `sfdc-revops-auditor` | Statistical analysis across pipeline, forecast, process domains |
| `response-validator` | Hallucination detection requiring careful step-by-step reasoning |
| `benchmark-research-agent` | Citation accuracy, source verification |
| `sfdc-orchestrator` | Complex dependency management, multi-agent coordination |

### Haiku Agents That Should Use `low` Effort

These agents do simple, well-defined work where thinking overhead only hurts latency:

| Agent | Why `low` Effort Is Sufficient |
|-------|-------------------------------|
| `sfdc-discovery` | Read-only org queries, no reasoning needed |
| `sfdc-cli-executor` | Command execution, deterministic |
| `sfdc-query-specialist` | SOQL building from well-defined patterns |
| `sfdc-api-monitor` | Metrics collection, pattern matching |

### Cost Optimization Opportunity

Effort levels create a new optimization axis:

| Combination | Relative Cost | Use Case |
|-------------|--------------|----------|
| Haiku + low | 1x | Discovery, status checks |
| Sonnet + medium | ~3x | Standard analysis |
| Sonnet + high | ~4x | Complex analysis (cheaper than Opus) |
| Opus + low | ~8x | Quick orchestration decisions |
| Opus + max | ~20x | Deep strategic analysis |

**Key insight**: Sonnet with `high` effort may match Opus with `low` effort for many tasks, at ~50% of the cost.

### When Available

When Claude Code adds `effort:` to agent frontmatter, we will:
1. Add `effort: max` to the 5 Opus agents listed above
2. Add `effort: low` to all Haiku-tier agents
3. Update the agent scaffolding template in developer-tools-plugin
4. Run A/B comparisons to validate the mapping

## Next Steps

1. **Phase 1**: Update critical agents with explicit model specifications
2. **Phase 2**: Add model field to all remaining agents
3. **Phase 3**: Implement dynamic escalation for edge cases
4. **Phase 4**: Monitor and adjust based on performance metrics
5. **Phase 5**: Wire effort levels into agent frontmatter (blocked on Claude Code support)

---

## Implementation Status ✅

**Completed**: 2025-12-29

### Final Distribution

| Tier | Count | Percentage |
|------|-------|------------|
| 🟢 **Haiku** | 37 | 17% |
| 🟡 **Sonnet** | 160 | 73% |
| 🔴 **Opus** | 19 | 9% |
| Other | 2 | 1% |
| **Total** | 218 | 100% |

### Opus Tier Agents (19)
Complex orchestration and strategic planning:
- `sfdc-orchestrator`, `sfdc-planner`, `sfdc-revops-coordinator`
- `sfdc-agent-governance`, `sfdc-compliance-officer`, `sfdc-einstein-admin`
- `sfdc-performance-optimizer`, `flow-diagnostician`, `flow-test-orchestrator`
- `hubspot-orchestrator`, `hubspot-governance-enforcer`, `hubspot-autonomous-operations`
- `hubspot-ai-revenue-intelligence`, `hubspot-conversation-intelligence`, `hubspot-seo-competitor-analyzer`
- `marketo-orchestrator`, `marketo-governance-enforcer`, `marketo-revenue-cycle-analyst`
- `solution-runbook-generator`

### Haiku Tier Agents (37)
Simple, read-only, or execution-focused tasks:
- **Salesforce**: `sfdc-cli-executor`, `sfdc-discovery`, `sfdc-api-monitor`, `sfdc-object-auditor`, `sfdc-layout-analyzer`, `sfdc-report-type-manager`, `sfdc-report-template-deployer`, `sfdc-csv-enrichment`, `sfdc-data-export-manager`, `sfdc-territory-discovery`, `sfdc-territory-monitor`, `sfdc-sales-operations`, `sfdc-ui-customizer`, `flow-log-analyst`, `apex-debug-analyst`
- **HubSpot**: `hubspot-property-manager`, `hubspot-contact-manager`, `hubspot-sfdc-sync-scraper`, `hubspot-web-enricher`, `hubspot-adoption-tracker`, `hubspot-schema-automation-agent`, `hubspot-cms-page-publisher`, `hubspot-seo-site-crawler`, `hubspot-admin-specialist`
- **Marketo**: `marketo-instance-discovery`, `marketo-lead-manager`, `marketo-landing-page-manager`, `marketo-form-builder`, `marketo-data-operations`, `marketo-email-deliverability-auditor`
- **Cross-Platform**: `instance-manager`, `instance-deployer`, `platform-instance-manager`, `n8n-execution-monitor`, `task-scheduler`, `visual-regression-tester`
- **Dev Tools**: `mcp-config-cli`, `mcp-config-desktop`

### Estimated Cost Savings

With this tier distribution:
- **17% of calls** use Haiku (~15x cheaper than Opus)
- **73% of calls** use Sonnet (~5x cheaper than Opus)
- **9% of calls** use Opus (full capability where needed)

**Estimated overall cost reduction**: ~60-70% compared to running all sub-agents on Opus.

---

*Generated by Claude Opus 4.5 for OpsPal Plugin Development*
