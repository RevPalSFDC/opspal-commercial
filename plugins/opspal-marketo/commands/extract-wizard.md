---
description: Interactive wizard to configure and run Marketo bulk exports
argument-hint: "[--type=leads|activities|programs] [--days=N] [--quick]"
---

# /extract-wizard

Interactive wizard to configure and run bulk extracts from Marketo. Guides you through:

1. Choose export type (leads, activities, program members)
2. Configure filters (date range, activity types, program ID)
3. Select fields
4. Monitor job progress
5. Download and normalize results

## Quick Mode

Use `--quick` to run with defaults:
```
/extract-wizard --quick --type=leads --days=1
```

This exports leads from the last 24 hours with standard fields.

## Wizard Steps

### Step 1: Select Export Type

```
What would you like to export?

1. Leads - Person records with demographics and scores
2. Activities - Event logs (email, form, web activity)
3. Program Members - Campaign membership and status

Select [1-3]:
```

### Step 2: Configure Filters

**For Leads:**
```
Filter Options:
1. Created in date range
2. Updated in date range (if available)
3. Members of static list
4. Smart list criteria

Date range:
  Start: [2025-01-14T00:00:00Z]
  End:   [2025-01-15T00:00:00Z]
  (Max 31 days per export)
```

**For Activities:**
```
Activity Types to include:
[x] Email (Send, Delivered, Open, Click, Bounce)
[x] Forms (Fill Out Form)
[x] Web (Visit Webpage)
[ ] Scoring (Change Score)
[ ] Status (Change Status in Progression)
[ ] All Activity Types

Date range (required):
  Start: [2025-01-14T00:00:00Z]
  End:   [2025-01-15T00:00:00Z]
```

**For Program Members:**
```
Program Selection:
1. Specific program ID
2. All active programs
3. Programs by tag

Enter program ID: [1044]
```

### Step 3: Select Fields

**For Leads:**
```
Field Selection:
[x] Core (id, email, firstName, lastName)
[x] Scoring (leadScore, behaviorScore, demographicScore)
[ ] Firmographic (company, industry, revenue)
[ ] Dates (createdAt, updatedAt, lastActivityDate)
[ ] Custom fields

Or enter specific fields: [id, email, leadScore, createdAt]
```

**For Program Members:**
```
Field Selection:
[x] Lead info (firstName, lastName, email)
[x] Membership (program, membershipDate, statusName)
[x] Success (reachedSuccess, progressionStatus)
[ ] Acquisition (acquiredBy)
```

### Step 4: Pre-flight Check

Before starting, display validation:
```
╔══════════════════════════════════════════════════════════════╗
║  PRE-FLIGHT CHECK                                             ║
╠══════════════════════════════════════════════════════════════╣
║  Export Type:      Leads                                      ║
║  Date Range:       2025-01-14 to 2025-01-15 (1 day)          ║
║  Fields:           4 fields selected                          ║
║  Estimated Size:   ~15 MB                                     ║
║                                                               ║
║  Quota Status:     125 MB used / 500 MB (25%)                ║
║  Concurrent Jobs:  0 running / 2 max                          ║
║                                                               ║
║  ✓ Ready to proceed                                           ║
╚══════════════════════════════════════════════════════════════╝

Proceed with export? [Y/n]
```

### Step 5: Execute & Monitor

```
╔══════════════════════════════════════════════════════════════╗
║  EXPORT PROGRESS                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Job ID:       abc-123-def                                    ║
║  Status:       Processing... ⏳                               ║
║  Elapsed:      2m 15s                                         ║
║  Poll Count:   3                                              ║
╚══════════════════════════════════════════════════════════════╝
```

After completion:
```
╔══════════════════════════════════════════════════════════════╗
║  EXPORT COMPLETE ✓                                            ║
╠══════════════════════════════════════════════════════════════╣
║  Records:      45,230                                         ║
║  File Size:    12.4 MB                                        ║
║  Duration:     3m 42s                                         ║
║                                                               ║
║  Downloading and normalizing...                               ║
╚══════════════════════════════════════════════════════════════╝
```

### Step 6: Results Summary

```
╔══════════════════════════════════════════════════════════════╗
║  EXPORT RESULTS                                               ║
╠══════════════════════════════════════════════════════════════╣
║  Saved to: observability/exports/leads/2025-01-15-leads.json ║
║                                                               ║
║  Summary:                                                     ║
║    Total Leads:    45,230                                     ║
║    Avg Score:      67.3                                       ║
║    Score Distribution:                                        ║
║      Cold (<30):   15,000 (33%)                              ║
║      Warm (30-70): 20,230 (45%)                              ║
║      Hot (>70):    10,000 (22%)                              ║
║                                                               ║
║  Next Steps:                                                  ║
║    - Run /analyze-performance for AI insights                ║
║    - View /observability-dashboard for metrics               ║
╚══════════════════════════════════════════════════════════════╝
```

## Options

| Option | Description |
|--------|-------------|
| `--type` | Export type: leads, activities, programs |
| `--days` | Lookback days (default: 1) |
| `--quick` | Skip prompts, use defaults |
| `--fields` | Comma-separated field list |
| `--program-id` | Program ID for program member exports |
| `--activity-types` | Comma-separated activity type IDs |

## Example Usage

```
# Interactive wizard
/extract-wizard

# Quick lead export (last 24 hours)
/extract-wizard --quick --type=leads

# Activity export for last 7 days
/extract-wizard --type=activities --days=7

# Program members for specific program
/extract-wizard --type=programs --program-id=1044

# Custom activity types
/extract-wizard --type=activities --activity-types=6,7,10,11,2
```

## Error Handling

- **Queue full**: Wait and retry, or cancel lower-priority jobs
- **Quota exceeded**: Suggest waiting for reset or reducing scope
- **Job failed**: Show error details and retry options
- **Timeout**: Increase poll interval, continue waiting

## Related Commands

- `/observability-setup` - Initial configuration
- `/observability-dashboard` - View status
- `/analyze-performance` - Analyze exported data
