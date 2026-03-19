---
name: license-canary
description: Validate the live license handshake and scoped key bundle on this machine
argument-hint: "[--expect-tier <starter|professional|enterprise|trial>] [--license-key <key>] [--server <url>]"
intent: verify that this machine receives and verifies the expected v2 tier-scoped key bundle
dependencies:
  - OpsPal license server
  - ~/.opspal/license-cache.json
failure_modes:
  - no cached activation and no provided license key
  - wrong tier or tier-scoped bundle contents
  - verification endpoint unreachable
visibility: user-invocable
tags:
  - licensing
  - canary
  - rollout
---

# /license-canary Command

Run a live license rollout check on the current machine. The command refreshes the session token, confirms the server returned a scoped `v2` key bundle, and verifies the token through `/api/v1/verify`.

## Usage

```bash
/license-canary --expect-tier professional
```

Optionally override the local key or server:

```bash
/license-canary --expect-tier starter --license-key OPSPAL-STR-XXXXXXXXXX-XXXXXXXX --server https://license.example.com
```

## What It Validates

1. Session refresh succeeds
2. `key_bundle_version` is `2`
3. The scoped key bundle contains only the tiers allowed for the license
4. Cached machine state reports a scoped bundle
5. `/api/v1/verify` returns the same tier and allowed tier set

## Recommended Use

- Run once per canary machine during deploy
- Use a real `starter`, `professional`, and `enterprise` license
- Pair the result with `/license-status` if the canary fails
- See `docs/LICENSING_RUNTIME_GUIDE.md` for the full runtime and troubleshooting model

## Implementation

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-canary.js --expect-tier <tier>
```
