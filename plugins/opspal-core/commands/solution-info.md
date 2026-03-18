---
description: View detailed information about a solution including components and parameters
argument-hint: "<solution-name> [--format text|json|markdown]"
---

# Solution Info Command

View detailed information about a specific solution in the catalog, including components, parameters, and prerequisites.

## Usage

```bash
/solution-info <solution-name> [options]
```

## Arguments

- `<solution-name>` - Name of the solution to view

## Optional Parameters

- `--format <format>` - Output format: text, json, markdown (default: text)
- `--show-templates` - Include template file contents
- `--show-dependencies` - Show dependency graph

## Examples

### View Solution Details
```bash
/solution-info lead-management
```

### JSON Output
```bash
/solution-info lead-management --format json
```

### Include Template Details
```bash
/solution-info lead-management --show-templates
```

### Show Dependency Graph
```bash
/solution-info lead-management --show-dependencies
```

## Output

### Text Format (default)
```
Solution: lead-management (v1.0.0)
────────────────────────────────────────

Description:
  Complete lead management with scoring, routing, and automated assignment

Platforms: Salesforce (API 62.0+)
Complexity: Moderate
Author: RevPal Engineering
Published: 2025-12-04
Downloads: 15

Components (4):
  • lead-score-field (salesforce:customField)
  • lead-priority-field (salesforce:customField)
  • lead-routing-flow (salesforce:flow)
  • lead-manager-permission-set (salesforce:permissionSet)

Parameters (6):
  • scoringThreshold (number) - default: 50
  • defaultOwnerId (userId) - REQUIRED
  • routingQueueId (queueId) - REQUIRED
  • enableScoring (boolean) - default: true
  • highPriorityThreshold (number) - default: 80
  • enableNotifications (boolean) - default: false

Prerequisites:
  • Lead object must exist
  • Default owner user must be active
  • Routing queue should be configured

Installation Status: Not installed
```

### Dependency Graph
```
/solution-info lead-management --show-dependencies

Dependencies:
┌─────────────────────┐
│ lead-score-field    │ (order: 1)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ lead-priority-field │ (order: 2)
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌───────┐   ┌────────────────────┐
│ flow  │   │ permission-set     │
└───────┘   └────────────────────┘
```

### JSON Format
```json
{
  "name": "lead-management",
  "version": "1.0.0",
  "description": "Complete lead management with scoring, routing, and automated assignment",
  "platforms": ["salesforce"],
  "complexity": "moderate",
  "author": "RevPal Engineering",
  "published": "2025-12-04",
  "downloads": 15,
  "components": [
    {
      "id": "lead-score-field",
      "type": "salesforce:customField",
      "template": "components/fields/Lead.Score__c.field-meta.xml",
      "order": 1
    }
  ],
  "parameters": {
    "scoringThreshold": {
      "type": "number",
      "required": false,
      "default": 50
    }
  },
  "preDeployChecks": [
    {
      "name": "verify-lead-object",
      "type": "objectExists",
      "severity": "error"
    }
  ],
  "isInstalled": false
}
```

## Installation Status

The output shows whether the solution is:
- **Not installed** - Solution is in catalog but not downloaded
- **Installed (v1.0.0)** - Solution is installed and up to date
- **Update available (v1.0.0 → v1.1.0)** - Newer version in catalog

## Related Commands

- `/solution-catalog` - Browse the solution catalog
- `/solution-install <name>` - Install the solution locally
- `/solution-deploy` - Deploy an installed solution
- `/solution-validate` - Validate solution structure
