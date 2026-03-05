---
name: hubspot-agent-standards
description: Mandatory standards for all HubSpot agents. Use when performing ANY HubSpot API operation, bulk data operation, workflow automation, or contact/deal management. Provides batch operation patterns, rate limit handling, pagination, error handling, and safety protocols.
allowed-tools: Read, Grep, Glob
---

# HubSpot Agent Standards

## When to Use This Skill

- Performing any HubSpot API operation
- Executing bulk data operations (>10 records)
- Creating or modifying workflows
- Working with contacts, companies, deals, or tickets
- Implementing HubSpot integrations
- Handling large dataset imports/exports

## Quick Reference

### Decision Tree for Data Operations

| Record Count | Method | Library |
|--------------|--------|---------|
| <10 records | Single/batch API | Either acceptable |
| 10-10k records | Batch endpoints (100/call) | `batch-update-wrapper.js` |
| >10k records | Imports API (async) | `imports-api-wrapper.js` |

### Mandatory Library Usage

| Scenario | Required Library |
|----------|-----------------|
| Update >10 records | `batch-update-wrapper.js` |
| Create/update uncertainty | `batch-upsert-helper.js` |
| Any associations | `batch-associations-v4.js` |
| Import >10k records | `imports-api-wrapper.js` |
| Property metadata | `batch-property-metadata.js` |

### Performance Benchmarks

| Operation | Record Count | Expected Duration |
|-----------|--------------|-------------------|
| Batch Create | 1000 | <3 seconds |
| Batch Update | 1000 | <3 seconds |
| Batch Delete | 1000 | <5 seconds |
| Import (Async) | 50,000 | <10 minutes |

## Core Principles

### 1. Always Use HubSpotClientV3
- Automatic rate limit handling (100 req/10s)
- Exponential backoff on 429 errors
- Complete pagination support
- Retry logic for transient failures

### 2. Complete Pagination (MANDATORY)
- ALWAYS check `paging.next.after`
- ALWAYS use page_size: 100 (maximum)
- Search API has 10k limit - use Exports API for larger datasets

### 3. No-Mocks Policy
- ZERO synthetic data generation
- All data from real HubSpot API
- Fail explicitly when queries cannot execute

### 4. Delete Safety Protocol (5 Steps)
1. Backup records
2. Validate associations transferred
3. Require explicit confirmation
4. Execute deletion
5. Write audit log

## Detailed Documentation

See supporting files:
- `api-patterns.md` - HubSpot API conventions
- `rate-limits.md` - Rate limit handling
- `error-handling.md` - Error recovery patterns
- `data-validation.md` - Property validation rules
