# HubSpot CRM Cards Reference

Complete reference for building CRM cards in HubSpot apps.

## Card Types Overview

| Card Type | Location | Use Case |
|-----------|----------|----------|
| `crm-record` | Record middle column | Display data, actions on records |
| `crm-sidebar` | Record right sidebar | Quick actions, related info |
| `preview-panel` | List view preview | Record preview in lists |
| `help-desk` | Service Hub help desk | Ticket context, customer info |
| `sales-workspace` | Sales workspace | Deal intelligence, next actions |

---

## Card Configuration

### Basic Card Structure

```json
{
  "type": "crm-card",
  "data": {
    "title": "My App Card",
    "fetch": {
      "targetUrl": "https://yourapp.com/api/card",
      "objectTypes": [
        {
          "name": "CONTACT",
          "propertiesToSend": ["email", "firstname", "lastname"]
        }
      ]
    },
    "display": {
      "properties": []
    },
    "actions": []
  }
}
```

### In app.json

```json
{
  "name": "My HubSpot App",
  "uid": "my-app-123",
  "extensions": {
    "crm": {
      "cards": [
        {
          "file": "cards/customer-insights.json",
          "location": "crm-record"
        },
        {
          "file": "cards/quick-actions.json",
          "location": "crm-sidebar"
        }
      ]
    }
  }
}
```

---

## Object Types

### Supported Objects

| Object Name | API Name | Available Properties |
|-------------|----------|---------------------|
| Contact | `CONTACT` | email, firstname, lastname, phone, company, etc. |
| Company | `COMPANY` | name, domain, industry, numberofemployees, etc. |
| Deal | `DEAL` | dealname, amount, pipeline, dealstage, closedate, etc. |
| Ticket | `TICKET` | subject, content, hs_pipeline, hs_pipeline_stage, etc. |
| Custom Object | `p_{objectId}` | Custom properties |

### Property Selection

```json
{
  "objectTypes": [
    {
      "name": "CONTACT",
      "propertiesToSend": [
        "email",
        "firstname",
        "lastname",
        "lifecyclestage",
        "hs_object_id"
      ]
    }
  ]
}
```

---

## Display Properties

### Property Types

| Type | Description | Example |
|------|-------------|---------|
| `STRING` | Text value | Name, email |
| `NUMBER` | Numeric value | Score, amount |
| `DATE` | Date value | Created date |
| `DATETIME` | Date and time | Last activity |
| `CURRENCY` | Formatted currency | Deal amount |
| `PERCENT` | Percentage | Conversion rate |
| `BOOLEAN` | True/false | Is active |
| `ENUMERATION` | Dropdown value | Status |
| `LINK` | Clickable URL | External link |
| `STATUS` | Status indicator | Health status |

### Property Configuration

```json
{
  "display": {
    "properties": [
      {
        "name": "health_score",
        "label": "Health Score",
        "dataType": "NUMBER",
        "options": {
          "type": "status",
          "success": {
            "type": "above",
            "value": 80
          },
          "warning": {
            "type": "between",
            "min": 50,
            "max": 80
          },
          "danger": {
            "type": "below",
            "value": 50
          }
        }
      },
      {
        "name": "last_sync",
        "label": "Last Synced",
        "dataType": "DATETIME"
      },
      {
        "name": "external_link",
        "label": "View in System",
        "dataType": "LINK"
      }
    ]
  }
}
```

---

## Actions

### Action Types

| Type | Description | Use Case |
|------|-------------|----------|
| `ACTION_HOOK` | Server-side action | API calls, updates |
| `IFRAME` | Open iframe modal | Complex forms |
| `CONFIRMATION_ACTION_HOOK` | Confirm before action | Destructive actions |

### Action Hook

```json
{
  "actions": [
    {
      "type": "ACTION_HOOK",
      "httpMethod": "POST",
      "uri": "https://yourapp.com/api/actions/sync",
      "label": "Sync to External System",
      "description": "Synchronize this record with external CRM",
      "associatedObjectProperties": ["email", "hs_object_id"]
    }
  ]
}
```

### Confirmation Action

```json
{
  "actions": [
    {
      "type": "CONFIRMATION_ACTION_HOOK",
      "httpMethod": "DELETE",
      "uri": "https://yourapp.com/api/actions/delete",
      "label": "Delete External Record",
      "confirmationMessage": "Are you sure you want to delete this record?",
      "confirmButtonText": "Delete",
      "cancelButtonText": "Cancel"
    }
  ]
}
```

### Iframe Action

```json
{
  "actions": [
    {
      "type": "IFRAME",
      "width": 600,
      "height": 400,
      "uri": "https://yourapp.com/forms/edit?id={hs_object_id}",
      "label": "Edit in App"
    }
  ]
}
```

---

## Server-Side Implementation

### Fetch Endpoint

```javascript
// POST /api/card
app.post('/api/card', async (req, res) => {
  const {
    portalId,
    associatedObjectId,
    associatedObjectType,
    objectTypeId,
    properties
  } = req.body;

  // Fetch data from your system
  const externalData = await getExternalData(
    properties.email,
    portalId
  );

  // Return card response
  res.json({
    results: [
      {
        objectId: associatedObjectId,
        title: "Customer Insights",
        properties: [
          {
            name: "health_score",
            value: externalData.healthScore
          },
          {
            name: "last_sync",
            value: externalData.lastSync
          }
        ],
        actions: [
          {
            type: "ACTION_HOOK",
            httpMethod: "POST",
            uri: "https://yourapp.com/api/actions/sync",
            label: "Sync Now"
          }
        ]
      }
    ]
  });
});
```

### Action Endpoint

```javascript
// POST /api/actions/sync
app.post('/api/actions/sync', async (req, res) => {
  const {
    portalId,
    associatedObjectId,
    associatedObjectType,
    callbackId  // For async actions
  } = req.body;

  try {
    // Perform action
    await syncRecord(associatedObjectId, portalId);

    // Return success
    res.json({
      message: "Record synced successfully"
    });
  } catch (error) {
    res.status(500).json({
      message: "Sync failed: " + error.message
    });
  }
});
```

---

## Response Format

### Card Data Response

```json
{
  "results": [
    {
      "objectId": 12345,
      "title": "Customer Details",
      "link": "https://yourapp.com/customers/12345",
      "properties": [
        { "name": "score", "value": 85 },
        { "name": "status", "value": "Active" },
        { "name": "last_order", "value": "2025-01-15" }
      ],
      "actions": [
        {
          "type": "ACTION_HOOK",
          "httpMethod": "POST",
          "uri": "https://yourapp.com/api/sync",
          "label": "Sync"
        }
      ]
    }
  ],
  "primaryAction": {
    "type": "IFRAME",
    "width": 800,
    "height": 600,
    "uri": "https://yourapp.com/app",
    "label": "Open App"
  }
}
```

### Empty State

```json
{
  "results": [],
  "message": "No data found for this contact"
}
```

### Error Response

```json
{
  "error": "Unable to fetch data",
  "errorType": "NOT_FOUND"
}
```

---

## UI Components (UI Extensions SDK)

### Available Components

| Component | Description |
|-----------|-------------|
| `Text` | Display text |
| `Heading` | Section heading |
| `Button` | Clickable button |
| `ButtonRow` | Button group |
| `Form` | Form container |
| `Input` | Text input |
| `Select` | Dropdown |
| `Checkbox` | Boolean input |
| `Table` | Data table |
| `Alert` | Alert message |
| `LoadingSpinner` | Loading state |
| `EmptyState` | No data state |

### React Card Example

```jsx
import {
  hubspot,
  Text,
  Button,
  Table,
  Alert
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction }) => (
  <Card context={context} runServerless={runServerlessFunction} />
));

function Card({ context, runServerless }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const result = await runServerless({
      name: 'getData',
      parameters: {
        objectId: context.crm.objectId
      }
    });
    setData(result.response);
    setLoading(false);
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <Text format={{ fontWeight: "bold" }}>
        Customer Score: {data.score}
      </Text>
      <Table
        paginated={false}
        columns={[
          { name: "metric", label: "Metric" },
          { name: "value", label: "Value" }
        ]}
        rows={data.metrics}
      />
      <Button
        onClick={() => syncData()}
        variant="primary"
      >
        Sync Data
      </Button>
    </>
  );
}
```

---

## Serverless Functions

### Function Structure

```
project/
├── app.json
├── src/
│   └── app/
│       └── extensions/
│           └── cards/
│               ├── CustomerCard.jsx
│               └── CustomerCard.json
└── src/
    └── app/
        └── serverless/
            ├── getData.js
            └── syncData.js
```

### Serverless Function

```javascript
// serverless/getData.js
const hubspot = require('@hubspot/api-client');

exports.main = async (context = {}) => {
  const { objectId } = context.parameters;
  const { secrets } = context;

  const hubspotClient = new hubspot.Client({
    accessToken: secrets.PRIVATE_APP_ACCESS_TOKEN
  });

  try {
    const contact = await hubspotClient.crm.contacts.basicApi.getById(
      objectId,
      ['email', 'firstname', 'lastname']
    );

    // Fetch external data
    const externalData = await fetchExternalData(contact.properties.email);

    return {
      status: 'SUCCESS',
      response: {
        score: externalData.score,
        metrics: externalData.metrics
      }
    };
  } catch (error) {
    return {
      status: 'ERROR',
      message: error.message
    };
  }
};
```

---

## Best Practices

### Performance

- Cache external data where appropriate
- Use pagination for large datasets
- Implement timeouts (max 30 seconds)
- Return partial data on timeout

### User Experience

- Show loading states
- Handle errors gracefully
- Provide clear action feedback
- Use appropriate card locations

### Security

- Validate webhook signatures
- Authenticate requests
- Sanitize input data
- Log security events

---

## Troubleshooting

### Card Not Showing

1. Check app is installed in portal
2. Verify card location matches object type
3. Check fetch endpoint returns valid response
4. Review browser console for errors

### Actions Not Working

1. Verify action endpoint is accessible
2. Check HTTP method matches
3. Ensure proper response format
4. Review server logs for errors

### Data Not Updating

1. Card data is cached briefly
2. Force refresh by reopening record
3. Check fetch endpoint returns fresh data
4. Verify no caching headers in response
