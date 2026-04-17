# Rollback Guide

**When to use this:** A plugin upgrade introduced a regression and you need to revert to a known-good version while a fix is prepared. This guide documents the procedure that works today with the current marketplace layout (no registry, no tarballs — commit-SHA-based).

**Phases:**
- **Phase 1 (this doc):** Manual rollback via git + `/pluginupdate --fix`. Works now.
- **Phase 2:** Retroactive git tags so `git checkout v2.55.17-opspal-core` becomes a clean UX. Landing alongside this doc.
- **Phase 3 (deferred):** `/rollback-plugin <name>@<version>` CLI. Defer until customer demand justifies it.

---

## Phase 1 — Manual rollback procedure

### Prerequisites

- Git access to `RevPalSFDC/opspal-commercial`.
- Local checkout at the marketplace path `~/.claude/plugins/marketplaces/opspal-commercial/` (install location) or a dev copy.
- The target version number of the plugin you want to roll back.

### Step 1 · Identify the target version

Check the plugin's CHANGELOG or the weekly release notes:

```bash
# Option A: plugin-specific CHANGELOG
less plugins/opspal-core/CHANGELOG.md

# Option B: weekly release notes (more recent, includes commit SHAs)
ls website/release-notes/*.json
cat website/release-notes/2026-W16.json
```

Release-note JSONs include `entries[].commits[]` with SHAs — those are authoritative rollback targets.

### Step 2 · Find the commit that landed the target version

If the target version is documented in a CHANGELOG or release note, you already have the SHA. Otherwise, find it by grep:

```bash
# Find the merge commit that bumped to the target version
git log --oneline --all | grep "fix.*2.55.17\|bump.*2.55.17"

# Or find version-bump commits with the plugin-version file diff
git log -p --all -- plugins/opspal-core/.claude-plugin/plugin.json | grep -B2 '"version": "2.55.17"'
```

### Step 3 · Check out only the plugin's files at that SHA

**Surgical per-plugin rollback** (recommended — doesn't touch other plugins):

```bash
# Roll back one plugin's source files
git checkout <SHA> -- plugins/opspal-core/

# Also roll back its manifest entry in marketplace.json
# (edit .claude-plugin/marketplace.json by hand to restore the old version)
```

**Full repo rollback** (nuclear option — rolls back *all* plugins):

```bash
git checkout <SHA>
# Inspect before committing — this is a detached HEAD state
```

### Step 4 · Rewire hooks

After changing plugin files, re-merge hooks into `settings.json`:

```bash
/pluginupdate --fix
```

This ensures the hook registrations in `~/.claude/settings.json` match the files now on disk.

### Step 5 · Verify

```bash
/healthcheck-hooks
# Confirm no hook-registration orphans, no syntax errors.

# Check friction in a new session — run normal work and look for regressions.
```

If things still look wrong, restore via `git checkout main -- plugins/opspal-core/` and try a different target version.

---

## Known-good version matrices

Plugins can have interlocking dependencies (e.g., `opspal-salesforce` hooks may call `opspal-core` scripts). Mixing arbitrary versions is unsupported. These combinations are known to work end-to-end:

### 2026-04-16 baseline (post PR #8)

| Plugin | Version |
|---|---|
| opspal-core | 2.55.21 |
| opspal-salesforce | 3.87.19 |
| opspal-hubspot | 3.9.34 |
| opspal-marketo | 2.6.43 |
| opspal-gtm-planning | 2.3.12 |

### 2026-04-16 pre-p2 baseline (post PR #5)

| Plugin | Version |
|---|---|
| opspal-core | 2.55.18 |
| opspal-salesforce | 3.87.18 |
| opspal-hubspot | 3.9.34 |
| opspal-marketo | 2.6.43 |
| opspal-gtm-planning | 2.3.12 |

### 2026-04-16 pre-hardening baseline (before PR #4)

| Plugin | Version |
|---|---|
| opspal-core | 2.55.15 |
| opspal-salesforce | 3.87.16 |
| opspal-hubspot | 3.9.33 |
| opspal-marketo | 2.6.42 |
| opspal-gtm-planning | 2.3.11 |

---

## Phase 2 — Retroactive git tags (planned)

To make the SHA-finding step frictionless, we will retroactively tag each plugin's released versions:

```bash
# Pattern: v<version>-<plugin-name>
git tag v2.55.17-opspal-core <sha-from-CHANGELOG>
git tag v3.87.17-opspal-salesforce <sha>
# ... etc
git push --tags
```

Once tagged, Step 2 becomes:

```bash
git checkout v2.55.17-opspal-core -- plugins/opspal-core/
```

Scope: tag back to the last 6 months of releases per plugin. Older rollbacks remain supported via CHANGELOG+grep.

---

## Phase 3 — `/rollback-plugin` CLI (deferred)

Intended surface once git tags exist:

```bash
/rollback-plugin opspal-core@2.55.17
# - Resolves tag v2.55.17-opspal-core
# - Runs `git checkout` of just that plugin's files
# - Runs `/pluginupdate --fix` to rewire hooks
# - Reports version-matrix compatibility warnings if other plugins are on incompatible versions
```

Deferred until a customer actually requests it — this is speculative infrastructure today.

---

## Troubleshooting

### "Hook X no longer registered after rollback"

`/pluginupdate --fix` should re-merge. If it doesn't, check whether the rolled-back version's `hooks.json` has different hook names than the current `settings.json`. The merge is idempotent but only adds registered hooks — orphans in settings.json need manual cleanup:

```bash
# Check for orphaned hooks
/healthcheck-hooks --verbose

# Remove stale entries from ~/.claude/settings.json by hand
```

### "Rolled-back plugin references a script that moved"

Cross-plugin script references (e.g., `opspal-salesforce/hooks/pre-deployment-comprehensive-validation.sh` sourcing `opspal-core/scripts/lib/hook-remediation-hints.sh`) assume both plugins are on compatible versions. If you roll back one but not the other and see "file not found" errors, either roll back both to the same matrix row above, or forward-patch the reference manually.

### "License check fails after rollback"

Encrypted asset decryption is tier-version-aware. If a rollback crosses an encryption scheme boundary, re-run `/activate-license <email> <key>` to refresh the key bundle.

---

## Related

- `/pluginupdate --fix` — hook re-merge, npm dependency check
- `/healthcheck-hooks` — post-rollback sanity check
- `/solution-rollback` — unrelated; rolls back Salesforce metadata deployments, not plugin versions
- `website/release-notes/*.json` — authoritative commit-SHA-to-version mapping
