# Environment Configuration Runbook

This runbook addresses environment configuration issues, dependency management, path resolution, and multi-context execution derived from 11+ reflection incidents.

## Overview

| Metric | Value |
|--------|-------|
| Reflection Count | 11 |
| Primary Cohort | config/env |
| Priority | P1 |
| Annual ROI | $33,000 |
| Root Cause | No standardized environment configuration patterns |

## Contents

1. [System Dependencies](./01-system-dependencies.md)
2. [Path Resolution Patterns](./02-path-resolution.md)
3. [MCP Server Configuration](./03-mcp-configuration.md)
4. [Multi-Context Execution](./04-multi-context-execution.md)

## Quick Reference

### The Environment Configuration Problem

From reflection data: "Puppeteer failed with missing libasound2 - Ubuntu 24.04 renamed packages."

### Environment Compatibility Matrix

| Component | Ubuntu 22.04 | Ubuntu 24.04 | macOS | Notes |
|-----------|--------------|--------------|-------|-------|
| Chrome/Puppeteer | libasound2 | libasound2t64 | Homebrew | Package renamed |
| NSS Libraries | libnss3 | libnss3 | Built-in | Same name |
| ATK | libatk1.0-0 | libatk1.0-0t64 | N/A | Package renamed |
| GConf | libgconf-2-4 | Unavailable | N/A | Deprecated |

### Pre-Flight Environment Check

```bash
#!/bin/bash
# Run before any Puppeteer/Playwright operations

check_environment() {
  local issues=()

  # Detect Ubuntu version
  if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    UBUNTU_VERSION="${VERSION_ID:-unknown}"
  fi

  # Check Puppeteer dependencies
  if [[ "$UBUNTU_VERSION" == "24."* ]]; then
    REQUIRED_PACKAGES="libasound2t64 libnss3 libnspr4 libatk1.0-0t64"
  else
    REQUIRED_PACKAGES="libasound2 libnss3 libnspr4 libatk1.0-0"
  fi

  for pkg in $REQUIRED_PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
      issues+=("Missing: $pkg")
    fi
  done

  if [ ${#issues[@]} -gt 0 ]; then
    echo "Environment issues found:"
    printf '%s\n' "${issues[@]}"
    return 1
  fi

  echo "Environment check passed"
  return 0
}
```

### Path Resolution Quick Guide

| Context | Path Pattern | Resolution |
|---------|--------------|------------|
| Project root | `./` | Relative to cwd |
| Plugin root | `CLAUDE_PLUGIN_ROOT` | Plugin install path |
| User config | `~/.claude/` | User home |
| Absolute | `/path/to/file` | Direct path |

### MCP Configuration Priority

1. Project scope: `.mcp.json` (highest priority, committed)
2. Local scope: `~/.config/claude/mcp.json`
3. User scope: `~/.claude/mcp.json` (lowest priority)

## Common Issues Addressed

| Issue | Cause | Prevention |
|-------|-------|------------|
| "libasound2 not found" | Ubuntu 24.04 package rename | Use OS detection script |
| "Module not found" | ESM/CJS mismatch | Consistent module type |
| "MCP server failed to start" | Missing env vars | Use env expansion |
| "File not found" | Incorrect path context | Use absolute paths |

## Success Criteria

- [ ] Pre-flight environment check runs before Puppeteer operations
- [ ] OS-specific package lists maintained and used
- [ ] Path resolution uses consistent patterns
- [ ] MCP servers configured with proper scoping
- [ ] Zero environment-related deployment failures

## Sources

- [Puppeteer Troubleshooting Guide](https://pptr.dev/troubleshooting)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [Claude Code MCP Configuration](https://code.claude.com/docs/en/settings)
- [Ubuntu Package Naming Changes](https://github.com/browser-actions/setup-chrome/issues/618)
