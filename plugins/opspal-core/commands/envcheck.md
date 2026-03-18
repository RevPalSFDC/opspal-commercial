---
name: envcheck
description: Run environment health checks across all platforms with optional auto-fix
argument-hint: "[--fix] [--platform <sf|hs|mk|asana|gh>] [--quick] [--json]"
visibility: user-invocable
tags:
  - environment
  - diagnostics
  - health
  - preflight
---

# Environment Health Check

Comprehensive diagnostic of your environment: platform auth, npm deps, MCP servers, plugin versions, and system dependencies.

## Execute

Run the full environment check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js"
```

## Options

### Auto-fix (install missing npm packages, refresh cached tokens)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --fix
```

### Single platform check

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --platform sf
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --platform hs
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --platform mk
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --platform asana
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --platform gh
```

### Quick mode (skip slow checks: MCP, script paths)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --quick
```

### JSON output

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/envcheck/env-preflight-engine.js" --json
```

## What Gets Checked

| Checker | Quick Mode | What It Validates |
|---------|-----------|-------------------|
| System Dependencies | Yes | Node version (>=18), jq, sf CLI, disk space |
| Salesforce Auth | Yes | `sf org display` for `$SF_TARGET_ORG` - expired sessions |
| HubSpot Auth | Yes | API call with `$HUBSPOT_ACCESS_TOKEN` - token validity |
| Marketo Auth | Yes | OAuth client_credentials flow or cached token freshness |
| Asana Auth | Yes | GET /users/me with `$ASANA_ACCESS_TOKEN` |
| GitHub Auth | Yes | `gh auth status` for github.com session validity |
| NPM Dependencies | Yes | All plugin package.json deps installed |
| Plugin Versions | Yes | Installed vs marketplace versions |
| MCP Servers | No | .mcp.json commands exist, env vars set |
| Script Paths | No | Agent-referenced scripts exist on disk |

## Status Codes

| Status | Meaning |
|--------|---------|
| ✓ pass | Check passed |
| ⚠ warn | Non-blocking issue |
| ✗ fail | Blocking issue requiring attention |
| ○ skip | Check skipped (platform not configured) |
| 🔧 fix | Issue auto-fixed |

## Auto-Fix Tiers

| Tier | Behavior | Example |
|------|----------|---------|
| Safe | Always auto-fixed with `--fix` | `npm install` for missing deps |
| Prompted | Fix shown, needs confirmation | Marketo token refresh |
| Never | Manual fix instructions shown | SF login, HubSpot token regeneration |

## SessionStart Integration

A lightweight version runs automatically at session start (5s timeout).
It only outputs warnings for detected issues - never blocks the session.

Disable with: `export SKIP_ENVCHECK=1`

## Logs

Results logged to `~/.claude/logs/envcheck.jsonl` for trend analysis.

## Exit Codes

- `0` - All checks passed (or all issues fixed with --fix)
- `1` - One or more checks failed
- `2` - Fatal engine error

## Examples

### Full check with auto-fix
```bash
/envcheck --fix
```

### Quick Salesforce-only check
```bash
/envcheck --platform sf --quick
```

### JSON output for scripting
```bash
/envcheck --json
```

## Related Commands

- `/checkdependencies` - NPM-only dependency check
- `/pluginupdate` - Plugin version management
- `/silent-failure-check` - Silent failure detection

## Troubleshooting

### Check hangs for >10s
Each checker has a 10s timeout. If the engine hangs, an MCP or auth check may be slow:
```bash
/envcheck --quick  # Skip slow checks
```

### False positive on SF auth
If `sf org display` reports expired but org works:
```bash
sf org display --target-org $SF_TARGET_ORG --json  # Debug directly
```
