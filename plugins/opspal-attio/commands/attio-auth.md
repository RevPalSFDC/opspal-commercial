---
description: Configure or verify Attio authentication and credentials
argument-hint: "[action] [workspace]"
---

# /attio-auth

Configure, verify, or troubleshoot Attio API authentication.

## Usage

```
/attio-auth [action] [workspace]
```

## Actions

| Action | Description |
|--------|-------------|
| `setup` | Interactive setup for a new workspace |
| `test` | Validate the current API token |
| `status` | Show current authentication info |
| `help` | Show this help |

## Interactive Setup

When running `/attio-auth setup`, you will be prompted for:

1. **Workspace Name** - A friendly name (e.g., "production", "sandbox")
2. **API Key** - Your Attio personal or workspace API key

The setup validates your credentials immediately via `GET /v2/self` before saving.

### Finding Your Credentials

1. Go to **Settings** → **Developers** → **API keys** in the Attio web app
2. Click **Create API key** or copy an existing key
3. Assign the appropriate scopes for the operations you intend to run

## Examples

### Setup New Workspace
```
/attio-auth setup
# Follow prompts to configure workspace name and API key
```

### Test Authentication
```
/attio-auth test
# Output: Authentication successful for workspace: production
```

### Check Status
```
/attio-auth status
# Output: Workspace: production | Token: valid | Member: you@company.com
```

## Environment Variables

You can also configure via environment variables:

```bash
export ATTIO_API_KEY="your-api-key"
export ATTIO_WORKSPACE_NAME="production"  # Optional
```

## Credential Storage

Credentials are stored in `workspaces/config.json` (gitignored). Never commit this file to version control.

## Troubleshooting

### "Unauthorized" or 401 Error
- Token may have been revoked — create a new key in Settings → Developers → API keys
- Run `/attio-auth setup` to reconfigure

### "Workspace not found" Error
- Verify the workspace slug in Settings → General
- Ensure your API key belongs to the correct workspace

### Can't Find API Keys
1. Ensure you have admin or developer access in Attio
2. Navigate to **Settings** → **Developers** → **API keys**
3. Create a new key with the required scopes

## Security Notes

- Credentials are stored in `workspaces/config.json` (gitignored)
- Never commit credentials to version control
- Rotate API keys periodically for security
