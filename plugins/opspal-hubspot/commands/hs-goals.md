---
description: List and display sales goals, quotas, and attainment status from HubSpot Goal Targets V3 API
argument-hint: "[--all] [--user <user-id>] [--period <period>]"
---

# HubSpot Goals Command

Retrieve and display sales goals, quotas, and attainment tracking from HubSpot.

## Usage

```
/hs-goals                        # List all active goals
/hs-goals --all                  # List all goals (active + completed)
/hs-goals --user <user-id>       # Goals for specific user
/hs-goals --period Q1            # Goals for Q1
/hs-goals --period 2026-01       # Goals for January 2026
/hs-goals --id <goal-id>         # Get specific goal details
```

## What It Does

1. **Retrieves Goals**: Fetches goal targets from HubSpot Goal Targets V3 API
2. **Calculates Status**: Determines ACHIEVED, ON_TRACK, AT_RISK, BEHIND status
3. **Displays Summary**: Shows attainment percentages and remaining targets
4. **Formats Output**: Presents goals in clear, actionable format

## Options

| Option | Description |
|--------|-------------|
| `--all` | Include completed/expired goals |
| `--user <id>` | Filter by HubSpot user ID |
| `--period <period>` | Filter by period (Q1, Q2, Q3, Q4, or YYYY-MM) |
| `--id <goal-id>` | Get detailed view of specific goal |
| `--verbose` | Show additional details |

## Examples

### Example 1: List Active Goals

```bash
/hs-goals
```

**Output**:
```
═══════════════════════════════════════════════════════════════════
📊 HUBSPOT GOALS - Active
═══════════════════════════════════════════════════════════════════

Total Active Goals: 5
Total Target: $500,000

ID          | Name                    | Target      | Status
------------|-------------------------|-------------|----------
goal-001    | Q1 Revenue Target       | $150,000    | ON_TRACK
goal-002    | New Business Quota      | $100,000    | AT_RISK
goal-003    | Expansion Revenue       | $75,000     | ACHIEVED
goal-004    | SMB Team Quota          | $125,000    | BEHIND
goal-005    | Enterprise Deals        | $50,000     | ON_TRACK

Status Summary:
  ACHIEVED:  1 (20%)
  ON_TRACK:  2 (40%)
  AT_RISK:   1 (20%)
  BEHIND:    1 (20%)

═══════════════════════════════════════════════════════════════════
```

### Example 2: User-Specific Goals

```bash
/hs-goals --user 12345678
```

**Output**:
```
═══════════════════════════════════════════════════════════════════
📊 GOALS FOR USER: John Smith (12345678)
═══════════════════════════════════════════════════════════════════

Goals: 2

1. Q1 Individual Quota
   Target: $75,000
   Period: 2026-01-01 to 2026-03-31
   Days Remaining: 45
   Status: ON_TRACK

2. Expansion Upsells
   Target: $25,000
   Period: 2026-01-01 to 2026-03-31
   Days Remaining: 45
   Status: ACHIEVED

═══════════════════════════════════════════════════════════════════
```

### Example 3: Quarterly Goals

```bash
/hs-goals --period Q1
```

**Output**:
```
═══════════════════════════════════════════════════════════════════
📊 Q1 2026 GOALS
═══════════════════════════════════════════════════════════════════

Period: 2026-01-01 to 2026-03-31
Goals: 8
Total Target: $750,000

[Goals list...]

═══════════════════════════════════════════════════════════════════
```

### Example 4: Specific Goal Details

```bash
/hs-goals --id goal-123456
```

**Output**:
```
═══════════════════════════════════════════════════════════════════
📋 GOAL DETAILS: Q1 Revenue Target
═══════════════════════════════════════════════════════════════════

ID: goal-123456
Name: Q1 Revenue Target
Owner: John Smith (user-12345)

Target Amount: $150,000
Period: 2026-01-01 to 2026-03-31

Status: ON_TRACK
Days Remaining: 45
Attainment: 65%
Remaining: $52,500

Required Daily Pace: $1,167/day to hit target

═══════════════════════════════════════════════════════════════════
```

## Implementation

Uses `scripts/lib/goals-api-wrapper.js` to:
- Query HubSpot Goal Targets V3 API
- Calculate goal progress and status
- Generate formatted reports

### Required Environment Variables

```bash
HUBSPOT_ACCESS_TOKEN=your-access-token
```

### Required API Scopes

- `crm.objects.goals.read` - Read goal targets

## Goal Status Definitions

| Status | Meaning | Action |
|--------|---------|--------|
| `ACHIEVED` | Target met or exceeded | Celebrate! |
| `ON_TRACK` | Current pace meets target | Continue current activities |
| `AT_RISK` | May miss without intervention | Review pipeline, add activities |
| `BEHIND` | Significantly off pace | Escalate, reassess strategy |
| `MISSED` | Period ended, target not met | Post-mortem, adjust future goals |

## Related Commands

- `/hs-deals` - View deals contributing to goals
- `/hs-pipeline` - Analyze pipeline coverage
- `/hs-forecast` - Generate revenue forecasts

## Related Agents

- `hubspot-goals-manager` - Full goals management capabilities
- `hubspot-revenue-intelligence` - Revenue analysis with quota context
- `hubspot-territory-manager` - Territory-based quota management
- `hubspot-reporting-builder` - Goal dashboards and reports

## Related Documentation

- `skills/hubspot-goals-quotas/SKILL.md` - Goals management patterns
- `docs/shared/HUBSPOT_AGENT_STANDARDS.md` - API standards
