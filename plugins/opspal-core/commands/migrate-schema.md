---
name: migrate-schema
description: Migrate instance data from system-centric to client-centric folder structure
argument-hint: "[--find-stragglers] [--dry-run] [--only-org <slug>]"
---

# Client-Centric Migration Command

You are helping the user migrate from system-centric (`instances/{platform}/{org}/`) to client-centric (`orgs/{org}/platforms/{platform}/{instance}/`) folder structure.

## Arguments Provided
{{ arguments }}

## Script Discovery

The migration script can be at different locations depending on installation type:

```bash
# Find migration script (checks multiple locations)
find_migration_script() {
  local search_paths=(
    "scripts/migrate-to-client-centric.js"
    "./scripts/migrate-to-client-centric.js"
    "${CLAUDE_PLUGIN_ROOT:-}/../../scripts/migrate-to-client-centric.js"
    "plugins/opspal-core/scripts/migrate-to-client-centric.js"
    ".claude-plugins/opspal-core/scripts/migrate-to-client-centric.js"
    "$HOME/.claude/plugins/marketplaces/opspal-commercial/plugins/opspal-core/scripts/migrate-to-client-centric.js"
  )
  for path in "${search_paths[@]}"; do
    [ -n "$path" ] && [ -f "$path" ] && echo "$path" && return 0
  done
  echo "Error: migrate-to-client-centric.js not found" >&2
  return 1
}

MIGRATE_SCRIPT=$(find_migration_script) || exit 1
```

## Quick Commands

**Find unmigrated instances (stragglers):**
```bash
node "$MIGRATE_SCRIPT" --find-stragglers
```

**Dry-run to preview migration:**
```bash
node "$MIGRATE_SCRIPT" --dry-run --verbose
```

**Migrate a specific org:**
```bash
node "$MIGRATE_SCRIPT" --only-org <org-slug> --write-report
```

## Migration Process

### Step 1: Find Stragglers

First, identify any instances that haven't been migrated yet:

```bash
node "$MIGRATE_SCRIPT" --find-stragglers
```

This scans:
- `instances/` (root-level legacy structure)
- `instances/salesforce/`, `instances/hubspot/`, etc.
- `plugins/opspal-salesforce/instances/`
- `plugins/opspal-hubspot/instances/` and `portals/`
- `.claude-plugins/*/instances/`

And reports:
- **Unmigrated**: Instances with no corresponding `orgs/{slug}/` folder
- **Partially migrated**: Orgs with some platforms migrated, some not
- **Already migrated**: Orgs that exist in both locations

### Step 2: Analyze What Would Be Migrated

Run a dry-run to see the migration plan:

```bash
node "$MIGRATE_SCRIPT" --dry-run --verbose
```

### Step 3: Migrate

**For single org (recommended for first-time):**
```bash
node "$MIGRATE_SCRIPT" --only-org <org> --write-report
```

**For all unmigrated orgs:**
```bash
node "$MIGRATE_SCRIPT" --create-symlinks --write-report
```

### Step 4: Verify

After migration:
1. Check the new `orgs/` structure exists
2. Verify path resolution: `node plugins/opspal-core/scripts/lib/path-resolver.js list-orgs`
3. Test context loading still works

## Options Reference

| Flag | Description |
|------|-------------|
| `--find-stragglers` | Identify unmigrated instances without making changes |
| `--dry-run` | Show migration plan without executing |
| `--only-org <slug>` | Migrate only the specified organization |
| `--write-report` | Generate detailed migration report |
| `--create-symlinks` | Create backward-compatibility symlinks |
| `--create-backups` | Backup files before moving |
| `--verbose` | Enable detailed logging |

## Output

Provide a summary of:
- Stragglers found (if using --find-stragglers)
- Orgs discovered/migrated
- Files moved
- New folder structure created
- Any conflicts or issues
- Next steps for the user
