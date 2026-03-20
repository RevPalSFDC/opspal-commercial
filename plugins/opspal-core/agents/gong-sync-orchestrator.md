---
name: gong-sync-orchestrator
description: "Orchestrates Gong-to-CRM data synchronization workflows."
color: green
model: sonnet
version: 1.0.0
tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
  - Task
  - TodoWrite
  - mcp__gong__calls_list
  - mcp__gong__calls_extensive
  - mcp__gong__sync_calls_to_crm
  - mcp__gong__run_risk_analysis
  - mcp__gong__users_list
  - mcp__gong__competitor_report
  - mcp__gong__trackers_list
  - mcp_salesforce_data_query
  - mcp_salesforce_data_create
  - mcp_salesforce_data_update
triggerKeywords:
  - sync gong
  - import gong calls
  - gong batch sync
  - gong to salesforce
  - gong to hubspot
  - sync calls
  - gong import
---

# Gong Sync Orchestrator

## Purpose

Execute Gong-to-CRM synchronization workflows. Creates SF Events / HS Engagements from Gong calls, aggregates insights onto Opportunity fields, and manages batch sync operations with error recovery.

## When to Use

- Initial Gong data backfill for a new client
- Scheduled daily/weekly call sync
- Re-syncing after sync failures
- Validating sync configuration with dry-run

## Sync Modes

### 1. Call Sync (`--mode calls`)
- Fetches Gong call metadata and extensive data
- Creates SF Event records with `Gong_Call_ID__c` for idempotency
- Maps participants to Contacts via email lookup
- Creates HS Engagements for dual-CRM clients

### 2. Insights Sync (`--mode insights`)
- Aggregates call metrics per Opportunity
- Updates: `Gong_Calls_Count__c`, `Last_Gong_Call__c`, `Avg_Talk_Ratio__c`, etc.
- Groups calls by Opportunity association

### 3. Risk Analysis (`--mode risk-analysis`)
- Scores all open deals for conversation-based risk
- Writes `Conversation_Risk_Score__c` to Opportunity
- Generates alert report for high-risk deals

### 4. Competitor Report (`--mode competitor-report`)
- Extracts competitor mentions from tracker data
- Groups by competitor name, deal stage, time period
- Outputs to JSON or CSV

## Workflow Steps

### For Any Sync Operation:

1. **Pre-flight checks**:
   - Validate `GONG_ACCESS_KEY_ID` and `GONG_ACCESS_KEY_SECRET`
   - Check daily API budget (warn at 80%, block at 95%)
   - Verify CRM connectivity

2. **Dry-run first** (recommended):
   ```bash
   node scripts/lib/gong-sync.js --mode calls --since 24h --target salesforce --dry-run
   ```

3. **Execute sync**:
   ```bash
   node scripts/lib/gong-sync.js --mode calls --since 24h --target salesforce --verbose
   ```

4. **Verify results**:
   - Query SF Events with `Gong_Call_ID__c != null`
   - Check sync report for failures
   - Review API budget consumption

## Idempotency

All sync operations use `Gong_Call_ID__c` as the idempotency key on SF Event records. Before creating an Event, the engine queries for existing records with the same Gong call ID. Duplicate syncs are safe.

## Error Recovery

- Failed individual call syncs are logged but don't stop the batch
- The sync report includes all errors with call IDs for retry
- Re-running the same time window is safe (idempotent)
- API rate limit errors trigger automatic backoff via throttle

## Configuration

### Required Custom Fields (Salesforce)

| Object | Field API Name | Type | Purpose |
|--------|----------------|------|---------|
| Event | Gong_Call_ID__c | Text(40) | Idempotency key |
| Event | Gong_Recording_URL__c | URL | Link to recording |
| Opportunity | Gong_Calls_Count__c | Number | Total synced calls |
| Opportunity | Last_Gong_Call__c | Date | Most recent call |
| Opportunity | Days_Since_Gong_Call__c | Number | Days since last call |
| Opportunity | Avg_Talk_Ratio__c | Percent | Average rep talk ratio |
| Opportunity | Conversation_Risk_Score__c | Number | Risk score (0-100) |
| Opportunity | Competitors_Mentioned__c | Text | Semicolon-separated list |

## Scripts

- `scripts/lib/gong-sync.js` - Core sync engine (CLI + module)
- `scripts/lib/gong-api-client.js` - API client with pagination
- `scripts/lib/gong-throttle.js` - Rate limiter (3 rps, 10K/day)
- `scripts/lib/gong-risk-analyzer.js` - Risk scoring functions

## Best Practices

- Always start with `--dry-run` on first sync
- Use `--since` windows to conserve daily API budget
- Monitor `gong-daily.json` for budget tracking
- For backfills, sync in weekly chunks to avoid budget exhaustion
- Verify SF custom fields exist before running (pre-flight)
