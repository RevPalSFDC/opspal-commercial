# Reflection Processing Workflow

This directory contains the automated reflection processing system that analyzes user feedback, detects patterns, generates fix plans, and tracks implementation.

## Overview

The reflection processing workflow is divided into two phases:

### Phase 1: Analysis & Planning (IMPLEMENTED)
- Fetches reflections with status='new' from Supabase
- Detects recurring issues (3+ occurrences)
- Groups reflections into cohorts using pattern matching
- Calculates cohort scores and priorities
- Generates improvement plan document for user approval
- **Does NOT modify database** - analysis only

### Phase 2: Implementation (TO BE IMPLEMENTED)
- Loads execution data from Phase 1
- Invokes `supabase-fix-planner` agent for each cohort
- Creates Asana tasks with comprehensive fix plans
- Updates reflection statuses from 'new' to 'under_review'
- Uses Saga pattern for automatic rollback on failure
- Generates final summary report

## Quick Start

### 1. Install Dependencies

```bash
cd /home/chris/Desktop/RevPal/Agents/opspal-internal-plugins/plugins/opspal-core
npm install @supabase/supabase-js dotenv
```

### 2. Configure Environment

```bash
# Copy example to .env
cp .env.example .env

# Edit .env and add your credentials
nano .env
```

Required variables:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Test Connection

```bash
node scripts/test-supabase-connection.js
```

Expected output:
```
🔍 Testing Supabase Connection

📋 Configuration Check:
   SUPABASE_URL: ✓ Set
   SUPABASE_SERVICE_ROLE_KEY: ✓ Set

🔌 Testing Connection (Service Role)...
   ✓ Connected successfully
   Total reflections in table: 42

📊 Reflection Status Breakdown:
   Reflections with status='new': 15
   ✓ Ready to process 15 reflections

✅ Supabase connection verified
```

### 4. Run Phase 1

```bash
node scripts/process-reflections-phase1.js
```

### 5. Review Improvement Plan

```bash
cat output/reflection-processing/improvement-plan-2026-01-27.md
```

### 6. Run Phase 2 (when ready)

```bash
# Phase 2 script to be implemented
node scripts/process-reflections-phase2.js
```

## Files

| File | Purpose |
|------|---------|
| `process-reflections-phase1.js` | Phase 1 execution script |
| `process-reflections-phase2.js` | Phase 2 execution script (to be implemented) |
| `test-supabase-connection.js` | Connection verification |
| `PHASE1_SETUP.md` | Detailed Phase 1 setup guide |
| `REFLECTION_PROCESSING_README.md` | This file |

## Output Files

Phase 1 generates:
- `output/reflection-processing/improvement-plan-YYYY-MM-DD.md` - Human-readable plan
- `output/reflection-processing/phase1-data-YYYY-MM-DD.json` - Machine-readable data

Phase 2 will generate:
- `output/reflection-processing/implementation-summary-YYYY-MM-DD.md` - Final report
- `output/reflection-processing/asana-tasks-YYYY-MM-DD.json` - Created tasks

## Architecture

### Cohort Detection

Reflections are grouped into cohorts based on:
- **Taxonomy** (40% weight) - High-level categorization
- **Root Cause** (30% weight) - Underlying issue
- **Affected Components** (20% weight) - System components
- **ROI** (10% weight) - Business impact

Minimum cohort size: **2 reflections**

### Priority Assignment

| Priority | Criteria | Action |
|----------|----------|--------|
| CRITICAL | 3+ occurrences | Immediate attention required |
| HIGH | 2 occurrences | High priority for next sprint |
| MEDIUM | 1 occurrence, high ROI | Consider for backlog |

### Scoring Formula

```
score = (frequency × 40) +
        (log10(totalROI + 1) × 10) +
        (1 / avgRecency × 30) +
        (breadth × 20)
```

Where:
- `frequency` = reflections in cohort
- `totalROI` = sum of annual ROI values
- `avgRecency` = average days since creation
- `breadth` = unique affected components

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Analysis & Planning (Analysis Only)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Fetch reflections (status='new')                       │
│          ↓                                                  │
│  2. Detect recurring issues (3+ occurrences)               │
│          ↓                                                  │
│  3. Detect cohorts (pattern matching)                      │
│          ↓                                                  │
│  4. Calculate scores & priorities                          │
│          ↓                                                  │
│  5. Generate improvement plan                              │
│          ↓                                                  │
│  6. Save outputs (plan + data)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        ↓
              [User Approval Required]
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Implementation (Modifies Database)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Load Phase 1 execution data                            │
│          ↓                                                  │
│  2. For each cohort:                                       │
│     a. Invoke supabase-fix-planner agent                   │
│     b. Generate comprehensive fix plan                     │
│     c. Create Asana task                                   │
│          ↓                                                  │
│  3. Saga Transaction:                                      │
│     a. Update reflections to 'under_review'                │
│     b. Link to Asana tasks                                 │
│     c. Auto-rollback on failure                            │
│          ↓                                                  │
│  4. Generate implementation summary                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Saga Pattern (Phase 2)

Phase 2 uses the Saga pattern for transactional integrity:

```javascript
const saga = new Saga({ name: 'Process Cohort' });

// Step 1: Update reflections
saga.addStep(
  async () => { /* Update to under_review */ },
  async () => { /* Rollback to new */ },
  'Update reflections'
);

// Step 2: Create processing log
saga.addStep(
  async () => { /* Write log */ },
  async () => { /* Delete log */ },
  'Create log'
);

await saga.execute(); // Auto-rollback on failure
```

## Integration with Supabase Workflow Manager

The Supabase Workflow Manager agent provides comprehensive workflow orchestration:

- Status transition validation
- Required field checks
- Concurrent update detection
- Asana task synchronization
- Pipeline metrics and reporting

See `.claude/agents/supabase-workflow-manager.md` for details.

## Monitoring & Metrics

### Key Metrics

| Metric | Source | Update Frequency |
|--------|--------|------------------|
| Total reflections | Supabase query | Real-time |
| Cohorts detected | Phase 1 output | Per run |
| Total ROI | Phase 1 calculation | Per run |
| Implementation rate | Status transitions | Daily |

### Health Checks

```bash
# Check reflection counts by status
node scripts/check-reflection-status.js

# Verify Asana sync status
node scripts/check-asana-sync.js

# Generate pipeline report
node scripts/generate-pipeline-report.js
```

## Best Practices

### Before Phase 1

1. Verify Supabase connection
2. Confirm reflections exist with status='new'
3. Review cohort detection thresholds
4. Ensure output directory is writable

### Between Phases

1. Review improvement plan thoroughly
2. Verify cohort assignments make sense
3. Check ROI calculations
4. Confirm Asana project exists
5. Get stakeholder approval

### After Phase 2

1. Verify all reflections updated correctly
2. Confirm Asana tasks created
3. Check for rollback failures
4. Review implementation summary
5. Schedule follow-up reviews

## Troubleshooting

### Phase 1 Issues

**No reflections found**:
- Verify reflections table exists
- Check status field values
- Confirm service role key has read access

**No cohorts detected**:
- Lower `minSize` threshold
- Adjust weight values
- Check reflection data quality (taxonomy, root_cause populated)

**Script timeout**:
- Reduce reflection count
- Increase Node.js memory: `node --max-old-space-size=4096`

### Phase 2 Issues (Future)

**Asana task creation fails**:
- Verify `ASANA_ACCESS_TOKEN` in .env
- Check project permissions
- Confirm project ID is correct

**Reflection update fails**:
- Verify service role key (not anon key)
- Check RLS policies
- Confirm reflection IDs exist

**Saga rollback triggered**:
- Check saga logs in `.claude/logs/`
- Review error messages
- Verify compensating actions

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | - | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | - | Service role key (for updates) |
| `SUPABASE_ANON_KEY` | No | - | Anon key (read-only) |
| `ASANA_ACCESS_TOKEN` | Phase 2 | - | Asana API token |
| `ASANA_WORKSPACE_ID` | Phase 2 | - | Default workspace |

### Script Constants

Edit `process-reflections-phase1.js`:

```javascript
const COHORT_CONFIG = {
  minSize: 2,              // Minimum reflections per cohort
  taxonomyWeight: 0.4,     // Taxonomy matching weight
  rootCauseWeight: 0.3,    // Root cause matching weight
  componentWeight: 0.2,    // Component overlap weight
  roiWeight: 0.1          // ROI value weight
};

const PRIORITY_THRESHOLDS = {
  CRITICAL: 3,  // 3+ occurrences
  HIGH: 2,      // 2 occurrences
  MEDIUM: 1     // Single occurrence
};
```

## API Reference

### Phase 1 Functions

```javascript
// Execute full Phase 1 workflow
const { executePhase1 } = require('./process-reflections-phase1');
const result = await executePhase1();

// Detect cohorts from reflections
const { detectCohorts } = require('./process-reflections-phase1');
const cohorts = detectCohorts(reflections);

// Calculate cohort scores
const { calculateCohortScores } = require('./process-reflections-phase1');
const scored = calculateCohortScores(cohorts, reflections);
```

### Phase 2 Functions (To Be Implemented)

```javascript
// Execute full Phase 2 workflow
const { executePhase2 } = require('./process-reflections-phase2');
const result = await executePhase2(phase1DataPath);

// Generate fix plan for cohort
const { generateFixPlan } = require('./process-reflections-phase2');
const plan = await generateFixPlan(cohort);

// Update reflections with Saga
const { updateReflectionsWithSaga } = require('./process-reflections-phase2');
const result = await updateReflectionsWithSaga(cohort, asanaTask);
```

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review Supabase Workflow Manager documentation
3. Check logs in `.claude/logs/`
4. Submit reflection via `/reflect` command

## Future Enhancements

- [ ] Real-time cohort detection (webhook-based)
- [ ] Machine learning for better pattern matching
- [ ] Automated fix plan generation (GPT-4)
- [ ] Integration with GitHub Issues
- [ ] Dashboard for pipeline visualization
- [ ] Slack notifications for critical cohorts
- [ ] A/B testing for fix effectiveness

---

**Version**: 1.0.0
**Last Updated**: 2026-01-27
**Maintainer**: RevPal Engineering
