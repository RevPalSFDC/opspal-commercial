---
name: fireflies-insights
description: Analyze Fireflies meeting data for health, engagement, and risk signals
argument-hint: "[--period 30d|90d] [--pipeline <name>] [--min-amount <number>] [--participants <emails>]"
---

# Fireflies Insights Command

Analyze Fireflies meeting data for conversation health, stakeholder engagement patterns, and deal risk signals. Surfaces going-dark opportunities, low talk-time ratios, and multi-threading gaps.

## Usage

```
/fireflies-insights [options]
```

## Options

- `--period <window>` - Analysis window: `30d` (default), `90d`, or ISO date range
- `--pipeline <name>` - Filter by Salesforce pipeline name
- `--min-amount <n>` - Minimum deal amount for risk analysis (default: 0)
- `--participants <emails>` - Comma-separated participant email addresses to filter by

## Examples

```bash
# Analyze last 30 days of meeting data
/fireflies-insights

# Enterprise pipeline, deals > $50K over 90 days
/fireflies-insights --period 90d --pipeline Enterprise --min-amount 50000

# Filter by specific participants
/fireflies-insights --participants "john@acme.com,jane@acme.com"

# Quarterly view of specific pipeline
/fireflies-insights --period 90d --pipeline "Mid-Market"
```

## Signals Analyzed

| Signal | Threshold | Impact |
|--------|-----------|--------|
| Meeting Frequency Drop | No meetings in 14+ days | HIGH |
| Going Dark | No contact in 21+ days | HIGH |
| Low Engagement | <30% prospect talk time | MEDIUM |
| Single-threaded | <2 unique attendees on deal | MEDIUM |
| Short Meetings | Average duration <15 min | LOW |

## Report Contents

- **Meeting Health Score** - Aggregate health per deal (0-100)
- **Engagement Trends** - Weekly meeting cadence and attendee patterns
- **Risk Flags** - Deals with conversation-based risk signals
- **Top Participants** - Most active stakeholders per account
- **Recommendations** - Suggested next steps for at-risk deals

## Implementation

Delegates to `fireflies-meeting-intelligence-agent` which queries the Fireflies GraphQL API for transcript metadata and correlates with CRM opportunity data.

## Related

- `/fireflies-auth` - Validate Fireflies credentials
- `/fireflies-sync` - Sync transcript data to CRM
- `/fireflies-action-items` - Extract and track action items
