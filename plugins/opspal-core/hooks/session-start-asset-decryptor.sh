#!/usr/bin/env bash
# =============================================================================
# Session Start Asset Decryptor
# =============================================================================
#
# Purpose: Batch-decrypt encrypted plugin assets at session start.
#   Scans all installed plugins for encryption.json manifests and decrypts
#   assets marked with decrypt_on: ["SessionStart"] to a session-specific
#   runtime directory.
#
# Version: 1.1.0
# Created: 2026-03-03
# Updated: 2026-03-03 — Fix C1-C3/H1/M4/M5: env-var passing, .current-session,
#   orphan cleanup, atomic mkdir
#
# Event: SessionStart
# Timeout: 30000ms
#
# Runtime directory: ~/.claude/opspal-enc/runtime/{CLAUDE_SESSION_ID}/{plugin}/{path}
#
# =============================================================================

set -euo pipefail

# Skip in test mode — decryption is expensive and requires real license keys
if [ "${HOOK_TEST_MODE:-}" = "1" ]; then
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Source error handler
ERROR_HANDLER="$PLUGIN_ROOT/hooks/lib/error-handler.sh"
if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="session-start-asset-decryptor"
    set_lenient_mode 2>/dev/null || true
fi

# Configuration
VERBOSE="${ASSET_DECRYPTOR_VERBOSE:-0}"
ENC_BASE_DIR="$HOME/.claude/opspal-enc"
RUNTIME_BASE="$ENC_BASE_DIR/runtime"
SESSION_ID="${CLAUDE_SESSION_ID:-$(date +%s)-$$}"
SESSION_DIR="$RUNTIME_BASE/$SESSION_ID"
DECRYPTOR_SCRIPT="$PLUGIN_ROOT/scripts/lib/asset-encryption-engine.js"
RUNTIME_HELPER_SCRIPT="$PLUGIN_ROOT/scripts/lib/protected-asset-runtime.js"
MANIFEST_NAME=".claude-plugin/encryption.json"
MESSAGES=()

log_verbose() {
    if [[ "$VERBOSE" = "1" ]]; then
        echo "[asset-decryptor] $1" >&2
    fi
}

# =============================================================================
# 1. Pre-flight checks
# =============================================================================

if ! command -v node &>/dev/null; then
    log_verbose "Node.js not available, skipping asset decryption"
    echo '{}'
    exit 0
fi

if [[ ! -f "$DECRYPTOR_SCRIPT" ]]; then
    log_verbose "Encryption engine not found at $DECRYPTOR_SCRIPT"
    echo '{}'
    exit 0
fi

# =============================================================================
# 2. Clean up stale sessions (from crashes)
# =============================================================================

cleanup_stale_sessions() {
    if [[ ! -d "$RUNTIME_BASE" ]]; then
        return
    fi

    local now
    now=$(date +%s)
    local max_age=86400  # 24 hours

    for session_dir in "$RUNTIME_BASE"/*/; do
        [[ -d "$session_dir" ]] || continue
        # Skip the .current-session pointer file
        [[ "$(basename "$session_dir")" = ".current-session" ]] && continue

        local session_manifest="$session_dir/.session-manifest.json"
        if [[ -f "$session_manifest" ]]; then
            local created_at
            created_at=$(stat -c %Y "$session_manifest" 2>/dev/null || stat -f %m "$session_manifest" 2>/dev/null || echo "0")
            local age=$((now - created_at))
            if [[ "$age" -gt "$max_age" ]]; then
                log_verbose "Cleaning stale session: $(basename "$session_dir") (age: ${age}s)"
                rm -rf "$session_dir" 2>/dev/null || true
            fi
        else
            # Fix M4: Clean directories WITHOUT a manifest (crashed before manifest write)
            local dir_age
            dir_age=$(stat -c %Y "$session_dir" 2>/dev/null || stat -f %m "$session_dir" 2>/dev/null || echo "0")
            local age=$((now - dir_age))
            if [[ "$age" -gt "$max_age" ]]; then
                log_verbose "Cleaning orphan session dir: $(basename "$session_dir") (age: ${age}s)"
                rm -rf "$session_dir" 2>/dev/null || true
            fi
        fi
    done
}

cleanup_stale_sessions

# =============================================================================
# 2b. Restore agent stubs from any prior crashed session
# =============================================================================
# If a prior session crashed without running session-stop, agent stubs may still
# be overwritten with full-body agents. Restore from backups before proceeding.

restore_stale_agent_stubs() {
    [[ -d "$RUNTIME_BASE" ]] || return
    for session_dir in "$RUNTIME_BASE"/*/; do
        [[ -d "$session_dir" ]] || continue
        [[ "$(basename "$session_dir")" = ".current-session" ]] && continue
        local manifest="$session_dir/.session-manifest.json"
        [[ -f "$manifest" ]] || continue
        if command -v node &>/dev/null; then
            ENC_STALE_MANIFEST="$manifest" node -e '
                const fs = require("fs");
                try {
                    const m = JSON.parse(fs.readFileSync(process.env.ENC_STALE_MANIFEST, "utf8"));
                    for (const asset of (m.assets || [])) {
                        if (asset.stub_backup_path && asset.overwritten_path) {
                            try {
                                if (fs.existsSync(asset.stub_backup_path)) {
                                    fs.copyFileSync(asset.stub_backup_path, asset.overwritten_path);
                                }
                            } catch {}
                        }
                    }
                } catch {}
            ' 2>/dev/null || true
        fi
    done
}

restore_stale_agent_stubs

# =============================================================================
# 3. Discover plugins with encryption manifests
# =============================================================================

discover_encrypted_plugins() {
    local found=()

    # Search in .claude-plugins/ (symlinked workspace)
    local workspace_root
    workspace_root=$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || echo "$(pwd)")

    for plugins_dir in \
        "$workspace_root/.claude-plugins" \
        "$workspace_root/plugins" \
        "$HOME/.claude/plugins"; do

        [[ -d "$plugins_dir" ]] || continue

        for plugin_dir in "$plugins_dir"/*/; do
            [[ -d "$plugin_dir" ]] || continue
            local manifest="$plugin_dir/$MANIFEST_NAME"
            if [[ -f "$manifest" ]]; then
                found+=("$plugin_dir")
            fi
        done

        # Also check marketplace subdirectories
        if [[ -d "$plugins_dir/marketplaces" ]]; then
            for marketplace_dir in "$plugins_dir/marketplaces"/*/; do
                [[ -d "$marketplace_dir" ]] || continue
                for sub in ".claude-plugins" "plugins"; do
                    local sub_dir="$marketplace_dir/$sub"
                    [[ -d "$sub_dir" ]] || continue
                    for plugin_dir in "$sub_dir"/*/; do
                        [[ -d "$plugin_dir" ]] || continue
                        local manifest="$plugin_dir/$MANIFEST_NAME"
                        if [[ -f "$manifest" ]]; then
                            found+=("$plugin_dir")
                        fi
                    done
                done
            done
        fi
    done

    printf '%s\n' "${found[@]}" 2>/dev/null || true
}

# =============================================================================
# 3b. License-gated key delivery
# =============================================================================

LICENSE_AUTH_CLIENT="$PLUGIN_ROOT/scripts/lib/license-auth-client.js"
ALLOWED_TIERS=""
LICENSE_TERMINATED=0

if [[ -f "$LICENSE_AUTH_CLIENT" ]]; then
    log_verbose "Checking license for tier-gated decryption..."
    LICENSE_RESULT=$(node "$LICENSE_AUTH_CLIENT" session-token 2>/dev/null) || true

    if [[ -n "$LICENSE_RESULT" ]]; then
        # Check for termination signal
        if echo "$LICENSE_RESULT" | node -e '
            const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
            process.exit(d.terminated === true ? 0 : 1);
        ' 2>/dev/null; then
            log_verbose "License terminated — wiping cache and blocking decryption"
            # Server confirmed license termination - wipe active cache only.
            # Do NOT remove license-cache.json.bak (preserved as recovery artifact).
            rm -f "$HOME/.opspal/license-cache.json" "$HOME/.opspal/license.key" 2>/dev/null || true
            LICENSE_TERMINATED=1
            MESSAGES+=("License terminated: decryption blocked. Contact support@gorevpal.com")
        elif echo "$LICENSE_RESULT" | node -e '
            const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
            process.exit(d.valid === true ? 0 : 1);
        ' 2>/dev/null; then
            # Valid license — extract allowed tiers and server-delivered key material
            ALLOWED_TIERS=$(echo "$LICENSE_RESULT" | node -e '
                const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
                console.log((d.allowed_asset_tiers || []).join(","));
            ' 2>/dev/null || echo "")

            # Use the scoped keyring delivered by the license server when available.
            SERVER_KEYRING=$(echo "$LICENSE_RESULT" | node -e '
                const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
                if (d.key_bundle && d.key_bundle.version === 2 && d.key_bundle.keys) {
                    process.stdout.write(JSON.stringify(d.key_bundle.keys));
                }
            ' 2>/dev/null || echo "")

            if [[ -n "$SERVER_KEYRING" ]]; then
                export OPSPAL_PLUGIN_KEYRING_JSON="$SERVER_KEYRING"
                log_verbose "Using server-delivered scoped keyring (tier: $(echo "$LICENSE_RESULT" | node -e 'const d=JSON.parse(require(\"fs\").readFileSync(\"/dev/stdin\",\"utf8\"));console.log(d.tier||\"unknown\")' 2>/dev/null))"
            else
                log_verbose "License is valid but no scoped keyring was delivered"
            fi
        else
            LICENSE_ERROR=$(echo "$LICENSE_RESULT" | node -e '
                const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
                console.log(d.message || d.error || "");
            ' 2>/dev/null || echo "")
            if [[ -n "$LICENSE_ERROR" ]]; then
                MESSAGES+=("$LICENSE_ERROR")
            fi
        fi
    fi
fi

# =============================================================================
# 4. Batch decrypt
# =============================================================================

PLUGINS_FOUND=0
ASSETS_DECRYPTED=0
ASSETS_FAILED=0

decrypt_plugin_assets() {
    local plugin_dir="$1"
    local manifest_path="$plugin_dir/$MANIFEST_NAME"

    # Extract plugin name — pass manifest via env var, not interpolation (Fix C1)
    local plugin_name
    plugin_name=$(ENC_MANIFEST="$manifest_path" node -e '
        const fs = require("fs");
        const m = process.env.ENC_MANIFEST;
        if (!m || !fs.existsSync(m)) { process.exit(0); }
        const d = JSON.parse(fs.readFileSync(m, "utf8"));
        console.log(d.plugin || "");
    ' 2>/dev/null || echo "")

    if [[ -z "$plugin_name" ]]; then
        log_verbose "Could not read plugin name from $manifest_path"
        return
    fi

    PLUGINS_FOUND=$((PLUGINS_FOUND + 1))
    log_verbose "Processing plugin: $plugin_name"

    # Use Node.js to iterate assets and decrypt — all paths via env vars (Fix C1/C2/C3)
    # ENC_ALLOWED_TIERS: comma-separated tiers the license allows (empty = no filtering)
    ENC_ENGINE="$DECRYPTOR_SCRIPT" \
    ENC_RUNTIME_HELPER="$RUNTIME_HELPER_SCRIPT" \
    ENC_MANIFEST="$manifest_path" \
    ENC_PLUGIN_DIR="$plugin_dir" \
    ENC_SESSION_DIR="$SESSION_DIR" \
    ENC_ALLOWED_TIERS="$ALLOWED_TIERS" \
    ENC_LICENSE_TERMINATED="$LICENSE_TERMINATED" \
    OPSPAL_DISABLE_LOCAL_KEY_FILES="1" \
    node -e '
        const engine = require(process.env.ENC_ENGINE);
        const fs = require("fs");
        const path = require("path");
        const runtime = require(process.env.ENC_RUNTIME_HELPER);

        // If license was terminated, skip all decryption
        if (process.env.ENC_LICENSE_TERMINATED === "1") {
            console.log(JSON.stringify({ type: "terminated", plugin: "all", results: [] }));
            process.exit(0);
        }

        const manifest = JSON.parse(fs.readFileSync(process.env.ENC_MANIFEST, "utf8"));
        const pluginName = manifest.plugin;
        const pluginDir = process.env.ENC_PLUGIN_DIR;
        const sessionDir = process.env.ENC_SESSION_DIR;
        runtime.prepareRuntimeOverlay({
            pluginDir,
            pluginName,
            sessionDir,
            manifest
        });
        const keyMaterial = engine.resolveKeyMaterial(pluginName);

        if (!keyMaterial) {
            console.log(JSON.stringify({ type: "no-key", plugin: pluginName }));
            process.exit(0);
        }

        // Domain filtering: if ALLOWED_TIERS is set, only decrypt matching assets
        const allowedTiersStr = process.env.ENC_ALLOWED_TIERS || "";
        const allowedTiers = allowedTiersStr ? allowedTiersStr.split(",").filter(Boolean) : null;

        const results = [];

        for (const asset of (manifest.encrypted_assets || [])) {
            if (!asset.decrypt_on || !asset.decrypt_on.includes("SessionStart")) {
                results.push({ path: asset.path, status: "deferred", mode: asset.decrypt_on });
                continue;
            }

            // License gate: allowed_asset_tiers now carries domain names.
            if (allowedTiers) {
                const requiredTier = asset.required_domain || asset.required_tier || "core";
                if (!allowedTiers.includes(requiredTier)) {
                    results.push({
                        path: asset.path,
                        status: "tier_blocked",
                        required_tier: requiredTier,
                        required_domain: requiredTier,
                        allowed_tiers: allowedTiers
                    });
                    continue;
                }
            }

            const encPath = path.resolve(pluginDir, asset.encrypted_path);
            if (!fs.existsSync(encPath)) {
                results.push({ path: asset.path, status: "missing", encPath: asset.encrypted_path });
                continue;
            }

            const outputPath = path.join(sessionDir, pluginName, asset.path);

            try {
                engine.decryptFile(encPath, outputPath, pluginName, asset.path, keyMaterial, {
                    expectedChecksum: asset.checksum_plaintext,
                    fileMode: 0o600
                });

                // Agent body in-place overwrite: replace the stub with the decrypted full-body agent
                if (asset.asset_type === "agent_body") {
                    const agentStubPath = path.resolve(pluginDir, asset.path);
                    const backupPath = outputPath + ".stub-backup";

                    // Read decrypted content and inline @import directives
                    let body = fs.readFileSync(outputPath, "utf8");
                    body = body.replace(/^@import\s+(.+)$/gm, (match, importPath) => {
                        const trimmed = importPath.trim();
                        // Resolve relative to plugin agents/ dir or plugin root
                        const candidates = [
                            path.resolve(pluginDir, trimmed),
                            path.resolve(pluginDir, "agents", trimmed),
                            // Cross-plugin: resolve relative to parent plugins dir
                            path.resolve(pluginDir, "..", trimmed)
                        ];
                        for (const candidate of candidates) {
                            try {
                                if (fs.existsSync(candidate)) {
                                    return fs.readFileSync(candidate, "utf8");
                                }
                            } catch { /* skip */ }
                        }
                        return match; // Leave unresolved imports as-is
                    });

                    // Back up the current stub before overwriting
                    if (fs.existsSync(agentStubPath)) {
                        fs.copyFileSync(agentStubPath, backupPath);
                    }

                    // Overwrite the stub with the full decrypted + inlined agent
                    fs.writeFileSync(agentStubPath, body, { mode: 0o644 });

                    results.push({
                        path: asset.path,
                        status: "ok",
                        asset_type: "agent_body",
                        decrypted_path: outputPath,
                        stub_backup_path: backupPath,
                        overwritten_path: agentStubPath,
                        plugin: pluginName,
                        encrypted_path: asset.encrypted_path
                    });
                } else {
                    results.push({
                        path: asset.path,
                        status: "ok",
                        decrypted_path: outputPath,
                        plugin: pluginName,
                        encrypted_path: asset.encrypted_path
                    });
                }
            } catch (err) {
                results.push({
                    path: asset.path,
                    status: "failed",
                    error: err.message,
                    plugin: pluginName
                });
            }
        }

        console.log(JSON.stringify({ plugin: pluginName, results }));
    ' 2>/dev/null || echo '{"plugin":"unknown","results":[]}'
}

# Main processing loop
PLUGIN_DIRS=$(discover_encrypted_plugins)

if [[ -z "$PLUGIN_DIRS" ]]; then
    log_verbose "No plugins with encryption manifests found"
    echo '{}'
    exit 0
fi

# =============================================================================
# 3a. First-run license guidance (show if encrypted assets exist but no key)
# =============================================================================

LICENSE_GUIDANCE_SCRIPT="$PLUGIN_ROOT/scripts/lib/license-activation-manager.js"
if [[ -f "$LICENSE_GUIDANCE_SCRIPT" ]]; then
    GUIDANCE_JSON=$(node "$LICENSE_GUIDANCE_SCRIPT" check-guidance 2>/dev/null) || true
    if [[ -n "$GUIDANCE_JSON" ]]; then
        SHOW_GUIDANCE=$(echo "$GUIDANCE_JSON" | node -e '
            const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
            if (d.show_guidance) console.log(d.message || "");
        ' 2>/dev/null || echo "")
        if [[ -n "$SHOW_GUIDANCE" ]]; then
            echo "$SHOW_GUIDANCE" >&2
            echo "  For a guided activation walkthrough, run: /opspalfirst" >&2
            echo "" >&2
        fi
    fi
fi

# Fix M5: Atomic directory creation with permissions
install -d -m 700 "$SESSION_DIR" 2>/dev/null || mkdir -p "$SESSION_DIR" 2>/dev/null || true

# Fix H1: Write .current-session pointer for downstream hooks
mkdir -p "$RUNTIME_BASE" 2>/dev/null || true
echo "$SESSION_DIR" > "$RUNTIME_BASE/.current-session" 2>/dev/null || true

# Track results for session manifest
ALL_RESULTS="[]"
ALL_BLOCKED="[]"
ASSETS_BLOCKED=0

while IFS= read -r plugin_dir; do
    [[ -n "$plugin_dir" ]] || continue

    result_json=$(decrypt_plugin_assets "$plugin_dir")

    if echo "$result_json" | grep -q '"type":"no-key"'; then
        plugin_name=$(printf '%s' "$result_json" | node -e '
            const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
            console.log(d.plugin || "unknown");
        ' 2>/dev/null || echo "unknown")
        MESSAGES+=("Encrypted assets remain locked for $plugin_name until this machine has a valid OpsPal license. Run /activate-license <email> <license-key>.")
        continue
    fi

    # Count results — pass result_json via stdin (Fix C1)
    ok_count=$(printf '%s' "$result_json" | node -e '
        const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
        console.log((d.results||[]).filter(r=>r.status==="ok").length);
    ' 2>/dev/null || echo "0")

    fail_count=$(printf '%s' "$result_json" | node -e '
        const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
        const failed = (d.results||[]).filter(r=>r.status==="failed");
        failed.forEach(f => process.stderr.write("CRITICAL: Asset decryption failed: " + f.path + " - " + f.error + "\n"));
        console.log(failed.length);
    ' 2>/dev/null || echo "0")

    blocked_count=$(printf '%s' "$result_json" | node -e '
        const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
        console.log((d.results||[]).filter(r=>r.status==="tier_blocked").length);
    ' 2>/dev/null || echo "0")

    ASSETS_DECRYPTED=$((ASSETS_DECRYPTED + ok_count))
    ASSETS_FAILED=$((ASSETS_FAILED + fail_count))
    ASSETS_BLOCKED=$((ASSETS_BLOCKED + blocked_count))

    # Merge into session manifest data — pass both via stdin + env (Fix C1/C2)
    MERGE_OUTPUT=$(printf '%s' "$result_json" | ENC_PREV_RESULTS="$ALL_RESULTS" ENC_PREV_BLOCKED="$ALL_BLOCKED" node -e '
        const fs = require("fs");
        const prev = JSON.parse(process.env.ENC_PREV_RESULTS);
        const prevBlocked = JSON.parse(process.env.ENC_PREV_BLOCKED || "[]");
        const curr = JSON.parse(fs.readFileSync("/dev/stdin","utf8"));
        const merged = prev.concat((curr.results||[]).filter(r=>r.status==="ok").map(r=>{
            const entry = {
                plugin: curr.plugin,
                logical_path: r.path,
                decrypted_path: r.decrypted_path,
                encrypted_path: r.encrypted_path
            };
            // Preserve agent_body backup metadata for session-stop restoration
            if (r.asset_type === "agent_body") {
                entry.asset_type = "agent_body";
                entry.stub_backup_path = r.stub_backup_path;
                entry.overwritten_path = r.overwritten_path;
            }
            return entry;
        }));
        const mergedBlocked = prevBlocked.concat((curr.results||[]).filter(r=>r.status==="tier_blocked").map(r=>({
            plugin: curr.plugin,
            logical_path: r.path,
            encrypted_path: r.encrypted_path || r.path.replace(/\.([^.]+)$/, ".$1.enc"),
            required_tier: r.required_tier
        })));
        console.log(JSON.stringify({ assets: merged, blocked: mergedBlocked }));
    ' 2>/dev/null || echo "")

    if [[ -n "$MERGE_OUTPUT" ]]; then
        ALL_RESULTS=$(printf '%s' "$MERGE_OUTPUT" | node -e '
            const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
            console.log(JSON.stringify(d.assets));
        ' 2>/dev/null || echo "$ALL_RESULTS")
        ALL_BLOCKED=$(printf '%s' "$MERGE_OUTPUT" | node -e '
            const d = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
            console.log(JSON.stringify(d.blocked));
        ' 2>/dev/null || echo "$ALL_BLOCKED")
    fi

done <<< "$PLUGIN_DIRS"

# =============================================================================
# 5. Write session manifest — all values via env vars (Fix C1/C2)
# =============================================================================

if [[ "$ASSETS_DECRYPTED" -gt 0 ]] || [[ "$ASSETS_FAILED" -gt 0 ]] || [[ "$ASSETS_BLOCKED" -gt 0 ]]; then
    ENC_SESSION_ID="$SESSION_ID" \
    ENC_SESSION_DIR="$SESSION_DIR" \
    ENC_ALL_RESULTS="$ALL_RESULTS" \
    ENC_ALL_BLOCKED="$ALL_BLOCKED" \
    ENC_DECRYPTED="$ASSETS_DECRYPTED" \
    ENC_FAILED="$ASSETS_FAILED" \
    ENC_BLOCKED="$ASSETS_BLOCKED" \
    ENC_PLUGINS="$PLUGINS_FOUND" \
    node -e '
        const fs = require("fs");
        const manifest = {
            session_id: process.env.ENC_SESSION_ID,
            created_at: new Date().toISOString(),
            session_dir: process.env.ENC_SESSION_DIR,
            assets: JSON.parse(process.env.ENC_ALL_RESULTS),
            blocked_assets: JSON.parse(process.env.ENC_ALL_BLOCKED || "[]"),
            stats: {
                decrypted: parseInt(process.env.ENC_DECRYPTED, 10),
                failed: parseInt(process.env.ENC_FAILED, 10),
                blocked: parseInt(process.env.ENC_BLOCKED, 10),
                plugins: parseInt(process.env.ENC_PLUGINS, 10)
            }
        };
        const outPath = process.env.ENC_SESSION_DIR + "/.session-manifest.json";
        fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
    ' 2>/dev/null || true
fi

# Export session dir for downstream hooks
export OPSPAL_ENC_SESSION_DIR="$SESSION_DIR"

# =============================================================================
# 6. Output
# =============================================================================

if [[ "$ASSETS_DECRYPTED" -gt 0 ]]; then
    MESSAGES+=("Encrypted assets ready: $ASSETS_DECRYPTED decrypted from $PLUGINS_FOUND plugin(s)")
fi

if [[ "$ASSETS_FAILED" -gt 0 ]]; then
    MESSAGES+=("WARNING: $ASSETS_FAILED encrypted asset(s) failed decryption. Check logs.")
fi

if [[ "$ASSETS_BLOCKED" -gt 0 ]]; then
    BLOCKED_DOMAINS=$(printf '%s' "$ALL_BLOCKED" | node -e '
        const b = JSON.parse(require("fs").readFileSync("/dev/stdin","utf8"));
        const domains = [...new Set(b.map(a=>a.required_tier))].sort();
        console.log(domains.join(", "));
    ' 2>/dev/null || echo "unknown")
    MESSAGES+=("Subscription boundary: $ASSETS_BLOCKED asset(s) require a higher plan ($BLOCKED_DOMAINS). Run /license-status for details.")
fi

if [[ ${#MESSAGES[@]} -gt 0 ]]; then
    printf '%s\n' "${MESSAGES[@]}" >&2
fi

echo '{}'
exit 0
