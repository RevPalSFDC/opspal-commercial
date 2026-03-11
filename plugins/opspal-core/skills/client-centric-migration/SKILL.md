---
name: client-centric-migration
description: Migrate instance data from system-centric (instances/{platform}/{org}/) to client-centric (orgs/{org}/platforms/{platform}/{instance}/) folder structure. Use when asked to migrate work locally, reorganize project folders, or set up org-centric structure.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Client-Centric Folder Architecture Migration

## When to Use This Skill

Activate when the user:
- Asks to "migrate work locally" or "reorganize folders"
- Wants to move from `instances/` to `orgs/` structure
- Needs to set up client-centric folder organization
- Asks about org-centric vs system-centric paths
- Wants to consolidate scattered instance data

## Architecture Overview

### System-Centric (Legacy)
```
instances/
  salesforce/
    gamma-corp/           # Platform first, then org
    acme-production/
  hubspot/
    portal-123/
```

### Client-Centric (New)
```
orgs/
  {org_slug}/              # Org first (primary boundary)
    _meta/
      org.yaml             # Org-level metadata
    analysis/              # Cross-platform analysis
    planning/              # Roadmaps, architecture
    delivery/              # Cross-platform deliverables
    platforms/
      salesforce/
        {instance}/        # Platform instances under org
          _meta/
            instance.yaml  # Instance metadata
          projects/        # Assessment work
          configs/         # RUNBOOK.md, ENV_CONFIG.json
          data/            # observations, reflections
      hubspot/
        {portal}/
```

## Migration Commands

### Dry-Run (Preview Changes)
```bash
node scripts/migrate-to-client-centric.js --dry-run --verbose
```

### Migrate Single Org (Test First)
```bash
node scripts/migrate-to-client-centric.js --only-org <org-name> --write-report
```

### Full Migration
```bash
node scripts/migrate-to-client-centric.js --create-symlinks --write-report
```

### Migration Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview without making changes |
| `--only-org <slug>` | Migrate single org for testing |
| `--write-report` | Generate JSON + Markdown report |
| `--create-backups` | Backup before migrating |
| `--create-symlinks` | Create backward-compatibility symlinks |
| `--verbose` | Detailed output |

## Path Resolution

Both old and new paths are supported via dual-path resolution:

### Priority Order
1. **Environment Override** (`INSTANCE_PATH`)
2. **Org-Centric** (`orgs/{org}/platforms/{platform}/{instance}`)
3. **Legacy Platform** (`instances/{platform}/{instance}`)
4. **Legacy Simple** (`instances/{instance}`)

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ORG_SLUG` | Primary org identifier |
| `CLIENT_ORG` | Alias for ORG_SLUG |
| `INSTANCE_PATH` | Direct path override |
| `PREFER_ORG_CENTRIC` | Prefer new structure (default: 1) |

## Context Manager Commands

### Salesforce
```bash
# Resolve path for an org
node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-salesforce scripts/lib/org-context-manager.js)" resolve <org-alias>

# Migrate context to org-centric
node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-salesforce scripts/lib/org-context-manager.js)" migrate <org-alias> --org <org-slug>
```

### HubSpot
```bash
# Resolve path for a portal
node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-hubspot scripts/lib/portal-context-manager.js)" resolve <portal-name>

# Migrate context to org-centric
node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-hubspot scripts/lib/portal-context-manager.js)" migrate <portal-name> --org <org-slug>
```

## Utility Scripts

### Path Resolver
```bash
# Resolve instance path
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/path-resolver.js resolve <platform> <instance> [org]

# List discovered orgs
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/path-resolver.js list-orgs

# Extract org info from path
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/path-resolver.js extract "orgs/acme/platforms/salesforce/prod"
```

### Metadata Loader
```bash
# Load org metadata
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/metadata-loader.js load-org <org-slug>

# Load instance metadata
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/metadata-loader.js load-instance <org> <platform> <instance>

# List all orgs with metadata
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/metadata-loader.js list-orgs
```

## Mapping Configuration

Edit `config/instance-mappings.yaml` to define org/instance relationships:

```yaml
orgs:
  acme:
    display_name: "Acme Corporation"
    slug: acme
    platforms:
      salesforce:
        instances:
          production:
            environment_type: production
            source_paths:
              - instances/salesforce/acme-prod
          sandbox:
            environment_type: sandbox
            source_paths:
              - instances/salesforce/acme-sandbox
      hubspot:
        instances:
          main:
            environment_type: production
            source_paths:
              - portals/acme-portal
```

## Migration Safety

- **Non-Destructive**: Files are COPIED, originals preserved
- **Idempotent**: Safe to run multiple times
- **Rollback**: Transaction log enables reversal
- **Symlinks**: Optional backward-compatibility links

## Post-Migration Verification

```bash
# Verify new structure
ls -la orgs/

# Test path resolution still works
node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-salesforce scripts/lib/org-context-manager.js)" resolve <org>

# Check context loading
node "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plugin-path-resolver.js" resolve-script opspal-salesforce scripts/lib/org-context-manager.js)" load <org>
```

## Benefits

- **Org as primary boundary** - All work for a client in one place
- **Cross-platform visibility** - See all platforms under each org
- **Machine-readable metadata** - `org.yaml`, `instance.yaml` for automation
- **Backward compatible** - Dual-path resolution supports both structures
