# Runbook 1: Territory Management Fundamentals

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Developers, Consultants

---

## Table of Contents

1. [Introduction](#introduction)
2. [Territory2 vs Legacy Territories](#territory2-vs-legacy)
3. [Core Objects](#core-objects)
4. [Data Model](#data-model)
5. [Permissions](#permissions)
6. [Limits](#limits)
7. [Glossary](#glossary)

---

## Introduction

Salesforce Enterprise Territory Management (Territory2) provides a flexible system for organizing sales teams, defining account ownership, and controlling record access based on territory assignments.

### Key Concepts

- **Territory2Model**: Container for an entire territory hierarchy
- **Territory2**: Individual territory within a model
- **Assignments**: Links between users/accounts and territories
- **Assignment Rules**: Automated account-to-territory routing

### When to Use Territory Management

| Use Case | Territory Management? |
|----------|----------------------|
| Geographic sales coverage | Yes |
| Named/strategic accounts | Yes |
| Account-based segmentation | Yes |
| Simple owner-based access | No (use OWD/Sharing) |
| Product-based access only | Maybe (consider sharing rules) |

---

## Territory2 vs Legacy Territories

| Feature | Territory2 (Enterprise) | Legacy |
|---------|------------------------|--------|
| Multiple models | Yes (up to 4) | No |
| Assignment rules | Yes | Limited |
| Multiple territories per account | Yes | No |
| Forecasting integration | Yes | Yes |
| Metadata deployable | Yes | Partial |
| API support | Full | Limited |

**Recommendation**: Always use Enterprise Territory Management (Territory2) for new implementations.

---

## Core Objects

### Territory2Model

The top-level container for a territory hierarchy.

| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Display name |
| DeveloperName | Text | API name (unique) |
| State | Picklist | Planning, Active, Archived |
| Description | Text | Optional description |

**States:**
- **Planning**: Default for new models, fully editable
- **Active**: Live model (only 1 per org), limited edits
- **Archived**: Read-only, permanent

### Territory2

Individual territory within a model.

| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Display name |
| DeveloperName | Text | API name (unique per model) |
| Territory2ModelId | Lookup | Parent model |
| Territory2TypeId | Lookup | Territory category |
| ParentTerritory2Id | Lookup | Parent territory (hierarchy) |
| AccountAccessLevel | Picklist | Read, Edit, All |
| OpportunityAccessLevel | Picklist | None, Read, Edit |
| CaseAccessLevel | Picklist | None, Read, Edit |
| ContactAccessLevel | Picklist | None, Read, Edit |

### Territory2Type

Category/classification for territories.

| Field | Type | Description |
|-------|------|-------------|
| MasterLabel | Text | Display name |
| DeveloperName | Text | API name (unique) |
| Priority | Number | Assignment priority (lower = higher) |

### UserTerritory2Association

Links users to territories.

| Field | Type | Description |
|-------|------|-------------|
| UserId | Lookup | User being assigned |
| Territory2Id | Lookup | Territory |
| RoleInTerritory2 | Picklist | Optional role |

### ObjectTerritory2Association

Links accounts (or leads) to territories.

| Field | Type | Description |
|-------|------|-------------|
| ObjectId | Lookup | Account or Lead ID |
| Territory2Id | Lookup | Territory |
| AssociationCause | Picklist | Manual, Rule, API |

### Territory2ObjectExclusion

Prevents auto-assignment to a territory.

| Field | Type | Description |
|-------|------|-------------|
| ObjectId | Lookup | Account or Lead ID |
| Territory2Id | Lookup | Territory to exclude from |

---

## Data Model

```
Territory2Model (1)
    │
    ├── Territory2Type (many)
    │
    ├── Territory2 (many)
    │       │
    │       ├── Territory2 (children - hierarchy)
    │       │
    │       ├── UserTerritory2Association (many)
    │       │       └── User
    │       │
    │       ├── ObjectTerritory2Association (many)
    │       │       └── Account/Lead
    │       │
    │       └── Territory2ObjectExclusion (many)
    │               └── Account/Lead
    │
    └── Territory2Rule (many)
            └── Territory2RuleItem (many)
```

---

## Permissions

### Manage Territories Permission

Required for all territory management operations.

**Characteristics:**
- All-or-nothing permission
- Cannot be granularly assigned per object
- Typically assigned to administrators

**Check Permission:**
```sql
SELECT Id, PermissionsManageTerritories
FROM PermissionSet
WHERE PermissionsManageTerritories = true
```

### Access Level Behaviors

| Level | Account | Opportunity | Case |
|-------|---------|-------------|------|
| None | N/A | No access | No access |
| Read | View only | View related | View related |
| Edit | View + Edit | View + Edit related | View + Edit related |
| All | Full control | N/A | N/A |

**Note**: "All" includes transfer and delete. Only valid for AccountAccessLevel.

---

## Limits

| Limit | Value |
|-------|-------|
| Territory2Models per org | 4 |
| Active models | 1 |
| Territories per model | 99,999 |
| Territory types | No hard limit |
| Hierarchy depth | No hard limit (recommend ≤7) |
| Bulk API batch size | 200 |

---

## Glossary

| Term | Definition |
|------|------------|
| Territory Model | Container (Territory2Model) for hierarchy |
| Territory | Individual sales area (Territory2) |
| Territory Type | Category with priority (Territory2Type) |
| User Assignment | UserTerritory2Association record |
| Account Assignment | ObjectTerritory2Association record |
| Assignment Rule | Automated account routing (Territory2Rule) |
| Exclusion | Block auto-assignment (Territory2ObjectExclusion) |
| Alignment Log | Assignment job tracking (Territory2AlignmentLog) |
| Model History | Audit trail (Territory2ModelHistory) |

---

## Quick Reference Commands

```bash
# List all models
sf data query --query "SELECT Id, Name, State FROM Territory2Model" --target-org $ORG

# List territories in a model
sf data query --query "SELECT Id, Name, ParentTerritory2Id FROM Territory2 WHERE Territory2ModelId = '<id>'" --target-org $ORG

# Check territory feature enabled
sf data query --query "SELECT Id FROM Territory2Model LIMIT 1" --target-org $ORG
```

---

## Related Runbooks

- [Runbook 2: Designing Territory Models](02-designing-territory-models.md)
- [Runbook 3: Territory2 Object Relationships](03-territory2-object-relationships.md)
- [Runbook 4: Hierarchy Configuration](04-hierarchy-configuration.md)
