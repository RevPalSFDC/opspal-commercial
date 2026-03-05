# Solution Catalog Distribution

This runbook guides you through publishing solutions to the shared catalog and installing solutions from it across plugin installations.

## Overview

The Solution Catalog enables sharing solution templates across plugin installations:

- **Publishers** create and publish solutions to a shared repository
- **Consumers** browse, install, and deploy solutions from the catalog
- **Distribution** happens through Git (same repo as plugins)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REPOSITORY ROOT                               │
├─────────────────────────────────────────────────────────────────────────┤
│  solution-catalog.json     ← Catalog registry                           │
│  solutions/                ← Published solution templates               │
│    └── lead-management/                                                 │
│        ├── solution.json                                                │
│        └── components/                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │Installation │ │Installation │ │Installation │
            │     A       │ │     B       │ │     C       │
            └─────────────┘ └─────────────┘ └─────────────┘
                  │               │               │
                  ▼               ▼               ▼
            installed/      installed/      installed/
```

---

## Quick Start

### For Consumers (Installing Solutions)

```bash
# 1. Sync repository
git pull origin main

# 2. Browse catalog
/solution-catalog

# 3. View solution details
/solution-info lead-management

# 4. Install solution
/solution-install lead-management

# 5. Deploy to your org
/solution-deploy lead-management --env sandbox \
  --param defaultOwnerId=005xxx \
  --param routingQueueId=00Gxxx
```

### For Publishers (Sharing Solutions)

```bash
# 1. Create solution locally
mkdir -p ./solutions/templates/my-solution/components
# ... create solution.json and templates

# 2. Validate
/solution-validate ./solutions/templates/my-solution

# 3. Publish to catalog
/solution-publish ./solutions/templates/my-solution

# 4. Commit and push
git add solution-catalog.json solutions/my-solution/
git commit -m "feat: Add my-solution to catalog"
git push origin main
```

---

## Consumer Workflow

### Step 1: Sync Repository

Ensure you have the latest catalog and solutions:

```bash
git pull origin main
```

### Step 2: Browse Catalog

View all available solutions:

```bash
/solution-catalog
```

Output:
```
Solution Catalog (12 solutions)

Name                  Version  Platform     Complexity  Tags
────────────────────────────────────────────────────────────────
lead-management       1.0.0    salesforce   moderate    lead, routing
quote-to-cash         2.1.0    salesforce   complex     cpq, quote
hubspot-nurture       1.5.0    hubspot      simple      nurture, email
```

### Step 3: Search and Filter

Find solutions by criteria:

```bash
# Search by keyword
/solution-catalog --search "lead routing"

# Filter by platform
/solution-catalog --platform salesforce

# Filter by tag
/solution-catalog --tag automation

# Filter by complexity
/solution-catalog --complexity simple

# Combine filters
/solution-catalog --platform salesforce --tag cpq
```

### Step 4: View Details

Get full information about a solution:

```bash
/solution-info lead-management
```

Output shows:
- Description and metadata
- Components included
- Parameters (required and optional)
- Prerequisites
- Installation status

### Step 5: Install Solution

Download solution to your local installation:

```bash
/solution-install lead-management
```

This copies the solution to:
```
.claude-plugins/cross-platform-plugin/solutions/installed/lead-management/
```

### Step 6: Configure Environment

Create or update your environment profile:

```bash
/environment-create my-sandbox --detect-quirks --org my-sandbox-alias
```

### Step 7: Deploy Solution

Deploy to your target environment:

```bash
/solution-deploy lead-management --env my-sandbox \
  --param defaultOwnerId=005xxx \
  --param routingQueueId=00Gxxx
```

---

## Publisher Workflow

### Step 1: Create Solution Locally

Create your solution in the templates directory:

```bash
mkdir -p ./solutions/templates/my-solution/components/{fields,flows,permissions}
```

Create `solution.json`:

```json
{
  "name": "my-solution",
  "version": "1.0.0",
  "description": "Brief description",
  "metadata": {
    "author": "Your Name",
    "tags": ["tag1", "tag2"],
    "complexity": "moderate"
  },
  "platforms": {
    "salesforce": {
      "minApiVersion": "62.0"
    }
  },
  "parameters": {},
  "components": []
}
```

See [Creating Solution Templates](01-creating-solution-templates.md) for full details.

### Step 2: Validate Solution

Ensure your solution passes validation:

```bash
/solution-validate ./solutions/templates/my-solution
```

Fix any errors before publishing.

### Step 3: Publish to Catalog

Publish your solution:

```bash
/solution-publish ./solutions/templates/my-solution
```

This:
1. Validates the solution
2. Copies files to `./solutions/my-solution/`
3. Updates `solution-catalog.json`

### Step 4: Commit and Push

Distribute your solution:

```bash
git add solution-catalog.json solutions/my-solution/
git commit -m "feat: Add my-solution to catalog"
git push origin main
```

### Step 5: Verify

Check your solution appears in the catalog:

```bash
/solution-catalog --search "my-solution"
```

---

## Catalog Management

### View Statistics

```bash
/solution-catalog --stats
```

Output:
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

Available Tags: lead, routing, cpq, automation, sync

Last Updated: 2025-12-04T12:00:00Z
```

### Update Published Solution

1. Update version in local `solution.json`
2. Make changes to templates
3. Re-publish: `/solution-publish ./solutions/templates/my-solution`
4. Commit and push

### Check Installation Status

```bash
/solution-catalog --installed
```

Shows which catalog solutions are installed locally.

---

## File Locations

| Location | Purpose | In Git? |
|----------|---------|---------|
| `solution-catalog.json` | Catalog registry | Yes |
| `solutions/` (repo root) | Published solutions | Yes |
| `solutions/templates/` | Local development | Yes |
| `solutions/installed/` | Downloaded solutions | No* |

*Consider adding `solutions/installed/` to `.gitignore` to keep installations local.

---

## Troubleshooting

### Solution Not Found

```
Error: Solution not found: my-solution
```

**Cause**: Solution not in catalog or typo in name
**Fix**: Run `/solution-catalog` to see available solutions

### Files Not Available

```
Error: Solution files not available locally.
Sync the repository first: git pull origin main
```

**Cause**: Repository not synced after solution was published
**Fix**: Run `git pull origin main`

### Already Installed

```
Solution lead-management is already installed (v1.0.0)
Use --force to reinstall.
```

**Cause**: Solution already in `installed/` directory
**Fix**: Use `--force` flag or check if version matches

### Publish Validation Failed

```
Error: Invalid solution: Missing required field 'description'
```

**Cause**: Solution manifest missing required fields
**Fix**: Run `/solution-validate` and fix errors

---

## Best Practices

### For Publishers

1. **Use descriptive names** - lowercase-hyphenated (e.g., `lead-routing-v2`)
2. **Document parameters** - Every parameter needs type and description
3. **Test before publishing** - Deploy to sandbox first
4. **Version semantically** - MAJOR.MINOR.PATCH
5. **Tag appropriately** - Use relevant, searchable tags

### For Consumers

1. **Check prerequisites** - Review `/solution-info` before installing
2. **Use environments** - Don't deploy directly to production
3. **Review parameters** - Understand what each parameter does
4. **Test in sandbox** - Always deploy to sandbox first

---

## Related Resources

- [Creating Solution Templates](01-creating-solution-templates.md)
- [Parameter Design Guide](02-parameter-design-guide.md)
- [Environment Profile Management](03-environment-profile-management.md)
- [Deployment Strategies](04-deployment-strategies.md)
- [Troubleshooting Guide](05-troubleshooting-guide.md)
