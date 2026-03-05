# Phase 1: Reflection Processing Setup

This document explains how to set up and run Phase 1 of the reflection processing workflow.

## Prerequisites

### 1. Install Dependencies

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/plugins/opspal-core

# Install Supabase client and dotenv
npm install @supabase/supabase-js dotenv
```

### 2. Configure Environment Variables

Create a `.env` file in the `plugins/opspal-core/` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Anon key (for read-only operations)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**CRITICAL**: Use `SUPABASE_SERVICE_ROLE_KEY` for update operations. The anon key cannot update reflections due to RLS policies.

### 3. Verify Supabase Connection

Test your Supabase connection:

```bash
node scripts/test-supabase-connection.js
```

## Running Phase 1

### Basic Execution

```bash
node scripts/process-reflections-phase1.js
```

### Expected Output

```
🔍 Phase 1: Reflection Analysis & Planning

📥 Step 1: Fetching reflections with status="new"...
   Found 15 reflections to analyze

🔁 Step 2: Detecting recurring issues...
   Identified 3 recurring issue patterns

🎯 Step 3: Detecting cohorts via pattern matching...
   Detected 5 cohorts (min size: 2)

📊 Step 4: Calculating cohort scores and priorities...
   Prioritized 5 cohorts

📝 Step 5: Generating improvement plan document...

💾 Step 6: Saving outputs...

✅ Phase 1 Complete!

📄 Improvement Plan: /path/to/improvement-plan-2026-01-27.md
📊 Execution Data: /path/to/phase1-data-2026-01-27.json

📈 Summary:
   Total Reflections: 15
   Recurring Issues: 3
   Cohorts Detected: 5
   Critical Priority: 2
   High Priority: 2
   Total ROI: $45,000

🔜 Next Steps:
   1. Review improvement plan document
   2. Approve or modify recommendations
   3. Run Phase 2 to create Asana tasks and update statuses
```

## Output Files

Phase 1 generates two files in `output/reflection-processing/`:

### 1. Improvement Plan (`improvement-plan-YYYY-MM-DD.md`)

A human-readable markdown document containing:
- Executive summary with counts and ROI
- List of recurring issues (3+ occurrences)
- Detailed cohort analysis sorted by priority
- Recommended actions (placeholder for Phase 2)
- Next steps for Phase 2 execution

**Purpose**: Review and approval by stakeholders before creating Asana tasks.

### 2. Execution Data (`phase1-data-YYYY-MM-DD.json`)

A machine-readable JSON file containing:
- All reflection metadata (IDs, taxonomy, root causes)
- Recurring issue patterns
- Cohort definitions with scores and priorities

**Purpose**: Input for Phase 2 to create Asana tasks and update statuses.

## Cohort Detection Logic

### Pattern Matching

Cohorts are detected based on:
- **Taxonomy** (40% weight)
- **Root Cause** (30% weight)
- **Affected Components** (20% weight)
- **ROI** (10% weight)

### Minimum Cohort Size

Default: **2 reflections** (configurable in script)

### Priority Levels

| Priority | Criteria |
|----------|----------|
| CRITICAL | 3+ occurrences |
| HIGH | 2 occurrences |
| MEDIUM | 1 occurrence but high ROI |

### Scoring Formula

```
score = (frequency × 0.4 × 100) +
        (log10(totalROI + 1) × 0.1 × 100) +
        (1 / avgRecency × 0.3 × 100) +
        (breadth × 0.2 × 100)
```

Where:
- `frequency` = number of reflections in cohort
- `totalROI` = sum of all ROI values
- `avgRecency` = average days since reflection created
- `breadth` = unique affected components

## Configuration Options

Edit the script constants to adjust cohort detection:

```javascript
const COHORT_CONFIG = {
  minSize: 2,              // Minimum reflections per cohort
  taxonomyWeight: 0.4,     // Weight for taxonomy matching
  rootCauseWeight: 0.3,    // Weight for root cause matching
  componentWeight: 0.2,    // Weight for component overlap
  roiWeight: 0.1          // Weight for ROI value
};

const PRIORITY_THRESHOLDS = {
  CRITICAL: 3,  // 3+ occurrences
  HIGH: 2,      // 2 occurrences
  MEDIUM: 1     // Single occurrence
};
```

## Troubleshooting

### Error: Missing Supabase credentials

```
❌ Missing Supabase credentials
   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   Check .env file in plugins/opspal-core/
```

**Solution**: Create `.env` file with valid Supabase credentials.

### Error: Failed to fetch reflections

```
Failed to fetch reflections: connect ECONNREFUSED
```

**Solutions**:
1. Verify `SUPABASE_URL` is correct
2. Check network connectivity
3. Verify Supabase project is active

### Warning: No new reflections to process

```
✅ No new reflections to process
```

**Explanation**: All reflections already have status other than 'new'. This is expected if Phase 1 has already been run or if no new reflections exist.

### Warning: No cohorts detected

```
⚠️  No cohorts detected - all reflections are unique
   Consider processing individually or adjusting cohort thresholds
```

**Solutions**:
1. Lower `minSize` to 1 (process all reflections)
2. Adjust weight values to be more lenient
3. Process reflections individually without cohorts

## Next Steps

After Phase 1 completes successfully:

1. **Review** the improvement plan document (`improvement-plan-*.md`)
2. **Verify** cohort detection makes sense
3. **Modify** recommendations if needed
4. **Approve** for Phase 2 execution
5. **Run Phase 2** (when ready):
   ```bash
   node scripts/process-reflections-phase2.js
   ```

## Phase 2 Preview

Phase 2 will:
1. Load execution data from Phase 1
2. Invoke `supabase-fix-planner` agent for each cohort
3. Create Asana tasks with fix plans
4. Update reflection statuses from 'new' to 'under_review'
5. Use Saga pattern for automatic rollback on failure
6. Generate final summary report

**IMPORTANT**: Phase 2 requires user approval to proceed. It will modify data (create tasks, update statuses).
