---
name: analyze-decay-risk
description: Predict report and dashboard abandonment using leading indicators (ownership changes, usage velocity, dependency staleness)
argument-hint: "<org-alias>"
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - TodoWrite
thinking-mode: enabled
---

# Analyze Decay Risk

## Purpose

**What this command does**: Predicts which Salesforce reports and dashboards are at risk of abandonment using leading indicators, enabling proactive maintenance before assets become stale.

**Leading Indicators Analyzed**:
1. **Ownership Abandonment** - Owner left company, transferred roles, or inactive
2. **Dependency Staleness** - Source reports/dashboards already stale
3. **Usage Velocity Decline** - Decreasing view/run frequency over time
4. **Duplicate Proliferation** - Shadow copies being created (users losing trust)
5. **Metric Drift** - Underlying metric definition has changed

**When to use it**:
- ✅ Quarterly reporting health assessments
- ✅ Before reporting consolidation projects
- ✅ During org change management (reorgs, departures)
- ✅ To prioritize maintenance efforts
- ✅ Proactive cleanup planning

**When NOT to use it**:
- ❌ For immediate quality issues (use `/audit-reports`)
- ❌ For migration validation (use semantic diff)
- ❌ Real-time monitoring (use Event Monitoring)

## Prerequisites

### Required Configuration

**Salesforce CLI Authentication** (MANDATORY):
```bash
sf org login web --alias myorg
sf org display --target-org myorg
```

**Required Permissions**:
- View All Data OR View All Reports
- View Dashboards
- Read access to Report, Dashboard, User objects

## Usage

### Basic Usage

```bash
/analyze-decay-risk <org-alias>
```

**Examples**:
```bash
/analyze-decay-risk production
/analyze-decay-risk staging --threshold 0.5
```

### Advanced Options

**Custom risk thresholds**:
```bash
/analyze-decay-risk <org-alias> --critical 0.70 --high 0.50 --medium 0.30
```

**Focus on specific asset types**:
```bash
/analyze-decay-risk <org-alias> --type reports
/analyze-decay-risk <org-alias> --type dashboards
```

**Include automated response recommendations**:
```bash
/analyze-decay-risk <org-alias> --recommend-actions
```

**Export for automation**:
```bash
/analyze-decay-risk <org-alias> --output-format json --output decay-risk.json
```

## Execution Workflow

### Step 1: Data Collection
- Query Reports (Name, Owner, LastModifiedDate, FolderName)
- Query Dashboards (Title, Components, LastViewedDate)
- Query Users (Active status, LastLoginDate)
- Build dependency graph (Dashboard → Report relationships)
- **Time**: 1-3 minutes

### Step 2: Ownership Analysis
- Check owner active status
- Calculate days since owner last login
- Identify generic/shared ownership
- Score ownership risk (0-1)
- **Time**: 15-30 seconds

### Step 3: Dependency Analysis
- Map dashboard-to-report dependencies
- Calculate staleness propagation
- Identify orphaned dependencies
- Score dependency risk (0-1)
- **Time**: 20-45 seconds

### Step 4: Usage Velocity Analysis
- Calculate modification frequency trend
- Compare current vs historical activity
- Detect declining engagement
- Score velocity risk (0-1)
- **Time**: 15-30 seconds

### Step 5: Duplicate Detection
- Identify shadow copies
- Calculate proliferation rate
- Detect trust erosion signals
- Score proliferation risk (0-1)
- **Time**: 10-20 seconds

### Step 6: Risk Aggregation
- Apply signal weights
- Calculate composite decay risk
- Classify into risk tiers
- Generate recommendations
- **Time**: 5-10 seconds

## Output Structure

```
instances/<org-alias>/decay-risk-<date>/
├── DECAY_RISK_REPORT.md           # Executive summary
├── decay-scores.json               # All assets with risk scores
├── critical-risk.csv               # Assets with score ≥0.70
├── high-risk.csv                   # Assets with score 0.50-0.69
├── medium-risk.csv                 # Assets with score 0.30-0.49
├── low-risk.csv                    # Assets with score <0.30
├── recommended-actions.json        # Automated response recommendations
└── dependency-graph.json           # Asset dependency map
```

## Decay Risk Scoring

### Risk Score Interpretation (0.0-1.0)

| Score | Tier | Status | Recommended Action |
|-------|------|--------|-------------------|
| 0.70-1.00 | Critical | Imminent abandonment | Archive or reassign immediately |
| 0.50-0.69 | High | Likely to become stale | Review and decide within 30 days |
| 0.30-0.49 | Medium | Some risk indicators | Monitor, consider improvements |
| 0.15-0.29 | Low | Minor concerns | Standard maintenance |
| 0.00-0.14 | Minimal | Healthy | No action needed |

### Signal Weights

| Signal | Weight | Description |
|--------|--------|-------------|
| Ownership Abandonment | 30% | Owner inactive >90 days or left company |
| Dependency Staleness | 25% | Source reports already flagged as stale |
| Usage Velocity Decline | 20% | >50% drop in activity over 90 days |
| Duplicate Proliferation | 15% | Shadow copies created in last 90 days |
| Metric Drift | 10% | Underlying metric definition changed |

### Signal Calculation Details

**Ownership Abandonment**:
```
risk = 0.0 if owner active and logged in <30 days
risk = 0.5 if owner active but no login >60 days
risk = 0.8 if owner inactive
risk = 1.0 if owner deleted or unknown
```

**Dependency Staleness**:
```
risk = (stale_dependencies / total_dependencies)
Stale = source not modified in >180 days
```

**Usage Velocity Decline**:
```
current_rate = modifications in last 90 days
baseline_rate = modifications in prior 90 days
risk = max(0, (baseline_rate - current_rate) / baseline_rate)
```

## Automated Response Recommendations

When `--recommend-actions` is enabled, the system suggests:

### Critical Risk (≥0.70)
```json
{
  "action": "deprecation_warning",
  "details": "Send notification to stakeholders, schedule for archive in 30 days",
  "automation": "Create Slack alert, add to deprecation queue"
}
```

### High Risk (0.50-0.69)
```json
{
  "action": "archive_candidate",
  "details": "Review with business owner, decide archive vs reassign",
  "automation": "Add to review queue, notify folder owner"
}
```

### Medium Risk (0.30-0.49)
```json
{
  "action": "redesign_review",
  "details": "Consider refreshing or consolidating with similar assets",
  "automation": "Add to quarterly review list"
}
```

## Common Patterns

### Pattern 1: Post-Departure Decay
**Scenario**: Employee leaves, their reports decay within 3-6 months.

**Indicators**:
- Owner marked inactive
- No modifications since departure
- Dependent dashboards also declining

**Recommendation**: Establish ownership transfer process.

### Pattern 2: Metric Drift Cascade
**Scenario**: Core metric definition changes, downstream reports not updated.

**Indicators**:
- Source report shows metric drift
- Dependent reports have outdated calculations
- Increasing metric inconsistencies

**Recommendation**: Update metric registry, propagate changes.

### Pattern 3: Shadow Report Proliferation
**Scenario**: Users create copies instead of using official reports.

**Indicators**:
- Multiple similar-named reports
- Official version shows declining usage
- Shadow copies show increasing activity

**Recommendation**: Investigate root cause, consolidate to single source.

## Integration with Other Commands

### Recommended Workflow

```bash
# 1. Analyze decay risk
/analyze-decay-risk production

# 2. Check trust erosion for context
/check-trust-erosion production

# 3. Deep dive on critical items
/audit-reports production

# 4. Validate actionability of survivors
/score-actionability production --dashboards critical-dashboards.json
```

### Automated Monitoring

The decay risk analysis can be scheduled:

```bash
# Weekly decay risk check (cron example)
0 8 * * MON /analyze-decay-risk production --output-format json --output /reports/decay-$(date +%Y%m%d).json
```

## Troubleshooting

### Error: "Unable to determine owner status"

**Cause**: User object not accessible or owner field null.

**Fix**:
```bash
sf data query --query "SELECT Id, IsActive FROM User WHERE Id = 'owner_id'" --target-org myorg
```

### Warning: "High percentage of critical risk assets"

**Cause**: >30% of assets in critical tier.

**Action**:
1. Review DECAY_RISK_REPORT.md for patterns
2. Check for systemic issues (recent reorg, ownership model)
3. Prioritize by business impact

### Warning: "Incomplete dependency graph"

**Cause**: Some dashboard-report links not resolvable.

**Impact**: Dependency staleness calculation may be incomplete.

**Action**: Review dependency-graph.json for gaps.

## Success Metrics

**Expected Outcomes**:
- All reports/dashboards scored for decay risk
- Critical items identified for immediate action
- Dependency relationships mapped
- Proactive maintenance plan generated

**ROI**:
- Prevent surprise "report broken" tickets
- Reduce stale asset accumulation by 50%
- Enable proactive ownership transfers
- Save 2-4 hours/week on reactive maintenance

## Configuration

### Customizing Weights

Edit `config/decay-risk-weights.json`:
```json
{
  "ownershipAbandonment": 0.30,
  "dependencyStaleness": 0.25,
  "usageVelocityDecline": 0.20,
  "duplicateProliferation": 0.15,
  "metricDrift": 0.10
}
```

### Customizing Thresholds

Edit `config/decay-risk-thresholds.json`:
```json
{
  "critical": 0.70,
  "high": 0.50,
  "medium": 0.30,
  "low": 0.15
}
```

## See Also

- `/check-trust-erosion` - Detect current trust issues
- `/audit-reports` - Comprehensive usage audit
- `/score-actionability` - Evaluate dashboard effectiveness
- `scripts/lib/decay-risk-model.js` - Core prediction logic
- `docs/REPORT_HEALTH_SCORE_RUBRIC.md` - Scoring methodology

---

**Version**: 1.0.0
**Last Updated**: 2026-01-15
**Author**: RevPal Engineering
