---
name: salesforce-org-context-detection-framework
description: Salesforce org context detection framework for auto-detecting target org, loading org quirks, and propagating consistent execution context across hooks and agents.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Org Context Detection Framework

## When to Use This Skill

Use this skill when:
- Building or modifying hooks that need to know which Salesforce org is targeted
- Implementing org-specific quirks (custom field mappings, API version overrides)
- Troubleshooting context propagation failures between hooks and agents
- Setting up session-start bootstrapping for org-aware automation
- Ensuring consistent org context across multi-step workflows

**Not for**: Broad environment readiness (use `operations-readiness-framework`), deployment validation (use `deployment-validation-framework`), or CLI path resolution (use `salesforce-org-alias-and-path-compliance-framework`).

## Context Detection Signal Priority

| Priority | Signal Source | Example | Reliability |
|----------|-------------|---------|-------------|
| 1 | `SF_TARGET_ORG` env var | `export SF_TARGET_ORG=my-prod` | Highest - explicit |
| 2 | `ORG_SLUG` env var | `export ORG_SLUG=acme-corp` | High - org-centric path |
| 3 | `INSTANCE_PATH` env var | `export INSTANCE_PATH=orgs/acme/platforms/salesforce/production` | High - direct path |
| 4 | `sf config get target-org` | CLI default org | Medium - may be stale |
| 5 | Working directory path | `orgs/acme/platforms/salesforce/...` | Medium - convention-based |
| 6 | `.sf/config.json` in project | `{"target-org": "my-prod"}` | Low - project-local |

## Workflow

### Step 1: Detect Org Context

```bash
# In hook scripts, use this detection cascade:
ORG="${SF_TARGET_ORG:-$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty')}"
if [ -z "$ORG" ]; then
  echo "WARNING: No org context detected" >&2
  exit 0  # Advisory only - never block on missing context
fi
```

### Step 2: Load Org Quirks

Org quirks are org-specific overrides stored in:
- `orgs/<slug>/configs/org-quirks.json` (org-centric path)
- `instances/salesforce/<alias>/org-quirks.json` (legacy path)

```bash
# Load quirks via the org context manager
node scripts/lib/org-context-manager.js resolve <org-alias>
```

Common quirks: State/Country picklist enabled, Person Accounts enabled, CPQ installed, custom namespace prefix.

### Step 3: Export Context for Downstream

```bash
# Export as environment variables for downstream hooks/agents
export SF_ORG_TYPE="sandbox"           # production | sandbox | scratch
export SF_ORG_NAMESPACE=""             # Custom namespace prefix if any
export SF_ORG_HAS_CPQ="true"          # CPQ detection result
export SF_ORG_HAS_STATE_COUNTRY="true" # State/Country picklist detection
```

### Step 4: Strict Mode Enforcement

When `STRICT_ORG_CONTEXT=1` is set:
- Missing org context is an error (not a warning)
- All downstream operations require explicit `--target-org` flags
- No fallback to CLI default org

## Routing Boundaries

Use this skill for hook-level context propagation.
Use `operations-readiness-framework` for broader environment readiness.

## References

- [pretask context loading](./pretask-context-loading.md)
- [session start context bootstrap](./session-start-bootstrap.md)
- [post-auth org quirks sync](./postauth-org-quirks-sync.md)
