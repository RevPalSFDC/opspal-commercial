---
name: enablement
description: Sales enablement coordination including training paths, skill gap analysis, and content recommendations
argument-hint: "<assess|training|content|onboard> [--rep <id>] [--segment <name>]"
arguments:
  - name: action
    description: Action to perform (assess, training, content, onboard)
    required: false
  - name: rep
    description: Specific rep user ID for individual assessment
    required: false
  - name: segment
    description: Filter by segment or role
    required: false
  - name: org
    description: Salesforce org alias
    required: false
---

# Sales Enablement Command

Coordinate sales enablement activities including skill assessments, training path recommendations, content effectiveness tracking, and onboarding.

## Usage

```bash
/enablement assess                          # Team skill assessment
/enablement assess --rep 005XXXX            # Individual assessment
/enablement training --segment enterprise   # Training paths for segment
/enablement content                         # Content effectiveness report
/enablement onboard --rep 005XXXX           # New rep onboarding plan
```

## What This Does

1. **Skill Assessment**: Evaluates competencies across the team
2. **Training Paths**: Recommends personalized learning journeys
3. **Content Analysis**: Tracks content usage and effectiveness
4. **Onboarding**: Generates ramp plans for new reps

## Execution

Use the sales-enablement-coordinator agent:

```javascript
Task({
  subagent_type: 'opspal-core:sales-enablement-coordinator',
  prompt: `Sales enablement: ${action || 'assess'}. Rep: ${rep || 'team'}. Segment: ${segment || 'all'}. Org: ${org || 'default'}`
});
```

## Output

Depending on action:
- **Assess**: Skill matrix, gap analysis, recommendations
- **Training**: Personalized learning paths with resources
- **Content**: Usage metrics, effectiveness scores, recommendations
- **Onboard**: Week-by-week ramp plan with milestones

## Related Commands

- `/sales-playbook` - Sales playbook generation
- `/win-loss` - Win patterns for coaching
