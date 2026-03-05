# HubSpot MCP Server Version Guide

This document provides guidance on when to use `hubspot-v4` vs `hubspot-enhanced-v3` MCP servers.

## Overview

The HubSpot plugin supports two MCP server configurations:

| Server | Purpose | Primary Use Cases |
|--------|---------|-------------------|
| `hubspot-v4` | Automation & workflows | Workflows, sequences, webhooks, advanced search |
| `hubspot-enhanced-v3` | CRUD & data operations | Records, properties, associations, bulk operations |

## Decision Matrix

### Use `hubspot-v4` for:

| Tool | Description | When to Use |
|------|-------------|-------------|
| `workflow_enumerate` | List all workflows | Auditing, discovery |
| `workflow_hydrate` | Get workflow details | Detailed analysis |
| `workflow_get_all` | Bulk workflow retrieval | Mass workflow operations |
| `workflow_performance` | Workflow metrics | Performance analysis |
| `search_with_total` | Search with total count | Reports requiring counts |
| `get_total_count` | Get record count only | Dashboard metrics |
| `sequence_list` | List sequences | SDR operations |
| `sequence_get` | Get sequence details | Sequence analysis |
| `sequence_enroll` | Enroll in sequence | Outreach automation |
| `callback_complete` | Complete workflow callback | Async workflow processing |
| `callback_auto_complete` | Auto-complete callback | Automated workflow handling |
| `webhook_process` | Process webhook | Integration events |
| `webhook_status` | Check webhook status | Webhook debugging |
| `validate_scopes` | Validate OAuth scopes | Permission checking |

### Use `hubspot-enhanced-v3` for:

| Tool | Description | When to Use |
|------|-------------|-------------|
| `hubspot_search` | Search records | Finding records |
| `hubspot_get` | Get single record | Record retrieval |
| `hubspot_create` | Create record | New record creation |
| `hubspot_update` | Update record | Record modifications |
| `hubspot_delete` | Delete record | Record removal |
| `hubspot_batch_upsert` | Bulk create/update | Mass data operations |
| `hubspot_export` | Export data | Data extraction |
| `hubspot_import` | Import data | Data ingestion |
| `hubspot_associate` | Create associations | Relationship management |
| `hubspot_get_schema` | Get object schema | Schema discovery |
| `hubspot_validate_schema` | Validate schema | Pre-operation checks |
| `hubspot_get_metrics` | Get portal metrics | Analytics |
| `hubspot_health_check` | Portal health check | System monitoring |
| `hubspot_check_policy` | Check governance policy | Compliance |
| `hubspot_set_policy` | Set governance policy | Governance management |
| `hubspot_scan_duplicates` | Find duplicates | Data hygiene |
| `hubspot_merge_duplicates` | Merge duplicates | Data cleanup |
| `hubspot_sync` | Sync data | Integration sync |

## Mixing Versions

**Mixing versions is acceptable and often required** when an agent needs both workflow operations AND data operations.

### Valid Mixed Usage Patterns

```yaml
# Workflow builder that also searches records
tools:
  - mcp__hubspot-v4__workflow_enumerate
  - mcp__hubspot-v4__workflow_hydrate
  - mcp__hubspot-enhanced-v3__hubspot_search

# Analytics agent that needs counts AND metrics
tools:
  - mcp__hubspot-v4__search_with_total
  - mcp__hubspot-v4__get_total_count
  - mcp__hubspot-enhanced-v3__hubspot_get_metrics
```

### Common Agent Patterns by Type

| Agent Type | V4 Tools | V3 Tools |
|------------|----------|----------|
| **Workflow Agents** | workflow_*, callback_* | hubspot_search (for context) |
| **Data Agents** | (none or search_with_total) | All CRUD, batch_upsert, associate |
| **Analytics Agents** | search_with_total, get_total_count, workflow_performance | hubspot_get_metrics, hubspot_export |
| **Admin Agents** | validate_scopes | health_check, check_policy, set_policy, get_schema |
| **SDR Agents** | sequence_* | hubspot_search, hubspot_update |
| **Integration Agents** | webhook_* | hubspot_associate, hubspot_sync |

## Tool Usage Statistics

Based on current agent configurations:

### Most Used Tools

| Rank | Tool | Usage Count | Server |
|------|------|-------------|--------|
| 1 | `hubspot_search` | 29 | enhanced-v3 |
| 2 | `hubspot_update` | 17 | enhanced-v3 |
| 3 | `search_with_total` | 9 | v4 |
| 4 | `hubspot_get` | 9 | enhanced-v3 |
| 5 | `hubspot_create` | 9 | enhanced-v3 |
| 6 | `workflow_hydrate` | 8 | v4 |
| 7 | `workflow_enumerate` | 8 | v4 |
| 8 | `hubspot_export` | 7 | enhanced-v3 |
| 9 | `hubspot_batch_upsert` | 7 | enhanced-v3 |

## Configuration Reference

### hubspot-v4 Server
```json
{
  "hubspot-v4": {
    "command": "node",
    "args": [".claude-plugins/opspal-hubspot/scripts/mcp/resolve-hubspot-mcp.js", "--server", "hubspot-v4"],
    "description": "HubSpot v4 automation MCP server"
  }
}
```

**Required Environment Variables:**
- `HUBSPOT_ACCESS_TOKEN` - OAuth access token
- `HUBSPOT_PORTAL_ID` - HubSpot portal ID
- `HUBSPOT_WEBHOOK_SECRET` - (optional) For webhook processing

### hubspot-enhanced-v3 Server
```json
{
  "hubspot-enhanced-v3": {
    "command": "node",
    "args": [".claude-plugins/opspal-hubspot/scripts/mcp/resolve-hubspot-mcp.js", "--server", "hubspot-enhanced-v3"],
    "description": "HubSpot enhanced v3 MCP server for CRUD operations"
  }
}
```

**Required Environment Variables:**
- `HUBSPOT_API_KEY` - HubSpot API key
- `HUBSPOT_PORTAL_ID` - HubSpot portal ID
- `HUBSPOT_ACCOUNT_TIER` - (optional) For tier-specific features

## Troubleshooting

### "Tool not found" errors
1. Check that the correct server is configured in `.mcp.json`
2. Verify environment variables are set
3. Run `claude mcp list` to see active servers

### Rate limiting
- Both servers share the same HubSpot API limits (100 req/10s)
- Use `hubspot_batch_upsert` for bulk operations instead of individual calls
- Check `workflow_performance` before heavy workflow operations

### Server not starting
1. Check Node.js version (18+)
2. Verify `resolve-hubspot-mcp.js` exists
3. Check logs: `claude mcp logs hubspot-v4`

## Migration Notes

If you're updating an agent from a single-server pattern:

1. **Identify tool categories** - Group by workflow vs CRUD
2. **Split tool declarations** - Put workflow tools under v4, CRUD under v3
3. **Test thoroughly** - Ensure both servers are accessible
4. **Update frontmatter** - Use the patterns in this guide

## Quick Reference Card

```
WORKFLOW/AUTOMATION → hubspot-v4
  - workflow_*
  - sequence_*
  - callback_*
  - webhook_*

DATA/RECORDS → hubspot-enhanced-v3
  - hubspot_search/get/create/update/delete
  - hubspot_batch_upsert
  - hubspot_associate
  - hubspot_export/import

COUNTS/TOTALS → hubspot-v4
  - search_with_total
  - get_total_count

GOVERNANCE → hubspot-enhanced-v3
  - hubspot_health_check
  - hubspot_check_policy
  - hubspot_set_policy
  - hubspot_get_schema
```

---

**Last Updated:** 2026-01-08
**Version:** 1.0.0
