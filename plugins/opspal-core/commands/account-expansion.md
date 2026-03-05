---
name: account-expansion
description: Identify and score cross-sell/upsell opportunities for existing customers
argument-hint: "[--segment <name>] [--account <account-id>] [--top <n>]"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
arguments:
  - name: account
    description: Specific account ID to analyze
    required: false
  - name: segment
    description: Filter by segment (enterprise, mid-market, smb)
    required: false
  - name: org
    description: Salesforce org alias
    required: false
  - name: top
    description: Number of top opportunities to return
    required: false
---

# Account Expansion Command

Identify, score, and prioritize expansion opportunities across your customer base including upsell, cross-sell, and seat expansion.

## Usage

```bash
/account-expansion                           # All customers
/account-expansion --segment enterprise      # Enterprise only
/account-expansion --account 001XXXX         # Specific account
/account-expansion --top 20                  # Top 20 opportunities
```

## What This Does

1. **Detects expansion signals** (usage, growth, engagement)
2. **Identifies opportunity types** (seat, tier, cross-sell)
3. **Performs whitespace analysis** to find product gaps
4. **Scores and ranks accounts** by expansion potential
5. **Generates campaign recommendations** for outreach

## Execution

Use the account-expansion-orchestrator agent:

```javascript
Task({
  subagent_type: 'opspal-core:account-expansion-orchestrator',
  prompt: `Identify expansion opportunities. Account: ${account || 'all'}. Segment: ${segment || 'all'}. Top: ${top || '25'}. Org: ${org || 'default'}`
});
```

## Output

The analysis includes:
- **Expansion scorecard**: Score and potential value per account
- **Opportunity breakdown**: By type (seat, tier, cross-sell)
- **Signal analysis**: What's driving expansion indicators
- **Whitespace report**: Product penetration gaps
- **Campaign recommendations**: Targeted outreach strategies

## Related Commands

- `/cs-ops` - Customer success operations
- `/pipeline-health` - Overall pipeline analysis
- `/forecast` - Revenue forecasting with expansion
