# Upsert Operations Runbook

Comprehensive operational guide for Salesforce Lead/Contact/Account upsert operations with intelligent matching, enrichment, auto-conversion, and error handling.

## Overview

This runbook covers best practices for upsert operations across the Lead-Contact-Account lifecycle:

1. **Matching & Deduplication** - Intelligent record matching with fuzzy algorithms
2. **Field Mapping** - Standardized transformations and null handling
3. **Ownership Routing** - Assignment rules, territories, and round-robin distribution
4. **Data Enrichment** - Waterfall enrichment from multiple providers
5. **Lead Conversion** - Auto-conversion with duplicate prevention
6. **Error Handling** - Retry strategies and escalation procedures
7. **Audit & Transparency** - Logging and compliance requirements

## Quick Reference

### Commands

| Command | Description |
|---------|-------------|
| `/upsert import` | Import records from CSV/JSON |
| `/upsert match` | Preview matching without changes |
| `/upsert enrich` | Enrich existing records |
| `/upsert convert` | Convert qualified Leads |
| `/upsert retry` | Process error queue |
| `/upsert status` | Show operation status |
| `/lead-convert diagnose` | Analyze Lead for conversion blockers |
| `/lead-convert preview` | Preview conversion results |
| `/lead-convert batch` | Batch convert Leads |

### Agents

| Agent | Purpose |
|-------|---------|
| `sfdc-upsert-orchestrator` | Master orchestrator (Tier 3) |
| `sfdc-upsert-matcher` | Matching engine |
| `sfdc-ownership-router` | Ownership assignment |
| `sfdc-lead-auto-converter` | Lead conversion (Tier 4) |
| `sfdc-enrichment-manager` | Data enrichment |
| `sfdc-upsert-error-handler` | Error queue management |

### Configuration Files

| File | Purpose |
|------|---------|
| `config/upsert-field-mappings.json` | Field mapping rules |
| `instances/{org}/upsert-config.json` | Org-specific settings |
| `instances/{org}/enrichment-providers.json` | Provider configuration |
| `instances/{org}/lead-conversion-rules.json` | Conversion criteria |
| `instances/{org}/ownership-config.json` | Assignment strategies |

## Runbook Sections

| Section | Topics |
|---------|--------|
| [01 - Fundamentals](01-upsert-fundamentals.md) | Upsert vs Insert vs Update, object relationships |
| [02 - Matching Strategies](02-matching-strategies.md) | Unique ID, fuzzy, domain matching |
| [03 - Field Mapping](03-field-mapping-rules.md) | Transformations, null handling |
| [04 - Ownership Routing](04-ownership-routing.md) | Assignment rules, territories |
| [05 - Enrichment](05-enrichment-waterfall.md) | Provider configuration, refresh |
| [06 - Lead Conversion](06-lead-auto-conversion.md) | Match-then-convert workflow |
| [07 - Error Handling](07-error-handling.md) | Retry strategies, escalation |
| [08 - Audit Logging](08-audit-logging.md) | Compliance, transparency |
| [09 - Troubleshooting](09-troubleshooting.md) | Common issues, solutions |

## Architecture

```
sfdc-upsert-orchestrator (Master - Tier 3)
├── sfdc-upsert-matcher (Matching Engine)
│   └── Uses: upsert-matcher.js, lead-to-account-matcher.js
├── sfdc-ownership-router (Assignment Logic)
├── sfdc-lead-auto-converter (Lead Conversion - Tier 4)
├── sfdc-enrichment-manager (Data Enrichment)
├── sfdc-upsert-error-handler (Error Queue)
└── Existing: sfdc-dedup-safety-copilot (Type 1/2 Prevention)
```

## Key Principles

### 1. Match Before Create
Always check for existing records using multi-pass matching before creating new ones.

### 2. Fail Fast, Recover Gracefully
Non-critical operations (enrichment, notifications) should not block core upsert.

### 3. Idempotency
Every operation should be safely repeatable without duplicate effects.

### 4. Transparency
All operations must be logged with user-visible audit trails.

### 5. Type 1/2 Error Prevention
- **Type 1 (False Positive)**: Incorrectly matching distinct records
- **Type 2 (False Negative)**: Failing to match the same record

Balance matching thresholds to minimize both error types.

## Getting Started

1. **Read the Fundamentals** - Start with section 01 to understand core concepts
2. **Configure Matching** - Review section 02 and set appropriate thresholds
3. **Set Up Field Mappings** - Configure transformations in section 03
4. **Test in Sandbox** - Always test upsert operations in sandbox first
5. **Monitor Error Queue** - Set up alerts for escalated errors

## Related Documentation

- [Data Import Manager](../data-quality-operations/01-data-import-export.md)
- [Deduplication Operations](../data-quality-operations/02-deduplication.md)
- [Lead Conversion Diagnostics](../../scripts/lib/lead-conversion-diagnostics.js)

---
Last Updated: 2026-01-23
