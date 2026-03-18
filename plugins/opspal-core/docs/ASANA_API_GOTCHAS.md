# Asana API Gotchas

Known behavioral quirks in the Asana API that differ from expected behavior. These gotchas have caused real production errors and are documented here to prevent recurrence.

---

## GOTCHA-001: `sections_any` is Workspace-Scoped, Not Project-Scoped

**Severity**: HIGH
**Discovered**: 2026-02-05 (Aspire org assessment)
**Tool**: `mcp__asana__asana_search_tasks`

### Problem

When using `sections_any` to search for tasks within specific sections, the Asana API returns tasks from **all projects in the workspace** that match the section criteria — not just tasks from the intended project.

### Impact

During an Aspire project assessment, a section-based search returned tasks from Peregrine, Cadmium, Filmhub, and QuotaPath projects alongside Aspire tasks. This caused incorrect recommendations that the user had to catch and correct manually.

### Root Cause

Asana's search endpoint (`GET /workspaces/{workspace_gid}/tasks/search`) is inherently workspace-scoped. The `sections_any` parameter filters by section GID but does not implicitly restrict results to the project those sections belong to. Section GIDs are globally unique, but the search still evaluates all tasks in the workspace.

### Prevention

Three options, in order of preference:

#### Option 1: Always combine `sections_any` with `projects_any` (Recommended)

```javascript
// Always include projects_any when using sections_any
const results = await asana_search_tasks({
  workspace: workspaceGid,
  sections_any: sectionGids.join(','),
  projects_any: projectGid  // <-- REQUIRED safety parameter
});
```

**Note**: Even with `projects_any`, edge cases may still leak through. Use Option 2 as a safety net.

#### Option 2: Post-filter with AsanaProjectFilter

```javascript
const AsanaProjectFilter = require('./scripts/lib/asana-project-filter');
const filter = new AsanaProjectFilter();

// After any section-based search, verify membership
const { filtered, excluded, stats } = await filter.filterByProject(rawResults, projectGid);

if (excluded.length > 0) {
  console.warn(`Excluded ${excluded.length} tasks from other projects`);
}
```

#### Option 3: Use the combined helper (Belt + Suspenders)

```javascript
const AsanaProjectFilter = require('./scripts/lib/asana-project-filter');
const filter = new AsanaProjectFilter();

// Combines sections_any + projects_any + post-filter
const { tasks, stats } = await filter.searchTasksInProjectSections(
  projectGid,
  sectionGids,
  { text: 'optional search text', completed: false }
);
```

### Tool Contract Rule

A WARNING rule (`sections_any_requires_project_filter`) is defined in `config/tool-contracts/mcp-tools.json`. It fires when `sections_any` is used without `projects_any`, alerting the agent to add project filtering.

### Related Files

- `scripts/lib/asana-project-filter.js` — Filter utility
- `config/tool-contracts/mcp-tools.json` — Tool contract with WARNING rule
- `commands/asana-update.md` — Command with warning note

---

## GOTCHA-002: Missing `opt_fields` Causes Large Payloads and Timeouts

**Severity**: MEDIUM
**Discovered**: 2026-02-06
**Tools**: `mcp__asana__asana_search_tasks`, `mcp__asana__asana_get_task`, all Asana MCP tools

### Problem

When `opt_fields` is omitted from Asana API calls, the response includes the full default representation — deeply nested custom field metadata, all memberships, full user objects, and project details. For tasks with many custom fields or in projects with complex configurations, this can cause:
- Response payloads exceeding token limits
- Slow response times and timeouts
- Wasted context window on irrelevant data

### Impact

Agents that omit `opt_fields` frequently time out on projects with 10+ custom fields or when searching across large workspaces. This leads to retry loops and failed operations.

### Prevention

Always specify `opt_fields` on every Asana MCP call. Use these recommended values:

```javascript
// Listing/searching — minimal fields for scanning
opt_fields: "name,gid,assignee.name,due_on,completed"

// Task details — full context for action
opt_fields: "name,notes,custom_fields,permalink_url,assignee.name,due_on,completed,memberships.section.name"

// Sections — just names and IDs
opt_fields: "name,gid"

// Projects — identification + team context
opt_fields: "name,gid,team.name,archived,permalink_url"
```

### Rule of Thumb

Request only the fields you will actually read or display. If you need custom field values, include `custom_fields`. If you just need to identify a task, `name,gid` is sufficient.

---

## GOTCHA-003: Board-View Projects Require Section GID for Correct Task Placement

**Severity**: MEDIUM
**Discovered**: 2026-02-06
**Tools**: `mcp__asana__asana_create_task`, `mcp__asana__asana_create_subtask`

### Problem

When creating a task in a project that uses Board view (Kanban-style columns), omitting the section/column assignment causes the task to land in the default "Untitled section" or the first column. This is almost never the intended placement and causes confusion for project managers.

### Impact

Tasks created without explicit section placement appear in the wrong column on boards, requiring manual drag-and-drop to correct. In automated workflows, this means tasks are invisible to team members who filter by section.

### Prevention

Before creating a task in any project, check the project's sections and specify the target:

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

// 3. Create task in the correct section
const task = await asana_create_task({
  project_id: projectGid,
  name: "New task",
  // Task is created in the project, then moved to section if needed
});

// 4. Move to correct section (if API supports addProject with section)
// Some MCP implementations handle this via project_id + section in create
```

### Rule of Thumb

If the project has sections (which board-view projects always do), discover them first and place the task deliberately. Never assume the default section is correct.
