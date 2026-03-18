# Authentication and Token Management

## Overview

Marketo's REST API uses OAuth 2.0 Client Credentials flow. Before interacting with any API endpoints, agents must obtain an access token using the Identity URL.

## Required Credentials

Obtain from Marketo Admin > Web Services:

| Credential | Description | Example |
|------------|-------------|---------|
| Client ID | API client identifier | `abc123def456...` |
| Client Secret | API client secret | `xyz789...` |
| Identity URL | Token endpoint | `https://123-ABC-456.mktorest.com/identity` |
| REST API URL | API base URL | `https://123-ABC-456.mktorest.com/rest` |

## Token Request

### Endpoint

```
GET {Identity URL}/oauth/token?grant_type=client_credentials&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
```

### Example Request

```bash
curl -X GET "https://123-ABC-456.mktorest.com/identity/oauth/token?grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

### Response

```json
{
  "access_token": "cdf01657-110d-4155-99a7-f986b2ff13a0:ab",
  "token_type": "bearer",
  "expires_in": 3599,
  "scope": "apiuser@company.com"
}
```

| Field | Description |
|-------|-------------|
| `access_token` | The bearer token to use in API calls |
| `token_type` | Always "bearer" |
| `expires_in` | Token lifetime in seconds (typically 3600 = 1 hour) |
| `scope` | API user email (informational) |

## Using the Token

### Authorization Header (Required)

Always use the `Authorization` header:

```
Authorization: Bearer cdf01657-110d-4155-99a7-f986b2ff13a0:ab
```

### Deprecated Method (Do Not Use)

Query parameter method is deprecated and will be removed Jan 31, 2026:
```
# DO NOT USE
GET /rest/v1/leads.json?access_token=cdf01657...
```

## Token Lifecycle Management

### Best Practices

1. **Track Expiration**: Store `expires_in` timestamp when token is obtained
2. **Proactive Refresh**: Request new token when ~5 minutes remaining
3. **Verify Before Calls**: Check token validity before API calls
4. **Handle Expiry Errors**: Catch 601/602 and auto-refresh

### Token Refresh Strategy

```javascript
// Pseudo-code for token management
const TOKEN_REFRESH_BUFFER = 5 * 60; // 5 minutes in seconds

function isTokenValid(tokenData) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokenData.obtainedAt + tokenData.expiresIn;
  return (expiresAt - now) > TOKEN_REFRESH_BUFFER;
}

async function getValidToken() {
  if (!currentToken || !isTokenValid(currentToken)) {
    currentToken = await refreshToken();
  }
  return currentToken.accessToken;
}
```

### Important Notes

- Calling the token endpoint before expiry returns the **same token** with remaining time
- Tokens are **not extended** by early refresh - you get the same token
- Track time locally rather than polling the Identity service repeatedly

## Error Handling

### Authentication Errors

| Code | Message | Action |
|------|---------|--------|
| 601 | Access token invalid | Re-authenticate, get new token |
| 602 | Access token expired | Re-authenticate, get new token |
| 603 | Access denied | Check API user permissions in Marketo |

### Auto-Refresh Pattern

```javascript
async function makeApiCall(endpoint, options) {
  try {
    const token = await getValidToken();
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    const data = await response.json();

    // Check for token errors in response
    if (!data.success && data.errors) {
      const tokenError = data.errors.find(e => e.code === '601' || e.code === '602');
      if (tokenError) {
        // Invalidate current token and retry
        currentToken = null;
        return makeApiCall(endpoint, options); // Retry once
      }
    }

    return data;
  } catch (error) {
    throw error;
  }
}
```

## Security Guidelines

1. **Never log tokens** - Treat as passwords
2. **Never commit credentials** - Use environment variables or secure vaults
3. **Server-side only** - Never expose in client-side code
4. **Rotate regularly** - Regenerate client credentials periodically
5. **Audit usage** - Monitor API usage for anomalies

## MCP Tool Usage

```javascript
// Token management is handled by the MCP server
// No explicit token calls needed - auth is automatic

// Direct API calls through MCP tools
mcp__marketo__campaign_list({ name: 'Welcome' })
mcp__marketo__campaign_get({ campaignId: 123 })
```

The `marketo-auth-manager.js` handles:
- Token caching (memory + file)
- Auto-refresh before expiry
- Retry on 601/602 errors
- Multi-instance support

## Related Files

- Script: `scripts/lib/marketo-auth-manager.js`
- Config: `portals/config.json` (gitignored)
- MCP: `mcp-server/src/auth/oauth-handler.js`
