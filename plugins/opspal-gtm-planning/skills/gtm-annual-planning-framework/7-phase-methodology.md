# 7-Phase Planning Methodology

## Phase 0: Initialize (Week 1)

### Purpose
Set up workspace and validate prerequisites

### Tasks
```bash
# 1. Create workspace
mkdir -p gtm_annual_plan_<YEAR>/{scripts,data,models,policy,reporting,territories,qa,comms/letters,dictionary}

# 2. Copy templates
cp -r templates/playbooks/gtm-annual-planning/* gtm_annual_plan_<YEAR>/

# 3. Initialize Data Dictionary
cp templates/playbooks/gtm-annual-planning/dictionary/data_dictionary_template.md \
   gtm_annual_plan_<YEAR>/dictionary/data_dictionary.md

# 4. Validate org connectivity
sf org display --target-org <org-alias>
```

### Deliverables
- [ ] Workspace created
- [ ] Templates copied
- [ ] Org connectivity verified
- [ ] ENV-INIT approval created

## Phase 1: Data → Validate (Week 2-3)

### Delegate to: `gtm-data-insights`

### Task Prompt
```
Analyze Salesforce org for GTM planning:
1. Export 24 months historical data
2. Generate cohort views
3. Build field validation report
4. Create Data Dictionary v1
5. Output to: gtm_annual_plan_<YEAR>/data/
```

### Quality Targets
- Field completeness ≥95%
- Duplicate rate ≤5%
- Referential integrity 100%

### Required Outputs
- historical_performance_report.md
- cohorts.csv
- field_validation_report.md
- data_dictionary_v1.md
- segmentation_snapshot.csv

### Checkpoint: DATA-001

## Phase 2: Attribution → Policy (Week 3)

### Delegate to: `gtm-attribution-governance`

### Task Prompt
```
Define attribution model:
1. Compare 4 attribution models
2. Back-test on prior FY closed-won
3. Generate sensitivity tables
4. Recommend model with 90-day lookback
5. Output to: gtm_annual_plan_<YEAR>/policy/
```

### Quality Targets
- Back-test variance ≤10%
- Reconciliation totals match

### Required Outputs
- attribution_policy.md
- attribution_test_panel.csv
- calc_spec.json

### Checkpoint: ATTR-001

## Phase 3: Model Scenarios (Week 4-5)

### Delegate to: `gtm-quota-capacity`

### Task Prompt
```
Build quota capacity models:
1. Top-down targets from config
2. Bottom-up capacity calculation
3. Monte Carlo for P10/P50/P90
4. Sensitivity analysis (7 variables)
5. Pipeline coverage guidance
6. Back-test vs last FY
7. Output to: gtm_annual_plan_<YEAR>/models/
```

### Quality Targets
- Scenarios sum to targets ±2%
- Back-test variance ≤15%
- P10 ≥ 70% of P50, P90 ≤ 130% of P50

### Required Outputs
- capacity_model.xlsx
- scenario_catalog.md
- target_split_table.csv
- seasonality_factors.csv

### Checkpoint: SCEN-001

## Phase 4: Territories & ROE (Week 6-7)

### Delegate to: `gtm-territory-designer`

### Task Prompt
```
Design territories:
1. Build account universe
2. Generate 3 territory carve options
3. Balance by potential/pipeline/install/workload
4. Calculate fairness metrics
5. Define ROE rules
6. Output to: gtm_annual_plan_<YEAR>/territories/
```

### Quality Targets
- Gini coefficient ≤0.30
- Variance from mean ≤30%
- No orphaned accounts

### Required Outputs
- territory_spec.md
- account_assignments.csv
- territory_maps.geo.json
- roe_document.md

### Checkpoint: TERR-001

## Phase 5: GTM Motions & Comp (Week 8-9)

### Two Parallel Delegations

#### 5A: GTM Strategy → `gtm-strategy-planner`
```
Define GTM motion playbook:
1. New logo vs expansion split
2. PLG → SLG transition rules
3. Partner/channel targets
4. Credit rules alignment
5. Output to: gtm_annual_plan_<YEAR>/policy/
```

#### 5B: Compensation → `gtm-comp-planner`
```
Design compensation plans:
1. OTE/pay mix by role
2. Metrics: ARR, Bookings, NRR
3. Accelerators/decelerators
4. Monte Carlo payout scenarios
5. UAT test plan
6. Output to: gtm_annual_plan_<YEAR>/models/
```

### Checkpoints: GTM-001 + COMP-001

## Phase 6: KPI & Packaging (Week 10-11)

### Deliverables Assembly

```
gtm_annual_plan_<YEAR>/plan_of_record/
├── executive_summary.md
├── data/ (symlink)
├── models/ (symlink)
├── policy/ (symlink)
├── territories/ (symlink)
├── qa/ (validation reports)
└── comms/ (letters, enablement)
```

### Quota Letter Generation
```bash
node scripts/generate-quota-letters.js \
  --input territories/account_assignments.csv \
  --output comms/letters/
```

### Checkpoint: FINAL-001

## Phase 7: Implementation (Week 12+)

### Sandbox First
```bash
# Deploy to sandbox
sf project deploy start --target-org <sandbox>

# Upload territory assignments
node scripts/upload-territory-assignments.js --org <sandbox>

# Run UAT
node scripts/run-uat.js --org <sandbox>
```

### Production Cutover
```bash
# Create backup
node scripts/backup-gtm-planning.js --org <production>

# Deploy and monitor
sf project deploy start --target-org <production>
node scripts/monitor-gtm-deployment.js --duration 72h
```
