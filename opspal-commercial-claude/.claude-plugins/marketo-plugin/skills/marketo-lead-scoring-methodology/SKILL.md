---
name: marketo-lead-scoring-methodology
description: Marketo lead scoring model design methodology with two-dimensional scoring (behavior + demographic). Use when designing scoring models, creating behavioral trigger campaigns, building demographic batch campaigns, implementing score decay, setting MQL thresholds, or auditing scoring effectiveness.
allowed-tools: Read, Grep, Glob
---

# Marketo Lead Scoring Methodology

## When to Use This Skill

- Designing new lead scoring models
- Creating behavioral trigger campaigns (email, web, form, event)
- Building demographic batch campaigns (job title, industry, company size)
- Implementing score decay for inactive leads
- Setting MQL threshold configurations
- Auditing and validating scoring model effectiveness

## Quick Reference

### Two-Dimensional Scoring Model

```
LEAD SCORE = BEHAVIOR SCORE + DEMOGRAPHIC SCORE

Behavior Score (Engagement)     Demographic Score (Fit)
├── Email engagement            ├── Job title match
├── Web activity                ├── Industry match
├── Form submissions            ├── Company size
├── Content downloads           ├── Geography
├── Event attendance            └── Technology stack
└── Social engagement

Typical Range: 0-100 each
MQL Example: Behavior >= 50 AND Demographic >= 40
```

### Score Field Configuration

| Field | Type | Purpose |
|-------|------|---------|
| `Score` | Score | Overall lead score (built-in) |
| `Behavior Score` | Integer | Engagement tracking |
| `Demographic Score` | Integer | Fit tracking |
| `Lead Status` | String | Lifecycle stage |

## Detailed Documentation

See supporting files:
- `behavioral-scoring.md` - Engagement scoring rules
- `demographic-scoring.md` - Fit scoring rules
- `decay-patterns.md` - Inactivity decay rules
- `threshold-design.md` - MQL threshold configuration
