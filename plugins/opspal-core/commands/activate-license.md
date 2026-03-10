---
name: activate-license
description: Activate an OpsPal license key on this machine to unlock encrypted premium assets
argument-hint: "<license-key>"
intent: activate a machine-local license session and unlock tier-gated assets
dependencies:
  - OpsPal license server
  - ~/.opspal/license.key
failure_modes:
  - invalid or revoked license key
  - license server unreachable
  - machine activation limit reached
visibility: user-invocable
tags:
  - licensing
  - activation
  - setup
---

# /activate-license Command

Activate an OpsPal license key to unlock tier-gated encrypted assets on this machine.

For backend, activation, and admin operations, use the runbooks in the sibling `opspal-license-server/docs/` directory.

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
- Run `/license-canary --expect-tier <starter|professional|enterprise|trial>` to validate the live scoped-bundle handshake on this machine
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
