#!/usr/bin/env bash
#
# session-start-prune-orphaned-plugins.sh
#
# Lightweight session-start hook that removes stale plugin references
# from installed_plugins.json, enabledPlugins, and hook commands in
# settings.json files. Runs on every session start but fast-exits
# if no orphans are found (~2ms typical).
#
# This fixes the issue where a deprecated plugin (e.g. opspal-data-hygiene)
# was removed from the marketplace but references persist in:
#   1. ~/.claude/plugins/installed_plugins.json
#   2. ~/.claude/settings.json → enabledPlugins[]
#   3. $PWD/.claude/settings.json → enabledPlugins[]
#   4. Hook command entries referencing the removed plugin's scripts
#
# Called by session-start-dispatcher.sh.
# Opt-out: export PRUNE_ORPHANED_PLUGINS=0

set -euo pipefail

# Read stdin (required by dispatcher contract)
cat 2>/dev/null >/dev/null || true

if [ "${PRUNE_ORPHANED_PLUGINS:-1}" = "0" ]; then
  printf '{}\n'
  exit 0
fi

if ! command -v node &>/dev/null; then
  printf '{}\n'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Inline Node.js for speed — avoids spawning a second process or loading
# the full PostPluginUpdateFixes class.
node -e '
"use strict";
const fs = require("fs");
const path = require("path");

const home = process.env.HOME || process.env.USERPROFILE || "";
const claudeRoot = path.join(home, ".claude");
const cwd = process.cwd();
const pruned = [];

// --- 1. Find orphaned opspal-* keys in installed_plugins.json ---
const ipPath = path.join(claudeRoot, "plugins", "installed_plugins.json");
let orphanedNames = new Set();
let orphanedKeys = new Set();

if (fs.existsSync(ipPath)) {
  try {
    const ip = JSON.parse(fs.readFileSync(ipPath, "utf8"));
    if (ip.plugins && typeof ip.plugins === "object") {
      for (const key of Object.keys(ip.plugins)) {
        if (!key.startsWith("opspal-") || !key.includes("@")) continue;
        const [pluginName, marketplace] = key.split("@");
        const mpDir = path.join(claudeRoot, "plugins", "marketplaces", marketplace, "plugins", pluginName);
        const hasJson =
          fs.existsSync(path.join(mpDir, ".claude-plugin", "plugin.json")) ||
          fs.existsSync(path.join(mpDir, "plugin.json"));
        if (!fs.existsSync(mpDir) || !hasJson) {
          orphanedNames.add(pluginName);
          orphanedKeys.add(key);
          delete ip.plugins[key];
          pruned.push("ip:" + key);
        }
      }
      if (orphanedKeys.size > 0) {
        fs.writeFileSync(ipPath, JSON.stringify(ip, null, 2) + "\n");
        // Also prune cache dirs
        for (const key of orphanedKeys) {
          const [pn, mp] = key.split("@");
          const cacheDir = path.join(claudeRoot, "plugins", "cache", mp, pn);
          try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

if (orphanedKeys.size === 0) {
  // No orphans — fast exit
  process.stdout.write("{}\n");
  process.exit(0);
}

// --- 2. Clean enabledPlugins and hook commands from settings.json files ---
const settingsPaths = [
  path.join(claudeRoot, "settings.json"),
  path.join(claudeRoot, "settings.local.json"),
  path.join(cwd, ".claude", "settings.json"),
  path.join(cwd, ".claude", "settings.local.json")
];

for (const sp of settingsPaths) {
  if (!fs.existsSync(sp)) continue;
  try {
    const settings = JSON.parse(fs.readFileSync(sp, "utf8"));
    let modified = false;

    // enabledPlugins — can be array ["key"] or object {"key": true}
    if (Array.isArray(settings.enabledPlugins)) {
      const before = settings.enabledPlugins.length;
      settings.enabledPlugins = settings.enabledPlugins.filter(p => !orphanedKeys.has(p));
      if (settings.enabledPlugins.length < before) {
        pruned.push("ep:" + sp);
        modified = true;
      }
    } else if (settings.enabledPlugins && typeof settings.enabledPlugins === "object") {
      let removed = 0;
      for (const key of Object.keys(settings.enabledPlugins)) {
        if (orphanedKeys.has(key)) {
          delete settings.enabledPlugins[key];
          removed++;
        }
      }
      if (removed > 0) {
        pruned.push("ep:" + sp);
        modified = true;
      }
    }

    // Hook commands — remove entries whose script files don't exist on disk
    if (settings.hooks && typeof settings.hooks === "object") {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || "";
      for (const [evt, entries] of Object.entries(settings.hooks)) {
        if (!Array.isArray(entries)) continue;
        const before = entries.length;
        settings.hooks[evt] = entries.filter(entry => {
          const hooks = entry.hooks || [];
          return !hooks.some(h => {
            const cmd = h.command || "";
            let resolved = cmd.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot).replace(/~/g, home);
            const scriptPath = resolved.split(/\s+/)[0];
            return scriptPath.startsWith("/") && !fs.existsSync(scriptPath);
          });
        });
        if (settings.hooks[evt].length < before) {
          pruned.push("hk:" + evt + "@" + sp);
          modified = true;
        }
        if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
      }
    }

    if (modified) {
      fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + "\n");
    }
  } catch (_) {}
}

// Emit result
const result = pruned.length > 0
  ? { systemMessage: "Pruned " + pruned.length + " orphaned plugin reference(s): " + [...orphanedNames].join(", ") }
  : {};
process.stdout.write(JSON.stringify(result) + "\n");
' 2>/dev/null || printf '{}\n'
