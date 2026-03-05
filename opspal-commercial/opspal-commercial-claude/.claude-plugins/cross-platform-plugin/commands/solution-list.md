---
description: List available solution templates with metadata and status information
argument-hint: "[--platform <name>] [--tag <tag>] [--format table|json|markdown]"
---

# Solution List Command

List available solution templates with metadata and status information.

## Usage

```bash
/solution-list [options]
```

## Optional Parameters

- `--path <directory>` - Custom solutions directory (default: ./solutions/templates)
- `--platform <platform>` - Filter by platform (salesforce, hubspot, n8n)
- `--tag <tag>` - Filter by tag
- `--format <format>` - Output format: table, json, markdown (default: table)
- `--verbose` - Show detailed information

## Examples

### List All Solutions
```bash
/solution-list
```

### Filter by Platform
```bash
/solution-list --platform salesforce
```

### Filter by Tag
```bash
/solution-list --tag lead-management
```

### JSON Output
```bash
/solution-list --format json
```

### Verbose Output
```bash
/solution-list --verbose
```

## Output

### Table Format (default)
```
Available Solutions

Name                  Version  Platforms    Components  Complexity  Tags
─────────────────────────────────────────────────────────────────────────────
lead-management       1.2.0    salesforce   5           moderate    lead, routing
quote-to-cash         2.0.0    salesforce   12          complex     cpq, quote
hubspot-sync          1.0.0    hubspot      3           simple      sync, data
cross-platform-lead   1.1.0    sf, hs       8           moderate    lead, multi

Total: 4 solutions
```

### Verbose Table
```
Available Solutions

┌─────────────────────┬─────────┬────────────┬────────────┬─────────────┐
│ Name                │ Version │ Platforms  │ Components │ Description │
├─────────────────────┼─────────┼────────────┼────────────┼─────────────┤
│ lead-management     │ 1.2.0   │ salesforce │ 5          │ Complete    │
│                     │         │            │            │ lead mgmt   │
│                     │         │            │            │ with        │
│                     │         │            │            │ routing     │
├─────────────────────┼─────────┼────────────┼────────────┼─────────────┤
│ quote-to-cash       │ 2.0.0   │ salesforce │ 12         │ CPQ quote   │
│                     │         │            │            │ process     │
└─────────────────────┴─────────┴────────────┴────────────┴─────────────┘

lead-management (1.2.0)
  Path: ./solutions/templates/lead-management
  Created: 2025-11-15
  Updated: 2025-12-01
  Author: RevPal Engineering
  Parameters: scoringThreshold, roundRobinOwners, enableNurturing
  Components:
    - lead-score-field (salesforce:customField)
    - lead-routing-flow (salesforce:flow)
    - lead-permission-set (salesforce:permissionSet)
```

### JSON Format
```json
{
  "solutions": [
    {
      "name": "lead-management",
      "version": "1.2.0",
      "description": "Complete lead management with routing and scoring",
      "path": "./solutions/templates/lead-management",
      "platforms": {
        "salesforce": {
          "minApiVersion": "62.0"
        }
      },
      "metadata": {
        "author": "RevPal Engineering",
        "created": "2025-11-15",
        "updated": "2025-12-01",
        "tags": ["lead", "routing"],
        "complexity": "moderate"
      },
      "components": [
        {
          "id": "lead-score-field",
          "type": "salesforce:customField"
        },
        {
          "id": "lead-routing-flow",
          "type": "salesforce:flow"
        }
      ],
      "parameters": {
        "scoringThreshold": {
          "type": "number",
          "default": 50
        }
      }
    }
  ],
  "total": 4,
  "filters": {
    "platform": null,
    "tag": null
  }
}
```

### Markdown Format
```markdown
# Available Solutions

## lead-management (v1.2.0)
**Platforms**: Salesforce
**Complexity**: Moderate
**Tags**: lead, routing

Complete lead management with routing and scoring

### Components
- `lead-score-field` - Custom field for lead scoring
- `lead-routing-flow` - Flow for lead assignment
- `lead-permission-set` - Permission set for lead managers

### Parameters
| Name | Type | Required | Default |
|------|------|----------|---------|
| scoringThreshold | number | No | 50 |
| roundRobinOwners | array | Yes | - |
| enableNurturing | boolean | No | true |
```

## Related Commands

- `/solution-validate` - Validate a solution
- `/solution-deploy` - Deploy a solution
- `/solution-package` - Package for distribution
