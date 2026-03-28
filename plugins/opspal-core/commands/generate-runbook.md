---
name: generate-runbook
description: Generate or update operational runbook from observations and reflections
argument-hint: "[options]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Grep
  - Glob
  - mcp__notebooklm__source_add_text
  - mcp__notebooklm__source_list
thinking-mode: enabled
---

# Generate Operational Runbook

## Purpose

**What this command does**: Generates or updates an operational runbook for a platform instance (Salesforce, HubSpot, Marketo, etc.) by synthesizing observations from agent operations and patterns from user reflections, including metric semantics decisions, report intent diagnostics, report health warnings, and persona KPI alignment checks.

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
- **Org authentication**: Must have authenticated to a platform org (Salesforce, HubSpot, Marketo, etc.)
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
1. Auto-detects current org from context (working directory, env vars) or prompts for selection
2. Loads observations from `instances/{org}/observations/` or `orgs/{org}/platforms/*/observations/`
3. Queries reflections from Supabase (if available)
4. Synthesizes intelligent analysis using LLM
5. Renders runbook template with data
6. Documents metric semantics decisions (field confirmations, semantic warnings, failure-mode risks)
7. Captures persona KPI alignment warnings for dashboards
8. Saves to `instances/{org}/RUNBOOK.md`
9. Reports summary statistics

**Duration**: 10-30 seconds depending on observation count

### With Specific Org

If working directory doesn't clearly indicate an org, or to generate for a different org:

```bash
# Agent will prompt for org selection from available instances
/generate-runbook
```

### Reconciliation Mode (Phase 3)

Instead of a full synthesis rebuild, run incremental reconciliation on structured entry stores:

```bash
/generate-runbook reconcile                    # Run all reconciliation steps
/generate-runbook reconcile --compact          # Deduplicate noisy entries
/generate-runbook reconcile --backfill         # Process unrepresented observations
/generate-runbook reconcile --mark-stale       # Mark old entries as stale/deprecated
/generate-runbook reconcile --detect-conflicts # Surface contradictory guidance
/generate-runbook reconcile --promote          # Promote durable entries to parent scopes
/generate-runbook reconcile --rebuild-projections # Refresh markdown projections
```

**When to use reconciliation instead of full rebuild**:
- Routine maintenance (weekly/after sessions)
- When you want incremental freshness without full LLM synthesis
- To compact accumulated entries after many observations
- To surface conflicts and promote standards

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
✓ Org detected: delta-sandbox

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
✓ Runbook updated: instances/delta-sandbox/RUNBOOK.md

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
  1. delta-sandbox (5 observations)
  2. acme-production (2 observations)
  3. eta-corp (0 observations - new)

Which instance? 1

📊 Loading observations for delta-sandbox...
✓ Found 5 observations

⚠️  No reflections found for this org
   (This is normal - reflections enhance quality but aren't required)

🧠 Synthesizing intelligent analysis...
✓ Analysis complete

📝 Creating new runbook...
✓ Runbook created: instances/delta-sandbox/RUNBOOK.md

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
🔍 Detecting org: acme-sandbox

⚠️  No observations found for this org

💡 Observations are captured automatically when agents perform operations.
   To generate a runbook:
   1. Perform operations (deployments, assessments, etc.)
   2. Observations will be captured via post-operation hooks
   3. Then run /generate-runbook

Alternatively, you can manually create observations:
   node scripts/lib/runbook-observer.js --org acme-sandbox \
     --operation deployment --objects "Account,Contact" --outcome success
```

### Example 4: With NotebookLM Artifact Sync

**Scenario**: Generating runbook for an org with NotebookLM configured and existing artifacts

**Command**:
```bash
/generate-runbook
```

**Expected Output**:
```
🔍 Detecting org from context...
✓ Org detected: acme-sandbox

📊 Loading observations...
✓ Found 12 observations

🧠 Synthesizing intelligent analysis...
✓ Analysis complete

📝 Rendering runbook...
✓ Runbook updated: instances/acme-sandbox/RUNBOOK.md

📓 Syncing runbook to NotebookLM...
✅ Runbook synced to NotebookLM
   Notebook: notebook_abc123

📂 Scanning for client-facing artifacts...
   Found 4 artifacts to evaluate
   📄 Syncing: CPQ_ASSESSMENT_SUMMARY.md (primary tier)
   📄 Syncing: CLIENT_HANDOFF.md (primary tier)
   📄 Syncing: Q2C_ANALYSIS.md (detail tier)
   ⏭️  Skipping: OLD_REPORT.md (already synced)

📚 NotebookLM Sync Complete
   Notebook: notebook_abc123
   Sources synced: 4

   Primary tier:
   - RUNBOOK.md (operational runbook)
   - CPQ_ASSESSMENT_SUMMARY.md
   - CLIENT_HANDOFF.md

   Detail tier:
   - Q2C_ANALYSIS.md

💡 Query with: /notebook-query acme-sandbox "What are the key findings from the recent assessment?"

📄 Summary:
   Operations: 12 (92% success rate)
   Objects: 15
   Workflows: 3
   Known Exceptions: 2
   Recommendations: 5
   📓 NotebookLM: Synced 4 sources

🎉 Runbook ready! Use /view-runbook to read it.
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
1. Detecting the target org from context or user input
2. Loading all available observations from disk
3. Querying reflections from Supabase (non-fatal if unavailable)
4. Synthesizing intelligent analysis using the runbook-synthesizer
5. Rendering the runbook template with merged data
6. Saving the output and reporting metrics

## PROCESS

### 1) Org Detection

**Auto-detect** from:
- Current working directory path (e.g., `instances/delta-sandbox/`)
- Environment variable `$ORG`
- Recent org authentication (via `sf config get target-org` for Salesforce, or platform-specific auth)

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
node scripts/lib/runbook-reflection-bridge.js \
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
node scripts/lib/runbook-synthesizer.js \
  --org {org} \
  --reflection-sections instances/{org}/reflection-sections.json \
  --output instances/{org}/synthesis.json

# Without reflections
node scripts/lib/runbook-synthesizer.js \
  --org {org} \
  --output instances/{org}/synthesis.json
```

**Report synthesis metrics**:
- Platform description length
- Workflow insights count
- Recommendations count
- Best practices count
- Metric semantics decisions and warnings summary

### 5) Render Runbook

```bash
node scripts/lib/runbook-renderer.js \
  --org {org} \
  --reflection-sections instances/{org}/synthesis.json \
  --output instances/{org}/RUNBOOK.md
```

**Verify output**:
- Check file exists
- Report file size and location
- Extract key metrics from synthesis

### 6.5) NotebookLM Sync (Optional)

**Condition**: Only if NotebookLM is configured for this org

```bash
# Check if notebook exists for this org
REGISTRY_PATH="instances/{org}/notebooklm/notebook-registry.json"

# Also check legacy and org-centric paths
if [ ! -f "$REGISTRY_PATH" ]; then
  REGISTRY_PATH="instances/salesforce/{org}/notebooklm/notebook-registry.json"
fi
if [ ! -f "$REGISTRY_PATH" ]; then
  REGISTRY_PATH="orgs/{org}/platforms/salesforce/production/notebooklm/notebook-registry.json"
fi

if [ -f "$REGISTRY_PATH" ]; then
  NOTEBOOK_ID=$(jq -r '.notebooks.primary.notebookId' "$REGISTRY_PATH")

  if [ -n "$NOTEBOOK_ID" ] && [ "$NOTEBOOK_ID" != "null" ]; then
    echo "📓 Syncing runbook to NotebookLM..."

    # Read runbook content
    RUNBOOK_PATH="instances/{org}/RUNBOOK.md"
    RUNBOOK_CONTENT=$(cat "$RUNBOOK_PATH")

    # Use MCP tool to add/update source
    # Tool: source_add_text
    # Params:
    #   - notebook_id: {notebook_id}
    #   - title: "Operational Runbook - {date}"
    #   - content: {runbook_content}

    # Update source-manifest.json with sync timestamp
    SOURCE_MANIFEST="instances/{org}/notebooklm/source-manifest.json"
    if [ -f "$SOURCE_MANIFEST" ]; then
      # Add sync entry to manifest
      jq --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
         '.syncHistory += [{"timestamp": $ts, "action": "update", "origin": "RUNBOOK.md", "status": "success"}]' \
         "$SOURCE_MANIFEST" > "$SOURCE_MANIFEST.tmp" && mv "$SOURCE_MANIFEST.tmp" "$SOURCE_MANIFEST"
    fi

    echo "✅ Runbook synced to NotebookLM"
    echo "   Notebook: $NOTEBOOK_ID"

    ### Scan and Sync Client-Facing Artifacts
    echo ""
    echo "📂 Scanning for client-facing artifacts..."

    # Find artifacts in org directory (excluding RUNBOOK.md which was already synced)
    ARTIFACT_PATHS=$(find "instances/{org}" -maxdepth 2 -type f \( \
      -name "*SUMMARY*.md" -o \
      -name "*REPORT*.md" -o \
      -name "*ANALYSIS*.md" -o \
      -name "*HANDOFF*.md" -o \
      -name "*FINDINGS*.md" -o \
      -name "*EXECUTIVE*.md" -o \
      -name "*ASSESSMENT*.md" \
    \) ! -name "RUNBOOK.md" 2>/dev/null)

    # Also check reports/ subdirectory
    REPORT_FILES=$(find "instances/{org}/reports" -name "*.md" -type f 2>/dev/null)

    # Combine and deduplicate
    ALL_ARTIFACTS=$(echo -e "$ARTIFACT_PATHS\n$REPORT_FILES" | sort -u | grep -v '^$')

    ARTIFACT_COUNT=$(echo "$ALL_ARTIFACTS" | grep -c . 2>/dev/null || echo 0)
    echo "   Found $ARTIFACT_COUNT artifacts to evaluate"

    # Track synced artifacts for summary
    SYNCED_PRIMARY=""
    SYNCED_DETAIL=""

    for ARTIFACT in $ALL_ARTIFACTS; do
      if [ -z "$ARTIFACT" ]; then continue; fi

      FILENAME=$(basename "$ARTIFACT")

      # Skip if already synced (check source-manifest)
      if [ -f "$SOURCE_MANIFEST" ]; then
        ALREADY_SYNCED=$(jq -e ".sources[]? | select(.path == \"$FILENAME\")" "$SOURCE_MANIFEST" 2>/dev/null)
        if [ -n "$ALREADY_SYNCED" ]; then
          echo "   ⏭️  Skipping: $FILENAME (already synced)"
          continue
        fi
      fi

      # Determine tier based on filename pattern
      case "$FILENAME" in
        *EXECUTIVE*|*SUMMARY*|*HANDOFF*)
          TIER="primary"
          ;;
        *)
          TIER="detail"
          ;;
      esac

      # Read artifact content
      ARTIFACT_CONTENT=$(cat "$ARTIFACT")
      TITLE_BASE="${FILENAME%.md}"

      echo "   📄 Syncing: $FILENAME ($TIER tier)"

      # Use MCP tool to add source
      # Tool: source_add_text
      # Params:
      #   - notebook_id: {notebook_id}
      #   - title: "{org} - {title_base}"
      #   - content: {artifact_content}

      # Track for summary
      if [ "$TIER" = "primary" ]; then
        SYNCED_PRIMARY="$SYNCED_PRIMARY\n   - $FILENAME"
      else
        SYNCED_DETAIL="$SYNCED_DETAIL\n   - $FILENAME"
      fi
    done

    # Update source-manifest.json with all synced artifacts
    if [ -f "$SOURCE_MANIFEST" ]; then
      SYNC_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

      # Add runbook entry
      jq --arg ts "$SYNC_TS" \
         --arg path "RUNBOOK.md" \
         --arg tier "primary" \
         'if (.sources | map(select(.path == $path)) | length) == 0
          then .sources += [{"path": $path, "tier": $tier, "syncedAt": $ts}]
          else (.sources[] | select(.path == $path) | .syncedAt) = $ts end' \
         "$SOURCE_MANIFEST" > "$SOURCE_MANIFEST.tmp" && mv "$SOURCE_MANIFEST.tmp" "$SOURCE_MANIFEST"

      # Add artifact entries
      for ARTIFACT in $ALL_ARTIFACTS; do
        if [ -z "$ARTIFACT" ]; then continue; fi
        FILENAME=$(basename "$ARTIFACT")

        case "$FILENAME" in
          *EXECUTIVE*|*SUMMARY*|*HANDOFF*) TIER="primary" ;;
          *) TIER="detail" ;;
        esac

        jq --arg ts "$SYNC_TS" \
           --arg path "$FILENAME" \
           --arg tier "$TIER" \
           'if (.sources | map(select(.path == $path)) | length) == 0
            then .sources += [{"path": $path, "tier": $tier, "syncedAt": $ts}]
            else (.sources[] | select(.path == $path) | .syncedAt) = $ts end' \
           "$SOURCE_MANIFEST" > "$SOURCE_MANIFEST.tmp" && mv "$SOURCE_MANIFEST.tmp" "$SOURCE_MANIFEST"
      done

      # Update lastUpdated timestamp
      jq --arg ts "$SYNC_TS" '.lastUpdated = $ts' \
         "$SOURCE_MANIFEST" > "$SOURCE_MANIFEST.tmp" && mv "$SOURCE_MANIFEST.tmp" "$SOURCE_MANIFEST"
    fi

    # Calculate total synced count
    TOTAL_SYNCED=$((ARTIFACT_COUNT + 1))  # +1 for RUNBOOK.md

    echo ""
    echo "📚 NotebookLM Sync Complete"
    echo "   Notebook: $NOTEBOOK_ID"
    echo "   Sources synced: $TOTAL_SYNCED"
    if [ -n "$SYNCED_PRIMARY" ]; then
      echo ""
      echo "   Primary tier:"
      echo "   - RUNBOOK.md (operational runbook)"
      echo -e "$SYNCED_PRIMARY"
    fi
    if [ -n "$SYNCED_DETAIL" ]; then
      echo ""
      echo "   Detail tier:"
      echo -e "$SYNCED_DETAIL"
    fi
    echo ""
    echo "💡 Query with: /notebook-query {org} \"What are the key findings from the recent assessment?\""
  fi
fi
```

**Skip Conditions**:
- `NOTEBOOKLM_AUTO_SYNC=false` environment variable
- No `notebook-registry.json` exists for org
- Auth expired (graceful skip with warning)

**MCP Tool Call** (when notebook exists):
```
Tool: source_add_text
Params:
  - notebook_id: {notebook_id from registry}
  - title: "Operational Runbook - {YYYY-MM-DD}"
  - content: {Full runbook markdown content}
```

**Artifact Type Detection**:
| Pattern | Tier | Type |
|---------|------|------|
| `*EXECUTIVE*`, `*SUMMARY*` | primary | executive-summary |
| `*HANDOFF*` | primary | handoff-document |
| `*REPORT*`, `*FINDINGS*` | detail | assessment-report |
| `*ANALYSIS*` | detail | analysis |
| `reports/*.md` | detail | report |

**MCP Tool Calls for Artifacts** (for each artifact found):
```
Tool: source_add_text
Params:
  - notebook_id: {notebook_id from registry}
  - title: "{org} - {artifact_filename_without_extension}"
  - content: {artifact content}
```

**Sync Result Tracking**:
After successful sync, update `source-manifest.json`:
```json
{
  "lastUpdated": "2025-01-27T10:00:00Z",
  "sources": [
    {
      "path": "RUNBOOK.md",
      "tier": "primary",
      "syncedAt": "2025-01-27T10:00:00Z"
    },
    {
      "path": "CPQ_ASSESSMENT_SUMMARY.md",
      "tier": "primary",
      "syncedAt": "2025-01-27T10:00:00Z"
    },
    {
      "path": "REVOPS_REPORT.md",
      "tier": "detail",
      "syncedAt": "2025-01-27T10:00:00Z"
    }
  ],
  "syncHistory": [
    {
      "timestamp": "2025-01-27T10:00:00Z",
      "action": "update",
      "origin": "RUNBOOK.md",
      "status": "success",
      "sourceId": "src_abc123"
    }
  ]
}
```

### 7) Summary Report

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
   📓 NotebookLM: Synced {sources_count} sources (or "Not configured - run /notebook-init")
      - Primary: RUNBOOK.md, {executive_summary}, {handoff_doc}
      - Detail: {report_files}

💡 Next Steps:
   - View: /view-runbook
   - Compare: /diff-runbook (if previous version exists)
   - Improve: Run /reflect after sessions to enhance quality
   - Query: /notebook-query {org} "What are the key findings from the recent assessment?"
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
node scripts/lib/runbook-observer.js \
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
6.5. **Sync to NotebookLM** (optional, if configured for org)
7. **Report metrics** (user feedback including version and NotebookLM status)
7.5. **Reconcile** (if `reconcile` argument was passed — skip steps 2-7 and run reconciliation instead)

**Detailed Step 7.5: Reconciliation Mode**

If the user passed `reconcile` as the first argument:
- Skip steps 2-6.5 (no full synthesis needed)
- Parse optional flags: `--compact`, `--backfill`, `--mark-stale`, `--detect-conflicts`, `--promote`, `--rebuild-projections`
- If no flags specified, run all steps (equivalent to `--all`)
- Execute:

```bash
node scripts/lib/runbook-reconcile.js --org {org} \
  [--compact] [--backfill] [--mark-stale] \
  [--detect-conflicts] [--promote] [--rebuild-projections]
```

- Report reconciliation results:
  - Entries compacted/merged
  - Observations backfilled
  - Entries marked stale/deprecated
  - Conflicts detected
  - Entries promoted to parent scopes
  - Projections rebuilt
- Show status: `node scripts/lib/runbook-status-reporter.js --org {org}`

**Detailed Step 3: Version Snapshot**

Before generating new runbook, create snapshot of existing one:

```bash
# Check if runbook exists
if [ -f "instances/{org}/RUNBOOK.md" ]; then
  # Create version snapshot (auto-detects version bump)
  node scripts/lib/runbook-versioner.js --org {org}

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
