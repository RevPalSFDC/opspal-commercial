# Asana Integration Standards
# Version: 1.1.0
# Last Updated: 2026-02-06
#
# This file defines standardized patterns for Asana task management integration
# across all agents that interact with Asana.
#
# **Usage**: @import ../../shared-docs/asana-integration-standards.md
#
# **Cacheable**: Yes - This content is stable and reused across 10+ agents

---

## Overview

All agents that interact with Asana for project management MUST follow these standardized patterns for reading tasks, tracking progress, and writing updates. This ensures consistent, high-quality communication across 100+ agents.

**Primary Documentation**: `.claude-plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md` (comprehensive guide)

---

## Core Principles

1. **Context-Aware** - Always pull full task and project context before acting
2. **Succinct** - Keep updates brief (< 100 words) with maximum signal
3. **Actionable** - Every update should drive the project forward or flag blockers
4. **Data-Driven** - Include concrete metrics and outcomes when possible
5. **Structured** - Use consistent formatting for easy scanning

---

## Navigation Best Practices

Agents interacting with Asana MUST follow these navigation patterns to avoid common failures (wrong project, excessive data fetching, stale IDs).

### Hierarchy Mental Model

```
Workspace → Team → Project → Section → Task → Subtask
```

Every navigation starts from the workspace and narrows down. Never skip levels or guess IDs.

### Core Navigation Rules

1. **IDs are King** - Names are ambiguous. Always resolve a name to a `gid` before modifications.
2. **Search-First** - Use `search_projects` / `search_tasks` instead of listing everything and filtering.
3. **Stateless** - You have no persistent session. Re-acquire context or store `gid`s between calls.
4. **Scope Queries** - Always add `projects_any` when searching tasks to avoid cross-project leakage (see GOTCHA-001).

### `opt_fields` Standards (MANDATORY)

Omitting `opt_fields` causes oversized responses, timeouts, and wasted tokens.

| Operation | Recommended `opt_fields` |
|-----------|--------------------------|
| List / Search | `name,gid,assignee.name,due_on,completed` |
| Task Details | `name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name` |
| Project Info | `name,gid,team.name,archived,permalink_url` |
| Sections | `name,gid` |

### Navigation Algorithms (Condensed)

**Find a Project:**
1. `search_projects(workspace, name_pattern="Project Name")` → get list
2. Validate: check `archived` status, confirm correct team
3. Store the `project_gid` for all subsequent calls

**Find a Task:**
1. `search_tasks(workspace, text="task keywords", projects_any=project_gid)` → scoped search
2. Inspect results: match on `name` and `assignee`
3. `get_task(task_gid, opt_fields=...)` → full details only for the correct match

**Explore a Board/Project:**
1. `get_project_sections(project_gid)` → list columns
2. Identify target section by name (e.g., "In Progress", "To Do")
3. `search_tasks(workspace, sections_any=section_gid, projects_any=project_gid)` → tasks in that column

> **Anti-Pattern**: Never fetch all project tasks and filter client-side. This is slow, token-expensive, and may hit rate limits.

### Error Recovery Quick Reference

| Scenario | Recovery Action |
|----------|----------------|
| 0 search results | Broaden terms (remove qualifiers like "bug", "report"), try partial name, ask user |
| Multiple matches | List options with names + team/project context, ask user to disambiguate |
| Stale GID (404) | Fall back to text search for the task/project name |
| Rate limit (429) | Wait `retry-after` header value (or 5s default), then retry with exponential backoff |

### System Prompt Snippet

Agents may include this in their system prompt for inline navigation guidance:

```
<asana_capability>
  When navigating Asana:
  1. PREFER 'search' tools over 'list' tools for finding specific items.
  2. ALWAYS resolve Project/Task names to GIDs before attempting modifications.
  3. USE 'opt_fields' to request only necessary data.
  4. IF a project has Board view, identify the Section GID for correct column placement.
</asana_capability>
```

---

## Update Templates (MANDATORY)

All agents MUST use these templates when posting Asana updates.

**Location**: `.claude-plugins/opspal-core/templates/asana-updates/`

| Template | Use Case | Target Length | When to Use |
|----------|----------|---------------|-------------|
| `progress-update.md` | Intermediate checkpoints | 50-75 words | Every 2-4 hours on active work |
| `blocker-update.md` | Report blockers | 40-60 words | Immediately when blocked |
| `completion-update.md` | Task completion | 60-100 words | When marking task complete |
| `milestone-update.md` | Phase completion | 100-150 words | Major phase completions |

---

## Standard Update Formats

### Progress Update Pattern (< 100 words)

```markdown
**Progress Update** - [Task Name] - [Date]

**Completed:**
- [Specific accomplishment with metric]
- [Another accomplishment]

**In Progress:**
- [Current work with progress if quantifiable]

**Next:**
- [Next 1-2 steps]

**Status:** [On Track / At Risk / Blocked]
```

**Example:**
```markdown
**Progress Update** - Salesforce Field Cleanup - 2025-10-27

**Completed:**
- ✅ Account object analyzed (350 fields)
- ✅ Found 52 unused fields (15%)

**In Progress:**
- Analyzing Opportunity object (2 hours remaining)

**Next:**
- Complete analysis
- Generate deprecation plan

**Status:** On Track
```

### Blocker Update Pattern (< 80 words)

```markdown
**🚨 BLOCKED** - [Task Name]

**Issue:** [One-sentence problem description]

**Impact:** [What's blocked + duration]

**Needs:** [Specific action from whom]

**Workaround:** [Alternative or "None"]

**Timeline:** [When resolution needed]
```

**Example:**
```markdown
**🚨 BLOCKED** - Workflow Deployment

**Issue:** Portal API rate limit exceeded (150 req/10sec)

**Impact:** Paused deployment at workflow 3 of 8

**Needs:** Wait 60 seconds OR @admin request limit increase

**Workaround:** Deploy workflows in smaller batches (2 per batch)

**Timeline:** Can resume in 60 sec with current limit
```

### Completion Update Pattern (< 150 words)

```markdown
**✅ COMPLETED** - [Task Name]

**Deliverables:**
- [Specific deliverable 1]
- [Specific deliverable 2]

**Results:**
- [Key metric 1]
- [Key metric 2]

**Handoff:** [Who needs to act next]

**Notes:** [Any important context]
```

**Example:**
```markdown
**✅ COMPLETED** - Salesforce Data Migration

**Deliverables:**
- 10,200 contacts imported
- 850 companies created
- 3,400 deals linked
- Migration report: [link]

**Results:**
- Success rate: 99.8% (20 records flagged)
- Processing time: 45 min (vs 60 min estimated)
- 0 data loss
- All required properties populated

**Handoff:** @marketing-ops for UAT

**Notes:** 20 flagged records need manual review (see report tab 3)
```

---

## Reading Asana Tasks Pattern

Before starting any Asana-tracked work, agents must:

### 1. Parse Structured Fields
- Status, priority, due date
- Custom fields (project-specific)
- Tags and assignees

### 2. Read Description
- Extract requirements and instructions
- Identify success criteria
- Note any special constraints

### 3. Get Project Context
- Understand project objectives
- Review related tasks
- Check project-level custom fields

### 4. Check Dependencies
- Identify blocking tasks
- Note tasks that depend on this one
- Verify all blockers are resolved

### 5. Review Comments
- Get recent decisions and context
- Note any open questions
- Identify stakeholder concerns

**Implementation Example:**
```javascript
// Standard task reading pattern
async function parseAsanaTask(taskId) {
  // 1. Get task with all fields
  const task = await mcp_asana_get_task(taskId, {
    opt_fields: 'name,notes,projects,assignee,due_on,completed,' +
                'custom_fields,tags,dependencies,dependents,' +
                'memberships'
  });

  // 2. Get project context
  const projectId = task.projects[0].gid;
  const project = await mcp_asana_get_project(projectId);

  // 3. Get recent comments
  const comments = await mcp_asana_list_comments(taskId, { limit: 10 });

  // 4. Extract structured data
  return {
    task,
    project,
    comments,
    requirements: extractRequirements(task.notes),
    successCriteria: extractSuccessCriteria(task.notes),
    blockers: task.dependencies || [],
    dependents: task.dependents || []
  };
}
```

---

## Writing Updates Back

### For Comments (Narrative Updates)
- Use for progress, blockers, completion
- Follow template formatting strictly
- Tag people with @mentions when action needed
- Include links to detailed reports/docs

### For Custom Fields (At-a-Glance)
Common custom fields to update:
- `progress_percentage` - 0-100 completion
- `status` - On Track / At Risk / Blocked
- `latest_update` - One-line summary (< 50 chars)
- `actual_hours` - Time spent
- Platform-specific fields as defined

### For Task Status
- Mark `in_progress` when starting
- Mark `completed` when fully done
- Add `blocked` tag if stuck
- Update `assignee` appropriately

**Implementation Example:**
```javascript
// Update custom fields
await mcp_asana_update_task(taskId, {
  custom_fields: {
    progress_percentage: 75,
    status: 'On Track',
    latest_update: 'Analysis 75% complete',
    actual_hours: calculateActualHours(startTime)
  }
});

// Post comment
await mcp_asana_add_comment(taskId, {
  text: formattedProgressUpdate  // From template
});
```

---

## Brevity Requirements (STRICT)

### Word Limits
- **Progress updates**: Max 100 words
- **Blocker updates**: Max 80 words
- **Completion updates**: Max 150 words
- **Milestone updates**: Max 200 words

### Self-Editing Checklist
Before posting ANY update:
- [ ] Under target word count?
- [ ] Includes key metrics or outcomes?
- [ ] Clear on next steps or blockers?
- [ ] No redundant information?
- [ ] Tagged right people if action needed?
- [ ] Formatted for easy scanning?

---

## Platform-Specific Patterns

### For Salesforce Operations

```markdown
**Progress Update** - Salesforce Field Cleanup

**Completed:**
- ✅ Account object analyzed (350 fields)
- ✅ Found 52 unused fields (15%)

**In Progress:**
- Analyzing Opportunity object (2 hours remaining)

**Next:**
- Complete analysis
- Generate deprecation plan

**Status:** On Track
```

### For HubSpot Operations

```markdown
**Progress Update** - HubSpot Property Audit

**Completed:**
- ✅ Analyzed 847 contact properties
- ✅ Identified 215 unused (25%)

**In Progress:**
- Company properties (200 of 450 done)

**Next:**
- Complete company analysis
- Generate cleanup recommendations

**Status:** On Track
```

### For Multi-Platform Operations

```markdown
**Progress Update** - Cross-Platform Data Sync

**Completed:**
- ✅ Salesforce: 1,000 contacts exported
- ✅ HubSpot: 850 companies mapped

**In Progress:**
- Syncing deal pipeline (500 of 1,200 done)

**Next:**
- Complete deal sync
- Verify bidirectional updates

**Status:** On Track - 70% complete
```

---

## Error Reporting Standards

### When Errors Occur

1. **Categorize Error Type:**
   - Permission errors → Blocker update, tag @admin
   - Rate limit → Progress update with wait time
   - Data validation → Completion update with flagged records
   - API failure → Blocker update, tag @ops-team

2. **Include Error Context:**
   - Error message
   - Record IDs affected
   - Timestamp
   - Retry attempts made

3. **Provide Clear Next Steps:**
   - Who needs to act
   - What action is required
   - Timeline for resolution

**Example Error Update:**
```markdown
**🚨 BLOCKED** - Salesforce Sync

**Issue:** 15 records failed validation (invalid Salesforce IDs)

**Impact:** 985 of 1,000 records synced (98.5% success)

**Needs:** @data-team review invalid IDs: [error log link]

**Workaround:** None - these records require manual correction

**Timeline:** Not blocking other work - can resolve async
```

---

## Quality Checklist

Before posting ANY Asana update, verify:

- [ ] **Follows template format** (progress/blocker/completion/milestone)
- [ ] **Under word limit** (see table above)
- [ ] **Includes metrics** (numbers, percentages, counts)
- [ ] **Clear next steps** (or states "None" if complete)
- [ ] **Tagged people** if action required (use @mentions)
- [ ] **Formatted properly** (bullets, bold, markdown)
- [ ] **No jargon** (or explained if technical audience)

---

## Agent Integration Requirements

All agents that create or update Asana tasks MUST:

1. **Reference this standard** in their agent description
2. **Use update templates** for all Asana comments
3. **Validate update length** before posting
4. **Include concrete metrics** in updates
5. **Follow the reading tasks pattern** before starting work

**Example Agent Integration:**
```yaml
---
name: example-agent
tools: mcp__asana__*, Read, Write
---

# Agent Description

[Agent description...]

## Asana Integration

This agent follows standardized Asana integration patterns:
- **Standards**: @import ../../shared-docs/asana-integration-standards.md
- **Update Templates**: Uses templates from opspal-core/templates/asana-updates/
- **Brevity Standard**: All updates < 100 words
- **Format**: Progress/Blockers/Next Steps pattern

[Rest of agent instructions...]
```

---

## Custom Field Enum Updates (GID Required)

When updating enum/dropdown custom fields via `asana_update_task`, you **MUST** use the enum option GID, NOT the display value.

### Discovery Protocol:
1. Get project custom fields:
   `asana_get_project(project_id, opt_fields="custom_fields,custom_fields.enum_options")`
2. Map display names to GIDs:
   - Field "Priority" -> gid "123456", options: "High" -> "789", "Medium" -> "790"
3. Use GIDs in update: `custom_fields: { "123456": "789" }`

### Common Mistakes:
- `{ "Priority": "High" }` - **WRONG** (field name instead of GID)
- `{ "123456": "High" }` - **WRONG** (display value instead of option GID)
- `{ "123456": "789" }` - **CORRECT** (field GID -> option GID)

**Always resolve display names to GIDs before updating.**

---

## Related Documentation

- **Main Playbook**: `.claude-plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md` - Complete integration guidelines
- **Update Templates**: `.claude-plugins/opspal-core/templates/asana-updates/*.md` - Template details and examples
- **Task Manager Agent**: `.claude-plugins/opspal-core/agents/asana-task-manager.md` - Reference implementation

---

**Version History:**
- **1.2.0** (2026-02-10): Added Custom Field Enum GID Resolution protocol
- **1.1.0** (2026-02-06): Added Navigation Best Practices section (hierarchy model, opt_fields standards, navigation algorithms, error recovery)
- **1.0.0** (2025-10-27): Initial extraction from multiple agents, standardized for cross-plugin use
