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
- If a different license key is already active on this machine, stop and tell the user to run `/deactivate-license` first instead of overwriting the cached activation.

## Execute

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/license-activation-manager.js" activate --email "<email>" --license-key "<license-key>"
```

## Notes

- Uses `OPSPAL_LICENSE_SERVER` when set.
- Defaults to `https://license.gorevpal.com` when no override is present.
- Encrypted plugin assets are decrypted **automatically** at the start of every new Claude Code session. No manual decryption command exists or is needed.
- Caches activation metadata in `~/.opspal/license-cache.json`.

## After Activation

Once activation succeeds:

1. Display the Tier and Allowed domains from the script output in a summary table.
2. Tell the user: "Encrypted plugin assets will be unlocked automatically the next time a new Claude Code session starts."
3. If the user wants to use the newly activated content immediately, suggest starting a new Claude Code session.
4. Do NOT suggest running any other commands. Specifically:
   - Do NOT suggest `/encrypt-assets` (that is a developer tool for encrypting, not decrypting)
   - Do NOT suggest `/encrypt-assets --decrypt` (this flag does not exist)
   - Do NOT suggest `/finishopspalupdate` (this is for plugin updates, not license activation)
   - Do NOT suggest `/license-canary` unless the user asks to verify

## Example

```bash
/activate-license user@example.com OPSPAL-PRO-ABC123
```
