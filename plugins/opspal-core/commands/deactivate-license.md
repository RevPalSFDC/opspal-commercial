---
name: deactivate-license
description: Remove OpsPal license from this machine and notify the server
argument-hint: "[options]"
intent: remove the machine-local license session and free its activation slot
dependencies:
  - OpsPal license server
  - ~/.opspal/license-cache.json
failure_modes:
  - license server unreachable
  - activation already removed
  - missing local license state
visibility: user-invocable
tags:
  - licensing
  - deactivation
---

# /deactivate-license Command

Remove the OpsPal cached activation from this machine, clear any cached scoped key material, and notify the license server to free up an activation slot.

For backend, activation, and admin operations, use the runbooks in the sibling `opspal-license-server/docs/` directory.

## Usage

```bash
/deactivate-license
```

## What It Does

1. Notifies the license server to mark this machine as inactive
2. Clears `~/.opspal/license-cache.json`
3. Removes any cached scoped key files under `~/.claude/opspal-enc/`
4. Encrypted assets will no longer decrypt on this machine

## When to Use

- Moving your license to a different machine
- Cleaning up after a trial
- Decommissioning a workstation

## Implementation

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-activation-manager.js deactivate
```
