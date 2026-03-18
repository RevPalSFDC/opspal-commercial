# Marketo REST API Endpoints Reference

Complete endpoint reference for Marketo REST and Asset APIs.

## Base URLs

```
Identity:   https://{munchkin_id}.mktorest.com/identity
REST API:   https://{munchkin_id}.mktorest.com/rest
Bulk API:   https://{munchkin_id}.mktorest.com/bulk
Asset API:  https://{munchkin_id}.mktorest.com/rest/asset
```

---

## Lead Endpoints

### Query Leads

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/leads.json` | GET | Query leads by filter |
| `/v1/lead/{id}.json` | GET | Get lead by ID |
| `/v1/leads/describe.json` | GET | Get lead schema |
| `/v1/leads/describe2.json` | GET | Get extended schema |

#### Query Leads

```http
GET /rest/v1/leads.json?filterType=email&filterValues=john@example.com,jane@example.com
Authorization: Bearer {access_token}
```

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| `filterType` | Yes | Field to filter on |
| `filterValues` | Yes | Comma-separated values (max 300) |
| `fields` | No | Fields to return |
| `batchSize` | No | Results per page (max 300) |
| `nextPageToken` | No | Pagination token |

**Response:**
```json
{
  "requestId": "1234#abcd",
  "result": [
    {
      "id": 12345,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-15T10:30:00Z"
    }
  ],
  "success": true
}
```

### Create/Update Leads

```http
POST /rest/v1/leads.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "action": "createOrUpdate",
  "lookupField": "email",
  "input": [
    {
      "email": "john@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "company": "Acme Inc"
    }
  ]
}
```

**Actions:**
| Action | Description |
|--------|-------------|
| `createOnly` | Create new leads only |
| `updateOnly` | Update existing leads only |
| `createOrUpdate` | Create or update (default) |
| `createDuplicate` | Allow duplicate creation |

### Merge Leads

```http
POST /rest/v1/leads/{id}/merge.json?leadIds=456,789
Authorization: Bearer {access_token}
```

**Limits:** Maximum 3 loser leads per merge.

### Lead Activities

```http
GET /rest/v1/activities.json?activityTypeIds=1,2&leadIds=12345
Authorization: Bearer {access_token}
```

---

## Campaign Endpoints

### Smart Campaigns

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/smartCampaigns.json` | GET | List campaigns |
| `/asset/v1/smartCampaign/{id}.json` | GET | Get campaign |
| `/asset/v1/smartCampaigns.json` | POST | Create campaign |
| `/asset/v1/smartCampaign/{id}.json` | POST | Update campaign |
| `/asset/v1/smartCampaign/{id}/clone.json` | POST | Clone campaign |
| `/asset/v1/smartCampaign/{id}/delete.json` | POST | Delete campaign |

#### List Campaigns

```http
GET /rest/asset/v1/smartCampaigns.json?name=Welcome&folder={"id":100,"type":"Folder"}
Authorization: Bearer {access_token}
```

#### Create Campaign

```http
POST /rest/asset/v1/smartCampaigns.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

name=New Campaign&folder={"id":100,"type":"Program"}&description=Test campaign
```

### Campaign Operations

#### Activate Campaign

```http
POST /rest/asset/v1/smartCampaign/{id}/activate.json
Authorization: Bearer {access_token}
```

#### Deactivate Campaign

```http
POST /rest/asset/v1/smartCampaign/{id}/deactivate.json
Authorization: Bearer {access_token}
```

#### Schedule Campaign

```http
POST /rest/v1/campaigns/{id}/schedule.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "input": {
    "runAt": "2025-01-20T10:00:00Z",
    "cloneToProgramName": "Scheduled Clone"
  }
}
```

#### Request Campaign (Trigger)

```http
POST /rest/v1/campaigns/{id}/trigger.json
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "input": {
    "leads": [
      {"id": 12345},
      {"id": 67890}
    ],
    "tokens": [
      {"name": "{{my.Custom Token}}", "value": "Custom Value"}
    ]
  }
}
```

---

## Program Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/programs.json` | GET | List programs |
| `/asset/v1/program/{id}.json` | GET | Get program |
| `/asset/v1/programs.json` | POST | Create program |
| `/asset/v1/program/{id}/clone.json` | POST | Clone program |

### List Programs

```http
GET /rest/asset/v1/programs.json?workspace=Default&maxReturn=200
Authorization: Bearer {access_token}
```

### Create Program

```http
POST /rest/asset/v1/programs.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

name=Q1 Webinar&type=event&channel=Webinar&folder={"id":456,"type":"Folder"}
```

**Program Types:**
- `program` - Default
- `event` - Event/Webinar
- `engagement` - Nurture
- `email` - Email program

### Program Tokens

```http
GET /rest/asset/v1/program/{id}/tokens.json
Authorization: Bearer {access_token}

POST /rest/asset/v1/program/{id}/tokens.json
Content-Type: application/x-www-form-urlencoded

name=Event Date&type=text&value=January 20, 2025
```

---

## Email Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/emails.json` | GET | List emails |
| `/asset/v1/email/{id}.json` | GET | Get email |
| `/asset/v1/emails.json` | POST | Create email |
| `/asset/v1/email/{id}/approve.json` | POST | Approve email |
| `/asset/v1/email/{id}/unapprove.json` | POST | Unapprove email |

### Create Email

```http
POST /rest/asset/v1/emails.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

name=Welcome Email&folder={"id":100,"type":"Program"}&template=123&subject=Welcome!&fromName=Marketing&fromEmail=marketing@example.com
```

### Update Email Content

```http
POST /rest/asset/v1/email/{id}/content/{htmlId}.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

type=HTML&value=<p>New content here</p>
```

### Send Sample

```http
POST /rest/asset/v1/email/{id}/sendSample.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

emailAddress=test@example.com&textOnly=false
```

---

## Landing Page Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/landingPages.json` | GET | List pages |
| `/asset/v1/landingPage/{id}.json` | GET | Get page |
| `/asset/v1/landingPages.json` | POST | Create page |
| `/asset/v1/landingPage/{id}/approve.json` | POST | Approve page |

### Create Landing Page

```http
POST /rest/asset/v1/landingPages.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

name=Event Registration&folder={"id":100,"type":"Program"}&template=456&title=Register Now
```

---

## Form Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/forms.json` | GET | List forms |
| `/asset/v1/form/{id}.json` | GET | Get form |
| `/asset/v1/form/{id}/fields.json` | GET | Get form fields |
| `/asset/v1/form/{id}/fields.json` | POST | Add field |

### Get Form Fields

```http
GET /rest/asset/v1/form/{id}/fields.json
Authorization: Bearer {access_token}
```

### Add Form Field

```http
POST /rest/asset/v1/form/{id}/fields.json
Authorization: Bearer {access_token}
Content-Type: application/x-www-form-urlencoded

fieldId=Email&required=true&labelWidth=100
```

---

## Static List Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/staticLists.json` | GET | List static lists |
| `/asset/v1/staticList/{id}.json` | GET | Get list |
| `/v1/lists/{id}/leads.json` | GET | Get list members |
| `/v1/lists/{id}/leads.json` | POST | Add to list |
| `/v1/lists/{id}/leads.json` | DELETE | Remove from list |

### Add Leads to List

```http
POST /rest/v1/lists/{listId}/leads.json?id=12345,67890
Authorization: Bearer {access_token}
```

### Get List Members

```http
GET /rest/v1/lists/{listId}/leads.json?fields=email,firstName,lastName&batchSize=300
Authorization: Bearer {access_token}
```

---

## Smart List Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/smartLists.json` | GET | List smart lists |
| `/asset/v1/smartList/{id}.json` | GET | Get smart list |
| `/asset/v1/smartList/{id}/clone.json` | POST | Clone smart list |
| `/asset/v1/smartList/{id}/delete.json` | POST | Delete smart list |

### Get Smart List with Rules

```http
GET /rest/asset/v1/smartList/{id}.json?includeRules=true
Authorization: Bearer {access_token}
```

---

## Analytics Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/activities/types.json` | GET | List activity types |
| `/v1/activities.json` | GET | Get activities |
| `/v1/activities/pagingtoken.json` | GET | Get paging token |

### Get Activity Types

```http
GET /rest/v1/activities/types.json
Authorization: Bearer {access_token}
```

### Get Paging Token

```http
GET /rest/v1/activities/pagingtoken.json?sinceDatetime=2025-01-01T00:00:00Z
Authorization: Bearer {access_token}
```

### Get Activities

```http
GET /rest/v1/activities.json?activityTypeIds=1,12,13&nextPageToken={token}
Authorization: Bearer {access_token}
```

---

## Folder Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/asset/v1/folders.json` | GET | List folders |
| `/asset/v1/folder/{id}.json` | GET | Get folder |
| `/asset/v1/folders.json` | POST | Create folder |

### List Folders

```http
GET /rest/asset/v1/folders.json?root={"id":456,"type":"Folder"}
Authorization: Bearer {access_token}
```

---

## Custom Object Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/customobjects/{name}.json` | GET | Query objects |
| `/v1/customobjects/{name}.json` | POST | Create/update |
| `/v1/customobjects/{name}/describe.json` | GET | Get schema |

### Query Custom Objects

```http
GET /rest/v1/customobjects/car_c.json?filterType=vin&filterValues=123ABC,456DEF
Authorization: Bearer {access_token}
```

---

## Pagination

All list endpoints support pagination:

```http
GET /rest/v1/leads.json?filterType=email&filterValues=test@example.com&batchSize=300&nextPageToken={token}
```

**Response includes:**
```json
{
  "result": [...],
  "nextPageToken": "abc123...",
  "moreResult": true
}
```

Continue fetching while `moreResult: true`.

---

## Error Response Format

```json
{
  "requestId": "1234#abcd",
  "success": false,
  "errors": [
    {
      "code": "1003",
      "message": "Invalid value for field 'filterType'"
    }
  ]
}
```

See main SKILL.md for error code reference.
