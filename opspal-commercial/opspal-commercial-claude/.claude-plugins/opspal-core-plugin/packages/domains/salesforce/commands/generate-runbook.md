---
name: generate-runbook
description: Generate or update operational runbook from observations and reflections
allowed-tools: Read, Bash, Write, Grep, Glob
thinking-mode: enabled
---

# Generate Operational Runbook

## Purpose

**What this command does**: Generates or updates an operational runbook for a Salesforce instance by synthesizing observations from agent operations and patterns from user reflections.

**When to use it**:
- ✅ After completing a series of operations (deployments, assessments, configurations)
- ✅ When you want to document current instance state and operational patterns
- ✅ To create a reference guide for future operations on this instance
- ✅ Before major deployments (to capture "before" state)

**When NOT to use it**:
- ❌ When no operations have been performed yet (no data to synthesize)
- ❌ For read-only exploration (use for documentation, not just viewing)

## Prerequisites

### Required
- **Org authentication**: Must have authenticated to a Salesforce org
- **Observations**: At least one operation should have been captured (automatic via hooks)

### Optional
- **Reflections**: User reflections from `/reflect` command enhance quality
- **Previous runbook**: Updates existing runbook or creates new one

## Usage

### Basic Usage

```bash
/generate-runbook
```

**What happens**:
1. Auto-detects current org from context or prompts for selection
2. Loads observations from `instances/{org}/observations/`
3. Queries reflections from Supabase (if available)
4. Synthesizes intelligent analysis using LLM
5. Renders runbook template with data
6. Saves to `instances/{org}/RUNBOOK.md`
7. Reports summary statistics

**Duration**: 10-30 seconds depending on observation count

### With Specific Org

If working directory doesn't clearly indicate an org, or to generate for a different org:

```bash
# Agent will prompt for org selection from available instances
/generate-runbook
```

## Examples

### Example 1: After Deployment Session

**Scenario**: You deployed metadata and want to document the changes

**Command**:
```bash
/generate-runbook
```

**Expected Output**:
```
🔍 Detecting org from context...
✓ Org detected: rentable-sandbox

📊 Loading observations...
✓ Found 5 observations
  - 2 deployment operations
  - 2 field-audit operations
  - 1 workflow-create operation

🧠 Synthesizing intelligent analysis...
✓ Platform overview generated (342 characters)
✓ Workflow insights: 1 workflow analyzed
✓ Recommendations: 3 generated

📝 Rendering runbook...
✓ Runbook updated: instances/rentable-sandbox/RUNBOOK.md

📄 Summary:
   Operations: 5 (100% success rate)
   Objects: 8
   Workflows: 1
   Recommendations: 3
   Best Practices: 5

🎉 Runbook ready! Use /view-runbook to read it.
```

### Example 2: First Time Generation

**Scenario**: New instance, first runbook creation

**Command**:
```bash
/generate-runbook
```

**Expected Output**:
```
🔍 Available instances:
  1. rentable-sandbox (5 observations)
  2. peregrine-main (2 observations)
  3. hivemq (0 observations - new)

Which instance? 1

📊 Loading observations for rentable-sandbox...
✓ Found 5 observations

⚠️  No reflections found for this org
   (This is normal - reflections enhance quality but aren't required)

🧠 Synthesizing intelligent analysis...
✓ Analysis complete

📝 Creating new runbook...
✓ Runbook created: instances/rentable-sandbox/RUNBOOK.md

📄 Summary:
   Operations: 5
   Objects: 8
   Success Rate: 100%

💡 Tip: Run /reflect after development sessions to improve runbook quality
```

### Example 3: No Observations Available

**Scenario**: Attempting to generate runbook before any operations

**Command**:
```bash
/generate-runbook
```

**Expected Output**:
```
🔍 Detecting org: peregrine-sandbox

⚠️  No observations found for this org

💡 Observations are captured automatically when agents perform operations.
   To generate a runbook:
   1. Perform operations (deployments, assessments, etc.)
   2. Observations will be captured via post-operation hooks
   3. Then run /generate-runbook

Alternatively, you can manually create observations:
   node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-observer.js --org peregrine-sandbox \
     --operation deployment --objects "Account,Contact" --outcome success
```

## Decision Tree

**Use this decision tree to determine if you should run /generate-runbook:**

```
Start Here
  ↓
Have you performed operations on this instance?
  ├─ YES → Are there observations in instances/{org}/observations/?
  │         ├─ YES → Run /generate-runbook ✅
  │         │         (Generate or update runbook)
  │         │
  │         └─ NO → Check if hooks are enabled ⚠️
  │                   (Observations may not be capturing)
  │
  └─ NO → Have you just authenticated to a new org?
            ├─ YES → Perform operations first ❌
            │         (Nothing to document yet)
            │
            └─ NO → Do you want to document an existing instance?
                      Run /generate-runbook to see what's available
```

**Key Decision Factors**:
- ✅ **RUN** after: Deployments, assessments, configuration changes, workflow creation
- ⚠️  **OPTIONAL** after: Initial org setup (creates baseline runbook)
- ❌ **SKIP** if: No operations performed, brand new org with no configuration

## OBJECTIVE (For Agent Context)

Generate an operational runbook by:
1. Detecting the target Salesforce org from context or user input
2. Loading all available observations from disk
3. Querying reflections from Supabase (non-fatal if unavailable)
4. Synthesizing intelligent analysis using the runbook-synthesizer
5. Rendering the runbook template with merged data
6. Saving the output and reporting metrics

## PROCESS

### 1) Org Detection

**Auto-detect** from:
- Current working directory path (e.g., `instances/rentable-sandbox/`)
- Environment variable `$ORG`
- Recent org authentication (via `sf config get target-org`)

**If ambiguous**:
- List available instances with observation counts
- Prompt user to select

### 2) Load Observations

```bash
# Count observations
ls instances/{org}/observations/*.json | wc -l
```

**If zero observations**:
- Explain that observations are needed
- Provide guidance on how to trigger observation capture
- Exit gracefully

**If observations found**:
- Report count and types
- Continue to synthesis

### 3) Query Reflections (Optional)

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-reflection-bridge.js \
  --org {org} \
  --limit 50 \
  --output instances/{org}/reflection-sections.json
```

**Handle failures gracefully**:
- No internet connection: Continue without reflections
- No Supabase data: Continue without reflections
- API errors: Log warning, continue

### 4) Synthesize Intelligence

```bash
# With reflections
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-synthesizer.js \
  --org {org} \
  --reflection-sections instances/{org}/reflection-sections.json \
  --output instances/{org}/synthesis.json

# Without reflections
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-synthesizer.js \
  --org {org} \
  --output instances/{org}/synthesis.json
```

**Report synthesis metrics**:
- Platform description length
- Workflow insights count
- Recommendations count
- Best practices count

### 5) Render Runbook

```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-renderer.js \
  --org {org} \
  --reflection-sections instances/{org}/synthesis.json \
  --output instances/{org}/RUNBOOK.md
```

**Verify output**:
- Check file exists
- Report file size and location
- Extract key metrics from synthesis

### 6) Summary Report

Present to user:
```
✅ Runbook generated successfully

📄 Location: instances/{org}/RUNBOOK.md

📊 Metrics:
   Operations Observed: {count}
   Success Rate: {percentage}%
   Objects: {count}
   Workflows: {count}
   Known Exceptions: {count}
   Recommendations: {count}

💡 Next Steps:
   - View: /view-runbook
   - Compare: /diff-runbook (if previous version exists)
   - Improve: Run /reflect after sessions to enhance quality
```

## CONSTRAINTS

- **Performance**: Complete within 30 seconds for typical instances
- **Resilience**: Non-fatal failures for optional steps (reflections)
- **Clarity**: Clear error messages if required data missing
- **Automation**: Minimize user prompts via smart defaults

## OUTPUT FORMAT

### Success
```
🔍 Detected org: {org}
📊 Observations: {count} ({types})
🧠 Synthesis: {metrics}
📝 Runbook: instances/{org}/RUNBOOK.md
📄 Summary: {statistics}
💡 Tip: {context-aware suggestion}
```

### Partial Success (No Reflections)
```
🔍 Detected org: {org}
📊 Observations: {count}
⚠️  No reflections available
🧠 Synthesis: {metrics}
📝 Runbook: instances/{org}/RUNBOOK.md
💡 Tip: Run /reflect to improve quality
```

### Failure (No Observations)
```
🔍 Detected org: {org}
❌ No observations found

💡 Guidance: {how to generate observations}
```

## ADDITIONAL CONTEXT

### Observation Capture

Observations are automatically captured by the `post-operation-observe.sh` hook when agents perform operations. If observations aren't being captured:

**Check hook is enabled**:
```bash
ls hooks/post-operation-observe.sh
```

**Manually capture observation**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-observer.js \
  --org {org} \
  --operation {type} \
  --objects "{objects}" \
  --outcome success
```

### Runbook Updates

Running `/generate-runbook` multiple times:
- **Creates version snapshot** of previous runbook automatically
- **Merges** all observations (cumulative)
- **Refreshes** synthesis (may change as patterns evolve)
- **Preserves history** in `instances/{org}/runbook-history/`

### Best Practices

1. **Run after major milestones**: Deployments, assessments, go-lives
2. **Use /reflect**: More reflections = better pattern detection = smarter recommendations
3. **Review before changes**: Read runbook before deployments to avoid known exceptions
4. **Keep observations**: Don't delete observation files (they're cumulative)

---

## EXECUTION STEPS (For Agent)

**IMPORTANT**: Follow these steps in order:

1. **Detect org** (auto-detect or prompt)
2. **Verify observations** (exit if none)
3. **Create version snapshot** (if runbook exists - automatic versioning)
4. **Query reflections** (optional, non-fatal)
5. **Run synthesis** (core intelligence)
6. **Render runbook** (template + data)
7. **Report metrics** (user feedback including version)

**Detailed Step 3: Version Snapshot**

Before generating new runbook, create snapshot of existing one:

```bash
# Check if runbook exists
if [ -f "instances/{org}/RUNBOOK.md" ]; then
  # Create version snapshot (auto-detects version bump)
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-versioner.js --org {org}

  # Report version created
  # Example output: "📦 Snapshot created: v1.2.0 (previous: v1.1.0)"
fi
```

**Version bump is automatic** based on content changes:
- Major changes (>10 objects changed) → MAJOR bump
- New features (new workflows, objects, exceptions) → MINOR bump
- Updates only (metrics, minor edits) → PATCH bump

**Error Handling**:
- Missing observations: Clear guidance + exit
- No reflections: Warn but continue
- Synthesis failure: Report error with debugging info
- Render failure: Check template exists, report issue
- Versioning failure: Non-fatal, warn but continue

**User Communication**:
- Use emojis for visual clarity (✅ ❌ ⚠️ 💡 📊 🧠 📝)
- Report progress at each step
- Provide actionable next steps
- Keep output concise but informative
