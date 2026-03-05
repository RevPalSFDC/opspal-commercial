---
name: automation-building-patterns
description: Salesforce automation feasibility analysis and building patterns. Use when creating flows, process builders, workflow rules, approval processes, or analyzing automation feasibility. Provides capability matrix, feasibility scoring, template library, and CLI commands for automation development.
allowed-tools: Read, Grep, Glob
---

# Automation Building Patterns

## When to Use This Skill

- Analyzing automation feasibility before starting work
- Choosing between Flow types (Auto-launched, Screen, Scheduled)
- Creating flows using templates or natural language
- Understanding what can vs cannot be automated
- Setting user expectations for automation projects
- Building complex multi-step automations

## Quick Reference

### Automation Capability Matrix

| Request Type | Feasibility | Approach |
|--------------|-------------|----------|
| Auto-launched Flow | 100% automated | Record-triggered, scheduled - fully API deployable |
| Screen Flow | 67% hybrid | Logic automated, UI requires manual configuration |
| Quick Action | 0% automated | Cannot automate field mappings via API |
| Validation Rule | 100% automated | Formula-based - fully deployable |
| Approval Process | 0% automated | UI-only configuration |
| Formula Fields | 100% automated | Fully deployable via metadata |
| Permission Sets | 100% automated | Fully deployable |
| Reports & Dashboards | 100% automated | Fully deployable |
| Auto-fix validation issues | ✅ Yes (v3.56.0) | 70-80% time savings, 8 patterns supported |

### Feasibility Decision Tree

```
Is it a Screen Flow?
├─ YES → 67% hybrid (logic automated, UI manual)
└─ NO → Is it Quick Action or Approval Process?
    ├─ YES → 0% automated (UI only)
    └─ NO → 100% automated (fully deployable)
```

### Flow CLI Quick Commands

```bash
# Create Flow
flow create MyFlow --type Record-Triggered --object Account

# Add elements with natural language
flow add MyFlow.xml "Add decision called Status_Check if Status equals Active"

# Validate
flow validate MyFlow.xml --best-practices --governor-limits

# Deploy
flow deploy MyFlow.xml --activate --dry-run
```

### Auto-Fix Integration (v3.56.0)

**Automatic remediation** for 8 common Flow patterns:
- Hard-coded IDs → Formula variables
- Unused variables → Removed
- Missing fault paths → Default error handlers
- Outdated API versions → Updated to v62.0
- Missing descriptions → Template descriptions
- Copy naming → Descriptive names
- Unconnected elements → Removed
- Trigger order → Set to 1000

**Usage**:
```bash
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run  # Preview
node scripts/lib/flow-validator.js MyFlow.xml --auto-fix            # Apply
```

**Time Savings**: 70-80% reduction in manual correction time (20-45 min per Flow)

**See**: `skills/flow-scanner-integration/SKILL.md` for complete reference

## Detailed Documentation

See supporting files:
- `feasibility-rules.md` - When to use which automation type
- `capability-matrix.md` - Full capability reference
- `best-practices.md` - Design patterns and anti-patterns
- `testing-patterns.md` - Test coverage requirements
