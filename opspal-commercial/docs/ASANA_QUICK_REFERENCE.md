# Asana Integration Quick Reference

**Print-friendly single-page cheat sheet for developers**

---

## Environment Setup

```bash
export ASANA_ACCESS_TOKEN="your-token-here"
export ASANA_WORKSPACE_ID="REDACTED_WORKSPACE_ID"
```

Get token: https://app.asana.com/0/my-apps → Create Personal Access Token

---

## Core Navigation Rules

| Rule | Explanation |
|------|-------------|
| **IDs are King** | Always resolve names to `gid` before modifications |
| **Search-First** | Use `search_*` tools, not list-and-filter |
| **Stateless** | Re-acquire context or store `gid`s (no persistent session) |
| **Scope Queries** | Always add `projects_any` when searching tasks |
| **opt_fields** | Specify on EVERY call to prevent timeouts |

---

## Hierarchy

```
Workspace → Team → Project → Section → Task → Subtask
```

Always navigate top-down. Never skip levels.

---

## Standard opt_fields

| Operation | opt_fields |
|-----------|------------|
| **List/Search** | `name,gid,assignee.name,due_on,completed` |
| **Task Details** | `name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name` |
| **Sections** | `name,gid` |
| **Projects** | `name,gid,team.name,archived,permalink_url` |

---

## Common Patterns

### Find a Project

```javascript
const projects = await mcp__asana__asana_search_projects({
  workspace: workspaceGid,
  name_pattern: "Mobile App",
  opt_fields: "name,gid,team.name,archived"
});

const projectGid = projects[0].gid;  // Store for subsequent calls
```

### Find a Task in Project

```javascript
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  text: "login failure",
  projects_any: projectGid,  // ← REQUIRED (prevents cross-project leakage)
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on"
});
```

### Get Task Details

```javascript
const task = await mcp__asana__asana_get_task({
  task_id: taskGid,
  opt_fields: "name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name"
});
```

### Get Project Sections

```javascript
const sections = await mcp__asana__asana_get_project_sections({
  project_id: projectGid,
  opt_fields: "name,gid"
});
```

### Find Tasks in Section

```javascript
const tasks = await mcp__asana__asana_search_tasks({
  workspace: workspaceGid,
  sections_any: sectionGid,
  projects_any: projectGid,  // ← CRITICAL (see GOTCHA-001)
  opt_fields: "name,gid,assignee.name,due_on,completed"
});
```

### Create Task

```javascript
const task = await mcp__asana__asana_create_task({
  project_id: projectGid,
  name: "Fix login bug",
  notes: "Description here",
  assignee: "me",
  due_on: "2026-02-15"
});
```

### Update Task

```javascript
await mcp__asana__asana_update_task({
  task_id: taskGid,
  completed: true,
  custom_fields: {
    progress_percentage: 100,
    status: 'Completed'
  }
});
```

### Add Comment

```javascript
await mcp__asana__asana_create_task_story({
  task_id: taskGid,
  text: "**Progress Update** - Task Name\n\n**Completed:**\n- Item 1\n- Item 2"
});
```

---

## Known Gotchas

### GOTCHA-001: sections_any is Workspace-Scoped

**Problem**: `sections_any` without `projects_any` returns tasks from ALL projects.

**Fix**: Always combine both parameters:

```javascript
// ❌ WRONG - Returns tasks from all projects
search_tasks({ sections_any: sectionGid })

// ✅ CORRECT - Scoped to target project
search_tasks({ sections_any: sectionGid, projects_any: projectGid })
```

### GOTCHA-002: Missing opt_fields Causes Timeouts

**Problem**: Omitting `opt_fields` returns deeply nested objects.

**Fix**: Always specify `opt_fields` on every call.

### GOTCHA-003: Board-View Tasks Need Section

**Problem**: Tasks created without section land in "Untitled section".

**Fix**: Discover sections first, create in target section.

---

## Update Templates

| Template | Word Limit | When to Use |
|----------|------------|-------------|
| **progress-update** | 100 | Every 2-4 hours on active work |
| **blocker-update** | 80 | Immediately when blocked |
| **completion-update** | 150 | Task completion |
| **milestone-update** | 200 | Phase completion |

### Progress Update Template

```markdown
**Progress Update** - [Task Name] - [Date]

**Completed:**
- [Accomplishment with metric]

**In Progress:**
- [Current work]

**Next:**
- [Next steps]

**Status:** [On Track / At Risk / Blocked]
```

### Blocker Update Template

```markdown
**🚨 BLOCKED** - [Task Name]

**Issue:** [One-sentence problem]

**Impact:** [What's blocked]

**Needs:** [Action from whom]

**Workaround:** [Alternative or "None"]

**Timeline:** [When resolution needed]
```

---

## Error Recovery

| Error | Recovery Action |
|-------|----------------|
| **404 Not Found** | Fall back to text search (GID might be stale) |
| **429 Rate Limit** | Wait `retry-after` header (or 5s), retry with backoff |
| **0 Results** | Broaden search terms, remove qualifiers |
| **Multiple Matches** | List options, ask user to disambiguate |
| **Timeout** | Reduce `opt_fields`, batch operations |

---

## Custom Utilities (Beyond MCP)

| Utility | Path | Use Case |
|---------|------|----------|
| **AsanaProjectFilter** | `scripts/lib/asana-project-filter.js` | Post-filter cross-project leakage |
| **AsanaUserManager** | `scripts/lib/asana-user-manager.js` | User mapping, stakeholder assignment |
| **AsanaFollowerManager** | `scripts/lib/asana-follower-manager.js` | Batch follower operations |
| **AsanaCommentManager** | `scripts/lib/asana-comment-manager.js` | Template-based comments |
| **AsanaProjectCreator** | `scripts/lib/asana-project-creator.js` | Project creation, workspace detection |
| **AsanaTaskReader** | `scripts/lib/asana-task-reader.js` | Structured task parsing |

### Using AsanaProjectFilter

```javascript
const AsanaProjectFilter = require('./scripts/lib/asana-project-filter');
const filter = new AsanaProjectFilter();

// Post-filter results
const { filtered, excluded, stats } = await filter.filterByProject(tasks, projectGid);

// Or use safe wrapper (combines sections_any + projects_any + post-filter)
const tasks = await filter.searchTasksInProjectSections(
  projectGid,
  sectionGids,
  { text: 'optional', completed: false }
);
```

---

## Commands

| Command | Purpose |
|---------|---------|
| `/asana-link` | Link project to directory |
| `/asana-update` | Post work summary |
| `/asana-read <task-id>` | Read task details |
| `/asana-checkpoint` | Save checkpoint |

---

## Quality Checklist

Before posting updates:

- [ ] Follows template format
- [ ] Under word limit
- [ ] Includes metrics (numbers, percentages)
- [ ] Clear next steps
- [ ] Tagged people if action needed
- [ ] Formatted properly (bullets, bold, markdown)

---

## Search Narrowing Options

| Filter | Parameter | Example |
|--------|-----------|---------|
| **By assignee** | `assignee_any` | `"me"` or user GID |
| **By completion** | `completed` | `false` |
| **By due date** | `due_on_before` / `due_on_after` | `"2026-03-01"` |
| **By section** | `sections_any` + `projects_any` | Combine both |
| **By tag** | `tags_any` | Tag GID |

---

## Anti-Patterns

| ❌ Wrong | ✅ Right |
|---------|---------|
| Get all tasks, filter in code | Use `search_tasks` with filters |
| Assume old GID is valid | Search/verify before updating |
| Create task without section | Discover sections first |
| Omit `opt_fields` | Always specify `opt_fields` |
| Use `sections_any` alone | Combine with `projects_any` |

---

## Key Documentation

- **Full Analysis**: `docs/ASANA_INTEGRATION_ANALYSIS.md`
- **Architecture Diagrams**: `docs/ASANA_ARCHITECTURE_DIAGRAM.md`
- **API Gotchas**: `plugins/opspal-core/docs/ASANA_API_GOTCHAS.md`
- **Navigation Guide**: `docs/ASANA_NAVIGATION_GUIDE.md`
- **Integration Standards**: `plugins/shared-docs/asana-integration-standards.md`

---

## Troubleshooting

**Issue**: "Unknown tool: mcp__asana__*"
- Check `.mcp.json` configuration
- Verify `ASANA_ACCESS_TOKEN` is set
- Restart Claude Code

**Issue**: Tasks from wrong project
- Add `projects_any` parameter
- Use `AsanaProjectFilter` for post-filtering

**Issue**: API timeouts
- Add `opt_fields` to all calls
- Reduce field set to minimum needed

---

**Version**: 1.0.0 | **Updated**: 2026-02-06
