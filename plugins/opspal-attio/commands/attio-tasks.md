---
description: Manage Attio tasks (create, list, complete, assign)
argument-hint: "[action] [--assignee member-email] [--deadline YYYY-MM-DD]"
---

# /attio-tasks

Create, list, complete, and delete Attio tasks.

## Usage

```
/attio-tasks create "Task content" [--assignee member-email] [--deadline YYYY-MM-DD] [--linked-to object:record-id]
/attio-tasks list [--linked-to object:record-id]
/attio-tasks complete <task-id>
/attio-tasks delete <task-id>
```

## Overview

`/attio-tasks` provides full lifecycle management for Attio tasks — creation with optional assignees and deadlines, listing by linked record, completion, and deletion.

Delegates to the `attio-notes-tasks-manager` agent.

## Actions

### Create a Task
```
/attio-tasks create "Follow up with client" --assignee john@company.com --deadline 2026-04-15
```

Options for `create`:

| Flag | Description |
|------|-------------|
| `"content"` | Task content (plaintext only, max 2000 characters) |
| `--assignee` | Workspace member email to assign the task to |
| `--deadline` | Due date in `YYYY-MM-DD` format |
| `--linked-to` | Link to a record: `object:record-id` (e.g., `people:rec_abc123`) |

### List Tasks
```
/attio-tasks list
/attio-tasks list --linked-to people:rec_abc123
/attio-tasks list --linked-to companies:rec_xyz789
```

Without `--linked-to`, lists all open tasks in the workspace. With `--linked-to`, filters to tasks linked to the specified record.

### Complete a Task
```
/attio-tasks complete <task-id>
```

Marks a task as completed. The task remains visible in Attio history but is removed from active task views.

### Delete a Task
```
/attio-tasks delete <task-id>
```

Permanently deletes a task. Requires confirmation before execution.

> **Warning**: Task deletion is permanent. Attio has no recycle bin.

## Task Constraints

| Constraint | Value |
|------------|-------|
| Content format | Plain text only |
| Content max length | 2000 characters |
| Linked objects | `people` and `companies` only |
| Assignee resolution | By workspace member email (resolved via `mcp__attio__members_list`) |

## Assignee Resolution

Assignees are resolved by email address to a workspace member ID using `mcp__attio__members_list`. If the email is not found in the workspace, the agent will report the error and list available members before proceeding.

## Linked Records

Tasks can be linked to `people` and `companies` records. To link a task at creation time:

```
/attio-tasks create "Send proposal" --linked-to companies:rec_xyz789 --assignee jane@company.com
```

Multiple links can be added via the `attio-notes-tasks-manager` agent directly for advanced cases.

## Examples

### Create a Follow-Up Task with Deadline
```
/attio-tasks create "Follow up with client after demo" --assignee john@company.com --deadline 2026-04-15
```

### List All Open Tasks
```
/attio-tasks list
```

### List Tasks Linked to a Person
```
/attio-tasks list --linked-to people:rec_abc123
```

### Complete a Task
```
/attio-tasks complete task_id_here
```

### Delete a Task
```
/attio-tasks delete task_id_here
```

## Agent Delegation

This command delegates to the `attio-notes-tasks-manager` agent for task creation, assignee resolution, completion, deletion, and confirmation flows.
