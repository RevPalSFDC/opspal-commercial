# HubSpot OAuth Implementation Guide

Complete guide for implementing OAuth 2.0 authentication in HubSpot apps.

## OAuth Flow Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    HubSpot OAuth 2.0 Flow                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User clicks "Connect"                                         │
│     ↓                                                             │
│  2. Redirect to HubSpot authorization URL                         │
│     ↓                                                             │
│  3. User grants permissions                                       │
│     ↓                                                             │
│  4. HubSpot redirects to your callback with code                  │
│     ↓                                                             │
│  5. Exchange code for access token                                │
│     ↓                                                             │
│  6. Store tokens securely                                         │
│     ↓                                                             │
│  7. Use access token for API calls                                │
│     ↓                                                             │
│  8. Refresh token before expiration                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference

### Required URLs

| Endpoint | URL |
|----------|-----|
| Authorization | `https://app.hubspot.com/oauth/authorize` |
| Token Exchange | `https://api.hubapi.com/oauth/v1/token` |
| Token Info | `https://api.hubapi.com/oauth/v1/access-tokens/{token}` |
| Refresh Token | `https://api.hubapi.com/oauth/v1/token` |

### Token Lifetimes

| Token Type | Lifetime | Notes |
|------------|----------|-------|
| Access Token | 6 hours (21600 seconds) | Refresh before expiration |
| Refresh Token | 6 months | Re-authenticate if expired |

---

## Step 1: Create OAuth App

### In HubSpot Developer Account

1. Go to **Settings > Integrations > Private Apps** (or App Marketplace for public apps)
2. Click **Create app**
3. Fill in app details:
   - App name
   - Description
   - Logo URL
4. Configure OAuth:
   - Add redirect URI(s)
   - Select required scopes

### Record Credentials

```bash
# Store these securely (never commit to git)
HUBSPOT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_REDIRECT_URI=https://yourapp.com/oauth/callback
```

---

## Step 2: Authorization URL

### Build Authorization URL

```javascript
function buildAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID,
    redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
    scope: 'crm.objects.contacts.read crm.objects.contacts.write',
    // Optional: Include state for CSRF protection
    state: generateSecureRandomState()
  });

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}
```

### Example URL

```
https://app.hubspot.com/oauth/authorize
  ?client_id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  &redirect_uri=https://yourapp.com/oauth/callback
  &scope=crm.objects.contacts.read%20crm.objects.contacts.write
  &state=abc123secure
```

### Optional Parameters

| Parameter | Description |
|-----------|-------------|
| `optional_scope` | Scopes app can work without |
| `state` | CSRF protection (recommended) |

---

## Step 3: Handle Callback

### Callback Handler

```javascript
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state to prevent CSRF
  if (!verifyState(state)) {
    return res.status(403).send('Invalid state parameter');
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens securely
    await storeTokens(tokens);

    // Redirect to success page
    res.redirect('/oauth/success');
  } catch (error) {
    console.error('OAuth error:', error);
    res.redirect('/oauth/error');
  }
});
```

### Error Handling

```javascript
app.get('/oauth/callback', async (req, res) => {
  // Check for error response
  if (req.query.error) {
    console.error('OAuth error:', req.query.error);
    console.error('Description:', req.query.error_description);
    return res.redirect('/oauth/error');
  }

  // Continue with code exchange...
});
```

---

## Step 4: Token Exchange

### Exchange Code for Tokens

```javascript
async function exchangeCodeForTokens(code) {
  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
      redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
      code: code
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token exchange failed: ${error.message}`);
  }

  return response.json();
}
```

### Response Structure

```json
{
  "access_token": "CNKq...",
  "refresh_token": "CKjz...",
  "expires_in": 21600,
  "token_type": "bearer"
}
```

---

## Step 5: Token Storage

### Secure Storage Requirements

| Requirement | Implementation |
|-------------|----------------|
| Encryption at rest | Use AES-256 |
| Encryption in transit | HTTPS only |
| Access control | Least privilege |
| Audit logging | Track token usage |

### Example Storage

```javascript
const crypto = require('crypto');

class TokenStore {
  constructor(encryptionKey) {
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  }

  decrypt(encryptedData) {
    const [ivHex, encrypted, authTagHex] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  async store(portalId, tokens) {
    const encrypted = this.encrypt(tokens);
    await db.set(`hubspot:tokens:${portalId}`, encrypted);
  }

  async retrieve(portalId) {
    const encrypted = await db.get(`hubspot:tokens:${portalId}`);
    if (!encrypted) return null;
    return this.decrypt(encrypted);
  }
}
```

---

## Step 6: Using Access Token

### API Call with Token

```javascript
async function makeHubSpotRequest(endpoint, options = {}) {
  const tokens = await tokenStore.retrieve(portalId);

  const response = await fetch(`https://api.hubapi.com${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    }
  });

  // Handle 401 - token expired
  if (response.status === 401) {
    const newTokens = await refreshTokens(tokens.refresh_token);
    await tokenStore.store(portalId, newTokens);
    return makeHubSpotRequest(endpoint, options); // Retry
  }

  return response;
}
```

### Example: Get Contacts

```javascript
async function getContacts() {
  const response = await makeHubSpotRequest('/crm/v3/objects/contacts');
  return response.json();
}
```

---

## Step 7: Token Refresh

### Refresh Before Expiration

```javascript
async function refreshTokens(refreshToken) {
  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error('Token refresh failed');
  }

  return response.json();
}
```

### Proactive Refresh Strategy

```javascript
class TokenManager {
  constructor(tokenStore) {
    this.tokenStore = tokenStore;
    this.refreshBuffer = 5 * 60 * 1000; // 5 minutes before expiration
  }

  async getValidToken(portalId) {
    const tokens = await this.tokenStore.retrieve(portalId);

    if (!tokens) {
      throw new Error('No tokens found - re-authentication required');
    }

    // Check if token needs refresh
    const expiresAt = tokens.obtained_at + (tokens.expires_in * 1000);
    const shouldRefresh = Date.now() > (expiresAt - this.refreshBuffer);

    if (shouldRefresh) {
      try {
        const newTokens = await refreshTokens(tokens.refresh_token);
        newTokens.obtained_at = Date.now();
        await this.tokenStore.store(portalId, newTokens);
        return newTokens.access_token;
      } catch (error) {
        // Refresh token may have expired
        throw new Error('Re-authentication required');
      }
    }

    return tokens.access_token;
  }
}
```

---

## Scope Reference

### CRM Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `crm.objects.contacts.read` | Read contacts | View contact data |
| `crm.objects.contacts.write` | Create/update contacts | Manage contacts |
| `crm.objects.companies.read` | Read companies | View company data |
| `crm.objects.companies.write` | Create/update companies | Manage companies |
| `crm.objects.deals.read` | Read deals | View pipeline |
| `crm.objects.deals.write` | Create/update deals | Manage deals |
| `crm.objects.owners.read` | Read owners | View team members |
| `crm.schemas.contacts.read` | Read contact schema | View properties |
| `crm.schemas.custom.read` | Read custom objects | View custom schemas |

### Marketing Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `content` | CMS content | Manage pages |
| `forms` | Forms access | Manage forms |
| `files` | File manager | Upload/manage files |

### Automation Scopes

| Scope | Description | Use Case |
|-------|-------------|----------|
| `automation` | Workflows | Manage automations |
| `timeline` | Timeline events | Custom timeline |

---

## Common Issues

### Invalid Redirect URI

**Error**: `redirect_uri doesn't match`

**Solution**: Ensure exact match including protocol, trailing slashes.

```
# Registered: https://app.example.com/oauth/callback
# Used:       https://app.example.com/oauth/callback/  ❌ Trailing slash
# Used:       http://app.example.com/oauth/callback    ❌ Wrong protocol
```

### Missing Scopes

**Error**: `Required scope missing`

**Solution**: Request all needed scopes in authorization URL.

### Token Expired

**Error**: 401 Unauthorized

**Solution**: Implement automatic token refresh (see Step 7).

### Refresh Token Invalid

**Error**: `invalid_grant` during refresh

**Cause**: Refresh token expired (6 months) or revoked.

**Solution**: Redirect user to re-authenticate.

---

## Security Best Practices

### Do's

- ✅ Use HTTPS for all redirect URIs
- ✅ Implement state parameter for CSRF protection
- ✅ Store tokens encrypted
- ✅ Refresh tokens proactively
- ✅ Request minimum required scopes
- ✅ Log token operations for audit

### Don'ts

- ❌ Store client secret in frontend code
- ❌ Log access tokens
- ❌ Share tokens between users
- ❌ Ignore token expiration
- ❌ Request unnecessary scopes
