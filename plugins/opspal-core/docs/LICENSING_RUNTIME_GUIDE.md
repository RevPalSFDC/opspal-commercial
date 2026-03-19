# Licensing Runtime Guide

This guide describes the current `opspal-core` licensing runtime after the v2 cutover. The plugin is v2-only and expects a scoped key bundle from the OpsPal license server.

Backend, activation, and admin operations are documented in the sibling
`opspal-license-server/docs/` directory. This guide focuses only on runtime
behavior inside `opspal-core`.

## What Changed

- The runtime no longer accepts a shared master key.
- The runtime requests `key_bundle_version: 2` from the license server.
- The license server returns only the tier keys allowed for the current license.
- The asset engine decrypts based on the `.enc` header key slot instead of one universal key.

## Machine-Local State

The runtime uses these files:

- `~/.opspal/license-cache.json` — canonical cached activation state, including license key, user email, machine ID, session token, and scoped key bundle
- `~/.claude/opspal-enc/runtime/{session_id}/...` — per-session decrypted assets

The commercial runtime no longer relies on `~/.opspal/license.key`, and session-start decryption no longer treats local key files as authoritative. The normal production path is the live or cached server-delivered scoped key ring injected through `OPSPAL_PLUGIN_KEYRING_JSON`.

## Runtime Flow

### 1. Activation

`/activate-license <email> <license-key>` performs a live session-token request against the configured license server and persists the returned scoped bundle in `license-cache.json`.

The runtime sends:

```json
{
  "license_key": "OPSPAL-...",
  "machine_id": "<machine-id>",
  "user_email": "user@example.com",
  "key_bundle_version": 2
}
```

### 2. Session Token Response

On success the runtime caches:

- `session_token`
- `tier`
- `organization`
- `allowed_asset_tiers`
- `key_bundle_version`
- `grace_until`
- `key_bundle.version`
- `key_bundle.keys`

The cache is the runtime source of truth and remains usable offline for up to 7 days when the cached scoped bundle is still within `grace_until`.

If the server reports `terminated: true`, the runtime wipes local activation state and blocks decryption.

### 3. Verify Path

`/license-status` reads cached state. `/license-canary` performs a fresh session-token request and then verifies the returned JWT through `/api/v1/verify`.

`/license-status` also shows the active server URL so operators can confirm whether a machine is pointed at production or an override target.

### 4. Session-Start Decryption

The `session-start-asset-decryptor.sh` hook:

1. refreshes or loads the cached license state
2. exports `OPSPAL_PLUGIN_KEYRING_JSON` only when a live or still-valid cached scoped bundle is present
3. discovers plugin encryption manifests
4. decrypts only assets whose `required_domain` is allowed by the current license
5. builds a session-local runtime overlay so protected modules can still resolve their non-protected siblings
6. writes plaintext only into the current session runtime directory

The hook also cleans up stale runtime directories from earlier crashed sessions.

## Tier Entitlement Model

The current tier map is:

| License Tier | Allowed Asset Domains |
|--------------|-----------------------|
| `starter` | `core` |
| `trial` | `core` |
| `salesforce` | `core`, `salesforce` |
| `hubspot` | `core`, `hubspot` |
| `marketo` | `core`, `marketo` |
| `professional` | `core`, `salesforce`, `hubspot` |
| `enterprise` | `core`, `salesforce`, `hubspot`, `marketo`, `gtm`, `data-hygiene` |

The server delivers only keys for the allowed asset domains. The runtime must never assume access to a missing domain.

## V2 Asset Format

Encrypted assets use the v2 wire format:

- magic: `OENC`
- version: `0x02`
- key slot: `1=tier1`, `2=tier2`, `3=tier3`
- HKDF salt
- AES-256-GCM nonce
- AES-256-GCM tag
- ciphertext

Decryption chooses the tier key from the key slot embedded in the header.

## Commands

### `/activate-license`

Use this to activate or refresh the current machine with a real license key.

### `/license-status`

Use this to inspect:

- cached tier
- unlocked asset tiers
- key bundle version
- whether the cache has a scoped key bundle
- freshness and grace-window state

### `/license-canary`

Use this during deploys or incident response to prove:

1. the session-token path succeeds
2. `key_bundle_version` is `2`
3. the returned bundle contains only the expected tiers
4. cached state reflects the same scoped bundle
5. `/api/v1/verify` returns the same tier contract

Example:

```bash
/license-canary --expect-tier professional
```

### `/deactivate-license`

Use this to remove the current machine activation and clear local state.

## Encrypting Assets

The encryption engine is v2-only.

- New encrypted assets must declare `required_tier` in the manifest.
- The encryptor writes a v2 header with the matching tier key slot.
- The runtime decrypts only when the current key ring contains that tier key.

When preparing or updating encrypted assets, keep the manifest and the asset tier assignment aligned. A mismatched `required_tier` will produce the wrong entitlement boundary.

## Operational Checks

Run these after deploy or during troubleshooting:

```bash
/license-status
/license-canary --expect-tier <starter|professional|enterprise|trial>
```

If the canary fails:

1. confirm the license key on the machine is the expected tier
2. confirm the license server is reachable
3. confirm the cached bundle reports `key_bundle_version: 2`
4. confirm the returned bundle keys match the expected allowed tiers
5. confirm the server-side license mapping in the admin UI

## Troubleshooting Notes

### `unsupported_key_bundle_version`

Cause:

- the runtime and server are on different contracts

Action:

- deploy the current license server and `opspal-core` together

### `server_unreachable`

Cause:

- network or license-server availability issue

Action:

- use the cached grace window only as a temporary fallback
- confirm the machine is targeting the expected server in `/license-status`
- use the backend runbook in `opspal-license-server/docs/` for service health checks
- restore server connectivity before the 7-day grace period expires

### Missing Scoped Bundle

Cause:

- server keys are not configured correctly, or the server intentionally withheld the bundle because a required tier key is missing

Action:

- verify `OPSPAL_KEY_TIER1`, `OPSPAL_KEY_TIER2`, and `OPSPAL_KEY_TIER3` on the license server

### Tier Mismatch

Cause:

- the license tier on the server does not match the expected license, or the wrong key was activated locally

Action:

- run `/license-status`
- run `/license-canary --expect-tier <tier>`
- check the license record in the server admin UI

## Security Boundary

This design is a tier-containment model, not a perfect secrecy model. A licensed client that is entitled to `tier2` can decrypt shipped `tier2` assets. The security improvement is that `starter` no longer receives `tier1` or `tier2` key material.
