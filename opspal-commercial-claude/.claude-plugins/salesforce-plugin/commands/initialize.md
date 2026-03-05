---
description: Initialize project structure with folders, CLAUDE.md, and .gitignore based on installed plugins
argument-hint: "[--project-dir=<path>] [--force]"
---

# Initialize Project

Sets up a standardized project structure based on which plugins are installed (Salesforce, HubSpot, or both).

## What This Command Does

1. **Detects installed plugins** - Checks for salesforce-plugin and/or hubspot-plugin
2. **Creates folder structure** - Sets up instances/, reports/, scripts/ directories
3. **Generates CLAUDE.md** - Creates project instructions from plugin templates
4. **Creates .gitignore** - Adds rules to protect customer data
5. **Creates README files** - Adds guidance for instance management

## Usage

### Initialize Current Directory

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/initialize-project.js
```

### Initialize Specific Directory

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/initialize-project.js --project-dir=/path/to/project
```

### Force Overwrite Existing Files

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/initialize-project.js --force
```

## Generated Structure

### Salesforce Plugin Only

```
my-project/
├── CLAUDE.md                    # Salesforce-specific instructions
├── .gitignore                   # SFDC auth + data protection rules
├── instances/
│   └── salesforce/
│       └── README.md
├── reports/
│   └── salesforce/
└── scripts/
    └── salesforce/
```

### HubSpot Plugin Only

```
my-project/
├── CLAUDE.md                    # HubSpot-specific instructions
├── .gitignore                   # HubSpot API + data protection rules
├── instances/
│   └── hubspot/
│       └── README.md
├── reports/
│   └── hubspot/
└── scripts/
    └── hubspot/
```

### Both Plugins Installed

```
my-project/
├── CLAUDE.md                    # Combined multi-platform instructions
├── .gitignore                   # Both platforms' rules
├── instances/
│   ├── salesforce/
│   │   └── README.md
│   └── hubspot/
│       └── README.md
├── reports/
│   ├── salesforce/
│   └── hubspot/
└── scripts/
    ├── salesforce/
    └── hubspot/
```

## Example Output

```
============================================================
Project Initialization
============================================================

Detecting installed plugins...
  ✓ salesforce-plugin detected

Creating project structure...
  ✓ Created instances/
  ✓ Created instances/salesforce/
  ✓ Created reports/salesforce/
  ✓ Created scripts/salesforce/

Generating CLAUDE.md...
  ✓ Generated CLAUDE.md
    /path/to/project/CLAUDE.md

Generating .gitignore...
  ✓ Generated .gitignore
    /path/to/project/.gitignore

Creating README files...
  ✓ Created instances/salesforce/README.md

============================================================
✓ Initialization Complete!
============================================================

Next Steps:
1. Edit CLAUDE.md to add project-specific details
2. Review .gitignore rules
3. Authenticate Salesforce: sf org login web
4. Create your first instance directory
5. Run /checkdependencies to verify setup
```

## What Gets Generated

### CLAUDE.md

A comprehensive project instruction file that includes:
- Project overview section (you fill in details)
- Installed plugins list
- Folder structure explanation
- Agent-first protocol and quick lookup
- **@import references to complete USAGE.md guides** (all agent documentation, workflows, use cases)
- Platform-specific conventions and commands
- Security guidelines
- Common operations reference

**If both plugins installed**: Templates are merged into a single multi-platform guide

**NEW (v3.10.0)**: CLAUDE.md now imports comprehensive USAGE.md files with:
- 53 Salesforce agents (organized by category)
- 71 HubSpot agents (across 4 plugins)
- Complete agent workflows and use cases
- Command quick reference tables
- Best practices and troubleshooting

### .gitignore

Platform-specific rules to protect:
- Customer data (`instances/*/data/`)
- Authentication files (`.sf/`, `.hubspot/`)
- Environment variables (`.env`)
- API logs and temporary files

**If existing .gitignore**: Rules are merged, not overwritten

### README Files

Created in `instances/salesforce/` and/or `instances/hubspot/`:
- Folder structure explanation
- Instance creation workflow
- Common commands reference

## When to Use This Command

Run `/initialize` when:

1. **Starting a new project** - Set up structure from the beginning
2. **First time using plugins** - Learn proper folder organization
3. **Adding second plugin** - Extend structure for multi-platform work
4. **Onboarding team members** - Provide consistent project layout
5. **Converting existing project** - Standardize to plugin conventions

## Re-running Initialization

You can safely re-run `/initialize`:

- **Without `--force`**: Only creates missing files/folders
- **With `--force`**: Overwrites CLAUDE.md (use when templates updated)

Existing customer data in `instances/` is never touched.

## Customizing Generated Files

### Edit CLAUDE.md

After generation, customize these sections:
- **Project Overview**: Add project name, description
- **Agent Selection**: Add project-specific agent patterns
- **Conventions**: Document your team's standards

### Extend .gitignore

Add project-specific rules:
```gitignore
# Custom rules
build/
dist/
*.secret
```

### Add Instance Directories

After initialization:
```bash
# Salesforce
mkdir -p instances/salesforce/acme-corp/{reports,data}

# HubSpot
mkdir -p instances/hubspot/acme-corp/{reports,data}
```

## Integration with Other Commands

After initialization:
- Run `/checkdependencies` to verify all tools installed
- Use `/reflect` to submit feedback on the setup process
- Reference generated CLAUDE.md for agent selection

## Troubleshooting

### "No plugins detected"

No plugins are installed. Install first:
```bash
claude plugin install salesforce-plugin@revpal-internal-plugins
# or
claude plugin install hubspot-plugin@revpal-internal-plugins
```

### "CLAUDE.md already exists"

Use `--force` to overwrite:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/initialize-project.js --force
```

Or manually backup and remove the existing file.

### Template Not Found

Ensure plugins are properly installed:
```bash
claude plugin list
```

Check template files exist:
```bash
ls ~/.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins/*/templates/
```

## Exit Codes

- `0` - Initialization successful
- `1` - Error (no plugins, missing templates, file errors)

## Related Commands

- `/checkdependencies` - Verify required tools installed
- `/reflect` - Submit feedback on initialization experience

## Version History

- **v1.0.0** (2025-10-11) - Initial implementation
- Supports single-plugin and multi-plugin initialization
- Automatic template merging for combined CLAUDE.md
