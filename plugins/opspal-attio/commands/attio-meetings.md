---
description: Attio meeting management and transcript access
argument-hint: "[action: list|create|transcript] [--linked-to object:record-id] [--since 7d]"
---

# /attio-meetings

Meeting lifecycle management for Attio workspaces. List, create, and access transcripts and recordings for meetings linked to any Attio record.

## Usage

```
/attio-meetings <action> [options]
```

## Actions

### list

Retrieve meetings linked to a specific record, optionally filtered by recency.

```
/attio-meetings list --linked-to companies:<record-id>
/attio-meetings list --linked-to people:<record-id> --since 30d
/attio-meetings list --linked-to deals:<record-id> --since 7d
```

- `--linked-to` accepts `object:record-id` format (e.g., `companies:abc123`)
- `--since` accepts duration values: `7d`, `14d`, `30d`, `90d` (default: `30d`)
- Returns meeting title, date, duration, participants, and linked records

### create

Create a new meeting record in Attio linked to one or more participants.

```
/attio-meetings create --participants user@example.com,contact@company.com
/attio-meetings create --participants user@example.com --linked-to deals:<record-id>
```

- `--participants` accepts comma-separated email addresses
- `--linked-to` optionally associates the meeting with an existing Attio record
- Participants are matched to existing Attio people records where possible

### transcript

Retrieve the transcript for a specific meeting.

```
/attio-meetings transcript <meeting-id>
```

- Returns full transcript text with speaker attribution where available
- Meeting ID is returned by `list` action

### recordings

Access recordings associated with a meeting.

```
/attio-meetings recordings <meeting-id>
```

- Returns recording metadata and access links
- Availability depends on meeting source integration (e.g., Zoom, Google Meet)

### timeline

View chronological meeting history for a person or company.

```
/attio-meetings timeline --linked-to people:<record-id>
/attio-meetings timeline --linked-to companies:<record-id>
```

- Displays all meetings in chronological order for the linked record
- Useful for reviewing full relationship history before a call or QBR

## Delegation

Delegates to the **attio-meeting-intelligence** agent for data retrieval, meeting creation, transcript parsing, and timeline assembly.
