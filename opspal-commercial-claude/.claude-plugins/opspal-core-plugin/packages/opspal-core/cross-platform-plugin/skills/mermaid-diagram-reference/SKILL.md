---
name: mermaid-diagram-reference
description: Mermaid diagram syntax reference and templates for technical documentation. Use when creating flowcharts, ERD diagrams, sequence diagrams, state diagrams, or architecture visualizations. Provides syntax reference, templates for common use cases, and validation patterns.
allowed-tools: Read, Grep, Glob
---

# Mermaid Diagram Reference

## When to Use This Skill

- Creating flowcharts for process documentation
- Building ERD diagrams for data models
- Designing sequence diagrams for integrations
- Documenting state machines
- Visualizing Salesforce/HubSpot architecture
- Creating technical documentation diagrams

## Quick Reference

### Diagram Types

| Type | Syntax Start | Use Case |
|------|--------------|----------|
| Flowchart | `flowchart TD` | Process flows, decision trees |
| ERD | `erDiagram` | Data models, object relationships |
| Sequence | `sequenceDiagram` | API calls, integrations |
| State | `stateDiagram-v2` | Lifecycle stages, status flows |
| Class | `classDiagram` | Object structure |
| Gantt | `gantt` | Timelines, project plans |

### Direction Options (Flowchart)

| Direction | Meaning |
|-----------|---------|
| TB / TD | Top to Bottom |
| BT | Bottom to Top |
| LR | Left to Right |
| RL | Right to Left |

### Quick Templates

**Simple Flowchart:**
```mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
```

**Basic ERD:**
```mermaid
erDiagram
    ACCOUNT ||--o{ CONTACT : has
    ACCOUNT ||--o{ OPPORTUNITY : owns
    OPPORTUNITY ||--|{ OPPORTUNITY_LINE_ITEM : contains
```

## Detailed Documentation

See supporting files:
- `flowchart-syntax.md` - Flowchart patterns
- `sequence-syntax.md` - Sequence diagrams
- `erd-syntax.md` - Entity relationship diagrams
- `state-syntax.md` - State machine diagrams
