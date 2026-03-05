# Storage & Retention

## Overview

This runbook covers data storage patterns, retention policies, and archival strategies for the observability layer. All data is stored locally within the plugin's instance directory structure.

## Storage Architecture

### Directory Structure

```
instances/{portal}/observability/
├── exports/                      # Normalized export data
│   ├── leads/
│   │   ├── 2025-01-15-leads.json
│   │   ├── leads-current.json    # Rolling current state
│   │   └── leads-archive/        # Compressed historical
│   ├── activities/
│   │   ├── 2025-01-15-activities.json
│   │   ├── activities-7day.json  # Rolling 7-day window
│   │   └── activities-archive/
│   └── program-members/
│       ├── program-{id}/
│       │   ├── 2025-01-15.json
│       │   └── current.json
│       └── index.json            # Program metadata
├── analysis/
│   ├── reports/                  # Claude-generated analyses
│   │   ├── 2025-01-15-campaign-analysis.md
│   │   └── archive/
│   └── recommendations/
│       ├── pending.json          # Awaiting action
│       ├── implemented.json      # Completed changes
│       └── rejected.json         # Declined recommendations
├── metrics/
│   ├── aggregations.json         # Pre-computed metrics
│   ├── baselines.json            # Historical baselines
│   └── trends/                   # Time-series data
│       ├── 2025-01.json
│       └── 2025-02.json
├── history/
│   ├── changes.json              # All implemented changes
│   ├── impact-measurements.json  # Change impact data
│   └── feedback-loop.json        # Learning outcomes
└── config/
    ├── schedules.json            # Export schedules
    ├── thresholds.json           # Alert thresholds
    └── settings.json             # General settings
```

### File Types

| Type | Format | Compression | Retention |
|------|--------|-------------|-----------|
| Daily exports | JSON | None (active) / gzip (archive) | 90 days |
| Current state | JSON | None | Indefinite (rolling) |
| Analysis reports | Markdown | None (recent) / gzip (archive) | 1 year |
| Recommendations | JSON | None | Indefinite |
| Metrics | JSON | None | 2 years |
| Change history | JSON | None | Indefinite |

## Retention Policies

### Tier 1: Hot Data (Immediate Access)

Data actively used for analysis. No compression, fast access.

**Includes**:
- Current lead state (`leads-current.json`)
- 7-day activity window (`activities-7day.json`)
- Current program membership
- Pending recommendations
- Recent analysis reports (last 30 days)

**Retention**: Rolling window, continuously updated

### Tier 2: Warm Data (Recent History)

Historical data needed for trend analysis. Uncompressed, organized by date.

**Includes**:
- Daily export snapshots (last 90 days)
- Analysis reports (last 90 days)
- Change history (all time)
- Impact measurements (all time)

**Retention**: 90 days uncompressed

### Tier 3: Cold Data (Archive)

Historical data for long-term analysis. Compressed, organized by month.

**Includes**:
- Archived exports (90+ days old)
- Archived analysis reports (90+ days old)
- Monthly metric aggregations

**Retention**: 1-2 years compressed, then deleted

## Data Lifecycle Management

### Daily Maintenance Job

```javascript
async function runDailyMaintenance(portal) {
  const basePath = `instances/${portal}/observability`;

  // 1. Archive old daily exports
  await archiveOldExports(basePath, 90); // Archive files older than 90 days

  // 2. Update rolling windows
  await updateLeadCurrentState(basePath);
  await updateActivityRollingWindow(basePath, 7);

  // 3. Compute daily aggregations
  await computeDailyAggregations(basePath);

  // 4. Clean up very old archives
  await cleanupOldArchives(basePath, 365); // Delete archives older than 1 year

  // 5. Update index files
  await updateExportIndices(basePath);

  // Log maintenance completion
  return {
    timestamp: new Date().toISOString(),
    actions: ['archived', 'updated_rolling', 'aggregated', 'cleaned', 'indexed']
  };
}
```

### Archive Old Exports

```javascript
const zlib = require('zlib');
const fs = require('fs').promises;
const path = require('path');

async function archiveOldExports(basePath, daysThreshold) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

  const exportDirs = ['leads', 'activities', 'program-members'];

  for (const dir of exportDirs) {
    const exportPath = path.join(basePath, 'exports', dir);
    const archivePath = path.join(exportPath, 'archive');

    // Ensure archive directory exists
    await fs.mkdir(archivePath, { recursive: true });

    const files = await fs.readdir(exportPath);

    for (const file of files) {
      if (!file.endsWith('.json') || file.includes('current')) continue;

      // Extract date from filename (e.g., 2025-01-15-leads.json)
      const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const fileDate = new Date(dateMatch[1]);
      if (fileDate < cutoffDate) {
        await compressAndArchive(
          path.join(exportPath, file),
          path.join(archivePath, `${file}.gz`)
        );
      }
    }
  }
}

async function compressAndArchive(sourcePath, destPath) {
  const content = await fs.readFile(sourcePath);
  const compressed = zlib.gzipSync(content);
  await fs.writeFile(destPath, compressed);
  await fs.unlink(sourcePath); // Remove original
  console.log(`Archived: ${sourcePath} -> ${destPath}`);
}
```

### Update Rolling Windows

```javascript
async function updateActivityRollingWindow(basePath, windowDays) {
  const activitiesPath = path.join(basePath, 'exports', 'activities');
  const windowFile = path.join(activitiesPath, `activities-${windowDays}day.json`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);

  // Collect activities from recent daily files
  const allActivities = [];
  const files = await fs.readdir(activitiesPath);

  for (const file of files) {
    if (!file.match(/^\d{4}-\d{2}-\d{2}-activities\.json$/)) continue;

    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    const fileDate = new Date(dateMatch[1]);

    if (fileDate >= cutoffDate) {
      const content = JSON.parse(await fs.readFile(path.join(activitiesPath, file)));
      allActivities.push(...(content.activities || []));
    }
  }

  // Deduplicate by GUID
  const uniqueActivities = Array.from(
    new Map(allActivities.map(a => [a.guid, a])).values()
  );

  // Sort by date descending
  uniqueActivities.sort((a, b) =>
    new Date(b.activityDate) - new Date(a.activityDate)
  );

  // Write rolling window
  const windowData = {
    windowDays,
    updatedAt: new Date().toISOString(),
    recordCount: uniqueActivities.length,
    dateRange: {
      start: cutoffDate.toISOString(),
      end: new Date().toISOString()
    },
    activities: uniqueActivities,
    summary: calculateActivitySummary(uniqueActivities)
  };

  await fs.writeFile(windowFile, JSON.stringify(windowData, null, 2));
  console.log(`Updated rolling window: ${uniqueActivities.length} activities`);
}
```

## Index Files

### Export Index

Maintains quick lookup for available exports:

```json
{
  "lastUpdated": "2025-01-15T04:30:00Z",
  "leads": {
    "latestDaily": "2025-01-15-leads.json",
    "currentState": "leads-current.json",
    "totalRecords": 150000,
    "lastExportDate": "2025-01-15T02:00:00Z",
    "archiveCount": 45,
    "oldestArchive": "2024-10-15"
  },
  "activities": {
    "latestDaily": "2025-01-15-activities.json",
    "rollingWindow": "activities-7day.json",
    "windowRecords": 125000,
    "lastExportDate": "2025-01-15T03:00:00Z"
  },
  "programMembers": {
    "trackedPrograms": 15,
    "programs": {
      "1044": {
        "name": "Q1 Webinar",
        "latestExport": "2025-01-15.json",
        "currentState": "current.json",
        "memberCount": 500
      }
    }
  }
}
```

### Recommendation Index

Tracks recommendation lifecycle:

```json
{
  "lastUpdated": "2025-01-15T10:30:00Z",
  "counts": {
    "pending": 5,
    "implemented": 42,
    "rejected": 8,
    "deferred": 3
  },
  "recentImplemented": [
    {
      "id": "rec-042",
      "type": "token_update",
      "implementedAt": "2025-01-15T10:00:00Z",
      "impactStatus": "measuring"
    }
  ],
  "pendingApproval": [
    {
      "id": "rec-043",
      "type": "segmentation_change",
      "createdAt": "2025-01-14T15:00:00Z",
      "priority": "high"
    }
  ]
}
```

## Space Management

### Storage Estimation

```javascript
function estimateStorageRequirements(config) {
  const {
    leadCount,
    dailyActivityCount,
    programCount,
    avgMembersPerProgram,
    retentionDays
  } = config;

  // Approximate sizes per record (JSON with metadata)
  const BYTES_PER_LEAD = 500;
  const BYTES_PER_ACTIVITY = 300;
  const BYTES_PER_MEMBER = 400;

  // Daily exports
  const dailyLeadExport = leadCount * BYTES_PER_LEAD;
  const dailyActivityExport = dailyActivityCount * BYTES_PER_ACTIVITY;
  const dailyProgramExport = programCount * avgMembersPerProgram * BYTES_PER_MEMBER;

  // Hot storage (current + 7-day window)
  const hotStorage = (
    dailyLeadExport + // Current leads
    dailyActivityExport * 7 + // 7-day activities
    dailyProgramExport // Current program state
  );

  // Warm storage (90 days uncompressed)
  const warmStorage = (dailyLeadExport + dailyActivityExport + dailyProgramExport) * 90;

  // Cold storage (compressed ~20% of original, 1 year)
  const coldDays = Math.max(0, retentionDays - 90);
  const coldStorage = (dailyLeadExport + dailyActivityExport + dailyProgramExport) * coldDays * 0.2;

  return {
    hot: formatBytes(hotStorage),
    warm: formatBytes(warmStorage),
    cold: formatBytes(coldStorage),
    total: formatBytes(hotStorage + warmStorage + coldStorage),
    breakdown: {
      leads: formatBytes(dailyLeadExport * retentionDays * 0.3),
      activities: formatBytes(dailyActivityExport * retentionDays * 0.3),
      programs: formatBytes(dailyProgramExport * retentionDays * 0.3)
    }
  };
}
```

### Cleanup Thresholds

```javascript
const STORAGE_THRESHOLDS = {
  warningPercent: 80,  // Warn when 80% full
  criticalPercent: 95, // Emergency cleanup at 95%
  maxTotalGB: 10       // Hard limit
};

async function checkStorageHealth(basePath) {
  const usage = await calculateStorageUsage(basePath);

  if (usage.percentUsed >= STORAGE_THRESHOLDS.criticalPercent) {
    console.error('Critical: Storage nearly full. Running emergency cleanup.');
    await emergencyCleanup(basePath);
  } else if (usage.percentUsed >= STORAGE_THRESHOLDS.warningPercent) {
    console.warn(`Warning: Storage at ${usage.percentUsed}%. Consider cleanup.`);
  }

  return usage;
}

async function emergencyCleanup(basePath) {
  // Delete oldest archives first
  await cleanupOldArchives(basePath, 180); // Reduce to 6 months

  // Compact activity windows
  await compactActivityArchives(basePath);

  // Remove old analysis reports
  await cleanupOldReports(basePath, 60);
}
```

## Backup Considerations

### What to Backup

| Priority | Data | Frequency | Method |
|----------|------|-----------|--------|
| Critical | `config/` | On change | Git version control |
| High | `recommendations/` | Daily | File copy |
| High | `history/` | Daily | File copy |
| Medium | `metrics/` | Weekly | File copy |
| Medium | `smart-lists/` | On change | File copy |
| Low | `exports/` | Not backed up | Re-exportable from Marketo |

### Backup Script

```javascript
async function backupCriticalData(portal, backupPath) {
  const basePath = `instances/${portal}/observability`;
  const timestamp = new Date().toISOString().split('T')[0];

  const criticalPaths = [
    'config',
    'analysis/recommendations',
    'history',
    'metrics'
  ];

  for (const subPath of criticalPaths) {
    const source = path.join(basePath, subPath);
    const dest = path.join(backupPath, portal, timestamp, subPath);

    await fs.cp(source, dest, { recursive: true });
  }

  return {
    timestamp,
    backedUp: criticalPaths,
    location: path.join(backupPath, portal, timestamp)
  };
}
```

## Related

- [01-overview-architecture.md](./01-overview-architecture.md) - System architecture
- [08-continuous-intelligence.md](./08-continuous-intelligence.md) - Using stored data for learning
