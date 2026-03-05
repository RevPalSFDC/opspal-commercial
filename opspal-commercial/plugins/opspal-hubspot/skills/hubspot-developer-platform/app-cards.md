# HubSpot App Cards Development Guide

Complete reference for building HubSpot App Cards - custom UI components that extend HubSpot's interface.

## App Card Locations

| Location | Extension Key | Description |
|----------|---------------|-------------|
| CRM Record Tab | `crm.record.tab` | Full-width card on contact/company/deal pages |
| CRM Record Sidebar | `crm.record.sidebar` | Side panel on record pages |
| Preview Panel | `crm.preview.sidebar` | Shows in record preview on hover |
| Help Desk | `crm.helpdesk.tab` | Service Hub ticket workspace |
| Sales Workspace | `crm.salesWorkspace.tab` | Sales Hub workspace |

## Card Configuration

### card.json Structure

```json
{
  "type": "crm-card",
  "data": {
    "title": "My App Card",
    "uid": "my-app-card",
    "location": "crm.record.tab",
    "module": {
      "file": "Card.tsx"
    },
    "objectTypes": [
      {
        "name": "contacts",
        "propertiesToSend": ["firstname", "lastname", "email"]
      },
      {
        "name": "companies",
        "propertiesToSend": ["name", "domain"]
      }
    ]
  }
}
```

### Object Types Available

- `contacts` - Contact records
- `companies` - Company records
- `deals` - Deal records
- `tickets` - Service tickets
- `<custom_object_name>` - Custom objects

## React Component Structure

### Basic Card Template

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

const Card = ({ context, runServerlessFunction, actions }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { objectId, objectType } = context.crm;

  useEffect(() => {
    fetchData();
  }, [objectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await runServerlessFunction('getData', {
        objectId,
        objectType
      });
      setData(result.response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading..." />;
  if (error) return <ErrorState title="Error">{error}</ErrorState>;
  if (!data) return <EmptyState title="No data" />;

  return (
    <Flex direction="column" gap="medium">
      <Text format={{ fontWeight: 'bold' }}>
        {context.crm.objectType} Data
      </Text>
      {/* Your content here */}
    </Flex>
  );
};

export default Card;
```

## UI Components Reference

### Layout

```tsx
// Flex container
<Flex direction="column" gap="medium" align="start" justify="space-between">
  <Box>Item 1</Box>
  <Box>Item 2</Box>
</Flex>

// Tile (card-like container)
<Tile>
  <Text>Content in a tile</Text>
</Tile>

// Divider
<Divider />
```

### Typography

```tsx
// Text with formatting
<Text format={{ fontWeight: 'bold', color: 'primary' }}>
  Bold primary text
</Text>

// Heading
<Heading>Section Title</Heading>

// Link
<Link href="https://example.com" external>
  External Link
</Link>
```

### Tables

```tsx
<Table>
  <TableHead>
    <TableRow>
      <TableCell>Header 1</TableCell>
      <TableCell>Header 2</TableCell>
    </TableRow>
  </TableHead>
  <TableBody>
    {items.map(item => (
      <TableRow key={item.id}>
        <TableCell>{item.name}</TableCell>
        <TableCell>{item.value}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

### Statistics Display

```tsx
<Statistics>
  <StatisticsItem label="Open Deals" value="12" />
  <StatisticsItem label="Revenue" value="$45,000" />
  <StatisticsItem label="Win Rate" value="35%" />
</Statistics>
```

### Tags and Badges

```tsx
// Status tags
<Tag variant="success">Active</Tag>
<Tag variant="warning">Pending</Tag>
<Tag variant="error">Overdue</Tag>

// Badge (for counts)
<Badge variant="primary">5</Badge>
```

### Buttons

```tsx
// Button row
<ButtonRow>
  <Button variant="primary" onClick={handleSave}>Save</Button>
  <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
</ButtonRow>

// Loading button
<LoadingButton loading={isLoading} onClick={handleSubmit}>
  Submit
</LoadingButton>

// Destructive action
<Button variant="destructive" onClick={handleDelete}>
  Delete
</Button>
```

### Forms in Cards

```tsx
<Input
  label="Notes"
  name="notes"
  value={notes}
  onChange={setNotes}
  placeholder="Enter notes..."
/>

<Select
  label="Status"
  options={[
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' }
  ]}
  value={status}
  onChange={setStatus}
/>

<Toggle
  label="Enable feature"
  checked={enabled}
  onChange={setEnabled}
/>
```

### Modals

```tsx
const [showModal, setShowModal] = useState(false);

{showModal && (
  <Modal title="Confirm Action" onClose={() => setShowModal(false)}>
    <ModalBody>
      <Text>Are you sure?</Text>
    </ModalBody>
    <ModalFooter>
      <Button onClick={handleConfirm}>Confirm</Button>
      <Button variant="secondary" onClick={() => setShowModal(false)}>
        Cancel
      </Button>
    </ModalFooter>
  </Modal>
)}
```

## HubSpot Actions

### Navigation Actions

```tsx
// Open a CRM record
actions.openRecord({
  objectType: 'contacts',
  objectId: '12345'
});

// Open external URL
actions.openExternalUrl({
  url: 'https://example.com'
});
```

### Notification Actions

```tsx
// Show alert
actions.addAlert({
  title: 'Success',
  message: 'Action completed',
  type: 'success' // success, warning, danger, info
});
```

### Data Actions

```tsx
// Refresh object properties
actions.refreshObjectProperties();

// Open property panel
actions.openPropertyPanel({
  properties: ['email', 'phone', 'company']
});
```

## Serverless Functions

### Function Structure

```javascript
// src/functions/getData.js
exports.main = async (context = {}) => {
  const { objectId, objectType } = context.parameters;
  const { client } = context; // Pre-authenticated HubSpot client

  try {
    const record = await client.crm[objectType].basicApi.getById(
      objectId,
      ['firstname', 'lastname', 'email']
    );

    return {
      statusCode: 200,
      body: record.properties
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: { error: 'Failed to fetch data' }
    };
  }
};
```

### Calling External APIs

```javascript
// src/functions/fetchExternal.js
const axios = require('axios');

exports.main = async (context = {}) => {
  const { apiKey } = context.secrets;

  try {
    const response = await axios.get('https://api.example.com/data', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    return {
      statusCode: 200,
      body: response.data
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: { error: 'External API error' }
    };
  }
};
```

## Context Object

```typescript
interface Context {
  crm: {
    objectId: string;
    objectType: string;
    objectTypeId: string;
    portalId: number;
    properties: Record<string, string>;
  };
  user: {
    id: number;
    email: string;
    locale: string;
    timezone: string;
  };
}
```

## Best Practices

### Performance

1. **Minimize API calls** - Batch when possible
2. **Use propertiesToSend** - Only request needed properties
3. **Implement caching** - Cache repeated data
4. **Lazy load** - Load secondary data on demand

### User Experience

1. **Always show loading states** - Use LoadingSpinner
2. **Handle errors gracefully** - Use ErrorState with retry
3. **Support empty states** - Use EmptyState component
4. **Provide clear actions** - Use descriptive button labels

### Security

1. **Use serverless functions** - Never expose API keys in frontend
2. **Validate inputs** - Sanitize all user inputs
3. **Request minimum scopes** - Only what's needed
4. **Handle errors safely** - Don't expose stack traces

## Common Patterns

### Data Refresh Pattern

```tsx
const [refreshKey, setRefreshKey] = useState(0);

useEffect(() => {
  fetchData();
}, [refreshKey, objectId]);

const handleRefresh = () => setRefreshKey(k => k + 1);
```

### Optimistic Updates

```tsx
const handleUpdate = async (newValue) => {
  const previousValue = data;
  setData(newValue); // Optimistic update

  try {
    await runServerlessFunction('updateData', { value: newValue });
  } catch (error) {
    setData(previousValue); // Rollback on error
    setError('Update failed');
  }
};
```

### Pagination Pattern

```tsx
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);

const loadMore = async () => {
  const result = await runServerlessFunction('getData', {
    page: page + 1,
    limit: 10
  });

  setData(prev => [...prev, ...result.response.items]);
  setHasMore(result.response.hasMore);
  setPage(p => p + 1);
};
```
