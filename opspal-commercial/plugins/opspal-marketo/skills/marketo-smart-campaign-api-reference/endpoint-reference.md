# Smart Campaign API Endpoint Reference

## Authentication

All endpoints require OAuth 2.0 Bearer token:
```
Authorization: Bearer {access_token}
```

Base URL: `https://{instance-id}.mktorest.com`

---

## Create Campaign

**Endpoint**: `POST /rest/asset/v1/smartCampaigns.json`

**Content-Type**: `application/x-www-form-urlencoded`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Unique campaign name |
| folder | JSON | Yes | `{"id": num, "type": "Folder"|"Program"}` |
| description | string | No | Campaign description |

**MCP Tool**:
```javascript
mcp__marketo__campaign_create({
  name: 'Campaign Name',
  folder: { id: 1000, type: 'Program' },
  description: 'Optional'
})
```

**Response**:
```json
{
  "success": true,
  "result": [{
    "id": 2045,
    "name": "Campaign Name",
    "type": "batch",
    "status": "Never Run",
    "isActive": false
  }]
}
```

**Note**: Created campaigns are EMPTY - no triggers or flows.

---

## Get Campaign

**Endpoint**: `GET /rest/asset/v1/smartCampaign/{id}.json`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Campaign ID (path) |

**MCP Tool**:
```javascript
mcp__marketo__campaign_get({ campaignId: 2045 })
```

**Response Fields**:
| Field | Type | Description |
|-------|------|-------------|
| id | integer | Campaign ID |
| name | string | Campaign name |
| description | string | Description |
| type | string | "trigger" or "batch" |
| status | string | Current status |
| isActive | boolean | Active state |
| isRequestable | boolean | Has API trigger |
| isCommunicationLimitEnabled | boolean | Honors limits |
| qualificationRuleType | string | Lead qualification |
| smartListId | integer | Smart List ID |
| flowId | integer | Flow ID |

---

## Update Campaign

**Endpoint**: `POST /rest/asset/v1/smartCampaign/{id}.json`

**Content-Type**: `application/x-www-form-urlencoded`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Campaign ID (path) |
| name | string | No | New name |
| description | string | No | New description |

**Note**: Only name and description can be updated.

**MCP Tool**:
```javascript
mcp__marketo__campaign_update({
  campaignId: 2045,
  name: 'New Name',
  description: 'New description'
})
```

---

## Clone Campaign

**Endpoint**: `POST /rest/asset/v1/smartCampaign/{id}/clone.json`

**Content-Type**: `application/x-www-form-urlencoded`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Source campaign ID (path) |
| name | string | Yes | New campaign name |
| folder | JSON | Yes | Target folder/program |
| description | string | No | New description |

**MCP Tool**:
```javascript
mcp__marketo__campaign_clone({
  campaignId: 1000,
  name: 'Cloned Campaign',
  folder: { id: 2000, type: 'Program' },
  description: 'Cloned from template'
})
```

**What Gets Cloned**:
- Smart List (triggers and filters)
- Flow steps (all steps and choices)
- Qualification rules
- Communication limit settings

**What Does NOT Clone**:
- Name (must provide new)
- Status (always Inactive)

---

## Delete Campaign

**Endpoint**: `POST /rest/asset/v1/smartCampaign/{id}/delete.json`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Campaign ID (path) |

**MCP Tool**:
```javascript
mcp__marketo__campaign_delete({ campaignId: 2045 })
```

**Pre-requisites**:
- Campaign must not be active (deactivate first)
- Campaign must not be system campaign

**Warning**: Deletion is PERMANENT and cannot be undone.

---

## Get Smart List

**Endpoint**: `GET /rest/asset/v1/smartCampaign/{id}/smartList.json`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Campaign ID (path) |
| includeRules | boolean | No | Include rule details (default: false) |

**MCP Tool**:
```javascript
mcp__marketo__campaign_get_smart_list({
  campaignId: 2045,
  includeRules: true
})
```

**Response with Rules**:
```json
{
  "success": true,
  "result": [{
    "id": 6001,
    "rules": {
      "triggers": [
        { "id": 1, "name": "Fills Out Form", "filterTypeId": 1 }
      ],
      "filters": [
        { "id": 2, "name": "Email Address", "filterTypeId": 45 }
      ],
      "filterLogic": "1 AND 2"
    }
  }]
}
```

---

## Activate Campaign

**Endpoint**: `POST /rest/asset/v1/smartCampaign/{id}/activate.json`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Campaign ID (path) |

**Requirements**:
- Must be trigger campaign (type: "trigger")
- Must have at least one trigger
- Must have at least one flow step

**MCP Tool**:
```javascript
mcp__marketo__campaign_activate({ campaignId: 2045 })
```

---

## Deactivate Campaign

**Endpoint**: `POST /rest/asset/v1/smartCampaign/{id}/deactivate.json`

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Campaign ID (path) |

**MCP Tool**:
```javascript
mcp__marketo__campaign_deactivate({ campaignId: 2045 })
```

---

## Schedule Campaign

**Endpoint**: `POST /rest/v1/campaigns/{id}/schedule.json`

**Note**: This is under `/rest/v1/` (Lead Database API), not `/asset/`.

**Content-Type**: `application/json`

**Request Body**:
```json
{
  "input": {
    "runAt": "2026-01-20T14:00:00Z",
    "tokens": [
      { "name": "{{my.TokenName}}", "value": "Value" }
    ],
    "cloneToProgramName": "Optional Clone Name"
  }
}
```

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| runAt | datetime | No | ISO 8601 (omit for immediate) |
| tokens | array | No | Token overrides |
| cloneToProgramName | string | No | Clone program before run |

**MCP Tool**:
```javascript
mcp__marketo__campaign_schedule({
  campaignId: 3001,
  runAt: '2026-01-20T14:00:00Z',
  tokens: [{ name: '{{my.Date}}', value: 'January 20' }]
})
```

---

## Request Campaign

**Endpoint**: `POST /rest/v1/campaigns/{id}/trigger.json`

**Note**: This is under `/rest/v1/` (Lead Database API), not `/asset/`.

**Content-Type**: `application/json`

**Request Body**:
```json
{
  "input": {
    "leads": [
      { "id": 12345 },
      { "id": 67890 }
    ],
    "tokens": [
      { "name": "{{my.TokenName}}", "value": "Value" }
    ]
  }
}
```

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| leads | array | Yes | Lead objects with `id` (max 100) |
| tokens | array | No | Token overrides |

**Requirements**:
- Campaign must have "Campaign is Requested" trigger
- Campaign `isRequestable` must be `true`

**MCP Tool**:
```javascript
mcp__marketo__campaign_request({
  campaignId: 2045,
  leads: [{ id: 12345 }, { id: 67890 }],
  tokens: [{ name: '{{my.Date}}', value: '2026-01-20' }]
})
```

---

## List Campaigns

**Endpoint**: `GET /rest/asset/v1/smartCampaigns.json`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| name | string | Filter by name (partial match) |
| programName | string | Filter by program |
| workspaceName | string | Filter by workspace |
| maxReturn | integer | Records to return (max 200) |
| offset | integer | Pagination offset |
| isTriggerable | boolean | Filter trigger campaigns |
| earliestUpdatedAt | datetime | Filter by update date |
| latestUpdatedAt | datetime | Filter by update date |

**MCP Tool**:
```javascript
mcp__marketo__campaign_list({
  name: 'Welcome',
  programName: 'Q1 Webinar',
  batchSize: 200
})
```
