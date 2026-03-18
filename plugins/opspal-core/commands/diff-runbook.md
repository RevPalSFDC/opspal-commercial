---
name: diff-runbook
description: Show changes in runbook since last version or between dates
argument-hint: "baseline"
allowed-tools:
  - Read
  - Bash
  - Grep
thinking-mode: enabled
---

# Diff Operational Runbook

## Purpose

**What this command does**: Displays changes in the operational runbook by comparing the current version with a previous snapshot or baseline.

**When to use it**:
- ✅ After regenerating runbook to see what changed
- ✅ To track operational evolution over time
- ✅ Before deploying to see recent pattern changes
- ✅ To verify runbook updates are capturing new operations

**When NOT to use it**:
- ❌ When only one runbook version exists (no comparison possible)
- ❌ For first-time runbook generation (nothing to diff against)

## Prerequisites

### Required
- **Current runbook**: Must have run `/generate-runbook` at least once
- **Comparison target**: Either previous runbook version or manual baseline

### Optional (Future - Phase 3)
- **Version history**: Automatic versioning (coming in Phase 3)
- **Timestamped snapshots**: Auto-saved versions

## Usage

### Basic Usage

```bash
/diff-runbook
```

**What happens**:
1. Auto-detects current org
2. Looks for previous runbook snapshot
3. Compares current vs previous
4. Highlights additions, deletions, modifications
5. Displays summary of changes

**Duration**: Instant (<2 seconds)

### With Manual Baseline

```bash
# Compare current runbook against a specific baseline
/diff-runbook baseline
```

This will:
- Prompt for baseline file path
- Compare current runbook against provided baseline
- Show differences

## Examples

### Example 1: Changes After Update

**Scenario**: Regenerated runbook after 5 new operations, want to see what changed

**Command**:
```bash
/diff-runbook
```

**Expected Output**:
```
🔍 Detected org: delta-sandbox

📊 Comparing runbooks...
   Current:  instances/delta-sandbox/RUNBOOK.md (2025-10-20)
   Previous: instances/delta-sandbox/RUNBOOK-backup.md (2025-10-15)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Changes Summary

✅ Additions (3):
  - New workflow: "Opportunity Routing"
  - New object: "Product__c"
  - New recommendation: "Implement validation for schema/parse errors"

❌ Deletions (0):
  (No sections removed)

📝 Modifications (2):
  - Platform Overview: Success rate improved 90% → 95%
  - Known Exceptions: 2 → 3 exceptions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Detailed Changes

### Platform Overview
-Operations have a 90% success rate.
+Operations have a 95% success rate.

-Primary objects include Account, Contact, Opportunity.
+Primary objects include Account, Contact, Opportunity, Product__c.

### Key Workflows
+### Opportunity Routing
+- Type: Custom
+- Trigger: TBD
+- Status: Active

### Known Exceptions
+### data-quality (recurring)
+- Frequency: 1 occurrence
+- Context: Duplicate records detected
+- Recommendation: Implement deduplication validation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Change Statistics:
   Lines added: 18
   Lines removed: 2
   Sections modified: 2
   Sections added: 1

💡 Tip: Major changes detected - review new exceptions before deployment
```

### Example 2: No Previous Version

**Scenario**: First time running diff, no baseline exists

**Command**:
```bash
/diff-runbook
```

**Expected Output**:
```
🔍 Detected org: delta-sandbox

⚠️  No previous runbook version found

Current runbook: instances/delta-sandbox/RUNBOOK.md

💡 To enable diffing:
   1. The next time you run /generate-runbook, a backup will be created
   2. Or manually copy current runbook as baseline:
      cp instances/delta-sandbox/RUNBOOK.md \
         instances/delta-sandbox/RUNBOOK-baseline.md

   Then future /diff-runbook commands will show changes.
```

### Example 3: No Changes

**Scenario**: Runbook regenerated but no new observations

**Command**:
```bash
/diff-runbook
```

**Expected Output**:
```
🔍 Detected org: delta-sandbox

📊 Comparing runbooks...
   Current:  instances/delta-sandbox/RUNBOOK.md (2025-10-20 10:30)
   Previous: instances/delta-sandbox/RUNBOOK.md (2025-10-20 09:15)

✅ No changes detected

The runbook is identical to the previous version.
This suggests no new operations have been captured since last generation.

💡 Tip: Perform operations and run /generate-runbook to capture new patterns
```

### Example 4: Summary-Only Diff

**Scenario**: Just want high-level change count, not detailed diff

**Command**:
```bash
/diff-runbook summary
```

**Expected Output**:
```
📊 Diff Summary: delta-sandbox

Additions: 3 sections
Deletions: 0 sections
Modifications: 2 sections

Lines added: 18
Lines removed: 2

Last updated: 2025-10-20
Previous version: 2025-10-15 (5 days ago)

📄 Full diff: Run /diff-runbook for details
```

## Decision Tree

**Use this decision tree to determine how to use /diff-runbook:**

```
Start Here
  ↓
Do you have a previous runbook version?
  ├─ YES → Run /diff-runbook ✅
  │         (See changes since last version)
  │
  └─ NO → Is this your first runbook?
            ├─ YES → Create baseline for future comparisons ⚠️
            │         (No diff available yet)
            │
            └─ NO → Want to create a manual baseline?
                      Run /diff-runbook baseline
                      (Manually specify comparison file)
```

**Key Decision Factors**:
- ✅ **Run diff**: After runbook updates, to track evolution
- ⚠️  **Create baseline**: First generation or major milestone
- ❌ **Skip**: No previous version to compare against

## OBJECTIVE (For Agent Context)

Compare current runbook with previous version and highlight changes by:
1. Detecting the target org
2. Locating current runbook
3. Finding or creating comparison baseline
4. Performing intelligent diff (not just line-by-line)
5. Categorizing changes (additions, deletions, modifications)
6. Presenting in readable format with change statistics

## PROCESS

### 1) Org Detection

**Auto-detect** from:
- Current working directory
- Environment variable $ORG
- User input if ambiguous

### 2) Locate Current Runbook

```bash
CURRENT="instances/{org}/RUNBOOK.md"

if [ ! -f "$CURRENT" ]; then
    echo "❌ Current runbook not found"
    echo "Run /generate-runbook first"
    exit 1
fi
```

### 3) Find Comparison Baseline

**Priority order**:
1. **Automatic backup**: `instances/{org}/RUNBOOK-backup.md` (created by /generate-runbook)
2. **Manual baseline**: `instances/{org}/RUNBOOK-baseline.md` (user-created)
3. **Version history** (Phase 3): `instances/{org}/runbook-history/RUNBOOK-{timestamp}.md`

**If no baseline found**:
- Explain that no previous version exists
- Provide instructions to create baseline
- Offer to create backup for next comparison

### 4) Perform Intelligent Diff

**Section-aware diffing**:
```bash
# Extract sections and compare
for section in "Platform Overview" "Key Workflows" "Known Exceptions" "Recommendations"; do
    # Extract section from current
    CURRENT_SECTION=$(sed -n "/## $section/,/##/p" "$CURRENT")

    # Extract section from baseline
    BASELINE_SECTION=$(sed -n "/## $section/,/##/p" "$BASELINE")

    # Compare
    diff -u <(echo "$BASELINE_SECTION") <(echo "$CURRENT_SECTION")
done
```

**Categorize changes**:
- **Additions**: New sections, new workflow entries, new exceptions
- **Deletions**: Removed sections, removed entries
- **Modifications**: Changed metrics, updated descriptions

### 5) Format Output

**Summary Section**:
```
✅ Additions (count): [brief list]
❌ Deletions (count): [brief list]
📝 Modifications (count): [brief list]
```

**Detailed Section**:
```
### {Section Name}
-Old line (removed)
+New line (added)
 Unchanged line
```

**Statistics**:
```
Lines added: {count}
Lines removed: {count}
Sections modified: {count}
```

### 6) Context-Aware Tips

**If major changes**:
- "Major changes detected - review new exceptions before deployment"

**If minor changes**:
- "Minor updates - operational patterns remain stable"

**If no changes**:
- "No new operations captured - consider running /generate-runbook after more activity"

## CONSTRAINTS

- **Performance**: Complete within 2 seconds
- **Clarity**: Highlight significant changes (not noise)
- **Context**: Explain what changes mean operationally
- **Actionability**: Provide relevant tips based on diff results

## OUTPUT FORMAT

### Changes Detected Format
```
🔍 Detected org: {org}

📊 Comparing runbooks...
   Current:  {file} ({date})
   Previous: {file} ({date})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Changes Summary

{categorized changes}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Detailed Changes

{section-by-section diff}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Change Statistics:
   {stats}

💡 Tip: {context-aware suggestion}
```

### No Changes Format
```
🔍 Detected org: {org}

📊 Comparing runbooks...
   Current:  {file} ({date})
   Previous: {file} ({date})

✅ No changes detected

{explanation}

💡 Tip: {suggestion}
```

### No Baseline Format
```
🔍 Detected org: {org}

⚠️  No previous runbook version found

Current runbook: {file}

💡 To enable diffing:
   {instructions}
```

## ADDITIONAL CONTEXT

### Creating Manual Baseline

**For milestone snapshots**:
```bash
# Before major change
cp instances/{org}/RUNBOOK.md instances/{org}/RUNBOOK-baseline.md

# After change
/generate-runbook
/diff-runbook  # Shows changes since baseline
```

### Automatic Backup (Phase 3 - Coming Soon)

When Phase 3 (versioning) is implemented:
- `/generate-runbook` will automatically create backups
- Backups stored in `instances/{org}/runbook-history/`
- `/diff-runbook` can compare any two versions
- Diff between specific dates: `/diff-runbook 2025-10-15 2025-10-20`

### Diff Tools

For advanced users:
```bash
# Visual diff with syntax highlighting
diff -u instances/{org}/RUNBOOK-baseline.md \
        instances/{org}/RUNBOOK.md | bat -l diff

# Side-by-side comparison
diff -y instances/{org}/RUNBOOK-baseline.md \
        instances/{org}/RUNBOOK.md | less
```

### Best Practices

1. **Create baselines at milestones**: Before go-lives, major releases
2. **Review diffs before deployments**: New exceptions = potential issues
3. **Track pattern evolution**: Are success rates improving?
4. **Document surprises**: Unexpected changes may indicate config drift

---

## EXECUTION STEPS (For Agent)

**IMPORTANT**: Follow these steps in order:

1. **Detect org** (auto-detect or prompt)
2. **Locate current runbook** (verify exists)
3. **Check version history** (use runbook-differ.js with version history)
4. **Run intelligent diff** (section-aware comparison)
5. **Display results** (summary + statistics + context)

**Using the Differ Script**:

```bash
# Compare current vs previous version (automatic)
node scripts/lib/runbook-differ.js --org {org}

# Compare specific versions
node scripts/lib/runbook-differ.js --org {org} \
  --from v1.0.0 --to v1.2.0

# Summary only
node scripts/lib/runbook-differ.js --org {org} --format summary
```

**The differ automatically**:
- Detects previous version from VERSION_INDEX.json
- Performs section-aware comparison (not line-by-line)
- Categorizes changes (additions, deletions, modifications)
- Extracts metric changes (success rate, object count, etc.)
- Provides formatted output with statistics

**Error Handling**:
- No current runbook: Prompt to run /generate-runbook
- No version history: Explain that first version is needed
  - "Run /generate-runbook twice to create history"
- Specific version not found: List available versions
- Diff errors: Report error, offer manual comparison
- Empty diff: Confirm no changes with explanation

**User Communication**:
- Use diff syntax (- for removed, + for added)
- Categorize changes by section
- Provide change statistics
- Offer context-aware tips based on changes
- Keep output scannable with visual separators

**Special Cases**:
- **First diff**: Offer to create baseline for future
- **No changes**: Confirm stability, suggest more operations
- **Major changes**: Highlight significant operational shifts
- **Version history** (Phase 3): Allow comparison between any two versions
