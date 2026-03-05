# MCP Usage Guide - OpsPal Internal Plugins

**Version**: 1.0.0
**Created**: 2025-10-23
**Last Updated**: 2025-10-23

---

## Table of Contents

**Part 1: Quick Start** (5-minute setup)
- [Prerequisites](#prerequisites)
- [Quick Setup](#quick-setup)
- [First MCP Call](#first-mcp-call)
- [Common Gotchas](#common-gotchas)

**Part 2: Architecture**
- [MCP Servers Overview](#mcp-servers-overview)
- [Internal vs User-Facing Separation](#internal-vs-user-facing-separation)
- [Agent-to-MCP Mapping](#agent-to-mcp-mapping)
- [Workflow Diagram](#workflow-diagram)

**Part 3: Usage Patterns**
- [Correct Patterns](#correct-patterns)
- [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
- [Delegation Pattern](#delegation-pattern)

**Part 4: Troubleshooting**
- [Common Errors](#common-errors)
- [Debugging Tools](#debugging-tools)

**Part 5: Advanced Topics**
- [Adding New MCP Servers](#adding-new-mcp-servers)
- [Error Handling Best Practices](#error-handling-best-practices)
- [Performance Optimization](#performance-optimization)
- [Security Considerations](#security-considerations)

**Appendices**
- [Environment Variable Reference](#appendix-a-environment-variable-reference)
- [MCP Tool Reference](#appendix-b-mcp-tool-reference)
- [Related Documentation](#appendix-c-related-documentation)

---

# Part 1: Quick Start

## Prerequisites

Before using MCP in OpsPal Internal Plugins, ensure you have:

- [x] **Claude Code CLI** installed (version 0.8.0+)
- [x] **Node.js** 18+ and npm
- [x] **Git** for version control
- [x] Access to **Supabase project** (for reflection system)
- [x] Access to **Asana workspace** (for task management)

**New Developer?** Allow 30 minutes for first-time setup.

---

## Quick Setup

### Step 1: Clone and Install (2 min)

```bash
# Clone repository
git clone https://github.com/RevPalSFDC/opspal-plugin-internal-plugins.git
cd opspal-internal-plugins

# Install dependencies
npm install
```

### Step 2: Configure Environment Variables (5 min)

```bash
# Copy template
cp .env.example .env

# Edit with your credentials
nano .env  # or your preferred editor
```

**Fill in these required variables**:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
ASANA_ACCESS_TOKEN=2/...
```

**Where to find credentials**:
- **Supabase**: https://app.supabase.com/project/YOUR_PROJECT/settings/api
- **Asana**: https://app.asana.com/0/my-apps (Create Personal Access Token)

### Step 3: Test MCP Connections (2 min)

```bash
# Load environment variables
set -a && source .env && set +a

# Test connections
./scripts/test-mcp-connections.sh
```
If your credentials live outside this repo, skip `source` and point directly to the file:
```bash
./scripts/test-mcp-connections.sh --env-file /path/to/.env
```

**Expected output**:
```
🔍 OpsPal MCP Connection Health Check
======================================

✅ All required environment variables present

1️⃣ Testing Supabase MCP (read-only)...
   ✅ Supabase: Connected (anon key)

2️⃣ Testing Asana MCP...
   ✅ Asana: Connected (authenticated as you@company.com)

======================================
✅ All MCP servers reachable!
```

**If tests fail**, see [Troubleshooting](#troubleshooting) section below.

---

## First MCP Call

### Test Reflection Submission (User-Facing Operation)

```bash
# 1. Create a test reflection
cat > test-reflection.json << 'EOF'
{
  "org": "test-org",
  "session_date": "2025-10-23",
  "focus_area": "mcp-testing",
  "outcome": "Verified MCP setup works correctly",
  "issues_encountered": [],
  "lessons_learned": ["MCP configuration successful"],
  "roi_estimate": "$0 (test only)"
}
EOF

# 2. Submit to Supabase (uses ANON_KEY - correct for user operations)
node .claude-plugins/opspal-salesforce/scripts/lib/submit-reflection.js test-reflection.json

# Expected output:
# ✅ Reflection submitted successfully!
# 📊 Reflection ID: 12345
```

### Query Reflections (User-Facing Operation)

```bash
# Query recent reflections
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js recent

# Expected: List of recent reflections (or empty if none exist)
```

**Success!** You've completed your first MCP operations.

---

## Common Gotchas

### 1. "Missing Environment Variables" Error

**Problem**: Script exits with "Missing required environment variables"

**Solution**:
```bash
# Verify .env exists and has correct variables
ls -la .env
cat .env | grep SUPABASE

# Load variables into current shell
set -a && source .env && set +a

# Or use dotenv
npm install -g dotenv-cli
dotenv node your-script.js
```

### 2. "Permission Denied" / "Unauthorized"

**Problem**: API returns 401 or 403 errors

**Possible Causes**:
- ❌ Wrong API key (anon vs service role)
- ❌ Expired credentials
- ❌ RLS policies blocking access

**Solution**:
```bash
# Test connection
curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# Should return JSON (even if empty array)
# If 401: Check key is valid
# If 403: Check RLS policies allow access
```

### 3. ".mcp.json Not Found" (User-Facing Plugins)

**Problem**: Plugin trying to access .mcp.json

**Root Cause**: User-facing plugins should NOT reference .mcp.json (gitignored, internal only)

**Solution**: Remove MCP tool declarations from plugin agents. Use Task tool delegation instead. See [Delegation Pattern](#delegation-pattern).

### 4. "Connection Timeout"

**Problem**: MCP call hangs or times out

**Possible Causes**:
- ❌ Network connectivity issues
- ❌ Supabase/Asana service down
- ❌ Firewall blocking outbound HTTPS

**Solution**:
```bash
# Test basic connectivity
ping app.asana.com
curl -I https://your-project.supabase.co

# Check Supabase status
open https://status.supabase.com

# Check Asana status
open https://status.asana.com
```

---

# Part 2: Architecture

## MCP Servers Overview

OpsPal Internal Plugins uses **two MCP servers**:

### 1. Supabase MCP

**Purpose**: Centralized database for reflection system

**Capabilities**:
- Store user-submitted reflections
- Query reflection history
- Track reflection processing workflow
- Enable pattern detection across sessions

**Tables**:
- `reflections` - Main reflection data
- `reflection_triage_queue` - View for new reflections needing review

**Access Levels**:
- **Anon Key** (RLS-protected): User-facing scripts (`/reflect`, query tools)
- **Service Role Key** (RLS-bypass): Internal agents (`supabase-*` in `.claude/agents/`)

### 2. Asana MCP

**Purpose**: Task management and approval workflows

**Capabilities**:
- Create tasks for reflection cohort fixes
- Track implementation progress
- Manage approval checkpoints (GTM planning)
- Bidirectional status sync

**Projects**:
- **OpsPal - Reflection Improvements** (GID: 1211617834659194)
- **GTM Planning Projects** (org-specific)

**Access Level**:
- **Personal Access Token**: Internal agents only (`supabase-asana-bridge`, etc.)

**Configuration**: `.mcp.json` (gitignored, not in user-facing plugins)

---

## Internal vs User-Facing Separation

### Critical Architectural Principle

> **User-facing plugins MUST NOT have direct access to internal MCP servers**

**Why This Matters**:

| Aspect | Benefit |
|--------|---------|
| **Security** | End users can't accidentally trigger internal operations |
| **Distribution** | Plugins work without requiring internal credentials |
| **Maintenance** | Internal MCPs can evolve without breaking plugins |
| **Separation** | Clear boundary between public and private operations |

### Boundary Definitions

**User-Facing** (`.claude-plugins/*/`):
- ✅ Can submit data (via anon key scripts)
- ✅ Can query read-only data
- ✅ Can use Task tool to delegate
- 🚫 **Cannot** access Asana MCP directly
- 🚫 **Cannot** use Supabase service role key
- 🚫 **Cannot** reference `.mcp.json`

**Internal** (`.claude/`):
- ✅ Can use all MCP servers
- ✅ Can perform administrative operations
- ✅ Can bypass RLS (service role key)
- 🚫 **Cannot** be distributed to end users

### Diagram: Separation Boundary

```
┌─────────────────────────────────────────────┐
│ User-Facing Plugins (.claude-plugins/)      │
│                                             │
│  • salesforce-plugin                        │
│  • hubspot-plugin                           │
│  • gtm-planning-plugin                      │
│  • opspal-core                    │
│                                             │
│  Tools: Task, Read, Write, Bash, TodoWrite  │
│  MCP Access: NONE (delegates via Task)     │
└──────────────────┬──────────────────────────┘
                   │
                   │ Task Tool Delegation
                   ▼
┌─────────────────────────────────────────────┐
│ Internal Infrastructure (.claude/)          │
│                                             │
│  • supabase-reflection-analyst              │
│  • supabase-cohort-detector                 │
│  • supabase-asana-bridge                    │
│  • supabase-workflow-manager                │
│                                             │
│  Tools: mcp__supabase__*, mcp__asana__*     │
│  MCP Access: FULL (Supabase + Asana)       │
└─────────────────────────────────────────────┘
```

---

## Agent-to-MCP Mapping

### Internal Agents (MCP Access)

| Agent | MCP Tools | Purpose |
|-------|-----------|---------|
| **supabase-reflection-analyst** | `mcp__supabase__*` | Query and analyze reflections |
| **supabase-cohort-detector** | `mcp__supabase__*` | Group reflections by patterns |
| **supabase-fix-planner** | `mcp__supabase__*` | Generate fix plans with RCA |
| **supabase-recurrence-detector** | `mcp__supabase__*` | Detect recurring issues |
| **supabase-workflow-manager** | `mcp__supabase__*` | Manage reflection lifecycle |
| **supabase-asana-bridge** | `mcp__supabase__*`, `mcp__asana__*` | Sync reflections to Asana |

**Declared in frontmatter**:
```yaml
---
name: supabase-reflection-analyst
tools: mcp__supabase__*, Read, Write, Bash
---
```

### User-Facing Agents (NO MCP Access)

| Agent | Tools | MCP Strategy |
|-------|-------|-------------|
| **All plugin agents** | Task, Read, Write, Bash, TodoWrite | Delegate via Task tool |

**Example** (gtm-planning-orchestrator):
```yaml
---
name: gtm-planning-orchestrator
tools: Task, Read, Write, TodoWrite, Bash
# NOTE: No mcp__* tools!
---
```

---

## Workflow Diagram

### Complete Reflection Processing Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: User Submission (Plugin Command)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ /reflect command
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Reflection Analysis & Storage                           │
│                                                                  │
│  • Analyze session for errors/feedback                          │
│  • Generate structured JSON playbook                            │
│  • Sanitize PII (emails, IDs, credentials)                      │
│  • Call: submit-reflection.js (uses ANON_KEY)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP POST to Supabase
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Supabase Database (RLS-Protected)                       │
│                                                                  │
│  • Insert into `reflections` table                              │
│  • Row-Level Security enforces access                           │
│  • Status: 'new' (waiting for processing)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Trigger: /processreflections
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Internal Processing (/processreflections command)       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ 4a. supabase-reflection-analyst                      │      │
│  │     • Fetch reflections WHERE status='new'           │      │
│  │     • Generate statistical reports                   │      │
│  └──────────────────────────────────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ 4b. supabase-cohort-detector                         │      │
│  │     • Group by taxonomy + root cause similarity      │      │
│  │     • Detect recurring patterns                      │      │
│  └──────────────────────────────────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ 4c. supabase-fix-planner                             │      │
│  │     • 5-Why root cause analysis                      │      │
│  │     • Generate solution designs                      │      │
│  │     • Evaluate alternatives                          │      │
│  └──────────────────────────────────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ 4d. supabase-asana-bridge                            │      │
│  │     • Create human-readable Asana tasks              │      │
│  │     • Link to reflection cohorts                     │      │
│  │     • Assign to appropriate team members             │      │
│  └──────────────────────────────────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │ 4e. supabase-workflow-manager                        │      │
│  │     • Update reflection status='under_review'        │      │
│  │     • Track workflow transitions                     │      │
│  └──────────────────────────────────────────────────────┘      │
└─────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: Asana Task Management                                   │
│                                                                  │
│  • Task created in "OpsPal - Reflection Improvements"           │
│  • Assigned to plugin developers                                │
│  • Includes RCA, solution design, success criteria              │
│  • Links back to Supabase reflections by ID                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 6: Human Review & Implementation                           │
│                                                                  │
│  • Developers review tasks in Asana                             │
│  • Implement fixes in plugins                                   │
│  • Update plugin versions                                       │
│  • Mark tasks complete in Asana                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Observations**:
- Steps 1-2: User-facing (anon key)
- Steps 4-5: Internal (service role key + Asana)
- Step 6: Human intervention

---

# Part 3: Usage Patterns

## Correct Patterns

### ✅ Pattern 1: Internal Agent with MCP Access

**Scenario**: You're creating an internal agent that needs to query Supabase.

**Correct Implementation**:

```yaml
---
name: my-internal-analyzer
tools: mcp__supabase__*, Read, Write
---

# My Internal Analyzer

You analyze data from Supabase reflections table.

## Usage

Query reflections:
```
SELECT * FROM reflections
WHERE status = 'new'
ORDER BY created_at DESC
LIMIT 20
```

Handle errors gracefully - see error handling section.
```

**Why This is Correct**:
- ✅ Internal agent (not in `.claude-plugins/`)
- ✅ Declares MCP tools in frontmatter
- ✅ Uses service role key access
- ✅ Error handling documented

---

### ✅ Pattern 2: User Script with Anon Key

**Scenario**: You're writing a script for plugin users to query data.

**Correct Implementation**:

```javascript
#!/usr/bin/env node

/**
 * Query Reflections - User-Facing Script
 *
 * Uses: SUPABASE_ANON_KEY (read-only, RLS-protected)
 * Location: .claude-plugins/opspal-salesforce/scripts/lib/
 */

const https = require('https');

async function queryReflections() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/reflections?limit=10`;

  const options = {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,  // ✅ ANON key (correct)
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
    }
  };

  try {
    const response = await makeRequest(url, options);
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error('❌ Query failed:', error.message);
    console.error('💡 Troubleshooting:');
    console.error('   1. Check SUPABASE_URL is set');
    console.error('   2. Verify SUPABASE_ANON_KEY is valid');
    console.error('   3. Ensure RLS allows this query');
    process.exit(1);
  }
}

// Helper function...
function makeRequest(url, options) {
  // Implementation...
}

queryReflections();
```

**Why This is Correct**:
- ✅ Uses anon key (appropriate for user-facing)
- ✅ Clear error messages with troubleshooting
- ✅ No direct MCP tool usage (HTTP API instead)
- ✅ Documented security context

---

### ✅ Pattern 3: Task Tool Delegation (Plugin Agent)

**Scenario**: Plugin agent needs to create Asana task but shouldn't have direct access.

**Correct Implementation**:

```yaml
---
name: my-plugin-orchestrator
tools: Task, Read, Write, TodoWrite, Bash
# NOTE: No mcp__asana__* tools!
---

# My Plugin Orchestrator

When creating approval tasks, use delegation pattern:

## Approval Task Pattern

**Step 1**: Create approval artifact file

```bash
cat > approval-request.md << 'EOF'
# Approval Request: FEAT-001

## Summary
[Description of what needs approval]

## Key Details
- Impact: HIGH
- Effort: 3 days
- Risk: LOW

## Recommendation
APPROVE with conditions: [list conditions]
EOF
```

**Step 2**: Delegate to internal agent

Use Task tool to invoke internal workflow:

"Please create an Asana task for FEAT-001 approval.
Read the request from: ./approval-request.md
Assign to: tech-lead@company.com
Due: One week from today"

**Step 3**: Wait for approval token

User will provide "APPROVED: FEAT-001" when ready to proceed.
```

**Why This is Correct**:
- ✅ No MCP tools in frontmatter
- ✅ Uses Task tool for delegation
- ✅ Creates artifact file (clear interface)
- ✅ Documents the delegation pattern

---

## Anti-Patterns to Avoid

### 🚫 Anti-Pattern 1: Plugin Agent with Internal MCP

**Problem**: User-facing agent declares Asana/Supabase MCP tools

**Incorrect Implementation**:

```yaml
---
name: bad-plugin-agent
tools: Task, Read, Write, mcp__asana__asana_create_task  # ❌ WRONG
---
```

**Why This is Wrong**:
- 🚫 User-facing plugin with internal MCP
- 🚫 Requires .mcp.json (gitignored, not available to users)
- 🚫 Breaks plugin distribution
- 🚫 Security violation

**Correct Alternative**: Use delegation pattern (see Pattern 3 above)

---

### 🚫 Anti-Pattern 2: User Script with Service Role Key

**Problem**: Plugin script uses Supabase service role key

**Incorrect Implementation**:

```javascript
// ❌ WRONG: User script with service role key
const options = {
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,  // ❌ BYPASSES RLS
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  }
};
```

**Why This is Wrong**:
- 🚫 Bypasses Row-Level Security
- 🚫 Grants excessive permissions to users
- 🚫 Security risk (can access all data)

**Correct Alternative**: Use SUPABASE_ANON_KEY (Pattern 2 above)

---

### 🚫 Anti-Pattern 3: Silent Failure with Fake Data

**Problem**: Script returns fake data on MCP failure

**Incorrect Implementation**:

```javascript
// ❌ WRONG: Silent failure
try {
  const reflections = await querySupabase();
  return reflections;
} catch (error) {
  return [];  // ❌ Hides the problem!
}
```

**Why This is Wrong**:
- 🚫 User doesn't know query failed
- 🚫 Makes debugging difficult
- 🚫 Could lead to incorrect decisions

**Correct Alternative**:

```javascript
// ✅ CORRECT: Explicit error
try {
  const reflections = await querySupabase();
  return reflections;
} catch (error) {
  console.error('❌ Failed to query reflections:', error.message);
  console.error('💡 Check SUPABASE_URL and SUPABASE_ANON_KEY');
  throw new DataAccessError('Supabase query failed', {
    operation: 'query_reflections',
    timestamp: new Date().toISOString()
  });
}
```

---

### 🚫 Anti-Pattern 4: N+1 Queries in Loop

**Problem**: MCP query inside loop (inefficient)

**Incorrect Implementation**:

```javascript
// ❌ WRONG: N+1 queries
for (const reflection of reflections) {
  const details = await supabase
    .from('reflection_details')
    .select('*')
    .eq('reflection_id', reflection.id);
  reflection.details = details;
}
```

**Why This is Wrong**:
- 🚫 Makes N separate queries (slow)
- 🚫 Increases latency
- 🚫 Could hit rate limits

**Correct Alternative**:

```javascript
// ✅ CORRECT: Batch query
const ids = reflections.map(r => r.id);
const allDetails = await supabase
  .from('reflection_details')
  .select('*')
  .in('reflection_id', ids);

const detailsMap = Object.fromEntries(
  allDetails.map(d => [d.reflection_id, d])
);

reflections.forEach(r => {
  r.details = detailsMap[r.id];
});
```

---

## Delegation Pattern

### When to Use Delegation

Use Task tool delegation when:
- ✅ Plugin agent needs Asana task creation
- ✅ Plugin agent needs administrative Supabase operations
- ✅ Workflow spans user-facing + internal boundaries

### Delegation Template

```markdown
# Delegation Pattern Template

## Step 1: Create Interface Artifact

Create a structured file with all required information:

```bash
mkdir -p artifacts/
cat > artifacts/my-request.md << 'EOF'
# Request: [ID]

## Context
[What's being requested]

## Details
[Key information needed by internal agent]

## Expected Outcome
[What success looks like]
EOF
```

## Step 2: Use Task Tool

Invoke internal agent with clear instructions:

"Please process the request in artifacts/my-request.md.
[Specific action needed, e.g., 'Create Asana task', 'Query database', etc.]
Report back when complete."

## Step 3: Handle Response

Internal agent will report results. Parse response and proceed.
```

### Real-World Example: GTM Planning Approval

**Before** (Incorrect - Direct MCP):
```yaml
---
tools: mcp__asana__asana_create_task  # ❌ WRONG
---

# Create approval
await mcp__asana__asana_create_task({
  name: "Approval: DATA-001",
  notes: "[summary]"
});
```

**After** (Correct - Delegation):
```yaml
---
tools: Task, Read, Write  # ✅ CORRECT
---

# Step 1: Create artifact
Write to: gtm_annual_plan_2026/approvals/DATA-001.md

# Step 2: Delegate
Use Task tool:
"Create Asana approval task for DATA-001.
Read request from: gtm_annual_plan_2026/approvals/DATA-001.md
Assign to: data-steward@company.com"
```

---

# Part 4: Troubleshooting

## Common Errors

### Error 1: "MCP server not found"

**Symptoms**:
```
Error: MCP server 'supabase' not configured
```

**Root Causes**:
1. `.mcp.json` not present (expected for internal agents only)
2. User-facing plugin trying to use MCP directly (architectural violation)
3. MCP server name mismatch

**Solutions**:

**For Internal Agents**:
```bash
# Verify .mcp.json exists
ls -la .mcp.json

# Check server is defined
jq '.mcpServers | keys' .mcp.json
# Expected: ["asana", "supabase"]
```

**For Plugin Agents**:
- This error means architectural violation - plugin shouldn't access MCP
- Fix: Remove MCP tools from agent, use delegation pattern
- See [Anti-Pattern 1](#anti-pattern-1-plugin-agent-with-internal-mcp)

---

### Error 2: "Authentication failed" (401/403)

**Symptoms**:
```
Error: Request failed with status 401 Unauthorized
```

**Root Causes**:
1. Wrong API key (anon vs service role)
2. Expired credentials
3. RLS policies blocking access
4. Malformed Authorization header

**Solutions**:

**Step 1: Verify Credentials**:
```bash
# Check environment variables are set
echo "Supabase URL: ${SUPABASE_URL:0:30}..."
echo "Anon Key: ${SUPABASE_ANON_KEY:0:20}..."

# Test basic connectivity
curl -X GET "${SUPABASE_URL}/rest/v1/reflections?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Step 2: Check RLS Policies** (if using anon key):
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'reflections';

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'reflections';
```

**Step 3: Verify Key Type**:
- User-facing scripts: Use `SUPABASE_ANON_KEY`
- Internal agents: Use `SUPABASE_SERVICE_ROLE_KEY`

---

### Error 3: "Permission denied" (RLS)

**Symptoms**:
```
Error: new row violates row-level security policy
```

**Root Cause**: Row-Level Security policy blocking operation

**Solutions**:

**For User Operations** (anon key):
```sql
-- Check INSERT policy exists for anon users
SELECT * FROM pg_policies
WHERE tablename = 'reflections'
AND cmd = 'INSERT'
AND roles @> ARRAY['anon'];

-- If missing, create policy:
CREATE POLICY "anon_users_can_insert_reflections"
ON reflections
FOR INSERT
TO anon
WITH CHECK (
  auth.role() = 'anon'
);
```

**For Internal Operations** (service role):
```javascript
// Service role bypasses RLS - if getting this error, check:
1. Using correct key (SERVICE_ROLE not ANON)
2. Authorization header format correct
```

---

### Error 4: "Timeout" or "Connection refused"

**Symptoms**:
```
Error: connect ETIMEDOUT
Error: connect ECONNREFUSED
```

**Root Causes**:
1. Supabase/Asana service down
2. Network connectivity issues
3. Firewall blocking outbound HTTPS
4. No timeout configured (hangs indefinitely)

**Solutions**:

**Step 1: Check Service Status**:
```bash
# Supabase
curl -I https://status.supabase.com
open https://status.supabase.com

# Asana
curl -I https://status.asana.com
open https://status.asana.com
```

**Step 2: Test Connectivity**:
```bash
# Test DNS resolution
nslookup your-project.supabase.co

# Test HTTPS
curl -v https://your-project.supabase.co/rest/v1/
```

**Step 3: Add Timeout** (if not present):
```javascript
const req = https.request(url, options, callback);

req.setTimeout(10000, () => {  // 10 second timeout
  req.destroy();
  reject(new Error('Request timeout after 10s'));
});
```

---

### Error 5: "Data not appearing in Supabase"

**Symptoms**: Script says "success" but data not in database

**Root Causes**:
1. Writing to wrong project/table
2. RLS policy allowing insert but blocking SELECT
3. Transaction rolled back
4. Caching issue (stale query)

**Solutions**:

**Verify Write**:
```bash
# Get most recent reflection
curl -X GET "${SUPABASE_URL}/rest/v1/reflections?order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# If empty, check:
# 1. Correct SUPABASE_URL
# 2. Correct table name ('reflections' not 'reflection')
# 3. No errors in Supabase logs (Dashboard → Logs)
```

**Check RLS** (anon users might not be able to read their own inserts):
```sql
-- Verify SELECT policy exists
SELECT * FROM pg_policies
WHERE tablename = 'reflections'
AND cmd = 'SELECT';
```

---

## Debugging Tools

### 1. MCP Connection Test

```bash
# Test all MCP connections
./scripts/test-mcp-connections.sh

# Test specific server
node .claude-plugins/opspal-core/scripts/lib/mcp-connectivity-tester.js --server supabase --verbose

# Verbose mode
./scripts/test-mcp-connections.sh --verbose
```

### 2. Supabase Query Inspector

```bash
# Query recent reflections
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js recent

# Search reflections
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js search "workflow"

# Top issues
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js topIssues
```

### 3. Asana Task Viewer

```bash
# List tasks in project
curl -X GET "https://app.asana.com/api/1.0/projects/${ASANA_PROJECT_GID}/tasks" \
  -H "Authorization: Bearer $ASANA_ACCESS_TOKEN"
```

### 4. RLS Policy Verification

```bash
# Run RLS validator (when implemented)
node scripts/verify-supabase-rls.js

# Expected: All policies valid
```

### 5. Network Diagnostics

```bash
# Check DNS
nslookup your-project.supabase.co

# Check HTTPS
curl -v https://your-project.supabase.co/rest/v1/

# Check latency
time curl -X GET "${SUPABASE_URL}/rest/v1/reflections?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

---

# Part 5: Advanced Topics

## Adding New MCP Servers

### Prerequisites

Before adding a new MCP server:
- [ ] MCP server package available (npm, npx, or custom)
- [ ] Server supports Claude Code MCP protocol
- [ ] Clear use case (why needed)
- [ ] Security reviewed (credential management)

### Step-by-Step Guide

**Step 1: Install MCP Server Package** (if using npm):
```bash
npm install -g @vendor/mcp-server
# or use npx (no installation)
```

**Step 2: Configure in `.mcp.json`** (internal only):
```bash
# Edit .mcp.json
nano .mcp.json

# Add server entry:
{
  "mcpServers": {
    "existing-servers": { ... },
    "new-server": {
      "command": "npx",
      "args": ["-y", "@vendor/mcp-server"],
      "env": {
        "API_KEY": "${NEW_SERVER_API_KEY}",
        "API_URL": "${NEW_SERVER_API_URL}"
      }
    }
  }
}
```

**Step 3: Add Environment Variables**:
```bash
# Add to .env
echo "NEW_SERVER_API_KEY=your-key-here" >> .env
echo "NEW_SERVER_API_URL=https://api.vendor.com" >> .env

# Add to .env.example (for documentation)
cat >> .env.example << 'EOF'

# New Server MCP Configuration
NEW_SERVER_API_KEY=your-key-here
NEW_SERVER_API_URL=https://api.vendor.com
EOF
```

**Step 4: Test Connection**:
```bash
# Create test script
cat > scripts/test-new-server-mcp.sh << 'EOF'
#!/bin/bash
echo "Testing new-server MCP connection..."

# Test logic here (similar to test-mcp-connections.sh)
# ...

echo "✅ new-server MCP: Connected"
EOF

chmod +x scripts/test-new-server-mcp.sh
./scripts/test-new-server-mcp.sh
```

**Step 5: Create Internal Agent** (if needed):
```yaml
---
name: new-server-manager
tools: mcp__new_server__*, Read, Write
---

# New Server Manager

Internal agent for managing operations via new-server MCP.

## Usage
[Document how to use the new MCP tools]
```

**Step 6: Document in MCP Usage Guide**:
- Update [MCP Servers Overview](#mcp-servers-overview)
- Add to [MCP Tool Reference](#appendix-b-mcp-tool-reference)
- Document any new patterns

---

## Error Handling Best Practices

### 1. Always Wrap MCP Calls

**Minimum Pattern**:
```javascript
try {
  const result = await mcpOperation();
  return result;
} catch (error) {
  console.error('❌ MCP operation failed:', error.message);
  throw error;  // Re-throw for caller to handle
}
```

**Enhanced Pattern**:
```javascript
try {
  const result = await mcpOperation();

  // Validate result
  if (!result || !result.data) {
    throw new Error('Invalid response from MCP');
  }

  return result;

} catch (error) {
  // Structured error logging
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: 'mcp_query',
    server: 'supabase',
    error_message: error.message,
    error_code: error.code,
    stack: error.stack
  }, null, 2));

  // User-friendly message
  console.error('');
  console.error('💡 Troubleshooting:');
  console.error('   1. Check MCP server is running');
  console.error('   2. Verify credentials are valid');
  console.error('   3. See docs/MCP_USAGE_GUIDE.md#troubleshooting');

  throw error;
}
```

### 2. Create Custom Error Classes

```javascript
class DataAccessError extends Error {
  constructor(server, message, context = {}) {
    super(message);
    this.name = 'DataAccessError';
    this.server = server;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      server: this.server,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// Usage:
try {
  const data = await querySupabase();
} catch (error) {
  throw new DataAccessError('Supabase', 'Query failed', {
    table: 'reflections',
    query: 'SELECT * WHERE status = new',
    original_error: error.message
  });
}
```

### 3. Retry Logic for Transient Failures

```javascript
async function retryMCPOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return result;

    } catch (error) {
      // Determine if error is retryable
      const isRetryable =
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.message.includes('rate limit');

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      console.warn(`⚠️  Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2;  // Exponential backoff
    }
  }
}

// Usage:
const reflections = await retryMCPOperation(
  () => querySupabase('reflections'),
  3,  // max 3 retries
  1000  // start with 1 second delay
);
```

### 4. Graceful Degradation

```javascript
async function getReflectionsWithFallback() {
  try {
    // Try primary method (MCP)
    return await querySupabaseMCP();

  } catch (mcpError) {
    console.warn('⚠️  MCP unavailable, trying fallback...');

    try {
      // Fallback: Direct HTTP API
      return await querySupabaseHTTP();

    } catch (httpError) {
      console.error('❌ Both MCP and HTTP failed');

      // Last resort: Return cached data (if available)
      const cached = loadCachedReflections();
      if (cached) {
        console.warn('⚠️  Returning stale data from cache');
        return cached;
      }

      // No options left
      throw new DataAccessError('Supabase', 'All access methods failed', {
        mcp_error: mcpError.message,
        http_error: httpError.message
      });
    }
  }
}
```

---

## Performance Optimization

### 1. Batch Queries (Avoid N+1)

**See Anti-Pattern 4 for details.**

**Quick Reference**:
```javascript
// ❌ BAD (N queries)
for (const item of items) {
  const detail = await query(item.id);
}

// ✅ GOOD (1 query)
const ids = items.map(i => i.id);
const details = await queryBatch(ids);
```

### 2. Parallel Execution

```javascript
// ❌ BAD (Sequential - slow)
const user = await getUser(id);
const profile = await getProfile(id);
const settings = await getSettings(id);

// ✅ GOOD (Parallel - fast)
const [user, profile, settings] = await Promise.all([
  getUser(id),
  getProfile(id),
  getSettings(id)
]);
```

### 3. Connection Reuse

```javascript
// ✅ Create singleton Supabase client
let supabaseClient;

function getSupabaseClient() {
  if (!supabaseClient) {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },  // Server-side
        db: { schema: 'public' },
        global: {
          headers: { 'x-application': 'opspal-internal-plugins' }
        }
      }
    );
  }
  return supabaseClient;
}

// Usage: Reuses same client
const supabase = getSupabaseClient();
const data1 = await supabase.from('reflections').select('*');
const data2 = await supabase.from('reflection_details').select('*');
```

### 4. Caching

```javascript
// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 60 * 1000;  // 1 minute

async function getCachedReflections() {
  const cacheKey = 'recent_reflections';
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('✅ Cache hit');
    return cached.data;
  }

  console.log('⚠️  Cache miss, fetching...');
  const data = await querySupabase();

  cache.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });

  return data;
}
```

### 5. Query Optimization

```javascript
// ❌ BAD: Fetching all columns
const reflections = await supabase
  .from('reflections')
  .select('*');  // Fetches everything

// ✅ GOOD: Select only needed columns
const reflections = await supabase
  .from('reflections')
  .select('id, org, focus_area, created_at')  // Specific columns
  .limit(20);  // Pagination
```

---

## Security Considerations

### 1. Key Rotation Procedures

**Schedule**: Rotate MCP API keys every 90 days

**Process**:
1. Generate new key in service dashboard
2. Update `.env` with new key
3. Update deployment environments
4. Test with `./scripts/test-mcp-connections.sh`
5. Grace period (24 hours with both keys active)
6. Revoke old key

**See complete procedures**: [Key Rotation Section](#key-rotation) (to be added by Week 4)

### 2. Principle of Least Privilege

**Key Usage**:
- **Anon Key**: User-facing operations only
  - Submit reflections
  - Query own data (RLS-protected)
  - Read-only access

- **Service Role Key**: Internal workflows only
  - Batch operations
  - Administrative tasks
  - Bypasses RLS (use carefully)

**Rule**: If in doubt, use anon key first. Escalate to service role only if needed.

### 3. RLS Policy Best Practices

**Recommended Policies** (Supabase):

```sql
-- Allow anon users to INSERT their own reflections
CREATE POLICY "anon_insert_reflections"
ON reflections
FOR INSERT
TO anon
WITH CHECK (
  auth.role() = 'anon'
  -- Optional: Add user identification if available
  -- AND user_email = current_setting('request.jwt.claims')::json->>'email'
);

-- Allow anon users to SELECT their own reflections
CREATE POLICY "anon_select_own_reflections"
ON reflections
FOR SELECT
TO anon
USING (
  -- If you track user_email in reflections:
  user_email = current_setting('request.jwt.claims')::json->>'email'
  -- Or allow all if data is not sensitive:
  -- true
);

-- Service role has full access (bypasses RLS automatically)
```

**Verification**:
```bash
# Run RLS validator (Week 4 deliverable)
node scripts/verify-supabase-rls.js
```

### 4. Credential Storage

**✅ Correct**:
- `.env` file (gitignored)
- Environment variables in deployment platform
- Secret management service (AWS Secrets Manager, etc.)

**🚫 Incorrect**:
- Hardcoded in source code
- Committed to git
- Stored in plain text files
- Shared via email/chat

### 5. Logging Security

**Safe Logging**:
```javascript
// ✅ GOOD: Sanitized
console.log('Connecting to Supabase:', {
  url: process.env.SUPABASE_URL,
  key_prefix: process.env.SUPABASE_ANON_KEY.substring(0, 10) + '***'
});
```

**Unsafe Logging**:
```javascript
// ❌ BAD: Leaks credentials
console.log('Using key:', process.env.SUPABASE_ANON_KEY);  // NEVER DO THIS
```

---

# Appendices

## Appendix A: Environment Variable Reference

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `SUPABASE_URL` | Yes | User + Internal | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | User scripts | Read-only access (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Internal only | Internal agents | Full access (bypasses RLS) |
| `ASANA_ACCESS_TOKEN` | Internal only | Internal agents | Asana API access |
| `ASANA_WORKSPACE_ID` | Internal only | Internal agents | Target workspace |
| `ASANA_PROJECT_GID` | Internal only | Internal agents | Default project |
| `USER_EMAIL` | Optional | All | Attribution for reflections |
| `ORG_NAME` | Optional | All | Default org alias |
| `SLACK_WEBHOOK_URL` | Optional | Internal | Notifications |
| `NODE_ENV` | Optional | All | Environment mode |
| `DEBUG` | Optional | All | Debug logging |
| `LOG_LEVEL` | Optional | All | Logging verbosity |

**Get Full Template**: See `.env.example`

---

## Appendix B: MCP Tool Reference

### Supabase MCP Tools

| Tool | Purpose | Access Level |
|------|---------|--------------|
| `mcp__supabase__query` | Execute SELECT query | Anon: RLS-protected<br>Service: Full |
| `mcp__supabase__insert` | Insert rows | Anon: RLS-protected<br>Service: Full |
| `mcp__supabase__update` | Update rows | Anon: RLS-protected<br>Service: Full |
| `mcp__supabase__delete` | Delete rows | Anon: RLS-protected<br>Service: Full |
| `mcp__supabase__rpc` | Call stored procedure | Anon: RLS-protected<br>Service: Full |

**Documentation**: https://supabase.com/docs/guides/api

### Asana MCP Tools

| Tool | Purpose | Access Level |
|------|---------|--------------|
| `mcp__asana__asana_create_task` | Create task | Personal Access Token |
| `mcp__asana__asana_update_task` | Update task | Personal Access Token |
| `mcp__asana__asana_get_task` | Get task details | Personal Access Token |
| `mcp__asana__asana_list_tasks` | List tasks in project | Personal Access Token |

**Documentation**: https://developers.asana.com/docs

---

## Appendix C: Related Documentation

### Internal Documentation

- **MCP Audit Report**: `docs/MCP_AUDIT_REPORT_2025-10-23.md`
- **CLAUDE.md**: Project-level instructions
- **Supabase Reflection System**: `SUPABASE_REFLECTION_SYSTEM.md` (gitignored)

### Plugin Documentation

- **Salesforce Plugin**: `.claude-plugins/opspal-salesforce/.claude-plugin/USAGE.md`
- **HubSpot Plugin**: `.claude-plugins/opspal-hubspot/.claude-plugin/USAGE.md`
- **GTM Planning Plugin**: `.claude-plugins/opspal-gtm-planning/.claude-plugin/README.md`

### External Resources

- **Claude Code Docs**: https://docs.claude.com/claude-code
- **MCP Protocol Spec**: https://modelcontextprotocol.io/
- **Supabase Docs**: https://supabase.com/docs
- **Asana API Docs**: https://developers.asana.com/docs

---

## Feedback & Improvements

Found an issue or have a suggestion? Please:

1. **For MCP-related issues**: See [Troubleshooting](#part-4-troubleshooting)
2. **For documentation gaps**: Submit reflection via `/reflect` command
3. **For security concerns**: Email security@revpal.com immediately
4. **For feature requests**: Create issue in GitHub repository

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-23
**Maintained By**: RevPal Engineering - OpsPal Team

**Next Review**: 2025-11-23 (monthly updates)
