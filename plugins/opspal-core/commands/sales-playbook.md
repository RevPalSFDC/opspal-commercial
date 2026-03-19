---
name: sales-playbook
description: Generate segment-specific sales playbooks with next-best-action recommendations
argument-hint: "[segment] [--deal <id>] [--org <alias>]"
arguments:
  - name: segment
    description: Target segment (enterprise, mid-market, smb)
    required: false
  - name: deal
    description: Specific opportunity ID for deal coaching
    required: false
  - name: org
    description: Salesforce org alias
    required: false
---

# Sales Playbook Command

Generate targeted sales playbooks and next-best-action recommendations based on segment, deal context, and historical patterns.

## Usage

```bash
/sales-playbook                           # Generate for all segments
/sales-playbook enterprise                # Enterprise playbook
/sales-playbook --deal 006XXXXXXXXXXXX    # Deal-specific coaching
/sales-playbook mid-market --org prod     # Mid-market with org
```

## What This Does

1. **Detects segment** from deal or specification
2. **Selects appropriate playbook** based on context
3. **Analyzes deal signals** (engagement, stakeholders, timeline)
4. **Generates next-best-actions** prioritized by impact
5. **Provides coaching recommendations** based on win patterns

## Execution

Use the sales-playbook-orchestrator agent:

```javascript
Agent({
  subagent_type: 'opspal-core:sales-playbook-orchestrator',
  prompt: `Generate sales playbook for segment: ${segment || 'auto-detect'}. Deal ID: ${deal || 'none'}. Org: ${org || 'default'}`
});
```

## Output

The playbook includes:
- **Segment profile**: Characteristics, typical cycle, key metrics
- **Engagement strategy**: Stakeholder map, meeting cadence
- **Objection handling**: Common objections with responses
- **Next-best-actions**: Prioritized action items
- **Deal coaching**: Specific recommendations if deal provided

## Related Commands

- `/win-loss` - Historical win patterns
- `/pipeline-health` - Current pipeline state
- `/account-expansion` - Expansion opportunities
