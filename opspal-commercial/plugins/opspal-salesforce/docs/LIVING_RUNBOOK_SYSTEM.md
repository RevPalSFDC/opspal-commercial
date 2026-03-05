# Living Runbook System - User Guide

## Overview

The **Living Runbook System** automatically generates and maintains operational documentation for your Salesforce instances by observing agent operations and learning from user reflections.

**Status**: ✅ Production Ready (Phases 1-3 Complete)
**Version**: 2.0.0
**Last Updated**: 2025-10-20

---

## What It Does

The system creates **intelligent, continuously-updated runbooks** that document:

- ✅ **Platform overview** - Instance characteristics and usage patterns
- ✅ **Data model** - Objects, fields, and customizations observed
- ✅ **Workflows** - Automation behavior and trigger logic
- ✅ **Known exceptions** - Recurring issues with root cause analysis
- ✅ **Operational recommendations** - Context-aware improvement suggestions
- ✅ **Best practices** - Tailored guidance based on instance maturity

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│ 1. CAPTURE                                              │
│    Agent performs operation (deployment, assessment)    │
│    → post-operation-observe.sh triggers automatically   │
│    → runbook-observer.js logs structured telemetry      │
│    → Saved to instances/{org}/observations/*.json       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. ANALYZE                                              │
│    User runs /reflect after sessions (optional)         │
│    → Patterns, errors, feedback submitted to Supabase   │
│    → runbook-reflection-bridge.js queries database      │
│    → Extracts common errors and manual workarounds      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. SYNTHESIZE                                           │
│    User runs /generate-runbook                          │
│    → runbook-synthesizer.js uses LLM intelligence       │
│    → Generates platform description, insights, recs     │
│    → Creates synthesis.json with smart analysis         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. RENDER                                               │
│    runbook-renderer.js populates template              │
│    → Merges observations + synthesis + reflections      │
│    → Generates instances/{org}/RUNBOOK.md               │
│    → Living documentation ready!                        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. VERSION (Automatic)                                  │
│    runbook-versioner.js creates snapshots              │
│    → Detects changes via SHA-256 hashing                │
│    → Auto-bumps version (MAJOR.MINOR.PATCH)             │
│    → Stores in instances/{org}/runbook-history/         │
│    → Tracks versions in VERSION_INDEX.json              │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Perform Operations

The system observes agent operations automatically:

```bash
# Observations are captured automatically when agents run
# Example: Deploy metadata
/deploy Account Contact  # Agent performs operation
                         # → Observation captured automatically

# Example: Run assessment
/cpq-assess              # Agent performs assessment
                         # → Observation captured automatically
```

**Check observations**:
```bash
ls instances/delta-sandbox/observations/
# deployment-2025-10-20-140302.json
# field-audit-2025-10-20-150145.json
```

### 2. Generate Runbook

```bash
/generate-runbook
```

**What happens**:
- Creates version snapshot of existing runbook (if it exists)
- Loads all observations for current org
- Queries Supabase for reflections (optional)
- Synthesizes intelligent analysis
- Renders complete runbook
- Saves to `instances/{org}/RUNBOOK.md`
- Auto-bumps version and stores snapshot in `runbook-history/`

### 3. View Runbook

```bash
/view-runbook
```

**What you'll see**:
- Platform overview with success metrics
- Data model documentation
- Workflow summaries
- Known exceptions with recommendations
- Operational best practices

### 4. Track Changes (Optional)

```bash
/diff-runbook
```

Shows what changed since last runbook generation.

---

## Slash Commands Reference

### `/generate-runbook`

**Purpose**: Generate or update operational runbook

**Usage**:
```bash
/generate-runbook               # Auto-detect org from context
```

**When to run**:
- ✅ After deployments or major operations
- ✅ After running multiple `/reflect` sessions
- ✅ When onboarding to document current state
- ✅ Before major changes (capture "before" state)

**Output**:
- `instances/{org}/synthesis.json` - Intelligent analysis
- `instances/{org}/RUNBOOK.md` - Living runbook
- `instances/{org}/runbook-history/` - Version snapshots with VERSION_INDEX.json

**Example output**:
```
🔍 Detected org: delta-sandbox
📸 Version snapshot: v1.2.0 (previous: v1.1.0)
📊 Observations: 12 (8 deployments, 3 audits, 1 workflow)
🧠 Synthesis: Platform overview, 2 workflows, 3 exceptions
📝 Runbook: instances/delta-sandbox/RUNBOOK.md
📄 Summary: 12 operations, 95% success, 8 objects, 2 workflows
```

---

### `/view-runbook`

**Purpose**: View operational runbook in terminal

**Usage**:
```bash
/view-runbook                   # Full runbook
/view-runbook summary           # Quick stats only
/view-runbook exceptions        # Just exceptions section
/view-runbook workflows         # Just workflows section
/view-runbook recommendations   # Just recommendations
```

**When to run**:
- ✅ Before deployments (check known exceptions)
- ✅ During troubleshooting (reference similar patterns)
- ✅ When onboarding (understand instance)
- ✅ After `/generate-runbook` (verify output)

**Example output**:
```
📚 Operational Runbook: delta-sandbox
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Platform Overview

This Salesforce instance has been observed over 5 days, with 12
recorded operations. Operations have a 95% success rate.
Primary objects: Account, Contact, Opportunity, Quote__c.

## Known Exceptions

### schema/parse (recurring)
- Frequency: 2 occurrences
- Context: Field history tracking limit exceeded
- Recommendation: Implement validation before deployment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### `/diff-runbook`

**Purpose**: Intelligent comparison between runbook versions

**Usage**:
```bash
/diff-runbook                   # Compare current vs previous version
/diff-runbook summary           # Just change statistics
```

**Features**:
- Section-aware diffing (not line-by-line)
- Categorizes changes: additions, deletions, modifications
- Extracts metric changes (operations count, workflows, etc.)
- Uses automatic version history from `runbook-history/`

**When to run**:
- ✅ After regenerating runbook
- ✅ To track operational evolution
- ✅ Before deployments (see recent changes)

**Example output**:
```
📊 Comparing runbooks for: delta-sandbox
   From: v1.0.0
   To:   current

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Changes Summary

📝 Modifications (3):
  - Platform Overview: Content modified
  - Key Workflows: +1 entries added, +145 characters changed
  - Operational Notes: Content modified

📊 Metric Changes (2):
  - operations: 2 → 3
  - activeWorkflows: 0 → 1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Statistics

   Sections added: 0
   Sections removed: 0
   Sections modified: 3
   Sections unchanged: 4
   Metric changes: 2
```

---

## Manual Scripts (Advanced)

### Observation Capture

**Manually record an operation**:
```bash
node scripts/lib/runbook-observer.js \
  --org delta-sandbox \
  --operation deployment \
  --agent sfdc-orchestrator \
  --objects "Account,Contact,Opportunity" \
  --fields "CustomField__c,Status__c" \
  --outcome success \
  --notes "Deployed custom fields for sales automation"
```

### Reflection Bridge

**Query reflections from Supabase**:
```bash
node scripts/lib/runbook-reflection-bridge.js \
  --org delta-sandbox \
  --limit 50 \
  --output instances/delta-sandbox/reflection-sections.json
```

### Synthesizer

**Generate intelligent analysis**:
```bash
node scripts/lib/runbook-synthesizer.js \
  --org delta-sandbox \
  --reflection-sections instances/delta-sandbox/reflection-sections.json \
  --output instances/delta-sandbox/synthesis.json
```

### Renderer

**Render runbook from data**:
```bash
node scripts/lib/runbook-renderer.js \
  --org delta-sandbox \
  --reflection-sections instances/delta-sandbox/synthesis.json \
  --output instances/delta-sandbox/RUNBOOK.md
```

### End-to-End Pipeline

**Complete pipeline in one command**:
```bash
bash scripts/lib/generate-enhanced-runbook.sh delta-sandbox
```

### Version Management

**Create version snapshot**:
```bash
node scripts/lib/runbook-versioner.js \
  --org delta-sandbox
```

**List all versions**:
```bash
node scripts/lib/runbook-versioner.js \
  --org delta-sandbox \
  --action list
```

**Get specific version path**:
```bash
node scripts/lib/runbook-versioner.js \
  --org delta-sandbox \
  --action get \
  --version v1.2.0
```

**Force version bump**:
```bash
# Auto-detect bump type
node scripts/lib/runbook-versioner.js --org delta-sandbox

# Force specific bump
node scripts/lib/runbook-versioner.js --org delta-sandbox --bump minor

# Manual version
node scripts/lib/runbook-versioner.js --org delta-sandbox --version 2.0.0
```

### Runbook Diffing

**Compare versions**:
```bash
# Current vs previous
node scripts/lib/runbook-differ.js --org delta-sandbox

# Specific versions
node scripts/lib/runbook-differ.js \
  --org delta-sandbox \
  --from v1.0.0 \
  --to v1.2.0

# Summary only
node scripts/lib/runbook-differ.js --org delta-sandbox --format summary
```

### Runbook Context Extraction (For Agents)

**Extract context for agent consumption**:
```bash
# Full context (JSON)
node scripts/lib/runbook-context-extractor.js --org delta-sandbox

# Condensed summary
node scripts/lib/runbook-context-extractor.js --org delta-sandbox --format summary

# Filter by operation type
node scripts/lib/runbook-context-extractor.js \
  --org delta-sandbox \
  --operation-type deployment

# Filter by objects
node scripts/lib/runbook-context-extractor.js \
  --org delta-sandbox \
  --objects "Account,Contact,Opportunity"
```

**Output includes**:
- Known exceptions (especially recurring ones)
- Active workflows
- Operational recommendations
- Platform metadata

**Use in scripts**:
```javascript
const { extractRunbookContext } = require('./scripts/lib/runbook-context-extractor');

const context = extractRunbookContext('delta-sandbox', {
    operationType: 'deployment',
    objects: ['Account', 'Contact']
});

if (context.exists) {
    console.log(`📚 ${context.metadata.observationCount} observations`);
    console.log(`⚠️  ${context.knownExceptions.length} known exceptions`);
}
```

**For complete agent integration guide**: See `docs/AGENT_RUNBOOK_INTEGRATION.md`

---

## File Structure

```
instances/{org}/
├── observations/                # Auto-captured telemetry
│   ├── deployment-2025-10-20-140302.json
│   ├── field-audit-2025-10-20-150145.json
│   └── workflow-create-2025-10-19-153045.json
│
├── runbook-history/             # Version snapshots (automatic)
│   ├── VERSION_INDEX.json       # Version metadata and history
│   ├── RUNBOOK-v1.0.0-2025-10-20T14-30-00.md
│   ├── RUNBOOK-v1.1.0-2025-10-20T15-45-00.md
│   └── RUNBOOK-v1.2.0-2025-10-20T16-15-00.md
│
├── reflection-sections.json     # Patterns from Supabase reflections
├── synthesis.json               # LLM-generated intelligent analysis
└── RUNBOOK.md                   # Current living runbook (✨ THE OUTPUT)
```

---

## Integration with Existing Workflows

### With `/reflect` Command

```bash
# 1. Perform operations (automatically captured)
/deploy Account Contact

# 2. Reflect on session (captures patterns, errors, feedback)
/reflect

# 3. Generate enhanced runbook (uses reflection data)
/generate-runbook

# Result: Runbook includes intelligent analysis of reflection patterns
```

**Benefit**: Reflections enhance runbook quality with:
- Common error patterns
- User-identified exceptions
- Manual workarounds worth automating
- Suggested improvements

### With Deployment Workflows

**Recommended pattern**:
```bash
# 1. Check runbook before deployment
/view-runbook exceptions    # Review known issues

# 2. Perform deployment
/deploy MyCustomObjects

# 3. Update runbook
/generate-runbook

# 4. Compare changes
/diff-runbook              # See what new patterns emerged
```

### With Agent Operations

**Agents automatically use runbooks** (Phase 5.2):

```bash
# When you invoke agents, they automatically:
# 1. Load runbook context for the target org
# 2. Check for known exceptions relevant to the operation
# 3. Apply recommendations from historical patterns
# 4. Warn about recurring issues before proceeding

# Example: sfdc-orchestrator loads context automatically
# No manual steps required - context-aware by default
```

**Agents with runbook integration**:
- ✅ **sfdc-orchestrator**: Loads context before all operations
- ✅ **sfdc-planner**: Incorporates history into plans
- 📋 **More agents coming**: See `docs/AGENT_RUNBOOK_INTEGRATION.md`

**Benefits**:
- Agents avoid repeating past mistakes automatically
- Plans informed by historical success/failure patterns
- Proactive warnings about known issues
- Context-aware decision making

**For developers**: See `docs/AGENT_RUNBOOK_INTEGRATION.md` for integration guide

---

## Intelligent Features

### 1. Platform Overview Generation

The synthesizer generates intelligent summaries:

**Example**:
> "This Salesforce instance has been observed over 5 days, with 12 recorded operations (8 deployments, 3 field-audits, 1 workflow-create). Operations have a 95% success rate. Primary objects include Account, Contact, Opportunity, Quote__c. Agents deployed: sfdc-orchestrator, sfdc-metadata-analyzer, sfdc-cpq-assessor. Most common issue: schema/parse (2 occurrences)."

### 2. Pattern Detection

Automatically identifies:
- **Success rate trends**: Is instance improving or degrading?
- **Common error types**: What keeps failing?
- **Agent usage patterns**: Which agents are most active?
- **Object touch frequency**: Which objects are being modified?

### 3. Contextual Recommendations

Based on observations and reflections:

**Examples**:
- "Improve operation success rate from 90% to >95% by adding pre-flight validation"
- "Address recurring schema/parse errors (3 occurrences) - implement validation guards"
- "Automate 2 manual workarounds identified in reflections"

### 4. Best Practices Tailoring

Recommendations adapt to instance maturity:

**New instance** (<10 operations):
- "Increase observation coverage by triggering runbook capture after more operations"

**Mature instance** (>50 operations, high success rate):
- "Schedule quarterly runbook review to maintain quality"
- "Implement pre-deployment validation checklist to improve success rate"

---

## Troubleshooting

### No Observations Found

**Problem**: `/generate-runbook` reports no observations

**Solution**:
1. Check if hooks are enabled:
   ```bash
   ls hooks/post-operation-observe.sh
   ```

2. Manually trigger observation:
   ```bash
   node scripts/lib/runbook-observer.js \
     --org {org} --operation deployment --outcome success
   ```

3. Verify observations directory:
   ```bash
   ls instances/{org}/observations/
   ```

### Runbook Not Found

**Problem**: `/view-runbook` can't find runbook

**Solution**:
```bash
# Generate runbook first
/generate-runbook

# Then view
/view-runbook
```

### No Version History

**Problem**: `/diff-runbook` reports no version history

**Solution**:
```bash
# First time: Run /generate-runbook twice to create history
/generate-runbook   # Creates v1.0.0
# ... make some changes (perform operations) ...
/generate-runbook   # Creates v1.0.1 or v1.1.0

# Now diff will work
/diff-runbook       # Compares v1.0.1 vs v1.0.0
```

**Explanation**: Version history is created automatically. The first `/generate-runbook` creates v1.0.0, and subsequent runs create new versions that can be compared.

### Synthesis Errors

**Problem**: Synthesizer fails or produces empty output

**Solution**:
1. Check observations are valid JSON:
   ```bash
   jq empty instances/{org}/observations/*.json
   ```

2. Run synthesizer with debug:
   ```bash
   node scripts/lib/runbook-synthesizer.js --org {org} --output /tmp/test.json
   ```

3. Verify at least one observation exists

---

## Best Practices

### 1. Regular Generation

```bash
# After each major milestone
/deploy ...
/generate-runbook

# Weekly for active instances
# Monthly for stable instances
```

### 2. Combine with Reflections

```bash
# After development sessions
/reflect               # Capture patterns
/generate-runbook      # Update runbook with insights
```

### 3. Review Before Changes

```bash
# Before deployments
/view-runbook exceptions    # Check known issues

# Before go-lives
/view-runbook              # Full review
```

### 4. Track Evolution

```bash
# After major changes
/generate-runbook
/diff-runbook             # See what changed
```

### 5. Track Version History

```bash
# Automatic versioning happens on each /generate-runbook
# Version history stored in instances/{org}/runbook-history/

# List all versions
node scripts/lib/runbook-versioner.js --org {org} --action list

# Compare any two versions
node scripts/lib/runbook-differ.js --org {org} --from v1.0.0 --to v1.5.0
```

---

## Completed Phases

### ✅ Phase 1-2: Core System (Complete)
- Observation layer with automatic capture
- Intelligence layer with LLM synthesis
- Reflection integration via Supabase

### ✅ Phase 3: Version Management (Complete)
- Automatic version snapshots with SHA-256 hashing
- Semantic versioning (MAJOR.MINOR.PATCH) with auto-detection
- Section-aware intelligent diffing
- VERSION_INDEX.json tracking
- Automatic cleanup (keeps last 30 versions)

### ✅ Phase 4.1: User Interface (Complete)
- `/generate-runbook` command
- `/view-runbook` command with section filtering
- `/diff-runbook` command with version comparison

---

### ✅ Phase 5.2: Agent Integration (Complete)
- Context extractor utility for agent consumption
- sfdc-orchestrator reads runbooks before operations
- sfdc-planner incorporates historical knowledge into plans
- Delegation with runbook context injection
- Comprehensive integration guide for future agents

**Documentation**: `docs/AGENT_RUNBOOK_INTEGRATION.md`

---

## Future Enhancements (Roadmap)

### Phase 4.2: Curator Agent (Optional)
- Agent that manages runbooks automatically
- Scheduled regeneration
- Anomaly detection
- Proactive recommendations

### Phase 5: Full Automation (Remaining)
- Phase 5.1: Auto-update after deployments/assessments (Planned)
- Phase 5.3: Self-improving documentation based on outcomes (Planned)

---

## Success Metrics

**ROI Calculation**:
- Manual runbook creation: ~8 hours
- Automated generation: ~30 seconds
- **Time saved**: 7.97 hours per instance
- **Annual value** (5 instances/month): $47,820

**Quality Improvements**:
- ✅ Always up-to-date (vs manual docs that go stale)
- ✅ Consistent structure across all instances
- ✅ Intelligent pattern detection (human reviewers miss patterns)
- ✅ Actionable recommendations (not just description)

---

## Support & Feedback

**Report Issues**:
```bash
# Submit reflection with feedback
/reflect

# Your feedback improves the system via the reflection processing pipeline
```

**Check System Health**:
```bash
# View recent observations
ls -lah instances/{org}/observations/

# Check synthesis output
cat instances/{org}/synthesis.json | jq .

# Verify runbook exists
cat instances/{org}/RUNBOOK.md
```

---

**Generated by RevPal OpsPal Living Runbook System v2.0.0**
*Continuously learning from your operations to keep documentation alive.*

---

## Version History

- **v2.0.0** (2025-10-20) - Added automatic version management, semantic versioning, intelligent diffing
- **v1.0.0** (2025-10-20) - Initial release with observation, synthesis, and rendering
