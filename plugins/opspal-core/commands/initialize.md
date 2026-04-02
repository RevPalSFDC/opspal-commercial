---
name: initialize
description: Initialize project structure with folders, CLAUDE.md, and .gitignore based on installed plugins
argument-hint: "[--project-dir=<path>] [--force]"
---

# Initialize Project (Centralized)

Sets up a standardized project structure based on which plugins are installed (Salesforce, HubSpot, Marketo, or combinations).

## What This Command Does

1. **Detects installed plugins** - Checks for all platform plugins
2. **Creates folder structure** - Sets up instances/, reports/, scripts/ directories
3. **Generates CLAUDE.md** - Creates project instructions from plugin templates
4. **Creates .gitignore** - Adds rules to protect customer data
5. **Creates README files** - Adds guidance for instance management

## Usage

### Script Discovery

The initialization script is part of platform-specific plugins (salesforce, hubspot):

```bash
# Find initialization script (checks multiple locations)
find_init_script() {
  local search_paths=(
    "plugins/opspal-salesforce/scripts/lib/initialize-project.js"
    "plugins/opspal-hubspot/scripts/lib/initialize-project.js"
    ".claude-plugins/opspal-salesforce/scripts/lib/initialize-project.js"
    ".claude-plugins/opspal-hubspot/scripts/lib/initialize-project.js"
    "$HOME/.claude/plugins/opspal-salesforce@opspal-commercial/scripts/lib/initialize-project.js"
    "$HOME/.claude/plugins/opspal-hubspot@opspal-commercial/scripts/lib/initialize-project.js"
  )
  for path in "${search_paths[@]}"; do
    [ -n "$path" ] && [ -f "$path" ] && echo "$path" && return 0
  done
  echo "Error: initialize-project.js not found. Install opspal-salesforce or opspal-hubspot plugin." >&2
  return 1
}

INIT_SCRIPT=$(find_init_script) || exit 1
```

### Initialize Current Directory

```bash
node "$INIT_SCRIPT"
```

### Initialize Specific Directory

```bash
node "$INIT_SCRIPT" --project-dir=/path/to/project
```

### Force Overwrite Existing Files

```bash
node "$INIT_SCRIPT" --force
```

## Generated Structure

### Single Plugin (Example: Salesforce)

```
my-project/
├── CLAUDE.md                    # Platform-specific instructions
├── .gitignore                   # Auth + data protection rules
├── instances/
│   └── salesforce/
│       └── README.md
├── reports/
│   └── salesforce/
└── scripts/
    └── salesforce/
```

### Multiple Plugins (Example: Salesforce + HubSpot)

```
my-project/
├── CLAUDE.md                    # Combined multi-platform instructions
├── .gitignore                   # All platforms' rules merged
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

### Org-Centric Structure (Recommended)

If `--org-centric` flag is provided, creates the newer org-centric layout:

```
my-project/
├── CLAUDE.md
├── .gitignore
└── orgs/
    └── {org-slug}/
        ├── org.yaml
        └── platforms/
            ├── salesforce/
            │   └── production/
            └── hubspot/
                └── production/
```

## Example Output

```
============================================================
Project Initialization
============================================================

Detecting installed plugins...
  ✓ salesforce-plugin detected
  ✓ hubspot-plugin detected

Creating project structure...
  ✓ Created instances/
  ✓ Created instances/salesforce/
  ✓ Created instances/hubspot/
  ✓ Created reports/salesforce/
  ✓ Created reports/hubspot/
  ✓ Created scripts/salesforce/
  ✓ Created scripts/hubspot/

Generating CLAUDE.md...
  ✓ Generated CLAUDE.md (multi-platform)
    /path/to/project/CLAUDE.md

Generating .gitignore...
  ✓ Generated .gitignore (merged rules)
    /path/to/project/.gitignore

Creating README files...
  ✓ Created instances/salesforce/README.md
  ✓ Created instances/hubspot/README.md

============================================================
✓ Initialization Complete!
============================================================

Next Steps:
1. Edit CLAUDE.md to add project-specific details
2. Review .gitignore rules
3. Authenticate platforms:
   - Salesforce: sf org login web
   - HubSpot: Configure HUBSPOT_ACCESS_TOKEN
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
- **@import references to complete USAGE.md guides**
- Platform-specific conventions and commands
- Security guidelines
- Common operations reference

**If multiple plugins installed**: Templates are merged into a single multi-platform guide

### .gitignore

Platform-specific rules to protect:
- Customer data (`instances/*/data/`)
- Authentication files (`.sf/`, `.hubspot/`, `.marketo/`)
- Environment variables (`.env`)
- API logs and temporary files

**If existing .gitignore**: Rules are merged, not overwritten

### README Files

Created in each platform's instances directory:
- Folder structure explanation
- Instance creation workflow
- Common commands reference

## Supported Plugins

| Plugin | Directory Created |
|--------|-------------------|
| salesforce-plugin | `instances/salesforce/` |
| hubspot-plugin | `instances/hubspot/` |
| marketo-plugin | `instances/marketo/` |
| gtm-planning-plugin | `reports/gtm/` |

## When to Use This Command

Run `/initialize` when:

1. **Starting a new project** - Set up structure from the beginning
2. **First time using plugins** - Learn proper folder organization
3. **Adding another plugin** - Extend structure for multi-platform work
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

# Or use org-centric structure
mkdir -p orgs/acme/platforms/salesforce/production
mkdir -p orgs/acme/platforms/hubspot/production
```

## Script Location (Multi-Path Discovery)

The initialization script is located in platform-specific plugins, not opspal-core:

```bash
SCRIPT_PATHS=(
    "plugins/opspal-salesforce/scripts/lib/initialize-project.js"
    "plugins/opspal-hubspot/scripts/lib/initialize-project.js"
    ".claude-plugins/opspal-salesforce/scripts/lib/initialize-project.js"
    ".claude-plugins/opspal-hubspot/scripts/lib/initialize-project.js"
    "$HOME/.claude/plugins/opspal-salesforce@opspal-commercial/scripts/lib/initialize-project.js"
    "$HOME/.claude/plugins/opspal-hubspot@opspal-commercial/scripts/lib/initialize-project.js"
)

for path in "${SCRIPT_PATHS[@]}"; do
    [ -n "$path" ] && [ -f "$path" ] && INIT_SCRIPT="$path" && break
done
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
# Run in a regular terminal (outside Claude Code session)
claude plugin install opspal-salesforce@opspal-commercial
# or
claude plugin install opspal-hubspot@opspal-commercial
```

### "CLAUDE.md already exists"

Use `--force` to overwrite:
```bash
node "$INIT_SCRIPT" --force
```

Or manually backup and remove the existing file.

### Template Not Found

Ensure plugins are properly installed:
```bash
claude plugin list
```

Check template files exist:
```bash
ls .claude-plugins/*/templates/
```

## Exit Codes

- `0` - Initialization successful
- `1` - Error (no plugins, missing templates, file errors)

## Related Commands

- `/checkdependencies` - Verify required tools installed
- `/reflect` - Submit feedback on initialization experience
- `/migrate-schema` - Migrate to org-centric structure

## Version History

- **v1.0.0** (2025-10-11) - Initial implementation
- **v2.0.0** (2026-01-27) - Centralized to opspal-core, added org-centric support
