# Asana Integration Analysis

**Date**: 2026-02-06
**Purpose**: Comprehensive analysis of Asana integration architecture, patterns, and navigation best practices
**Version**: 1.0.0

---

## Executive Summary

The OpsPal plugin ecosystem integrates with Asana via the **@roychri/mcp-server-asana** MCP server, providing task management and workflow tracking across 100+ specialist agents. The integration includes robust navigation patterns, known API gotchas, safety utilities, and standardized update templates.

**Key Components**:
- MCP Server: `@roychri/mcp-server-asana` (stdio-based)
- Custom Utilities: 6 JavaScript utilities for advanced operations
- Navigation Guide: Hierarchical mental model with optimized algorithms
- Safety Net: AsanaProjectFilter for cross-project leakage prevention
- Standards: Unified update templates and quality gates

---

## Architecture Overview

### MCP Server Configuration

**Location**: `.mcp.json` (line 174-251)

```json
{
  "asana": {
    "command": "npx",
    "args": ["-y", "@roychri/mcp-server-asana"],
    "env": {
      "ASANA_ACCESS_TOKEN": "${ASANA_ACCESS_TOKEN}",
      "DEFAULT_WORKSPACE_ID": "${ASANA_WORKSPACE_ID}",
      "READ_ONLY_MODE": "false"
    },
    "capabilities": [
      "asana_list_workspaces",
      "asana_search_projects",
      "asana_get_project",
      "asana_create_task",
      "asana_update_task",
      "asana_get_task",
      "asana_list_tasks"
    ]
  }
}
```

**Critical Environment Variables**:
- `ASANA_ACCESS_TOKEN` - Personal access token (workspace:write scope required)
- `ASANA_WORKSPACE_ID` - Default workspace GID
- `READ_ONLY_MODE` - Set to `false` to enable write operations

### Available MCP Tools

From tool contracts (`config/tool-contracts/mcp-tools.json`):

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `mcp__asana__asana_list_workspaces` | List workspaces | `opt_fields` |
| `mcp__asana__asana_search_projects` | Find projects by name pattern | `workspace`, `name_pattern`, `archived`, `opt_fields` |
| `mcp__asana__asana_get_project` | Get project details | `project_id`, `opt_fields` |
| `mcp__asana__asana_search_tasks` | Search tasks with filters | `workspace`, `text`, `projects_any`, `sections_any`, `completed`, `assignee_any`, `opt_fields` |
| `mcp__asana__asana_get_task` | Get task details | `task_id`, `opt_fields` |
| `mcp__asana__asana_create_task` | Create task | `project_id`, `name`, `notes`, `assignee`, `due_on`, `custom_fields` |
| `mcp__asana__asana_update_task` | Update task | `task_id`, `name`, `notes`, `completed`, `assignee`, `due_on`, `custom_fields` |
| `mcp__asana__asana_create_subtask` | Create subtask | `parent_task_id`, `name`, `notes`, `assignee`, `due_on` |
| `mcp__asana__asana_get_task_stories` | Get task comments | `task_id`, `opt_fields` |
| `mcp__asana__asana_create_task_story` | Add comment | `task_id`, `text` |
| `mcp__asana__asana_get_project_sections` | Get project sections | `project_id`, `opt_fields` |
| `mcp__asana__asana_get_multiple_tasks_by_gid` | Batch task fetch (max 25) | `task_ids`, `opt_fields` |

### Custom Utilities (Beyond MCP)

The integration includes 6 custom utilities for operations not supported by the base MCP server:

| Utility | Path | Purpose |
|---------|------|---------|
| **AsanaUserManager** | `scripts/lib/asana-user-manager.js` | User mapping, stakeholder assignment |
| **AsanaFollowerManager** | `scripts/lib/asana-follower-manager.js` | Add/remove followers, batch operations |
| **AsanaProjectCreator** | `scripts/lib/asana-project-creator.js` | Project creation, workspace detection |
| **AsanaCommentManager** | `scripts/lib/asana-comment-manager.js` | Template-based comments, bulk operations |
| **AsanaProjectFilter** | `scripts/lib/asana-project-filter.js` | Post-filter for cross-project leakage |
| **AsanaTaskReader** | `scripts/lib/asana-task-reader.js` | Structured task parsing, dependency extraction |

---

## Navigation Mental Model

### Hierarchy

```
Workspace → Team → Project → Section → Task → Subtask
```

**Core Principle**: Always navigate top-down. Never skip levels or guess IDs.

### Critical Rules

1. **IDs are King** - Names are ambiguous. Always resolve names to `gid` before modifications.
2. **Search-First** - Use `search_*` tools instead of listing everything and filtering.
3. **Stateless** - No persistent session. Re-acquire context or store `gid`s.
4. **Scope Queries** - Always add `projects_any` when searching tasks to avoid cross-project leakage.

---

## Known API Gotchas

### GOTCHA-001: `sections_any` is Workspace-Scoped

**Severity**: HIGH
**Discovered**: 2026-02-05 (Aspire org assessment)
**Impact**: Search returns tasks from ALL projects in workspace, not just target project

**Problem**:
```javascript
// WRONG - Returns tasks from ALL projects with matching section GIDs
mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: "section1,section2"
});
```

**Solution**:
```javascript
// CORRECT - Always combine sections_any with projects_any
mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: "section1,section2",
  projects_any: projectGid  // <-- REQUIRED
});
```

**Safety Net**: Use `AsanaProjectFilter` for post-filtering:

```javascript
const AsanaProjectFilter = require('./scripts/lib/asana-project-filter');
const filter = new AsanaProjectFilter();

const { filtered, excluded, stats } = await filter.filterByProject(rawResults, projectGid);

if (excluded.length > 0) {
  console.warn(`Excluded ${excluded.length} tasks from other projects`);
}
```

**Tool Contract Rule**: A WARNING rule (`sections_any_requires_project_filter`) fires when `sections_any` is used without `projects_any`.

### GOTCHA-002: Missing `opt_fields` Causes Timeouts

**Severity**: MEDIUM
**Impact**: Large payloads, slow responses, token waste

**Problem**: Omitting `opt_fields` returns full default representation (deeply nested custom fields, memberships, full user objects).

**Solution**: Always specify `opt_fields` on EVERY call.

**Standard `opt_fields` Values**:

| Operation | Recommended `opt_fields` |
|-----------|--------------------------|
| List/Search | `name,gid,assignee.name,due_on,completed` |
| Task Details | `name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name` |
| Sections | `name,gid` |
| Projects | `name,gid,team.name,archived,permalink_url` |

### GOTCHA-003: Board-View Projects Require Section GID

**Severity**: MEDIUM
**Impact**: Tasks land in wrong column

**Problem**: Creating a task in a board-view project without specifying section places it in "Untitled section" or first column.

**Solution**: Always discover sections first, then create in target section:

```javascript
// 1. Discover sections
const sections = await asana_get_project_sections({
  project_id: projectGid,
  opt_fields: "name,gid"
});

// 2. Identify target section
const targetSection = sections.find(s =>
  s.name.toLowerCase().includes('to do') ||
  s.name.toLowerCase().includes('backlog')
);

// 3. Create task in correct section
const task = await asana_create_task({
  project_id: projectGid,
  name: "New task",
  // Section placement handled by MCP implementation
});
```

---

## Navigation Algorithms

### Algorithm 1: Finding a Project

**Goal**: Resolve project name to GID

**Steps**:
1. Search by name pattern
2. Validate result (check `archived` status)
3. Store GID for subsequent calls

**Code**:
```javascript
const results = await mcp__asana__asana_search_projects({
  workspace: workspaceGid,
  name_pattern: "Mobile App",
  opt_fields: "name,gid,team.name,archived,permalink_url"
});

// Validate: Single result, not archived
if (results.length === 1 && !results[0].archived) {
  const projectGid = results[0].gid;
  // Use projectGid for subsequent calls
}
```

**Common Mistakes**:
- Searching with overly specific names
- Not checking `archived` status
- Calling `search_projects` repeatedly without storing GID

### Algorithm 2: Finding a Specific Task

**Goal**: Locate task by keywords within a project

**Steps**:
1. Scoped search (include project GID)
2. Inspect results (match on name/assignee)
3. Get full details only for confirmed match

**Code**:
```javascript
// 1. Scoped search
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  text: "login failure",
  projects_any: projectGid,  // <-- Prevent cross-project leakage
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on,completed"
});

// 2. Inspect results, select match

// 3. Get full details
const task = await mcp__asana__asana_get_task({
  task_id: selectedTaskGid,
  opt_fields: "name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name,dependencies,dependents"
});
```

**Narrowing Strategies**:

| Filter | Parameter | Example |
|--------|-----------|---------|
| By assignee | `assignee_any` | `"me"` or user GID |
| By completion | `completed` | `false` for open tasks |
| By due date | `due_on_before` / `due_on_after` | `"2026-03-01"` |
| By section | `sections_any` + `projects_any` | Always combine |
| By tag | `tags_any` | Tag GID |

### Algorithm 3: Exploring a Board/Project

**Goal**: Find tasks in specific columns/phases

**Steps**:
1. Get sections (columns)
2. Identify target section by name
3. Fetch tasks in section (scoped search)

**Code**:
```javascript
// 1. Get sections
const sections = await mcp__asana__asana_get_project_sections({
  project_id: projectGid,
  opt_fields: "name,gid"
});

// 2. Identify target
const targetSection = sections.find(s => s.name.includes("In Progress"));

// 3. Fetch tasks (CRITICAL: include projects_any)
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: targetSection.gid,
  projects_any: projectGid,  // <-- REQUIRED (see GOTCHA-001)
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on,completed"
});
```

---

## Standard Update Patterns

### Update Templates

**Location**: `plugins/opspal-core/templates/asana-updates/`

| Template | Use Case | Target Length | When to Use |
|----------|----------|---------------|-------------|
| `progress-update.md` | Intermediate checkpoints | 50-75 words | Every 2-4 hours on active work |
| `blocker-update.md` | Report blockers | 40-60 words | Immediately when blocked |
| `completion-update.md` | Task completion | 60-100 words | When marking task complete |
| `milestone-update.md` | Phase completion | 100-150 words | Major phase completions |

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

**Example**:
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

---

## Integration Standards

### Reading Asana Tasks Pattern

Before starting any Asana-tracked work:

1. **Parse Structured Fields** - Status, priority, due date, custom fields
2. **Read Description** - Extract requirements, success criteria, constraints
3. **Get Project Context** - Understand objectives, review related tasks
4. **Check Dependencies** - Identify blockers, verify resolved
5. **Review Comments** - Get recent decisions, note open questions

**Implementation**:
```javascript
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
  const comments = await mcp_asana_get_task_stories(taskId, { limit: 10 });

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

### Writing Updates Back

**For Comments** (narrative updates):
- Use templates from `templates/asana-updates/`
- Follow formatting strictly
- Tag people with @mentions when action needed
- Include links to detailed reports/docs

**For Custom Fields** (at-a-glance):
```javascript
await mcp_asana_update_task(taskId, {
  custom_fields: {
    progress_percentage: 75,
    status: 'On Track',
    latest_update: 'Analysis 75% complete',
    actual_hours: calculateActualHours(startTime)
  }
});
```

**For Task Status**:
- Mark `in_progress` when starting
- Mark `completed` when fully done
- Add `blocked` tag if stuck
- Update `assignee` appropriately

---

## Error Recovery Patterns

| Scenario | Recovery Action |
|----------|----------------|
| 0 search results | Broaden terms, remove qualifiers, try partial name, ask user |
| Multiple matches | List options with names + team/project context, ask user to disambiguate |
| Stale GID (404) | Fall back to text search for the task/project name |
| Rate limit (429) | Wait `retry-after` header value (or 5s default), retry with exponential backoff |
| Cross-project leakage | Use `AsanaProjectFilter` to post-filter results |
| Timeout | Reduce `opt_fields` to minimal set, batch operations |

---

## Anti-Patterns

### 1. Fetch-All-and-Filter
**Wrong**: Get all tasks in a project, then filter in code.
**Right**: Use `search_tasks` with filters (`text`, `assignee_any`, `sections_any`, `completed`).

### 2. Modifying Without GID Resolution
**Wrong**: Assume a task ID from a previous session is still valid.
**Right**: Always search/verify the task exists before updating. Handle 404 gracefully.

### 3. Ignoring Sections on Board-View Projects
**Wrong**: Create a task in a board project without specifying a section.
**Right**: Discover sections first, then create the task in the correct section.

### 4. Missing `opt_fields`
**Wrong**: Call `get_task` or `search_tasks` without `opt_fields`.
**Right**: Always specify `opt_fields` to reduce token usage and prevent timeouts.

### 5. Using `sections_any` Without `projects_any`
**Wrong**: `search_tasks(sections_any="<section_gid>")` — returns tasks from all projects.
**Right**: `search_tasks(sections_any="<section_gid>", projects_any="<project_gid>")` — scoped correctly.

---

## Quality Checklist

Before posting ANY Asana update, verify:

- [ ] **Follows template format** (progress/blocker/completion/milestone)
- [ ] **Under word limit** (see table in Standard Update Patterns)
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

**Example Agent Integration**:
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

## Available Commands

| Command | Purpose |
|---------|---------|
| `/asana-link` | Link Asana project to current directory |
| `/asana-update` | Post work summary to linked Asana project |
| `/asana-read` | Read task details by ID |
| `/asana-checkpoint` | Save checkpoint to Asana task |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `.mcp.json` | MCP server configuration |
| `config/asana-user-mapping.json` | User GID mapping for auto-assignment |
| `templates/asana-updates/*.md` | Update templates |
| `docs/ASANA_API_GOTCHAS.md` | Known API behavioral quirks |
| `docs/ASANA_AGENT_PLAYBOOK.md` | Comprehensive agent integration guide |
| `plugins/shared-docs/asana-integration-standards.md` | Cross-plugin standards |

---

## Key Documentation References

- **Main Playbook**: `plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`
- **Navigation Guide**: `docs/ASANA_NAVIGATION_GUIDE.md`
- **API Gotchas**: `plugins/opspal-core/docs/ASANA_API_GOTCHAS.md`
- **Integration Standards**: `plugins/shared-docs/asana-integration-standards.md`
- **Navigation Patterns**: `plugins/opspal-core/skills/asana-integration-playbook/navigation-patterns.md`
- **API Patterns**: `plugins/opspal-core/skills/asana-integration-playbook/api-patterns.md`
- **Error Scenarios**: `plugins/opspal-core/skills/asana-integration-playbook/error-scenarios.md`

---

## System Prompt Snippet

Agents may include this in their system prompt for inline navigation guidance:

```
<asana_capability>
  When navigating Asana:
  1. PREFER 'search' tools over 'list' tools for finding specific items.
  2. ALWAYS resolve Project/Task names to GIDs before attempting modifications.
  3. USE 'opt_fields' to request only necessary data.
  4. IF a project has Board view, identify the Section GID for correct column placement.
  5. ALWAYS combine sections_any with projects_any to prevent cross-project leakage.
</asana_capability>
```

---

## Testing & Verification

**End-to-End Test**:
```bash
node plugins/opspal-core/scripts/test-asana-integration-e2e.js
```

**Compliance Check**:
```bash
node plugins/opspal-core/scripts/lib/asana-integration-compliance-checker.js
```

**Project Filter Test**:
```bash
node plugins/opspal-core/scripts/lib/asana-project-filter.js \
  --project <gid> --tasks <gid1,gid2,...>
```

---

## Troubleshooting

### Issue: "Unknown tool: mcp__asana__*"
**Cause**: MCP server not loaded
**Fix**: Check `.mcp.json` configuration, verify `ASANA_ACCESS_TOKEN` set, restart Claude Code

### Issue: Tasks from wrong project appearing in results
**Cause**: Using `sections_any` without `projects_any` (GOTCHA-001)
**Fix**: Always combine `sections_any` with `projects_any`, or use `AsanaProjectFilter`

### Issue: API timeouts
**Cause**: Missing `opt_fields` (GOTCHA-002)
**Fix**: Always specify `opt_fields` on every call

### Issue: Tasks landing in wrong board column
**Cause**: Missing section specification (GOTCHA-003)
**Fix**: Discover sections first, create task in target section

### Issue: Rate limit (429)
**Cause**: Exceeded Asana API limits
**Fix**: Wait for `retry-after` header value, implement exponential backoff

---

## Version History

- **1.0.0** (2026-02-06): Initial comprehensive analysis
  - MCP server architecture
  - Navigation algorithms
  - Known gotchas (GOTCHA-001, GOTCHA-002, GOTCHA-003)
  - Standard patterns and anti-patterns
  - Custom utilities documentation

---

**Maintainer**: OpsPal Core Team
**Last Updated**: 2026-02-06
