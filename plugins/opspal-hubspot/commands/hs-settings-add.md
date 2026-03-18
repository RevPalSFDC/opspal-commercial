---
name: hs-settings-add
description: Add a settings component to an existing HubSpot app project
argument-hint: "[--name <component-name>]"
arguments:
  - name: name
    description: Settings page name (optional - defaults to 'settings')
    required: false
---

# /hs-settings-add - Add HubSpot Settings Component

Interactive wizard to add a settings page to an existing HubSpot app project.

## Usage

```bash
/hs-settings-add                    # Interactive mode
/hs-settings-add --name app-config  # With custom name
```

## Prerequisites

- Existing HubSpot app project
- HubSpot CLI installed and authenticated

## Workflow

### Step 1: Verify Project

Check for valid HubSpot app project:
- `app.json` exists
- `src/app/settings/` directory exists (or create it)

### Step 2: Gather Information

Ask the user:
1. **Settings name** - Identifier (default: "settings")
2. **Settings sections** - What to configure (connection, sync, notifications, etc.)
3. **Storage method** - How to persist (custom object, external API)

### Step 3: Create Settings Files

Create directory: `src/app/settings/`

**settings-hsmeta.json:**

```json
{
  "type": "settings",
  "entrypoint": "/app/settings/Settings.tsx"
}
```

**Settings.tsx:**

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

interface Settings {
  // Connection
  apiKey: string;
  apiEndpoint: string;
  // Sync
  syncEnabled: boolean;
  syncFrequency: string;
  // Notifications
  emailNotifications: boolean;
  slackWebhook: string;
}

const defaultSettings: Settings = {
  apiKey: '',
  apiEndpoint: '',
  syncEnabled: false,
  syncFrequency: 'daily',
  emailNotifications: true,
  slackWebhook: ''
};

interface SettingsPageProps {
  runServerlessFunction: (name: string, params?: any) => Promise<any>;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ runServerlessFunction }) => {
  const [activeTab, setActiveTab] = useState('connection');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await runServerlessFunction('getSettings');
      if (result.response) {
        setSettings(prev => ({ ...prev, ...result.response }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await runServerlessFunction('saveSettings', { settings });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      setMessage({ type: 'danger', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof Settings, value: any) => {
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
        <Alert variant={message.type}>
          {message.text}
        </Alert>
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
            <Flex direction="column" gap="medium">
              <Input
                label="API Key"
                name="apiKey"
                type="password"
                value={settings.apiKey}
                onChange={(value) => handleChange('apiKey', value)}
                placeholder="Enter your API key"
                description="Your API key for authentication"
                required
              />
              <Input
                label="API Endpoint"
                name="apiEndpoint"
                value={settings.apiEndpoint}
                onChange={(value) => handleChange('apiEndpoint', value)}
                placeholder="https://api.example.com"
                description="The base URL for API requests"
              />
            </Flex>
          </PanelBody>
        </Panel>
      </TabPanel>

      <TabPanel id="sync" isSelected={activeTab === 'sync'}>
        <Panel title="Synchronization Settings">
          <PanelBody>
            <Flex direction="column" gap="medium">
              <Toggle
                label="Enable Sync"
                name="syncEnabled"
                checked={settings.syncEnabled}
                onChange={(value) => handleChange('syncEnabled', value)}
                description="Automatically sync data with external service"
              />
              {settings.syncEnabled && (
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
                  description="How often to synchronize data"
                />
              )}
            </Flex>
          </PanelBody>
        </Panel>
      </TabPanel>

      <TabPanel id="notifications" isSelected={activeTab === 'notifications'}>
        <Panel title="Notification Preferences">
          <PanelBody>
            <Flex direction="column" gap="medium">
              <Toggle
                label="Email Notifications"
                name="emailNotifications"
                checked={settings.emailNotifications}
                onChange={(value) => handleChange('emailNotifications', value)}
                description="Receive email notifications for important events"
              />
              <Input
                label="Slack Webhook URL"
                name="slackWebhook"
                value={settings.slackWebhook}
                onChange={(value) => handleChange('slackWebhook', value)}
                placeholder="https://hooks.slack.com/services/..."
                description="Optional: Send notifications to Slack"
              />
            </Flex>
          </PanelBody>
        </Panel>
      </TabPanel>

      <Divider />

      <Flex justify="end">
        <Button
          onClick={saveSettings}
          variant="primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </Flex>
    </Flex>
  );
};

export default SettingsPage;
```

### Step 4: Create Serverless Functions

**src/functions/getSettings.js:**

```javascript
exports.main = async (context = {}) => {
  const { client } = context;

  try {
    // Search for existing settings
    const results = await client.crm.objects.searchApi.doSearch(
      'app_settings',
      {
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
        limit: 1
      }
    );

    if (results.results.length === 0) {
      // Return defaults
      return {
        statusCode: 200,
        body: {
          apiKey: '',
          apiEndpoint: '',
          syncEnabled: false,
          syncFrequency: 'daily',
          emailNotifications: true,
          slackWebhook: ''
        }
      };
    }

    const settings = JSON.parse(results.results[0].properties.config_json || '{}');

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

**src/functions/saveSettings.js:**

```javascript
exports.main = async (context = {}) => {
  const { settings } = context.parameters;
  const { client } = context;

  try {
    // Check for existing settings
    const existing = await client.crm.objects.searchApi.doSearch(
      'app_settings',
      { limit: 1 }
    );

    const configJson = JSON.stringify(settings);

    if (existing.results.length > 0) {
      // Update existing
      await client.crm.objects.basicApi.update(
        'app_settings',
        existing.results[0].id,
        { properties: { config_json: configJson } }
      );
    } else {
      // Create new
      await client.crm.objects.basicApi.create('app_settings', {
        properties: { config_json: configJson }
      });
    }

    return {
      statusCode: 200,
      body: { success: true }
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

### Step 5: Update app.json

Add settings to extensions:

```json
{
  "extensions": {
    "settings": {
      "file": "src/app/settings/settings-hsmeta.json"
    }
  }
}
```

### Step 6: Provide Next Steps

```
✅ Settings component added

Files created:
- src/app/settings/settings-hsmeta.json
- src/app/settings/Settings.tsx
- src/functions/getSettings.js
- src/functions/saveSettings.js

Next steps:
1. Customize Settings.tsx with your configuration options
2. Update serverless functions for your storage needs
3. hs project dev    # Test locally
4. hs project upload # Deploy

Access settings:
Settings > Integrations > Connected Apps > Your App > Settings

Documentation:
- skills/hubspot-developer-platform/settings-components.md
```

## Customization Options

### Simple Settings (Single Panel)

For apps with few settings, use a single panel:

```tsx
<Panel title="Configuration">
  <PanelBody>
    <Input label="API Key" ... />
    <Toggle label="Enabled" ... />
  </PanelBody>
</Panel>
<Button onClick={saveSettings}>Save</Button>
```

### Complex Settings (Accordion)

For many settings, use accordion:

```tsx
<Accordion>
  <AccordionItem title="Connection" defaultOpen>
    {/* Connection settings */}
  </AccordionItem>
  <AccordionItem title="Advanced">
    {/* Advanced settings */}
  </AccordionItem>
</Accordion>
```

## Error Handling

- **Not in project**: "Run this command from a HubSpot app project directory"
- **Settings exists**: "Settings already exist. Edit src/app/settings/Settings.tsx directly."
- **Missing custom object**: "Create 'app_settings' custom object or use alternative storage"
