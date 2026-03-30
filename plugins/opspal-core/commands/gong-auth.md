---
name: gong-auth
description: Validate and manage Gong API credentials
argument-hint: "[validate|check|status]"
---

# Gong Auth Command

Validate Gong API credentials and check integration health.

## Usage

```
/gong-auth [subcommand]
```

## Subcommands

- `validate` (default) - Test credentials against Gong API
- `check` - Verify environment variables are set (no API call)
- `status` - Show rate limit status and daily budget

## Examples

```bash
# Validate credentials (makes API call)
/gong-auth

# Quick env var check
/gong-auth check

# Check API budget
/gong-auth status
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GONG_ACCESS_KEY_ID` | Yes | Gong API access key ID |
| `GONG_ACCESS_KEY_SECRET` | Yes | Gong API access key secret |
| `GONG_WORKSPACE_ID` | No | Workspace ID (for multi-workspace) |

## Getting Credentials

1. Log into Gong as admin
2. Go to **Company Settings** > **API**
3. Create new API key pair
4. Set environment variables:
   ```bash
   export GONG_ACCESS_KEY_ID=your_key_id
   export GONG_ACCESS_KEY_SECRET=your_secret
   ```

## Implementation

Uses `scripts/lib/gong-token-manager.js` for validation and `scripts/lib/gong-throttle.js` for status.

## Related

- `/gong-sync` - Sync call data
- `/gong-risk-report` - Risk analysis
- `/gong-competitive-intel` - Competitive intelligence
