# Supabase MCP Setup Status

## Current State: ✅ Ready to Apply Migration

### What's Complete

1. **✅ .mcp.json Configuration**
   - Type: HTTP transport
   - URL: `https://mcp.supabase.com/mcp?project_ref=REDACTED_SUPABASE_PROJECT&features=database,docs`
   - Write access enabled (no `read_only=true`)
   - Project-scoped to reflection database
   - Feature groups: database, docs

2. **✅ Complete Schema File Ready**
   - `scripts/COMPLETE_REFLECTIONS_SCHEMA.sql` - **NEW: Combined base + workflow schema**
   - Includes base table, workflow columns, views, and permissions
   - Single-file migration (simpler than multi-step)
   - `scripts/WORKFLOW_MIGRATION.sql` - Legacy incremental version (deprecated)

3. **✅ Workflow Management Tools**
   - `scripts/lib/process-reflections.js` - Triage and workflow management
   - `scripts/lib/create-reflection-task.js` - Asana task creation
   - `scripts/lib/query-reflections.js` - Query with workflow filters

4. **✅ Environment Variables**
   - SUPABASE_URL configured
   - SUPABASE_ANON_KEY configured
   - SUPABASE_SERVICE_ROLE_KEY configured (for fallback)

5. **✅ Documentation**
   - `docs/SUPABASE_MCP_SECURITY.md` - Comprehensive security guide
   - `SUPABASE_QUICK_START.md` - **NEW: 2-minute setup guide**

### What's Pending: Apply Migration

**Issue:** The Supabase MCP isn't loaded in Claude Code's available tools.

**Root cause:** HTTP transport MCPs with OAuth require authentication before they can be used. Claude Code should automatically prompt for OAuth when it starts, but this hasn't happened yet.

**Why this matters:** Without OAuth authentication, the MCP tools (`apply_migration`, `execute_sql`, etc.) aren't available, even though the configuration is correct.

## Authentication Flow (Expected)

According to Supabase MCP documentation:

1. Claude Code reads `.mcp.json`
2. Detects Supabase MCP with HTTP transport
3. Automatically opens browser window
4. User logs into Supabase
5. User selects organization
6. Grants access to MCP client
7. MCP tools become available

## Troubleshooting Steps

### Step 1: Restart Claude Code

**Most likely solution:** Claude Code needs to be restarted to:
- Re-read `.mcp.json` configuration
- Trigger OAuth authentication flow
- Load MCP servers

**How to test:**
```bash
# After restart, check if tools are available
# Ask Claude: "List tables in my Supabase database"
# If MCP is working, it should use mcp__supabase__list_tables
```

### Step 2: Check MCP Status (If Available)

If Claude Code has MCP management commands:
```bash
claude mcp list              # See all loaded MCPs
claude mcp status supabase   # Check Supabase MCP specifically
claude mcp restart supabase  # Try reloading
```

### Step 3: Manual OAuth (If Needed)

If automatic OAuth doesn't trigger:
1. Visit: https://mcp.supabase.com/auth
2. Login with your Supabase account
3. Grant access to the MCP client

### Step 4: Check Claude Code Logs

Look for errors related to:
- MCP initialization
- HTTP transport
- OAuth authentication
- Supabase connectivity

## Migration Execution Options

Once OAuth is working, you have multiple ways to run the migration:

### Option A: MCP `apply_migration` Tool (PREFERRED)

When MCP is authenticated:
```
Ask Claude: "Apply the migration in scripts/migrations/001_add_workflow_columns.sql"
```

Claude will:
1. Read the migration file
2. Use `mcp__supabase__apply_migration` tool
3. Track the migration in Supabase
4. Report success/failure

**Advantages:**
- ✅ Migration tracked in Supabase
- ✅ Automatic rollback support
- ✅ Version control integration
- ✅ No manual steps

### Option B: Manual SQL Paste (FALLBACK)

If MCP authentication continues to fail:
```bash
# 1. Copy migration SQL
cat scripts/WORKFLOW_MIGRATION.sql

# 2. Paste into Supabase SQL Editor
open https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT/sql/new

# 3. Click RUN

# 4. Verify
node scripts/verify-workflow-migration.js
```

**Advantages:**
- ✅ Always works
- ✅ Visual confirmation
- ✅ No dependencies

**Disadvantages:**
- ❌ Not tracked in migration history
- ❌ Manual process
- ❌ Can't automate

### Option C: Supabase CLI (ALTERNATIVE)

Install and use Supabase CLI:
```bash
# Install
npm install -g supabase

# Login
supabase login

# Run migration
supabase db push --project-ref REDACTED_SUPABASE_PROJECT \
  --file scripts/migrations/001_add_workflow_columns.sql
```

**Advantages:**
- ✅ CLI automation possible
- ✅ Migration tracking
- ✅ Works without MCP

## Current Recommendation

**NEXT ACTION: Apply SQL Migration (2 minutes)**

### Recommended Approach: Manual SQL Paste

Since MCP OAuth is not yet configured, use the simple manual approach:

1. **Open Quick Start Guide**: `cat SUPABASE_QUICK_START.md`
2. **Copy SQL**: `cat scripts/COMPLETE_REFLECTIONS_SCHEMA.sql`
3. **Paste & Run**: [Open SQL Editor](https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT/sql/new)
4. **Verify**: `source .env && node scripts/verify-workflow-migration.js`

**Why this approach:**
- ✅ Works immediately (no OAuth setup needed)
- ✅ Visual confirmation in Supabase UI
- ✅ Complete schema in one file
- ✅ 2-minute process

**Alternative: Set up MCP OAuth (optional, for future automation)**
1. Restart Claude Code
2. Complete OAuth flow when prompted
3. Use MCP tools for automated migrations

## Verification After Migration

Regardless of method used:
```bash
# Verify migration succeeded
node scripts/verify-workflow-migration.js

# Test triage queue
node scripts/lib/query-reflections.js triage

# Test workflow management
node scripts/lib/process-reflections.js triage
```

## Files Reference

- **MCP Config:** `.mcp.json` (line 146-159)
- **Migration (MCP):** `scripts/migrations/001_add_workflow_columns.sql`
- **Migration (Manual):** `scripts/WORKFLOW_MIGRATION.sql`
- **Diagnostic:** `scripts/test-mcp-connection.sh`
- **Verification:** `scripts/verify-workflow-migration.js`
- **Security Guide:** `docs/SUPABASE_MCP_SECURITY.md`

---

**Status:** Ready for OAuth authentication
**Next Step:** Restart Claude Code to trigger OAuth flow
**Fallback:** Manual SQL paste (30 seconds)
**Last Updated:** 2025-01-11
