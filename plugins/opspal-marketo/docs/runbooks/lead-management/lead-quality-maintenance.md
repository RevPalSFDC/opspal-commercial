# Lead Quality Maintenance Runbook

## Purpose

Regular procedures for maintaining lead database quality in Marketo.

## Schedule

- **Weekly**: Duplicate detection scan
- **Monthly**: Stale lead review
- **Quarterly**: Full quality assessment

## Procedures

### 1. Weekly Duplicate Scan

**Objective**: Identify and flag potential duplicate leads.

**Steps**:
1. Run duplicate detection:
   ```bash
   # Use lead-dedup-detector.js
   node scripts/lib/lead-dedup-detector.js --instance production --output reports/
   ```

2. Review duplicate clusters:
   - Sort by confidence score (highest first)
   - Review top 50 clusters manually

3. Merge confirmed duplicates:
   - Use `marketo-lead-manager` agent
   - Keep most complete record as winner
   - Document merge decisions

**Success Criteria**:
- All 90%+ confidence duplicates reviewed
- Merge decisions documented
- Duplicate rate < 2%

### 2. Monthly Stale Lead Review

**Objective**: Identify and action inactive leads.

**Steps**:
1. Query stale leads:
   ```
   Filter: No activity > 180 days
   Filter: Email not invalid
   Filter: Not unsubscribed
   ```

2. Categorize stale leads:
   | Category | Action |
   |----------|--------|
   | 180-270 days | Re-engagement campaign |
   | 270-365 days | Final re-engagement |
   | > 365 days | Archive/delete review |

3. Execute actions:
   - Add to re-engagement program
   - Update lead status
   - Document decisions

**Success Criteria**:
- Stale lead rate < 25%
- All 365+ day leads actioned
- Re-engagement campaign launched

### 3. Quarterly Quality Assessment

**Objective**: Comprehensive database health check.

**Steps**:
1. Run full quality assessment:
   ```
   /lead-quality-report --sample=10000
   ```

2. Review quality metrics:
   - Completeness score
   - Accuracy score
   - Engagement score
   - Scoring alignment

3. Create remediation plan for issues

4. Update quality tracking dashboard

**Success Criteria**:
- Overall quality score > 70
- All critical issues documented
- Remediation plan created

## Emergency Procedures

### High Bounce Rate Alert

If bounce rate exceeds 5%:

1. **Immediate**: Pause active email sends
2. **Diagnose**: Identify source of bad emails
3. **Clean**: Remove invalid emails from lists
4. **Resume**: Gradually resume sending
5. **Monitor**: Watch bounce rate closely

### Sudden Duplicate Spike

If duplicates increase >100% week-over-week:

1. **Investigate**: Check recent form/import sources
2. **Identify**: Find root cause (form issue, import, sync)
3. **Fix**: Address source of duplicates
4. **Clean**: Run duplicate merge
5. **Prevent**: Add validation/dedup rules

## Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Duplicate Rate | < 2% | > 5% |
| Stale Lead Rate | < 20% | > 30% |
| Email Invalid Rate | < 2% | > 5% |
| Completeness Score | > 75 | < 60 |
| Quality Score | > 70 | < 50 |

## Related Resources

- **Agent**: `marketo-lead-quality-assessor`
- **Script**: `scripts/lib/lead-dedup-detector.js`
- **Script**: `scripts/lib/lead-quality-scorer.js`
- **Command**: `/lead-quality-report`
