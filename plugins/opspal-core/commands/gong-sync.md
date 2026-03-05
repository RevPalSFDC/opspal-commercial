---
description: Sync Gong conversation data to Salesforce Events or HubSpot Engagements
argument-hint: "[--mode calls|insights] [--since 24h|7d] [--target salesforce|hubspot] [--dry-run]"
---

# Gong Sync Command

Sync Gong call data to your CRM. Creates Events/Engagements with idempotency, aggregates insights onto Opportunity fields.

## Usage

```
/gong-sync [options]
```

## Options

- `--mode <mode>` - Sync mode: `calls` (default), `insights`
- `--since <window>` - Time window: `24h`, `7d`, `30d`, or ISO date
- `--target <crm>` - Target: `salesforce` (default) or `hubspot`
- `--org <alias>` - Salesforce org alias
- `--dry-run` - Preview without writing to CRM

## Examples

```bash
# Sync last 24 hours of calls to Salesforce
/gong-sync

# Dry-run preview
/gong-sync --dry-run --since 7d

# Sync insights to Opportunity fields
/gong-sync --mode insights --since 7d

# Sync to HubSpot
/gong-sync --target hubspot --since 24h
```

## Prerequisites

- `GONG_ACCESS_KEY_ID` and `GONG_ACCESS_KEY_SECRET` environment variables
- SF custom fields: `Gong_Call_ID__c`, `Gong_Recording_URL__c` on Event
- For insights: `Gong_Calls_Count__c`, `Last_Gong_Call__c` on Opportunity

## Implementation

This command delegates to `gong-sync-orchestrator` agent which uses:
- `scripts/lib/gong-sync.js` - Core sync engine
- `scripts/lib/gong-api-client.js` - Rate-limited API client
- `scripts/lib/gong-throttle.js` - Token bucket (3 rps, 10K/day)

## Related

- `/gong-risk-report` - Analyze deals for conversation risk
- `/gong-competitive-intel` - Competitor mention analysis
- `/gong-auth` - Validate Gong credentials
