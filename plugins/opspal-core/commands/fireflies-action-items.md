---
name: fireflies-action-items
description: Extract and track action items from Fireflies transcripts
argument-hint: "[--period 7d|30d] [--assignee <name>] [--status open|overdue|completed|all] [--meeting-id <id>]"
---

# Fireflies Action Items Command

Extract action items from Fireflies meeting transcripts and track their completion status. Surfaces overdue commitments, surfaces follow-up gaps, and optionally creates CRM tasks.

## Usage

```
/fireflies-action-items [options]
```

## Options

- `--period <window>` - Date range for action item search: `7d` (default) or `30d`
- `--assignee <name>` - Filter by assignee or speaker name (partial match supported)
- `--status <state>` - Filter by status: `open` (default), `overdue`, `completed`, `all`
- `--meeting-id <id>` - Extract action items from a specific Fireflies transcript ID

## Examples

```bash
# View all open action items from the last 7 days
/fireflies-action-items

# Show overdue items from the last 30 days
/fireflies-action-items --period 30d --status overdue

# Items assigned to a specific person
/fireflies-action-items --assignee "John Smith" --status all

# Extract from a specific meeting transcript
/fireflies-action-items --meeting-id "abc123xyz"

# Completed items from last month
/fireflies-action-items --period 30d --status completed
```

## Output Format

Each action item includes:
- **Description** - The action item text as detected by Fireflies AI
- **Assignee** - Speaker the action was assigned to
- **Source Meeting** - Meeting title, date, and participants
- **Due Signal** - Any explicit date mentioned in context ("by end of week", etc.)
- **Status** - Open, overdue (past signal date), or completed (if CRM task closed)

## Implementation

Delegates to `fireflies-action-tracker-agent` which uses the Fireflies GraphQL API to retrieve `action_items` from meeting summaries. For `--meeting-id`, fetches from `scripts/lib/fireflies-api-client.js` directly.

## Related

- `/fireflies-auth` - Validate Fireflies credentials
- `/fireflies-sync` - Sync transcript data to CRM
- `/fireflies-insights` - Analyze meeting health and engagement signals
