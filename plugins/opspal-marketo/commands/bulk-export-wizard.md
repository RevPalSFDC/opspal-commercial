---
description: Interactive wizard for bulk export of leads and activities from Marketo
argument-hint: "[--type=leads|activities] [--days=N] [--format=CSV|TSV]"
---

# Bulk Export Wizard

Interactive wizard for creating and managing bulk export jobs for leads and activities.

## Usage

```
/bulk-export-wizard [--type=leads|activities] [--days=N] [--format=CSV|TSV]
```

## Parameters

- `--type` - Export type: `leads` or `activities`
- `--days` - Number of days to export (max 31)
- `--format` - Output format: CSV (default) or TSV

## Wizard Steps

### Step 1: Export Type Selection
- Lead export (profiles, scores, status)
- Activity export (emails, forms, web visits)
- Program member export (membership data)

### Step 2: Date Range Configuration
- Start date (max 31 days range)
- End date
- Filter type (createdAt or updatedAt for leads)

### Step 3: Field Selection

**For Lead Export:**
- Standard fields (email, name, company, title)
- Score fields (score, behaviorScore, demographicScore)
- Custom fields selection

**For Activity Export:**
- Select activity types to include
- Common types:
  - Email: Send, Delivered, Opened, Clicked, Bounced
  - Form: Fill Out Form
  - Web: Visit Webpage, Click Link
  - Lead: New Lead, Change Data Value, Change Score

### Step 4: Filter Options (Optional)
- Static list membership
- Smart list membership
- Lead partition

### Step 5: Quota Check
- Daily export limit: 500 MB
- Current usage display
- Estimated export size warning

### Step 6: Export Execution
- Create export job
- Enqueue for processing
- Real-time status polling
- Completion notification

### Step 7: Download & Preview
- Download file when complete
- Show record count
- Preview first 10 rows
- Save location selection

## Example Workflows

### Export All Email Activities for January
```
/bulk-export-wizard --type=activities --days=31
> Select: Email activities (6,7,10,11)
> Date range: 2026-01-01 to 2026-01-31
> Processing... 45,238 records exported
> File size: 12.5 MB
```

### Export Lead Database
```
/bulk-export-wizard --type=leads --days=30
> Select fields: email, firstName, lastName, score, leadStatus
> Filter: Updated in last 30 days
> Processing... 25,000 records exported
```

## API Constraints Displayed

| Limit | Value |
|-------|-------|
| Concurrent exports | 2 running, 10 queued |
| Daily limit | 500 MB |
| Max date range | 31 days |
| File retention | 7 days |

## Error Handling

- **Queue Full (1029)**: Wait 5 minutes, auto-retry
- **Date Range Exceeded (1035)**: Prompt to reduce range
- **Daily Quota Exceeded**: Show reset time, defer

## Related Commands

- `/activity-report` - Generate activity summary without full export
- `/lead-quality-report` - Lead database health check
- `/monitor-sync` - Real-time sync status

## Agent Routing

This command uses:
- `marketo-data-operations` for execution
- `marketo-automation-orchestrator` for complex multi-export workflows
