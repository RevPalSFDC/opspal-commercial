---
name: activate-license
aliases: [active-license]
description: Activate the commercial runtime with a required user email and license key
argument-hint: "<email> <license-key>"
visibility: user-invocable
tags:
  - license
  - activation
  - commercial
---

# Activate License

Activate the local OpsPal commercial runtime against the license server and persist the scoped key bundle for encrypted assets.

## Required Input

- Require both a user email address and a license key.
- If either value is missing, malformed, or ambiguous, stop and ask for:

```bash
/activate-license <email> <license-key>
```

- Never continue with only a license key.

## Execute

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-activation-manager.js" activate --email "<email>" --license-key "<license-key>"
```

## Notes

- Uses `OPSPAL_LICENSE_SERVER` when set.
- Defaults to `https://license.gorevpal.com` when no override is present.
- Stores scoped decryption keys in `~/.claude/opspal-enc/`.
- Caches activation metadata in `~/.opspal/license-cache.json`.

## Example

```bash
/activate-license user@example.com OPSPAL-PRO-ABC123
```
