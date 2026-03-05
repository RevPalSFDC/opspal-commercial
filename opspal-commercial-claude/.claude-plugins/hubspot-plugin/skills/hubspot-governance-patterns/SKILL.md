---
name: hubspot-governance-patterns
description: HubSpot portal governance and compliance enforcement patterns. Use when establishing naming conventions, managing user permissions, enforcing data governance policies, implementing change management workflows, or ensuring regulatory compliance (GDPR, CCPA). Provides governance rules, permission matrices, and compliance checklists.
allowed-tools: Read, Grep, Glob
---

# HubSpot Governance Patterns

## When to Use This Skill

- Establishing portal naming conventions
- Configuring user permissions and access control
- Implementing data governance policies
- Setting up change management workflows
- Ensuring GDPR/CCPA compliance
- Creating audit trails and compliance reports

## Quick Reference

### Core Governance Areas

| Area | Purpose | Key Artifacts |
|------|---------|---------------|
| Naming Conventions | Consistent asset naming | Naming guide |
| Permission Model | Access control | Permission matrix |
| Data Governance | Data quality rules | Validation rules |
| Change Management | Controlled changes | Approval workflows |
| Compliance | Regulatory adherence | Compliance checklist |

### Permission Levels

| Level | Access | Typical Roles |
|-------|--------|---------------|
| Super Admin | Full portal access | IT, RevOps Lead |
| Admin | Most settings, no billing | Operations |
| Manager | Team management, reports | Team Leads |
| User | Standard features | Sales, Marketing |
| Read-Only | View only | Executives, Partners |

### Data Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| email | Valid format | "Enter valid email" |
| phone | E.164 format | "Use +1XXXXXXXXXX" |
| company_name | Required | "Company required" |
| lead_source | From list | "Select valid source" |

## Detailed Documentation

See supporting files:
- `naming-conventions.md` - Naming standards
- `permission-model.md` - Access control patterns
- `audit-rules.md` - Governance checks
- `compliance-patterns.md` - Regulatory compliance
