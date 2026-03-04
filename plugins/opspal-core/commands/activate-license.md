---
name: activate-license
description: Activate an OpsPal license key on this machine to unlock encrypted premium assets
argument-hint: "<license-key>"
visibility: user-invocable
tags:
  - licensing
  - activation
  - setup
---

# /activate-license Command

Activate an OpsPal license key to unlock tier-gated encrypted assets on this machine.

## Usage

```bash
/activate-license OPSPAL-PRO-XXXXXXXXXXXX-XXXXXXXXXX-XXXXXXXX
```

## What It Does

1. Saves the license key to `~/.opspal/license.key`
2. Validates the key against the OpsPal license server
3. Caches the session token and tier information
4. Shows what assets are now unlocked

## After Activation

- Start a new session to decrypt assets (SessionStart hook runs automatically)
- Run `/license-status` to check your license anytime
- Run `/deactivate-license` to remove the license from this machine

## Tier Access

| Tier | Encrypted Assets Unlocked |
|------|---------------------------|
| Starter | 7/37 — methodology configs |
| Professional | 24/37 — algorithms + methodology |
| Enterprise | 37/37 — full access |

## Implementation

Run the script directly:

```bash
node plugins/opspal-core/scripts/lib/license-activation-manager.js activate <license-key>
```
