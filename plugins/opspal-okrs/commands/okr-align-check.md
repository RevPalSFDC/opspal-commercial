---
name: okr-align-check
description: Audit OKR cascade integrity and alignment scoring across company, department, and team levels
argument-hint: "--org <org-slug> --cycle <cycle> [--level company|department|team|all] [--format json|markdown]"
intent: Validate that OKRs cascade correctly with no orphans, missing DRIs, or circular dependencies.
dependencies: [opspal-okrs:okr-alignment-auditor]
failure_modes: [org_not_provided, no_approved_cycle, insufficient_objectives]
visibility: user-invocable
aliases:
  - okr-alignment
  - okr-cascade-check
tags:
  - okr
  - alignment
  - audit
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
---

# /okr-align-check Command

Audit the cascade integrity of an OKR set, scoring alignment on a 100-point scale and identifying orphans, DRI gaps, and circular dependencies.

## Usage

```bash
# Full alignment audit across all levels
/okr-align-check --org acme-corp --cycle Q3-2026

# Audit only company + department cascade
/okr-align-check --org acme-corp --cycle Q3-2026 --level department

# Output as Markdown instead of JSON
/okr-align-check --org acme-corp --cycle Q3-2026 --format markdown

# Use current org (ORG_SLUG env var)
/okr-align-check --cycle Q3-2026
```

## What This Does

Performs a 5-point audit:

1. **Cascade Link Completeness** (40 pts) — Every dept/team objective links to a parent
2. **DRI Coverage** (25 pts) — Every objective has a named owner
3. **Orphan Detection** (20 pts) — No objectives without valid parent links
4. **Circular Dependency Check** (15 pts) — No cycles in the parent chain
5. **Cross-Functional Dependencies** (advisory) — Flags undeclared cross-dept dependencies

## Output

| File | Location | Description |
|------|----------|-------------|
| Alignment Audit | `orgs/{org}/platforms/okr/{cycle}/reports/alignment-audit-{cycle}.json` | Score, violations, gaps |

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `alignment_score` | number | 0-100 aggregate score |
| `violations` | array | Each violation with code, severity, description, remediation |
| `orphaned_objectives` | array | IDs of orphaned objectives |
| `dri_gaps` | array | IDs of objectives missing a DRI |
| `circular_dependencies` | array | Cycle paths if any detected |
| `recommendations` | array | Actionable remediation steps |

## Level Filtering

| Level | Scope |
|-------|-------|
| `company` | Company-level objectives only |
| `department` | Company + department cascade |
| `team` | All three levels |
| `all` (default) | Full audit across all levels |

## Execution

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-alignment-auditor',
  prompt: `Audit OKR alignment for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Level: ${level || 'all'}
    Format: ${format || 'json'}`
});
```

## Related Commands

- `/okr-generate` — Generate OKRs with cascade links
- `/okr-approve` — Approve and activate (run alignment check first!)
- `/okr-dashboard` — Visualize OKR health including alignment
