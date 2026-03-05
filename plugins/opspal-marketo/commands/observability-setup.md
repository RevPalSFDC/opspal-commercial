---
description: Configure the Marketo observability layer for continuous marketing intelligence
argument-hint: "[--portal=<name>] [--schedule=daily|hourly] [--quick]"
---

# /observability-setup

Configure the Marketo observability layer for a Marketo instance. This wizard helps you:

1. Validate API credentials and permissions
2. Configure export schedules (leads, activities, program members)
3. Set up data storage location
4. Configure Claude analysis triggers
5. Test connectivity and create first export

## Quick Mode

Use `--quick` to skip interactive prompts and use sensible defaults:
- Daily exports at 2 AM, 3 AM, 4 AM UTC (staggered)
- All core activity types
- Standard fields for leads and program members

## Steps

### Step 1: Validate Marketo Connection

First, verify that the Marketo instance is authenticated and API access is available:

```
1. Check for active Marketo authentication
2. Verify REST API endpoint accessibility
3. Test bulk export API permissions
4. Confirm daily quota availability
```

If not authenticated, guide the user to run `/marketo-auth` first.

### Step 2: Configure Export Schedules

Ask the user to configure export schedules for each data type:

**Leads:**
- Frequency: daily (recommended) or hourly
- Filter: createdAt or updatedAt (if available)
- Lookback: 1 day (default) or custom
- Fields: core fields or expanded

**Activities:**
- Frequency: daily (recommended)
- Activity types: core engagement (default) or all
- Lookback: 1 day (default)

**Program Members:**
- Frequency: daily
- Programs: all active or specific list
- Fields: standard membership fields

### Step 3: Set Up Storage

Create the observability directory structure:

```
instances/{portal}/observability/
├── exports/
│   ├── leads/
│   ├── activities/
│   └── program-members/
├── analysis/
│   ├── reports/
│   └── recommendations/
├── metrics/
└── history/
```

### Step 4: Configure Analysis Triggers

Set thresholds for automatic analysis:
- Minimum records for analysis: 1000 (default)
- Minimum file size: 5 MB (default)
- Auto-analyze after exports: yes/no

### Step 5: Initial Test

Run a small test export to verify everything works:
1. Create a lead export for last 24 hours
2. Wait for completion
3. Download and normalize
4. Display summary

## Output

Upon completion, display:
- Configuration summary
- Schedule overview
- Storage locations
- Next steps for running `/extract-wizard` or `/analyze-performance`

## Example Usage

```
# Full interactive setup
/observability-setup

# Quick setup with defaults
/observability-setup --quick

# Setup for specific portal
/observability-setup --portal=production

# Setup with hourly schedule
/observability-setup --schedule=hourly
```

## Related Commands

- `/extract-wizard` - Run bulk exports manually
- `/observability-dashboard` - View current metrics
- `/analyze-performance` - Trigger Claude analysis
