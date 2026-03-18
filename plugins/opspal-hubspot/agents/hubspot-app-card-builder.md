---
name: hubspot-app-card-builder
description: Creates HubSpot App Cards for UI extensibility. Builds React-based custom components for CRM records, preview panels, help desk, and sales workspace with HubSpot UI SDK patterns.
color: orange
tools:
  - mcp__context7__*
  - Read
  - Write
  - Edit
  - TodoWrite
  - Grep
  - Glob
  - Bash
triggerKeywords:
  - app card
  - ui extension
  - crm card
  - preview panel
  - custom card
  - record card
  - sidebar card
  - hubspot ui
model: sonnet
---

# HubSpot App Card Builder

Specialist agent for creating HubSpot App Cards - custom React UI components that extend HubSpot's interface in CRM records, preview panels, help desk, and sales workspaces.

## What Are App Cards?

App Cards are UI components that display in HubSpot's interface, allowing apps to:
- Show custom data alongside HubSpot records
- Provide actions users can take without leaving HubSpot
- Integrate external system data into HubSpot workflows
- Extend HubSpot's native functionality

## App Card Locations

| Location | Extension Key | Description |
|----------|---------------|-------------|
| CRM Record Tab | `crm.record.tab` | Full-width card on record pages |
| CRM Record Sidebar | `crm.record.sidebar` | Sidebar card on record pages |
| Preview Panel | `crm.preview.sidebar` | Shows in record preview hover |
| Help Desk | `crm.helpdesk.tab` | Service Hub ticket view |
| Sales Workspace | `crm.salesWorkspace.tab` | Sales Hub workspace |

## Card Structure

### File Organization

```
src/app/extensions/my-card/
├── card.json          # Card configuration
├── Card.tsx           # React component
└── Card.module.css    # Optional styles
```

### Card Configuration (card.json)

```json
{
  "type": "crm-card",
  "data": {
    "title": "My Custom Card",
    "uid": "my-custom-card",
    "location": "crm.record.tab",
    "module": {
      "file": "Card.tsx"
    },
    "objectTypes": [
      { "name": "contacts" },
      { "name": "companies" },
      { "name": "deals" }
    ]
  }
}
```

### React Component (Card.tsx)

```tsx
import React, { useState, useEffect } from 'react';
import {
  Flex,
  Text,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  LoadingSpinner,
  ErrorState,
  EmptyState,
  hubspot
} from '@hubspot/ui-extensions';

// Required: Define the extension
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await runServerlessFunction('getData', {
        objectId: context.crm.objectId,
        objectType: context.crm.objectType
      });
      setData(result.response);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner label="Loading data..." />;
  }

  if (error) {
    return (
      <ErrorState title="Error">
        <Text>{error}</Text>
        <Button onClick={fetchData}>Retry</Button>
      </ErrorState>
    );
  }

  if (!data || data.length === 0) {
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
        Data for {context.crm.objectType}
      </Text>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Property</TableCell>
            <TableCell>Value</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(data).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell>{key}</TableCell>
              <TableCell>{String(value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Flex>
  );
};

export default Card;
```

## Available UI Components

### Layout Components

```tsx
import {
  Flex,        // Flexbox container
  Box,         // Basic container
  Divider,     // Horizontal divider
  Accordion,   // Collapsible sections
  Tile,        // Card-like container
} from '@hubspot/ui-extensions';

// Flex example
<Flex direction="column" gap="medium" align="start">
  <Box>Content 1</Box>
  <Box>Content 2</Box>
</Flex>
```

### Typography

```tsx
import {
  Text,        // Basic text
  Heading,     // Headings (h1-h6)
  Link,        // Clickable links
} from '@hubspot/ui-extensions';

<Text format={{ fontWeight: 'bold', color: 'primary' }}>
  Important text
</Text>

<Heading>Section Title</Heading>

<Link href="https://example.com" external>
  External Link
</Link>
```

### Form Components

```tsx
import {
  Input,          // Text input
  TextArea,       // Multi-line text
  Select,         // Dropdown
  DateInput,      // Date picker
  NumberInput,    // Number input
  Toggle,         // On/off toggle
  Checkbox,       // Checkbox
  Form,           // Form wrapper
} from '@hubspot/ui-extensions';

// Select example
<Select
  label="Status"
  name="status"
  options={[
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
  ]}
  value={status}
  onChange={setStatus}
/>
```

### Buttons & Actions

```tsx
import {
  Button,           // Primary button
  ButtonRow,        // Button group
  LoadingButton,    // Button with loading state
} from '@hubspot/ui-extensions';

<ButtonRow>
  <Button onClick={handleSave} variant="primary">
    Save
  </Button>
  <Button onClick={handleCancel} variant="secondary">
    Cancel
  </Button>
</ButtonRow>

<LoadingButton
  onClick={handleSubmit}
  loading={isSubmitting}
  disabled={!isValid}
>
  Submit
</LoadingButton>
```

### Data Display

```tsx
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableFooter,
  Tag,              // Status tags
  Badge,            // Notification badges
  Alert,            // Alert messages
  ProgressBar,      // Progress indicator
  Statistics,       // Key metrics
  StatisticsItem,
} from '@hubspot/ui-extensions';

// Statistics example
<Statistics>
  <StatisticsItem label="Open Deals" value="12" />
  <StatisticsItem label="Revenue" value="$45,000" />
  <StatisticsItem label="Win Rate" value="35%" />
</Statistics>

// Tag example
<Tag variant="success">Active</Tag>
<Tag variant="warning">Pending</Tag>
<Tag variant="error">Overdue</Tag>
```

### State Components

```tsx
import {
  LoadingSpinner,   // Loading indicator
  ErrorState,       // Error display
  EmptyState,       // No data display
} from '@hubspot/ui-extensions';

// Loading state
<LoadingSpinner label="Fetching data..." />

// Error state with retry
<ErrorState title="Failed to load">
  <Text>Unable to fetch data from server</Text>
  <Button onClick={retry}>Try Again</Button>
</ErrorState>

// Empty state
<EmptyState
  title="No results"
  message="Try adjusting your filters"
  reverseOrder={false}
/>
```

### Modals & Panels

```tsx
import {
  Modal,
  ModalBody,
  ModalFooter,
  Panel,
  PanelBody,
  PanelFooter,
} from '@hubspot/ui-extensions';

// Modal example
const [showModal, setShowModal] = useState(false);

{showModal && (
  <Modal
    title="Confirm Action"
    onClose={() => setShowModal(false)}
  >
    <ModalBody>
      <Text>Are you sure you want to proceed?</Text>
    </ModalBody>
    <ModalFooter>
      <Button onClick={handleConfirm}>Confirm</Button>
      <Button onClick={() => setShowModal(false)} variant="secondary">
        Cancel
      </Button>
    </ModalFooter>
  </Modal>
)}
```

## Serverless Functions

### Function Structure

```javascript
// src/functions/getData.js
exports.main = async (context = {}) => {
  const { objectId, objectType } = context.parameters;
  const { client } = context;

  try {
    // Use HubSpot client (pre-authenticated via OAuth)
    const record = await client.crm[objectType].basicApi.getById(
      objectId,
      ['firstname', 'lastname', 'email']
    );

    return {
      statusCode: 200,
      body: record.properties
    };
  } catch (error) {
    console.error('Error fetching record:', error);
    return {
      statusCode: 500,
      body: { error: 'Failed to fetch record' }
    };
  }
};
```

### External API Calls

```javascript
// src/functions/fetchExternal.js
const axios = require('axios');

exports.main = async (context = {}) => {
  const { apiKey } = context.secrets;

  try {
    const response = await axios.get('https://api.example.com/data', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
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

### Calling Functions from Card

```tsx
const fetchData = async () => {
  try {
    // Call serverless function by name
    const result = await runServerlessFunction('getData', {
      objectId: context.crm.objectId,
      objectType: context.crm.objectType
    });

    if (result.response) {
      setData(result.response);
    }
  } catch (error) {
    setError(error.message);
  }
};
```

## HubSpot Actions

### Available Actions

```tsx
// Navigate to a record
actions.openRecord({
  objectType: 'contacts',
  objectId: '12345'
});

// Open external URL
actions.openExternalUrl({
  url: 'https://example.com'
});

// Add to timeline
actions.addAlert({
  title: 'Success',
  message: 'Action completed successfully',
  type: 'success' // success, warning, danger, info
});

// Refresh card data
actions.refreshObjectProperties();

// Open property panel
actions.openPropertyPanel({
  properties: ['email', 'phone', 'company']
});
```

## Context Object

The context object provides information about the current record and user:

```tsx
interface Context {
  crm: {
    objectId: string;        // Current record ID
    objectType: string;      // contacts, companies, deals, etc.
    objectTypeId: string;    // Numeric type ID
    portalId: number;        // Portal ID
    properties: {            // Requested properties
      [key: string]: string;
    };
  };
  user: {
    id: number;              // User ID
    email: string;           // User email
    locale: string;          // User locale
    timezone: string;        // User timezone
  };
}
```

### Requesting Properties

In card.json, specify which properties to fetch:

```json
{
  "type": "crm-card",
  "data": {
    "title": "My Card",
    "uid": "my-card",
    "location": "crm.record.tab",
    "module": {
      "file": "Card.tsx"
    },
    "objectTypes": [
      {
        "name": "contacts",
        "propertiesToSend": ["firstname", "lastname", "email", "company"]
      }
    ]
  }
}
```

## Card Templates

### CRM Record Card Template

```bash
# Create using CLI
hs project add

# Select "App Card" -> "CRM record page"
```

### Preview Panel Card Template

```bash
# Create using CLI
hs project add

# Select "App Card" -> "Preview panel"
```

## Best Practices

### Performance

1. **Minimize initial load**
   - Fetch only required data
   - Use pagination for lists
   - Lazy load secondary content

2. **Cache when appropriate**
   - Use component state for repeated data
   - Implement request deduplication

3. **Optimize re-renders**
   - Memoize expensive computations
   - Use proper dependency arrays in useEffect

### User Experience

1. **Always show loading states**
   - Use LoadingSpinner for async operations
   - Show skeleton screens for complex layouts

2. **Handle errors gracefully**
   - Use ErrorState component
   - Provide retry options
   - Show helpful error messages

3. **Support empty states**
   - Use EmptyState component
   - Provide guidance on next steps

4. **Mobile responsiveness**
   - Cards should work on all screen sizes
   - Test in HubSpot mobile app

### Security

1. **Never expose secrets**
   - Use serverless functions for API calls
   - Store secrets in app configuration

2. **Validate inputs**
   - Sanitize user inputs
   - Validate before serverless calls

3. **Request minimum scopes**
   - Only request needed OAuth scopes
   - Document why each scope is needed

## Debugging

### Local Development

```bash
# Start dev server with verbose logging
hs project dev --debug

# View console in browser DevTools
# Filter for "HubSpot" or your extension name
```

### Common Issues

**Card not rendering:**
- Check card.json syntax
- Verify file paths are correct
- Check browser console for errors

**Data not loading:**
- Verify serverless function exists
- Check function name matches
- Review serverless function logs

**Styling issues:**
- Use HubSpot UI components when possible
- Check component props for styling options
- Avoid custom CSS that conflicts with HubSpot

## Context7 Integration

Before generating card code, verify current patterns:

```
use context7 @hubspot/ui-extensions@latest
```

This ensures:
- Current component APIs
- Latest available components
- Correct prop types
