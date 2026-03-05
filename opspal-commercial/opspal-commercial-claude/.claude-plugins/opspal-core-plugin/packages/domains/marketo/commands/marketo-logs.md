---
description: Retrieve and filter Marketo activity logs for debugging and analysis
argument-hint: "[--type=activity_type] [--lead=id] [--since=date] [--limit=count]"
---

# View Marketo Activity Logs

Retrieve and filter Marketo activity logs for debugging and analysis.

## Usage

```
/marketo-logs [--type=activity_type] [--lead=id] [--since=date] [--limit=count]
```

## Parameters

- `--type` - Filter by activity type:
  - `email_open`, `email_click`, `email_delivered`, `email_bounced`
  - `form_fill`, `web_visit`, `landing_page_visit`
  - `score_change`, `data_change`, `status_change`
  - `campaign_triggered`, `program_status_change`
  - `sync_to_sfdc`, `sync_from_sfdc`

- `--lead` - Filter by lead ID
- `--since` - Start date (ISO format or relative like `24h`, `7d`)
- `--limit` - Max records to return (default: 100, max: 1000)

## Common Use Cases

### Debug Email Delivery
```
/marketo-logs --type=email_delivered --since=24h
/marketo-logs --type=email_bounced --since=7d
```

### Track Lead Activity
```
/marketo-logs --lead=12345 --since=30d
```

### Monitor Sync Issues
```
/marketo-logs --type=sync_to_sfdc --since=24h
```

### Check Campaign Triggers
```
/marketo-logs --type=campaign_triggered --since=1h
```

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 MARKETO ACTIVITY LOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Filter: type=email_bounced, since=7d
Results: 45 activities

| Timestamp | Lead ID | Email | Activity | Details |
|-----------|---------|-------|----------|---------|
| 2025-12-05 10:23:15 | 12345 | john@example.com | Email Bounced | Hard bounce - invalid address |
| 2025-12-05 09:15:42 | 12346 | jane@company.org | Email Bounced | Soft bounce - mailbox full |
| 2025-12-04 16:30:00 | 12347 | bob@test.com | Email Bounced | Hard bounce - domain not found |
...

## Summary by Bounce Type
| Type | Count | Percentage |
|------|-------|------------|
| Hard Bounce | 32 | 71.1% |
| Soft Bounce | 13 | 28.9% |

## Top Bounce Domains
1. test.com - 8 bounces
2. example.com - 5 bounces
3. oldcompany.net - 3 bounces
```

## Activity Type Reference

| Type ID | Name | Description |
|---------|------|-------------|
| 1 | Visit Web Page | Lead visited tracked web page |
| 2 | Fill Out Form | Lead submitted a form |
| 6 | Send Email | Email was sent to lead |
| 7 | Email Delivered | Email successfully delivered |
| 8 | Email Bounced | Email bounced |
| 10 | Open Email | Lead opened email |
| 11 | Click Link in Email | Lead clicked link |
| 13 | Change Data Value | Field value changed |
| 19 | Sync Lead to SFDC | Lead synced to Salesforce |

## Filtering Tips

- Use `--since=1h` for real-time monitoring
- Combine `--type` and `--lead` for specific debugging
- Use `--limit=1000` for comprehensive analysis
- Export results for deeper analysis with analytics tools

## Related Commands

- `/marketo-audit` - Full instance audit
- `/monitor-sync` - Real-time sync monitoring
- `/api-usage` - API usage tracking
