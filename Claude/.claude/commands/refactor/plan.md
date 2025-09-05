---
description: Create a zip of proposed agent rewrites (no writes to target); store under reports/patches.
allowed-tools: Read, Grep, Glob, Bash(mkdir:*), Bash(date:*), Bash(cat:*), Bash(realpath:*)
---

You are creating a refactoring patch bundle based on audit findings. This is a read-only operation that generates proposed fixes without modifying the target project.

## Process

### 1. Get Target Project
Ask for the target project path (e.g., `../ClaudeSFDC`, `../ClaudeHubSpot`).

### 2. Validate Target
- Use `realpath` to resolve the path
- Ensure it's a sibling directory (no traversal attacks)
- Verify `.claude/agents/` exists
- Check for recent audit report in `./reports/`

### 3. Read Latest Audit Report
Find the most recent audit report for the target project:
```bash
ls -t ./reports/[project]-agents-audit-*.md | head -1
```

### 4. Analyze Issues
For each agent with problematic scores (SRD/MB/OPT ≥2):
- Extract current configuration
- Identify specific issues from the report
- Note MCP server requirements from target's `.mcp.json`

### 5. Generate Minimal Rewrites

For each problematic agent, create a minimal rewrite:

```yaml
---
name: [agent-name]
description: [Crisp one-line purpose with clear triggers]
tools: [Minimal tool list matching target's MCP servers]
---

## Use cases
- [Specific use case 1]
- [Specific use case 2]

## Don'ts
- [What this agent won't do]

## Steps
1) [Action 1]
2) [Action 2]
3) [Action 3]
4) [Action 4]
5) [Action 5]

## Handoffs
- [Condition] → [other-agent]

## Success criteria
- [Measurable outcome]
```

Keep each rewrite:
- Under 30 lines total
- Single responsibility focus
- Minimal tool permissions
- Clear handoff rules

### 6. Create Patch Structure

Create temporary directory structure mirroring target:
```
/tmp/patch-[timestamp]/
  [project-name]/
    .claude/
      agents/
        agent1.md
        agent2.md
        ...
    REFACTOR_NOTES.md
```

### 7. Add Refactor Notes

Include `REFACTOR_NOTES.md` with:
```markdown
# Agent Refactoring Patch
Generated: [date]
Target: [project]
Based on: [audit report]

## Summary
- Agents refactored: [count]
- Lines reduced: [before] → [after]
- Tools minimized: [details]

## Issues Addressed
- [Issue 1]: [How fixed]
- [Issue 2]: [How fixed]

## Application Instructions
1. Review all proposed changes
2. Back up current agents: `cp -r .claude/agents .claude/agents.backup`
3. Apply patch: `cp -r [patch]/* ./`
4. Test with: `claude /agents`
5. Verify: `claude /audit/agents`

## Rollback
```bash
cp -r .claude/agents.backup/* .claude/agents/
```
```

### 8. Create Patch Bundle

Save as: `./reports/patches/[project]-refactor-[date].zip`

Include:
- All rewritten agent files
- REFACTOR_NOTES.md
- No modifications to target project

### 9. Output Summary

Display:
```
✅ Refactor patch created
📦 Location: ./reports/patches/[project]-refactor-[date].zip
📊 Agents refactored: [count]
📉 Total lines: [before] → [after] ([reduction]%)

To apply in target project:
1. cd [target-path]
2. unzip [patch-path]
3. Review changes with: diff -r .claude/agents [project]/.claude/agents
4. Apply selectively or all at once
```

## Constraints

- **NEVER** write to the target project directory
- **NEVER** execute the refactoring automatically
- **ONLY** create patch bundles in `./reports/patches/`
- Keep all rewrites self-contained
- Reference shared rules via `@CLAUDE.md` imports
- Maintain compatibility with target's MCP configuration

## Example Rewrite

From (problematic):
```yaml
---
name: sfdc-orchestrator
tools: Task, Read, Write, Edit, Bash, WebFetch, Grep, Glob
---
[300 lines of complex narrative...]
```

To (minimal):
```yaml
---
name: sfdc-orchestrator
description: Coordinates multi-step Salesforce operations. Use for complex deployments requiring multiple agents.
tools: Task, Read, Grep
---

## Use cases
- Multi-object metadata deployments
- Cross-org data migrations
- Complex permission updates

## Don'ts
- Don't handle single-object changes (use sfdc-metadata)
- Don't write APEX (use sfdc-apex)

## Steps
1) Analyze requirements and dependencies
2) Create execution plan with task order
3) Delegate to specialized agents
4) Monitor progress and handle errors
5) Generate summary report

## Handoffs
- Metadata changes → sfdc-metadata
- APEX development → sfdc-apex
- Data operations → sfdc-data

## Success criteria
- All delegated tasks complete successfully
- No manual intervention required
```