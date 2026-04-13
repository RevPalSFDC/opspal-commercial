# Project Path Validation Rules

Primary source: `hooks/validate-sfdc-project-location.sh`.

## Required Directory Structure

Salesforce projects (those containing `sfdx-project.json`) must be created in org-scoped directories. The plugin enforces two levels of validation.

### Org-Centric Structure (Preferred)

```
orgs/{org-slug}/platforms/salesforce/{instance}/
  sfdx-project.json
  force-app/
  config/
```

Example: `orgs/acme/platforms/salesforce/acme-prod/`

### Legacy Platform Structure

```
SFDC/instances/{org-alias}/
  sfdx-project.json
  force-app/
```

Example: `SFDC/instances/acme-prod/`

### Blocked Paths

| Path Pattern | Block Reason |
|-------------|-------------|
| `instances/acme/` (without `SFDC/`) | Wrong instances directory — must be `SFDC/instances/` |
| `opspal-internal/instances/acme/` | Internal-plugin instances directory — deprecated |
| `~/` (home directory root) | SFDC projects must not live in home root |
| `~/.claude/` | Plugin runtime directory — no project code here |

## Validation Logic

From `hooks/validate-sfdc-project-location.sh`:

```bash
# Rule 1: instances/ paths must be prefixed with SFDC/
if [[ "$PROJECT_PATH" == *"instances/"* ]] && [[ "$PROJECT_PATH" != *"SFDC/instances/"* ]]; then
  echo "❌ ERROR: SFDC projects MUST be created in SFDC/instances/{org-alias}/"
  echo "   Wrong path: $PROJECT_PATH"
  echo "   Correct pattern: */SFDC/instances/{org-alias}/{project-name}/"
  exit 1
fi

# Rule 2: opspal-internal instances directory is blocked
if [[ "$PROJECT_PATH" == *"/opspal-internal/instances/"* ]] && [[ "$PROJECT_PATH" != *"/SFDC/"* ]]; then
  echo "❌ ERROR: SFDC project in wrong instances directory!"
  echo "   Found: opspal-internal/instances/ (WRONG)"
  echo "   Expected: opspal-internal/SFDC/instances/ (CORRECT)"
  exit 1
fi
```

## Detecting sfdx-project.json in Wrong Location

```bash
# Scan for misplaced sfdx-project.json files
find ~ -maxdepth 5 -name "sfdx-project.json" 2>/dev/null \
  | grep -vE '/(SFDC/instances|orgs/.*/platforms/salesforce)/' \
  | grep -vE '/(node_modules|\.nvm|\.cache)/' \
  | while read -r found; do
      echo "WARNING: sfdx-project.json found in non-standard location: $found"
    done
```

## Path Resolution Helper

Use `scripts/lib/org-context-manager.js` rather than constructing paths manually:

```bash
# Resolve canonical path for an org alias
INSTANCE_PATH=$(node scripts/lib/org-context-manager.js resolve "$SF_TARGET_ORG")
if [[ -z "$INSTANCE_PATH" ]]; then
  echo "ERROR: Could not resolve instance path for org: $SF_TARGET_ORG"
  exit 1
fi
cd "$INSTANCE_PATH"
```

## Multi-Org Environment Compliance

In a multi-org setup, each org alias must have its own isolated directory. Never share a single `sfdx-project.json` across multiple orgs:

```bash
# WRONG: single project, multiple orgs
sf project deploy start --source-dir force-app --target-org sandbox
sf project deploy start --source-dir force-app --target-org production

# CORRECT: per-org project directories
cd orgs/acme/platforms/salesforce/acme-sandbox
sf project deploy start --source-dir force-app --target-org acme-sandbox

cd orgs/acme/platforms/salesforce/acme-prod
sf project deploy start --source-dir force-app --target-org acme-prod
```

## Accidental Wrong-Org Prevention

```bash
# Verify active org alias before any deployment
verify_org_target() {
  local expected="$1"
  local actual
  actual=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // ""')

  if [[ "$actual" != "$expected" ]]; then
    echo "❌ ORG MISMATCH: Expected '$expected', active org is '$actual'"
    echo "   Set correct org: sf config set target-org $expected"
    exit 1
  fi
}
verify_org_target "$SF_TARGET_ORG"
```
