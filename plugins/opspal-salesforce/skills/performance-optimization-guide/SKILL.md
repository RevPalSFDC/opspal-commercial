---
name: performance-optimization-guide
description: Salesforce performance optimization methodology and investigation tools. Use when optimizing slow queries, managing governor limits, monitoring system health, or improving overall org performance. Provides investigation patterns, query optimization techniques, bulk operation patterns, and performance benchmarking.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-performance-optimizer
context:
  fork: true
  checkpoint: baseline-established
  state-keys:
    - baseline-metrics
    - optimization-results
    - governor-limits
    - query-performance
---

# Performance Optimization Guide

## When to Use This Skill

- Optimizing slow SOQL queries
- Investigating performance bottlenecks
- Managing governor limit consumption
- Monitoring system health metrics
- Implementing bulk operation patterns
- Creating custom indexes

## Quick Reference

### Investigation Tools

```bash
# Initialize metadata cache
node scripts/lib/org-metadata-cache.js init <org>

# Discover indexed fields
node scripts/lib/org-metadata-cache.js query <org> <object> | jq '.fields[] | select(.indexed == true)'

# Validate queries before execution
node scripts/lib/smart-query-validator.js <org> "<soql>"
```

### Governor Limits Reference

| Limit | Per Transaction | Best Practice |
|-------|-----------------|---------------|
| SOQL Queries | 100 | Consolidate, use relationships |
| DML Operations | 150 | Batch into collections |
| CPU Time | 10,000ms | Avoid complex loops |
| Heap Size | 6MB | Don't store large objects |
| Callouts | 100 | Use async patterns |

### Performance Targets

| Operation | Sequential | Parallel/Batched | Improvement |
|-----------|-----------|------------------|-------------|
| Query optimization | 3,500ms | 800ms | 4x faster |
| Permission checks (20 users) | 50,000ms | 6,200ms | 8x faster |
| Security audits (40) | 60,000ms | 4,000ms | 15x faster |

## Detailed Documentation

See supporting files:
- `investigation-tools.md` - Diagnosis methods and cache usage
- `query-optimization.md` - SOQL optimization patterns
- `governor-limits.md` - Limit management strategies
- `bulk-patterns.md` - Bulkification patterns
