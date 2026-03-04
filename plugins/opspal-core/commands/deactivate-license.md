---
name: deactivate-license
description: Remove OpsPal license from this machine and notify the server
visibility: user-invocable
tags:
  - licensing
  - deactivation
---

# /deactivate-license Command

Remove the OpsPal license key from this machine, clear the session cache, and notify the license server to free up an activation slot.

## Usage

```bash
/deactivate-license
```

## What It Does

1. Notifies the license server to mark this machine as inactive
2. Removes `~/.opspal/license.key`
3. Clears `~/.opspal/license-cache.json`
4. Encrypted assets will no longer decrypt on this machine

## When to Use

- Moving your license to a different machine
- Cleaning up after a trial
- Decommissioning a workstation

## Implementation

```bash
node plugins/opspal-core/scripts/lib/license-activation-manager.js deactivate
```
