---
name: marketo-api-reference
description: Marketo REST API patterns, authentication, and common operations. Use when integrating with Marketo, building automations, or troubleshooting API issues.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Marketo API Reference

## When to Use This Skill

- Integrating external systems with Marketo
- Building automated Marketo operations
- Troubleshooting API authentication issues
- Understanding rate limits and quotas
- Querying or updating Marketo data programmatically

## Quick Reference

### API Base URLs

| Component | URL Pattern |
|-----------|-------------|
| Identity | `https://{munchkinId}.mktorest.com/identity` |
| REST API | `https://{munchkinId}.mktorest.com/rest` |
| Bulk API | `https://{munchkinId}.mktorest.com/bulk` |

### Authentication Flow

```
1. POST /identity/oauth/token
   - grant_type=client_credentials
   - client_id={client_id}
   - client_secret={client_secret}

2. Response: { "access_token": "...", "expires_in": 3600 }

3. Use token in header: Authorization: Bearer {access_token}
```

### Rate Limits

| Limit Type | Value | Per |
|------------|-------|-----|
| Daily API calls | 50,000 | Day |
| Concurrent calls | 10 | Simultaneous |
| Bulk extract | 500 MB | Day |
| Bulk import | 10 MB | File |

## Authentication

### Get Access Token

```javascript
const getAccessToken = async () => {
    const response = await fetch(
        `https://${MUNCHKIN_ID}.mktorest.com/identity/oauth/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            })
        }
    );
    const data = await response.json();
    return data.access_token;
};
```

### Token Refresh Strategy

```javascript
// Tokens expire in 3600 seconds (1 hour)
// Refresh at 80% of lifetime (48 minutes)
const TOKEN_REFRESH_INTERVAL = 48 * 60 * 1000;

let tokenCache = { token: null, expiresAt: 0 };

const getValidToken = async () => {
    if (Date.now() >= tokenCache.expiresAt) {
        tokenCache.token = await getAccessToken();
        tokenCache.expiresAt = Date.now() + TOKEN_REFRESH_INTERVAL;
    }
    return tokenCache.token;
};
```

## Lead Operations

### Get Lead by Email

```javascript
// GET /rest/v1/leads.json?filterType=email&filterValues=john@example.com
const response = await fetch(
    `${BASE_URL}/rest/v1/leads.json?filterType=email&filterValues=${email}`,
    { headers: { Authorization: `Bearer ${token}` } }
);
```

### Create/Update Leads

```javascript
// POST /rest/v1/leads.json
const response = await fetch(`${BASE_URL}/rest/v1/leads.json`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        action: 'createOrUpdate',
        lookupField: 'email',
        input: [
            { email: 'john@example.com', firstName: 'John', lastName: 'Doe' }
        ]
    })
});
```

### Sync Lead to Campaign

```javascript
// POST /rest/v1/campaigns/{id}/trigger.json
const response = await fetch(
    `${BASE_URL}/rest/v1/campaigns/${campaignId}/trigger.json`,
    {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: { leads: [{ id: leadId }] }
        })
    }
);
```

## Smart Campaign Operations

### List Smart Campaigns

```javascript
// GET /rest/asset/v1/smartCampaigns.json
const response = await fetch(
    `${BASE_URL}/rest/asset/v1/smartCampaigns.json?maxReturn=200`,
    { headers: { Authorization: `Bearer ${token}` } }
);
```

### Trigger Campaign

```javascript
// POST /rest/v1/campaigns/{id}/trigger.json
const response = await fetch(
    `${BASE_URL}/rest/v1/campaigns/${campaignId}/trigger.json`,
    {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: {
                leads: [{ id: 123 }, { id: 456 }],
                tokens: [
                    { name: '{{my.Custom Token}}', value: 'Custom Value' }
                ]
            }
        })
    }
);
```

## Program Operations

### List Programs

```javascript
// GET /rest/asset/v1/programs.json
const response = await fetch(
    `${BASE_URL}/rest/asset/v1/programs.json?filterType=name&filterValues=*Q1*`,
    { headers: { Authorization: `Bearer ${token}` } }
);
```

### Create Program

```javascript
// POST /rest/asset/v1/programs.json
const response = await fetch(`${BASE_URL}/rest/asset/v1/programs.json`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        name: 'Q1 Campaign 2026',
        folder: { type: 'Folder', id: 123 },
        type: 'Default',
        channel: 'Webinar'
    })
});
```

## Bulk Operations

### Bulk Lead Export

```javascript
// Step 1: Create export job
// POST /bulk/v1/leads/export/create.json
const createJob = await fetch(`${BASE_URL}/bulk/v1/leads/export/create.json`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        fields: ['email', 'firstName', 'lastName', 'company'],
        filter: { createdAt: { startAt: '2026-01-01', endAt: '2026-02-01' } }
    })
});

// Step 2: Enqueue job
// POST /bulk/v1/leads/export/{exportId}/enqueue.json

// Step 3: Poll for completion
// GET /bulk/v1/leads/export/{exportId}/status.json

// Step 4: Download file
// GET /bulk/v1/leads/export/{exportId}/file.json
```

### Bulk Lead Import

```javascript
// POST /bulk/v1/leads/import.json
// Content-Type: multipart/form-data
const formData = new FormData();
formData.append('file', csvFile);
formData.append('format', 'csv');
formData.append('lookupField', 'email');

const response = await fetch(`${BASE_URL}/bulk/v1/leads/import.json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
});
```

## Error Handling

### Common Error Codes

| Code | Name | Resolution |
|------|------|------------|
| 601 | Access token invalid | Refresh token |
| 602 | Access token expired | Refresh token |
| 606 | Rate limit exceeded | Wait and retry |
| 607 | Daily quota reached | Wait until reset |
| 610 | Requested resource not found | Check ID |
| 611 | System error | Retry with backoff |

### Retry Strategy

```javascript
const retryWithBackoff = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.code === '606') {
                // Rate limited - wait 30 seconds
                await sleep(30000);
            } else if (error.code === '611') {
                // System error - exponential backoff
                await sleep(Math.pow(2, i) * 1000);
            } else {
                throw error;
            }
        }
    }
};
```

## Detailed Documentation

See supporting files:
- `endpoints.md` - Complete endpoint reference
- `bulk-operations.md` - Bulk API patterns
- `webhooks.md` - Webhook configuration
