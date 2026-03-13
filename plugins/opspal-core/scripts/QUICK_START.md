# Phase 1: Quick Start Guide

Execute Phase 1 analysis in under 5 minutes.

## TL;DR

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/plugins/opspal-core
bash scripts/run-phase1.sh
```

The script will:
1. Check your environment
2. Install missing packages (if needed)
3. Test Supabase connection
4. Execute Phase 1 analysis
5. Generate improvement plan

## Step-by-Step

### 1. Navigate to Plugin Directory

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/plugins/opspal-core
```

### 2. Configure Environment (First Time Only)

```bash
# Copy example
cp .env.example .env

# Edit with your credentials
nano .env
```

Add:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find credentials**:
- Supabase Dashboard → Settings → API
- Copy "Project URL" for `SUPABASE_URL`
- Copy "service_role" key for `SUPABASE_SERVICE_ROLE_KEY`

### 3. Run Phase 1

```bash
bash scripts/run-phase1.sh
```

**Expected runtime**: 10-30 seconds (depending on reflection count)

### 4. Review Output

```bash
# View improvement plan
cat output/reflection-processing/improvement-plan-$(date +%Y-%m-%d).md

# Or list all plans
ls -lh output/reflection-processing/
```

## What Phase 1 Does

1. ✅ Fetches all reflections with status='new'
2. ✅ Detects recurring issues (3+ occurrences)
3. ✅ Groups into cohorts via pattern matching
4. ✅ Calculates scores and priorities
5. ✅ Generates improvement plan document
6. ✅ Saves execution data for Phase 2

**DOES NOT**:
- ❌ Create Asana tasks
- ❌ Update reflection statuses
- ❌ Modify database

## Example Output

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

📈 Summary:
   Total Reflections: 15
   Recurring Issues: 3
   Cohorts Detected: 5
   Critical Priority: 2
   High Priority: 2
   Total ROI: $45,000
```

## Interpreting Results

### Cohort Priorities

| Priority | Meaning | Action |
|----------|---------|--------|
| CRITICAL | 3+ occurrences | Fix immediately |
| HIGH | 2 occurrences | Fix next sprint |
| MEDIUM | 1 occurrence, high ROI | Consider for backlog |

### Cohort Score

Higher score = higher priority for implementation

Scoring factors:
- **Frequency** (40%) - How often the issue occurs
- **Root Cause** (30%) - Recency and consistency
- **Components** (20%) - Breadth of impact
- **ROI** (10%) - Business value

## Next Steps

1. **Review** improvement plan
2. **Verify** cohort assignments
3. **Approve** for Phase 2
4. **Run Phase 2** (when ready):
   ```bash
   node scripts/process-reflections-phase2.js
   ```

## Troubleshooting

### Script fails with "Missing .env file"

```bash
cp .env.example .env
# Edit with your Supabase credentials
```

### "No reflections with status='new' found"

This is expected if:
- All reflections have been processed
- No new reflections submitted recently
- Reflections have different status values

Check reflection table:
```bash
node scripts/test-supabase-connection.js
```

### "Connection failed"

1. Verify `SUPABASE_URL` in .env
2. Check `SUPABASE_SERVICE_ROLE_KEY` is correct
3. Confirm network connectivity
4. Verify Supabase project is active

### "Missing packages"

The script will prompt to install automatically. If it fails:

```bash
npm install @supabase/supabase-js dotenv
```

## Advanced Usage

### Manual Execution (skip pre-flight checks)

```bash
node scripts/process-reflections-phase1.js
```

### Test Connection Only

```bash
node scripts/test-supabase-connection.js
```

### Adjust Cohort Detection

Edit `scripts/process-reflections-phase1.js`:

```javascript
const COHORT_CONFIG = {
  minSize: 2,              // Lower to 1 to process all
  taxonomyWeight: 0.4,     // Adjust weights
  rootCauseWeight: 0.3,
  componentWeight: 0.2,
  roiWeight: 0.1
};
```

## Files Generated

| File | Location | Purpose |
|------|----------|---------|
| Improvement Plan | `output/reflection-processing/improvement-plan-YYYY-MM-DD.md` | Human-readable plan for review |
| Execution Data | `output/reflection-processing/phase1-data-YYYY-MM-DD.json` | Machine-readable data for Phase 2 |

## Getting Help

- Detailed setup: `scripts/PHASE1_SETUP.md`
- Full documentation: `scripts/REFLECTION_PROCESSING_README.md`
- Implementation summary: `output/PHASE1_IMPLEMENTATION_SUMMARY.md`

---

**Estimated Time**: 5 minutes (first run), 1 minute (subsequent runs)
**Complexity**: Low (automated pre-flight checks)
**Risk**: None (read-only operation)
