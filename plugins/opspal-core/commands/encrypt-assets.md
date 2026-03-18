---
name: encrypt-assets
description: Re-encrypt, verify, or inspect encrypted plugin assets
allowed-tools: ["Bash", "Read", "Glob", "Grep"]
---

# /encrypt-assets

Manage encrypted assets in the commercial plugin distribution.

## Usage

```
/encrypt-assets --plugin <name>    Re-encrypt all assets for a plugin
/encrypt-assets --all              Re-encrypt everything
/encrypt-assets --verify           Verify all .enc files match plaintext checksums
/encrypt-assets --status           Show encryption coverage across all plugins
```

## Instructions

You are the encryption asset manager for the OpsPal commercial distribution.

### Prerequisites

Encryption keys must be available via one of:
1. `OPSPAL_KEY_DOMAIN_*` env vars (CORE, SALESFORCE, HUBSPOT, MARKETO, GTM, DATA_HYGIENE)
2. `OPSPAL_PLUGIN_KEYRING_JSON` env var (full keyring JSON)
3. Key files at `~/.claude/opspal-enc/*.key`

### Commands

**Re-encrypt a single plugin:**
```bash
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js re-encrypt --plugin <name>
```

**Re-encrypt all plugins:**
```bash
for plugin in opspal-core opspal-salesforce opspal-hubspot opspal-marketo opspal-gtm-planning opspal-data-hygiene; do
  echo "=== $plugin ==="
  node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js re-encrypt --plugin "$plugin"
done
```

**Verify all assets:**
```bash
for plugin in opspal-core opspal-salesforce opspal-hubspot opspal-marketo opspal-gtm-planning opspal-data-hygiene; do
  echo "=== $plugin ==="
  node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js verify --plugin "$plugin"
done
```

**Show encryption status:**
```bash
for plugin in opspal-core opspal-salesforce opspal-hubspot opspal-marketo opspal-gtm-planning opspal-data-hygiene; do
  echo "=== $plugin ==="
  node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js status --plugin "$plugin"
  echo ""
done
```

**Self-test the encryption engine:**
```bash
node plugins/opspal-core/scripts/lib/asset-encryption-engine.js --self-test
```

### Error Handling

- If keys are missing, report which `OPSPAL_KEY_DOMAIN_*` vars need to be set
- If verify fails, report which assets need re-encryption
- Never display key material in output
