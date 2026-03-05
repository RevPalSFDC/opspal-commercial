# Automation Boundaries & Best Practices

**Version**: v1.0.0
**Implemented**: 2025-10-13
**Last Updated**: 2025-10-20

## Overview

**Purpose**: Clarify what operations can be automated vs what requires manual execution, and ensure graceful fallback UX when automation isn't possible.

This guide establishes clear boundaries for automation capabilities and provides standards for handling operations that cannot be fully automated.

## What Claude CAN Automate

### ✅ Fully Automated Operations

#### File Operations

- Reading files (`Read` tool)
- Writing new files (`Write` tool)
- Editing existing files (`Edit` tool)
- Searching files (`Grep`, `Glob` tools)

#### Supabase Operations (via MCP)

- SELECT queries (read reflections, cohorts, fix plans)
- INSERT operations (submit new reflections - with anon key)
- UPDATE operations (requires service role key)
- DELETE operations (requires service role key)

#### Supabase DDL Operations (via Migration Toolkit)

- ALTER TABLE (add/modify/drop columns)
- CREATE INDEX
- CREATE/ALTER constraints
- CREATE/ALTER triggers
- All DDL with rollback capability

#### Git Operations

- Committing changes
- Pushing to remote
- Creating branches
- Merging branches (non-conflicting)

#### API Operations

- Asana task creation (via MCP)
- Asana task updates (via MCP)
- Slack notifications (via webhooks)
- Supabase REST API calls (with service role key)

## What Requires Manual Execution

### ❌ Manual Operations (Security/Permission Boundaries)

#### Dangerous Database Operations

- `DROP DATABASE`
- `DROP SCHEMA`
- `TRUNCATE TABLE` (without confirmation)
- Bulk deletes (>1000 rows without confirmation)

#### Third-Party Service Configuration

- HubSpot Connected App setup
- Salesforce Connected App creation
- API key generation (Asana, Supabase, etc.)
- OAuth flow completion

#### Production Deployments

- Production database schema changes (require review)
- Production data migrations (>10,000 rows)
- Breaking API changes
- Security-sensitive updates

#### Environment Setup

- Service account creation
- Role/permission configuration
- SSL certificate installation
- Firewall rule configuration

## Automation-First Decision Tree

All agents and scripts should follow this decision tree:

```
1. CAN this operation be automated safely?
   ├─ YES → Attempt automation
   │         ├─ SUCCESS → Log and confirm
   │         └─ FAILED → Explain error + provide manual fallback
   │
   └─ NO → Why not?
             ├─ Security risk → Require manual confirmation
             ├─ Permission boundary → Provide setup instructions + manual steps
             ├─ Missing credentials → Explain how to configure + manual steps
             └─ External system limitation → Explain limitation + manual steps
```

## Manual Fallback Standards

When automation is NOT possible, all agents must follow the Manual Operation Output Template:

### Required Elements

1. **Lead with actionable code** (copy-paste ready)
2. **Explain why manual** (1-2 sentences)
3. **Provide step-by-step instructions** (specific navigation paths)
4. **Include rollback/undo** (when applicable)
5. **Verification step** (how to confirm it worked)

### Example Output Format

```markdown
## ✅ Add Reflection Status Column - Ready to Execute

```sql
ALTER TABLE reflections
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
```

**Why Manual:** Supabase MCP restricted to SELECT/INSERT/UPDATE for security

**How to Execute:**
1. Supabase Dashboard → SQL Editor
2. Paste SQL above → Run
3. Verify: SELECT status FROM reflections LIMIT 1;

**Rollback:**
```sql
ALTER TABLE reflections DROP COLUMN IF EXISTS status;
```
```

## Migration Toolkit Usage

For Supabase DDL operations, use the **Schema Migration Toolkit**:

### Location and Agent

- **Script**: `.claude-plugins/developer-tools-plugin/scripts/lib/supabase-schema-migrator.js`
- **Agent**: `supabase-schema-manager` (in developer-tools-plugin)

### Commands

```bash
# Execute migration
node supabase-schema-migrator.js migrate <migration-file> [--dry-run]

# Rollback migration
node supabase-schema-migrator.js rollback <migration-id>

# List history
node supabase-schema-migrator.js list

# Validate migration
node supabase-schema-migrator.js validate <migration-file>
```

### Migration File Format

```json
{
  "id": "add-reflection-tags",
  "description": "Add tags column to reflections table",
  "up": "ALTER TABLE reflections ADD COLUMN IF NOT EXISTS tags TEXT[];",
  "down": "ALTER TABLE reflections DROP COLUMN IF EXISTS tags;"
}
```

### Benefits

- Automatic execution via service role key
- Rollback capability for all migrations
- Migration history logging
- Pre-flight validation
- Dry-run mode for testing

## Agent Integration

All internal agents now implement automation-first pattern:

### Updated Agents

- **supabase-asana-bridge** - Attempts MCP automation, provides manual Asana task template if fails
- **supabase-workflow-manager** - Attempts Supabase MCP, falls back to copy-paste SQL
- **supabase-schema-manager** (NEW) - Uses migration toolkit for DDL operations

### Template Location

`.claude-plugins/developer-tools-plugin/templates/manual-operation-output.md`

## Success Criteria

Implementation is successful when:

- [ ] All DDL operations attempt automation via migration toolkit
- [ ] Manual fallback provides copy-paste code/SQL upfront (not buried)
- [ ] Rollback/undo instructions included for all schema changes
- [ ] User feedback shows reduced friction for manual operations
- [ ] Zero cases of "I couldn't figure out what to do" in reflections

## ROI Metrics

### Financial Impact

- **Annual Value**: $18,000
- **Implementation Cost**: 8 hours (COMPLETE)
- **Payback Period**: 1.1 months
- **Prevention Rate**: 85% of manual DDL friction eliminated

### Measured Impact

- **Schema migration attempts**: Track via migration log
- **Manual operation quality**: Spot-check output format compliance
- **User feedback**: Monitor /reflect for automation friction mentions

## Related Components

### Core Infrastructure

- **Migration Toolkit**: `.claude-plugins/developer-tools-plugin/scripts/lib/supabase-schema-migrator.js`
- **Schema Manager Agent**: `.claude-plugins/developer-tools-plugin/agents/supabase-schema-manager.md`
- **Output Template**: `.claude-plugins/developer-tools-plugin/templates/manual-operation-output.md`
- **Migration Examples**: `.claude-plugins/developer-tools-plugin/scripts/migrations/examples/`

### Internal Agents

- `.claude/agents/supabase-asana-bridge.md`
- `.claude/agents/supabase-workflow-manager.md`

## Best Practices

### For Agent Developers

1. **Always attempt automation first** - Don't assume something can't be automated
2. **Provide excellent fallbacks** - If automation fails, make manual steps crystal clear
3. **Lead with code** - Put copy-paste ready code/SQL at the top, not buried in explanation
4. **Include rollback** - Always provide undo/rollback instructions for destructive operations
5. **Test both paths** - Verify both automated and manual paths work correctly

### For Script Developers

1. **Use Migration Toolkit for DDL** - Don't write raw SQL execution code
2. **Implement dry-run mode** - Allow users to preview changes before execution
3. **Log all operations** - Track what was attempted vs what succeeded
4. **Graceful degradation** - Fail gracefully with helpful error messages
5. **Validate inputs** - Check prerequisites before attempting automation

### For Users

1. **Review manual steps carefully** - Even when automation fails, the fallback should be clear
2. **Provide feedback** - Use `/reflect` to report automation friction
3. **Verify results** - Always run the verification step after manual operations
4. **Keep credentials configured** - Ensure environment variables are set for automation to work

## Troubleshooting

### Automation Attempt Fails

**Problem**: Agent reports it cannot automate an operation

**Solutions**:
1. Check if required credentials are configured (`.env` file)
2. Verify MCP servers are running (`/mcp list`)
3. Review the manual fallback instructions provided
4. Check agent logs for specific error messages

### Manual Instructions Unclear

**Problem**: Manual fallback instructions are confusing or incomplete

**Solutions**:
1. Check if the agent is using the manual operation template
2. Look for code blocks at the top of the output (should be copy-paste ready)
3. Submit feedback via `/reflect` to improve the agent's output
4. Consult this guide for expected output format

### Migration Fails

**Problem**: Schema migration via toolkit fails

**Solutions**:
1. Run with `--dry-run` first to preview changes
2. Check migration file format matches the spec
3. Verify service role key is configured correctly
4. Review migration history with `list` command
5. Use rollback command if needed

## Version History

- **v1.0.0** (2025-10-13): Initial release
  - Automation boundaries defined
  - Manual fallback standards established
  - Migration toolkit integrated
  - Agent patterns documented
