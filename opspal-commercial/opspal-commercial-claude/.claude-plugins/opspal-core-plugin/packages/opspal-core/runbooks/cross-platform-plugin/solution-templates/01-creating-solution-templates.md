# Creating Solution Templates

This runbook guides you through creating reusable solution templates for the Solution Template System.

## Overview

Solution templates package multiple platform components (Salesforce, HubSpot, n8n) into deployable, parameterized solutions. Templates enable consistent deployments across environments and clients.

## Prerequisites

- Access to source implementation (org, portal, or local files)
- Understanding of components to templatize
- Write access to `solutions/templates/` directory

## Quick Start

### 1. Create Solution Directory

```bash
# Create solution structure
mkdir -p solutions/templates/my-solution/components/{flows,fields,permissions}
touch solutions/templates/my-solution/solution.json
```

### 2. Create Manifest

Create `solution.json`:

```json
{
  "name": "my-solution",
  "version": "1.0.0",
  "description": "Brief description of what this solution does",

  "metadata": {
    "author": "Your Name",
    "created": "2025-12-04",
    "updated": "2025-12-04",
    "tags": ["category1", "category2"],
    "complexity": "simple"
  },

  "platforms": {
    "salesforce": {
      "minApiVersion": "62.0",
      "requiredFeatures": ["Flow"]
    }
  },

  "parameters": {},
  "components": [],
  "preDeployChecks": [],
  "postDeployActions": []
}
```

### 3. Add Parameters

Parameters make your solution configurable:

```json
"parameters": {
  "ownerUserId": {
    "type": "userId",
    "description": "User ID for default record owner",
    "required": true
  },
  "enableFeature": {
    "type": "boolean",
    "description": "Enable optional feature X",
    "required": false,
    "default": true
  },
  "threshold": {
    "type": "number",
    "description": "Numeric threshold value (0-100)",
    "required": false,
    "default": 50,
    "validation": {
      "min": 0,
      "max": 100
    }
  }
}
```

### 4. Add Components

Reference template files:

```json
"components": [
  {
    "id": "my-field",
    "type": "salesforce:customField",
    "template": "components/fields/MyObject.MyField__c.field-meta.xml",
    "description": "Custom field description",
    "order": 1,
    "dependsOn": []
  },
  {
    "id": "my-flow",
    "type": "salesforce:flow",
    "template": "components/flows/My_Flow.flow-meta.xml",
    "description": "Flow description",
    "order": 2,
    "dependsOn": ["my-field"]
  }
]
```

### 5. Create Template Files

Create component templates with parameters:

```xml
<!-- components/fields/MyObject.MyField__c.field-meta.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>MyField__c</fullName>
    <label>My Field</label>
    <type>Number</type>
    <defaultValue>{{threshold}}</defaultValue>
    <inlineHelpText>Threshold is {{threshold}}</inlineHelpText>
</CustomField>
```

---

## Template Syntax Reference

### Variables

```handlebars
{{variableName}}          <!-- Simple parameter -->
{{object.property}}       <!-- Nested access -->
{{env.ENV_VAR_NAME}}      <!-- Environment variable -->
```

### Conditionals

```handlebars
{{#if enableFeature}}
  <!-- Content when true -->
{{else}}
  <!-- Content when false -->
{{/if}}

{{#unless disableFeature}}
  <!-- Content when false -->
{{/unless}}
```

### Loops

```handlebars
{{#each items}}
  {{@index}}: {{this.name}}
{{/each}}
```

### Helpers

```handlebars
{{eq value1 value2}}          <!-- Equality check -->
{{default value "fallback"}}  <!-- Default value -->
{{upper text}}                <!-- Uppercase -->
{{lower text}}                <!-- Lowercase -->
{{json object}}               <!-- JSON stringify -->
{{fieldRef "Object" "Field"}} <!-- Field mapping -->
```

### Platform Pass-Through

Preserve platform expressions:

```handlebars
{{sf:$Record.Field__c}}       <!-- Salesforce formula -->
{{sf:$User.Id}}               <!-- Salesforce user -->
{{n8n:$json.fieldName}}       <!-- n8n expression -->
{{hs:contact.email}}          <!-- HubSpot property -->
```

---

## Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text value | `"Default Text"` |
| `number` | Numeric value | `50` |
| `boolean` | True/false | `true` |
| `array` | List of values | `["a", "b"]` |
| `object` | Complex object | `{"key": "value"}` |
| `userId` | Salesforce User ID | `"005..."` |
| `queueId` | Salesforce Queue ID | `"00G..."` |
| `profileId` | Salesforce Profile ID | `"00e..."` |
| `recordTypeId` | Record Type ID | `"012..."` |
| `fieldReference` | Field API name | `"Account.Name"` |
| `picklistValue` | Picklist option | `"Active"` |

---

## Component Types

### Salesforce
- `salesforce:flow`
- `salesforce:customField`
- `salesforce:validationRule`
- `salesforce:permissionSet`
- `salesforce:profile`
- `salesforce:layout`
- `salesforce:apexClass`
- `salesforce:apexTrigger`
- `salesforce:lightningComponentBundle`

### HubSpot
- `hubspot:workflow`
- `hubspot:property`
- `hubspot:form`
- `hubspot:emailTemplate`
- `hubspot:list`

### n8n
- `n8n:workflow`
- `n8n:credential`

---

## Validation

### Validate Your Solution

```bash
/solution-validate ./solutions/templates/my-solution
```

### Common Validation Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `missing_required_field` | Required field not in manifest | Add field to manifest |
| `invalid_parameter_type` | Unsupported parameter type | Use valid type |
| `template_not_found` | Template file doesn't exist | Create file or fix path |
| `circular_dependency` | Components depend on each other | Remove circular reference |
| `invalid_template_syntax` | Handlebars syntax error | Fix template syntax |

---

## Best Practices

### DO
- Use descriptive parameter names
- Provide sensible defaults for optional params
- Document each parameter with description
- Set correct dependency order
- Include pre-deploy checks for critical requirements
- Test in sandbox before production

### DON'T
- Hardcode IDs (use parameters)
- Include credentials in templates
- Create overly complex solutions (split if needed)
- Skip validation before deployment
- Forget to document your solution

---

## Example: Complete Solution

See `solutions/templates/lead-management/` for a complete example including:
- Solution manifest with parameters
- Custom field templates
- Flow template with conditionals
- Permission set template
- Pre-deploy and post-deploy actions

---

## Deployment

Once your template is ready:

```bash
# Validate
/solution-validate ./solutions/templates/my-solution

# Deploy to sandbox
/solution-deploy my-solution --env development

# Deploy to production
/solution-deploy my-solution --env production \
  --param ownerUserId=005xxx \
  --param threshold=75
```

---

## Related Resources

- [Parameter Design Guide](02-parameter-design-guide.md)
- [Environment Profile Management](03-environment-profile-management.md)
- [Deployment Strategies](04-deployment-strategies.md)
- [Troubleshooting Guide](05-troubleshooting-guide.md)
