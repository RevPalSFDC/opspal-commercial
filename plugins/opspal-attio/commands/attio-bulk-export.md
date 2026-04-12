---
description: Export Attio records with pagination
argument-hint: "[--object people|companies] [--format json|csv] [--output path]"
---

# /attio-bulk-export

Exports records from an Attio object or list entries from a list, with streaming pagination that writes to disk as it pages rather than buffering all records in memory.

## Usage

```
/attio-bulk-export --object people
/attio-bulk-export --object companies --format csv --output ./exports/companies.csv
/attio-bulk-export --object people --filter 'primary_location.city=San Francisco'
/attio-bulk-export --list sales-pipeline
/attio-bulk-export --list sales-pipeline --format json --output ./exports/pipeline.json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--object` | Object type to export: `people`, `companies`, or custom object slug | Required unless `--list` is used |
| `--list` | Export list entries from a specific list (by slug) | — |
| `--format json\|csv` | Output format | `json` |
| `--output path` | File path to write output | `./attio-export-<timestamp>.<format>` |
| `--filter` | Attribute filter expression (see Filter Syntax below) | No filter (all records) |

## Export Modes

### Object Export

Exports all records from a top-level Attio object:

```
/attio-bulk-export --object people --format csv --output ./people.csv
```

Fetches all people records with all their attributes. Pagination is handled automatically; each page is written to the output file as it arrives.

### List Entry Export

Exports entries from a specific list, including list-specific attributes (e.g., stage, owner):

```
/attio-bulk-export --list sales-pipeline --format json
```

List entry exports include the underlying record data merged with the list entry fields (stage, assigned member, entry dates).

## Filter Syntax

Filters use dot-notation for nested attributes:

```
/attio-bulk-export --object people --filter 'primary_location.city=San Francisco'
/attio-bulk-export --object companies --filter 'employee_count>100'
/attio-bulk-export --object people --filter 'job_title~Manager'
```

| Operator | Meaning |
|----------|---------|
| `=` | Exact match |
| `!=` | Not equal |
| `>`, `<` | Greater/less than (numeric) |
| `~` | Contains (text) |

Multiple filters can be joined with `,` (AND logic).

## Streaming Behavior

The exporter writes records to disk as each page is received, not after all pages are fetched. This means:

- Memory usage stays low regardless of record count
- You can observe partial output in the file while export is in progress
- If the export is interrupted, already-written records are preserved

## Agent Delegation

Delegates to the **attio-data-operations** agent, which uses `record-export-paginator.js` to handle the pagination loop and streaming file writes.

## Notes

- CSV exports flatten nested attributes using dot-notation column headers (e.g., `primary_location.city`)
- Multi-value attributes (e.g., email addresses, phone numbers) are serialized as semicolon-separated values in CSV
- JSON exports use the raw Attio API attribute structure for lossless round-trips
- Export speed is approximately 100–200 records/second depending on attribute count and API response time
- There is no record count limit; the paginator will fetch all pages until exhausted
