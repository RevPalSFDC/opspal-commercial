# Revenue Scenario Planning Templates

Templates and configuration for building revenue scenarios (Base, Upside, Downside).

## Scenario Framework

```
┌─────────────────────────────────────────────────────────────────┐
│                    Scenario Planning Framework                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   UPSIDE     │  │     BASE     │  │  DOWNSIDE    │           │
│  │   (25%)      │  │    (50%)     │  │    (25%)     │           │
│  │              │  │              │  │              │           │
│  │  Optimistic  │  │   Expected   │  │ Conservative │           │
│  │  Assumptions │  │  Assumptions │  │  Assumptions │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│         │                 │                 │                    │
│         └─────────────────┼─────────────────┘                    │
│                           ▼                                      │
│                  ┌──────────────────┐                            │
│                  │ PROBABILITY-     │                            │
│                  │ WEIGHTED         │                            │
│                  │ FORECAST         │                            │
│                  └──────────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scenario Definitions

### Base Case (P50)

**Probability**: 50%
**Description**: Most likely outcome based on current trends and commitments.

**Assumptions**:
- Historical win rates continue
- Pipeline conversion at current levels
- Churn at trailing 12-month average
- Planned hiring completed on schedule

### Upside Case (P25)

**Probability**: 25%
**Description**: Optimistic outcome if favorable conditions materialize.

**Assumptions**:
- Win rates improve 10-20%
- Faster sales cycles
- Successful new product launch
- Favorable market conditions
- Lower than expected churn

### Downside Case (P25)

**Probability**: 25%
**Description**: Conservative outcome accounting for risks.

**Assumptions**:
- Win rates decline 10-20%
- Longer sales cycles
- Increased competition
- Economic headwinds
- Higher than expected churn

---

## Input Variable Templates

### Template 1: SaaS Revenue Model

```yaml
name: SaaS Revenue Scenario Template
version: 1.0

inputs:
  # Starting position
  beginning_arr:
    label: Beginning ARR
    type: currency
    required: true
    description: ARR at start of period

  # Pipeline metrics
  pipeline_value:
    label: Pipeline Value
    type: currency
    required: true
    description: Total qualified pipeline

  # Win rates by scenario
  win_rate:
    base: 0.25
    upside: 0.30
    downside: 0.20
    description: Opportunity win rate

  # Deal size
  avg_deal_size:
    base: 50000
    upside: 60000
    downside: 40000
    description: Average contract value

  # Sales cycle
  sales_cycle_days:
    base: 90
    upside: 75
    downside: 110
    description: Average days to close

  # Expansion
  expansion_rate:
    base: 0.15
    upside: 0.20
    downside: 0.10
    description: Expansion as % of beginning ARR

  # Retention
  churn_rate:
    base: 0.10
    upside: 0.08
    downside: 0.15
    description: Annual churn rate

  # Contraction
  contraction_rate:
    base: 0.03
    upside: 0.02
    downside: 0.05
    description: Downgrade as % of beginning ARR

outputs:
  - new_business_arr
  - expansion_arr
  - contraction_arr
  - churn_arr
  - ending_arr
  - net_new_arr
  - growth_rate
  - nrr
```

### Template 2: Multi-Product Model

```yaml
name: Multi-Product Revenue Scenario
version: 1.0

products:
  - name: Core Platform
    weight: 0.60
    win_rate:
      base: 0.30
      upside: 0.35
      downside: 0.25
    avg_deal:
      base: 75000
      upside: 85000
      downside: 65000

  - name: Add-On Module
    weight: 0.25
    win_rate:
      base: 0.40
      upside: 0.50
      downside: 0.30
    avg_deal:
      base: 25000
      upside: 30000
      downside: 20000

  - name: Professional Services
    weight: 0.15
    win_rate:
      base: 0.60
      upside: 0.70
      downside: 0.50
    avg_deal:
      base: 15000
      upside: 18000
      downside: 12000

cross_sell_multiplier:
  base: 1.2
  upside: 1.4
  downside: 1.1
```

### Template 3: Segment-Based Model

```yaml
name: Segment Revenue Scenario
version: 1.0

segments:
  enterprise:
    arpu:
      base: 150000
      upside: 175000
      downside: 125000
    win_rate:
      base: 0.20
      upside: 0.25
      downside: 0.15
    sales_cycle:
      base: 120
      upside: 100
      downside: 150
    expansion_rate:
      base: 0.20
      upside: 0.25
      downside: 0.15
    churn_rate:
      base: 0.05
      upside: 0.04
      downside: 0.08

  mid_market:
    arpu:
      base: 50000
      upside: 60000
      downside: 40000
    win_rate:
      base: 0.25
      upside: 0.30
      downside: 0.20
    sales_cycle:
      base: 60
      upside: 50
      downside: 75
    expansion_rate:
      base: 0.15
      upside: 0.18
      downside: 0.12
    churn_rate:
      base: 0.10
      upside: 0.08
      downside: 0.12

  smb:
    arpu:
      base: 15000
      upside: 18000
      downside: 12000
    win_rate:
      base: 0.35
      upside: 0.40
      downside: 0.30
    sales_cycle:
      base: 30
      upside: 25
      downside: 40
    expansion_rate:
      base: 0.10
      upside: 0.12
      downside: 0.08
    churn_rate:
      base: 0.15
      upside: 0.12
      downside: 0.20
```

---

## Scenario Calculations

### Basic Scenario Engine

```javascript
function calculateScenario(inputs, scenarioType) {
  const {
    beginningARR,
    pipelineValue,
    winRate,
    avgDealSize,
    expansionRate,
    churnRate,
    contractionRate
  } = inputs;

  // Get scenario-specific values
  const wr = winRate[scenarioType];
  const deal = avgDealSize[scenarioType];
  const exp = expansionRate[scenarioType];
  const churn = churnRate[scenarioType];
  const contract = contractionRate[scenarioType];

  // Calculate components
  const newBusiness = pipelineValue * wr;
  const expansion = beginningARR * exp;
  const contractionARR = beginningARR * contract;
  const churnARR = beginningARR * churn;

  // Calculate ending ARR
  const endingARR = beginningARR + newBusiness + expansion - contractionARR - churnARR;
  const netNewARR = newBusiness + expansion - contractionARR - churnARR;
  const growthRate = netNewARR / beginningARR;

  // Calculate retention metrics
  const nrr = (beginningARR + expansion - contractionARR - churnARR) / beginningARR;
  const grr = (beginningARR - contractionARR - churnARR) / beginningARR;

  return {
    beginningARR,
    newBusiness,
    expansion,
    contraction: contractionARR,
    churn: churnARR,
    endingARR,
    netNewARR,
    growthRate,
    nrr,
    grr
  };
}
```

### Probability-Weighted Forecast

```javascript
function calculateWeightedForecast(scenarios, weights = { base: 0.5, upside: 0.25, downside: 0.25 }) {
  const weighted = {
    beginningARR: scenarios.base.beginningARR,
    newBusiness: 0,
    expansion: 0,
    contraction: 0,
    churn: 0,
    endingARR: 0
  };

  ['base', 'upside', 'downside'].forEach(scenario => {
    weighted.newBusiness += scenarios[scenario].newBusiness * weights[scenario];
    weighted.expansion += scenarios[scenario].expansion * weights[scenario];
    weighted.contraction += scenarios[scenario].contraction * weights[scenario];
    weighted.churn += scenarios[scenario].churn * weights[scenario];
    weighted.endingARR += scenarios[scenario].endingARR * weights[scenario];
  });

  weighted.netNewARR = weighted.endingARR - weighted.beginningARR;
  weighted.growthRate = weighted.netNewARR / weighted.beginningARR;

  return {
    weighted,
    range: {
      low: scenarios.downside.endingARR,
      high: scenarios.upside.endingARR,
      midpoint: weighted.endingARR
    }
  };
}
```

---

## Multi-Year Projection

### Year-Over-Year Template

```yaml
name: 5-Year Revenue Projection
projection_years: 5

year_1:
  inputs: (current year actual/forecast)

year_2_5_assumptions:
  new_business_growth:
    base: 0.15
    upside: 0.25
    downside: 0.05
  expansion_rate:
    base: 0.15
    upside: 0.18
    downside: 0.12
  churn_rate:
    base: 0.10
    upside: 0.08
    downside: 0.12
  maturity_adjustments:
    year_3: -0.02  # Market saturation
    year_4: -0.03
    year_5: -0.05
```

### Multi-Year Calculation

```javascript
function projectMultiYear(year1, assumptions, years = 5) {
  const projections = [year1];

  for (let i = 1; i < years; i++) {
    const prev = projections[i - 1];
    const maturityAdj = assumptions.maturityAdjustments[`year_${i + 1}`] || 0;

    const year = {
      year: i + 1,
      beginningARR: prev.endingARR,
      scenarios: {}
    };

    ['base', 'upside', 'downside'].forEach(scenario => {
      const nbGrowth = assumptions.newBusinessGrowth[scenario] + maturityAdj;
      const expRate = assumptions.expansionRate[scenario];
      const churnRate = assumptions.churnRate[scenario];

      const newBusiness = prev.newBusiness * (1 + nbGrowth);
      const expansion = year.beginningARR * expRate;
      const churn = year.beginningARR * churnRate;

      year.scenarios[scenario] = {
        newBusiness,
        expansion,
        churn,
        endingARR: year.beginningARR + newBusiness + expansion - churn
      };
    });

    projections.push(year);
  }

  return projections;
}
```

---

## Output Formats

### Scenario Comparison Table

```
Revenue Scenarios: FY2026
═══════════════════════════════════════════════════════════════════
                        Base         Upside       Downside    Weighted
───────────────────────────────────────────────────────────────────
Beginning ARR          $10.0M        $10.0M        $10.0M      $10.0M
New Business           $ 4.0M        $ 5.2M        $ 3.2M      $ 4.1M
Expansion              $ 1.5M        $ 2.0M        $ 1.0M      $ 1.5M
Contraction           ($ 0.3M)      ($ 0.2M)      ($ 0.5M)    ($ 0.3M)
Churn                 ($ 1.0M)      ($ 0.8M)      ($ 1.5M)    ($ 1.1M)
───────────────────────────────────────────────────────────────────
Ending ARR             $14.2M        $16.2M        $12.2M      $14.2M
───────────────────────────────────────────────────────────────────
Growth Rate              42%           62%           22%         42%
NRR                     112%          120%          100%        111%
GRR                      97%           98%           95%         97%
═══════════════════════════════════════════════════════════════════
```

### Sensitivity Analysis

```
Sensitivity Analysis: Impact on Ending ARR
═══════════════════════════════════════════════════════════════════
                        -20%         Base         +20%      Sensitivity
───────────────────────────────────────────────────────────────────
Win Rate               $13.4M       $14.2M       $15.0M        HIGH
Avg Deal Size          $13.6M       $14.2M       $14.8M        MED
Expansion Rate         $13.9M       $14.2M       $14.5M        LOW
Churn Rate             $14.4M       $14.2M       $14.0M        MED
Sales Cycle            $14.0M       $14.2M       $14.4M        LOW
═══════════════════════════════════════════════════════════════════
```

---

## Configuration Files

### Scenario Configuration

```json
{
  "scenarios": {
    "base": {
      "probability": 0.50,
      "description": "Expected outcome based on current trends"
    },
    "upside": {
      "probability": 0.25,
      "description": "Optimistic outcome if favorable conditions"
    },
    "downside": {
      "probability": 0.25,
      "description": "Conservative outcome accounting for risks"
    }
  },
  "defaults": {
    "currency": "USD",
    "fiscalYearStart": 1,
    "projectionYears": 5
  },
  "validation": {
    "probabilitySum": 1.0,
    "minScenarios": 3,
    "maxProjectionYears": 10
  }
}
```

### Industry Presets

```json
{
  "presets": {
    "high_growth_saas": {
      "winRate": { "base": 0.25, "upside": 0.32, "downside": 0.18 },
      "expansionRate": { "base": 0.18, "upside": 0.25, "downside": 0.12 },
      "churnRate": { "base": 0.08, "upside": 0.06, "downside": 0.12 }
    },
    "mature_saas": {
      "winRate": { "base": 0.22, "upside": 0.28, "downside": 0.16 },
      "expansionRate": { "base": 0.12, "upside": 0.15, "downside": 0.08 },
      "churnRate": { "base": 0.10, "upside": 0.08, "downside": 0.14 }
    },
    "enterprise_software": {
      "winRate": { "base": 0.18, "upside": 0.22, "downside": 0.14 },
      "expansionRate": { "base": 0.15, "upside": 0.20, "downside": 0.10 },
      "churnRate": { "base": 0.06, "upside": 0.04, "downside": 0.10 }
    }
  }
}
```
