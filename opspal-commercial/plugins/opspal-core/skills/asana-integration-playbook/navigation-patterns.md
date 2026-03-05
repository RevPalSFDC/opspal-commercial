# Asana Navigation Patterns

Detailed navigation algorithms with full MCP tool call examples. Use these patterns to reliably find projects, tasks, and sections without excessive API calls or data fetching.

---

## Algorithm 1: Finding a Project

**Goal:** Resolve a project name to its GID for subsequent operations.

### Steps

1. **Search by name** using regex pattern matching:

```
mcp__asana__asana_search_projects({
  workspace: "<workspace_gid>",
  name_pattern: "Mobile App",
  opt_fields: "name,gid,team.name,archived,permalink_url"
})
```

2. **Validate the result:**
   - If 1 result: confirm it's not archived (unless user requested archived projects)
   - If multiple results: present options with team names for disambiguation
   - If 0 results: broaden the pattern (e.g., "Mobile" instead of "Mobile App Redesign")

3. **Store the GID** for all subsequent calls in this workflow.

### Common Mistakes

- Searching with overly specific names (include version numbers, dates)
- Not checking `archived` status before proceeding
- Calling `search_projects` repeatedly without storing the GID

---

## Algorithm 2: Finding a Specific Task

**Goal:** Locate a task by description or keywords within a known project.

### Steps

1. **Scoped search** — always include the project GID to avoid cross-project leakage:

```
mcp__asana__asana_search_tasks({
  workspace: "<workspace_gid>",
  text: "login failure",
  projects_any: "<project_gid>",
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on,completed"
})
```

2. **Inspect results:** Match on `name` and `assignee`. If multiple potential matches, list them for the user.

3. **Get full details** only for the confirmed task:

```
mcp__asana__asana_get_task({
  task_id: "<task_gid>",
  opt_fields: "name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name,dependencies,dependents"
})
```

### Narrowing Strategies

| Filter | Parameter | Example |
|--------|-----------|---------|
| By assignee | `assignee_any` | `"me"` or user GID |
| By completion | `completed` | `false` for open tasks |
| By due date | `due_on_before` / `due_on_after` | `"2026-03-01"` |
| By section | `sections_any` + `projects_any` | Always combine both |
| By tag | `tags_any` | Tag GID |

---

## Algorithm 3: Exploring a Board/Project

**Goal:** Understand the structure of a project and find tasks in specific columns/phases.

### Steps

1. **Get sections** (columns on a board, phases in a list):

```
mcp__asana__asana_get_project_sections({
  project_id: "<project_gid>",
  opt_fields: "name,gid"
})
```

2. **Identify target section** by name (e.g., "In Progress", "To Do", "Done").

3. **Fetch tasks in that section** using scoped search:

```
mcp__asana__asana_search_tasks({
  workspace: "<workspace_gid>",
  sections_any: "<section_gid>",
  projects_any: "<project_gid>",
  completed: false,
  opt_fields: "name,gid,assignee.name,due_on,completed"
})
```

> **Critical:** Always include `projects_any` alongside `sections_any`. Without it, Asana returns tasks from ALL projects in the workspace that match the section criteria (see GOTCHA-001).

### When to Use This Pattern

- User asks "What's in progress?" or "Show me the backlog"
- You need to create a task in a specific board column
- You want to move a task between columns
- You need a count of tasks by status/phase

---

## `opt_fields` Reference Table

Specify `opt_fields` on every call to reduce response size and prevent timeouts.

| Operation | Recommended `opt_fields` | Why |
|-----------|--------------------------|-----|
| Search/List projects | `name,gid,team.name,archived,permalink_url` | Identify + disambiguate |
| Search/List tasks | `name,gid,assignee.name,due_on,completed` | Quick scan without bloat |
| Get task details | `name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name,dependencies,dependents` | Full context for action |
| Get sections | `name,gid` | Minimal — just need names and IDs |
| Get project details | `name,gid,team.name,archived,permalink_url,custom_field_settings` | Project context + custom fields |
| Get task stories | `text,created_by.name,created_at,type` | Recent comments and activity |
| Get multiple tasks | `name,gid,assignee.name,due_on,completed,memberships.section.name` | Batch inspection |

---

## Anti-Patterns

### 1. Fetch-All-and-Filter
**Wrong:** Get all tasks in a project, then filter in code for the ones you need.
**Right:** Use `search_tasks` with filters (`text`, `assignee_any`, `sections_any`, `completed`).

### 2. Modifying Without GID Resolution
**Wrong:** Assume a task ID from a previous session is still valid.
**Right:** Always search/verify the task exists before updating. Handle 404 gracefully.

### 3. Ignoring Sections on Board-View Projects
**Wrong:** Create a task in a board project without specifying a section.
**Right:** Discover sections first, then create the task in the correct section. Tasks without a section end up in the default/uncategorized column.

### 4. Missing `opt_fields`
**Wrong:** Call `get_task` or `search_tasks` without `opt_fields`.
**Right:** Always specify `opt_fields`. Without it, responses can include deeply nested objects, custom field metadata, and other data that wastes tokens and risks timeouts.

### 5. Using `sections_any` Without `projects_any`
**Wrong:** `search_tasks(sections_any="<section_gid>")` — returns tasks from all projects.
**Right:** `search_tasks(sections_any="<section_gid>", projects_any="<project_gid>")` — scoped to correct project.
