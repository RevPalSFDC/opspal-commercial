---
description: Pre-operation validation for Attio workspace
argument-hint: "[--scope=full|quick]"
---

# /attio-preflight

Validate that the Attio workspace is ready before running operations.

## Usage

```
/attio-preflight [--scope=full|quick]
```

## Overview

Run preflight checks before any significant Attio operation to catch authentication failures, connectivity issues, and schema gaps early.

## Scope Options

| Scope | Checks Performed |
|-------|-----------------|
| `quick` (default) | Auth valid, basic API connectivity |
| `full` | Auth + schema discovery + rate limit headroom + required object presence |

## Checks by Scope

### Quick Mode
- Authentication token is valid (`GET /v2/self`)
- Workspace is accessible and responding

### Full Mode
All quick checks, plus:
- Schema discovery (lists, objects, attributes loaded successfully)
- Rate limit headroom (remaining quota is above minimum threshold)
- Required objects present: `people`, `companies`
- Member count retrievable

## Output

```
[PASS] Authentication valid
[PASS] Workspace accessible: production
[PASS] Schema loaded (4 objects, 47 attributes)
[PASS] Rate limit headroom: 980/1000 remaining
[PASS] Required objects: people ✓  companies ✓
[PASS] Member count: 12 members

Preflight complete — workspace is ready.
```

## Examples

### Quick Check Before Any Operation
```
/attio-preflight
```

### Full Validation Before Bulk Operations
```
/attio-preflight --scope=full
```

## When to Run

- Before `/attio-dedup` or `/attio-audit`
- Before any bulk read/write operation
- After rotating API keys
- When debugging unexpected API errors
