# Anti-Reinvention Guide - Stop Writing Custom Scripts

**Created**: 2025-10-26
**Reason**: Claude kept reinventing database queries and API calls instead of using existing tools
**Impact**: Wasted time, incorrect column names, broken queries, frustration

## Problem

Claude repeatedly wrote custom curl commands and one-off scripts for Supabase and Asana operations, despite existing, tested tools being available. This resulted in:

1. **Wrong column names** (e.g., `submitted_at` instead of `created_at`)
2. **Broken queries** (e.g., `status` instead of `reflection_status`)
3. **Wasted development time** (writing and debugging custom scripts)
4. **Inconsistent patterns** (everyone doing things differently)

## Solution

Added comprehensive "NEVER REINVENT THE WHEEL" section to CLAUDE.md with:

1. **Clear tables** showing which tool to use for each operation
2. **Database schema reference** to prevent column name errors
3. **WRONG vs RIGHT examples** showing anti-patterns and correct patterns
4. **Helper script** that demonstrates proper usage (`supabase-common-operations.sh`)
5. **Decision tree** for quick lookup
6. **Verification checklist** before writing new code

## What Changed

### 1. CLAUDE.md - New Section (Lines 11-163)

Location: `opspal-internal-plugins/CLAUDE.md`

**Added**:
- 🚨 NEVER REINVENT THE WHEEL section at the top (highly visible)
- Supabase operations reference table
- Asana operations reference table
- Salesforce operations reference
- Database schema with column names
- Common mistakes documentation
- Quick decision tree
- Verification checklist

**Key Content**:
- Lists all existing scripts and when to use them
- Shows WRONG (❌) vs RIGHT (✅) patterns
- Documents the exact column names in the schema
- Provides examples of proper usage

### 2. Helper Script - supabase-common-operations.sh

Location: `.claude-plugins/opspal-salesforce/scripts/lib/supabase-common-operations.sh`

**Purpose**: Demonstrate and enforce correct usage patterns

**Features**:
- Shows all available pre-built queries
- Displays database schema with correct column names
- Wraps existing query-reflections.js script
- Provides usage examples
- Color-coded output for visibility

**Commands**:
```bash
# Show schema (prevents column name errors)
./supabase-common-operations.sh schema

# List all available queries
./supabase-common-operations.sh list-queries

# Execute queries correctly
./supabase-common-operations.sh query-recent
./supabase-common-operations.sh query-search "workflow"
./supabase-common-operations.sh query-org eta-corp
```

### 3. Documentation Changes

**Files Modified**:
- `CLAUDE.md` - Added comprehensive reference section
- Created `docs/ANTI_REINVENTION_GUIDE.md` (this file)

**Files Created**:
- `.claude-plugins/opspal-salesforce/scripts/lib/supabase-common-operations.sh`

## Usage Rules Going Forward

### Rule 1: Check Existing Tools FIRST

**Before writing ANY script:**
```
1. Check .claude-plugins/*/scripts/lib/ for existing scripts
2. Review CLAUDE.md "NEVER REINVENT" section
3. Try existing slash commands
4. Look for MCP tools
5. Only then consider writing new code
```

### Rule 2: Use Helper Scripts

```bash
# ❌ WRONG - Writing custom queries
curl -X GET "$SUPABASE_URL/rest/v1/reflections?..."

# ✅ RIGHT - Using helper script
./supabase-common-operations.sh query-recent
```

### Rule 3: Reference Schema Before Queries

```bash
# Show schema to see exact column names
./supabase-common-operations.sh schema

# Then write query using CORRECT column names
# created_at (not submitted_at)
# reflection_status (not status)
```

### Rule 4: Follow the Decision Tree

```
Need to interact with a system?
├─ Supabase reflections? → query-reflections.js
├─ Asana tasks? → /asana-link, /asana-update
├─ Salesforce data? → sf CLI (auto-corrected)
└─ Complex operation? → Check scripts/lib/ first
```

## Common Anti-Patterns (DON'T DO THIS)

### ❌ Anti-Pattern 1: Custom Curl Commands

```bash
# WRONG - Reinventing the wheel
curl -X GET "$SUPABASE_URL/rest/v1/reflections?limit=10"

# RIGHT - Using existing script
node scripts/lib/query-reflections.js recent
```

### ❌ Anti-Pattern 2: Creating Temporary Scripts

```bash
# WRONG - One-off scripts
cat > /tmp/query.js << 'EOF'
const { createClient } = require('@supabase/supabase-js');
...
EOF
node /tmp/query.js

# RIGHT - Using existing scripts
./supabase-common-operations.sh query-recent
```

### ❌ Anti-Pattern 3: Guessing Column Names

```bash
# WRONG - Guessing without checking schema
WHERE submitted_at < ...  # Column doesn't exist!
WHERE status = ...        # Column doesn't exist!

# RIGHT - Checking schema first
./supabase-common-operations.sh schema
# Then using correct names:
WHERE created_at < ...
WHERE reflection_status = ...
```

### ❌ Anti-Pattern 4: Ignoring Existing Tools

```bash
# WRONG - Writing custom Asana API calls
curl -X POST https://app.asana.com/api/1.0/tasks/...

# RIGHT - Using existing commands
/asana-link
/asana-update
```

## Existing Tools Reference

### Supabase Operations

**Script**: `.claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js`

**Available Queries**:
- `recent` - Last 20 reflections
- `triage` - New reflections needing review
- `backlog` - Accepted reflections pending implementation
- `status` - Implementation status summary
- `topIssues` - Most common issue types
- `orgStats` - Statistics by org
- `priorityTrend` - Priority trends (3 months)
- `topROI` - Top 10 by ROI
- `search <keyword>` - Full-text search
- `detail <id>` - Full details for reflection

**Usage**:
```bash
cd .claude-plugins/opspal-salesforce
node scripts/lib/query-reflections.js recent
node scripts/lib/query-reflections.js search "workflow"
node scripts/lib/query-reflections.js myOrg eta-corp
```

### Asana Operations

**Commands**:
- `/asana-link` - Link Asana project to directory
- `/asana-update` - Post work summary to tasks

**Templates**: `.claude-plugins/opspal-core/templates/asana-updates/`
- `progress-update.md`
- `blocker-update.md`
- `completion-update.md`
- `milestone-update.md`

**Playbook**: `.claude-plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`

### Salesforce Operations

**Auto-Correction**: `.claude-plugins/opspal-salesforce/hooks/pre-sf-command-validation.sh`
- Automatically corrects 95% of common errors
- Validates before execution
- Provides clear error messages

## Success Metrics

**Before** (2025-10-26 and earlier):
- Custom curl commands written: 5-10 per session
- Column name errors: 2-3 per session
- Time wasted: 15-30 minutes debugging

**After** (Expected):
- Custom curl commands: 0 (use existing tools)
- Column name errors: 0 (schema reference available)
- Time saved: 15-30 minutes per session

## Quick Reference Card

**Print this and keep it visible:**

```
┌─────────────────────────────────────────────────────┐
│  BEFORE WRITING ANY DATABASE/API SCRIPT:           │
│                                                     │
│  1. Check CLAUDE.md "NEVER REINVENT" section       │
│  2. Look in .claude-plugins/*/scripts/lib/         │
│  3. Try ./supabase-common-operations.sh schema     │
│  4. Review existing slash commands                 │
│  5. Only then consider new code                    │
│                                                     │
│  IF YOU'RE WRITING CURL COMMANDS, STOP!            │
│  Use existing tools instead.                       │
└─────────────────────────────────────────────────────┘

Supabase:    ./supabase-common-operations.sh
Asana:       /asana-link, /asana-update
Salesforce:  sf CLI (auto-corrected via hooks)
```

## Related Documentation

- **Main Guide**: `CLAUDE.md` (lines 11-163)
- **Helper Script**: `.claude-plugins/opspal-salesforce/scripts/lib/supabase-common-operations.sh`
- **Asana Playbook**: `.claude-plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`
- **Query Script**: `.claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js`
- **Submit Script**: `.claude-plugins/opspal-salesforce/scripts/lib/submit-reflection.js`

## Enforcement

**Pre-commit hooks** (future):
- Detect curl commands to Supabase/Asana in new code
- Flag creation of /tmp/*.js scripts
- Validate schema references before commits

**Code review checklist**:
- [ ] No custom curl commands for Supabase/Asana?
- [ ] Using existing scripts from .claude-plugins/*/scripts/lib/?
- [ ] Correct column names (created_at, reflection_status)?
- [ ] Following templates for Asana updates?
- [ ] Checked CLAUDE.md before creating new tools?

---

**Remember**: The tools already exist. Your job is to USE them, not recreate them.
