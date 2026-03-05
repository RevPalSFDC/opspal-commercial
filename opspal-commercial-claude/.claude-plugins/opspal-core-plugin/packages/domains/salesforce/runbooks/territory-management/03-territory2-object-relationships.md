# Runbook 3: Territory2 Object Relationships

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Developers

---

## Table of Contents

1. [Object Relationships](#object-relationships)
2. [Required Fields](#required-fields)
3. [Field Reference](#field-reference)
4. [Querying Relationships](#querying-relationships)
5. [Cascade Behaviors](#cascade-behaviors)

---

## Object Relationships

### Entity Relationship Diagram

```
┌─────────────────────────┐
│    Territory2Model      │
│    (Container)          │
└───────────┬─────────────┘
            │ 1:many
            │
┌───────────┴─────────────┐     ┌─────────────────────┐
│      Territory2         │────→│   Territory2Type    │
│   (Individual area)     │ many:1│  (Category)        │
└───────────┬─────────────┘     └─────────────────────┘
            │
            │ 1:many (self-reference for hierarchy)
            │
            │         ┌────────────────────────────────┐
            │         │ UserTerritory2Association      │
            ├────────→│ (User assignment)              │
            │         └────────────────────────────────┘
            │         ┌────────────────────────────────┐
            │         │ ObjectTerritory2Association    │
            ├────────→│ (Account/Lead assignment)      │
            │         └────────────────────────────────┘
            │         ┌────────────────────────────────┐
            │         │ Territory2ObjectExclusion      │
            └────────→│ (Assignment block)             │
                      └────────────────────────────────┘
```

### Relationship Summary

| Parent | Child | Relationship | Description |
|--------|-------|--------------|-------------|
| Territory2Model | Territory2 | 1:many | Model contains territories |
| Territory2 | Territory2 | 1:many | Hierarchy (parent-child) |
| Territory2Type | Territory2 | 1:many | Type categorizes territories |
| Territory2 | UserTerritory2Association | 1:many | Territory has users |
| Territory2 | ObjectTerritory2Association | 1:many | Territory has accounts |
| Territory2 | Territory2ObjectExclusion | 1:many | Territory has exclusions |
| User | UserTerritory2Association | 1:many | User in territories |
| Account | ObjectTerritory2Association | 1:many | Account in territories |

---

## Required Fields

### Territory2Model

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Display name |
| DeveloperName | Yes | API name, unique |

### Territory2

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Display name |
| DeveloperName | Yes | API name, unique per model |
| Territory2ModelId | Yes | Parent model |
| Territory2TypeId | Yes | Territory category |
| AccountAccessLevel | Yes | "Read", "Edit", or "All" |
| OpportunityAccessLevel | Yes | "None", "Read", or "Edit" |
| CaseAccessLevel | Yes | "None", "Read", or "Edit" |

### UserTerritory2Association

| Field | Required | Notes |
|-------|----------|-------|
| UserId | Yes | Must be active user |
| Territory2Id | Yes | Valid territory |

### ObjectTerritory2Association

| Field | Required | Notes |
|-------|----------|-------|
| ObjectId | Yes | Account or Lead ID |
| Territory2Id | Yes | Valid territory |
| AssociationCause | Yes | "Territory2Manual", "Territory2Rule", or "Territory2Api" |

---

## Field Reference

### Territory2Model Fields

```sql
SELECT
    Id,
    Name,
    DeveloperName,
    State,              -- Planning, Active, Archived
    Description,
    CreatedDate,
    CreatedById,
    LastModifiedDate,
    LastModifiedById
FROM Territory2Model
```

### Territory2 Fields

```sql
SELECT
    Id,
    Name,
    DeveloperName,
    Territory2ModelId,
    Territory2TypeId,
    ParentTerritory2Id,
    AccountAccessLevel,         -- Read, Edit, All
    OpportunityAccessLevel,     -- None, Read, Edit
    CaseAccessLevel,            -- None, Read, Edit
    ContactAccessLevel,         -- None, Read, Edit
    ForecastUserId,
    Description,
    CreatedDate,
    LastModifiedDate
FROM Territory2
```

### Territory2Type Fields

```sql
SELECT
    Id,
    MasterLabel,
    DeveloperName,
    Priority,           -- Lower = higher priority
    Description
FROM Territory2Type
```

### UserTerritory2Association Fields

```sql
SELECT
    Id,
    UserId,
    Territory2Id,
    RoleInTerritory2,   -- Optional picklist
    IsActive,
    CreatedDate,
    LastModifiedDate
FROM UserTerritory2Association
```

### ObjectTerritory2Association Fields

```sql
SELECT
    Id,
    ObjectId,           -- Account or Lead Id
    Territory2Id,
    AssociationCause,   -- Territory2Manual, Territory2Rule, Territory2Api
    CreatedDate,
    LastModifiedDate
FROM ObjectTerritory2Association
```

### Territory2ObjectExclusion Fields

```sql
SELECT
    Id,
    ObjectId,           -- Account or Lead Id
    Territory2Id,
    CreatedDate
FROM Territory2ObjectExclusion
```

---

## Querying Relationships

### Get All Territories in a Model

```sql
SELECT Id, Name, DeveloperName, ParentTerritory2Id,
       Territory2TypeId, AccountAccessLevel
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
ORDER BY ParentTerritory2Id NULLS FIRST, Name
```

### Get Territory Hierarchy (with Type)

```sql
SELECT t.Id, t.Name, t.DeveloperName, t.ParentTerritory2Id,
       t.AccountAccessLevel, tt.MasterLabel TypeName, tt.Priority
FROM Territory2 t
JOIN Territory2Type tt ON t.Territory2TypeId = tt.Id
WHERE t.Territory2ModelId = '<model_id>'
```

### Get Users in a Territory

```sql
SELECT uta.Id, u.Name, u.Email, uta.RoleInTerritory2
FROM UserTerritory2Association uta
JOIN User u ON uta.UserId = u.Id
WHERE uta.Territory2Id = '<territory_id>'
```

### Get Accounts in a Territory

```sql
SELECT ota.Id, a.Name, ota.AssociationCause
FROM ObjectTerritory2Association ota
JOIN Account a ON ota.ObjectId = a.Id
WHERE ota.Territory2Id = '<territory_id>'
```

### Get All Territories for a User

```sql
SELECT t.Id, t.Name, uta.RoleInTerritory2
FROM UserTerritory2Association uta
JOIN Territory2 t ON uta.Territory2Id = t.Id
WHERE uta.UserId = '<user_id>'
```

### Get All Territories for an Account

```sql
SELECT t.Id, t.Name, ota.AssociationCause
FROM ObjectTerritory2Association ota
JOIN Territory2 t ON ota.Territory2Id = t.Id
WHERE ota.ObjectId = '<account_id>'
```

### Get Child Territories

```sql
SELECT Id, Name, DeveloperName
FROM Territory2
WHERE ParentTerritory2Id = '<parent_id>'
```

### Get Root Territories

```sql
SELECT Id, Name, DeveloperName
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
AND ParentTerritory2Id = null
```

### Get Territories Without Users

```sql
SELECT Id, Name
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
AND Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)
```

### Get Territories Without Accounts

```sql
SELECT Id, Name
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
AND Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)
```

---

## Cascade Behaviors

### Model Deletion

| Related Object | Behavior |
|----------------|----------|
| Territory2 | Cascade delete |
| Territory2Rule | Cascade delete |

**Warning**: Deleting a model deletes ALL territories and rules.

### Territory Deletion

| Related Object | Behavior |
|----------------|----------|
| Child Territory2 | **Blocked** - must delete children first |
| UserTerritory2Association | **Blocked** - must remove first |
| ObjectTerritory2Association | **Blocked** - must remove first |
| Territory2ObjectExclusion | Cascade delete |

**Safe Deletion Order**:
1. Remove user assignments
2. Remove account assignments
3. Delete child territories (bottom-up)
4. Delete territory

### User Deactivation

| Related Object | Behavior |
|----------------|----------|
| UserTerritory2Association | **Auto-deleted** |

When a user is deactivated, their territory associations are automatically removed.

### Account Deletion

| Related Object | Behavior |
|----------------|----------|
| ObjectTerritory2Association | Cascade delete |
| Territory2ObjectExclusion | Cascade delete |

---

## Cross-Model Constraints

- ParentTerritory2Id must reference a territory in the **same model**
- A territory cannot be moved between models
- Users can be assigned to territories in **any model**
- Accounts can be assigned to territories in **any model**

---

## Related Runbooks

- [Runbook 1: Territory Fundamentals](01-territory-fundamentals.md)
- [Runbook 2: Designing Territory Models](02-designing-territory-models.md)
- [Runbook 4: Hierarchy Configuration](04-hierarchy-configuration.md)
