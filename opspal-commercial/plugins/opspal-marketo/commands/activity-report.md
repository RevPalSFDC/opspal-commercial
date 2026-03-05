---
description: Generate activity summary report for specified time period without full data export
argument-hint: "[--days=N] [--type=email|web|form|all] [--program=id]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# Activity Report Generator

Generate summary reports for Marketo activities without performing a full bulk export.

## Usage

```
/activity-report [--days=N] [--type=email|web|form|all] [--program=id]
```

## Parameters

- `--days` - Report period in days (default: 7, max: 31)
- `--type` - Activity category: `email`, `web`, `form`, or `all`
- `--program` - Filter to specific program ID

## Report Types

### Email Activity Report
Aggregates email engagement metrics:
- Sends
- Deliveries
- Opens (unique and total)
- Clicks (unique and total)
- Bounces (hard and soft)
- Unsubscribes

### Web Activity Report
Aggregates website behavior:
- Page visits
- Form views
- Link clicks
- Session counts
- Top pages

### Form Activity Report
Aggregates form engagement:
- Form fills by form
- Top converting forms
- Completion rates
- Field-level analytics

### Combined Report
Full activity overview across all categories.

## Report Sections

### Executive Summary
```
Activity Report: Jan 1-7, 2026

📧 Email Engagement
   Sent: 45,230
   Delivered: 43,892 (97.0%)
   Opened: 12,456 (28.4%)
   Clicked: 3,210 (7.3%)
   Bounced: 1,338 (3.0%)

🌐 Web Activity
   Page Views: 125,432
   Unique Visitors: 34,567
   Sessions: 45,890

📝 Form Submissions
   Total Fills: 2,345
   Unique Leads: 2,100
   Conversion Rate: 6.1%
```

### Trend Analysis
- Day-over-day comparison
- Week-over-week comparison
- Activity distribution by day/hour

### Top Performers
- Top 10 emails by open rate
- Top 10 pages by visits
- Top 10 forms by conversions

### Activity Breakdown
```
Activity Type       | Count   | % of Total
--------------------|---------|------------
Send Email          | 45,230  | 28.5%
Email Delivered     | 43,892  | 27.6%
Visit Webpage       | 34,567  | 21.8%
Open Email          | 12,456  | 7.8%
Click Email         | 3,210   | 2.0%
Fill Out Form       | 2,345   | 1.5%
Other               | 17,300  | 10.8%
```

## Wizard Steps

### Step 1: Report Configuration
- Select time period
- Choose activity types
- Optional program filter

### Step 2: Data Collection
- Query activity types
- Aggregate counts by type
- Calculate percentages

### Step 3: Analysis Generation
- Compute metrics
- Generate trends
- Identify top performers

### Step 4: Report Output
- Display summary
- Save to file (optional)
- Export format (JSON, CSV, Markdown)

## Example Workflows

### Quick 7-Day Email Report
```
/activity-report --days=7 --type=email
> Fetching email activity for last 7 days...
>
> 📧 Email Engagement Summary
>    Sent: 12,345
>    Delivered: 11,987 (97.1%)
>    Opened: 3,456 (28.0%)
>    Clicked: 892 (7.2%)
```

### Monthly All-Activity Report
```
/activity-report --days=30 --type=all
> Fetching all activity for last 30 days...
> Processing 158,234 activities...
>
> [Full report displayed]
```

### Program-Specific Report
```
/activity-report --days=14 --program=2045
> Fetching activity for Program 2045...
> Q1 Webinar - AI Marketing
>
> Email Metrics:
>   Invites Sent: 5,000
>   Opens: 1,250 (25%)
>   Clicks: 312 (6.2%)
>   Registrations: 145
```

## Activity Type Reference

| ID | Activity | Category |
|----|----------|----------|
| 1 | Visit Webpage | Web |
| 2 | Fill Out Form | Form |
| 3 | Click Link | Web |
| 6 | Send Email | Email |
| 7 | Email Delivered | Email |
| 8 | Email Bounced | Email |
| 9 | Unsubscribe Email | Email |
| 10 | Open Email | Email |
| 11 | Click Email | Email |
| 12 | New Lead | Lead |
| 13 | Change Data Value | Lead |
| 22 | Change Score | Lead |
| 46 | Interesting Moment | Lead |

## Output Formats

### Console (Default)
Formatted markdown display in terminal.

### JSON Export
```
/activity-report --days=7 --type=email --output=json
> Saved to: reports/email-activity-2026-01-07.json
```

### CSV Export
```
/activity-report --days=7 --type=all --output=csv
> Saved to: reports/all-activity-2026-01-07.csv
```

## Related Commands

- `/bulk-export-wizard` - Full data export
- `/api-usage` - API quota status
- `/marketo-audit` - Full instance audit

## Agent Routing

This command uses:
- `marketo-data-operations` for data retrieval
- `marketo-analytics-assessor` for analysis
- `marketo-automation-orchestrator` for complex reports
