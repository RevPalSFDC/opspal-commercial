---
description: Interactive query builder for Attio records and entries
argument-hint: "[object] [--filter key=value] [--sort field:asc|desc] [--limit N]"
---

# /attio-query

Build and execute queries against Attio records and list entries.

## Usage

```
/attio-query [object] [--filter key=value] [--sort field:asc|desc] [--limit N]
/attio-query [object] [--advanced]
/attio-query [object] [--path relationship.field=value]
/attio-query --list [list-slug] [--filter key=value]
/attio-query --search "search term"
```

## Overview

`/attio-query` is an interactive query builder that helps construct and execute Attio record and entry filters without writing raw API calls. It operates in simple, advanced, cross-object, and search modes depending on the flags provided.

Delegates to the `attio-query-specialist` agent for query construction and execution.

## Modes

### Simple Mode

Filter records by a single field:

```
/attio-query people --filter email=jane@example.com
/attio-query companies --filter domain=acme.com --limit 10
/attio-query people --filter job_title="VP Sales" --sort name:asc
```

### Advanced Mode

Prompts interactively for a full filter specification — compound conditions, multiple fields, nested logic:

```
/attio-query people --advanced
```

The agent will prompt for:
- Filter fields and values
- Logical operators (`AND` / `OR`)
- Sort fields and direction
- Result limit

### Cross-Object Mode

Traverse relationship paths to filter by related object attributes:

```
/attio-query people --path companies.industry=SaaS
/attio-query people --path companies.deals.stage=Open
```

> **Note**: Cross-object path queries rely on relationship attribute traversal. Deep paths (3+ hops) may approach query complexity limits.

### Entry Queries

Query list entries instead of object records:

```
/attio-query --list sales-pipeline --filter stage=Qualified
/attio-query --list sales-pipeline --filter stage=Open --sort created_at:desc --limit 25
```

### Search Mode (BETA)

Full-text search across all objects using the Attio search endpoint:

```
/attio-query --search "John Smith"
/attio-query --search "Acme Corp"
```

> **Warning**: The search endpoint is BETA — results are eventually consistent and capped at 25. For authoritative lookups, use simple mode with a specific filter field.

## Options

| Flag | Description |
|------|-------------|
| `--filter key=value` | Filter by a specific attribute slug and value |
| `--sort field:asc\|desc` | Sort results by field and direction |
| `--limit N` | Cap result count (default: 20) |
| `--advanced` | Enter interactive filter builder |
| `--path relationship.field=value` | Cross-object relationship filter |
| `--list [slug]` | Query list entries instead of object records |
| `--search "term"` | BETA full-text search |

## Query Complexity

Complex queries (many filters, deep relationship paths) are subject to Attio's query complexity scoring in a 10-second window. If a query is rejected for complexity, the agent will simplify and retry.

## Examples

### Find People by Email
```
/attio-query people --filter email=jane@example.com
```

### Find Open Pipeline Deals
```
/attio-query --list sales-pipeline --filter stage=Open --sort created_at:desc
```

### Find SaaS Companies
```
/attio-query companies --filter industry=SaaS --limit 50
```

### Cross-Object: People at Companies with Open Deals
```
/attio-query people --path companies.deals.stage=Open
```

### Interactive Advanced Query
```
/attio-query people --advanced
```

## Agent Delegation

This command delegates to the `attio-query-specialist` agent for filter construction, API execution, and result formatting.
