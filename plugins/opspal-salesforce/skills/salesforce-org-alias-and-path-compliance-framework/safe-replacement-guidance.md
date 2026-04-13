# Safe Replacement Guidance

Primary sources:
- `hooks/pre-write-alias-linter.sh`
- `hooks/validate-sfdc-project-location.sh`

## Replacement Patterns

### Hardcoded `--target-org` → Environment Variable

```bash
# BEFORE (blocked by alias linter)
sf project deploy start --source-dir force-app --target-org prod

# AFTER (compliant)
sf project deploy start --source-dir force-app --target-org "${SF_TARGET_ORG:?SF_TARGET_ORG is required}"
```

The `:?` syntax causes bash to abort with a clear error if the variable is unset — prevents silent deployment to the wrong org.

### sf config set (global default) → Per-Session Context

```bash
# BEFORE (sets global default permanently — dangerous in multi-org setups)
sf config set target-org prod

# AFTER (set for duration of script only)
export SF_TARGET_ORG="prod"
# Or: use --target-org on every sf command (explicit is safest)
```

### Hardcoded Instance Path → Path Resolver

```bash
# BEFORE (path breaks when org slug or instance name changes)
cd ~/projects/SFDC/instances/acme-prod

# AFTER (resolved dynamically)
INSTANCE_PATH=$(node scripts/lib/org-context-manager.js resolve "${SF_TARGET_ORG}")
cd "$INSTANCE_PATH"
```

### Hardcoded Org ID → SOQL Query

```bash
# BEFORE (hardcoded 15/18-char ID)
sf data query --query "SELECT Id FROM User WHERE OrganizationId = '00D000000000001'"

# AFTER (dynamically queried)
ORG_ID=$(sf data query --query "SELECT Id FROM Organization LIMIT 1" \
  --target-org "$SF_TARGET_ORG" --json | jq -r '.result.records[0].Id')
sf data query --query "SELECT Id FROM User WHERE OrganizationId = '$ORG_ID'"
```

## Bootstrap Script Pattern

For shell scripts that run at session start, use a validated bootstrap function:

```bash
init_org_context() {
  local alias="${1:-${SF_TARGET_ORG:-}}"

  if [[ -z "$alias" ]]; then
    echo "ERROR: No org alias provided. Set SF_TARGET_ORG or pass as first argument."
    return 1
  fi

  # Verify alias is authenticated
  if ! sf org display --target-org "$alias" --json >/dev/null 2>&1; then
    echo "ERROR: Org '$alias' is not authenticated. Run: sf org login web --alias $alias"
    return 1
  fi

  export SF_TARGET_ORG="$alias"
  export INSTANCE_PATH
  INSTANCE_PATH=$(node scripts/lib/org-context-manager.js resolve "$alias" 2>/dev/null \
    || echo "orgs/default/platforms/salesforce/$alias")

  echo "Org context initialized: $SF_TARGET_ORG → $INSTANCE_PATH"
}
```

## Multi-Org Guard Pattern

When a script must handle multiple orgs, always name the variable to make intent explicit:

```bash
# Multi-org deployment: always name source and target
SOURCE_ORG="${SOURCE_ORG:?}"
TARGET_ORG="${TARGET_ORG:?}"

# Confirm before cross-org operations
echo "About to copy metadata from $SOURCE_ORG to $TARGET_ORG"
echo "Continue? (yes/no)"
read -r CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted"; exit 0; }
```

## sf CLI Org Alias Configuration

```bash
# List all authenticated orgs and their aliases
sf org list --json | jq -r '.result.nonScratchOrgs[].alias'

# Set alias for an org (one-time setup)
sf alias set --target-org "$ORG_USERNAME" "$DESIRED_ALIAS"

# View current config
sf config list --json | jq -r '.result[]'

# Remove a stale alias
sf alias unset "$OLD_ALIAS"
```

## SFDX Project Config (`sfdx-project.json`)

Org targets in `sfdx-project.json` should reference aliases, not usernames or IDs:

```json
{
  "packageDirectories": [
    {
      "path": "force-app",
      "default": true
    }
  ],
  "sfdcLoginUrl": "https://login.salesforce.com",
  "sourceApiVersion": "62.0"
}
```

Do not add `"defaultdevhubusername"` or `"defaultusername"` as hardcoded values — use `sf config set` at the environment level or pass `--target-org` explicitly on every command.

## Desktop vs CLI Token Store Awareness

When running in a mixed Desktop (Git Bash/Windows) and CLI (WSL/Linux) environment, org aliases registered in one environment are not visible in the other due to separate `~/.sfdx/` paths.

```bash
# Check which SFDX config directory is active
echo "${SF_DATA_DIR:-${HOME}/.sfdx}"

# Force both environments to use the same store (WSL reads Windows store)
export SF_DATA_DIR="/mnt/c/Users/${WINDOWS_USER}/.sfdx"

# Or always use --target-org explicitly (safest cross-platform approach)
sf project deploy start --source-dir force-app --target-org "$SF_TARGET_ORG"
```

See `docs/CROSS_PLATFORM_GUIDE.md` for full Desktop/CLI compatibility details.
