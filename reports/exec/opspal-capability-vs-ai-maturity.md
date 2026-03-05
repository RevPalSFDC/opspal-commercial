# OpsPal Capability vs AI Maturity Heatmap

Source Fingerprint: `305808dbe315d5f1`

## What OpsPal Is Solving For (Current State)
- **opspal-ai-consult**: Cross-model AI consultation plugin - get second opinions from Google Gemini. Features: non-interactive Gemini CLI invocation, Claude + Gemini response synthesis, alignment scoring, auto-consultation triggers, domain canonicalization for shadow duplicate detection, and ACE skill registry integration for learning from outcomes.
- **opspal-core**: OpsPal Core - Cross-platform pipeline orchestration with parallel execution, environment preflight & self-healing, offline PPTX/PDF generation, diagrams (Mermaid/Lucid), Google Slides, Asana integration, task scheduling, sub-agent routing, ACE self-learning, project intake system, RevOps data quality governance, cross-platform HubSpot+Salesforce deduplication, NotebookLM client knowledge bases, LLM-ready field dictionaries, Supabase credential validation, and task retry helper with circuit breaker. 48 agents.
- **opspal-data-hygiene**: [DEPRECATED] Cross-platform data deduplication and hygiene management for HubSpot and Salesforce. Functionality has been consolidated into opspal-core. Use /dedup-companies or /deduplicate commands instead.
- **opspal-gtm-planning**: GTM Annual Planning framework with strategic reporting templates. Includes territory design, quota modeling, compensation planning, revenue modeling, retention analysis, market intelligence, and 13 strategic report templates. 11 agents, 14 commands, 3 skill frameworks.
- **opspal-hubspot**: HubSpot operations: workflows, contacts, deals, marketing campaigns, CMS blog management, HubDB, serverless functions, Developer Platform apps with app cards and settings components, Imports V3 API, Goal Targets V3 API (quotas, attainment), Automation Actions V4 API (custom workflow actions, callbacks), analytics, Salesforce sync, Service Hub, revenue intelligence, and list-workflow pairing validation. 54 agents.
- **opspal-marketo**: Marketo marketing automation: leads, smart campaigns, email, landing pages, programs, analytics, Salesforce sync, MQL handoff, agentic automation, Claude-powered observability, campaign diagnostics, and lead routing diagnostics with safe remediation workflows.
- **opspal-monday**: [EXPERIMENTAL] Monday.com board and item management: CRUD operations, batch processing, file catalog generation, CSV/JSON import/export, and cross-board operations.
- **opspal-salesforce**: Salesforce metadata, CPQ/RevOps assessments, Flow automation with intelligent segmentation, layout management, and permission sets with automated error prevention. Now with deterministic Report CRUD pipeline: ReportPlan contract, type fallback engine, constraint auto-correction, semantic disambiguation, preflight auto-repair, patch-based updates, dependency-aware deletion, and operational telemetry. 92 agents.

## Source-of-Truth Suite Matrix

| Metric | Count |
|---|---:|
| Plugins | 8 |
| Agents | 270 |
| Commands | 234 |
| Skills | 55 |
| Hooks | 142 |
| Scripts | 1732 |

## Plugin Inventory and Governance Shape

| Plugin | Owner | Status | Stability | Agents | Commands | Skills | Hooks | Scripts | Mandatory Agents |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| `opspal-ai-consult` | `revpal-ai` | active | stable | 2 | 3 | 0 | 1 | 6 | 0 |
| `opspal-core` | `revpal-platform` | active | stable | 65 | 90 | 12 | 70 | 476 | 7 |
| `opspal-data-hygiene` | `revpal-platform` | deprecated | deprecated | 2 | 1 | 1 | 0 | 13 | 2 |
| `opspal-gtm-planning` | `revpal-gtm` | active | stable | 12 | 15 | 3 | 0 | 2 | 1 |
| `opspal-hubspot` | `revpal-hubspot` | active | stable | 59 | 34 | 11 | 11 | 109 | 6 |
| `opspal-marketo` | `revpal-marketing-ops` | active | stable | 30 | 30 | 7 | 20 | 36 | 25 |
| `opspal-monday` | `revpal-experimental` | experimental | experimental | 6 | 1 | 1 | 0 | 3 | 0 |
| `opspal-salesforce` | `revpal-salesforce` | active | stable | 94 | 60 | 20 | 40 | 1087 | 20 |

## Workflow Stage Coverage Heatmap

| Plugin | Detect | Diagnose | Recommend | Simulate | Execute | Verify | Learn |
|---|---:|---:|---:|---:|---:|---:|---:|
| `opspal-ai-consult` | 1 | 2 | 0 | 0 | 1 | 3 | 0 |
| `opspal-core` | 12 | 41 | 29 | 4 | 125 | 102 | 13 |
| `opspal-data-hygiene` | 0 | 0 | 0 | 0 | 4 | 3 | 0 |
| `opspal-gtm-planning` | 1 | 17 | 13 | 12 | 13 | 10 | 0 |
| `opspal-hubspot` | 11 | 24 | 7 | 5 | 77 | 29 | 6 |
| `opspal-marketo` | 12 | 23 | 2 | 1 | 56 | 30 | 4 |
| `opspal-monday` | 1 | 4 | 0 | 0 | 4 | 0 | 1 |
| `opspal-salesforce` | 33 | 61 | 22 | 4 | 111 | 91 | 12 |

## AI Maturity Heatmap

| Plugin | Rules-Based | LLM-Assisted | Closed-Loop Learning | Autonomous Execution | AI-Enabled Ratio |
|---|---:|---:|---:|---:|---:|
| `opspal-ai-consult` | 1 | 5 | 0 | 0 | 83.3% |
| `opspal-core` | 204 | 12 | 11 | 10 | 13.9% |
| `opspal-data-hygiene` | 2 | 0 | 0 | 2 | 50.0% |
| `opspal-gtm-planning` | 30 | 0 | 0 | 0 | 0.0% |
| `opspal-hubspot` | 101 | 5 | 6 | 3 | 12.2% |
| `opspal-marketo` | 77 | 5 | 1 | 4 | 11.5% |
| `opspal-monday` | 8 | 0 | 0 | 0 | 0.0% |
| `opspal-salesforce` | 188 | 5 | 10 | 11 | 12.1% |

## Documentation Drift Signals
_No drift detected._

## Missed Opportunities (Top 12)
1. **Copilot Approval Queue for Mandatory Route Outputs** (`OPP-003`, ai_leverage, score 4.4) - High mandatory-agent concentration requires a unified approval workflow for production-impacting recommendations.
2. **Unified RevOps Next-Best-Action Layer** (`OPP-009`, ai_leverage, score 4.2) - Insights exist across many agents, but remediation sequencing is fragmented without unified next-best-action ranking.
3. **Data Hygiene Sunset Completion** (`OPP-005`, feature_gap, score 4.18) - Deprecated plugin capabilities still represent migration surface area and support overhead.
4. **Capability Narrative Drift Guardrail** (`OPP-001`, feature_gap, score 4.06) - Top-level product narratives drift from generated registry truth, weakening leadership confidence and field alignment.
5. **Cross-Plugin Command Telemetry Contract** (`OPP-004`, feature_gap, score 3.88) - Command-level outcomes are not normalized for comparable executive-level KPI tracking across plugins.
6. **Manual Review Load Reduction in Dedup and Routing** (`OPP-007`, ai_leverage, score 3.88) - Manual review checkpoints are necessary but expensive; confidence-scored triage can shrink review volume.
7. **AI Maturity Uplift for Lowest-Coverage Plugins** (`OPP-002`, ai_leverage, score 3.7) - AI-enabled capability coverage is uneven across plugins, reducing perceived suite intelligence consistency.
8. **Initiative ROI Instrumentation Layer** (`OPP-011`, feature_gap, score 3.68) - ROI reporting exists in pockets; initiative-level KPI baseline/target tracking is not consistently surfaced for executives.
9. **Strategy Dashboard Gap Category Feeds** (`OPP-012`, feature_gap, score 3.66) - The strategy dashboard command does not yet consume dedicated AI-gap and feature-gap portfolio payloads.
10. **Monday Plugin Graduation Readiness** (`OPP-006`, feature_gap, score 3.18) - Experimental plugin status limits enterprise confidence and routable use-case expansion.
11. **Cross-Model Consultation Expansion** (`OPP-008`, ai_leverage, score 3.18) - Cross-model consultation value is concentrated in a single plugin rather than embedded in key orchestration paths.
12. **Forecast and Simulation Standardization** (`OPP-010`, feature_gap, score 3.18) - Forecasting/simulation logic is distributed across domains without a shared confidence and scenario contract.

## Notes
- Classification is deterministic keyword-based over agent/command/skill/hook metadata.
- Scores are normalized to a 1.0-5.0 range with copilot-first governance weighting.
- Manifest alignment check: no mismatches detected between catalog and plugin manifests.
