# GTM Planning Plugin

**Version**: 1.5.0
**Status**: Production Ready
**Plugin Type**: Revenue Operations

## Overview

The GTM Planning Plugin provides a comprehensive framework for Go-To-Market annual planning, including territory design, quota modeling, compensation planning, and attribution governance.

## Key Features

- **7 Specialized Agents** for GTM planning domains
- **Orchestrated Workflow** with approval gates
- **Fairness Validation** (Gini coefficient ≤0.3)
- **Scenario Modeling** (P10/P50/P90)
- **Data Dictionary Governance**
- **UAT Validation** for compensation plans

## Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install opspal-gtm-planning@revpal-internal-plugins
```

## Quick Start

```bash
# Start annual planning
"Begin GTM planning for FY2026"

# Design territories
"Design territories for 15 reps covering EMEA"

# Model quotas
"Create quota scenarios for Q1 with 20% growth target"

# Plan compensation
"Design AE compensation with 50/50 base/variable split"
```

## Agents

| Agent | Description |
|-------|-------------|
| `gtm-planning-orchestrator` | Master coordinator for planning workflow |
| `gtm-strategy-planner` | Market analysis and GTM strategy |
| `gtm-territory-designer` | Territory boundaries and fairness |
| `gtm-quota-capacity` | Quota modeling with scenarios |
| `gtm-comp-planner` | Compensation design and UAT |
| `gtm-data-insights` | Data quality and validation |
| `gtm-attribution-governance` | Attribution rules and governance |

## Planning Workflow

```
Plan → Validate → Model → Propose → Implement
  ↓        ↓        ↓        ↓          ↓
Data   Strategy  Territory  Comp    Production
Quality          Quota     Review   Deployment
```

Each stage requires human approval before proceeding.

## Documentation

- **USAGE.md** - Detailed usage examples and workflows
- **CHANGELOG.md** - Version history
- **agents/** - Individual agent specifications

## Requirements

- Salesforce org with Account, Opportunity, User data
- Optional: HubSpot for engagement data
- Minimum 2 years historical data for quota modeling

## License

MIT

---

**Maintained by**: RevPal Engineering
