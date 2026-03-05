# Supabase Reflections Database - Quick Start

## 🎯 Current Status: Ready to Apply Migration

The complete schema is ready in `scripts/COMPLETE_REFLECTIONS_SCHEMA.sql`

## ⚡ Quick Apply (2 minutes)

### Step 1: Open Supabase SQL Editor

Click this link: [Open SQL Editor](https://supabase.com/dashboard/project/REDACTED_SUPABASE_PROJECT/sql/new)

### Step 2: Copy & Paste SQL

```bash
# Copy the complete schema
cat scripts/COMPLETE_REFLECTIONS_SCHEMA.sql
```

Paste the entire contents into the SQL Editor.

### Step 3: Run

Click the **RUN** button in the SQL Editor.

You should see: **"Success. No rows returned"**

### Step 4: Verify

```bash
# Load environment variables
source .env

# Verify migration
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/verify-workflow-migration.js
```

Expected output:
```
✅ Migration successful!

New columns added:
  ✓ reflection_status
  ✓ asana_project_id, asana_task_id, asana_task_url
  ✓ reviewed_at, reviewed_by
  ✓ rejection_reason, implementation_notes

Views created:
  ✓ reflection_triage_queue
  ✓ reflection_backlog
  ✓ reflection_implementation_status

🎉 Workflow tracking system is ready!
```

## 🔍 What Gets Created

### Tables
- **reflections** - Main table with all fields including workflow tracking

### Views
- **reflection_triage_queue** - New reflections sorted by ROI
- **reflection_backlog** - Accepted items awaiting implementation
- **reflection_implementation_status** - Summary statistics by status

### Permissions
- ✅ Anonymous INSERT (anyone can submit reflections)
- ✅ Public SELECT (transparent, everyone can query)
- ✅ Authenticated UPDATE (workflow management)

## 📊 Using the Workflow System

### View Triage Queue
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js triage
```

### Process Reflections
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/process-reflections.js triage
```

### Create Asana Task
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/create-reflection-task.js <reflection-id>
```

### Query Reflections
```bash
# Recent reflections
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js recent

# Top issues
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js topIssues

# Search
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js search "automation"

# Your org
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/query-reflections.js myOrg neonone
```

## 🔧 Troubleshooting

### "Invalid URL" Error
```bash
# Make sure environment variables are loaded
source .env
```

### "Migration NOT complete" Error
The SQL hasn't been applied yet. Follow Step 1-3 above.

### "Connection refused" Error
Check your internet connection and Supabase service status.

## 📝 Schema Details

### Reflection Status Workflow
1. **new** - Just submitted, awaiting triage
2. **under_review** - Being evaluated by team
3. **accepted** - Approved for implementation
4. **implemented** - Changes applied to codebase
5. **deferred** - Valid but low priority
6. **rejected** - Not applicable or won't implement

### Key Fields
- `id` - UUID primary key
- `created_at` - Submission timestamp
- `org` - Salesforce org name
- `focus_area` - Assessment type (CPQ, RevOps, etc.)
- `data` - Full reflection JSON
- `total_issues` - Number of issues found
- `priority_issues` - High-priority items
- `roi_annual_value` - Estimated annual savings
- `reflection_status` - Current workflow state
- `asana_task_id` - Linked Asana task (if created)

## 🔒 Security

- **No secrets stored** - Reflections focus on patterns, not credentials
- **Public by design** - All data transparent and queryable
- **Anonymous writes** - No auth required to submit
- **Read-only API key** - Can't modify existing data via anon key

See `docs/SUPABASE_MCP_SECURITY.md` for complete security documentation.

## 📚 Related Documentation

- **Setup Status**: `SUPABASE_MCP_SETUP_STATUS.md` - Technical details
- **Security Guide**: `docs/SUPABASE_MCP_SECURITY.md` - Security model
- **Reflection System**: `docs/REFLECTION_COLLECTION_SYSTEM.md` - Architecture
- **Reflect Command**: `.claude/commands/reflect.md` - Usage guide

---

**Last Updated**: 2025-01-11
**Schema Version**: 1.0 (complete base + workflow)
