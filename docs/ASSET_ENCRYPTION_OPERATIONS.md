# Asset Encryption Operations Guide

**Status**: Active — 37 assets encrypted across 6 plugins
**Date**: 2026-03-03
**System Version**: 1.1.0 (engine + CLI + hooks)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Encryption Inventory](#encryption-inventory)
4. [Decryption Mechanism](#decryption-mechanism)
5. [Hook Chain](#hook-chain)
6. [Key Management](#key-management)
7. [Operations Runbook](#operations-runbook)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Selective Encryption System protects proprietary intellectual property (scoring algorithms, benchmark databases, assessment frameworks) while keeping operational infrastructure unencrypted. Files are committed as `.enc` blobs (AES-256-GCM) and transparently decrypted at runtime via Claude Code hooks.

### What's Encrypted (and Why)

| Tier | Category | Count | Examples |
|------|----------|-------|---------|
| **Tier 1** (Critical IP) | Scoring weights, benchmark DBs, assessment rubrics | 13 | `scoring-weights.json`, `sales-benchmarks.json`, `agent-permission-matrix.json` |
| **Tier 2** (Algorithms) | Scoring engines, risk analyzers, competitive intel | 17 | `automation-risk-scorer.js`, `dedup-clustering-engine.js`, `lead-quality-scorer.js` |
| **Tier 3** (Methodology) | Planning models, funnel definitions, persona configs | 7 | `anomaly-patterns.json`, `funnel-stage-definitions.json`, `persona-kpi-contracts.json` |

### What's NOT Encrypted (Intentionally)

- Test files (`test-*.js`) — needed for CI/validation
- Schema files (`*.schema.json`) — structural definitions, not IP
- Infrastructure scripts (auth managers, throttlers, API clients) — plumbing
- Config registries (agent-alias-cache, command-registry) — routing data
- Operational utilities (ledger, snapshot, rollback) — support tooling

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                        ENCRYPTION LIFECYCLE                          │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Author Time               Git Repo                Runtime Session    │
│  ┌──────────────┐  encrypt ┌──────────────┐  SessionStart  ┌───────┐ │
│  │ scoring.js   │ ───────▶ │ scoring.js   │ ──────────────▶│ ~/    │ │
│  │ (plaintext)  │          │ .enc         │    decrypt     │.claude│ │
│  └──────┬───────┘          │ (AES-256-GCM)│               │/ops.. │ │
│         │                  └──────────────┘               │/run.. │ │
│         │ .gitignore'd          │ committed               │/sid/  │ │
│         └───────────────────────┘                         └───┬───┘ │
│                                                               │      │
│                                                    PreToolUse hooks   │
│                                               rewrite paths silently  │
│                                                               │      │
│                                                    Stop hook          │
│                                               shred + rm all files   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Cryptographic Details

| Parameter | Value |
|-----------|-------|
| Algorithm | AES-256-GCM (authenticated encryption) |
| Key derivation | HKDF (RFC 5869) with HMAC-SHA256 |
| AAD binding | `"opspal-enc:v1:{plugin}:{asset_path}"` — prevents cross-plugin/cross-path replay |
| Salt | 16 bytes random per file |
| Nonce | 12 bytes random per file |
| Auth tag | 16 bytes |
| Wire format | 52-byte header (`OENC` magic + salt + nonce + tag) + ciphertext |
| Dependencies | Zero — Node.js built-in `crypto` only (requires Node >= 15) |

### Wire Format (.enc files)

```
Offset  Size  Content
0-3     4B    Magic "OENC" (0x4F454E43)
4       1B    Format version (0x01)
5-7     3B    Reserved flags
8-23    16B   HKDF salt
24-35   12B   GCM nonce
36-51   16B   GCM auth tag
52+     var   Ciphertext
```

---

## Encryption Inventory

### opspal-core (14 files)

#### Tier 1 — Config Databases

| File | Size | Checksum (SHA256 prefix) |
|------|------|--------------------------|
| `config/scoring-weights.json` | 11,349 B | `11812eb6...` |
| `config/sales-benchmarks.json` | 21,111 B | `2056b629...` |
| `config/intelligent-intake-rubric.json` | 3,673 B | `3b53c437...` |
| `config/complexity-rubric.json` | 5,255 B | `152c7d89...` |

#### Tier 2 — Scoring Engines

| File | Size | Checksum (SHA256 prefix) |
|------|------|--------------------------|
| `scripts/lib/sales-benchmark-engine.js` | 49,653 B | `0cc47c14...` |
| `scripts/lib/complexity-scorer.js` | 10,555 B | `66f1771e...` |
| `scripts/lib/expansion-opportunity-scorer.js` | 21,715 B | `20f4cb7e...` |
| `scripts/lib/gong-risk-analyzer.js` | 13,041 B | `27cbe929...` |
| `scripts/lib/gong-competitor-tracker.js` | 7,653 B | `5b83c504...` |

#### Tier 3 — Methodology Configs

| File | Size | Checksum (SHA256 prefix) |
|------|------|--------------------------|
| `config/anomaly-patterns.json` | 8,347 B | `e5217d87...` |
| `config/quality-gate-rules.json` | 8,565 B | `effa8f7e...` |
| `config/funnel-stage-definitions.json` | 10,174 B | `246912eb...` |
| `config/persona-definitions.json` | 8,914 B | `f9faac6e...` |
| `config/assessment-prefills.json` | 3,373 B | `d7eb3059...` |

### opspal-salesforce (12 files)

#### Tier 1 — Assessment Frameworks

| File | Size |
|------|------|
| `config/agent-permission-matrix.json` | 34,049 B |
| `config/order-of-operations-v3.50.json` | 11,839 B |
| `config/decision-kpi-matrix.json` | 13,163 B |
| `config/cpq-field-mappings.json` | 11,835 B |

#### Tier 2 — Scoring Engines

| File | Size |
|------|------|
| `scripts/lib/automation-risk-scorer.js` | 14,457 B |
| `scripts/lib/architecture-health-scorer.js` | 27,180 B |
| `scripts/lib/schema-health-scorer.js` | 23,267 B |
| `scripts/lib/cpq-scorecard-generator.js` | 23,548 B |
| `scripts/lib/enhanced-data-quality-framework.js` | 27,740 B |
| `scripts/lib/agent-risk-scorer.js` | 29,069 B |

#### Tier 3 — Methodology

| File | Size |
|------|------|
| `scripts/lib/benchmark-retriever.js` | 17,538 B |
| `config/persona-kpi-contracts.json` | 7,509 B |

### opspal-data-hygiene (5 files)

| File | Tier | Size |
|------|------|------|
| `scripts/lib/dedup-clustering-engine.js` | 1 | 29,516 B |
| `scripts/lib/dedup-canonical-selector.js` | 1 | 16,660 B |
| `scripts/lib/record-match-merge-service.js` | 1 | 23,974 B |
| `scripts/lib/dedup-guardrail-manager.js` | 2 | 30,022 B |
| `scripts/lib/dedup-validation-framework.js` | 2 | 38,554 B |

### opspal-marketo (2 files)

| File | Tier | Size |
|------|------|------|
| `scripts/lib/lead-quality-scorer.js` | 2 | 15,060 B |
| `scripts/lib/scoring-rule-generator.js` | 2 | 19,235 B |

### opspal-gtm-planning (1 file)

| File | Tier | Size |
|------|------|------|
| `config/benchmark-baseline.json` | 1 | 10,067 B |

### opspal-hubspot (3 files)

| File | Tier | Size |
|------|------|------|
| `scripts/lib/seo-content-scorer.js` | 2 | 31,446 B |
| `scripts/lib/seo-technical-health-scorer.js` | 2 | 26,003 B |
| `scripts/lib/seo-content-gap-analyzer.js` | 3 | 32,730 B |

### Totals

| Plugin | Tier 1 | Tier 2 | Tier 3 | Total |
|--------|--------|--------|--------|-------|
| opspal-core | 4 | 5 | 5 | **14** |
| opspal-salesforce | 4 | 6 | 2 | **12** |
| opspal-data-hygiene | 3 | 2 | 0 | **5** |
| opspal-marketo | 0 | 2 | 0 | **2** |
| opspal-gtm-planning | 1 | 0 | 0 | **1** |
| opspal-hubspot | 0 | 2 | 1 | **3** |
| **Total** | **12** | **17** | **8** | **37** |

---

## Decryption Mechanism

The decryption system is a **4-hook chain** that makes encryption completely transparent to agents and users. No agent code needs modification — the hooks intercept at the Claude Code framework level.

### How It Works (Step by Step)

#### 1. SessionStart — Batch Decrypt

**Hook**: `session-start-asset-decryptor.sh` (timeout: 30s)

When a Claude Code session starts:

1. **Stale session cleanup** — Scans `~/.claude/opspal-enc/runtime/` for sessions older than 24 hours and removes them (covers crash recovery)
2. **Plugin discovery** — Searches 3 locations for `encryption.json` manifests:
   - `{workspace_root}/.claude-plugins/*/`
   - `{workspace_root}/plugins/*/`
   - `~/.claude/plugins/` (including `marketplaces/*/.claude-plugins/*/`)
3. **Batch decryption** — For each manifest, decrypts all assets marked `decrypt_on: ["SessionStart"]`:
   - Reads `.enc` file from plugin directory
   - Decrypts using master key + HKDF derivation with per-asset AAD
   - Validates SHA-256 checksum against manifest
   - Writes plaintext to `~/.claude/opspal-enc/runtime/{session_id}/{plugin}/{path}`
   - Sets file permissions to `0o600` (owner read/write only)
4. **Session manifest** — Writes `.session-manifest.json` with path mappings:
   ```json
   {
     "session_id": "1772592897-3160656",
     "created_at": "2026-03-03T21:54:57.000Z",
     "assets": [
       {
         "plugin": "opspal-core",
         "logical_path": "config/scoring-weights.json",
         "decrypted_path": "/home/user/.claude/opspal-enc/runtime/.../opspal-core/config/scoring-weights.json",
         "encrypted_path": "config/scoring-weights.json.enc"
       }
     ],
     "stats": { "decrypted": 37, "failed": 0, "plugins": 6 }
   }
   ```
5. **Session pointer** — Writes `~/.claude/opspal-enc/runtime/.current-session` for downstream hooks to find the active session without env vars

#### 2. PreToolUse (Bash) — Command Path Rewriting

**Hook**: `pre-tool-use-asset-resolver.sh` (timeout: 8s, matcher: `Bash`)

When any Bash command is about to execute:

1. Extracts the `command` from `tool_input`
2. Reads the session manifest from `.current-session` pointer
3. Scans the command string for any encrypted/logical asset paths
4. Replaces matches with the decrypted runtime path using **path-boundary matching** (prevents false substring replacements)
5. Returns `{ updatedInput: ... }` to Claude Code, which uses the rewritten command

**Example**:
```
Before: node plugins/opspal-core/scripts/lib/sales-benchmark-engine.js analyze
After:  node /home/user/.claude/opspal-enc/runtime/abc123/opspal-core/scripts/lib/sales-benchmark-engine.js analyze
```

#### 3. PreToolUse (Read) — File Path Rewriting

**Hook**: `pre-tool-use-asset-resolver-read.sh` (timeout: 8s, matcher: `Read`)

Same logic as the Bash resolver but for the `Read` tool's `file_path` parameter. When Claude tries to read an encrypted asset, the path is silently rewritten to the decrypted copy.

#### 4. Stop — Secure Wipe

**Hook**: `session-stop-asset-cleanup.sh` (timeout: 15s, matcher: `*`)

When the session ends:

1. Finds the session directory via `.current-session` or `OPSPAL_ENC_SESSION_DIR` env var
2. **Secure wipes** every decrypted file:
   - Prefers `shred -u` (GNU coreutils) — 3-pass overwrite + unlink
   - Falls back to `dd if=/dev/urandom` overwrite + `rm`
3. Removes the session directory tree
4. Cleans up the `.current-session` pointer
5. Logs cleanup to `~/.claude/logs/asset-cleanup.jsonl`
6. **Always exits 0** — cleanup failure never blocks session end

### Session Isolation

Each session uses its own directory under `~/.claude/opspal-enc/runtime/{CLAUDE_SESSION_ID}/`. Concurrent sessions don't interfere. The `.current-session` pointer is overwritten per-session, so only the most recent session is actively tracked (multi-session scenarios work via `OPSPAL_ENC_SESSION_DIR` env var).

### Transparency Guarantee

**No agent code needs modification.** The hooks intercept at the framework level:
- Agents reference files by their normal logical paths
- Hooks silently rewrite to decrypted paths before execution
- Agents never see `.enc` files or runtime directories
- If decryption fails, the original path passes through (graceful degradation when `allow_plaintext_fallback: true`)

---

## Hook Chain

| # | Hook | Event | Matcher | Timeout | Purpose |
|---|------|-------|---------|---------|---------|
| 1 | `session-start-asset-decryptor.sh` | SessionStart | * | 30s | Batch decrypt all SessionStart assets |
| 2 | `pre-tool-use-asset-resolver.sh` | PreToolUse | Bash | 8s | Rewrite encrypted paths in Bash commands |
| 3 | `pre-tool-use-asset-resolver-read.sh` | PreToolUse | Read | 8s | Rewrite encrypted paths in Read file_path |
| 4 | `session-stop-asset-cleanup.sh` | Stop | * | 15s | Secure-wipe all decrypted files |

All hooks are registered in `plugins/opspal-core/.claude-plugin/hooks.json`.

---

## Key Management

### Key Sources (checked in order)

| Priority | Source | Use Case |
|----------|--------|----------|
| 1 | `OPSPAL_PLUGIN_MASTER_KEY` env var | CI/CD, automated deployments |
| 2 | `~/.claude/opspal-enc/master.key` | Developer workstations (default) |
| 3 | `~/.claude/opspal-enc/{plugin}.key` | Per-plugin key override (advanced) |

### Key Properties

- **Size**: 32 bytes (256 bits), stored as base64
- **File permissions**: `0o600` (owner read/write only)
- **Directory permissions**: `0o700` (owner only)
- **Not committed to git** — `~/.claude/` is outside any repo

### Key Rotation

```bash
# Re-encrypt all assets in a plugin with a new key
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js re-encrypt --plugin opspal-core --rotate-key

# This:
# 1. Decrypts all assets with old key
# 2. Re-encrypts with new key (two-phase to prevent partial failure)
# 3. Updates master.key file
# 4. Updates checksums in encryption.json
```

### Team Distribution

The master key must be shared securely with team members:
- Use a secrets manager (1Password, Vault, etc.)
- Or set `OPSPAL_PLUGIN_MASTER_KEY` env var in each developer's shell profile
- Never commit the key to any repository

---

## Operations Runbook

### Encrypt a New File

```bash
# 1. Encrypt the file
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js encrypt \
  --plugin opspal-salesforce --file scripts/lib/new-scorer.js

# 2. Verify
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js verify \
  --plugin opspal-salesforce

# 3. Sync to marketplace install (until next plugin update)
cp /path/to/source/plugins/opspal-salesforce/scripts/lib/new-scorer.js.enc \
   ~/.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins/opspal-salesforce/scripts/lib/
cp /path/to/source/plugins/opspal-salesforce/.claude-plugin/encryption.json \
   ~/.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins/opspal-salesforce/.claude-plugin/

# 4. Commit the .enc file (NOT the plaintext — it's gitignored)
cd /path/to/source && git add plugins/opspal-salesforce/scripts/lib/new-scorer.js.enc
```

### Check Status

```bash
# Status for one plugin
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js status --plugin opspal-core

# Verify integrity for one plugin
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js verify --plugin opspal-core

# Status for all plugins
for p in opspal-core opspal-salesforce opspal-data-hygiene opspal-marketo opspal-gtm-planning opspal-hubspot; do
  echo "=== $p ==="
  node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js verify --plugin "$p"
done
```

### Decrypt a File (Development)

```bash
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js decrypt \
  --plugin opspal-core --file config/scoring-weights.json --output-dir /tmp/
# Output: /tmp/scoring-weights.json
```

### Rotate Keys

```bash
# Rotate for one plugin (generates new key + re-encrypts)
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js re-encrypt \
  --plugin opspal-core --rotate-key

# Re-encrypt all plugins with the same new key
for p in opspal-core opspal-salesforce opspal-data-hygiene opspal-marketo opspal-gtm-planning opspal-hubspot; do
  node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js re-encrypt --plugin "$p"
done
```

### Sync to Marketplace Installs

After encrypting new files or rotating keys, sync to the marketplace installs:

```bash
SRC=/path/to/opspal-internal-plugins/plugins
DST=~/.claude/plugins/marketplaces/revpal-internal-plugins/.claude-plugins

for plugin in opspal-core opspal-salesforce opspal-data-hygiene opspal-marketo opspal-gtm-planning opspal-hubspot; do
  # Sync encryption manifest
  cp "$SRC/$plugin/.claude-plugin/encryption.json" "$DST/$plugin/.claude-plugin/" 2>/dev/null
  # Sync .enc files
  find "$SRC/$plugin" -name "*.enc" -exec sh -c '
    rel="${1#'"$SRC/$plugin/"'}"
    mkdir -p "$(dirname "'"$DST/$plugin/"'$rel")"
    cp "$1" "'"$DST/$plugin/"'$rel"
  ' _ {} \;
done
```

This sync happens automatically on `pluginupdate` / reinstall.

---

## Troubleshooting

### "No master key found"

```bash
# Check if key file exists
ls -la ~/.claude/opspal-enc/master.key

# If missing, generate one
node plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js key-setup

# Or set env var
export OPSPAL_PLUGIN_MASTER_KEY="<base64-key>"
```

### "No plugins with encryption manifests found" (SessionStart hook)

The hook searches these directories for `.claude-plugin/encryption.json`:
1. `{git_root}/.claude-plugins/*/`
2. `{git_root}/plugins/*/`
3. `~/.claude/plugins/` (direct + marketplace subdirs)

If manifests aren't found, sync them to the marketplace install (see above).

### Decryption succeeds but agent can't find file

The PreToolUse hooks rewrite paths using the session manifest. Check:
```bash
# Is a session active?
cat ~/.claude/opspal-enc/runtime/.current-session

# Are files present?
ls -R $(cat ~/.claude/opspal-enc/runtime/.current-session)/
```

### Dev mode (skip encryption)

```bash
export OPSPAL_ENC_DEV_MODE=1  # PreToolUse hooks pass through, no rewriting
```

### Verify hook registration

```bash
grep -A2 "asset-resolver\|asset-decryptor\|asset-cleanup" \
  plugins/opspal-core/.claude-plugin/hooks.json
```

### Run test suite

```bash
node plugins/opspal-core/scripts/lib/test-asset-encryption.js
# Expected: 32 passed, 0 failed
```

---

## File Reference

| Component | Path | Purpose |
|-----------|------|---------|
| Engine | `plugins/opspal-core/scripts/lib/asset-encryption-engine.js` | Core encrypt/decrypt/verify/HKDF library |
| CLI | `plugins/opspal-core/scripts/lib/plugin-asset-encryptor.js` | CLI with key-setup/init/encrypt/decrypt/verify/re-encrypt/status |
| Tests | `plugins/opspal-core/scripts/lib/test-asset-encryption.js` | 32-test suite (engine + CLI + hooks) |
| Decrypt hook | `plugins/opspal-core/hooks/session-start-asset-decryptor.sh` | SessionStart batch decryption |
| Bash resolver | `plugins/opspal-core/hooks/pre-tool-use-asset-resolver.sh` | PreToolUse Bash path rewriting |
| Read resolver | `plugins/opspal-core/hooks/pre-tool-use-asset-resolver-read.sh` | PreToolUse Read path rewriting |
| Cleanup hook | `plugins/opspal-core/hooks/session-stop-asset-cleanup.sh` | Stop secure wipe |
| Hook registration | `plugins/opspal-core/.claude-plugin/hooks.json` | Hook configuration |
| Key file | `~/.claude/opspal-enc/master.key` | Master encryption key (never committed) |
| Runtime dir | `~/.claude/opspal-enc/runtime/{session_id}/` | Decrypted files (ephemeral) |
| Cleanup log | `~/.claude/logs/asset-cleanup.jsonl` | Cleanup audit trail |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPSPAL_PLUGIN_MASTER_KEY` | — | Base64-encoded 32-byte master key (highest priority) |
| `OPSPAL_ENC_DEV_MODE` | `0` | Skip PreToolUse path rewriting (use plaintext directly) |
| `OPSPAL_ENC_SESSION_DIR` | auto | Override session runtime directory |
| `ASSET_DECRYPTOR_VERBOSE` | `0` | Verbose SessionStart hook logging |
| `ASSET_CLEANUP_VERBOSE` | `0` | Verbose cleanup logging |
| `CLAUDE_SESSION_ID` | auto | Session identifier (set by Claude Code) |

---

## Security Properties

1. **Authenticated encryption** — AES-256-GCM provides both confidentiality and integrity
2. **Per-file unique keys** — HKDF derives unique keys from master key + random salt per file
3. **Cross-plugin replay prevention** — AAD includes `plugin:path`, so a `.enc` file from one plugin cannot be used in another
4. **Ephemeral plaintext** — Decrypted files exist only during active sessions, wiped on stop
5. **Secure deletion** — Uses `shred` (3-pass overwrite) or `dd`+`rm` fallback
6. **Session isolation** — Each session has its own runtime directory
7. **Stale session cleanup** — Orphaned sessions (>24h) are auto-cleaned on next start
8. **No external dependencies** — Uses only Node.js built-in `crypto` module
