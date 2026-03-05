---
name: marketo-sfdc-integration-patterns
description: Marketo-Salesforce synchronization patterns and best practices. Use when configuring sync settings, troubleshooting sync errors, validating field mappings, managing lead/contact conversion, resolving duplicate issues, or monitoring sync health.
allowed-tools: Read, Grep, Glob
---

# Marketo SFDC Integration Patterns

## When to Use This Skill

- Configuring Salesforce-Marketo sync settings
- Troubleshooting sync errors and failures
- Validating field mappings between systems
- Managing lead/contact conversion rules
- Resolving duplicate record issues
- Monitoring sync health and latency

## Quick Reference

### Sync Direction

```
Marketo ←→ Salesforce

Lead/Contact:
- New Marketo lead → Creates SFDC Lead
- SFDC Lead/Contact update → Updates Marketo lead
- Marketo lead update → Updates SFDC Lead/Contact

Opportunities:
- SFDC Opportunity → Read into Marketo (one-way)

Campaigns:
- Marketo Program → SFDC Campaign (configurable)
- Program membership → Campaign membership
```

### Sync Timing

| Sync Type | Frequency | Notes |
|-----------|-----------|-------|
| Lead/Contact sync | ~5 minutes | Near real-time |
| Activity sync | 5-10 minutes | Volume dependent |
| Campaign sync | On demand | Triggered by status |
| Opportunity sync | Daily | Configurable schedule |

### Common Sync Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Required field missing | SFDC validation rule | Add field validation before sync |
| Duplicate detected | SFDC duplicate rule | Merge or update existing |
| Owner not found | Invalid Owner ID | Use queue or default owner |
| Record locked | SFDC workflow/process | Retry after delay |

## Detailed Documentation

See supporting files:
- `sync-methodology.md` - Sync configuration patterns
- `field-mapping.md` - Field mapping best practices
- `conflict-resolution.md` - Handling sync conflicts
- `error-recovery.md` - Error diagnosis and resolution
