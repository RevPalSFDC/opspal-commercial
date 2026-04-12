---
description: Add a note to an Attio record
argument-hint: "[object] [record-id] [--format plaintext|markdown]"
---

# /attio-notes-add

Add a note to an Attio record.

## Usage

```
/attio-notes-add [object] [record-id] [--format plaintext|markdown]
```

## Overview

`/attio-notes-add` attaches a new note to a people or company record. After invoking the command, the agent prompts interactively for a note title and content before submitting.

Delegates to the `attio-notes-tasks-manager` agent.

> **Important**: Notes cannot be updated via the Attio API. Once created, a note is immutable. If you need to edit a note, delete it and recreate it.

## Usage

### Add a Plain Text Note
```
/attio-notes-add people <record-id>
```
Prompts for:
1. Note title
2. Note content (plain text)

### Add a Markdown Note
```
/attio-notes-add people <record-id> --format markdown
```
Prompts for:
1. Note title
2. Note content (Markdown — see supported syntax below)

### Add a Note to a Company
```
/attio-notes-add companies <record-id> --format markdown
```

## Supported Objects

| Object | Slug |
|--------|------|
| People | `people` |
| Companies | `companies` |

## Markdown Support

When using `--format markdown`, the following syntax is supported:

| Element | Markdown Syntax |
|---------|----------------|
| Heading 1 | `# Heading` |
| Heading 2 | `## Heading` |
| Heading 3 | `### Heading` |
| Unordered list | `- item` |
| Ordered list | `1. item` |
| Bold | `**bold**` |
| Italic | `*italic*` |
| Strikethrough | `~~strikethrough~~` |
| Highlight | `==highlight==` |
| Link | `[text](url)` |

Unsupported Markdown elements (tables, code blocks, images) will be stripped or rendered as plain text by Attio.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `plaintext` | Note content format: `plaintext` or `markdown` |

## API Behaviour

- Notes are created via `mcp__attio__notes_create`
- Notes are **immutable after creation** — there is no PATCH/update endpoint
- To replace a note: delete the existing note (`mcp__attio__notes_delete`) then recreate it
- Deletion is permanent — Attio has no recycle bin

## Examples

### Attach a Call Summary (Plain Text)
```
/attio-notes-add people rec_abc123
# → Prompt: Title: Discovery Call - 2026-04-10
# → Prompt: Content: Discussed pain points around data hygiene...
```

### Attach a Structured Markdown Note
```
/attio-notes-add companies rec_xyz789 --format markdown
# → Prompt: Title: Account Review Q2
# → Content supports headings, lists, bold, italic, links
```

## Agent Delegation

This command delegates to the `attio-notes-tasks-manager` agent for note creation, format validation, and confirmation.

## When to Use

- After a discovery call or meeting (call summary notes)
- Logging important context on a contact or company
- Attaching structured account review notes
- Adding enrichment context from external sources
