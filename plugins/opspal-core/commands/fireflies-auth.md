---
name: fireflies-auth
description: Configure or verify Fireflies authentication and API budget status
argument-hint: "[validate|check|status]"
---

# Fireflies Auth Command

Validate Fireflies API credentials and check integration health.

## Usage

```
/fireflies-auth [subcommand]
```

## Subcommands

- `validate` (default) - Test credentials against Fireflies GraphQL API using `{ user { email } }` query
- `check` - Verify `FIREFLIES_API_KEY` environment variable is set (no API call)
- `status` - Show daily budget usage from `~/.claude/api-limits/fireflies-daily.json`

## Examples

```bash
# Validate credentials (makes API call)
/fireflies-auth

# Quick env var check
/fireflies-auth check

# Check API budget status
/fireflies-auth status
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREFLIES_API_KEY` | Yes | Fireflies API key |
| `FIREFLIES_PLAN` | No | Plan tier: `free`, `pro`, `business`, `enterprise` (default: free) |
| `FIREFLIES_VALIDATION_ENABLED` | No | Set to `0` to disable pre-call validation |

## Getting Credentials

1. Log into Fireflies.ai as admin
2. Go to **Integrations** > **API**
3. Copy your API key
4. Set environment variables:
   ```bash
   export FIREFLIES_API_KEY=your_api_key
   ```

## Implementation

Uses `scripts/lib/fireflies-token-manager.js` for `validate` and `check` subcommands, and `scripts/lib/fireflies-throttle.js` for the `status` subcommand.

## Related

- `/fireflies-sync` - Sync transcript data to CRM
- `/fireflies-insights` - Analyze meeting health and engagement signals
- `/fireflies-action-items` - Extract and track action items
