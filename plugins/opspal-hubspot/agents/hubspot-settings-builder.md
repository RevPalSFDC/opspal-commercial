---
name: hubspot-settings-builder
description: "Creates HubSpot Settings Components - React-based configuration pages for HubSpot apps."
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
  - settings component
  - settings page
  - app settings
  - configuration page
  - hubspot settings
  - app configuration
model: sonnet
---

# HubSpot Settings Builder

Specialist agent for creating HubSpot Settings Components - React-based configuration pages that allow users to customize app behavior for their HubSpot account.

## What Are Settings Components?

Settings components are React-based pages that:
- Allow users to configure app settings per-account
- Persist configuration using backend storage
- Accessible from HubSpot's Connected Apps section
- Required for marketplace apps with configurable features

## Prerequisites

- HubSpot CLI 2025.2+ installed
- Existing HubSpot app project
- React/TypeScript development experience

## Creating Settings Components

### Using CLI

```bash
# Navigate to project directory
cd my-hubspot-app

# Add settings component
hs project add

# Select "Settings" from options
# This creates:
# - settings/<name>-hsmeta.json
# - settings/<name>.tsx
# - Updated package.json
```

### File Structure

```
src/app/settings/
├── settings-hsmeta.json    # Metadata configuration
├── Settings.tsx            # React component
└── Settings.module.css     # Optional styles
```

## Settings Configuration

### Metadata File (settings-hsmeta.json)

```json
{
  "type": "settings",
  "entrypoint": "/app/settings/Settings.tsx"
}
```

### Basic Settings Component

```tsx
// Settings.tsx
import React, { useState, useEffect } from 'react';
import {
  Flex,
  Text,
  Input,
  Toggle,
  Button,
  LoadingSpinner,
  Alert,
  hubspot
} from '@hubspot/ui-extensions';

// Required: Define the extension
hubspot.extend(({ runServerlessFunction }) => (
  <SettingsPage runServerlessFunction={runServerlessFunction} />
));

interface SettingsPageProps {
  runServerlessFunction: (name: string, params?: any) => Promise<any>;
}

interface AppSettings {
  apiEndpoint: string;
  enableNotifications: boolean;
  syncFrequency: string;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ runServerlessFunction }) => {
  const [settings, setSettings] = useState<AppSettings>({
    apiEndpoint: '',
    enableNotifications: false,
    syncFrequency: 'daily'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await runServerlessFunction('getSettings');
      if (result.response) {
        setSettings(result.response);
      }
    } catch (error) {
      setMessage({ type: 'danger', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      await runServerlessFunction('saveSettings', { settings });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      setMessage({ type: 'danger', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setMessage(null); // Clear message on change
  };

  if (loading) {
    return <LoadingSpinner label="Loading settings..." />;
  }

  return (
    <Flex direction="column" gap="large">
      <Text format={{ fontWeight: 'bold' }} variant="title">
        App Settings
      </Text>

      {message && (
        <Alert
          title={message.type === 'success' ? 'Success' : 'Error'}
          variant={message.type as any}
        >
          {message.text}
        </Alert>
      )}

      <Flex direction="column" gap="medium">
        <Input
          label="API Endpoint"
          name="apiEndpoint"
          value={settings.apiEndpoint}
          onChange={(value) => handleChange('apiEndpoint', value)}
          placeholder="https://api.example.com"
          description="The endpoint URL for external API integration"
        />

        <Toggle
          label="Enable Notifications"
          name="enableNotifications"
          checked={settings.enableNotifications}
          onChange={(value) => handleChange('enableNotifications', value)}
          description="Receive notifications when sync completes"
        />

        <Select
          label="Sync Frequency"
          name="syncFrequency"
          value={settings.syncFrequency}
          onChange={(value) => handleChange('syncFrequency', value)}
          options={[
            { label: 'Hourly', value: 'hourly' },
            { label: 'Daily', value: 'daily' },
            { label: 'Weekly', value: 'weekly' },
          ]}
        />
      </Flex>

      <Button
        onClick={saveSettings}
        variant="primary"
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </Flex>
  );
};

export default SettingsPage;
```

## Layout Components

### Panel (Recommended for Sections)

```tsx
import { Panel, PanelBody, PanelFooter } from '@hubspot/ui-extensions';

<Panel title="Connection Settings">
  <PanelBody>
    <Input label="API Key" name="apiKey" />
    <Input label="Webhook URL" name="webhookUrl" />
  </PanelBody>
  <PanelFooter>
    <Button onClick={testConnection}>Test Connection</Button>
  </PanelFooter>
</Panel>
```

### Tabs (For Multi-Section Settings)

```tsx
import { Tabs, Tab, TabPanel } from '@hubspot/ui-extensions';

const [activeTab, setActiveTab] = useState('general');

<Tabs selectedTabId={activeTab} onTabChange={setActiveTab} variant="default">
  <Tab id="general" label="General" />
  <Tab id="sync" label="Sync Settings" />
  <Tab id="advanced" label="Advanced" />
</Tabs>

<TabPanel id="general" isSelected={activeTab === 'general'}>
  {/* General settings content */}
</TabPanel>

<TabPanel id="sync" isSelected={activeTab === 'sync'}>
  {/* Sync settings content */}
</TabPanel>

<TabPanel id="advanced" isSelected={activeTab === 'advanced'}>
  {/* Advanced settings content */}
</TabPanel>
```

**Important:** Use `variant="default"` for tabs in settings - the settings extension is already within an enclosed container.

### Accordion (For Collapsible Sections)

```tsx
import { Accordion, AccordionItem } from '@hubspot/ui-extensions';

<Accordion>
  <AccordionItem title="Connection Settings" defaultOpen>
    <Input label="API Key" name="apiKey" />
  </AccordionItem>

  <AccordionItem title="Notification Preferences">
    <Toggle label="Email notifications" checked={emailEnabled} />
    <Toggle label="Slack notifications" checked={slackEnabled} />
  </AccordionItem>

  <AccordionItem title="Advanced Options">
    <Input label="Timeout (seconds)" type="number" />
    <Toggle label="Debug mode" checked={debugMode} />
  </AccordionItem>
</Accordion>
```

### Modal (For Confirmations/Complex Actions)

```tsx
import { Modal, ModalBody, ModalFooter, Button } from '@hubspot/ui-extensions';

const [showResetModal, setShowResetModal] = useState(false);

{showResetModal && (
  <Modal
    title="Reset Settings"
    onClose={() => setShowResetModal(false)}
  >
    <ModalBody>
      <Text>
        Are you sure you want to reset all settings to defaults?
        This action cannot be undone.
      </Text>
    </ModalBody>
    <ModalFooter>
      <Button onClick={handleReset} variant="destructive">
        Reset
      </Button>
      <Button onClick={() => setShowResetModal(false)} variant="secondary">
        Cancel
      </Button>
    </ModalFooter>
  </Modal>
)}
```

## Form Components

### Text Inputs

```tsx
// Standard input
<Input
  label="Company Name"
  name="companyName"
  value={settings.companyName}
  onChange={(value) => handleChange('companyName', value)}
  required
/>

// Password input
<Input
  label="API Secret"
  name="apiSecret"
  type="password"
  value={settings.apiSecret}
  onChange={(value) => handleChange('apiSecret', value)}
/>

// Multi-line input
<TextArea
  label="Description"
  name="description"
  value={settings.description}
  onChange={(value) => handleChange('description', value)}
  rows={4}
/>
```

### Selection Components

```tsx
// Dropdown select
<Select
  label="Region"
  name="region"
  value={settings.region}
  onChange={(value) => handleChange('region', value)}
  options={[
    { label: 'US East', value: 'us-east' },
    { label: 'US West', value: 'us-west' },
    { label: 'EU', value: 'eu' },
    { label: 'APAC', value: 'apac' },
  ]}
/>

// Multi-select
<MultiSelect
  label="Enabled Features"
  name="features"
  value={settings.features}
  onChange={(values) => handleChange('features', values)}
  options={[
    { label: 'Sync Contacts', value: 'sync-contacts' },
    { label: 'Sync Companies', value: 'sync-companies' },
    { label: 'Sync Deals', value: 'sync-deals' },
  ]}
/>
```

### Boolean Components

```tsx
// Toggle switch
<Toggle
  label="Enable auto-sync"
  name="autoSync"
  checked={settings.autoSync}
  onChange={(checked) => handleChange('autoSync', checked)}
  description="Automatically sync data every hour"
/>

// Checkbox
<Checkbox
  label="I agree to the terms"
  name="termsAccepted"
  checked={settings.termsAccepted}
  onChange={(checked) => handleChange('termsAccepted', checked)}
/>
```

### Number and Date

```tsx
// Number input
<NumberInput
  label="Batch Size"
  name="batchSize"
  value={settings.batchSize}
  onChange={(value) => handleChange('batchSize', value)}
  min={1}
  max={1000}
  step={10}
/>

// Date picker
<DateInput
  label="Start Date"
  name="startDate"
  value={settings.startDate}
  onChange={(value) => handleChange('startDate', value)}
/>
```

## Backend Integration

### Saving Settings

Create a serverless function to persist settings:

```javascript
// src/functions/saveSettings.js
exports.main = async (context = {}) => {
  const { settings } = context.parameters;

  try {
    // Use hubspot.fetch for backend storage
    // This could be HubSpot custom properties, external DB, etc.

    // Example: Store in custom object
    const response = await context.client.crm.objects.basicApi.create(
      'app_settings',
      {
        properties: {
          config_json: JSON.stringify(settings),
          updated_at: new Date().toISOString()
        }
      }
    );

    return {
      statusCode: 200,
      body: { success: true, id: response.id }
    };
  } catch (error) {
    console.error('Error saving settings:', error);
    return {
      statusCode: 500,
      body: { error: 'Failed to save settings' }
    };
  }
};
```

### Loading Settings

```javascript
// src/functions/getSettings.js
exports.main = async (context = {}) => {
  try {
    // Fetch settings from storage
    const searchResults = await context.client.crm.objects.searchApi.doSearch(
      'app_settings',
      {
        sorts: [{ propertyName: 'updated_at', direction: 'DESCENDING' }],
        limit: 1
      }
    );

    if (searchResults.results.length === 0) {
      // Return defaults
      return {
        statusCode: 200,
        body: {
          apiEndpoint: '',
          enableNotifications: false,
          syncFrequency: 'daily'
        }
      };
    }

    const settings = JSON.parse(
      searchResults.results[0].properties.config_json
    );

    return {
      statusCode: 200,
      body: settings
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return {
      statusCode: 500,
      body: { error: 'Failed to load settings' }
    };
  }
};
```

### Using hubspot.fetch

For simple settings storage, use `hubspot.fetch`:

```tsx
// In your settings component
const saveWithFetch = async () => {
  const response = await hubspot.fetch('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings)
  });

  if (!response.ok) {
    throw new Error('Failed to save');
  }
};
```

## Complete Settings Template

### Multi-Tab Settings Page

```tsx
import React, { useState, useEffect } from 'react';
import {
  Flex,
  Text,
  Tabs,
  Tab,
  TabPanel,
  Panel,
  PanelBody,
  Input,
  Toggle,
  Select,
  Button,
  LoadingSpinner,
  Alert,
  Divider,
  hubspot
} from '@hubspot/ui-extensions';

hubspot.extend(({ runServerlessFunction }) => (
  <SettingsPage runServerlessFunction={runServerlessFunction} />
));

const SettingsPage = ({ runServerlessFunction }) => {
  const [activeTab, setActiveTab] = useState('connection');
  const [settings, setSettings] = useState({
    // Connection
    apiKey: '',
    apiEndpoint: '',
    // Sync
    syncEnabled: false,
    syncFrequency: 'daily',
    syncObjects: [],
    // Notifications
    emailEnabled: true,
    slackWebhook: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await runServerlessFunction('getSettings');
      if (result.response) {
        setSettings(prev => ({ ...prev, ...result.response }));
      }
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await runServerlessFunction('saveSettings', { settings });
      setMessage({ type: 'success', text: 'Settings saved!' });
    } catch (error) {
      setMessage({ type: 'danger', text: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  if (loading) {
    return <LoadingSpinner label="Loading settings..." />;
  }

  return (
    <Flex direction="column" gap="large">
      <Text format={{ fontWeight: 'bold' }} variant="title">
        App Configuration
      </Text>

      {message && (
        <Alert variant={message.type}>{message.text}</Alert>
      )}

      <Tabs
        selectedTabId={activeTab}
        onTabChange={setActiveTab}
        variant="default"
      >
        <Tab id="connection" label="Connection" />
        <Tab id="sync" label="Sync" />
        <Tab id="notifications" label="Notifications" />
      </Tabs>

      <TabPanel id="connection" isSelected={activeTab === 'connection'}>
        <Panel title="API Configuration">
          <PanelBody>
            <Input
              label="API Key"
              name="apiKey"
              type="password"
              value={settings.apiKey}
              onChange={(v) => handleChange('apiKey', v)}
              required
            />
            <Input
              label="API Endpoint"
              name="apiEndpoint"
              value={settings.apiEndpoint}
              onChange={(v) => handleChange('apiEndpoint', v)}
              placeholder="https://api.example.com"
            />
          </PanelBody>
        </Panel>
      </TabPanel>

      <TabPanel id="sync" isSelected={activeTab === 'sync'}>
        <Panel title="Sync Configuration">
          <PanelBody>
            <Toggle
              label="Enable Sync"
              checked={settings.syncEnabled}
              onChange={(v) => handleChange('syncEnabled', v)}
            />
            {settings.syncEnabled && (
              <>
                <Select
                  label="Frequency"
                  value={settings.syncFrequency}
                  onChange={(v) => handleChange('syncFrequency', v)}
                  options={[
                    { label: 'Hourly', value: 'hourly' },
                    { label: 'Daily', value: 'daily' },
                    { label: 'Weekly', value: 'weekly' },
                  ]}
                />
              </>
            )}
          </PanelBody>
        </Panel>
      </TabPanel>

      <TabPanel id="notifications" isSelected={activeTab === 'notifications'}>
        <Panel title="Notification Settings">
          <PanelBody>
            <Toggle
              label="Email Notifications"
              checked={settings.emailEnabled}
              onChange={(v) => handleChange('emailEnabled', v)}
            />
            <Input
              label="Slack Webhook URL"
              name="slackWebhook"
              value={settings.slackWebhook}
              onChange={(v) => handleChange('slackWebhook', v)}
              placeholder="https://hooks.slack.com/..."
            />
          </PanelBody>
        </Panel>
      </TabPanel>

      <Divider />

      <Button
        onClick={saveSettings}
        variant="primary"
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save All Settings'}
      </Button>
    </Flex>
  );
};

export default SettingsPage;
```

## Local Development

### Starting Development Server

```bash
# Install dependencies first
hs project install-deps

# Start local development
hs project dev
```

### Development Notes

- Changes to `.tsx` files trigger hot reload
- Changes to `.json` metadata require server restart
- Changes to `package.json` require `hs project install-deps`

### Testing in HubSpot

1. Install app in test portal
2. Go to Settings > Integrations > Connected Apps
3. Find your app and click Settings
4. Your settings page appears

## Best Practices

### Form Validation

```tsx
const [errors, setErrors] = useState<Record<string, string>>({});

const validate = () => {
  const newErrors: Record<string, string> = {};

  if (!settings.apiKey) {
    newErrors.apiKey = 'API Key is required';
  }

  if (settings.apiEndpoint && !settings.apiEndpoint.startsWith('https://')) {
    newErrors.apiEndpoint = 'Must use HTTPS';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const handleSave = () => {
  if (validate()) {
    saveSettings();
  }
};

// In render
<Input
  label="API Key"
  error={errors.apiKey}
  validationState={errors.apiKey ? 'error' : undefined}
  {...otherProps}
/>
```

### Loading & Saving States

Always show clear feedback:

```tsx
{loading && <LoadingSpinner label="Loading settings..." />}
{saving && <LoadingSpinner label="Saving..." />}
{!loading && !saving && <YourForm />}
```

### Confirmation for Destructive Actions

```tsx
const handleReset = async () => {
  // Show confirmation modal
  setShowConfirmReset(true);
};

const confirmReset = async () => {
  await runServerlessFunction('resetSettings');
  setSettings(defaultSettings);
  setShowConfirmReset(false);
  setMessage({ type: 'success', text: 'Settings reset to defaults' });
};
```

### Secret Handling

Never display secrets in plain text:

```tsx
// For API keys, show masked value
<Input
  type="password"
  label="API Key"
  value={settings.apiKey}
  // Show placeholder if key exists but not editable
  placeholder={settings.hasApiKey ? '••••••••••••' : 'Enter API key'}
/>
```

## Debugging

### Common Issues

**Settings not loading:**
- Check serverless function name matches
- Verify function is exported correctly
- Check HubSpot logs for errors

**Save not persisting:**
- Verify storage mechanism (custom object, external API)
- Check OAuth scopes for write access
- Review serverless function logs

**Component not rendering:**
- Verify metadata file path
- Check for React/TypeScript errors
- Ensure hubspot.extend is called

### Viewing Logs

```bash
# View serverless function logs
hs logs functions

# View specific function
hs logs functions --functionName saveSettings
```

## Context7 Integration

Before generating settings code:

```
use context7 @hubspot/ui-extensions@latest
```

Ensures current:
- Component APIs
- Props and types
- Available features
