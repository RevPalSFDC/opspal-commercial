# Runbook 9: Monitoring and Maintenance

**Version**: 1.0.0
**Last Updated**: 2025-12-12
**Audience**: Administrators, Operations

---

## Table of Contents

1. [Monitoring Overview](#monitoring-overview)
2. [Assignment Job Monitoring](#assignment-job-monitoring)
3. [Health Metrics](#health-metrics)
4. [Audit Trail](#audit-trail)
5. [Maintenance Tasks](#maintenance-tasks)
6. [Alerting](#alerting)

---

## Monitoring Overview

### Key Monitoring Objects

| Object | Purpose | Key Fields |
|--------|---------|------------|
| Territory2AlignmentLog | Assignment job status | Status, RecordsProcessed, RecordsFailed |
| Territory2ModelHistory | Model change audit | Field, OldValue, NewValue |
| Territory2 | Territory changes | LastModifiedDate, LastModifiedById |
| UserTerritory2Association | User assignment tracking | CreatedDate, LastModifiedDate |
| ObjectTerritory2Association | Account assignment tracking | AssociationCause |

### Monitoring Dashboard Components

```
┌─────────────────────────────────────────────────────────┐
│                Territory Health Dashboard                │
├─────────────────────┬───────────────────────────────────┤
│  Model Status       │  Assignment Job Status            │
│  ● Active: FY2026   │  Last Run: 2025-01-15 03:00      │
│  ○ Planning: FY2027 │  Status: Completed                │
│  ○ Archived: FY2025 │  Processed: 15,234               │
│                     │  Failed: 12                       │
├─────────────────────┼───────────────────────────────────┤
│  Coverage Metrics   │  Recent Changes                   │
│  Territories: 156   │  • Territory added: APAC_ANZ     │
│  Users: 89          │  • User assigned: John Smith     │
│  Accounts: 12,456   │  • Rule updated: Enterprise_Accts│
│  Coverage: 87%      │  • Access level changed          │
└─────────────────────┴───────────────────────────────────┘
```

---

## Assignment Job Monitoring

### Territory2AlignmentLog Queries

```sql
-- Recent assignment jobs
SELECT Id, Territory2ModelId, Status,
       RecordsProcessed, RecordsFailed,
       StartDateTime, EndDateTime,
       ErrorMessage
FROM Territory2AlignmentLog
ORDER BY StartDateTime DESC
LIMIT 20
```

### Job Status Values

| Status | Description | Action |
|--------|-------------|--------|
| Queued | Job submitted | Wait |
| Processing | Job running | Monitor |
| Completed | Job finished successfully | Verify |
| Failed | Job encountered errors | Investigate |
| Canceled | Job was canceled | Review logs |

### Monitor Running Jobs

```javascript
async function monitorAssignmentJob(jobId, pollIntervalMs = 5000) {
  let status = 'Queued';

  while (status === 'Queued' || status === 'Processing') {
    const job = await query(`
      SELECT Id, Status, RecordsProcessed, RecordsFailed,
             StartDateTime, EndDateTime, ErrorMessage
      FROM Territory2AlignmentLog
      WHERE Id = '${jobId}'
    `);

    if (job.length === 0) {
      throw new Error('Job not found');
    }

    status = job[0].Status;

    console.log({
      status,
      processed: job[0].RecordsProcessed,
      failed: job[0].RecordsFailed,
      elapsed: job[0].StartDateTime
        ? Date.now() - new Date(job[0].StartDateTime).getTime()
        : 0
    });

    if (status === 'Queued' || status === 'Processing') {
      await sleep(pollIntervalMs);
    }
  }

  return status;
}
```

### Failed Records Analysis

```sql
-- Get failed assignment details (if available)
SELECT Id, Status, ErrorMessage, RecordsFailed
FROM Territory2AlignmentLog
WHERE Status = 'Failed'
ORDER BY StartDateTime DESC
LIMIT 10
```

---

## Health Metrics

### Territory Coverage Metrics

```javascript
async function getHealthMetrics(modelId) {
  const metrics = {};

  // Territory count
  const territories = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);
  metrics.totalTerritories = territories[0].cnt;

  // User coverage - using valid SOQL (no COUNT(DISTINCT) or JOIN)
  const territoriesWithUsers = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND Id IN (SELECT Territory2Id FROM UserTerritory2Association)
  `);
  const uniqueUsers = await query(`
    SELECT UserId FROM UserTerritory2Association
    WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}')
    GROUP BY UserId
  `);
  const totalUserAssignments = await query(`
    SELECT COUNT(Id) cnt FROM UserTerritory2Association
    WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}')
  `);
  metrics.userCoverage = {
    TerritoriesWithUsers: territoriesWithUsers[0].cnt,
    UniqueUsers: uniqueUsers.length,
    TotalAssignments: totalUserAssignments[0].cnt
  };

  // Account coverage - using valid SOQL
  const territoriesWithAccounts = await query(`
    SELECT COUNT(Id) cnt FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND Id IN (SELECT Territory2Id FROM ObjectTerritory2Association)
  `);
  const uniqueAccounts = await query(`
    SELECT ObjectId FROM ObjectTerritory2Association
    WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}')
    GROUP BY ObjectId
  `);
  const totalAccountAssignments = await query(`
    SELECT COUNT(Id) cnt FROM ObjectTerritory2Association
    WHERE Territory2Id IN (SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}')
  `);
  metrics.accountCoverage = {
    TerritoriesWithAccounts: territoriesWithAccounts[0].cnt,
    UniqueAccounts: uniqueAccounts.length,
    TotalAssignments: totalAccountAssignments[0].cnt
  };

  // Empty territories
  const emptyTerritories = await query(`
    SELECT COUNT(Id) cnt
    FROM Territory2 t
    WHERE t.Territory2ModelId = '${modelId}'
    AND t.Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)
    AND t.Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)
  `);
  metrics.emptyTerritories = emptyTerritories[0].cnt;

  // Calculate health score
  metrics.healthScore = calculateHealthScore(metrics);

  return metrics;
}

function calculateHealthScore(metrics) {
  let score = 100;

  // Deduct for empty territories (up to 30 points)
  const emptyRatio = metrics.emptyTerritories / metrics.totalTerritories;
  score -= Math.min(emptyRatio * 100, 30);

  // Deduct for low user coverage (up to 30 points)
  const userCoverageRatio =
    metrics.userCoverage.TerritoriesWithUsers / metrics.totalTerritories;
  if (userCoverageRatio < 0.5) {
    score -= (0.5 - userCoverageRatio) * 60;
  }

  // Deduct for low account coverage (up to 20 points)
  const accountCoverageRatio =
    metrics.accountCoverage.TerritoriesWithAccounts / metrics.totalTerritories;
  if (accountCoverageRatio < 0.3) {
    score -= (0.3 - accountCoverageRatio) * 67;
  }

  return Math.max(0, Math.round(score));
}
```

### Coverage Report Query

```sql
-- Territory coverage detail
SELECT
  t.Name TerritoryName,
  tt.MasterLabel TypeName,
  (SELECT COUNT(Id) FROM UserTerritory2Association WHERE Territory2Id = t.Id) UserCount,
  (SELECT COUNT(Id) FROM ObjectTerritory2Association WHERE Territory2Id = t.Id) AccountCount
FROM Territory2 t
JOIN Territory2Type tt ON t.Territory2TypeId = tt.Id
WHERE t.Territory2ModelId = '<model_id>'
ORDER BY t.Name
```

### Assignment Distribution

```sql
-- Users per territory distribution
SELECT
  CASE
    WHEN cnt = 0 THEN '0 users'
    WHEN cnt = 1 THEN '1 user'
    WHEN cnt BETWEEN 2 AND 5 THEN '2-5 users'
    ELSE '6+ users'
  END Bucket,
  COUNT(*) TerritoryCount
FROM (
  SELECT t.Id, COUNT(uta.Id) cnt
  FROM Territory2 t
  LEFT JOIN UserTerritory2Association uta ON t.Id = uta.Territory2Id
  WHERE t.Territory2ModelId = '<model_id>'
  GROUP BY t.Id
)
GROUP BY Bucket
```

---

## Audit Trail

### Model Change History

```sql
-- Territory2Model changes
SELECT
  CreatedDate,
  Field,
  OldValue,
  NewValue,
  CreatedBy.Name
FROM Territory2ModelHistory
WHERE Territory2ModelId = '<model_id>'
ORDER BY CreatedDate DESC
LIMIT 50
```

### Territory Changes

```sql
-- Recent territory modifications
SELECT
  Id, Name, DeveloperName,
  LastModifiedDate,
  LastModifiedBy.Name
FROM Territory2
WHERE Territory2ModelId = '<model_id>'
AND LastModifiedDate >= LAST_N_DAYS:7
ORDER BY LastModifiedDate DESC
```

### Assignment Changes

```javascript
async function getRecentAssignmentChanges(modelId, days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const isoDate = cutoffDate.toISOString().split('T')[0];

  // User assignments
  const userAssignments = await query(`
    SELECT
      uta.Id,
      u.Name UserName,
      t.Name TerritoryName,
      uta.CreatedDate,
      uta.LastModifiedDate,
      uta.RoleInTerritory2
    FROM UserTerritory2Association uta
    JOIN User u ON uta.UserId = u.Id
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
    AND (uta.CreatedDate >= ${isoDate} OR uta.LastModifiedDate >= ${isoDate})
    ORDER BY uta.LastModifiedDate DESC
    LIMIT 100
  `);

  // Account assignments
  const accountAssignments = await query(`
    SELECT
      ota.Id,
      a.Name AccountName,
      t.Name TerritoryName,
      ota.CreatedDate,
      ota.AssociationCause
    FROM ObjectTerritory2Association ota
    JOIN Account a ON ota.ObjectId = a.Id
    JOIN Territory2 t ON ota.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
    AND ota.CreatedDate >= ${isoDate}
    ORDER BY ota.CreatedDate DESC
    LIMIT 100
  `);

  return { userAssignments, accountAssignments };
}
```

### Export Audit Report

```javascript
async function generateAuditReport(modelId) {
  const report = {
    generatedAt: new Date().toISOString(),
    modelId
  };

  // Model info
  const model = await query(`
    SELECT Id, Name, State, CreatedDate, LastModifiedDate
    FROM Territory2Model WHERE Id = '${modelId}'
  `);
  report.model = model[0];

  // Territory statistics
  report.territoryStats = await query(`
    SELECT
      COUNT(Id) Total,
      COUNT(CASE WHEN ParentTerritory2Id = null THEN 1 END) RootCount,
      MAX(LastModifiedDate) LastChange
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
  `);

  // Recent changes
  report.recentChanges = await getRecentAssignmentChanges(modelId, 30);

  // Health metrics
  report.health = await getHealthMetrics(modelId);

  return report;
}
```

---

## Maintenance Tasks

### Periodic Cleanup

```javascript
async function runMaintenanceTasks(modelId) {
  const results = {
    timestamp: new Date().toISOString(),
    tasks: []
  };

  // 1. Find and report empty territories
  const emptyTerritories = await query(`
    SELECT Id, Name FROM Territory2 t
    WHERE t.Territory2ModelId = '${modelId}'
    AND t.Id NOT IN (SELECT Territory2Id FROM UserTerritory2Association)
    AND t.Id NOT IN (SELECT Territory2Id FROM ObjectTerritory2Association)
  `);
  results.tasks.push({
    name: 'Empty Territories',
    count: emptyTerritories.length,
    items: emptyTerritories.slice(0, 10)
  });

  // 2. Find duplicate assignments (should not exist but check)
  const duplicateUserAssignments = await query(`
    SELECT UserId, Territory2Id, COUNT(Id) cnt
    FROM UserTerritory2Association uta
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
    GROUP BY UserId, Territory2Id
    HAVING COUNT(Id) > 1
  `);
  results.tasks.push({
    name: 'Duplicate User Assignments',
    count: duplicateUserAssignments.length,
    items: duplicateUserAssignments
  });

  // 3. Find inactive users with assignments
  const inactiveUserAssignments = await query(`
    SELECT u.Id, u.Name, COUNT(uta.Id) AssignmentCount
    FROM UserTerritory2Association uta
    JOIN User u ON uta.UserId = u.Id
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
    AND u.IsActive = false
    GROUP BY u.Id, u.Name
  `);
  results.tasks.push({
    name: 'Inactive User Assignments',
    count: inactiveUserAssignments.length,
    items: inactiveUserAssignments
  });

  // 4. Hierarchy validation
  const hierarchyIssues = [];

  const orphans = await query(`
    SELECT Id, Name, ParentTerritory2Id
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    AND ParentTerritory2Id != null
    AND ParentTerritory2Id NOT IN (
      SELECT Id FROM Territory2 WHERE Territory2ModelId = '${modelId}'
    )
  `);
  if (orphans.length > 0) {
    hierarchyIssues.push({ type: 'orphans', count: orphans.length });
  }

  results.tasks.push({
    name: 'Hierarchy Issues',
    count: hierarchyIssues.length,
    items: hierarchyIssues
  });

  return results;
}
```

### Cleanup Inactive User Assignments

```javascript
async function cleanupInactiveUserAssignments(modelId) {
  // Note: Salesforce auto-removes assignments when users are deactivated
  // This is for verification

  const assignments = await query(`
    SELECT uta.Id
    FROM UserTerritory2Association uta
    JOIN User u ON uta.UserId = u.Id
    JOIN Territory2 t ON uta.Territory2Id = t.Id
    WHERE t.Territory2ModelId = '${modelId}'
    AND u.IsActive = false
  `);

  if (assignments.length === 0) {
    return { cleaned: 0, message: 'No inactive user assignments found' };
  }

  // This should not normally be needed, but for cleanup:
  for (const a of assignments) {
    await del('UserTerritory2Association', a.Id);
  }

  return { cleaned: assignments.length };
}
```

### Rebalancing Analysis

```javascript
async function analyzeRebalancing(modelId) {
  // Get account distribution per territory
  const distribution = await query(`
    SELECT
      t.Id TerritoryId,
      t.Name TerritoryName,
      COUNT(ota.Id) AccountCount,
      SUM(a.AnnualRevenue) TotalRevenue
    FROM Territory2 t
    LEFT JOIN ObjectTerritory2Association ota ON t.Id = ota.Territory2Id
    LEFT JOIN Account a ON ota.ObjectId = a.Id
    WHERE t.Territory2ModelId = '${modelId}'
    GROUP BY t.Id, t.Name
    ORDER BY AccountCount DESC
  `);

  // Calculate statistics
  const counts = distribution.map(d => d.AccountCount);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  // Flag imbalanced territories
  const imbalanced = distribution.filter(
    d => Math.abs(d.AccountCount - avg) > 2 * stdDev
  );

  return {
    distribution,
    statistics: {
      average: avg,
      standardDeviation: stdDev,
      min: Math.min(...counts),
      max: Math.max(...counts)
    },
    imbalanced,
    recommendation: imbalanced.length > 0
      ? 'Consider rebalancing territories'
      : 'Distribution is balanced'
  };
}
```

---

## Alerting

### Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Assignment job failed | Critical | Investigate immediately |
| Assignment job > 1 hour | Warning | Monitor progress |
| Empty territories > 20% | Warning | Review structure |
| Hierarchy issues detected | Critical | Fix before activation |
| User coverage < 50% | Warning | Assign users |
| Health score < 60 | Warning | Run maintenance |

### Alert Check Script

```javascript
async function checkAlerts(modelId) {
  const alerts = [];

  // 1. Check recent assignment jobs
  const recentJobs = await query(`
    SELECT Id, Status, ErrorMessage, StartDateTime
    FROM Territory2AlignmentLog
    WHERE Territory2ModelId = '${modelId}'
    ORDER BY StartDateTime DESC
    LIMIT 1
  `);

  if (recentJobs.length > 0 && recentJobs[0].Status === 'Failed') {
    alerts.push({
      severity: 'CRITICAL',
      type: 'AssignmentJobFailed',
      message: `Assignment job failed: ${recentJobs[0].ErrorMessage}`,
      jobId: recentJobs[0].Id
    });
  }

  // 2. Check health metrics
  const health = await getHealthMetrics(modelId);

  if (health.healthScore < 60) {
    alerts.push({
      severity: 'WARNING',
      type: 'LowHealthScore',
      message: `Health score is ${health.healthScore}%`,
      metrics: health
    });
  }

  const emptyRatio = health.emptyTerritories / health.totalTerritories;
  if (emptyRatio > 0.2) {
    alerts.push({
      severity: 'WARNING',
      type: 'HighEmptyTerritories',
      message: `${Math.round(emptyRatio * 100)}% of territories are empty`,
      count: health.emptyTerritories
    });
  }

  // 3. Check for hierarchy issues
  const cycles = await detectCycles(modelId);
  if (cycles.hasCycles) {
    alerts.push({
      severity: 'CRITICAL',
      type: 'HierarchyCycles',
      message: 'Circular references detected in hierarchy',
      cycles: cycles.cycles
    });
  }

  const orphans = await detectOrphans(modelId);
  if (orphans.hasOrphans) {
    alerts.push({
      severity: 'CRITICAL',
      type: 'OrphanedTerritories',
      message: `${orphans.orphans.length} orphaned territories found`,
      orphans: orphans.orphans
    });
  }

  return alerts;
}
```

### Scheduled Health Check

```javascript
async function scheduledHealthCheck() {
  // Get all active models
  const models = await query(`
    SELECT Id, Name FROM Territory2Model WHERE State = 'Active'
  `);

  const results = [];

  for (const model of models) {
    const alerts = await checkAlerts(model.Id);
    const health = await getHealthMetrics(model.Id);

    results.push({
      modelId: model.Id,
      modelName: model.Name,
      healthScore: health.healthScore,
      alertCount: alerts.length,
      criticalAlerts: alerts.filter(a => a.severity === 'CRITICAL').length,
      alerts
    });
  }

  // Send notification if critical alerts
  const criticalResults = results.filter(r => r.criticalAlerts > 0);
  if (criticalResults.length > 0) {
    await sendAlert('Territory Health Check - Critical Issues', criticalResults);
  }

  return results;
}
```

---

## Related Runbooks

- [Runbook 7: Testing and Validation](07-testing-and-validation.md)
- [Runbook 8: Deployment and Activation](08-deployment-and-activation.md)
- [Runbook 10: Troubleshooting Guide](10-troubleshooting-guide.md)
