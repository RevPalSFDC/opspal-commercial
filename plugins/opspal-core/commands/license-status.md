---
name: license-status
description: Show current OpsPal license status, tier, and asset access breakdown
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
- Subscription tier and organization
- Cache freshness (24h validity)
- Offline grace period status (7-day)
- Per-tier access breakdown (Tier 1/2/3 locked/unlocked)

## Implementation

```bash
node plugins/opspal-core/scripts/lib/license-activation-manager.js status
```
