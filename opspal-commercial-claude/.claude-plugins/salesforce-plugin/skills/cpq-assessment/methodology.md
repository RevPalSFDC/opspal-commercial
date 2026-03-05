# CPQ Assessment Methodology

## Phase 0: Pre-Flight (MANDATORY)

```bash
# 1. Verify CPQ installation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/package-verification.js cpq-preflight <org-alias>
```

**Validation Checklist:**
- Org connection active
- CPQ package installed
- CPQ objects accessible
- Native Quote object accessible (warning only)

**Output**: `reports/PRE_FLIGHT_CHECK.md`

**If Fails**: STOP - Cannot proceed without CPQ package

---

## Phase 1: Discovery with Time-Series

### Required Queries

```bash
# 1. CPQ quotes - total and recent
CPQ_TOTAL=$(cpq-query-templates.cpqQuotes.total())
CPQ_RECENT=$(cpq-query-templates.cpqQuotes.recent(6))

# 2. Time-series analysis
CPQ_MONTHLY=$(cpq-query-templates.cpqQuotes.byMonth(12))
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/time-series-pattern-detector.js detect cpq_monthly.json

# 3. Latest records
CPQ_LATEST=$(cpq-query-templates.cpqQuotes.latest(10))

# 4. Native quotes - same analysis
NATIVE_TOTAL=$(native-query-templates.nativeQuotes.total())
NATIVE_RECENT=$(native-query-templates.nativeQuotes.recent(6))

# 5. Dual-system analysis (if both systems present)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dual-system-analyzer.js compare cpq.json native.json
```

### Data Quality Checkpoints
- Validate all queries returned expected structure
- Check if any NULL results → surface to user
- Verify time-series patterns detected
- Confirm latest record timestamps are recent

### Report Must Include
- Total vs recent record counts
- Time-series pattern (active/declining/abandoned)
- Latest record date
- Dual-system relationship (if applicable)
- Clear distinction: "Historical data shows X, but current state is Y"

**Output**: `reports/PHASE_1_DISCOVERY.md`

---

## Phase 2: Utilization Analysis

### Focus on RECENT Data Only

```bash
# Subscriptions
SUBS_TOTAL=$(cpq-query-templates.cpqSubscriptions.total())
SUBS_CONTRACT_LINK=$(cpq-query-templates.cpqSubscriptions.contractLinkage())

# Recent contracts (last 6 months)
RECENT_CONTRACTS=$(contracts.recent(6))

# Contract CPQ linkage - RECENT ONLY
RECENT_CPQ_LINK=$(Query recent contracts with CPQ linkage check)

# Opportunity quote adoption - RECENT ONLY
RECENT_OPPS=$(Count opportunities last 6 months)
RECENT_OPPS_WITH_QUOTES=$(Count with CPQ primary quote)
```

### Critical Distinction
- **Overall metrics** (e.g., 22% CPQ contract linkage) - historical
- **Recent metrics** (e.g., 100% recent contracts linked) - current state

**Report must clearly state**: "Overall 22% is historical; 100% of RECENT contracts are linked"

**Output**: `reports/PHASE_2_UTILIZATION.md`

---

## Phase 3: Configuration Review

### Pricing Automation Analysis

```bash
PRICE_RULES=$(cpq-query-templates.cpqPricing.priceRules.active())
PRODUCT_RULES=$(cpq-query-templates.cpqPricing.productRules.active())
DISCOUNT_SCHEDULES=$(cpq-query-templates.cpqPricing.discountSchedules())
```

### Product Configuration

```bash
BUNDLES=$(cpq-query-templates.cpqProducts.bundles())
SUBSCRIPTION_PRODUCTS=$(cpq-query-templates.cpqProducts.subscriptionEnabled())
```

### CPQ Reporting Analysis (RECOMMENDED)

```bash
# Analyzes CPQ-specific report usage
/audit-reports <org-alias>
```

**Key CPQ Reporting Insights:**
- Quote reports usage (are sales teams using Quote data?)
- Product performance reports (which products are tracked?)
- Pricing effectiveness reports (are discounts monitored?)
- Subscription/renewal reports (recurring revenue visibility)
- Field usage: SBQQ__NetTotal__c, SBQQ__TotalPrice__c, SBQQ__Quantity__c
- Gap detection: Missing reports for Quote Line Items, Product Options, Price Books
- ROI indicator: If Quote reports unused → CPQ adoption questionable

**Output**: `reports/PHASE_3_CONFIGURATION.md`

---

## Phase 4: Recommendations

### Synthesis Rules

1. **Active vs Historical Issues**
   - If issue was present but is now resolved → Document as "Historical, now resolved"
   - If issue is current → Prioritize as active problem
   - Example: "Dual-system pattern existed pre-Aug 2024, now consolidated to CPQ-only"

2. **Utilization Thresholds**
   | Score | Recommendation |
   |-------|----------------|
   | < 20% | REMOVE - Negative ROI likely |
   | 20-50% | OPTIMIZE - Room for improvement |
   | > 50% | KEEP - Strong adoption |

3. **Confidence Levels**
   - HIGH (85%+): Strong history, complete data, proven strategies
   - MEDIUM (70-84%): Moderate history, some data gaps
   - LOW (<70%): Limited history, incomplete data

### Output Requirements
- Clear recommendation: KEEP / OPTIMIZE / REMOVE
- Supporting evidence with metrics
- Confidence level and factors
- Business case with ROI projection

**Output**: `reports/PHASE_4_RECOMMENDATIONS.md`

---

## Phase 5: Deliverables

### Executive Summary (BLUF+4 Format)
1. **Bottom Line**: Recommendation in 25-40 words
2. **Situation**: Current state in 30-50 words
3. **Next Steps**: Prioritized actions in 35-55 words
4. **Risks/Blockers**: Impediments in 25-40 words
5. **Support Needed**: Decisions/approvals in 20-35 words

### Detailed Report Sections
1. Pre-flight validation results
2. Discovery findings with time-series analysis
3. Utilization metrics (historical vs current)
4. Configuration analysis
5. Recommendations with prioritization
6. Implementation roadmap (if OPTIMIZE)
7. Decommission plan (if REMOVE)

### Output Files
- `EXECUTIVE_SUMMARY.md` - BLUF+4 format
- `DETAILED_FINDINGS.md` - Full analysis
- `RECOMMENDATIONS.md` - Prioritized actions
- `APPENDIX_DATA.json` - Raw metrics for reference
