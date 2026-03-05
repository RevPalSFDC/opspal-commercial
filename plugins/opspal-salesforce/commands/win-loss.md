---
name: win-loss
description: Analyze closed deals to extract win/loss patterns and competitive intelligence
argument-hint: "[period] [--competitor <name>] [--org <alias>]"
arguments:
  - name: period
    description: Analysis period (this_quarter, last_quarter, this_year, last_year)
    required: false
  - name: org
    description: Salesforce org alias
    required: false
  - name: competitor
    description: Focus on specific competitor
    required: false
---

# Win/Loss Analysis Command

Analyze closed deals to identify success factors, competitive patterns, and areas for improvement.

## Usage

```bash
/win-loss                                # Current quarter analysis
/win-loss last_year                      # Full year analysis
/win-loss --competitor Acme              # Focus on specific competitor
/win-loss --org production --period this_year
```

## What This Does

1. **Extracts win/loss data** from closed opportunities
2. **Calculates win rates** overall and by competitor
3. **Identifies success factors** from won deals
4. **Analyzes loss reasons** with categorization
5. **Detects trends** over time

## Execution

Use the win-loss-analyzer agent:

```javascript
Task({
  subagent_type: 'opspal-salesforce:win-loss-analyzer',
  prompt: `Analyze win/loss patterns for ${period || 'this_quarter'}. Org: ${org || 'default'}. Competitor focus: ${competitor || 'all'}`
});
```

## Output

The analysis includes:
- **Win rate metrics**: Overall, by segment, by rep
- **Competitive analysis**: Win rates against each competitor
- **Success factors**: Common characteristics of won deals
- **Loss categorization**: Grouped reasons with frequency
- **Trend analysis**: How metrics are changing over time

## Related Commands

- `/pipeline-health` - Current pipeline analysis
- `/sales-playbook` - Playbook recommendations
- `/forecast` - Revenue forecasting
