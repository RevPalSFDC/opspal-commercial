---
name: hubspot-workflow-patterns
description: HubSpot workflow API limitations, branching patterns, and workarounds. Use when creating or modifying HubSpot workflows, implementing conditional branching, troubleshooting workflow API errors, or automating complex workflow operations. Provides API vs UI decision matrix, LIST_BRANCH workarounds, and validation patterns.
allowed-tools: Read, Grep, Glob
---

# HubSpot Workflow Patterns

## When to Use This Skill

- Creating HubSpot workflows via API
- Implementing conditional branching logic
- Troubleshooting workflow API errors
- Planning hybrid API + UI automation
- Validating workflow configurations
- Understanding API limitations

## Quick Reference

### API vs UI Feature Matrix

| Feature | API Support | Notes |
|---------|-------------|-------|
| Contact workflows | ✅ Full | Create, read, update, delete |
| Deal/Company workflows | ❌ None | UI only |
| Simple actions | ✅ Full | Delays, emails, tasks, property updates |
| STATIC_BRANCH | ✅ Full | Single-property splits |
| LIST_BRANCH | ❌ None | API returns 400, use UI |
| AB_TEST_BRANCH | ✅ Full | Random percentage splits |
| List management | ✅ Full | Add to/remove from lists |
| Custom code actions | ✅ Partial | Secrets may require UI |

### Critical Limitation: LIST_BRANCH

**Cannot create complex if/then branching via API:**
- API **returns** LIST_BRANCH in GET responses
- API **rejects** LIST_BRANCH in POST/PUT requests
- Error: `HTTP 400 - Invalid request to flow update`

**Workaround:** Use Playwright browser automation or manual UI

### Decision Matrix

```
Is it a Contact Workflow?
├─ NO → Use UI (API only supports contacts)
└─ YES → Does it need complex branching?
    ├─ YES (AND/OR logic) → Use UI automation
    └─ NO (single property) → Use API (STATIC_BRANCH)
```

## Detailed Documentation

See supporting files:
- `api-limitations.md` - Known API limitations and workarounds
- `branching-patterns.md` - STATIC_BRANCH vs LIST_BRANCH patterns
- `workarounds.md` - Playwright and validation solutions
- `testing-patterns.md` - Workflow testing approaches
