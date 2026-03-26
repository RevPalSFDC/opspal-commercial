# Routing Help - Agent Selection Guide

> Generated from `routing-patterns.json` v3.4.0
> Last updated: 2026-03-26 | Hash: 841a88507c1f

This document is auto-generated from the canonical routing registry.
Do not edit directly - modify `plugins/opspal-core/config/routing-patterns.json` instead.

## Overview

The routing system automatically directs tasks to specialized agents based on keywords.
When a keyword match is found, the corresponding agent should be invoked via the Agent tool.

## Exclusive Keywords

These keywords must route to exactly one agent:

| Keyword | Exclusive Agent |
|---------|-----------------|
| `cpq` | `opspal-salesforce:sfdc-cpq-assessor` |
| `q2c` | `opspal-salesforce:sfdc-cpq-assessor` |
| `revops` | `opspal-salesforce:sfdc-revops-auditor` |
| `territory` | `opspal-salesforce:sfdc-territory-orchestrator` |
| `permission.*set` | `opspal-salesforce:sfdc-permission-orchestrator` |
| `nrr` | `opspal-gtm-planning:gtm-retention-analyst` |
| `ndr` | `opspal-gtm-planning:gtm-retention-analyst` |
| `tam` | `opspal-gtm-planning:gtm-market-intelligence` |
| `sam` | `opspal-gtm-planning:gtm-market-intelligence` |
| `som` | `opspal-gtm-planning:gtm-market-intelligence` |
| `okr` | `opspal-okrs:okr-strategy-orchestrator` |

## Salesforce Patterns

Salesforce-specific routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| cpq-assessment | cpq, quote.*pricing, pricing.*config | `opspal-salesforce:sfdc-cpq-assessor` | 🔴 Yes |
| revops-assessment | revops.*assessment, assessment.*revops, revops.*audit | `opspal-salesforce:sfdc-revops-auditor` | 🔴 Yes |
| revops-reporting | revops.*report, pipeline.*health.*report, kpi.*report | `opspal-core:revops-reporting-assistant` | 🟢 No |
| automation-audit | automation audit, flow audit, trigger audit | `opspal-salesforce:sfdc-automation-auditor` | 🔴 Yes |
| permission-set-field-maintenance | add.*field.*permission set, update.*field.*permission set, modify.*permission set | `opspal-salesforce:sfdc-permission-orchestrator` | 🟢 No |
| permission-set | permission set, permission.*create, profile.*permission | `opspal-salesforce:sfdc-permission-orchestrator` | 🔴 Yes |
| reports-dashboards | report.*create, dashboard.*create, create.*report | `opspal-salesforce:sfdc-reports-dashboards` | 🔴 Yes |
| report-template-extraction | extract.*report, user.*report.*template, report.*template | `opspal-salesforce:sfdc-reports-dashboards` | 🟢 No |
| revops-audit | revops, revenue ops, pipeline | `opspal-salesforce:sfdc-revops-auditor` | 🔴 Yes |
| data-operations | import.*data, export.*data, data.*import | `opspal-salesforce:sfdc-data-operations` | 🔴 Yes |
| territory | territory, territory2, territory.*model | `opspal-salesforce:sfdc-territory-orchestrator` | 🔴 Yes |
| deployment | deploy.*metadata, sf.*deploy, metadata.*deploy | `opspal-salesforce:sfdc-deployment-manager` | 🔴 Yes |
| discovery | discover.*org, org.*analysis, sfdc.*discovery | `opspal-salesforce:sfdc-discovery` | 🟢 No |
| state-discovery | inspect.*org, schema.*inspect, describe.*(object|sobject) | `opspal-salesforce:sfdc-state-discovery` | 🟢 No |
| implementation-planning | plan.*salesforce.*implementation, implementation.*plan.*salesforce, salesforce.*implementation.*plan | `opspal-salesforce:sfdc-planner` | 🟢 No |
| field-analysis | pricing.*field, field.*usage.*audit, field.*population.*analysis | `opspal-salesforce:sfdc-field-analyzer` | 🟢 No |
| data-quality-audit | salesforce.*data.*quality, data.*quality.*salesforce, audit.*data.*quality.*object | `opspal-salesforce:sfdc-quality-auditor` | 🟢 No |
| apex-development | apex.*class, apex.*trigger, write.*apex | `opspal-salesforce:sfdc-apex-developer` | 🟢 No |
| deployment-conflict-resolution | deployment.*conflict, metadata.*conflict, resolve.*deployment.*error | `opspal-salesforce:sfdc-conflict-resolver` | 🟢 No |
| flow-creation | create.*salesforce.*flow, build.*salesforce.*flow, (salesforce|sfdc).*flow.*builder | `opspal-salesforce:sfdc-automation-builder` | 🟢 No |
| validation-rule | validation.*rule, create.*validation | `opspal-salesforce:validation-rule-orchestrator` | 🟢 No |
| query | soql, query.*salesforce, sf.*query | `opspal-salesforce:sfdc-query-specialist` | 🟢 No |

## Hubspot Patterns

HubSpot-specific routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| workflow-audit | hubspot.*workflow.*audit, audit.*hubspot.*workflow, workflow.*analysis.*hubspot | `opspal-hubspot:hubspot-workflow-auditor` | 🟢 No |
| workflow | hubspot.*workflow, workflow.*hubspot, hs.*workflow | `opspal-hubspot:hubspot-workflow-builder` | 🟢 No |
| contact-management | hubspot.*contact, contact.*hubspot, hs.*contact | `opspal-hubspot:hubspot-contact-manager` | 🟢 No |
| data-operations | hubspot.*import, hubspot.*export, hs.*data | `opspal-hubspot:hubspot-data-operations-manager` | 🟢 No |
| property-management | hubspot.*property, property.*hubspot, custom.*property | `opspal-hubspot:hubspot-property-manager` | 🟢 No |
| integration | hubspot.*integration, hubspot.*api, hs.*webhook | `opspal-hubspot:hubspot-integration-specialist` | 🟢 No |
| analytics | hubspot.*report, hubspot.*analytics, hs.*metrics | `opspal-hubspot:hubspot-analytics-reporter` | 🟢 No |
| marketing | hubspot.*email, hubspot.*campaign, hs.*marketing | `opspal-hubspot:hubspot-marketing-automation` | 🟢 No |
| assessment | hubspot.*assessment, hubspot.*audit, portal.*health | `opspal-hubspot:hubspot-assessment-analyzer` | 🔴 Yes |

## Marketo Patterns

Marketo-specific routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| campaign | marketo.*campaign, campaign.*marketo, smart.*campaign | `opspal-marketo:marketo-campaign-builder` | 🟢 No |
| lead-scoring-architect | lead.*scoring.*model, scoring.*model, model.*lead.*scoring | `opspal-marketo:marketo-lead-scoring-architect` | 🔴 Yes |
| lead-management | marketo.*lead, lead.*marketo, mkto.*lead | `opspal-marketo:marketo-lead-manager` | 🟢 No |
| program | marketo.*program, program.*marketo, create.*program | `opspal-marketo:marketo-program-architect` | 🟢 No |
| email | marketo.*email, email.*marketo, email.*template | `opspal-marketo:marketo-email-specialist` | 🟢 No |
| analytics | marketo.*analytics, marketo.*report, mkto.*metrics | `opspal-marketo:marketo-analytics-assessor` | 🟢 No |
| discovery | marketo.*discover, marketo.*explore, instance.*analysis | `opspal-marketo:marketo-instance-discovery` | 🟢 No |
| lead-quality | lead.*quality, database.*health, marketo.*audit | `opspal-marketo:marketo-lead-quality-assessor` | 🔴 Yes |
| sfdc-sync | marketo.*salesforce, sfdc.*sync, sync.*error | `opspal-marketo:marketo-sfdc-sync-specialist` | 🔴 Yes |

## Okrs Patterns

OKR strategy and lifecycle routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| okr-strategy | okr, objective, key result | `opspal-okrs:okr-strategy-orchestrator` | 🔴 Yes |
| okr-initiative-scoring | score.*initiative, initiative.*priorit, okr.*priorit | `opspal-okrs:okr-initiative-prioritizer` | 🔴 Yes |
| okr-data-collection | okr.*snapshot, revenue.*snapshot, okr.*data | `opspal-okrs:okr-data-aggregator` | 🟢 No |
| okr-generation | generate.*okr, draft.*okr, create.*okr | `opspal-okrs:okr-generator` | 🟢 No |
| okr-learning | okr.*retrospective, okr.*history, okr.*learning | `opspal-okrs:okr-learning-engine` | 🟢 No |
| okr-plg | okr.*plg, plg.*signal, pql.*signal | `opspal-okrs:okr-plg-specialist` | 🟢 No |
| okr-benchmark | okr.*benchmark, benchmark.*okr, okr.*peer.*comparison | `opspal-okrs:okr-initiative-evaluator` | 🟢 No |

## CrossPlatform Patterns

Cross-platform routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| diagram | diagram, flowchart, erd | `opspal-core:diagram-generator` | 🟢 No |
| release | release, deploy.*prod, production.*deploy | `opspal-core:release-coordinator` | 🔴 Yes |
| benchmark | benchmark, industry.*average, typical.*rate | `opspal-salesforce:benchmark-research-agent` | 🟢 No |
| pdf-generation | pdf, generate.*pdf, export.*pdf | `opspal-core:pdf-generator` | 🟢 No |
| web-viz | dashboard.*create, interactive.*chart, web.*viz | `opspal-core:web-viz-generator` | 🟢 No |
| asana | asana, task.*asana, project.*asana | `opspal-core:asana-task-manager` | 🟢 No |
| intake | intake, project.*intake, new.*project | `opspal-core:intelligent-intake-orchestrator` | 🟢 No |
| uat-testing | uat, acceptance.*test, test.*cases | `opspal-core:uat-orchestrator` | 🟢 No |
| pipeline-intelligence | pipeline.*health, pipeline.*deal.*risk, (salesforce|sfdc).*deal.*risk | `opspal-core:pipeline-intelligence-agent` | 🔴 Yes |
| sales-playbook | playbook, next.*best.*action, sales.*guidance | `opspal-core:sales-playbook-orchestrator` | 🟢 No |
| account-expansion | expansion, upsell, cross.*sell | `opspal-core:account-expansion-orchestrator` | 🔴 Yes |
| cs-operations | customer.*success, qbr, health.*score | `opspal-core:cs-operations-orchestrator` | 🔴 Yes |
| sales-enablement | enablement, sales.*training, skill.*gap | `opspal-core:sales-enablement-coordinator` | 🟢 No |
| multi-platform-campaign | campaign.*orchestration, multi.*platform.*campaign, cross.*platform.*marketing | `opspal-core:multi-platform-campaign-orchestrator` | 🔴 Yes |
| unified-exec-dashboard | executive.*dashboard, unified.*dashboard, c.*level.*report | `opspal-core:unified-exec-dashboard-agent` | 🔴 Yes |
| multi-platform-workflow | multi.*platform.*workflow, cross.*platform.*automation, workflow.*orchestration | `opspal-core:multi-platform-workflow-orchestrator` | 🔴 Yes |
| data-migration | data.*migration, platform.*migration, etl | `opspal-core:data-migration-orchestrator` | 🔴 Yes |
| field-dictionary | field.*dictionary, data.*dictionary, field.*context | `opspal-core:field-dictionary-manager` | 🟢 No |
| notebooklm | notebook, knowledge.*base, client.*context | `opspal-core:notebooklm-knowledge-manager` | 🟢 No |
| gong-deal-risk | gong.*risk, deal.*risk.*gong, conversation.*health | `opspal-core:gong-deal-intelligence-agent` | 🟢 No |
| gong-sync | sync.*gong, gong.*sync, import.*gong.*call | `opspal-core:gong-sync-orchestrator` | 🔴 Yes |
| gong-competitive | gong.*competi, competi.*intel.*gong, gong.*tracker | `opspal-core:gong-competitive-intelligence-agent` | 🟢 No |
| gong-auth | gong.*auth, gong.*credential, gong.*api.*key | `opspal-core:gong-integration-agent` | 🟢 No |
| conversation-intelligence-aggregation | gong.*and.*fireflies, fireflies.*and.*gong, combined.*conversation.*intelligence | `opspal-core:conversation-intelligence-aggregator` | 🟢 No |
| fireflies-meeting-intelligence | fireflies.*transcript, fireflies.*meeting, meeting.*transcript | `opspal-core:fireflies-meeting-intelligence-agent` | 🟢 No |
| fireflies-integration | sync.*fireflies, fireflies.*sync, fireflies.*salesforce | `opspal-core:fireflies-integration-agent` | 🟢 No |
| opspal-scoring | opspal.*score, health.*score, churn.*risk | `opspal-mcp-client:mcp-scoring-orchestrator` | 🟢 No |
| opspal-compute | opspal.*compute, monte.*carlo.*revenue, compute.*revenue.*model | `opspal-mcp-client:mcp-compute-orchestrator` | 🟢 No |
| opspal-benchmark | opspal.*benchmark, funnel.*benchmark, retention.*benchmark | `opspal-mcp-client:mcp-benchmark-agent` | 🟢 No |
| revops-maturity | revops.*maturity, maturity.*assessment, platform.*health | `opspal-core:revops-maturity-orchestrator` | 🔴 Yes |
| remediation | remediation.*plan, fix.*roadmap, implementation.*plan.*remediation | `opspal-core:remediation-sequencer` | 🟢 No |
| board-pack | qbr, board.*pack, quarterly.*review | `opspal-core:board-pack-orchestrator` | 🔴 Yes |
| impact-analysis | impact.*analysis, what.*breaks, field.*change.*impact | `opspal-core:cross-platform-impact-analyzer` | 🟢 No |
| revops-query | what.*is.*our, how.*many, show.*me.*pipeline | `opspal-core:revops-query-agent` | 🟢 No |

## GtmPlanning Patterns

GTM Planning routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| strategic-reports | strategic.*report, gtm.*report, arr.*waterfall | `opspal-gtm-planning:gtm-strategic-reports-orchestrator` | 🔴 Yes |
| revenue-modeler | revenue.*model, arr.*projection, scenario.*planning | `opspal-gtm-planning:gtm-revenue-modeler` | 🔴 Yes |
| retention-analyst | nrr, ndr, retention.*analysis | `opspal-gtm-planning:gtm-retention-analyst` | 🔴 Yes |
| market-intelligence | tam, sam, som | `opspal-gtm-planning:gtm-market-intelligence` | 🔴 Yes |
| forecast-orchestrator | forecast, revenue.*prediction, booking.*forecast | `opspal-gtm-planning:forecast-orchestrator` | 🔴 Yes |
| territory-planning | territory.*design, quota.*model, capacity.*planning | `opspal-gtm-planning:gtm-territory-designer` | 🔴 Yes |
| gtm-asana | gtm.*asana, planning.*asana, sync.*territories.*asana | `opspal-gtm-planning:gtm-asana-bridge` | 🟢 No |

## Mandatory Patterns

These patterns MUST be routed to their designated agent:

| Pattern | Keywords | Agent | Reason |
|---------|----------|-------|--------|
| `prod-deploy` | deploy.*prod, production.*deploy | `opspal-core:release-coordinator` | Production deployments require orchestration |
| `bulk-delete` | delete.*bulk, bulk.*delete | `opspal-salesforce:sfdc-data-operations` | Bulk deletions require safety checks |
| `permission-security-write` | create.*permission set, update.*permission set | `opspal-salesforce:sfdc-permission-orchestrator` | Permission/security writes must start with the canonical permission orchestrator |
| `prod-permissions` | permission.*prod, profile.*change.*prod | `opspal-salesforce:sfdc-permission-orchestrator` | Production permission/security changes require canonical orchestration and audit |
| `destructive-metadata` | drop.*field, remove.*object | `opspal-salesforce:sfdc-metadata-manager` | Destructive metadata operations require rollback plan |
| `prod-merge` | merge.*prod, merge.*main | `opspal-core:release-coordinator` | Production merges require release coordination |
| `record-dedup-merge` | merge.*duplicate.*(account|contact|lead), dedup(e|lication)?.*(account|contact|lead) | `opspal-salesforce:sfdc-merge-orchestrator` | Record merge/dedup operations require controlled orchestration |

## Blocking Thresholds

| Level | Complexity | Action |
|-------|------------|--------|
| Mandatory | 1 | **Must use agent** - No exceptions |
| High | 0.7 | Strongly recommended - Agent blocking enabled |
| Recommended | 0.5 | Agent suggested - Optional |
| Available | 0 | Agent available if needed |

---

## Regenerating This Document

```bash
node plugins/opspal-core/scripts/lib/routing-docs-generator.js generate
```

*Registry version: 3.4.0*