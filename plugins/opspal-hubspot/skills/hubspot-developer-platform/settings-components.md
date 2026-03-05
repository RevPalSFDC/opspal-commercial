# HubSpot Settings Components Guide

Complete reference for building Settings Components - React-based configuration pages for HubSpot apps.

## Overview

Settings components allow app users to:
- Configure app behavior per-account
- Persist settings to backend storage
- Access settings from Connected Apps section
- Required for marketplace apps with configurable options

## Creating Settings

### Using CLI

```bash
# In project directory
hs project add

# Select "Settings" option
# Generates:
# - settings/<name>-hsmeta.json
# - settings/<name>.tsx
```

### File Structure

```
src/app/settings/
├── settings-hsmeta.json    # Metadata
└── Settings.tsx            # React component
```

### Metadata (settings-hsmeta.json)

```json
{
  "type": "settings",
  "entrypoint": "/app/settings/Settings.tsx"
}
```

## Basic Settings Template

```tsx
import React, { useState, useEffect } from 'react';
import {
  Flex,
  Text,
  Input,
  Toggle,
  Select,
  Button,
  LoadingSpinner,
  Alert,
  hubspot
} from '@hubspot/ui-extensions';

hubspot.extend(({ runServerlessFunction }) => (
  <SettingsPage runServerlessFunction={runServerlessFunction} />
));

const SettingsPage = ({ runServerlessFunction }) => {
  const [settings, setSettings] = useState({
    apiKey: '',
    enabled: false,
    frequency: 'daily'
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
      if (result.response) setSettings(result.response);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await runServerlessFunction('saveSettings', { settings });
      setMessage({ type: 'success', text: 'Settings saved!' });
    } catch (e) {
      setMessage({ type: 'danger', text: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  if (loading) return <LoadingSpinner label="Loading..." />;

  return (
    <Flex direction="column" gap="large">
      <Text format={{ fontWeight: 'bold' }} variant="title">
        Settings
      </Text>

      {message && <Alert variant={message.type}>{message.text}</Alert>}

      <Input
        label="API Key"
        type="password"
        value={settings.apiKey}
        onChange={v => handleChange('apiKey', v)}
      />

      <Toggle
        label="Enable feature"
        checked={settings.enabled}
        onChange={v => handleChange('enabled', v)}
      />

      <Select
        label="Frequency"
        value={settings.frequency}
        onChange={v => handleChange('frequency', v)}
        options={[
          { label: 'Hourly', value: 'hourly' },
          { label: 'Daily', value: 'daily' },
          { label: 'Weekly', value: 'weekly' }
        ]}
      />

      <Button onClick={saveSettings} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </Flex>
  );
};

export default SettingsPage;
```

## Layout Components

### Panel (Sections)

```tsx
import { Panel, PanelBody, PanelFooter } from '@hubspot/ui-extensions';

<Panel title="Connection Settings">
  <PanelBody>
    <Input label="Endpoint" {...props} />
    <Input label="API Key" type="password" {...props} />
  </PanelBody>
  <PanelFooter>
    <Button onClick={testConnection}>Test</Button>
  </PanelFooter>
</Panel>
```

### Tabs (Multi-Section)

```tsx
import { Tabs, Tab, TabPanel } from '@hubspot/ui-extensions';

const [activeTab, setActiveTab] = useState('general');

<Tabs selectedTabId={activeTab} onTabChange={setActiveTab} variant="default">
  <Tab id="general" label="General" />
  <Tab id="sync" label="Sync" />
  <Tab id="advanced" label="Advanced" />
</Tabs>

<TabPanel id="general" isSelected={activeTab === 'general'}>
  {/* General settings */}
</TabPanel>
```

**Important:** Use `variant="default"` for tabs - settings is already in an enclosed container.

### Accordion (Collapsible)

```tsx
import { Accordion, AccordionItem } from '@hubspot/ui-extensions';

<Accordion>
  <AccordionItem title="Basic Settings" defaultOpen>
    <Input label="Name" {...props} />
  </AccordionItem>
  <AccordionItem title="Advanced">
    <Toggle label="Debug mode" {...props} />
  </AccordionItem>
</Accordion>
```

### Modal (Confirmations)

```tsx
import { Modal, ModalBody, ModalFooter } from '@hubspot/ui-extensions';

{showModal && (
  <Modal title="Confirm Reset" onClose={() => setShowModal(false)}>
    <ModalBody>
      <Text>Reset all settings to defaults?</Text>
    </ModalBody>
    <ModalFooter>
      <Button variant="destructive" onClick={handleReset}>Reset</Button>
      <Button variant="secondary" onClick={() => setShowModal(false)}>
        Cancel
      </Button>
    </ModalFooter>
  </Modal>
)}
```

## Form Components

### Text Inputs

```tsx
// Standard
<Input
  label="Name"
  value={value}
  onChange={setValue}
  required
/>

// Password
<Input
  label="Secret"
  type="password"
  value={value}
  onChange={setValue}
/>

// With validation
<Input
  label="URL"
  value={value}
  onChange={setValue}
  error={error}
  validationState={error ? 'error' : undefined}
/>

// Multi-line
<TextArea
  label="Description"
  value={value}
  onChange={setValue}
  rows={4}
/>
```

### Selection

```tsx
// Dropdown
<Select
  label="Region"
  value={region}
  onChange={setRegion}
  options={[
    { label: 'US', value: 'us' },
    { label: 'EU', value: 'eu' }
  ]}
/>

// Multi-select
<MultiSelect
  label="Features"
  value={features}
  onChange={setFeatures}
  options={[
    { label: 'Feature A', value: 'a' },
    { label: 'Feature B', value: 'b' }
  ]}
/>
```

### Boolean

```tsx
// Toggle
<Toggle
  label="Enable"
  checked={enabled}
  onChange={setEnabled}
  description="Turn on this feature"
/>

// Checkbox
<Checkbox
  label="I agree"
  checked={agreed}
  onChange={setAgreed}
/>
```

### Numbers and Dates

```tsx
// Number
<NumberInput
  label="Limit"
  value={limit}
  onChange={setLimit}
  min={1}
  max={100}
/>

// Date
<DateInput
  label="Start Date"
  value={startDate}
  onChange={setStartDate}
/>
```

## Backend Integration

### Save Settings Function

```javascript
// src/functions/saveSettings.js
exports.main = async (context = {}) => {
  const { settings } = context.parameters;

  try {
    // Store in custom object, external API, etc.
    await context.client.crm.objects.basicApi.create(
      'app_settings',
      {
        properties: {
          config_json: JSON.stringify(settings),
          updated_at: new Date().toISOString()
        }
      }
    );

    return { statusCode: 200, body: { success: true } };
  } catch (error) {
    return { statusCode: 500, body: { error: error.message } };
  }
};
```

### Load Settings Function

```javascript
// src/functions/getSettings.js
exports.main = async (context = {}) => {
  try {
    const results = await context.client.crm.objects.searchApi.doSearch(
      'app_settings',
      {
        sorts: [{ propertyName: 'updated_at', direction: 'DESCENDING' }],
        limit: 1
      }
    );

    if (results.results.length === 0) {
      return {
        statusCode: 200,
        body: { apiKey: '', enabled: false, frequency: 'daily' }
      };
    }

    return {
      statusCode: 200,
      body: JSON.parse(results.results[0].properties.config_json)
    };
  } catch (error) {
    return { statusCode: 500, body: { error: error.message } };
  }
};
```

## Validation Patterns

### Form Validation

```tsx
const [errors, setErrors] = useState({});

const validate = () => {
  const newErrors = {};

  if (!settings.apiKey) {
    newErrors.apiKey = 'Required';
  }

  if (settings.endpoint && !settings.endpoint.startsWith('https://')) {
    newErrors.endpoint = 'Must use HTTPS';
  }

  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

const handleSave = () => {
  if (validate()) {
    saveSettings();
  }
};
```

### Field-Level Validation

```tsx
<Input
  label="API Key"
  value={settings.apiKey}
  onChange={v => handleChange('apiKey', v)}
  error={errors.apiKey}
  validationState={errors.apiKey ? 'error' : undefined}
  required
/>
```

## Best Practices

### Organization

1. **Use Panels for sections** - Group related settings
2. **Use Tabs for categories** - Separate distinct areas
3. **Use Accordion for optional** - Hide advanced options

### User Feedback

1. **Show save status** - Loading, success, error states
2. **Validate on save** - Clear error messages
3. **Confirm destructive actions** - Use Modal for resets

### Security

1. **Mask secrets** - Use type="password"
2. **Validate server-side** - Don't trust client validation
3. **Sanitize inputs** - Clean before storing

### Performance

1. **Load once** - Cache settings in state
2. **Debounce saves** - Don't save on every keystroke
3. **Batch changes** - Single save for all settings

## Local Development

```bash
# Install dependencies
hs project install-deps

# Start development
hs project dev

# Changes to .tsx hot reload
# Changes to .json require restart
```

## Testing

1. Install app in test portal
2. Go to Settings > Integrations > Connected Apps
3. Click your app > Settings
4. Verify load/save functionality
