# GTM Planning Plugin - Usage Guide

**Version**: 1.5.0
**Last Updated**: 2025-11-24

## Quick Start

```bash
# Install
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install gtm-planning-plugin@revpal-internal-plugins

# Verify
/agents | grep gtm
```

## Available Agents

| Agent | Purpose | Trigger Keywords |
|-------|---------|------------------|
| `gtm-planning-orchestrator` | Master orchestrator for annual planning workflow | "plan", "planning", "workflow" |
| `gtm-strategy-planner` | High-level GTM strategy and market analysis | "strategy", "market" |
| `gtm-territory-designer` | Territory design with fairness validation | "territory", "design" |
| `gtm-quota-capacity` | Quota modeling with P10/P50/P90 scenarios | "quota", "capacity" |
| `gtm-comp-planner` | Compensation plan design and validation | "compensation", "comp" |
| `gtm-data-insights` | Data quality validation and insights | "data", "quality" |
| `gtm-attribution-governance` | Attribution rules and governance | "attribution", "governance" |

## Common Workflows

### Annual Planning Workflow

```
User: "Start annual GTM planning for FY2026"

→ Automatically invokes gtm-planning-orchestrator
→ Orchestrator coordinates:
   1. Data validation (gtm-data-insights) - ≥95% quality required
   2. Strategy planning (gtm-strategy-planner)
   3. Territory design (gtm-territory-designer) - Gini ≤0.3
   4. Quota modeling (gtm-quota-capacity) - P10/P50/P90 scenarios
   5. Comp planning (gtm-comp-planner) - UAT validation
   6. Attribution rules (gtm-attribution-governance)
```

### Territory Design

```
User: "Design territories for the East region with 10 reps"

→ gtm-territory-designer analyzes:
   - Account distribution by revenue potential
   - Geographic clustering
   - Fairness validation (Gini coefficient)
   - Workload balancing
```

### Quota Modeling

```
User: "Model quota scenarios for Q1 2026"

→ gtm-quota-capacity provides:
   - P10 (conservative): 80% attainment target
   - P50 (expected): 100% attainment target
   - P90 (stretch): 120% attainment target
   - Capacity analysis
```

### Compensation Planning

```
User: "Design compensation plan for AE role"

→ gtm-comp-planner creates:
   - Base/variable split recommendation
   - Accelerator structure
   - Quota relief policies
   - UAT test scenarios
```

## Operating Principles

### Read-Only by Default
- Agents analyze and recommend but DON'T modify production data
- Changes require explicit approval: `APPROVED: <artifact-id>`
- All changes staged in sandbox first

### Data Dictionary Governance
- All metrics reference canonical definitions
- KPIs must align with Data Dictionary
- No shadow metrics allowed

### Approval Gates
Each phase requires human approval before proceeding:
1. Data validation → Approval
2. Strategy → Approval
3. Territory design → Approval
4. Quota model → Approval
5. Comp plan → Approval
6. Implementation → Final approval

## Output Artifacts

| Artifact | Description |
|----------|-------------|
| `territory-design.json` | Territory boundaries and assignments |
| `quota-model.json` | P10/P50/P90 scenarios with capacity |
| `comp-plan.json` | Compensation structure and rules |
| `attribution-rules.json` | GTM motion attribution rules |
| `data-quality-report.json` | Validation results and issues |

## Integration Notes

### MCP Separation
GTM agents are user-facing and don't have direct access to internal MCP servers (Supabase, Asana). For task management integration:
- Use orchestrator to coordinate work
- Internal agents handle Asana updates separately

### Data Sources
- Salesforce: Account, Opportunity, User data
- HubSpot: Contact, Company engagement data
- Custom: Historical performance data

## Troubleshooting

### Territory Gini Too High
**Symptom**: Fairness validation fails (Gini > 0.3)
**Solution**: Rebalance territories using gtm-territory-designer with `--rebalance` flag

### Data Quality Below Threshold
**Symptom**: Planning blocked due to <95% data quality
**Solution**: Run gtm-data-insights to identify and remediate issues

### Quota Scenarios Not Generated
**Symptom**: Missing P10/P50/P90 outputs
**Solution**: Ensure historical data is available (minimum 2 years)

---

**Documentation**: See individual agent files in `agents/` for detailed specifications.
