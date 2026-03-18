# Activity Field Semantics Guide

> **MANDATORY**: Use the correct activity field when querying Tasks/Events. Using the wrong field returns incomplete data silently.

## Field Decision Table

| If you want... | Use this field | On object | Why |
|----------------|---------------|-----------|-----|
| All call activities | `Type = 'Call'` | Task / Event | Standard activity type — covers ALL calls regardless of source |
| All email activities | `Type = 'Email'` | Task / Event | Standard activity type — covers ALL emails |
| All meeting activities | `Type = 'Meeting'` or `Event` | Task / Event | Standard activity type — covers ALL meetings |
| Only Gong/CTI-synced records | `TaskSubtype = 'Call'` | Task | Integration-specific subtype — ONLY records synced by Gong, CTI, or similar tools |
| Call direction (inbound/outbound) | `CallType` | Task | Inbound vs Outbound classification |
| Scorecard/recording analysis | `TaskSubtype` + integration fields | Task | When analyzing integration-specific metadata |

## Critical Distinction

### `Type` field (Standard Activity Type)
- **Scope**: ALL activities of that type, regardless of how they were created
- **Values**: Call, Email, Meeting, Other, etc. (org-configurable picklist)
- **Use for**: Reporting, filtering, activity counts, pipeline analysis
- **Available on**: Task, Event

### `TaskSubtype` field (Integration Subtype)
- **Scope**: ONLY records created/synced by specific integrations (Gong, CTI, Dialpad, etc.)
- **Values**: Call, Email, ListEmail, Cadence (system-managed, not org-configurable)
- **Use for**: Scorecard analysis, integration-specific reporting
- **Available on**: Task only
- **WARNING**: Filtering by `TaskSubtype = 'Call'` will MISS manually logged calls, calls from other systems, and any call not synced by the integration

### `CallType` field (Call Direction)
- **Scope**: Direction of a call activity
- **Values**: Inbound, Outbound, Internal
- **Use for**: Call direction analysis, inbound vs outbound metrics
- **Available on**: Task

## Common SOQL Patterns

### Correct: Count all call activities

```sql
-- All calls (manual + automated + integration-synced)
SELECT COUNT(Id) FROM Task WHERE Type = 'Call'

-- All calls in a date range
SELECT COUNT(Id) FROM Task
WHERE Type = 'Call'
AND ActivityDate >= 2025-01-01
AND ActivityDate <= 2025-12-31
```

### Incorrect: Using TaskSubtype for total call counts

```sql
-- WRONG: Only returns Gong/CTI-synced calls, misses manual calls
SELECT COUNT(Id) FROM Task WHERE TaskSubtype = 'Call'
```

### Correct: Analyze Gong-synced calls specifically

```sql
-- Only Gong/CTI records (when you specifically want integration data)
SELECT Id, Subject, CallType, CallDurationInSeconds
FROM Task
WHERE TaskSubtype = 'Call'
```

### Correct: Call direction analysis

```sql
-- Inbound vs Outbound breakdown
SELECT CallType, COUNT(Id)
FROM Task
WHERE Type = 'Call'
GROUP BY CallType
```

### Correct: Activity summary for pipeline analysis

```sql
-- All activity types for an account
SELECT Type, COUNT(Id) activityCount
FROM Task
WHERE AccountId = :accountId
GROUP BY Type
```

## When Each Field is Appropriate

| Analysis Type | Correct Field | Reasoning |
|--------------|---------------|-----------|
| Sales activity reporting | `Type` | Need complete picture of all activities |
| Pipeline health metrics | `Type` | Must count ALL touches, not just integration-synced |
| Rep productivity | `Type` | Manual activities count too |
| Gong scorecard analysis | `TaskSubtype` | Specifically analyzing Gong-synced records |
| CTI integration audit | `TaskSubtype` | Verifying integration is syncing correctly |
| Call direction metrics | `CallType` (with `Type = 'Call'`) | Direction analysis on all calls |

## Integration with Safe Query Executor

The `safe-query-executor.js` will emit a non-blocking warning if it detects `TaskSubtype` in a WHERE clause to help catch unintentional filtering:

```
WARNING: TaskSubtype filters Gong/CTI-synced records only.
Did you mean Type='Call' for all call activities?
```

This warning is informational only and does not block query execution.

---
**Source**: Reflection Cohort - data-quality (P0)
**Version**: 1.0.0
**Date**: 2026-02-05
