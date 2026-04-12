---
description: Manage Attio comments and collaboration threads
argument-hint: "[action: list|create|resolve] [--record object:record-id] [--thread thread-id]"
---

# /attio-comments

Thread and comment management for Attio records. List collaboration threads, post new comments, reply to existing threads, and resolve completed discussions.

## Usage

```
/attio-comments <action> [options]
```

## Actions

### list

Retrieve all comment threads for a specific record.

```
/attio-comments list --record people:<record-id>
/attio-comments list --record companies:<record-id>
/attio-comments list --record deals:<record-id>
```

- `--record` accepts `object:record-id` format (e.g., `people:abc123`)
- Returns all threads with their comments, authors, timestamps, and resolved status
- Resolved threads are included but visually distinguished

### create

Post a new comment on a record or reply to an existing thread.

**New comment (starts a new thread):**
```
/attio-comments create --record people:<record-id> "Great meeting today"
/attio-comments create --record companies:<record-id> "Renewal conversation initiated"
```

**Reply to an existing thread:**
```
/attio-comments create --thread <thread-id> "Agreed, let's follow up next week"
```

- `--record` creates a new top-level comment thread on the specified record
- `--thread` appends a reply to an existing thread (use thread ID from `list` output)
- Comment text is positional — pass it as the final argument in double quotes
- To mention a workspace member, include their email address in the comment text (e.g., `"Following up — tagging alice@company.com for context"`)
- Format: plaintext only — no Markdown, HTML, or rich text is supported

### resolve

Mark a comment thread as resolved.

```
/attio-comments resolve <thread-id>
```

- Thread ID is returned by the `list` action
- Resolved threads remain visible but are marked closed
- Resolution cannot be undone through this command — use the Attio UI to reopen if needed

## Notes

- Comments are visible to all workspace members with access to the record
- Member mentions via email are best-effort — Attio matches the email to a workspace member at save time
- Thread IDs and record IDs are distinct — always use the correct identifier for each flag

## Delegation

Delegates to the **attio-comments-specialist** agent for thread retrieval, comment creation, reply posting, and thread resolution via the Attio API.
