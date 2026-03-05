# CPQ Assessment Error Taxonomy

## Common CPQ Issues

### Issue 1: LOW_CPQ_ADOPTION

**Pattern**: Utilization score < 20%
**Severity**: HIGH
**Historical Occurrences**: Tracked in runbook

**Symptoms**:
- Few active quotes relative to opportunities
- Low quote-to-contract conversion
- Minimal CPQ field population

**Root Causes**:
- Poor user training
- Complex configuration
- Alternative quoting methods in use
- Legacy process inertia

**Recommendation**: Consider removal if < 20% (historical data shows low-adoption orgs see negative ROI)

---

### Issue 2: EXCESSIVE_PRICE_RULES

**Pattern**: Active price rules > 15
**Severity**: HIGH
**Threshold**: Max recommended = 15 rules

**Symptoms**:
- Slow quote calculation
- Maintenance burden
- Unpredictable pricing
- User confusion

**Root Causes**:
- Organic rule accumulation
- One-off pricing exceptions
- Lack of governance
- Missing consolidation reviews

**Recommendation**: Historical data shows orgs with > 15 rules experience significant maintenance burden

---

### Issue 3: EXCESSIVE_PRODUCT_OPTIONS

**Pattern**: Product options > 500
**Severity**: HIGH
**Threshold**: Max recommended = 500 options

**Symptoms**:
- Complex product selection
- Long page load times
- User errors
- Training difficulty

**Root Causes**:
- Over-granular product modeling
- Duplicated options
- Legacy configurations
- Missing product strategy

**Recommendation**: Review for simplification - excessive options complicate quoting process

---

### Issue 4: HIGH_INACTIVE_PRODUCTS

**Pattern**: Inactive products > 30% of catalog
**Severity**: LOW
**Threshold**: Warning at > 30% inactive

**Symptoms**:
- Cluttered product searches
- Confusion about availability
- Data quality concerns
- Storage overhead

**Root Causes**:
- Product lifecycle not managed
- Soft delete instead of archive
- No cleanup process
- Missing product governance

**Recommendation**: Consider archival or cleanup for inactive products

---

### Issue 5: DUAL_SYSTEM_CONFUSION

**Pattern**: Both CPQ and Native Quote active
**Severity**: MEDIUM

**Symptoms**:
- Inconsistent quote data
- Reporting conflicts
- User uncertainty about which system to use
- Data synchronization issues

**Detection**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dual-system-analyzer.js compare cpq.json native.json
```

**States**:
- `PARALLEL_ACTIVE` - Both actively used (problem)
- `MIGRATION_IN_PROGRESS` - CPQ growing, Native declining
- `MIGRATION_COMPLETE` - Only CPQ active (desired)
- `LEGACY_DOMINANT` - Native still primary

**Recommendation**: Consolidate to single system

---

### Issue 6: MISSING_TIME_SERIES_DATA

**Pattern**: Insufficient data for trend analysis
**Severity**: MEDIUM

**Symptoms**:
- Cannot determine adoption trend
- Missing recency validation
- Uncertain current state

**Minimum Requirements**:
- 12 months of monthly data
- At least 1 record per quarter
- Latest record < 30 days old

**Recommendation**: Extend data collection period or accept lower confidence

---

### Issue 7: ORPHANED_SUBSCRIPTIONS

**Pattern**: Subscriptions without contract linkage
**Severity**: MEDIUM

**Symptoms**:
- Revenue recognition issues
- Renewal confusion
- Inaccurate subscription reports

**Query**:
```sql
SELECT COUNT() FROM SBQQ__Subscription__c
WHERE SBQQ__Contract__c = NULL
```

**Recommendation**: Establish subscription-contract linking process

---

### Issue 8: COMPLEX_PRICING_LOGIC

**Pattern**: Complexity score > 100
**Severity**: HIGH

**Calculation**:
```
Score = (activePriceRules × 5) + (priceActions × 3) + (discountSchedules × 2)
```

**Thresholds**:
| Score | Rating | Action |
|-------|--------|--------|
| < 20 | SIMPLE | Minor cleanup |
| 20-50 | MODERATE | Review consolidation |
| 50-100 | COMPLEX | Significant simplification |
| > 100 | VERY COMPLEX | Major overhaul |

**Recommendation**: Identify complexity drivers and prioritize simplification

---

## Error Categories

### Category A: Data Acquisition Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| NULL_QUERY_RESULT | Permission, syntax, no data | Verify access, check query |
| STALE_DATA | Data > 30 days old | Extend window, verify sync |
| MISSING_OBJECTS | CPQ not installed | Verify package installation |
| FIELD_INACCESSIBLE | FLS restrictions | Check profile permissions |

### Category B: Analysis Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| INSUFFICIENT_HISTORY | < 4 assessments | Lower confidence, note limitation |
| CONFLICTING_METRICS | Multiple sources disagree | Document both, clarify with user |
| PATTERN_UNCLEAR | Ambiguous trend | Collect more data, request guidance |

### Category C: Recommendation Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| LOW_CONFIDENCE | Score < 70% | Surface factors, get validation |
| MISSING_CONTEXT | No historical data | Apply defaults, note assumptions |
| USER_CONTRADICTION | Finding conflicts with observation | Stop, clarify, document |

---

## Prevention Strategies

### Pre-Assessment Automation

```bash
# 1. Auto-detect org quirks (label customizations)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-quirks-detector.js generate-docs {org-alias}

# 2. Load previous assessment context
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-context-manager.js load {org-alias}

# 3. Confirm assessment framework
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/framework-selector.js recommend {org-alias} --type cpq
```

### Data Validation Pipeline

1. **Pre-query validation**: SOQL syntax check
2. **Post-query validation**: Expected structure check
3. **Pre-conclusion validation**: Confidence threshold check
4. **User validation**: Cross-check with observations

### Continuous Improvement

All errors are captured via reflection system:
- `/reflect` after each assessment
- Automatic pattern detection
- Runbook updates based on findings
