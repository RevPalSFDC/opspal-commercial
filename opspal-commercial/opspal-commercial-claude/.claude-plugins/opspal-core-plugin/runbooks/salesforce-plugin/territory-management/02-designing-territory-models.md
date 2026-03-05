# Runbook 2: Designing Territory Models

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Sales Operations, Consultants

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Pattern Selection](#pattern-selection)
3. [Hierarchy Depth](#hierarchy-depth)
4. [Territory Types](#territory-types)
5. [Access Level Strategy](#access-level-strategy)
6. [Design Worksheet](#design-worksheet)

---

## Design Principles

### 1. Start Simple

Begin with the minimum viable hierarchy. You can always add complexity later.

**Recommendation**: 3-4 levels for most organizations.

### 2. Align with Business

Territory structure should reflect how the business operates:
- Sales team organization
- Go-to-market strategy
- Reporting requirements

### 3. Plan for Change

Design for flexibility:
- Use meaningful DeveloperNames
- Document decisions
- Consider seasonal changes (fiscal year)

### 4. Balance Coverage

Each territory should have reasonable:
- Account count
- Revenue potential
- User assignments

---

## Pattern Selection

### Decision Matrix

| Characteristic | Geographic | Account-Based | Hybrid |
|----------------|------------|---------------|--------|
| Primary segmentation | Location | Size/Industry | Both |
| Field vs Inside | Field heavy | Either | Mixed |
| Named accounts | Few | Many | Some |
| Overlay teams | Optional | Common | Required |
| Complexity | Low | Medium | High |

### Pattern 1: Geographic

**Best for**: Field sales, regional coverage

```
Global
├── North America
│   ├── US West
│   └── US East
├── EMEA
│   ├── UK
│   └── Germany
└── APAC
    └── ANZ
```

### Pattern 2: Account-Based

**Best for**: Enterprise, named accounts

```
Enterprise
├── Strategic
│   └── Fortune 100
├── Major
│   └── Fortune 500
└── Growth
    └── Emerging
```

### Pattern 3: Hybrid

**Best for**: Large organizations, multiple motions

```
Global
├── NA Enterprise
│   └── NA Strategic
├── NA Commercial
│   └── US West
└── Overlays
    └── Product Specialists
```

---

## Hierarchy Depth

### Recommended Depths

| Pattern | Recommended | Maximum |
|---------|-------------|---------|
| Geographic | 3-4 | 5 |
| Account-Based | 2-3 | 4 |
| Hybrid | 3-5 | 6 |

### Depth Considerations

**Too Shallow (1-2 levels)**:
- Limited reporting granularity
- Difficult to target assignments
- Poor access control

**Too Deep (6+ levels)**:
- Performance impact on sharing
- Complex maintenance
- Confusing for users

### Depth by Use Case

| Use Case | Depth |
|----------|-------|
| Small org (<50 users) | 2-3 |
| Medium org (50-500 users) | 3-4 |
| Large org (500+ users) | 4-5 |
| Global enterprise | 4-6 |

---

## Territory Types

### Standard Type Set

| Type | Priority | Use |
|------|----------|-----|
| Global | 0 | Top-level only |
| Region | 1 | Geographic regions |
| Country | 2 | Country-level |
| Segment | 3 | Account segmentation |
| Named | 4 | Named accounts |
| Overlay | 10 | Specialist coverage |

### Priority Rules

- **Lower number = Higher priority**
- Used when account matches multiple rules
- Determines "winning" territory for reports

### Creating Types

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Territory2Type xmlns="http://soap.sforce.com/2006/04/metadata">
    <developerName>Region</developerName>
    <masterLabel>Region</masterLabel>
    <priority>1</priority>
    <description>Geographic region territory</description>
</Territory2Type>
```

---

## Access Level Strategy

### By Hierarchy Level

| Level | Account | Opp | Case | Rationale |
|-------|---------|-----|------|-----------|
| Root | Read | Read | Read | Visibility only |
| Region | Edit | Read | Read | Ownership, limited opp access |
| Leaf | Edit | Edit | Edit | Full working access |

### By Role Type

| Role | Account | Opp | Case |
|------|---------|-----|------|
| Executive | Read | Read | Read |
| Manager | Edit | Edit | Read |
| Rep | Edit | Edit | Edit |
| Support | Read | Read | Edit |

### Access Level Values

| Value | Account Behavior | Opp/Case Behavior |
|-------|------------------|-------------------|
| None | N/A | No access |
| Read | View only | View only |
| Edit | View + Edit | View + Edit |
| All | Full control | N/A |

---

## Design Worksheet

### Step 1: Define Goals

- [ ] What problem does territory management solve?
- [ ] What are the reporting requirements?
- [ ] How will territories align with quotas?
- [ ] How often will structure change?

### Step 2: Map Current State

- [ ] How is sales team organized today?
- [ ] What are the current account assignment rules?
- [ ] How many sales reps?
- [ ] How many accounts?

### Step 3: Choose Pattern

- [ ] Geographic (field sales focus)
- [ ] Account-Based (named accounts focus)
- [ ] Hybrid (both)
- [ ] Other: ____________

### Step 4: Define Levels

| Level | Name | Type | Count Est. |
|-------|------|------|------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |

### Step 5: Define Types

| Type | Priority | Purpose |
|------|----------|---------|
| | | |
| | | |
| | | |

### Step 6: Define Access Levels

| Level | Account | Opp | Case | Contact |
|-------|---------|-----|------|---------|
| L1 | | | | |
| L2 | | | | |
| L3 | | | | |

### Step 7: Identify Assignment Rules

| Rule Name | Criteria | Target Territory |
|-----------|----------|------------------|
| | | |
| | | |

### Step 8: Plan User Assignments

| Territory Pattern | User Roles | Est. Count |
|-------------------|------------|------------|
| | | |
| | | |

---

## Design Review Checklist

- [ ] Structure reflects business organization
- [ ] Hierarchy depth is appropriate (3-5 levels)
- [ ] Types have logical priorities
- [ ] Access levels follow least-privilege
- [ ] Assignment rules are comprehensive
- [ ] Naming conventions are consistent
- [ ] Documentation is complete
- [ ] Stakeholders have reviewed

---

## Common Design Mistakes

| Mistake | Impact | Solution |
|---------|--------|----------|
| Too deep hierarchy | Performance issues | Flatten to 4-5 levels |
| Unclear naming | Maintenance difficulty | Use consistent convention |
| Too many types | Confusion | Consolidate to 5-7 types |
| Same access everywhere | Over-permissioning | Vary by level |
| No overlay strategy | Missed coverage | Add overlay type |

---

## Related Runbooks

- [Runbook 1: Territory Fundamentals](01-territory-fundamentals.md)
- [Runbook 3: Territory2 Object Relationships](03-territory2-object-relationships.md)
- [Runbook 4: Hierarchy Configuration](04-hierarchy-configuration.md)
