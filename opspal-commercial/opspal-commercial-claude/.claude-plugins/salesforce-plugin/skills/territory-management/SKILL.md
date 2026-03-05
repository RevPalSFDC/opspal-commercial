---
name: territory-management
description: Salesforce Territory2 management methodology. Use when managing territory models, hierarchies, user assignments, account assignments, or territory planning.
allowed-tools: Read, Grep, Glob
---

# Territory Management Skill

## When to Use This Skill

Invoke this skill when the user mentions:
- Territory management, territory planning
- Territory2, Territory2Model, Territory2Type
- Territory hierarchy, territory structure
- User territory assignment, account territory assignment
- Territory rules, assignment rules
- Territory model activation, territory model lifecycle

## Quick Reference

### Territory2 Object Hierarchy

```
Territory2Model (Container)
├── Territory2Type (Category/Priority)
├── Territory2 (Individual territories)
│   ├── UserTerritory2Association (User assignments)
│   └── ObjectTerritory2Association (Account assignments)
├── Territory2Rule (Assignment rules)
└── Territory2ObjectExclusion (Assignment blocks)
```

### Model States

| State | Modifiable | Active | Notes |
|-------|------------|--------|-------|
| Planning | Yes | No | Default for new models |
| Active | Limited | Yes | Only 1 per org |
| Archived | No | No | Read-only, permanent |
| Cloning | No | No | Temporary during clone |

### Access Level Values

| Level | Account | Opp/Case/Contact |
|-------|---------|------------------|
| `None` | N/A | No access |
| `Read` | View only | View only |
| `Edit` | View + Edit | View + Edit |
| `All` | Full control | N/A |

### Assignment Causes

| Cause | Description |
|-------|-------------|
| `Territory2Manual` | Manual assignment |
| `Territory2Rule` | Assignment rule |
| `Territory2Api` | API/programmatic |

## 7-Phase Methodology

| Phase | Focus | Key Actions |
|-------|-------|-------------|
| 0. Pre-flight | Validation | Check permissions, model state, feature enabled |
| 1. Discovery | Analysis | Query current state, map hierarchy, analyze coverage |
| 2. Design | Planning | Structure hierarchy, define types, plan rules |
| 3. Validation | Verification | Check uniqueness, references, no cycles |
| 4. Checkpoint | Backup | Capture current state for rollback |
| 5. Execution | Deployment | Create/update/delete with chunking |
| 6. Assignment | Routing | Assign users and accounts |
| 7. Verification | Confirmation | Validate deployment, generate report |

## Agent Routing

| Need | Agent | Trigger |
|------|-------|---------|
| Full orchestration | `sfdc-territory-orchestrator` | Complex, multi-phase |
| Read-only analysis | `sfdc-territory-discovery` | Discovery, health check |
| Structure design | `sfdc-territory-planner` | Design, planning |
| Execute changes | `sfdc-territory-deployment` | Deploy, CRUD |
| User/account assignment | `sfdc-territory-assignment` | Assignments |
| Monitor operations | `sfdc-territory-monitor` | Status, logs |

## Complexity Scoring

```javascript
Score = (territories / 100) * 0.2 +
        (depth / 7) * 0.15 +
        (users / 500) * 0.2 +
        (accounts / 10000) * 0.2 +
        (rules / 20) * 0.15 +
        (hasOverlap ? 0.1 : 0)

Thresholds: <0.3 (Simple), 0.3-0.7 (Moderate), >0.7 (Complex)
```

## CLI Commands

```bash
# Query models
sf data query --query "SELECT Id, Name, State FROM Territory2Model" --target-org $ORG

# Create territory
sf data create record --sobject Territory2 \
  --values "Name='...' DeveloperName='...' Territory2ModelId='...' Territory2TypeId='...' AccountAccessLevel='Edit'" \
  --target-org $ORG

# Assign user
sf data create record --sobject UserTerritory2Association \
  --values "UserId='...' Territory2Id='...' RoleInTerritory2='...'" \
  --target-org $ORG

# Assign account
sf data create record --sobject ObjectTerritory2Association \
  --values "ObjectId='...' Territory2Id='...' AssociationCause='Territory2Manual'" \
  --target-org $ORG
```

## Limits

| Limit | Value |
|-------|-------|
| Models per org | 4 |
| Active models | 1 |
| Territories per model | 99,999 |
| Bulk batch size | 200 |

## Related Files

- `methodology.md` - Detailed 7-phase workflow
- `data-quality-protocol.md` - Validation requirements
- `error-taxonomy.md` - Common errors and recovery
- `hierarchy-design-patterns.md` - Design patterns
- `implementation-checklist.md` - Pre-deployment gates
