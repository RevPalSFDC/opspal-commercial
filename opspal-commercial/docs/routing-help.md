# Routing Help - Agent Selection Guide

> Generated from `routing-patterns.json` v3.0.0
> Last updated: 2026-02-03 | Hash: f90dd1c45bbb

This document is auto-generated from the canonical routing registry.
Do not edit directly - modify `plugins/opspal-core/config/routing-patterns.json` instead.

## Overview

The routing system automatically directs tasks to specialized agents based on keywords.
When a keyword match is found, the corresponding agent should be invoked via the Task tool.

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

## Salesforce Patterns

Salesforce-specific routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| cpq-assessment | cpq, quote.*pricing, pricing.*config | `opspal-salesforce:sfdc-cpq-assessor` | 🔴 Yes |
| revops-audit | revops, revenue ops, pipeline | `opspal-salesforce:sfdc-revops-auditor` | 🔴 Yes |
| automation-audit | automation audit, flow audit, trigger audit | `opspal-salesforce:sfdc-automation-auditor` | 🔴 Yes |
| permission-set | permission set, permission.*create, profile.*permission | `opspal-salesforce:sfdc-permission-orchestrator` | 🔴 Yes |
| reports-dashboards | report.*create, dashboard.*create, create.*report | `opspal-salesforce:sfdc-reports-dashboards` | 🔴 Yes |
| report-template-extraction | extract.*report, user.*report.*template, report.*template | `opspal-salesforce:sfdc-reports-dashboards` | 🟢 No |
| data-operations | import.*data, export.*data, data.*import | `opspal-salesforce:sfdc-data-operations` | 🔴 Yes |
| territory | territory, territory2, territory.*model | `opspal-salesforce:sfdc-territory-orchestrator` | 🔴 Yes |
| deployment | deploy.*metadata, sf.*deploy, metadata.*deploy | `opspal-salesforce:sfdc-deployment-manager` | 🟢 No |
| discovery | discover.*org, org.*analysis, sfdc.*discovery | `opspal-salesforce:sfdc-discovery` | 🟢 No |
| apex-development | apex.*class, apex.*trigger, write.*apex | `opspal-salesforce:sfdc-apex-developer` | 🟢 No |
| flow-creation | create.*flow, build.*flow, flow.*builder | `opspal-salesforce:sfdc-automation-builder` | 🟢 No |
| validation-rule | validation.*rule, create.*validation | `opspal-salesforce:validation-rule-orchestrator` | 🟢 No |
| query | soql, query.*salesforce, sf.*query | `opspal-salesforce:sfdc-query-specialist` | 🟢 No |

## Hubspot Patterns

HubSpot-specific routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
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
| lead-management | marketo.*lead, lead.*marketo, lead.*scoring | `opspal-marketo:marketo-lead-manager` | 🟢 No |
| program | marketo.*program, program.*marketo, create.*program | `opspal-marketo:marketo-program-architect` | 🟢 No |
| email | marketo.*email, email.*marketo, email.*template | `opspal-marketo:marketo-email-specialist` | 🟢 No |
| analytics | marketo.*analytics, marketo.*report, mkto.*metrics | `opspal-marketo:marketo-analytics-assessor` | 🟢 No |
| discovery | marketo.*discover, marketo.*explore, instance.*analysis | `opspal-marketo:marketo-instance-discovery` | 🟢 No |
| lead-quality | lead.*quality, database.*health, marketo.*audit | `opspal-marketo:marketo-lead-quality-assessor` | 🔴 Yes |
| sfdc-sync | marketo.*salesforce, sfdc.*sync, sync.*error | `opspal-marketo:marketo-sfdc-sync-specialist` | 🔴 Yes |

## CrossPlatform Patterns

Cross-platform routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| diagram | diagram, flowchart, erd | `opspal-core:diagram-generator` | 🟢 No |
| release | release, deploy.*prod, production.*deploy | `release-coordinator` | 🔴 Yes |
| benchmark | benchmark, industry.*average, typical.*rate | `opspal-salesforce:benchmark-research-agent` | 🟢 No |
| pdf-generation | pdf, generate.*pdf, export.*pdf | `opspal-core:pdf-generator` | 🟢 No |
| web-viz | dashboard.*create, interactive.*chart, web.*viz | `opspal-core:web-viz-generator` | 🟢 No |
| asana | asana, task.*asana, project.*asana | `opspal-core:asana-task-manager` | 🟢 No |
| intake | intake, project.*intake, new.*project, kickoff, scope.*document, classify.*request, plan.*project | `opspal-core:intelligent-intake-orchestrator` | 🟢 No |
| uat-testing | uat, acceptance.*test, test.*cases | `opspal-core:uat-test-orchestrator` | 🟢 No |
| pipeline-intelligence | pipeline.*health, deal.*risk, bottleneck | `opspal-core:pipeline-intelligence-agent` | 🔴 Yes |
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

## GtmPlanning Patterns

GTM Planning routing patterns

| Pattern ID | Keywords | Agent | Blocking |
|------------|----------|-------|----------|
| strategic-reports | strategic.*report, gtm.*report, arr.*waterfall | `opspal-gtm-planning:gtm-strategic-reports-orchestrator` | 🔴 Yes |
| revenue-modeler | revenue.*model, arr.*projection, scenario.*planning | `opspal-gtm-planning:gtm-revenue-modeler` | 🔴 Yes |
| retention-analyst | nrr, ndr, retention.*analysis | `opspal-gtm-planning:gtm-retention-analyst` | 🔴 Yes |
| market-intelligence | tam, sam, som | `opspal-gtm-planning:gtm-market-intelligence` | 🔴 Yes |
| forecast-orchestrator | forecast, revenue.*prediction, booking.*forecast | `opspal-gtm-planning:forecast-orchestrator` | 🔴 Yes |
| territory-planning | territory.*design, quota.*model, capacity.*planning | `opspal-gtm-planning:gtm-territory-planner` | 🔴 Yes |

## Mandatory Patterns

These patterns MUST be routed to their designated agent:

| Pattern | Keywords | Agent | Reason |
|---------|----------|-------|--------|
| `prod-deploy` | deploy.*prod, production.*deploy | `release-coordinator` | Production deployments require orchestration |
| `bulk-delete` | delete.*bulk, bulk.*delete | `sfdc-data-operations` | Bulk deletions require safety checks |
| `prod-permissions` | permission.*prod, profile.*change.*prod | `sfdc-security-admin` | Production permission changes require audit |
| `destructive-metadata` | drop.*field, remove.*object | `sfdc-metadata-manager` | Destructive metadata operations require rollback plan |
| `prod-merge` | merge.*prod, merge.*main | `release-coordinator` | Production merges require release coordination |

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

*Registry version: 3.0.0*