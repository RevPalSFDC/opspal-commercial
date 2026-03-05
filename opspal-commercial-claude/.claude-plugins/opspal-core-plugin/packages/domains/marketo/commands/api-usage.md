---
description: Track Marketo API usage, rate limits, and quota consumption
argument-hint: "[--period=today|week|month] [--detail] [--forecast]"
---

# API Usage Monitoring

Track Marketo API usage, rate limits, and quota consumption.

## Usage

```
/api-usage [--period=timeframe] [--detail] [--forecast]
```

## Parameters

- `--period` - Time period: `today`, `week`, `month` (default: today)
- `--detail` - Show detailed breakdown by operation type
- `--forecast` - Estimate usage for current billing period

## API Limits Reference

| Limit Type | Value | Reset |
|------------|-------|-------|
| Rate Limit | 100 calls / 20 seconds | Rolling window |
| Daily Limit | 50,000 calls / day | Midnight (instance TZ) |
| Bulk Batch | 300 records / operation | Per call |
| Concurrent | 10 requests | Sliding window |

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MARKETO API USAGE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Period: Today (2025-12-05)
Instance: production-instance

## Daily Usage Summary
| Metric | Value | Limit | Status |
|--------|-------|-------|--------|
| API Calls | 12,450 | 50,000 | 🟢 25% used |
| Rate Limit | 45/100 | 100/20s | 🟢 Healthy |
| Bulk Operations | 23 | - | - |

## Usage Trend (Last 7 Days)
| Date | Calls | % of Limit |
|------|-------|------------|
| Dec 05 | 12,450 | 25% |
| Dec 04 | 18,230 | 36% |
| Dec 03 | 15,890 | 32% |
| Dec 02 | 22,100 | 44% |
| Dec 01 | 19,450 | 39% |
| Nov 30 | 8,920 | 18% |
| Nov 29 | 7,230 | 14% |

Average: 14,896 calls/day (30%)
Peak: 22,100 calls (44%)

## Usage by Operation Type
| Operation | Calls | % of Total |
|-----------|-------|------------|
| Lead Query | 5,230 | 42% |
| Lead Create/Update | 3,450 | 28% |
| Campaign Operations | 1,890 | 15% |
| Email Operations | 1,120 | 9% |
| Program Operations | 760 | 6% |

## Current Rate Limit Status
Window: Last 20 seconds
Calls Used: 45 / 100
Available: 55 calls
Status: 🟢 Healthy

## Forecast (Month End)
Based on current usage patterns:
- Projected Monthly: ~450,000 calls
- Monthly Capacity: 1,500,000 calls (50K × 30 days)
- Projected Usage: 30% of capacity
- Status: 🟢 Well within limits

## Recommendations

✅ API usage is healthy and well within limits.

Tips to optimize:
1. Use bulk operations for lead updates (300 records/call)
2. Cache frequently queried data
3. Use webhooks instead of polling where possible
```

## Rate Limit Warning Thresholds

| Level | Daily Usage | Action |
|-------|------------|--------|
| 🟢 Healthy | < 60% | No action needed |
| 🟡 Warning | 60-80% | Monitor closely |
| 🟠 High | 80-90% | Reduce non-essential calls |
| 🔴 Critical | > 90% | Pause bulk operations |

## Best Practices

1. **Batch Operations**: Use 300 records per call max
2. **Caching**: Cache schema and metadata (1-hour TTL)
3. **Pagination**: Use proper pagination for large queries
4. **Off-Peak**: Schedule bulk operations during off-peak hours
5. **Monitoring**: Set up alerts at 80% daily threshold

## Related Scripts

- `scripts/lib/rate-limit-manager.js` - Rate limit tracking
- `scripts/lib/batch-operation-wrapper.js` - Optimized batching

## Related Commands

- `/marketo-logs` - View API activity logs
- `/marketo-preflight` - Pre-operation validation
