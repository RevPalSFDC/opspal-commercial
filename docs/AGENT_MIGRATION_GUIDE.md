# Agent Migration Guide

This guide provides step-by-step instructions for migrating agents between directories in the RevPal Agent System.

## When to Migrate an Agent

### Migrate TO Platform-Specific Directory
Move an agent to `platforms/[PLATFORM]/.claude/agents/` when:
- ✅ It only works with one platform (Salesforce, HubSpot, etc.)
- ✅ It requires platform-specific MCP tools (mcp_salesforce, mcp_hubspot)
- ✅ It implements platform-specific business logic
- ✅ Its name includes the platform prefix (sfdc-, hubspot-)
- ✅ It handles platform-specific data operations

### Keep IN Core Directory
Keep an agent in `.claude/agents/` when:
- ✅ It orchestrates multiple platforms
- ✅ It provides system-wide functionality
- ✅ It's a utility used everywhere
- ✅ It handles cross-platform coordination
- ✅ It manages infrastructure concerns

## Migration Process

### Step 1: Pre-Migration Checklist

```bash
# 1. Check current agent location
ls -la .claude/agents/[agent-name].md

# 2. Check for references to this agent
grep -r "[agent-name]" . --include="*.md" --include="*.yaml" --include="*.yml"

# 3. Verify target directory exists
ls -la platforms/[PLATFORM]/.claude/agents/

# 4. Check if agent is currently in use
git log --oneline -n 10 -- .claude/agents/[agent-name].md
```

### Step 2: Analyze Agent Dependencies

Before moving, identify:
1. **Tool dependencies** - What MCP tools does it need?
2. **Script references** - What scripts does it call?
3. **Agent references** - What other agents does it invoke?
4. **Workflow usage** - Is it used in any workflows?

Example analysis:
```bash
# Check tool dependencies
grep "^tools:" .claude/agents/[agent-name].md

# Check script references
grep -E "node |bash |scripts/" .claude/agents/[agent-name].md

# Check workflow references
grep -r "[agent-name]" .claude/workflows/
```

### Step 3: Copy Agent to New Location

```bash
# Copy the agent file
cp .claude/agents/[agent-name].md platforms/[PLATFORM]/.claude/agents/

# Verify the copy
diff .claude/agents/[agent-name].md platforms/[PLATFORM]/.claude/agents/[agent-name].md
```

### Step 4: Update References

#### Main CLAUDE.md
Update the agent reference table:
```markdown
| Task Pattern | Use Agent | Keywords/Triggers |
|-------------|-----------|-------------------|
| SF conflicts | `sfdc-conflict-resolver` (in platforms/SFDC) | "deployment failed" |
```

#### Agent Discovery Hook
Update `.claude/hooks/agent-discovery.sh`:
```bash
echo "  Salesforce (in platforms/SFDC/.claude/agents/):"
echo "    • sfdc-conflict-resolver    → Deployment failures"
```

#### Documentation Files
Update references in:
- `.claude/AGENT_USAGE_EXAMPLES.md`
- `.claude/AGENT_CAPABILITY_MATRIX.md`
- `.claude/AGENT_ONBOARDING_GUIDE.md`

### Step 5: Test Agent Discovery

```bash
# Run agent discovery
bash .claude/hooks/agent-discovery.sh | grep "[agent-name]"

# Validate the agent
bash scripts/validate-agents.sh

# Test agent routing
node scripts/test-agent-routing.js [agent-name]
```

### Step 6: Remove Original File

Only after confirming everything works:
```bash
# Remove the original
rm .claude/agents/[agent-name].md

# Verify removal
ls .claude/agents/[agent-name].md 2>/dev/null || echo "Successfully removed"
```

### Step 7: Commit Changes

#### In Main Repository
```bash
git add -A
git commit -m "refactor: Move [agent-name] to platforms/[PLATFORM]

- Relocated [agent-name] to platform-specific directory
- Updated references in documentation
- Maintains backward compatibility via recursive discovery"
```

#### In Platform Repository (if separate)
```bash
cd platforms/[PLATFORM]
git add .claude/agents/[agent-name].md
git commit -m "feat: Add [agent-name] from main project

- Migrated as part of platform-specific organization
- [Brief description of what the agent does]"
```

#### Update Submodule (if applicable)
```bash
# In main repository
git add platforms/[PLATFORM]
git commit -m "chore: Update [PLATFORM] submodule with migrated agent"
```

## Batch Migration

For migrating multiple agents at once:

```bash
#!/bin/bash
# batch-migrate.sh

PLATFORM=$1  # e.g., "SFDC" or "HS"
shift
AGENTS=("$@")  # List of agent names

for agent in "${AGENTS[@]}"; do
    echo "Migrating $agent to platforms/$PLATFORM..."

    # Copy agent
    cp .claude/agents/${agent}.md platforms/$PLATFORM/.claude/agents/

    # Remove original
    rm .claude/agents/${agent}.md

    echo "✅ Migrated $agent"
done

# Update documentation
echo "⚠️  Remember to update:"
echo "  - CLAUDE.md references"
echo "  - Agent discovery hook"
echo "  - Documentation files"
```

Usage:
```bash
bash batch-migrate.sh SFDC sfdc-conflict-resolver sfdc-state-discovery sfdc-merge-orchestrator
```

## Rollback Procedure

If migration causes issues:

### Quick Rollback
```bash
# Restore from git
git checkout HEAD -- .claude/agents/[agent-name].md

# Remove from new location
rm platforms/[PLATFORM]/.claude/agents/[agent-name].md

# Revert documentation changes
git checkout HEAD -- CLAUDE.md .claude/hooks/agent-discovery.sh
```

### Full Rollback
```bash
# Reset to previous commit
git reset --hard HEAD~1

# If platform is separate repo
cd platforms/[PLATFORM]
git reset --hard HEAD~1
```

## Common Issues and Solutions

### Issue: Agent Not Found After Migration
**Solution**: Check if platform directory is in `additionalDirectories` in `.claude/settings.json`

### Issue: Script References Broken
**Solution**: Scripts execute from project root, so paths usually don't need updating

### Issue: Workflow Fails to Find Agent
**Solution**: Workflows reference agents by name only, so they should still work. If not, check workflow YAML syntax.

### Issue: MCP Tools Not Available
**Solution**: Ensure `.mcp.json` is in the project root, not in platform subdirectory

### Issue: Duplicate Agent Names
**Solution**: Use `bash scripts/validate-agents.sh` to detect duplicates before migration

## Validation Checklist

After migration, verify:

- [ ] Agent appears in discovery hook output
- [ ] `validate-agents.sh` passes without errors
- [ ] Agent can be invoked via Task tool
- [ ] Workflows using the agent still function
- [ ] Documentation accurately reflects new location
- [ ] No duplicate agents exist
- [ ] Git commits are clean and descriptive

## Best Practices

1. **Always test before removing** - Verify the agent works from new location
2. **Update documentation immediately** - Don't leave docs out of sync
3. **Commit atomically** - One commit for the migration, not mixed with other changes
4. **Keep commit messages clear** - Explain what was moved and why
5. **Check submodules** - If platform is a submodule, update the reference
6. **Verify CI/CD** - Ensure automated tests still pass

## Examples

### Example 1: Moving SFDC Agents
```bash
# The migration we just completed
cp .claude/agents/sfdc-conflict-resolver.md platforms/SFDC/.claude/agents/
cp .claude/agents/sfdc-state-discovery.md platforms/SFDC/.claude/agents/
cp .claude/agents/sfdc-dependency-analyzer.md platforms/SFDC/.claude/agents/
cp .claude/agents/sfdc-merge-orchestrator.md platforms/SFDC/.claude/agents/

# Update docs and verify
bash scripts/validate-agents.sh

# Remove originals
rm .claude/agents/sfdc-*.md

# Commit
git add -A
git commit -m "refactor: Move SFDC-specific agents to platforms/SFDC"
```

### Example 2: Moving a Single HubSpot Agent
```bash
# Move hubspot-custom-objects agent
cp .claude/agents/hubspot-custom-objects.md platforms/HS/.claude/agents/

# Test it works
node scripts/test-agent-routing.js hubspot-custom-objects

# Update references
vim CLAUDE.md  # Add location note

# Remove original and commit
rm .claude/agents/hubspot-custom-objects.md
git add -A
git commit -m "refactor: Move hubspot-custom-objects to platform directory"
```

## Migration History

Track migrations for reference:

| Date | Agent | From | To | Reason |
|------|-------|------|-----|--------|
| 2025-09-13 | sfdc-conflict-resolver | .claude/agents/ | platforms/SFDC/.claude/agents/ | Platform-specific organization |
| 2025-09-13 | sfdc-state-discovery | .claude/agents/ | platforms/SFDC/.claude/agents/ | Platform-specific organization |
| 2025-09-13 | sfdc-dependency-analyzer | .claude/agents/ | platforms/SFDC/.claude/agents/ | Platform-specific organization |
| 2025-09-13 | sfdc-merge-orchestrator | .claude/agents/ | platforms/SFDC/.claude/agents/ | Platform-specific organization |

---
Last Updated: 2025-09-13
Purpose: Standardize agent migration process for the RevPal system