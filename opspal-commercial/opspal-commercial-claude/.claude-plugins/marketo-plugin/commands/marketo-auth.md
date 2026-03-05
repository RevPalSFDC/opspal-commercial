---
description: Configure or verify Marketo authentication and credentials
---

# /marketo-auth

Configure, verify, or troubleshoot Marketo API authentication.

## Usage

```
/marketo-auth [action] [instance]
```

## Actions

| Action | Description |
|--------|-------------|
| `setup` | Interactive setup for new instance |
| `test` | Test current authentication |
| `refresh` | Force token refresh |
| `status` | Show current auth status |
| `help` | Show this help |

## Interactive Setup

When running `/marketo-auth setup`, you will be prompted for:

1. **Instance Name** - A friendly name (e.g., "production", "sandbox")
2. **Base URL** - Your Marketo REST API endpoint (e.g., `https://123-ABC-456.mktorest.com`)
3. **Client ID** - From your Marketo LaunchPoint integration
4. **Client Secret** - From your Marketo LaunchPoint integration

### Finding Your Credentials

1. Go to **Admin** → **LaunchPoint** in Marketo
2. Create a new **Custom** service or find existing
3. Click **View Details** to see Client ID and Secret
4. Your base URL is based on your Munchkin ID: `https://{munchkin-id}.mktorest.com`

## Examples

### Setup New Instance
```
/marketo-auth setup
# Follow prompts to configure
```

### Test Authentication
```
/marketo-auth test
# Output: Authentication successful for instance: production
```

### Check Status
```
/marketo-auth status
# Output: Token valid, expires in 3245 seconds
```

## Environment Variables

You can also configure via environment variables:

```bash
export MARKETO_CLIENT_ID="your-client-id"
export MARKETO_CLIENT_SECRET="your-client-secret"
export MARKETO_BASE_URL="https://123-ABC-456.mktorest.com"
export MARKETO_INSTANCE_NAME="production"  # Optional
```

## Troubleshooting

### "Access token invalid" Error
- Token may have expired - run `/marketo-auth refresh`
- Credentials may be wrong - run `/marketo-auth setup` to reconfigure

### "Rate limit exceeded" Error
- Wait 20 seconds and retry
- Check your API usage in Marketo Admin

### Can't Find Credentials
1. Ensure you have Admin access in Marketo
2. Check LaunchPoint for existing services
3. Create a new Custom service if needed

## Security Notes

- Credentials are stored in `portals/config.json` (gitignored)
- Never commit credentials to version control
- Rotate credentials periodically for security
