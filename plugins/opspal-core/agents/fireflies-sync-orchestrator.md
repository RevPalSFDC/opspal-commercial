---
name: fireflies-sync-orchestrator
description: "Orchestrates Fireflies.ai-to-CRM data synchronization workflows."
color: teal
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
  - mcp__fireflies__transcripts_list
  - mcp__fireflies__transcript_get
  - mcp__fireflies__sync_transcripts_to_crm
  - mcp__fireflies__download_recording
  - mcp_salesforce_data_query
  - mcp_salesforce_data_create
  - mcp_salesforce_data_update
  - mcp__hubspot-enhanced-v3__hubspot_search
  - mcp__hubspot-enhanced-v3__hubspot_create
  - mcp__hubspot-enhanced-v3__hubspot_update
triggerKeywords:
  - sync fireflies
  - import fireflies
  - fireflies batch sync
  - fireflies to salesforce
  - fireflies to hubspot
---

# Fireflies Sync Orchestrator

## Purpose

Execute Fireflies.ai-to-CRM synchronization workflows. Creates SF Event records and HS Meeting Engagements from Fireflies transcripts, aggregates meeting insights onto Opportunity fields, and manages batch sync operations with error recovery and idempotency guarantees.

## When to Use

- Initial Fireflies data backfill for a new client
- Scheduled daily/weekly transcript sync
- Re-syncing after sync failures or missed windows
- Validating sync configuration with a dry-run before production
- One-off sync for a specific date range

## Sync Modes

### 1. Transcript Sync (`--mode transcripts`)
- Fetches Fireflies transcript metadata and full content
- Creates SF Event records with `Fireflies_Transcript_ID__c` for idempotency
- Maps participants to Contacts via email lookup
- Creates HubSpot Meeting Engagements for dual-CRM clients
- Attaches AI-generated summary to record description

### 2. Insights Sync (`--mode insights`)
- Aggregates meeting metrics per Opportunity
- Updates: `FF_Meetings_Count__c`, `FF_Last_Meeting_Date__c`, `FF_Rep_Talk_Ratio__c`, `FF_Sentiment_Score__c`
- Groups transcripts by Opportunity association (via contact-to-opportunity relationship)

## Idempotency

All sync operations use `Fireflies_Transcript_ID__c` as the idempotency key on SF Event records and a matching external ID on HubSpot engagements. Before creating any record, the sync engine queries for existing records with the same Fireflies transcript ID. Re-running the same date window is safe — duplicate records will not be created.

```javascript
// Idempotency check before creating SF Event
const existing = await mcp_salesforce_data_query({
  query: `SELECT Id FROM Event WHERE Fireflies_Transcript_ID__c = '${transcript.id}' LIMIT 1`
});

if (existing.records.length > 0) {
  log(`Skipping transcript ${transcript.id} - already synced as Event ${existing.records[0].Id}`);
  return { status: 'skipped', reason: 'already_synced' };
}
```

## Date-Windowing Pagination Strategy

Fireflies returns a maximum of 50 transcripts per request. Use offset-based pagination with date windows to safely traverse large transcript libraries without exceeding plan limits.

### Pagination Pattern

```javascript
// Paginate through all transcripts in a date range
async function fetchAllTranscripts(fromDate, toDate) {
  const results = [];
  const limit = 50; // Fireflies max per request
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await mcp__fireflies__transcripts_list({
      fromDate,
      toDate,
      limit,
      skip
    });

    results.push(...page.transcripts);

    if (page.transcripts.length < limit) {
      hasMore = false; // Last page
    } else {
      skip += limit;
    }

    // Respect rate limits: 60 requests/min
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  return results;
}
```

### Date Window Chunking for Backfills

For large backfills, chunk into weekly windows to avoid budget exhaustion on Free/Pro plans (50 transcripts/day limit):

```bash
# Backfill Q1 2026 in weekly chunks
for WEEK_START in "2026-01-01" "2026-01-08" "2026-01-15" "2026-01-22" \
                  "2026-02-01" "2026-02-08" "2026-02-15" "2026-02-22" \
                  "2026-03-01" "2026-03-08" "2026-03-15" "2026-03-22"; do
  node scripts/lib/fireflies-sync.js \
    --mode transcripts \
    --since "$WEEK_START" \
    --until "$(date -d "$WEEK_START + 7 days" +%Y-%m-%d)" \
    --target salesforce \
    --org production
  sleep 60  # Wait 1 minute between weekly chunks
done
```

## Sync Workflow Steps

### For Any Sync Operation:

1. **Pre-flight checks**:
   - Validate `FIREFLIES_API_KEY` environment variable is set
   - Run a lightweight auth validation query
   - Check daily API budget (warn at 80% on limited plans)
   - Verify CRM connectivity (Salesforce org login, HubSpot token)
   - Confirm required custom fields exist in Salesforce

2. **Dry-run first** (always recommended for first-time sync):
   ```bash
   node scripts/lib/fireflies-sync.js \
     --mode transcripts \
     --since 24h \
     --target salesforce \
     --dry-run
   ```

3. **Execute sync**:
   ```bash
   node scripts/lib/fireflies-sync.js \
     --mode transcripts \
     --since 24h \
     --target salesforce \
     --verbose
   ```

4. **Verify results**:
   - Query SF Events: `SELECT Id, Subject, Fireflies_Transcript_ID__c FROM Event WHERE Fireflies_Transcript_ID__c != null ORDER BY CreatedDate DESC LIMIT 10`
   - Review sync report for failures and skipped records
   - Confirm HubSpot engagements created (if dual-CRM)

## CRM Field Mapping

### Salesforce Event Fields

| Fireflies Field | Salesforce Field | Type | Notes |
|-----------------|------------------|------|-------|
| `id` | Fireflies_Transcript_ID__c | Text(40) | **Idempotency key** |
| `title` | Subject | Text | Meeting title |
| `date` | StartDateTime | DateTime | Meeting start |
| `duration` | DurationInMinutes | Number | Seconds ÷ 60 |
| `meeting_url` | Fireflies_Meeting_URL__c | URL | Fireflies transcript link |
| `summary.overview` | Description | LongText | AI-generated summary |
| `organizer_email` | OwnerId (lookup) | Lookup | Mapped via User email |

### Salesforce Opportunity Fields (Insights Mode)

| Metric | Salesforce Field | Type | Description |
|--------|------------------|------|-------------|
| Meeting count | FF_Meetings_Count__c | Number | Total synced transcripts |
| Last meeting | FF_Last_Meeting_Date__c | Date | Most recent transcript date |
| Days since meeting | FF_Days_Since_Meeting__c | Number | Computed on sync |
| Avg talk ratio | FF_Rep_Talk_Ratio__c | Percent | Rep % of meeting airtime |
| Sentiment | FF_Sentiment_Score__c | Number(0-100) | AI sentiment score |
| Action items | FF_Action_Items_Count__c | Number | Total action items found |

### Required Custom Fields Pre-Deployment Checklist

Before running sync on a new Salesforce org, verify these fields exist:

```bash
# Check if required fields exist
sf data query --query "SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = 'Event'" --use-tooling-api
sf sobject describe Event | jq '[.fields[] | select(.name | contains("Fireflies"))]'
```

If missing, create via metadata deploy before proceeding.

## Error Recovery

- Failed individual transcript syncs are logged with the transcript ID but do not stop the batch
- The sync report includes all errors and skipped records with reasons
- Re-running the same time window is safe due to idempotency
- API rate limit errors (429) trigger automatic exponential backoff
- Unmapped participant emails are logged but do not fail the record creation

### Partial Failure Handling

```javascript
// Process batch with partial failure tolerance
const results = { synced: 0, skipped: 0, failed: 0, errors: [] };

for (const transcript of transcripts) {
  try {
    const result = await syncTranscript(transcript);
    if (result.status === 'synced') results.synced++;
    if (result.status === 'skipped') results.skipped++;
  } catch (err) {
    results.failed++;
    results.errors.push({
      transcriptId: transcript.id,
      title: transcript.title,
      error: err.message
    });
    // Continue processing remaining transcripts
  }
}
```

## Audio/Video Download

Recording download URLs are ephemeral (24-hour expiry). Fetch fresh on demand using `mcp__fireflies__download_recording`.

```javascript
// CORRECT: Fetch fresh URL each time it's needed
const { url } = await mcp__fireflies__download_recording({ transcriptId: transcript.id });
// Use the URL immediately for download or playback

// INCORRECT: Never store this URL in the database
// db.save({ recordingUrl: url }); // DO NOT DO THIS
```

**Plan requirement**: Recording download is only available on Pro and Business plans. On Free plans, this tool will return a 403 error.

## Sync Report Output

```json
{
  "syncId": "ff-sync-2026-02-18-001",
  "startTime": "2026-02-18T07:00:00Z",
  "endTime": "2026-02-18T07:08:32Z",
  "mode": "transcripts",
  "dateRange": {
    "from": "2026-02-17T07:00:00Z",
    "to": "2026-02-18T07:00:00Z"
  },
  "status": "completed",
  "source": "fireflies",
  "targets": ["salesforce", "hubspot"],
  "summary": {
    "transcriptsFetched": 23,
    "transcriptsSynced": 21,
    "transcriptsSkipped": 1,
    "transcriptsFailed": 1,
    "sfEventsCreated": 21,
    "hsEngagementsCreated": 21,
    "participantsMapped": 48,
    "participantsUnmapped": 3
  },
  "failures": [
    {
      "transcriptId": "abc123",
      "title": "Discovery Call - Acme Corp",
      "error": "Opportunity not found for any participant",
      "action": "Logged for manual review"
    }
  ],
  "skipped": [
    {
      "transcriptId": "def456",
      "title": "Internal Standup",
      "reason": "Already synced - Event 00U123456"
    }
  ]
}
```

## Scripts

- `scripts/lib/fireflies-sync.js` - Core sync engine (CLI + module)
- `scripts/lib/fireflies-api-client.js` - API client with rate limiting and pagination
- `scripts/lib/fireflies-action-extractor.js` - Action item processing
- `scripts/lib/fireflies-meeting-analyzer.js` - Meeting health and insights scoring

## Best Practices

- Always start with `--dry-run` on the first sync for a new client
- Use `--since` windows (e.g., `24h`, `7d`) rather than open-ended fetches
- On Free/Pro plans, sync in small daily windows to stay within 50 transcript/day limits
- For backfills, chunk into weekly windows and add delays between chunks
- Monitor failed syncs and retry manually using transcript IDs from the error report
- Verify required custom fields exist in Salesforce before first sync
- Never persist recording download URLs - they expire after 24 hours
