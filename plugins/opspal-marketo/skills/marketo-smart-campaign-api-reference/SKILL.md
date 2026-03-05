---
name: marketo-smart-campaign-api-reference
description: Marketo Smart Campaigns REST API reference. Use when creating, reading, updating, cloning, or deleting campaigns via API. Includes endpoint signatures, error codes, rate limits, and API limitations for triggers and flows.
allowed-tools: Read, Grep, Glob
---

# Marketo Smart Campaign API Reference

## When to Use This Skill

- Creating Smart Campaigns via REST API
- Cloning campaigns from templates
- Updating campaign metadata
- Deleting campaigns safely
- Activating/deactivating trigger campaigns
- Scheduling batch campaigns
- Requesting campaigns for specific leads
- Understanding API limitations

## Quick Reference

### CRUD Operations

| Operation | Endpoint | MCP Tool |
|-----------|----------|----------|
| Create | POST /smartCampaigns.json | `campaign_create` |
| Read | GET /smartCampaign/{id}.json | `campaign_get` |
| Update | POST /smartCampaign/{id}.json | `campaign_update` |
| Clone | POST /smartCampaign/{id}/clone.json | `campaign_clone` |
| Delete | POST /smartCampaign/{id}/delete.json | `campaign_delete` |
| Smart List | GET /smartCampaign/{id}/smartList.json | `campaign_get_smart_list` |

### Execution Operations

| Operation | Endpoint | MCP Tool |
|-----------|----------|----------|
| Activate | POST /smartCampaign/{id}/activate.json | `campaign_activate` |
| Deactivate | POST /smartCampaign/{id}/deactivate.json | `campaign_deactivate` |
| Schedule | POST /campaigns/{id}/schedule.json | `campaign_schedule` |
| Request | POST /campaigns/{id}/trigger.json | `campaign_request` |

### API Limitations

**Critical**: These CANNOT be done via API:
- Create/modify Smart List triggers
- Create/modify Smart List filters
- Create/modify Flow steps
- Change qualification rules
- Change communication limits

**Solution**: Clone from templates with pre-configured triggers and flows.

### Rate Limits

| Limit | Value |
|-------|-------|
| Rate | 100 calls / 20 seconds |
| Concurrent | 10 simultaneous |
| Daily | 50,000 calls |
| Leads per request | 100 max |

### Common Error Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| 601/602 | Token issue | Refresh and retry |
| 606 | Rate limit | Wait 20s |
| 607 | Daily quota | Stop |
| 610 | Not found | Verify ID |
| 709 | Blocked | Check state |
| 711 | Name exists | Use unique |

## Detailed Documentation

See supporting files:
- `endpoint-reference.md` - Complete endpoint signatures
- `error-code-reference.md` - Error handling guide
- `rate-limit-reference.md` - Rate limit strategies
- `examples/batch-operations.md` - Code examples

## Runbook Reference

For procedural documentation:
- `docs/runbooks/smart-campaigns/README.md` - Overview
- `docs/runbooks/smart-campaigns/07-clone-operations.md` - Clone details
- `docs/runbooks/smart-campaigns/10-smart-list-flow-limitations.md` - Limitations
