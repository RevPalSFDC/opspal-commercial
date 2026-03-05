# Automation Boundaries

## What Can (and Cannot) Be Automated

This document clarifies what operations can be fully automated by Claude Code vs. what requires manual intervention, with workarounds where possible.

## Philosophy

**Automation-First Approach**: We aim to automate everything possible, but respect security boundaries and API limitations. When manual steps ARE required, provide:
1. **Clear explanation** of why automation isn't possible
2. **Copy-paste ready** commands/SQL/code inline in response
3. **Workarounds** where available
4. **Future roadmap** for removing manual steps

## Fully Automated Operations

### ✅ File System Operations

**What works**:
- Reading any file
- Writing new files
- Editing existing files
- Creating directories
- Moving/renaming files
- Deleting files

**How it works**:
- Direct filesystem access via Read, Write, Edit, Bash tools
- No user interaction required

**Example**:
```bash
# Fully automated - no user action needed
node script.js
echo "content" > file.txt
mkdir -p deep/nested/directory
```

### ✅ Git Operations

**What works**:
- Reading git status, logs, diffs
- Creating commits
- Creating branches
- Pushing to remote
- Creating pull requests (via `gh` CLI)
- Tagging releases

**How it works**:
- Git CLI commands via Bash tool
- GitHub CLI (`gh`) for PR creation
- Assumes git credentials already configured

**Example**:
```bash
# Fully automated
git add .
git commit -m "feat: Add feature"
git push origin main
gh pr create --title "Feature" --body "Description"
```

### ✅ REST API Operations

**What works**:
- GET requests
- POST requests
- PATCH/PUT requests
- DELETE requests
- Any operation supported by REST API

**How it works**:
- Direct HTTP calls via curl or Node.js
- Uses API keys from environment variables
- No interactive authentication

**Example**:
```bash
# Fully automated with API keys
curl -X POST https://api.supabase.co/rest/v1/table \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -d '{"data": "value"}'
```

### ✅ Node.js Script Execution

**What works**:
- Running any Node.js script
- Installing npm packages
- Executing JavaScript/TypeScript
- Building projects

**How it works**:
- Node runtime via Bash tool
- npm/yarn commands
- Full access to Node APIs

**Example**:
```bash
# Fully automated
npm install fast-xml-parser
node scripts/build.js
npm run test
```

### ✅ Command-Line Tools

**What works**:
- Any CLI tool that doesn't require interactive input
- Batch operations
- Scripted workflows

**How it works**:
- Shell commands via Bash tool
- Piping and redirection supported
- Non-interactive mode only

**Example**:
```bash
# Fully automated
jq '.field' data.json
sf org list --json
curl -s https://api.example.com/data | jq '.results'
```

## Partially Automated Operations

### ⚠️ Supabase Schema Changes (DDL)

**What works**:
- ✅ Reading schema via REST API
- ✅ DML operations (INSERT, UPDATE, DELETE)
- ✅ RPC function calls
- ⚠️ DDL operations (ALTER TABLE, CREATE INDEX) - requires service role key OR manual execution

**Current limitation**:
- Supabase REST API doesn't expose direct DDL execution for security
- Requires either:
  - Service role key (high privilege) for automated execution
  - Manual execution via Supabase SQL Editor (web UI)

**Workaround**:
```bash
# Option A: Automated with service role key (RECOMMENDED)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_*** \
node .claude/scripts/lib/supabase-schema-migrator.js execute migration.sql

# Option B: Manual execution via SQL Editor
# 1. Open https://app.supabase.com/project/_/sql
# 2. Paste SQL:
ALTER TABLE reflections ADD COLUMN plugin_name TEXT;
# 3. Click "Run"
```

**Future improvement**:
- Create Supabase migration management service with proper auth
- Use Supabase Management API for DDL operations
- Implement review/approval workflow for schema changes

### ⚠️ MCP Server Installation

**What works**:
- ✅ Reading MCP server configuration (`.mcp.json`)
- ✅ Updating MCP server configuration
- ⚠️ Installing new MCP servers - requires manual `claude mcp add`

**Current limitation**:
- MCP server installation requires Claude Code CLI
- Must run in terminal: `claude mcp add <server-name>`
- Cannot be automated from within Claude Code session

**Workaround**:
```bash
# Provide user with exact command to run
claude mcp add @modelcontextprotocol/server-supabase --scope project

# Or provide configuration to add to .mcp.json
# User can copy-paste into file
```

**Future improvement**:
- Add MCP tool for programmatic server installation
- Support `.mcp.json` auto-loading on session start

### ⚠️ Environment Variable Setup

**What works**:
- ✅ Reading environment variables
- ✅ Writing to `.env` file
- ⚠️ Loading `.env` in current session - requires sourcing

**Current limitation**:
- Writing to `.env` doesn't automatically load vars
- Each Bash tool invocation is new shell session
- Must explicitly load environment in each script

**Workaround**:
```bash
# In every script that needs env vars
source .claude/scripts/lib/load-env.sh
load_env
validate_env "SUPABASE_URL SUPABASE_ANON_KEY"

# Or inline:
export $(grep -v '^#' .env | xargs)
```

**Future improvement**:
- Auto-load `.env` in all Bash tool invocations
- Persistent shell session across tool calls

## Not Automated (By Design)

### ❌ Interactive Authentication

**What doesn't work**:
- OAuth flows
- 2FA prompts
- Interactive login screens
- Browser-based authentication

**Why**:
- Requires user interaction (by design)
- Security best practice
- Cannot be automated without compromising security

**Workaround**:
- Use API keys/tokens instead of interactive auth
- Pre-authenticate and store tokens in `.env`
- Use service accounts for automation

**Example**:
```bash
# ❌ Cannot automate
salesforce login --web

# ✅ Use API keys instead
export SALESFORCE_ACCESS_TOKEN="00D..."
sf org login access-token --instance-url https://...
```

### ❌ Browser Operations

**What doesn't work**:
- Opening web pages
- Clicking buttons in browser
- Filling forms on websites
- Downloading from interactive sites

**Why**:
- No browser automation capability
- Would require headless browser (Puppeteer, Playwright)
- Outside scope of CLI tool

**Workaround**:
- Use APIs instead of web scraping
- Provide direct links for user to visit
- Use CLI tools where available

**Example**:
```bash
# ❌ Cannot automate
# "Click the 'Deploy' button at https://app.example.com/deploy"

# ✅ Use API instead
curl -X POST https://api.example.com/deploy \
  -H "Authorization: Bearer $TOKEN"
```

### ❌ Desktop Application Control

**What doesn't work**:
- Opening desktop applications
- Clicking in GUI applications
- File dialogs, save prompts
- System notifications

**Why**:
- CLI tool has no GUI control capability
- OS-specific and unreliable
- Better solved with CLIs/APIs

**Workaround**:
- Use CLI alternatives (e.g., `gh` instead of GitHub Desktop)
- Provide CLI commands for equivalent operations
- Use APIs where available

## Decision Tree: Can We Automate This?

```
┌─────────────────────────────────────┐
│ Does it require user interaction?  │
└──────────┬──────────────────────────┘
           │
      NO   │   YES
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐   ┌─────────────┐
│  Can   │   │  Manual     │
│Automate│   │Intervention │
│        │   │  Required   │
└────────┘   └──────┬──────┘
                    │
            ┌───────┴────────┐
            │                │
            ▼                ▼
    ┌──────────────┐  ┌────────────┐
    │ Provide API  │  │  Provide   │
    │ Alternative  │  │Copy-Paste  │
    │              │  │  Commands  │
    └──────────────┘  └────────────┘
```

### Questions to Ask

1. **Does it require user input?**
   - No → Automate fully
   - Yes → Can we use API/CLI alternative?

2. **Do we have API access?**
   - Yes → Use API (automated)
   - No → Manual step with clear instructions

3. **Is it a security operation?**
   - Yes → Manual step (by design)
   - No → Automate if possible

4. **Do we have sufficient permissions?**
   - Yes → Automate with service role key
   - No → Manual step OR request elevated permissions

## Communication Patterns

### When Automation IS Possible

✅ **DO**: Execute automatically and report result

```
✅ Added columns to Supabase table:
   - plugin_name (TEXT)
   - plugin_version (TEXT)

Created indexes for efficient querying.
Migration completed successfully.
```

### When Automation IS NOT Possible

✅ **DO**: Explain why, provide copy-paste solution inline

```
I need to add these columns to your Supabase database.
Since this requires DDL operations, you'll need to run
this SQL in the Supabase SQL Editor:

```sql
ALTER TABLE reflections ADD COLUMN plugin_name TEXT;
ALTER TABLE reflections ADD COLUMN plugin_version TEXT;
CREATE INDEX idx_reflections_plugin_name ON reflections(plugin_name);
```

Where to run it: https://app.supabase.com/project/_/sql

Why manual: Supabase REST API doesn't support DDL operations
without service role key (high privilege). We can automate
this if you provide SUPABASE_SERVICE_ROLE_KEY in .env.
```

❌ **DON'T**: Create file and make user hunt for it

```
I created the SQL in /tmp/migration.sql
Please run it in Supabase SQL Editor.
```

## Improving Automation Over Time

### Phase 1: Manual with Clear Instructions (Current)
- Provide copy-paste ready commands
- Explain why manual step needed
- Link to relevant documentation

### Phase 2: Semi-Automated (Next)
- Create helper scripts that reduce manual steps
- Use service role keys where available
- Implement review/approval workflows

### Phase 3: Fully Automated (Future)
- Remove all manual steps where possible
- Implement proper authentication flows
- Build admin APIs for privileged operations

## Examples by Category

### Database Operations

| Operation | Automated? | Method |
|-----------|-----------|--------|
| Read data | ✅ Yes | REST API with anonymous key |
| Write data | ✅ Yes | REST API with anonymous key |
| Create table | ⚠️ Partial | Service role key OR manual |
| Alter table | ⚠️ Partial | Service role key OR manual |
| Create index | ⚠️ Partial | Service role key OR manual |
| Drop table | ❌ No | Manual only (destructive) |

### Source Control

| Operation | Automated? | Method |
|-----------|-----------|--------|
| Git add | ✅ Yes | Git CLI |
| Git commit | ✅ Yes | Git CLI |
| Git push | ✅ Yes | Git CLI (assumes auth) |
| Create PR | ✅ Yes | GitHub CLI (`gh`) |
| Merge PR | ⚠️ Partial | `gh` CLI or manual approval |
| Tag release | ✅ Yes | Git CLI |

### External Services

| Operation | Automated? | Method |
|-----------|-----------|--------|
| API calls | ✅ Yes | curl/Node.js with API keys |
| OAuth login | ❌ No | Manual (browser required) |
| File upload | ✅ Yes | Multipart POST |
| Webhook setup | ⚠️ Partial | API if supported, else manual |

## Getting Help

**If unsure whether something can be automated:**
1. Check if REST API exists for the operation
2. Check if CLI tool exists (non-interactive)
3. Look for service account / API key approach
4. Consider if security barrier is intentional

**If hitting automation limits:**
1. Provide clear manual steps with copy-paste commands
2. Document why automation isn't possible
3. File issue for future automation improvement
4. Consider workarounds (service keys, CLI tools)

---

**Last Updated**: 2025-10-12
**Related**: [Testing Hooks](./TESTING_HOOKS_IN_DEV.md), [Plugin Development](../README.md)
