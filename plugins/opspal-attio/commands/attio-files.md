---
description: File management operations for Attio
argument-hint: "[action: list|upload|download|mkdir] [--record object:record-id]"
---

# /attio-files

File CRUD operations for Attio workspaces. List files by record or folder, upload files linked to records, download files by ID, and create folder hierarchies.

## Usage

```
/attio-files list
/attio-files list --record companies:rec_abc123
/attio-files upload ./contract.pdf --record companies:rec_abc123
/attio-files download file_xyz789
/attio-files mkdir "Contracts/Q1 2026"
/attio-files list --folder folder_id_here
```

## Actions

### `list`
List files, optionally filtered:
- No filter: lists all files in the workspace (paginated)
- `--record object:record-id`: lists files attached to a specific record (e.g., `companies:rec_abc123`)
- `--folder folder-id`: lists contents of a specific folder

Output: table of file ID, name, size, type, linked record, upload date.

### `upload`
Upload a file to Attio.

```
/attio-files upload <local-path> [--record object:record-id] [--folder folder-id]
```

- `<local-path>`: path to the file to upload (required)
- `--record`: link the file to a specific record (e.g., `--record deals:rec_456`)
- `--folder`: place the file in a specific folder

If `--record` is provided as `object:name` (e.g., `companies:Acme Corp`), the agent will look up the record ID automatically via name match.

### `download`
Download a file by ID to the current directory or a specified path.

```
/attio-files download <file-id> [--output ./local/path/]
```

Output: saved file path and confirmation with file name and size.

### `mkdir`
Create a folder or nested folder path.

```
/attio-files mkdir "Contracts/Q1 2026"
```

Creates parent folders as needed. Returns the folder ID of the innermost created folder.

## Record Reference Format

The `--record` flag accepts:
- `object-slug:record-id` — exact record ID (e.g., `companies:rec_abc123`)
- `object-slug:name` — agent looks up record by name match (e.g., `companies:Acme Corp`)
- `people:email@example.com` — agent looks up person by email

## File Deletion Warning

File deletion is permanent — Attio has no file recycle bin. To delete a file, use the Attio UI or confirm explicitly with the agent (deletion is intentionally not a default action of this command).

## Output Examples

### List Output
```
ID              Name                  Size    Type        Record              Uploaded
file_abc123     Q1-Contract.pdf       2.4 MB  PDF         Acme Corp (co.)     2026-03-15
file_def456     Proposal-v2.docx      512 KB  Word        Deal: Q1 Renewal    2026-03-20
```

### Upload Output
```
Uploaded: Q1-Contract.pdf
File ID:  file_abc123
Size:     2.4 MB
Linked:   companies / Acme Corp (rec_xyz789)
```

### Download Output
```
Downloaded: Q1-Contract.pdf
Saved to:   ./Q1-Contract.pdf
Size:       2.4 MB
```

## Delegates To

**attio-files-specialist** (Haiku model) — handles all file MCP tool calls and pagination.
