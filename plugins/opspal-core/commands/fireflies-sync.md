---
name: fireflies-sync
description: Sync Fireflies transcripts to CRM (Salesforce or HubSpot)
argument-hint: "[--mode calls|insights] [--since 7d|24h|30d] [--target salesforce|hubspot] [--org <alias>] [--dry-run]"
---

# Fireflies Sync Command

Sync Fireflies transcript data to your CRM. Creates Activity/Event records with idempotency, or aggregates meeting insights onto Opportunity fields.

## Usage

```
/fireflies-sync [options]
```

## Options

- `--mode <mode>` - Sync mode: `calls` (transcript records, default) or `insights` (aggregated metrics per opportunity)
- `--since <window>` - Time window: `24h`, `7d` (default), `30d`, or ISO date
- `--target <crm>` - Target CRM: `salesforce` (default) or `hubspot`
- `--org <alias>` - Salesforce org alias (uses `SF_TARGET_ORG` if not set)
- `--dry-run` - Preview sync without writing to CRM

## Examples

```bash
# Sync last 7 days of transcripts to Salesforce
/fireflies-sync

# Dry-run preview
/fireflies-sync --dry-run --since 30d

# Sync meeting insights to Opportunity fields
/fireflies-sync --mode insights --since 7d

# Sync to HubSpot
/fireflies-sync --target hubspot --since 24h

# Sync to specific Salesforce org
/fireflies-sync --org acme-prod --since 7d
```

## Prerequisites

- `FIREFLIES_API_KEY` environment variable set
- SF custom fields: `Fireflies_Meeting_ID__c`, `Fireflies_Transcript_URL__c` on Activity/Task
- For insights mode: `Fireflies_Meeting_Count__c`, `Last_Fireflies_Meeting__c` on Opportunity

## Implementation

This command delegates to `fireflies-sync-orchestrator` agent which uses:
- `scripts/lib/fireflies-sync.js` - Core sync engine
- `scripts/lib/fireflies-api-client.js` - Rate-limited GraphQL API client
- `scripts/lib/fireflies-throttle.js` - Token bucket rate limiter

## Related

- `/fireflies-auth` - Validate Fireflies credentials
- `/fireflies-insights` - Analyze meeting health and engagement signals
- `/fireflies-action-items` - Extract and track action items
