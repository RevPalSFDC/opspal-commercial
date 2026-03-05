---
name: report-type-reference
description: Salesforce report type discovery, field mapping, and format compatibility. Use when discovering report types, mapping UI names to API tokens, selecting report formats, or creating custom report types. Provides report type catalog, field discovery patterns, and format selection guidance.
allowed-tools: Read, Grep, Glob
---

# Report Type Reference

## When to Use This Skill

- Discovering available report types in an org
- Mapping UI report type names to API tokens
- Selecting compatible report formats
- Creating custom report types
- Understanding field availability per report type

## Quick Reference

### Report Type Discovery

```bash
# Use MCP tools for report type operations
mcp_salesforce_report_type_list

# Describe specific report type
mcp_salesforce_report_type_describe <report-type>
```

### Report Type + Format Compatibility

| Report Type Pattern | Compatible Formats |
|--------------------|-------------------|
| Single object (Account, Opportunity) | TABULAR, SUMMARY, MATRIX |
| Related objects (AccountOpportunity) | TABULAR, SUMMARY, MATRIX, JOINED |
| Custom report types | TABULAR, SUMMARY, MATRIX |
| Activities | TABULAR, SUMMARY (limited MATRIX) |

### Investigation Pattern

```bash
# Initialize metadata cache
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init <org>

# List all objects for report type mapping
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js list-objects <org>

# Get object fields for report type field discovery
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org> <object>
```

## Detailed Documentation

See supporting files:
- `standard-types.md` - Standard report types reference
- `field-mappings.md` - Available fields per type
- `join-patterns.md` - Cross-object reporting
