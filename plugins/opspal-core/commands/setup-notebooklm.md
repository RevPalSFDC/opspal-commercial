---
name: setup-notebooklm
description: Setup NotebookLM MCP server authentication (first-time setup or re-auth)
argument-hint: "[options]"
allowed-tools:
  - Bash
  - Read
  - Write
thinking-mode: enabled
---

# Setup NotebookLM MCP Server

## Purpose

**What this command does**: Guides first-time setup or re-authentication for the NotebookLM MCP server, enabling AI-queryable client knowledge bases.

**When to use it**:
- First-time NotebookLM integration setup
- Re-authentication when cookies expire (every 2-4 weeks)
- Troubleshooting NotebookLM connection issues

## Prerequisites

### Required
- **Google Account**: With access to NotebookLM
- **Chrome Browser**: For cookie-based authentication
- **Python/uv**: For MCP server installation

## Usage

```bash
/setup-notebooklm
```

## PROCESS

### 1) Check Current State

**Detect existing setup:**
```bash
# Check if NotebookLM MCP is already configured
claude mcp list 2>/dev/null | grep -q "notebooklm" && echo "CONFIGURED" || echo "NOT_CONFIGURED"

# Check if auth exists
if [ -f "$HOME/.notebooklm-mcp/auth.json" ]; then
  echo "AUTH_EXISTS"
  cat "$HOME/.notebooklm-mcp/auth.json" | jq -r '.expires_at // "unknown"'
else
  echo "NO_AUTH"
fi
```

**Report current state to user:**
- If configured and auth valid: Offer re-auth option
- If configured but auth expired: Prompt for re-auth
- If not configured: Run full setup

### 2) Install NotebookLM MCP (if needed)

**Check installation:**
```bash
# Check if notebooklm-mcp is installed
which notebooklm-mcp 2>/dev/null || uv tool list 2>/dev/null | grep -q notebooklm
```

**Install if missing:**
```bash
# Recommended: Use uv for fast installation
curl -LsSf https://astral.sh/uv/install.sh | sh  # If uv not installed
uv tool install notebooklm-mcp-server

# Alternative: Use pipx
pipx install notebooklm-mcp-server
```

### 3) Create Config Directory

```bash
mkdir -p "$HOME/.notebooklm-mcp/chrome-profile"
```

### 4) Run Authentication

**Launch browser-based auth:**
```bash
notebooklm-mcp-auth
```

**What happens:**
1. Chrome launches with special debugging port
2. User navigates to NotebookLM and logs in with Google
3. Cookies are captured and saved to `~/.notebooklm-mcp/`
4. Auth completes when user visits notebooklm.google.com

**Tell user:**
```
🔐 Authentication Process:

1. A Chrome browser will open
2. Navigate to notebooklm.google.com
3. Sign in with your Google account
4. Once signed in, the browser will close automatically
5. Your authentication will be saved for 2-4 weeks

Press Enter when ready to start...
```

### 5) Verify Authentication

**Test connection:**
```bash
# Try to list notebooks (should work if auth succeeded)
# This uses MCP tool but we verify via a simple test
notebooklm-mcp --test 2>&1 || echo "Run notebook_list to verify"
```

### 6) Add MCP Server to Claude Code (if not present)

**Check and add to MCP config:**
```bash
# Check if already in mcp.json
if [ -f ".mcp.json" ]; then
  if grep -q "notebooklm" .mcp.json; then
    echo "Already configured in .mcp.json"
  else
    echo "Adding notebooklm to .mcp.json"
    # User should manually add or use claude mcp add
  fi
fi
```

**Recommended MCP configuration:**
```json
{
  "mcpServers": {
    "notebooklm": {
      "command": "notebooklm-mcp",
      "args": ["--transport", "stdio"],
      "env": {
        "NOTEBOOKLM_QUERY_TIMEOUT": "120"
      }
    }
  }
}
```

### 7) Report Success

```
✅ NotebookLM Setup Complete!

📁 Auth Location: ~/.notebooklm-mcp/auth.json
🔐 Auth Expires: ~2-4 weeks (re-run /setup-notebooklm when needed)

📋 Next Steps:
   1. Create a client notebook: /notebook-init <org-alias>
   2. Sync sources: /notebook-sync <org-alias> <file-path>
   3. Query context: /notebook-query <org-alias> "What are the CPQ findings?"

💡 Tip: NotebookLM offers ~50 queries/day on free tier.
        Use /generate-client-briefing for weekly updates.
```

## Error Handling

| Error | Resolution |
|-------|------------|
| Chrome not found | Install Chrome or Chromium |
| Auth timeout | Re-run, ensure Google login completes |
| MCP not installed | Run installation steps above |
| Permission denied | Check ~/.notebooklm-mcp/ permissions |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NOTEBOOKLM_QUERY_TIMEOUT | 120 | Query timeout in seconds |
| NOTEBOOKLM_DEBUG | false | Enable verbose logging |
| NOTEBOOKLM_CHROME_PATH | auto | Custom Chrome path |

## Cookie Expiration

NotebookLM uses cookie-based authentication:
- **Typical expiry**: 2-4 weeks
- **Auto-refresh**: Attempted automatically when needed
- **Re-auth required**: When cookies fully expire

To check auth status:
```bash
cat ~/.notebooklm-mcp/auth.json | jq '.last_refresh'
```

## MCP Server Commands

Once setup completes, these MCP tools become available:
- `notebook_create`, `notebook_list`, `notebook_query`
- `source_add_text`, `source_add_url`, `source_add_drive`
- `studio_briefing_create`, `studio_audio_create`
- `research_initiate_drive`, `research_poll`
- `refresh_auth`

Full tool list: 31 NotebookLM operations
