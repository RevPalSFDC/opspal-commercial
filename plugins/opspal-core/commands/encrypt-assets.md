---
name: encrypt-assets
description: Manage encrypted plugin assets (key setup, encrypt, decrypt, verify, status)
argument-hint: "<subcommand> [--plugin <name>] [--file <path>]"
intent: manage tier-scoped encryption material and encrypted plugin asset bundles
dependencies:
  - Node.js
  - plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js
  - ~/.claude/opspal-enc/
failure_modes:
  - missing key material
  - invalid plugin path
  - checksum or decryption failure
visibility: user-invocable
tags:
  - security
  - encryption
  - plugin-management
---

# /encrypt-assets Command

Manage selective encryption of sensitive plugin assets. Proprietary logic (scoring algorithms, pricing rules, assessment frameworks) can be encrypted at rest and transparently decrypted at runtime.

## Subcommands

### Key Setup

Generate scoped tier keys for v2 assets:

```bash
/encrypt-assets key-setup
```

This creates `~/.claude/opspal-enc/tier1.key`, `tier2.key`, and `tier3.key` with restricted permissions (600).

### Initialize Plugin

Create an `encryption.json` manifest for a plugin:

```bash
/encrypt-assets init --plugin opspal-salesforce
```

### Encrypt a File

Encrypt a single file and update the manifest:

```bash
/encrypt-assets encrypt --plugin opspal-salesforce --file scripts/lib/scoring-algorithm.js --tier tier2
```

The original file is added to `.gitignore`. The `.enc` blob is committed instead.

### Encrypt a Directory

Tar and encrypt an entire directory:

```bash
/encrypt-assets encrypt --plugin opspal-core --dir templates/proprietary-frameworks
```

### Decrypt a File

Decrypt to a scratch directory (for development):

```bash
/encrypt-assets decrypt --plugin opspal-salesforce --file scripts/lib/scoring-algorithm.js --output-dir /tmp/dev
```

### Verify All Assets

Check all `.enc` files: magic bytes, decryption, checksum match:

```bash
/encrypt-assets verify --plugin opspal-salesforce
```

### Re-encrypt (Key Rotation)

Decrypt then re-encrypt all assets, optionally rotating the key material:

```bash
/encrypt-assets re-encrypt --plugin opspal-salesforce --rotate-key
```

### Status

Show encryption configuration and asset inventory:

```bash
/encrypt-assets status --plugin opspal-salesforce
```

## How It Works

1. **Encryption**: AES-256-GCM with HKDF-derived per-file keys. Each `.enc` file embeds a unique salt.
2. **AAD binding**: Ciphertext is bound to plugin name + file path using the scoped `v2` cryptographic context.
3. **Runtime decryption**: SessionStart hook batch-decrypts to `~/.claude/opspal-enc/runtime/{session}/`.
4. **Path rewriting**: PreToolUse hooks transparently rewrite Bash/Read references to decrypted paths.
5. **Cleanup**: Stop hook securely wipes decrypted files when session ends.

## Key Sources (checked in order)

1. `OPSPAL_PLUGIN_KEYRING_JSON` environment variable (JSON map of `tier1` / `tier2` / `tier3`)
2. `~/.claude/opspal-enc/tier1.key`, `tier2.key`, and `tier3.key`

## Implementation

Run the underlying script directly:

```bash
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js <subcommand> [options]
```
