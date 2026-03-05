# Smart Campaigns REST API Runbook

Comprehensive guide for managing Marketo Smart Campaigns via the REST API. Designed for internal agentic systems (Claude sub-agents) that perform full CRUD operations on Smart Campaign assets.

## Quick Reference

| Operation | Endpoint | Method | Section |
|-----------|----------|--------|---------|
| Create | `/rest/asset/v1/smartCampaigns.json` | POST | [04-create-operations](./04-create-operations.md) |
| Read (by ID) | `/rest/asset/v1/smartCampaign/{id}.json` | GET | [05-read-operations](./05-read-operations.md) |
| Read (by name) | `/rest/asset/v1/smartCampaign/byName.json` | GET | [05-read-operations](./05-read-operations.md) |
| Update | `/rest/asset/v1/smartCampaign/{id}.json` | POST | [06-update-operations](./06-update-operations.md) |
| Clone | `/rest/asset/v1/smartCampaign/{id}/clone.json` | POST | [07-clone-operations](./07-clone-operations.md) |
| Delete | `/rest/asset/v1/smartCampaign/{id}/delete.json` | POST | [08-delete-operations](./08-delete-operations.md) |
| Activate | `/rest/asset/v1/smartCampaign/{id}/activate.json` | POST | [09-activation-execution](./09-activation-execution.md) |
| Deactivate | `/rest/asset/v1/smartCampaign/{id}/deactivate.json` | POST | [09-activation-execution](./09-activation-execution.md) |
| Trigger | `/rest/v1/campaigns/{id}/trigger.json` | POST | [09-activation-execution](./09-activation-execution.md) |
| Schedule | `/rest/v1/campaigns/{id}/schedule.json` | POST | [09-activation-execution](./09-activation-execution.md) |

## Runbook Sections

1. **[Authentication & Token Management](./01-authentication-token-management.md)**
   - OAuth2 Client Credentials flow
   - Token lifecycle and refresh
   - Header-based authorization

2. **[API Best Practices & Error Handling](./02-api-best-practices-error-handling.md)**
   - Rate limits (100 calls/20 sec)
   - Error codes and handling
   - Retry strategies

3. **[Campaign Object Structure](./03-campaign-object-structure.md)**
   - Smart Campaign properties
   - Smart List structure (triggers/filters)
   - Flow structure (limitations)

4. **[Create Operations](./04-create-operations.md)**
   - POST /smartCampaigns.json
   - Required/optional parameters
   - Response handling

5. **[Read Operations](./05-read-operations.md)**
   - GET by ID, by name, browse
   - Filtering and pagination
   - Smart List retrieval

6. **[Update Operations](./06-update-operations.md)**
   - POST /smartCampaign/{id}.json
   - Name and description only
   - Limitations

7. **[Clone Operations](./07-clone-operations.md)**
   - POST /smartCampaign/{id}/clone.json
   - Template-based creation
   - Cross-program cloning

8. **[Delete Operations](./08-delete-operations.md)**
   - POST /smartCampaign/{id}/delete.json
   - Pre-delete requirements
   - Safety considerations

9. **[Activation & Execution](./09-activation-execution.md)**
   - Activate/deactivate triggers
   - Request campaign for leads
   - Schedule batch campaigns

10. **[Smart List & Flow Limitations](./10-smart-list-flow-limitations.md)**
    - API limitations on triggers/flows
    - Template workarounds
    - Token-based customization

11. **[Smart List Snapshot & Diff](./11-smart-list-snapshots.md)**
    - Backup and audit snapshots
    - Diffing rule changes

12. **[UI Automation (Playwright) for Smart Lists](./12-ui-automation-smart-lists.md)**
    - Last-resort UI scripting
    - Safeguards and verification

## API Limits Summary

| Limit Type | Value | Error Code |
|------------|-------|------------|
| Rate limit | 100 calls / 20 seconds | 606 |
| Concurrent requests | 10 max | 615 |
| Daily quota | 50,000 calls / day | 607 |
| Leads per request | 100 max | - |
| Tokens per request | 100 max | - |

## Critical Limitations

> **Warning**: The Marketo REST API **cannot** create or modify Smart List triggers/filters or Flow steps. Campaigns created via API will have empty logic. Use **cloning from templates** to create functional campaigns programmatically.

## Related Resources

- **Agent**: `marketo-smart-campaign-api-specialist` - API-focused CRUD operations
- **Agent**: `marketo-campaign-builder` - Campaign design and logic
- **Skill**: `marketo-smart-campaign-api-reference` - Quick reference
- **Command**: `/smart-campaign-api` - Endpoint reference
- **Command**: `/clone-campaign-wizard` - Interactive cloning

## Version

- **Runbook Version**: 1.0.0
- **Marketo API Version**: v1
- **Last Updated**: 2026-01-13
