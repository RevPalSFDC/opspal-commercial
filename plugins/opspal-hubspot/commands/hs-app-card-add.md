---
name: hs-app-card-add
description: Add an app card to an existing HubSpot app project
argument-hint: "[--type <card-type>] [--name <card-name>]"
arguments:
  - name: type
    description: Card type (crm-record, preview-panel, help-desk, sales-workspace)
    required: false
  - name: name
    description: Card name (used for folder and identifiers)
    required: false
---

# /hs-app-card-add - Add HubSpot App Card

Interactive wizard to add a new app card to an existing HubSpot app project.

## Usage

```bash
/hs-app-card-add                              # Interactive mode
/hs-app-card-add --type crm-record            # Specify type
/hs-app-card-add --name my-card --type crm-record  # Full specification
```

## Prerequisites

- Existing HubSpot app project (created with `/hs-app-create` or `hs project create`)
- HubSpot CLI installed and authenticated

## Card Types

| Type | Location Key | Description |
|------|--------------|-------------|
| `crm-record` | `crm.record.tab` | Full-width card on CRM records |
| `crm-sidebar` | `crm.record.sidebar` | Sidebar card on CRM records |
| `preview-panel` | `crm.preview.sidebar` | Preview hover panel |
| `help-desk` | `crm.helpdesk.tab` | Service Hub tickets |
| `sales-workspace` | `crm.salesWorkspace.tab` | Sales Hub workspace |

## Workflow

### Step 1: Verify Project

Check for valid HubSpot app project:
- `app.json` exists
- `src/app/extensions/` directory exists (or create it)

### Step 2: Gather Information

Ask the user:
1. **Card type** - Where the card will display
2. **Card name** - Identifier (e.g., "customer-insights")
3. **Title** - Display title (e.g., "Customer Insights")
4. **Object types** - Which CRM objects (contacts, companies, deals, tickets)

### Step 3: Create Card Files

Create directory: `src/app/extensions/{card-name}/`

**card.json:**

```json
{
  "type": "crm-card",
  "data": {
    "title": "{Card Title}",
    "uid": "{card-name}",
    "location": "{location-key}",
    "module": {
      "file": "Card.tsx"
    },
    "objectTypes": [
      {
        "name": "contacts",
        "propertiesToSend": ["firstname", "lastname", "email"]
      }
    ]
  }
}
```

**Card.tsx:**

```tsx
import React, { useState, useEffect } from 'react';
import {
  Flex,
  Text,
  Button,
  LoadingSpinner,
  ErrorState,
  EmptyState,
  hubspot
} from '@hubspot/ui-extensions';

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <Card
    context={context}
    runServerlessFunction={runServerlessFunction}
    actions={actions}
  />
));

interface CardProps {
  context: any;
  runServerlessFunction: (name: string, params?: any) => Promise<any>;
  actions: any;
}

const Card: React.FC<CardProps> = ({ context, runServerlessFunction, actions }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { objectId, objectType } = context.crm;

  useEffect(() => {
    fetchData();
  }, [objectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await runServerlessFunction('get{CardName}Data', {
        objectId,
        objectType
      });
      setData(result.response);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner label="Loading..." />;
  }

  if (error) {
    return (
      <ErrorState title="Error loading data">
        <Text>{error}</Text>
        <Button onClick={fetchData}>Retry</Button>
      </ErrorState>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No data available"
        message="There is no data to display for this record."
      />
    );
  }

  return (
    <Flex direction="column" gap="medium">
      <Text format={{ fontWeight: 'bold' }}>
        {Card Title} for {objectType}
      </Text>
      {/* Add your card content here */}
      <Text>Object ID: {objectId}</Text>
    </Flex>
  );
};

export default Card;
```

### Step 4: Create Serverless Function

Create `src/functions/get{CardName}Data.js`:

```javascript
exports.main = async (context = {}) => {
  const { objectId, objectType } = context.parameters;
  const { client } = context;

  try {
    // Fetch data from HubSpot
    const record = await client.crm[objectType].basicApi.getById(
      objectId,
      ['firstname', 'lastname', 'email', 'company']
    );

    return {
      statusCode: 200,
      body: record.properties
    };
  } catch (error) {
    console.error('Error fetching data:', error);
    return {
      statusCode: 500,
      body: { error: 'Failed to fetch record data' }
    };
  }
};
```

### Step 5: Update app.json

Add the card to extensions:

```json
{
  "extensions": {
    "crm": {
      "cards": [
        {
          "file": "src/app/extensions/{card-name}/card.json",
          "location": "{location-key}"
        }
      ]
    }
  }
}
```

### Step 6: Update OAuth Scopes

Add required scopes to app.json:

```json
{
  "auth": {
    "scopes": {
      "required": [
        "crm.objects.contacts.read"
      ]
    }
  }
}
```

### Step 7: Provide Next Steps

```
✅ App card added: {card-name}

Files created:
- src/app/extensions/{card-name}/card.json
- src/app/extensions/{card-name}/Card.tsx
- src/functions/get{CardName}Data.js

Next steps:
1. Customize Card.tsx with your UI
2. Update serverless function for your data needs
3. hs project dev    # Test locally
4. hs project upload # Deploy

Documentation:
- skills/hubspot-developer-platform/app-cards.md
```

## Template Variations

### Preview Panel Card

For preview panels, use simpler UI:

```tsx
// Compact layout for preview
<Flex direction="column" gap="small">
  <Text format={{ fontWeight: 'bold' }}>{data.name}</Text>
  <Text variant="microcopy">{data.email}</Text>
  <Tag variant={data.status === 'active' ? 'success' : 'default'}>
    {data.status}
  </Tag>
</Flex>
```

### Sidebar Card

For sidebars, vertical layout:

```tsx
// Vertical layout for sidebar
<Flex direction="column" gap="small">
  <Divider />
  <Statistics>
    <StatisticsItem label="Score" value={data.score} />
    <StatisticsItem label="Status" value={data.status} />
  </Statistics>
</Flex>
```

## Error Handling

- **Not in project**: "Run this command from a HubSpot app project directory"
- **Card exists**: "Card '{name}' already exists. Choose a different name."
- **Invalid type**: "Invalid card type. Use: crm-record, preview-panel, help-desk, sales-workspace"
