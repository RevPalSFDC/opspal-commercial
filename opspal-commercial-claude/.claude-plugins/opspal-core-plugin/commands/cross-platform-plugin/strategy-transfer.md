---
name: strategy-transfer
description: ACE Framework strategy transfer operations - candidates, transfer, validate, rollback
argument-hint: "<command> [options]"
---

# Strategy Transfer - ACE Framework

Manage cross-agent strategy transfers to share high-performing strategies between similar agents.

## Commands

### Find Transfer Candidates

```bash
# Find skills ready for transfer (>85% success, >30 uses)
/strategy-transfer candidates

# Custom thresholds
/strategy-transfer candidates --min-success 0.90 --min-usage 50

# Filter by source agent
/strategy-transfer candidates --source sfdc-revops-auditor

# Include skills needing refinement
/strategy-transfer candidates --needs-refinement
```

**Output:**
```
Transfer Candidates (5 skills):

  1. cpq-preflight-validation
     Source: sfdc-cpq-assessor
     Success: 98.2% (142 uses)
     Target Agents: sfdc-cpq-specialist, sfdc-sales-operations
     Command: /strategy-transfer transfer cpq-preflight sfdc-cpq-assessor sfdc-cpq-specialist

  2. revops-pipeline-audit
     Source: sfdc-revops-auditor
     Success: 96.8% (89 uses)
     Target Agents: sfdc-sales-operations
     Command: /strategy-transfer transfer revops-pipeline sfdc-revops-auditor sfdc-sales-operations
```

### Find Similar Agents

```bash
# Find agents that could benefit from a skill
/strategy-transfer similar sfdc-revops-auditor

# Minimum similarity threshold
/strategy-transfer similar sfdc-revops-auditor --min-similarity 0.7
```

**Output:**
```
Agents Similar to: sfdc-revops-auditor

  1. sfdc-sales-operations     (82% similarity)
     Shared Keywords: pipeline, forecast, revenue, quota
     Shared Categories: assessment, reporting

  2. sfdc-cpq-assessor         (74% similarity)
     Shared Keywords: pricing, revenue, quote
     Shared Categories: assessment, validation
```

### Execute Transfer

```bash
# Transfer skill to target agent
/strategy-transfer transfer <skill-id> <source-agent> <target-agent>

# Example
/strategy-transfer transfer cpq-preflight sfdc-cpq-assessor sfdc-cpq-specialist

# With custom validation threshold
/strategy-transfer transfer cpq-preflight sfdc-cpq-assessor sfdc-cpq-specialist --validation 30

# Dry run (simulate without executing)
/strategy-transfer transfer cpq-preflight sfdc-cpq-assessor sfdc-cpq-specialist --dry-run
```

**Output:**
```
=== Skill Transfer ===

Skill:  cpq-preflight-validation
From:   sfdc-cpq-assessor
To:     sfdc-cpq-specialist

Pre-Transfer Verification:
  ✓ Skill exists and is active
  ✓ Source agent has skill
  ✓ Target agent doesn't have skill
  ✓ Agents are compatible (74% similarity)

Transfer Initiated:
  Status: VALIDATING
  Validation Threshold: 20 uses
  Expected Validation: 2-4 weeks

Monitor with: /strategy-transfer status cpq-preflight sfdc-cpq-specialist
```

### Check Transfer Status

```bash
# Check specific transfer
/strategy-transfer status <skill-id> <target-agent>

# List all pending transfers
/strategy-transfer status --pending

# List all transfers (including completed)
/strategy-transfer status --all
```

**Output:**
```
Transfer Status: cpq-preflight → sfdc-cpq-specialist

  Status:          VALIDATING
  Progress:        12/20 uses (60%)
  Current Success: 91.7% (11 successes, 1 failure)
  Started:         2025-11-20 02:00:00 UTC
  Est. Completion: 2025-12-08

  Recent Executions:
    2025-12-05: ✓ success (210ms)
    2025-12-04: ✓ success (185ms)
    2025-12-03: ✗ failed (timeout)
    2025-12-02: ✓ success (195ms)

  Action: Will auto-accept at 20 uses if >80% success
```

### Rollback Transfer

```bash
# Rollback a failed or problematic transfer
/strategy-transfer rollback <transfer-id>

# Rollback with reason
/strategy-transfer rollback <transfer-id> --reason "Performance degradation"

# Force rollback (skip confirmation)
/strategy-transfer rollback <transfer-id> --force
```

**Output:**
```
=== Transfer Rollback ===

Transfer ID: tr_abc123
Skill:       complex-soql-builder
Target:      sfdc-data-operations

Reason:      Performance degradation
             Success rate dropped to 47% (below 60% threshold)

Rollback Actions:
  ✓ Removed skill from target agent
  ✓ Updated transfer status to ROLLED_BACK
  ✓ Logged rollback reason
  ✓ Notified via Slack

The skill remains available in source agent: sfdc-query-specialist
```

### Run Auto-Transfer

```bash
# Run automatic transfer analysis (same as weekly hook)
/strategy-transfer auto

# Dry run to see what would be transferred
/strategy-transfer auto --dry-run

# Custom thresholds
/strategy-transfer auto --min-success 0.90 --min-usage 50
```

**Output:**
```
=== Automatic Skill Transfer ===

Analysis Parameters:
  Min Success Rate: 85%
  Min Usage Count:  30
  Validation Uses:  20

Found 5 transfer candidates
Transferring 3 skills:

  1. cpq-preflight: sfdc-cpq-assessor → sfdc-cpq-specialist
     Status: VALIDATING

  2. revops-audit: sfdc-revops-auditor → sfdc-sales-operations
     Status: VALIDATING

  3. field-verify: sfdc-metadata-manager → sfdc-deployment-manager
     Status: VALIDATING

Skipped 2 candidates:
  - flow-testing: Target already has skill
  - permission-audit: Low agent similarity (52%)

Summary: 3 transfers initiated, 2 skipped
Report: ~/.claude/reports/strategy-transfers/transfer-report-2025-12-06.md
```

### View Statistics

```bash
# Overall transfer statistics
/strategy-transfer stats

# Statistics for specific agent
/strategy-transfer stats --agent sfdc-revops-auditor

# Time-bounded statistics
/strategy-transfer stats --since 2025-11-01
```

**Output:**
```
=== Skill Transfer Statistics ===
Period: Last 30 days

Overall:
  Total Transfers:     23
  Accepted:            18 (78.3%)
  Rolled Back:         3 (13.0%)
  In Validation:       2 (8.7%)

By Source Agent:
  sfdc-revops-auditor:    7 transfers (100% accepted)
  sfdc-cpq-assessor:      5 transfers (80% accepted)
  sfdc-automation:        4 transfers (75% accepted)

Success Rate Improvement:
  Average before transfer: 89.2%
  Average after transfer:  86.1% (validation period)
  Average post-acceptance: 91.3%

Top Transferred Skills:
  1. cpq-preflight-validation  (3 transfers)
  2. revops-pipeline-audit     (2 transfers)
  3. field-deployment-verify   (2 transfers)
```

## Transfer Lifecycle

```
INITIATED → VALIDATING → ACCEPTED/REJECTED → [ROLLED_BACK]
     │           │              │                  │
     │           │              │                  └─ Manual rollback
     │           │              │                     or degradation
     │           │              │
     │           │              └─ Auto-decision at threshold
     │           │                 >80% success: ACCEPTED
     │           │                 <60% success: REJECTED
     │           │
     │           └─ Tracking executions (default: 20)
     │
     └─ Initial transfer
```

## Environment Configuration

```bash
# Transfer thresholds
export SKILL_TRANSFER_MIN_SUCCESS_RATE=0.85
export SKILL_TRANSFER_MIN_USAGE=30
export SKILL_TRANSFER_VALIDATION_THRESHOLD=20

# Auto-transfer schedule
export SKILL_TRANSFER_AUTO_ENABLED=1
export SKILL_TRANSFER_AUTO_SCHEDULE="0 2 * * 0"  # Weekly Sunday 2am

# Notifications
export ENABLE_SKILL_TRANSFER_SLACK=1
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
```

## Integration with Reflection System

Skill transfers are influenced by reflection data:

```bash
# Skills flagged in reflections get priority attention
/strategy-transfer candidates --from-reflections

# View skills mentioned in recent reflections
/strategy-transfer flagged
```

## Best Practices

1. **Start with dry runs**: Always test with `--dry-run` first
2. **Monitor validation**: Check `/strategy-transfer status --pending` regularly
3. **Review rollbacks**: Investigate why transfers fail
4. **Check similarity**: High similarity (>70%) predicts better transfer success
5. **Don't over-transfer**: Let skills prove themselves in source agent first

## See Also

- `/skill-dashboard` - Skill registry overview
- `/routing-compliance` - Routing system health
- `/reflect` - Submit session reflections that influence skills
