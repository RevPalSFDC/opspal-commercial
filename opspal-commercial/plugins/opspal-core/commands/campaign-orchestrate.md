---
name: campaign-orchestrate
description: Orchestrate campaigns across Salesforce, HubSpot, and Marketo with audience sync and timing coordination
argument-hint: "<plan|sync|launch|status> [--campaign <name>]"
arguments:
  - name: action
    description: Action to perform (plan, sync, launch, status)
    required: false
  - name: campaign
    description: Campaign ID or name
    required: false
  - name: platforms
    description: Target platforms (salesforce,hubspot,marketo)
    required: false
---

# Campaign Orchestration Command

Orchestrate marketing campaigns across multiple platforms with coordinated audiences, content, timing, and attribution.

## Usage

```bash
/campaign-orchestrate plan                  # Create campaign plan
/campaign-orchestrate sync --campaign Q1    # Sync audiences
/campaign-orchestrate launch --campaign Q1  # Launch campaign
/campaign-orchestrate status --campaign Q1  # Check status
```

## What This Does

1. **Campaign Planning**: Define campaign structure across platforms
2. **Audience Sync**: Coordinate audience lists between platforms
3. **Content Distribution**: Map content to platform capabilities
4. **Timing Optimization**: Coordinate send times and sequences
5. **Attribution Tracking**: Cross-platform performance attribution

## Execution

Use the multi-platform-campaign-orchestrator agent:

```javascript
Task({
  subagent_type: 'opspal-core:multi-platform-campaign-orchestrator',
  prompt: `Campaign orchestration: ${action || 'status'}. Campaign: ${campaign || 'current'}. Platforms: ${platforms || 'salesforce,hubspot'}`
});
```

## Output

Depending on action:
- **Plan**: Campaign structure, timeline, platform roles
- **Sync**: Audience counts, sync status, discrepancies
- **Launch**: Pre-launch checklist, activation status
- **Status**: Performance metrics, attribution, recommendations

## Related Commands

- `/exec-dashboard` - Executive performance view
- `/data-migrate` - Data movement between platforms
