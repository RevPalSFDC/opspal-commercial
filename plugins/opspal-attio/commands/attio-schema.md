---
description: Inspect Attio workspace schema (objects, attributes, lists)
argument-hint: "[object|list] [--detail] [--format table|json]"
---

# /attio-schema

Inspect the schema of your Attio workspace — objects, attributes, and lists.

## Usage

```
/attio-schema
/attio-schema [object] [--detail] [--attributes] [--format table|json]
/attio-schema --list [slug] [--detail] [--format table|json]
```

## Overview

`/attio-schema` is a read-only schema inspection tool. It enumerates objects, lists, and their attributes without making any changes to the workspace. Use it to understand the current data model before building queries, adding fields, or setting up integrations.

For schema mutations (creating or deleting attributes), delegate to the `attio-attribute-architect` agent.

## Commands

### List All Objects
```
/attio-schema
```
Returns a summary table of all objects in the workspace with record counts.

### Object Detail
```
/attio-schema people --detail
```
Shows full object metadata: slug, display name, singular/plural labels, and all attributes with their types.

### All Attributes Table
```
/attio-schema people --attributes
```
Returns a structured table of all attributes for the object:

| Name | Slug | Type | Required | Unique |
|------|------|------|----------|--------|
| Name | name | text | Yes | No |
| Email | email_addresses | email | No | Yes |
| Job Title | job_title | text | No | No |

### List Detail
```
/attio-schema --list sales-pipeline --detail
```
Shows list metadata: slug, parent object, creation date, and all list-specific attributes with types and stage options (for status attributes).

### JSON Output
```
/attio-schema people --format json
/attio-schema --list sales-pipeline --format json
```
Returns raw schema as a JSON object suitable for piping into scripts or saving for reference.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--detail` | off | Show full attribute list alongside object or list metadata |
| `--attributes` | off | Show attributes-only table (name, slug, type, required, unique) |
| `--list [slug]` | — | Inspect a list schema instead of an object |
| `--format` | `table` | Output format: `table` (human-readable) or `json` (machine-readable) |

## Caching

Schema data is cached via `scripts/lib/attribute-schema-cache.js` to avoid redundant API calls. The cache is refreshed:
- On each session start
- After any attribute create or delete operation
- When `--detail` is explicitly requested (forces refresh)

## Schema Mutations

`/attio-schema` is read-only. To create, rename, or delete attributes or objects, delegate to the `attio-attribute-architect` agent:

```
# Example: Add a new attribute
Task(subagent_type='attio-attribute-architect', ...)
```

## Examples

### Explore Full Workspace Schema
```
/attio-schema
```

### Inspect People Object in Detail
```
/attio-schema people --detail
```

### Get All Company Attributes as a Table
```
/attio-schema companies --attributes
```

### Inspect a Pipeline List
```
/attio-schema --list sales-pipeline --detail
```

### Export Schema to JSON
```
/attio-schema people --format json
```

## When to Run

- Before writing queries (confirm attribute slugs)
- Before creating new attributes (check for naming conflicts)
- Before bulk imports (verify required fields and types)
- During workspace onboarding (understand existing data model)
