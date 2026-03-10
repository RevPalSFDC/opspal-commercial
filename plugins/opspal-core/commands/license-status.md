---
name: license-status
description: Show current OpsPal license status, tier, and asset access breakdown
argument-hint: "[options]"
intent: inspect the cached machine license session and unlocked asset tiers
dependencies:
  - ~/.opspal/license-cache.json
  - ~/.opspal/license.key
  - OpsPal license server
failure_modes:
  - no local license activation
  - stale or expired cache
  - verification endpoint unreachable
visibility: user-invocable
tags:
  - licensing
  - status
---

# /license-status Command

Display the current license activation status including tier, organization, cache freshness, and which asset tiers are unlocked.

## Usage

```bash
/license-status
```

## Output Includes

- License key presence (masked)
- Machine ID
- Active license server URL
- Subscription tier and organization
- Cached key bundle version and scoped bundle presence
- Cache freshness (24h validity)
- Offline grace period status (7-day)
- Per-tier access breakdown (Tier 1/2/3 locked/unlocked)

## Recommended Follow-Up

After a deployment or migration, run:

```bash
/license-canary --expect-tier <starter|professional|enterprise|trial>
```

This performs a live session refresh plus `/api/v1/verify` check and confirms the machine received a scoped v2 bundle that matches the expected tier.

See `docs/LICENSING_RUNTIME_GUIDE.md` for the full runtime, cache, and troubleshooting details.

## Implementation

```bash
node plugins/opspal-core/scripts/lib/license-activation-manager.js status
```
