---
name: pipeline
description: Run parallel cross-platform operations across Salesforce, HubSpot, Asana, and Marketo with automatic reconciliation
argument-hint: "\"<natural language request describing cross-platform operation>\""
visibility: user-invocable
tags:
  - cross-platform
  - pipeline
  - orchestration
  - parallel
---

# Cross-Platform Pipeline

Run parallel operations across multiple platforms (Salesforce, HubSpot, Asana, Marketo), reconcile results, and generate gap analysis reports.

## Route to Agent

This command routes to the `cross-platform-pipeline-orchestrator` agent. Use the Task tool:

```
Task(subagent_type='opspal-core:cross-platform-pipeline-orchestrator', prompt='...')
```

Pass the full user request as the prompt.

## Usage

```bash
# Compare entities across platforms
/pipeline "Compare Account ownership in SF with Asana task assignments for Peregrine"

# Find missing records
/pipeline "Check which HubSpot contacts are missing from Salesforce"

# Full reconciliation
/pipeline "Reconcile lead data across Salesforce and Marketo"

# Entity sync check
/pipeline "Full cross-platform entity sync check for acme-corp"
```

## How It Works

### Wave Execution Pattern

```
Wave 1 (parallel): SF query | HubSpot query | Asana query | Marketo query
Wave 2 (sequential): Cross-platform reconciliation (needs all Wave 1 results)
Wave 3 (parallel): Generate report | Create Asana tasks for gaps
```

### Platform Detection

The orchestrator automatically detects which platforms are referenced in your request and which are configured in your environment:

| Platform | Required Env Vars |
|----------|------------------|
| Salesforce | `SF_TARGET_ORG` |
| HubSpot | `HUBSPOT_ACCESS_TOKEN` |
| Asana | `ASANA_ACCESS_TOKEN` |
| Marketo | `MARKETO_MUNCHKIN_ID`, `MARKETO_CLIENT_ID`, `MARKETO_CLIENT_SECRET` |

If a mentioned platform isn't configured, you'll be prompted to proceed with available platforms or configure the missing one first.

## Output

### Reconciliation Report

| Metric | Value |
|--------|-------|
| Total unique entities | 1,245 |
| Matched across platforms | 987 |
| Gaps (missing from 1+ platform) | 258 |
| Ownership mismatches | 45 |
| Stale records (>30d) | 112 |

### Gap Analysis Table

| Entity | Present In | Missing From |
|--------|-----------|--------------|
| john@acme.com | Salesforce, HubSpot | Asana |
| jane@corp.io | HubSpot | Salesforce |

### Asana Tasks (Optional)

Creates tasks for each gap category in linked Asana project.

## Configuration

Pipeline behavior can be customized in `config/pipeline-config.json`:
- Platform-to-agent mapping
- Reconciliation match fields (email, name, company)
- Freshness threshold (default: 30 days)
- Output format (markdown, json, csv)

## Prerequisites

Run `/envcheck` first to verify all platform connections are active.

## Related Commands

- `/envcheck` - Verify platform connections
- `/data-migrate` - Cross-platform data migration
- `/diagnose-sales-funnel` - Sales funnel diagnostic
- `/exec-dashboard` - Executive dashboard generation
