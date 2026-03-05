---
name: hubspot-goals-quotas
description: HubSpot Goal Targets V3 API patterns for sales goals, quotas, attainment tracking, and goal progress monitoring.
---

# HubSpot Goals & Quotas Skill

Comprehensive knowledge base for managing sales goals and quotas using HubSpot's Goal Targets V3 API.

## Skill Documents

| Document | Purpose |
|----------|---------|
| `SKILL.md` | Overview and quick reference (this file) |
| `goal-retrieval.md` | Patterns for listing and searching goals |
| `attainment-tracking.md` | Progress calculation and status monitoring |
| `integration-patterns.md` | Integrating goals with other HubSpot features |

## Quick Decision Matrix

### When to Use Which Agent

| Task | Route To |
|------|----------|
| List goals and quotas | `hubspot-goals-manager` |
| Goal progress reports | `hubspot-goals-manager` |
| Revenue forecasting with quotas | `hubspot-revenue-intelligence` |
| Territory quota management | `hubspot-territory-manager` |
| Goal dashboards | `hubspot-reporting-builder` |
| Goal-triggered workflows | `hubspot-workflow-builder` |

### When to Use Command vs Agent

| Task | Use Command | Use Agent |
|------|-------------|-----------|
| Quick goal list | `/hs-goals` | - |
| Single user goals | `/hs-goals --user <id>` | - |
| Detailed analysis | - | `hubspot-goals-manager` |
| Progress calculation | - | `hubspot-goals-manager` |
| Custom reports | - | `hubspot-goals-manager` |

## API Reference

### Goal Targets V3 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/crm/v3/objects/goal_targets` | GET | List all goals |
| `/crm/v3/objects/goal_targets/{id}` | GET | Get specific goal |
| `/crm/v3/objects/goal_targets/search` | POST | Search goals with filters |

### Goal Properties

| Property | Type | Description |
|----------|------|-------------|
| `hs_goal_name` | String | Display name for the goal |
| `hs_target_amount` | Number | Quota/target value |
| `hs_start_datetime` | DateTime | Goal period start (ISO 8601) |
| `hs_end_datetime` | DateTime | Goal period end (ISO 8601) |
| `hs_created_by_user_id` | String | Goal owner/assignee user ID |

### Required Scopes

```
crm.objects.goals.read
```

## Implementation Patterns

### Pattern 1: List Active Goals

```javascript
const { HubSpotGoalsManager } = require('./scripts/lib/goals-api-wrapper');

async function listActiveGoals(accessToken) {
  const manager = new HubSpotGoalsManager(accessToken);
  const activeGoals = await manager.getActiveGoals();

  return activeGoals.map(goal => ({
    id: goal.id,
    name: goal.properties.hs_goal_name,
    target: parseFloat(goal.properties.hs_target_amount),
    endDate: goal.properties.hs_end_datetime
  }));
}
```

### Pattern 2: Calculate Attainment

```javascript
async function calculateAttainment(accessToken, goalId, dealsData) {
  const manager = new HubSpotGoalsManager(accessToken);

  // Sum closed-won deals
  const actualAmount = dealsData
    .filter(d => d.dealstage === 'closedwon')
    .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

  const progress = await manager.calculateGoalProgress(goalId, actualAmount);

  return {
    ...progress,
    recommendation: getRecommendation(progress.status)
  };
}

function getRecommendation(status) {
  switch (status) {
    case 'ACHIEVED': return 'Goal met! Consider stretch targets.';
    case 'ON_TRACK': return 'Maintain current activities.';
    case 'AT_RISK': return 'Review pipeline, add prospecting.';
    case 'BEHIND': return 'Escalate, reassess strategy.';
    default: return 'Monitor closely.';
  }
}
```

### Pattern 3: User Goals Summary

```javascript
async function getUserGoalsSummary(accessToken, userId) {
  const manager = new HubSpotGoalsManager(accessToken);
  const userGoals = await manager.getUserGoals(userId);

  let totalTarget = 0;
  let activeCount = 0;
  const now = new Date();

  for (const goal of userGoals) {
    const endDate = new Date(goal.properties.hs_end_datetime);
    if (endDate > now) {
      activeCount++;
      totalTarget += parseFloat(goal.properties.hs_target_amount || 0);
    }
  }

  return {
    userId,
    totalGoals: userGoals.length,
    activeGoals: activeCount,
    totalTarget,
    goals: userGoals
  };
}
```

### Pattern 4: Period-Based Goals

```javascript
// Get goals for a specific quarter
async function getQuarterlyGoals(accessToken, year, quarter) {
  const manager = new HubSpotGoalsManager(accessToken);

  const periods = {
    Q1: { start: `${year}-01-01`, end: `${year}-03-31` },
    Q2: { start: `${year}-04-01`, end: `${year}-06-30` },
    Q3: { start: `${year}-07-01`, end: `${year}-09-30` },
    Q4: { start: `${year}-10-01`, end: `${year}-12-31` }
  };

  const { start, end } = periods[quarter];

  return manager.getGoalsByPeriod(
    `${start}T00:00:00Z`,
    `${end}T23:59:59Z`
  );
}
```

### Pattern 5: Goals Summary Report

```javascript
async function generateGoalsReport(accessToken, dealsMap) {
  const manager = new HubSpotGoalsManager(accessToken);
  const goals = await manager.getAllGoals();

  // dealsMap: Map<goalId, actualAmount>
  const summary = manager.generateGoalsSummary(goals, dealsMap);

  return {
    reportDate: new Date().toISOString(),
    summary: {
      totalGoals: summary.totalGoals,
      activeGoals: summary.activeGoals,
      totalTarget: summary.totalTargetAmount,
      totalActual: summary.totalActualAmount,
      overallAttainment: summary.overallAttainment
    },
    statusBreakdown: summary.statusBreakdown,
    goals: summary.goals.sort((a, b) => b.target - a.target)
  };
}
```

## Goal Status Logic

### Status Calculation

```
if (attainment >= 100%) → ACHIEVED
if (period ended) → MISSED
if (attainment >= 90% of expected pace) → ON_TRACK
if (attainment >= 70% of expected pace) → AT_RISK
else → BEHIND
```

### Expected Pace Formula

```
expectedPace = (elapsedDays / totalDays) × 100%

Example:
- 30-day goal, 15 days elapsed
- Expected pace: (15/30) × 100% = 50%
- If attainment is 45%: 45/50 = 90% → ON_TRACK
- If attainment is 30%: 30/50 = 60% → AT_RISK
```

## Best Practices

### Caching

```javascript
// Cache goals to reduce API calls
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache = { data: null, timestamp: 0 };

async function getCachedGoals(manager) {
  if (Date.now() - cache.timestamp < CACHE_TTL_MS && cache.data) {
    return cache.data;
  }
  cache.data = await manager.getAllGoals();
  cache.timestamp = Date.now();
  return cache.data;
}
```

### Error Handling

```javascript
async function safeGetGoals(accessToken) {
  try {
    const manager = new HubSpotGoalsManager(accessToken);
    return await manager.getAllGoals();
  } catch (error) {
    if (error.message.includes('401')) {
      throw new Error('Invalid or expired access token');
    }
    if (error.message.includes('403')) {
      throw new Error('Missing crm.objects.goals.read scope');
    }
    throw error;
  }
}
```

### Pagination

```javascript
// getAllGoals() handles pagination automatically
// For manual control:
async function manualPagination(manager) {
  let allGoals = [];
  let after = null;

  do {
    const response = await manager.listGoals({ after, limit: 100 });
    allGoals = allGoals.concat(response.results);
    after = response.paging?.next?.after;
  } while (after);

  return allGoals;
}
```

## Integration Examples

### With Revenue Intelligence

```javascript
// Get quota context for revenue analysis
const goals = await goalsManager.getActiveGoals();
const totalQuota = goals.reduce((sum, g) =>
  sum + parseFloat(g.properties.hs_target_amount || 0), 0);

const revenue = await getClosedWonRevenue(dateRange);
const quotaAttainment = (revenue / totalQuota * 100).toFixed(2);

console.log(`Revenue: $${revenue} / Quota: $${totalQuota} = ${quotaAttainment}%`);
```

### With Workflow Builder

```javascript
// Create workflow triggered by at-risk goals
const atRiskGoals = goals.filter(g => g.status === 'AT_RISK');
for (const goal of atRiskGoals) {
  await enrollInInterventionWorkflow(goal.userId);
}
```

### With Reporting Builder

```javascript
// Generate dashboard data
const summary = goalsManager.generateGoalsSummary(goals, actualAmounts);

const dashboardData = {
  gaugeChart: {
    value: summary.overallAttainment,
    max: 100,
    label: 'Overall Attainment'
  },
  pieChart: {
    data: Object.entries(summary.statusBreakdown)
      .filter(([_, count]) => count > 0)
      .map(([status, count]) => ({ name: status, value: count }))
  },
  table: summary.goals
};
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| No goals returned | No goals created in portal | Create goals in HubSpot UI |
| 401 Unauthorized | Token expired | Refresh access token |
| 403 Forbidden | Missing scope | Add `crm.objects.goals.read` |
| Empty user goals | Wrong user ID | Verify HubSpot user ID |
| Stale data | Cached results | Clear cache or wait for TTL |

## Related Resources

- **Agent**: `hubspot-goals-manager`
- **Command**: `/hs-goals`
- **Script**: `scripts/lib/goals-api-wrapper.js`
- **HubSpot Docs**: [Goal Targets API](https://developers.hubspot.com/docs/api/crm/goal-targets)
