# Asana Navigation & Interaction Guide for LLM Agents

**Version**: 1.0.0
**Context**: This guide optimizes Model Context Protocol (MCP) usage for agents interacting with Asana.

## 1. Core Mental Model for Agents

Agents must understand the Asana data hierarchy to navigate efficiently. Do not attempt to "browse" randomly.

**Hierarchy:**
`Workspace` -> `Team` -> `Project` -> `Section` -> `Task` -> `Subtask`

**Key Constraint:**
- **IDs are King:** Names are ambiguous. Always resolve a name to a `gid` (Global ID) first.
- **Stateless:** You do not have a persistent session. You must re-acquire context or store `gid`s in your memory.

## 2. Navigation Algorithms

Follow these optimized paths to find data.

### 2.1 Finding a Project
**Goal:** User says "Check the Mobile App project."
1.  **Search First:** Use `search_projects_by_name(query="Mobile App")`.
2.  **Validate:** Check if the returned project is not archived (unless requested).
3.  **Store GID:** Save `project_gid` for subsequent calls.

### 2.2 Finding a Specific Task
**Goal:** User says "Find the bug report about login failure."
1.  **Global Search (Broad):** Use `search_tasks(text="login failure", resource_subtype="default_task")`.
    *   *Optimization:* If you know the project, add `project=<project_gid>` to the search to reduce noise.
2.  **Inspect Results:** Look at `name` and `assignee` in the snippet.
3.  **Get Details:** Call `get_task_details(task_gid=...)` only for the high-confidence match.

### 2.3 Exploring a Board/Project
**Goal:** User says "What's in progress in the Engineering project?"
1.  **Get Sections:** Call `get_project_sections(project_gid=...)`.
2.  **Identify Target Section:** Find section named "In Progress" or "Doing".
3.  **Fetch Tasks in Section:** Call `get_tasks_in_section(section_gid=...)`.
    *   *Anti-Pattern:* Do not fetch *all* tasks in the project and filter client-side. This is slow.

## 3. Tool Usage Best Practices

### 3.1 Optimization Parameters (`opt_fields`)
Always use `opt_fields` to prevent timeouts and reduce token usage.

*   **For Lists:** `opt_fields=name,gid,assignee.name,due_on,completed`
*   **For Details:** `opt_fields=name,notes,custom_fields,permalink_url`

### 3.2 Modification Rules
*   **Atomic Updates:** Update one field at a time if possible, or bundle closely related changes.
*   **Move to Section:** To move a task on a board, use `addProject` (or `add_task_to_section`) rather than just changing a custom field.

## 4. Error Recovery & Edge Cases

| Scenario | Agent Action |
| :--- | :--- |
| **Search returns 0 results** | 1. Broaden terms (remove "bug", "report"). <br> 2. Ask user for the specific Project name. |
| **Multiple Projects found** | List the options (names + team names) and ask user to clarify. |
| **Task not found by ID** | The ID might be old/invalid. Trigger a text search for the task name. |
| **Rate Limit (429)** | Wait 5 seconds, then retry. Do not hammer the API. |

## 5. System Prompt snippet (Copy-Paste)

Add this to your Agent's system instructions:

```text
<asana_capability>
  When navigating Asana:
  1. PREFER 'search' tools over 'list' tools for finding specific items.
  2. ALWAYS resolve Project/Task names to GIDs before attempting modifications.
  3. USE 'opt_fields' to request only necessary data (name, gid, status).
  4. IF a project has Board view, you MUST identify the 'Section' GID to create tasks in the correct column.
</asana_capability>
```
