---
name: solution-catalog
description: Browse and search the shared solution catalog to discover available templates
argument-hint: "[--search <query>] [--platform <name>] [--tag <tag>]"
---

# Solution Catalog Command

Browse and search the shared solution catalog to discover available solution templates.

## Usage

```bash
/solution-catalog [options]
```

## Optional Parameters

- `--search <query>` - Search solutions by keyword
- `--platform <platform>` - Filter by platform (salesforce, hubspot, n8n)
- `--tag <tag>` - Filter by tag
- `--complexity <level>` - Filter by complexity (simple, moderate, complex)
- `--format <format>` - Output format: text, json, markdown (default: text)
- `--installed` - Show only installed solutions
- `--stats` - Show catalog statistics

## Examples

### Browse All Solutions
```bash
/solution-catalog
```

### Search by Keyword
```bash
/solution-catalog --search "lead routing"
```

### Filter by Platform
```bash
/solution-catalog --platform salesforce
```

### Filter by Tag
```bash
/solution-catalog --tag automation
```

### Filter by Complexity
```bash
/solution-catalog --complexity simple
```

### Show Installed Solutions
```bash
/solution-catalog --installed
```

### Catalog Statistics
```bash
/solution-catalog --stats
```

### Combine Filters
```bash
/solution-catalog --platform salesforce --tag cpq --complexity complex
```

### JSON Output
```bash
/solution-catalog --format json
```

## Output

### Text Format (default)
```
Solution Catalog (12 solutions)

Name                  Version  Platform     Complexity  Tags
────────────────────────────────────────────────────────────────
lead-management       1.0.0    salesforce   moderate    lead, routing
quote-to-cash         2.1.0    salesforce   complex     cpq, quote
hubspot-nurture       1.5.0    hubspot      simple      nurture, email
cross-platform-sync   1.2.0    sf+hs        moderate    sync, data
```

### Statistics Output
```
Catalog Statistics
──────────────────────────────

Total Solutions: 12
Platforms: salesforce, hubspot, n8n
Total Downloads: 47

Complexity Distribution:
  • Simple: 4
  • Moderate: 5
  • Complex: 3

Available Tags: lead, routing, cpq, automation, sync, nurture, email, data

Last Updated: 2025-12-04T12:00:00Z
```

### JSON Format
```json
{
  "solutions": [
    {
      "name": "lead-management",
      "version": "1.0.0",
      "description": "Complete lead management with scoring and routing",
      "platforms": ["salesforce"],
      "tags": ["lead", "routing", "automation"],
      "complexity": "moderate"
    }
  ],
  "count": 12,
  "filters": {
    "platform": null,
    "tag": null,
    "complexity": null
  }
}
```

## Catalog Location

The solution catalog is located at the repository root:
- **File**: `solution-catalog.json`
- **Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Synchronization

The catalog is automatically available when the repository is cloned or updated. To sync:

```bash
git pull origin main
```

## Related Commands

- `/solution-info <name>` - View detailed solution information
- `/solution-install <name>` - Install a solution locally
- `/solution-publish <path>` - Publish a solution to the catalog
- `/solution-deploy` - Deploy an installed solution
