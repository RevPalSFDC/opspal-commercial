# Data Quality Operations Runbook

This runbook addresses data quality monitoring, field population tracking, integration health checks, and anomaly detection patterns derived from 30+ reflection incidents.

## Overview

| Metric | Value |
|--------|-------|
| Reflection Count | 30 |
| Primary Cohort | data-quality |
| Priority | P0 |
| Annual ROI | $90,000 |
| Root Cause | No data quality infrastructure with automated health checks |

## Contents

1. [Field Population Monitoring](./01-field-population-monitoring.md)
2. [Integration Health Checks](./02-integration-health-checks.md)
3. [NULL Handling Patterns](./03-null-handling-patterns.md)
4. [Anomaly Detection](./04-anomaly-detection.md)
5. [Pattern Validation](./05-pattern-validation.md)
6. [Transparency Enhancements](./06-transparency-enhancements.md)

## Quick Reference

### Common Issues Addressed

| Issue | Frequency | Solution |
|-------|-----------|----------|
| CallType NULL for Gong calls | 35% of records | Integration health monitoring |
| Unexpected inbound call ratios | 67% vs 30% expected | Anomaly detection alerts |
| Calculated vs actual confusion | Every assessment | Transparency labeling |
| Pattern changes break logic | Per deployment | Pre-deployment validation |

### Key Scripts

```bash
# Check field population rates
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/data-quality-monitor.js check-population --object Account --field Industry

# Validate integration health
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/integration-health-checker.js --source gong

# Run pattern validation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/qa/pattern-validator.js --old-pattern "OLD" --new-pattern "NEW" --dataset records.csv
```

### Pre-Assessment Checklist

- [ ] Run field population audit for target objects
- [ ] Check integration health scores (Gong, HubSpot, etc.)
- [ ] Verify NULL rates are within thresholds
- [ ] Confirm anomaly baselines are established

## Sources

- [Salesforce Data Quality Best Practices (Cloudingo)](https://cloudingo.com/blog/salesforce-data-quality-best-practices/)
- [Salesforce Data Quality Process](https://www.salesforce.com/blog/data-quality-process/)
- [Salesforce Data Quality Trailhead](https://trailhead.salesforce.com/content/learn/modules/data_quality/data_quality_getting_started)
