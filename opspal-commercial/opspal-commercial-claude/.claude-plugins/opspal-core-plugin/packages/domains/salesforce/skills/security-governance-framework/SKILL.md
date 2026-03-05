---
name: security-governance-framework
description: Salesforce security administration governance and common mistake prevention. Use when managing profiles, permission sets, roles, sharing rules, field-level security, or user provisioning. Provides governance rules, LLM error prevention, permission patterns, and audit requirements.
allowed-tools: Read, Grep, Glob
---

# Security Governance Framework

## When to Use This Skill

- Managing profiles and permission sets
- Configuring field-level security (FLS)
- Setting up sharing rules and org-wide defaults
- Provisioning users and assigning permissions
- Running security audits and health checks
- Preventing common LLM security errors

## Quick Reference

### LLM Common Mistakes (CRITICAL)

**NEVER query these objects - they don't exist:**

| Hallucinated Object | Correct Approach |
|---------------------|------------------|
| `RecordTypeVisibility` | Use Metadata API, parse `recordTypeVisibilities` |
| `ApplicationVisibility` | Use Metadata API, parse `applicationVisibilities` |
| `FieldPermission` (direct) | Use Metadata API, parse `fieldPermissions` |
| `ObjectPermission` (direct) | Use Metadata API, parse `objectPermissions` |
| `TabVisibility` | Use Metadata API, parse `tabSettings` |

### Governance Tiers

| Tier | Risk Level | Approval Required |
|------|------------|-------------------|
| Tier 1 | Low | Automated |
| Tier 2 | Medium | Single approver |
| Tier 3 | High | Multiple approvers |
| Tier 4 (Security) | Critical | Security-lead + approver |

### Bulk Operations Performance

| Operation | Sequential | Parallel | Improvement |
|-----------|-----------|----------|-------------|
| Permission checks (20 users) | 50s | 6.2s | 8x faster |
| Security audits (40 profiles) | 60s | 4s | 15x faster |
| Metadata from cache | 24s | 4.8s | 5x faster |
| User provisioning (30 users) | 60s | 5s | 12x faster |

## Detailed Documentation

See supporting files:
- `governance-rules.md` - Security policies and approval workflows
- `permission-patterns.md` - Two-tier permission set architecture
- `llm-common-mistakes.md` - Prevent AI-generated errors
- `audit-checklist.md` - Security review requirements
