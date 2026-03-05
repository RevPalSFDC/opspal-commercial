---
description: Generate comprehensive marketplace catalog with plugin and agent directories
argument-hint: "[--all] [--json] [--markdown] [--stats]"
---

# Generate Plugin Catalog

Generate comprehensive marketplace catalog with searchable plugin and agent directories, capability matrices, coverage analysis, and statistics.

## Task

You are generating a complete catalog of the plugin marketplace with multiple output formats and search capabilities.

## Quick Start

### Generate Full Catalog

```bash
# JSON format
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --all --json > marketplace-catalog.json

# Markdown format
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --all --markdown > MARKETPLACE_CATALOG.md

# CSV format
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --all --csv > marketplace-catalog.csv
```

### Search Catalog

```bash
# Search for keyword
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --search "metadata"

# Output:
# 🔍 Search results for "metadata":
#
# Agents (8):
#   - sfdc-metadata-manager (salesforce-plugin): Manages Salesforce metadata
#   - sfdc-metadata-analyzer (salesforce-plugin): Analyzes metadata quality
#   ...
```

### Filter by Domain

```bash
# List all Salesforce plugins
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --domain salesforce

# Output:
# 📂 salesforce plugins (1):
#
# - salesforce-plugin (49 agents)
#   Comprehensive Salesforce operations
```

## Script Options

```bash
# Generate complete catalog
node build-marketplace-catalog.js --all

# Output formats
--json          # JSON format
--markdown      # Markdown format
--csv           # CSV format

# Search and filter
--search <keyword>   # Search for keyword
--domain <domain>    # Filter by domain (salesforce, hubspot, gtm, developer, cross-platform)
--plugin <name>      # Show specific plugin details
```

## Output Formats

### JSON Output

```json
{
  "generated": "2025-10-10T12:00:00.000Z",
  "version": "1.0.0",
  "summary": {
    "totalPlugins": 8,
    "totalAgents": 103,
    "totalScripts": 520,
    "totalCommands": 21,
    "totalHooks": 12
  },
  "plugins": [
    {
      "name": "salesforce-plugin",
      "version": "3.2.0",
      "description": "Comprehensive Salesforce operations",
      "agentCount": 49,
      "scriptCount": 313,
      "commandCount": 13,
      "agents": [
        {
          "name": "sfdc-metadata-manager",
          "description": "Manages Salesforce metadata",
          "model": "sonnet",
          "tools": ["Read", "Write", "Bash"],
          "capabilities": ["metadata", "deployment", "validation"]
        }
      ],
      "dependencies": {...}
    }
  ],
  "capabilities": {
    "metadata": [
      "salesforce-plugin:sfdc-metadata-manager",
      "salesforce-plugin:sfdc-metadata-analyzer"
    ],
    "data": [
      "salesforce-plugin:sfdc-data-operations",
      "hubspot-core-plugin:hubspot-data-manager"
    ]
  },
  "domains": {
    "salesforce": ["salesforce-plugin"],
    "hubspot": ["hubspot-core-plugin", "hubspot-marketing-sales-plugin"],
    "developer": ["developer-tools-plugin"]
  }
}
```

### Markdown Output

```markdown
# OpsPal Plugin Marketplace Catalog

Generated: 2025-10-10

## Summary

- **Total Plugins**: 8
- **Total Agents**: 103
- **Total Scripts**: 520
- **Total Commands**: 21

## Plugins

### salesforce-plugin (v3.2.0)
**Description**: Comprehensive Salesforce operations

**Agents** (49):
- **sfdc-metadata-manager**: Manages Salesforce metadata
- **sfdc-query-specialist**: SOQL query building
- **sfdc-apex-developer**: Apex development
- ... (46 more)

**Scripts** (313)

**Commands** (13):
- /sfdc-deploy
- /sfdc-validate
- ... (11 more)

---

### hubspot-core-plugin (v1.0.0)
...

## Capabilities Index

### metadata
- salesforce-plugin:sfdc-metadata-manager
- salesforce-plugin:sfdc-metadata-analyzer
- ... (6 more)

### data
- salesforce-plugin:sfdc-data-operations
- hubspot-core-plugin:hubspot-data-manager
- ... (8 more)

## Domains

### salesforce
- **salesforce-plugin** (49 agents)

### hubspot
- **hubspot-core-plugin** (12 agents)
- **hubspot-marketing-sales-plugin** (10 agents)
- **hubspot-analytics-governance-plugin** (8 agents)
- **hubspot-integrations-plugin** (5 agents)
```

### CSV Output

```csv
Plugin,Version,Agents,Scripts,Commands,Description
salesforce-plugin,3.2.0,49,313,13,"Comprehensive Salesforce operations - 49 agents; 313 scripts; 13 commands"
hubspot-core-plugin,1.0.0,12,100,4,"Core HubSpot operations - 12 agents; 100+ scripts; 4 commands"
developer-tools-plugin,2.0.0,6,4,6,"Complete plugin lifecycle management - scaffolding; validation; quality"
```

## Use Cases

### Generate Documentation

```bash
# Create marketplace catalog documentation
node scripts/build-marketplace-catalog.js --all --markdown > docs/MARKETPLACE_CATALOG.md

# Commit to repo
git add docs/MARKETPLACE_CATALOG.md
git commit -m "docs: Update marketplace catalog"
```

### Find Agents by Capability

```bash
# Find all metadata-related agents
node scripts/build-marketplace-catalog.js --search "metadata"

# Find all data operation agents
node scripts/build-marketplace-catalog.js --search "data"

# Find quality/testing agents
node scripts/build-marketplace-catalog.js --search "quality"
```

### Domain Analysis

```bash
# Analyze Salesforce coverage
node scripts/build-marketplace-catalog.js --domain salesforce --json | \
  jq '.[].agentCount'

# Compare domain coverage
for domain in salesforce hubspot gtm developer; do
  echo -n "$domain: "
  node scripts/build-marketplace-catalog.js --domain $domain | grep -c "agents"
done
```

### Export for Analysis

```bash
# Export to spreadsheet
node scripts/build-marketplace-catalog.js --all --csv > marketplace.csv

# Import into Google Sheets, Excel, etc. for analysis
```

## Integration Examples

### Git Hook (Auto-update on merge)

```bash
#!/bin/bash
# .git/hooks/post-merge

# Regenerate catalog after pulling changes
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --all --markdown > docs/MARKETPLACE_CATALOG.md

# Only commit if changed
if git diff --quiet docs/MARKETPLACE_CATALOG.md; then
  echo "Catalog unchanged"
else
  git add docs/MARKETPLACE_CATALOG.md
  echo "Catalog updated"
fi
```

### CI/CD (Auto-update on push)

```yaml
# .github/workflows/catalog.yml
name: Update Marketplace Catalog

on:
  push:
    branches: [main]
    paths:
      - '.claude-plugins/**'

jobs:
  catalog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Generate Catalog
        run: |
          node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
            --all --json > docs/marketplace-catalog.json

      - name: Commit Changes
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add docs/marketplace-catalog.json
          git diff --quiet && git diff --staged --quiet || \
            (git commit -m "docs: Auto-update marketplace catalog" && git push)
```

### README Generator Integration

```bash
# Generate catalog, then use in README
node scripts/build-marketplace-catalog.js --all --json > /tmp/catalog.json

# Extract summary stats for README
PLUGINS=$(jq '.summary.totalPlugins' /tmp/catalog.json)
AGENTS=$(jq '.summary.totalAgents' /tmp/catalog.json)

echo "Marketplace: $PLUGINS plugins, $AGENTS agents"
```

## Catalog Features

### Summary Statistics
- Total plugins, agents, scripts, commands, hooks
- Breakdown by domain
- Quality score distribution

### Plugin Directory
- Complete plugin metadata
- Version information
- Agent/script/command counts
- Dependencies
- Quality scores

### Agent Directory
- Searchable by name and description
- Organized by plugin
- Capability tags
- Tool requirements

### Capability Matrix
- Group agents by capability
- Identify overlaps
- Find coverage gaps
- Suggest consolidation

### Domain Index
- Plugins by domain (Salesforce, HubSpot, etc.)
- Agent counts per domain
- Cross-domain agents

## Catalog Maintenance

### When to Regenerate

**Automatically** (via hooks/CI):
- After plugin installation
- After plugin updates
- After agent creation/modification
- On main branch merges

**Manually**:
- Before releases
- When documenting marketplace
- For coverage analysis
- When planning new plugins

### Keeping Current

```bash
# Daily cron job
0 0 * * * cd /path/to/repo && \
  node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js \
    --all --json > marketplace-catalog.json
```

## Troubleshooting

### Issue: Catalog missing plugins
**Problem**: New plugins not appearing

**Solution**:
```bash
# Verify plugin directory structure
ls -la .claude-plugins/

# Regenerate with verbose output
node scripts/build-marketplace-catalog.js --all --verbose
```

### Issue: Search returns no results
**Problem**: Known agents not found by search

**Solution**:
```bash
# Verify catalog was generated
ls -la marketplace-catalog.json

# Check catalog contents
jq '.plugins[].agents[].name' marketplace-catalog.json | grep "agent-name"

# Regenerate if stale
node scripts/build-marketplace-catalog.js --all --json > marketplace-catalog.json
```

### Issue: Domain filter empty
**Problem**: Domain shows no plugins

**Solution**:
```bash
# Check available domains
node scripts/build-marketplace-catalog.js --all --json | jq '.domains | keys'

# Use correct domain name (lowercase, hyphenated)
node scripts/build-marketplace-catalog.js --domain cross-platform
```

## References

- [plugin-catalog-manager Agent](../agents/plugin-catalog-manager.md)
- [Plugin Development Guide](../../../docs/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Marketplace Documentation](../../../.claude-plugin/marketplace.json)

---

**Marketplace Catalog Builder v2.0.0** - Comprehensive plugin discovery for OpsPal Plugin Marketplace
