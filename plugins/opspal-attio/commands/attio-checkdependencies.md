---
description: Validate system dependencies for Attio plugin
argument-hint: ""
---

# /checkdependencies

Verify that all system dependencies required by the Attio plugin are present and correctly configured.

## Usage

```
/checkdependencies
```

## Checks Performed

| Dependency | Requirement | Description |
|------------|-------------|-------------|
| `jq` | Installed | JSON parsing used by scripts |
| `node` | >= 18 | Runtime for plugin scripts |
| `curl` | Installed | API calls from shell scripts |
| Credentials | `.env` or `workspaces/config.json` | At least one credential source must exist |
| `opspal-core` | Installed | Required for shared hooks and utilities |

## Output

```
[PASS] jq: 1.7.1
[PASS] node: v20.11.0
[PASS] curl: 8.4.0
[PASS] Credentials: workspaces/config.json found
[PASS] opspal-core: installed (v2.55.8)

All dependencies satisfied. Attio plugin is ready.
```

### Failure Example

```
[FAIL] jq: not found
  → Install with: sudo apt install jq  (Debian/Ubuntu)
                  brew install jq       (macOS)

[WARN] Credentials: neither .env nor workspaces/config.json found
  → Run /attio-auth setup to configure credentials

1 error, 1 warning — resolve before using the Attio plugin.
```

## Remediation

| Issue | Resolution |
|-------|------------|
| `jq` missing | `sudo apt install jq` (Linux) or `brew install jq` (macOS) |
| `node` < 18 | Install Node.js 18+ from https://nodejs.org |
| `curl` missing | `sudo apt install curl` or `brew install curl` |
| No credentials | Run `/attio-auth setup` |
| `opspal-core` missing | Run `/plugin install opspal-core` |

## When to Run

- After first installing the Attio plugin
- When debugging unexpected plugin failures
- After upgrading Node.js or system tools
