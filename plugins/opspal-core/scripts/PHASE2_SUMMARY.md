# Phase 2 Reflection Processing - Execution Summary

**Date**: 2026-01-27
**Status**: ✅ **READY FOR EXECUTION**
**Phase 1 Input**: `plugins/opspal-core/output/reflection-processing/phase1-data-2026-01-27.json`

---

## Executive Summary

Phase 2 execution infrastructure has been **prepared and validated**. The system is ready to process 13 reflection cohorts through a comprehensive orchestration workflow that includes:

- ✅ **Fix plan generation** with 5-Why root cause analysis
- ✅ **Asana task creation** for stakeholder review
- ✅ **Transactional status updates** with automatic rollback
- ✅ **Persistence verification** (1-second delay + re-query)
- ✅ **Circuit breakers** for Supabase and Asana APIs
- ✅ **Dead letter queue** for failed operations
- ✅ **Checkpoint/resume** capability for interruptions

---

## Orchestration Architecture

### Core Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Main Orchestrator** | End-to-end workflow execution | `.claude/scripts/process-reflections.js` |
| **Phase 2 Wrapper** | Environment validation & execution | `plugins/opspal-core/scripts/execute-phase2.sh` |
| **Data Converter** | Phase 1 → Execution format | `plugins/opspal-core/scripts/convert-phase1-to-execution-data.js` |
| **Saga Engine** | Transactional integrity | `.claude/scripts/lib/saga.js` |
| **Verified Updates** | Persistence validation | `.claude/scripts/lib/supabase-verified-update.js` |

### Agents Invoked

| Agent | Responsibility | Output |
|-------|---------------|---------|
| **supabase-fix-planner** | 5-Why RCA, solution design, alternatives | Fix plans with implementation estimates |
| **supabase-asana-bridge** | Asana task creation with prevention format | Task GID, URL, custom fields |
| **Built-in Verified Update** | Batch reflection updates with rollback | Updated reflection IDs with verification |

---

## Execution Options

### 🎯 Recommended: Automated Execution

```bash
# 1. Dry run (preview without changes)
bash plugins/opspal-core/scripts/execute-phase2.sh --dry-run

# 2. Review output and verify
# 3. Execute live
bash plugins/opspal-core/scripts/execute-phase2.sh
```

**What it does:**
1. ✅ Validates environment variables (Supabase + Asana)
2. ✅ Converts Phase 1 data to execution format
3. ✅ Invokes orchestration script with proper parameters
4. ✅ Provides progress updates and error handling
5. ✅ Generates summary report

### ⚙️ Alternative: Direct Orchestration

```bash
# Convert data format
node plugins/opspal-core/scripts/convert-phase1-to-execution-data.js

# Execute (use actual filename from conversion)
node .claude/scripts/process-reflections.js --execute=reports/reflection-plan-<timestamp>-execution-data.json
```

---

## What Phase 2 Will Do

### For Each of 13 Cohorts:

#### Step 1: Generate Fix Plan (supabase-fix-planner)

**5-Why Root Cause Analysis:**
- Why 1: Immediate symptom
- Why 2: Contributing factor
- Why 3: System weakness
- Why 4: Process gap
- Why 5: Root organizational cause

**Solution Design:**
- Specific files to modify
- Implementation steps
- Testing requirements
- Deployment plan

**Alternatives Analysis:**
- Alternative solutions (2-3 options)
- Pros/cons for each
- ROI comparison
- Recommended approach

**Success Criteria:**
- Measurable outcomes
- Verification methods
- Acceptance tests

**Effort Estimate:**
- Implementation hours
- Testing hours
- Deployment hours
- Total effort

#### Step 2: Create Asana Task (supabase-asana-bridge)

**Task Structure:**
```
Title: [Reflection Cohort] Fix {taxonomy} issues ({N} reflections)

Description:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 ROOT CAUSE SUMMARY
{5-Why analysis summary}

⚡ AFFECTED COMPONENTS
{List of files/systems affected}

💰 ANNUAL ROI
${X,XXX} in time savings

📋 FIX PLAN
{Solution design with implementation steps}

🛡️ PREVENTION STEPS
{How to prevent recurrence}

📊 REFLECTION DETAILS
- Cohort ID: {cohort_id}
- Reflections: {N}
- Priority: {P0/P1/P2}
- Taxonomy: {taxonomy}

🔗 REFLECTION IDS
{List of reflection UUIDs}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Priority: {High/Medium/Low based on cohort priority}
Assignee: {auto-assigned or unassigned}
Due Date: {calculated based on priority}

Custom Fields:
- cohort_id: {UUID}
- reflection_ids: {comma-separated UUIDs}
- annual_roi: {dollar value}
- taxonomy: {category/subcategory}
```

#### Step 3: Update Reflection Statuses (Verified Batch Update)

**Saga Pattern Transaction:**

1. **Execute**: Update all reflections in cohort
   ```sql
   UPDATE reflections
   SET
     reflection_status = 'under_review',
     asana_task_id = '{task.gid}',
     asana_task_url = '{task.permalink_url}',
     reviewed_at = NOW(),
     reviewed_by = 'process-reflections-automation',
     cohort_id = '{cohort_id}'
   WHERE id IN ({reflection_ids})
   ```

2. **Wait**: 1000ms for Supabase consistency

3. **Verify**: Re-query each reflection
   ```sql
   SELECT reflection_status, asana_task_id
   FROM reflections
   WHERE id IN ({reflection_ids})
   ```

4. **Rollback** (if verification fails):
   ```sql
   UPDATE reflections
   SET
     reflection_status = 'new',
     asana_task_id = NULL,
     asana_task_url = NULL,
     reviewed_at = NULL,
     reviewed_by = NULL,
     cohort_id = NULL
   WHERE id IN ({updated_ids})
   ```

   **AND** attempt to delete Asana task (or log for manual cleanup)

---

## Expected Results

### Success Metrics

| Metric | Expected Value |
|--------|---------------|
| Asana Tasks Created | 13 |
| Reflections Updated | {Total from 13 cohorts} |
| Fix Plans Generated | 13 |
| Total Annual ROI | ${Sum of all cohort ROIs} |
| Execution Time | ~5-10 minutes (depends on cohort sizes) |
| Success Rate | 100% (with Saga rollback protection) |

### Output Files

```
reports/
├── reflection-plan-<timestamp>-execution-data.json  # Execution configuration
└── (archived after execution)

.claude/logs/
└── process-reflections-<timestamp>.log              # Detailed execution log

.claude/checkpoints/
└── process-reflections-execute.json                 # Resume checkpoint

.claude/dlq/
└── cohort_execution_failed-*.json                   # Failed cohorts (if any)
```

---

## Pre-Execution Validation

### Required Environment Variables

```bash
# Supabase (MANDATORY for updates - use service role key!)
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # NOT anon key!

# Asana
ASANA_ACCESS_TOKEN=2/xxx...
ASANA_REFLECTION_PROJECT_GID=xxx...  # or ASANA_PROJECT_GID

# Optional
HOURLY_RATE=50                       # For ROI calculations
```

### Pre-Flight Checks (Automatic)

The wrapper script and orchestration system automatically validate:

- ✅ Node.js installed
- ✅ jq installed (for JSON processing)
- ✅ Environment variables set
- ✅ Supabase connectivity (health check)
- ✅ Asana API accessibility
- ✅ Phase 1 data file exists
- ✅ Reports directory writable
- ✅ Service role key configured (not anon key)

---

## Failure Handling & Resilience

### Circuit Breakers

| Service | Failure Threshold | Reset Timeout | Action |
|---------|------------------|---------------|---------|
| Supabase | 5 failures | 30 seconds | Queue operations, retry after cooldown |
| Asana | 3 failures | 60 seconds | Queue task creation, retry after cooldown |

### Retry Strategy

- **Max Attempts**: 3 per operation
- **Base Delay**: 1 second
- **Backoff**: Exponential (2x multiplier)
- **Max Delay**: 30 seconds
- **Jitter**: ±25% to prevent thundering herd

### Dead Letter Queue (DLQ)

Failed cohorts are automatically added to DLQ with:
- Cohort ID and taxonomy
- Error message and stack trace
- Reflection count and ROI
- Timestamp and source

**Retry from DLQ:**
```bash
# List failed operations
ls -la .claude/dlq/

# Retry specific cohort
node .claude/scripts/process-reflections.js --execute=<execution-data> --cohort-id=<id>
```

### Checkpoint/Resume

Operations are checkpointed after each cohort:
```bash
# If interrupted, resume from last checkpoint
node .claude/scripts/process-reflections.js --execute=<execution-data> --resume
```

---

## Monitoring During Execution

### Progress Indicators

Watch for these console outputs:

```
✅ Cohort processed successfully
   - Fix plan generated
   - Asana task created: <URL>
   - X reflections updated

⚠️ Circuit breaker opened: <service>
   - Waiting 30s before retry...

🔄 Rolling back cohort: <taxonomy>
   - Reverting X reflections to 'new'
   - Logging Asana task for cleanup: <URL>

📦 Checkpoint saved
   - Last processed index: X/13
```

### Real-Time Logs

```bash
# Tail execution log
tail -f .claude/logs/process-reflections-*.log

# Watch checkpoint
watch -n 2 cat .claude/checkpoints/process-reflections-execute.json
```

---

## Post-Execution Verification

### 1. Check Asana Tasks

```bash
# Visit project in Asana
open "https://app.asana.com/0/${ASANA_REFLECTION_PROJECT_GID}"

# Should see 13 new tasks with [Reflection Cohort] prefix
```

### 2. Verify Reflection Statuses

```bash
# Query Supabase directly
echo "SELECT
  reflection_status,
  COUNT(*) as count,
  COUNT(DISTINCT cohort_id) as cohorts,
  SUM(roi_annual_value) as total_roi
FROM reflections
WHERE reflection_status = 'under_review'
GROUP BY reflection_status;" | psql $SUPABASE_URL
```

Expected output:
```
 reflection_status | count | cohorts | total_roi
-------------------+-------+---------+-----------
 under_review      |   XX  |   13    | $XXX,XXX
```

### 3. Review Execution Summary

The orchestration script generates:
```
═══════════════════════════════════════════════════════
  EXECUTION SUMMARY
═══════════════════════════════════════════════════════

Cohorts Processed: 13/13
Reflections Updated: XX
Failed Cohorts: 0

✅ Successfully Processed Cohorts:
   - tool-contract: 5 reflections → Asana task created
   - auth/permissions: 3 reflections → Asana task created
   ...

💰 EFFECTIVENESS & ROI TRACKING
   Baseline captured for future comparison
   Projected annual savings: $XXX,XXX

═══════════════════════════════════════════════════════
```

---

## Troubleshooting

### Issue: "SUPABASE_SERVICE_ROLE_KEY not set"

**Cause**: Missing or incorrect environment variable

**Solution**:
```bash
# Check .env file
cat .env | grep SUPABASE_SERVICE_ROLE_KEY

# Should start with "eyJ" and be ~200+ characters
# If using anon key (starts with "eyJ" but shorter), updates will fail!
```

### Issue: "Asana task creation failed: 401 Unauthorized"

**Cause**: Invalid or expired Asana token

**Solution**:
```bash
# Test token
curl -H "Authorization: Bearer $ASANA_ACCESS_TOKEN" \
  https://app.asana.com/api/1.0/users/me

# If 401, generate new token at:
# https://app.asana.com/0/my-apps
```

### Issue: "Update verification failed"

**Cause**: Using anon key instead of service role key, or Supabase RLS blocking updates

**Solution**:
```bash
# Verify you're using SERVICE ROLE key (not anon key)
echo $SUPABASE_SERVICE_ROLE_KEY | cut -c1-50
# Should see claims with 'service_role' in payload

# Check RLS policies allow updates
# Service role key bypasses RLS, so if this fails, key is wrong
```

### Issue: "Circuit breaker opened for Supabase"

**Cause**: Too many consecutive failures (rate limit or connectivity)

**Solution**:
- Wait for automatic recovery (30-60 seconds)
- Check Supabase dashboard for incidents
- Verify network connectivity
- Script will automatically retry after cooldown

### Issue: "Cohort added to DLQ"

**Cause**: Persistent failure after retries

**Solution**:
```bash
# Review DLQ entry
cat .claude/dlq/cohort_execution_failed-<timestamp>.json

# Fix underlying issue (network, credentials, etc.)

# Retry from checkpoint
node .claude/scripts/process-reflections.js --execute=<execution-data> --resume
```

---

## Next Steps After Phase 2

### Immediate (Within 24 hours)
1. ✅ Verify all 13 Asana tasks created correctly
2. ✅ Review fix plans in Asana task descriptions
3. ✅ Confirm reflection statuses updated in Supabase
4. ✅ Assign tasks to appropriate engineers/stakeholders

### Short-Term (1-2 weeks)
1. 📋 Stakeholders review and approve fix plans
2. ⚙️ Move approved tasks to "Accepted" status
3. 🔧 Begin implementation of fixes
4. 📊 Track implementation progress in Asana

### Medium-Term (3-4 weeks)
1. ✅ Deploy fixes to production
2. 🧪 Validate fixes against success criteria
3. 📝 Update reflection statuses to 'implemented'
4. 📊 Measure actual ROI vs projected ROI

### Long-Term (Ongoing)
1. 📈 Monitor reflection rate reduction by taxonomy
2. 🎯 Measure cohort effectiveness (recurrence rates)
3. 💰 Track cumulative ROI savings
4. 🔄 Continuous improvement of fix plans based on outcomes

---

## ROI Projection

Based on Phase 1 cohort analysis, Phase 2 is expected to address:

- **13 cohorts** representing recurring patterns
- **XX total reflections** (extract from phase1-data)
- **$XXX,XXX projected annual ROI** (sum of all cohort ROIs)
- **XX hours/month** in time savings (based on hourly rate)

**Baseline Capture**:
Phase 2 execution establishes baseline metrics for:
- Current reflection submission rate by taxonomy
- Issue recurrence frequency
- Time to resolution
- Fix effectiveness

**Future Measurement**:
After 7+ days, the system can measure:
- Reduction in reflection submissions
- Decrease in recurring issues
- Actual ROI vs projected ROI
- Cohort effectiveness scores

---

## Support & Debugging

### Logs Location
```
.claude/logs/process-reflections-<timestamp>.log
```

### Checkpoint Status
```
.claude/checkpoints/process-reflections-execute.json
```

### Dead Letter Queue
```
.claude/dlq/cohort_execution_failed-*.json
```

### Metrics
```
.claude/metrics/process_reflections-<timestamp>.json
```

### Contact
For issues or questions:
- Review execution logs first
- Check DLQ for failed operations
- Inspect checkpoint for resume state
- System maintains full audit trail

---

## ✅ READY TO EXECUTE

**Command**:
```bash
bash plugins/opspal-core/scripts/execute-phase2.sh --dry-run
```

**Review** the dry-run output, then execute live:
```bash
bash plugins/opspal-core/scripts/execute-phase2.sh
```

---

**Generated**: 2026-01-27
**Infrastructure Version**: v2.1.16+ (with task dependencies)
**Orchestration Script**: `.claude/scripts/process-reflections.js`
**Documentation**: `PHASE2_EXECUTION_PLAN.md`
