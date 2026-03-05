---
name: gtm-scenario
description: Create upside/base/downside revenue scenarios with sensitivity analysis
argument-hint: "[--base-arr <amount>] [--period <period>]"
---

# Scenario Planning Model

Create Upside/Base/Downside revenue scenarios with driver sensitivity analysis.

## Usage

```
/gtm-scenario [options]
```

## Options

- `--base-arr` - Starting ARR for projections (default: current ARR)
- `--period` - Starting period (default: current quarter)
- `--show-drivers` - Display driver assumptions
- `--sensitivity` - Run sensitivity analysis

## Scenario Definitions

### Upside Scenario
- Higher win rates (+5pp)
- Lower churn (-3pp)
- Faster expansion cycles
- Aggressive hiring plan executes

### Base Scenario
- Current run-rate performance
- Historical trends continue
- Planned investments realize

### Downside Scenario
- Increased competitive pressure
- Economic headwinds
- Higher-than-expected churn
- Slower hiring ramp

## Output

### Scenario Comparison
```
Year 5 ARR by Scenario:
- Upside:   $38.4M (+35% vs base)
- Base:     $28.6M
- Downside: $17.5M (-39% vs base)
```

### Key Driver Sensitivity
```
1% change in Churn Rate → $1.2M ARR impact
1% change in Win Rate → $0.8M ARR impact
1% change in ASP → $0.5M ARR impact
```

## Example

```bash
# Create scenarios from current state
/gtm-scenario

# Scenarios with specific starting ARR
/gtm-scenario --base-arr 15000000 --show-drivers
```

---

This command routes to the `gtm-revenue-modeler` agent.
