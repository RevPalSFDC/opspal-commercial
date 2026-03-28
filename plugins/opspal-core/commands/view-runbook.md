---
name: view-runbook
description: View operational runbook for a Salesforce instance
argument-hint: "[workflows|exceptions|recommendations]"
allowed-tools:
  - Read
  - Bash
  - Grep
thinking-mode: enabled
---

# View Operational Runbook

## Purpose

**What this command does**: Displays the operational runbook for a platform instance in a formatted, readable view.

**When to use it**:
- ✅ Before deploying to understand instance-specific patterns and exceptions
- ✅ When onboarding to a new instance
- ✅ To review documented workflows and integrations
- ✅ After running `/generate-runbook` to verify output
- ✅ To check known exceptions before troubleshooting

**When NOT to use it**:
- ❌ When runbook doesn't exist yet (run `/generate-runbook` first)
- ❌ For editing (runbooks are auto-generated, not manually edited)

## Prerequisites

### Required
- **Runbook exists**: Must have run `/generate-runbook` at least once
- **Instance context**: Working in or can specify which org

### Optional
- **Terminal pager**: Better experience with `less` or `bat` installed

## Usage

### Basic Usage

```bash
/view-runbook
```

**What happens**:
1. Auto-detects current org from context
2. Locates runbook at `instances/{org}/RUNBOOK.md`
3. Displays formatted runbook with section navigation
4. Provides summary statistics

**Duration**: Instant (<1 second)

### Section-Specific Viewing

```bash
# View specific sections (via filtering)
/view-runbook workflows        # Show only workflows section
/view-runbook exceptions       # Show only known exceptions
/view-runbook recommendations  # Show only recommendations
```

### Scoped Runbook Views (Phase 3)

```bash
/view-runbook scope workflow/lead-routing    # View scoped runbook projection
/view-runbook scope platform/salesforce      # View platform-scoped projection
/view-runbook conflicts                      # Show unresolved conflicts
/view-runbook promoted                       # Show recent promotions
/view-runbook registry                       # Show registry overview
/view-runbook recent                         # Show recently updated entries across scopes
/view-runbook status                         # Show comprehensive runbook system status
```

## Examples

### Example 1: Full Runbook View

**Scenario**: Review complete runbook before deployment

**Command**:
```bash
/view-runbook
```

**Expected Output**:
```
📚 Operational Runbook: delta-sandbox
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Platform: Salesforce
Last Updated: 2025-10-20
Version: 1.0.0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Platform Overview

This Salesforce instance has been observed over 5 days, with 12
recorded operations (8 deployment operations, 3 field-audit operations,
1 workflow-create operation). Operations have a 95% success rate.
Primary objects include Account, Contact, Opportunity, Quote__c, and 4 more.
Agents deployed: sfdc-orchestrator, sfdc-metadata-analyzer, sfdc-cpq-assessor.

### Instance Details
- Org Type: Production
- API Version: v62.0
- Total Objects: 8
- Active Workflows: 2

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Key Workflows

### Lead Assignment
- Type: Custom
- Trigger: TBD - Needs manual documentation
- Status: Active
- Observed Behavior: Observed in 3 operation(s): workflow-create.
  Success rate: 100%.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Known Exceptions

### schema/parse (recurring)
- First Observed: 2025-10-15
- Frequency: 2 occurrences
- Context: Field history tracking limit exceeded; Invalid picklist formula
- Recommendation: Implement validation for schema/parse to prevent recurrence

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Recommendations

1. Improve operation success rate from 95% to >95% by adding pre-flight validation
2. Address recurring schema/parse errors (2 occurrences) - implement validation guards
3. Continue capturing observations through agent operations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 Full runbook: instances/delta-sandbox/RUNBOOK.md
📓 NotebookLM: 4 sources synced (run /notebook-query to search)

💡 Tip: Run /generate-runbook to update with latest observations
```

### Example 2: Runbook Not Found

**Scenario**: Attempting to view runbook that doesn't exist

**Command**:
```bash
/view-runbook
```

**Expected Output**:
```
🔍 Detected org: acme-sandbox

❌ Runbook not found: instances/acme-sandbox/RUNBOOK.md

💡 Generate a runbook first:
   /generate-runbook

This will create a runbook from observed operations and reflections.
```

### Example 3: Quick Summary View

**Scenario**: Just want key metrics without full runbook

**Command**:
```bash
/view-runbook summary
```

**Expected Output**:
```
📊 Runbook Summary: delta-sandbox

Operations Observed: 12
Success Rate: 95%
Objects: 8
Workflows: 2
Known Exceptions: 3
Recommendations: 5
NotebookLM Sources: 4 (2 primary, 2 detail)

Last Updated: 2025-10-20
Version: 1.0.0

📄 Full runbook: instances/delta-sandbox/RUNBOOK.md
```

### Example 4: Section-Specific View

**Scenario**: Only want to see known exceptions

**Command**:
```bash
/view-runbook exceptions
```

**Expected Output**:
```
📚 Known Exceptions: delta-sandbox
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### schema/parse (recurring)
- Frequency: 2 occurrences
- Context: Field history tracking limit exceeded
- Recommendation: Implement validation for schema/parse to prevent recurrence

### auth/permissions (recurring)
- Frequency: 1 occurrence
- Context: Permission set assignment failed
- Recommendation: Verify permission dependencies before deployment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Decision Tree

**Use this decision tree to determine what to view:**

```
Start Here
  ↓
Do you need general overview?
  ├─ YES → Run /view-runbook (full view) ✅
  │
  └─ NO → Do you need specific information?
            ├─ Workflows → /view-runbook workflows
            ├─ Exceptions → /view-runbook exceptions
            ├─ Recommendations → /view-runbook recommendations
            ├─ Quick stats → /view-runbook summary
            └─ Full document → Read instances/{org}/RUNBOOK.md directly
```

**Key Decision Factors**:
- ✅ **Full view**: Before deployments, onboarding, general reference
- ✅ **Section view**: Troubleshooting specific areas, quick lookups
- ✅ **Summary**: Quick health check, metrics only

## OBJECTIVE (For Agent Context)

Display the operational runbook in a user-friendly format by:
1. Detecting the target org
2. Locating the runbook file
3. Formatting output based on view mode (full, section, or summary)
4. Presenting in readable terminal format with visual separators

## PROCESS

### 1) Org Detection

**Auto-detect** from:
- Current working directory (instances/{org}/)
- Environment variable $ORG
- User input if ambiguous

**If multiple instances available**:
- List instances with runbook status
- Prompt user to select

### 2) Locate Runbook

```bash
# Check if runbook exists
ls instances/{org}/RUNBOOK.md
```

**If not found**:
- Report missing runbook clearly
- Provide `/generate-runbook` command
- Exit gracefully

**If found**:
- Note file size and last modified date
- Continue to display

### 2.5) Check NotebookLM Sources (Optional)

```bash
# Check if NotebookLM source manifest exists
SOURCE_MANIFEST="instances/{org}/notebooklm/source-manifest.json"
if [ -f "$SOURCE_MANIFEST" ]; then
  SOURCE_COUNT=$(jq '.sources | length' "$SOURCE_MANIFEST" 2>/dev/null || echo 0)
  PRIMARY_COUNT=$(jq '[.sources[] | select(.tier == "primary")] | length' "$SOURCE_MANIFEST" 2>/dev/null || echo 0)
  DETAIL_COUNT=$(jq '[.sources[] | select(.tier == "detail")] | length' "$SOURCE_MANIFEST" 2>/dev/null || echo 0)
  NOTEBOOKLM_STATUS="$SOURCE_COUNT sources ($PRIMARY_COUNT primary, $DETAIL_COUNT detail)"
else
  NOTEBOOKLM_STATUS="Not configured"
fi
```

**Include in output**: Show NotebookLM source count in summary view.

### 3) Determine View Mode

**Full View** (default):
- Display entire runbook with section headers
- Add visual separators for readability
- Include navigation tips

**Section View** (if filter provided):
- Extract specific section from markdown
- Display section header + content
- Show context (which org, which section)

**Summary View** (if "summary" keyword):
- Extract key metrics only
- Display in compact format
- Show last updated date

**Scoped View** (if "scope <scopeType>/<scopeKey>" argument):
- Load projection file at `instances/{org}/runbooks/projections/{scopeType}/{scopeType}-{scopeKey}.md`
- Display it in full view format with visual separators
- If not found: suggest running `/generate-runbook reconcile --rebuild-projections`

**Conflicts View** (if "conflicts" keyword):
- Run: `node scripts/lib/runbook-conflict-manager.js` or load `instances/{org}/runbooks/conflicts.json`
- Filter to `status === 'detected'` or `status === 'reviewing'`
- Display each ConflictRecord: type, severity, entries involved, reason
- Show resolution options

**Promoted View** (if "promoted" keyword):
- Load `instances/{org}/runbooks/promotions.json`
- Show last 10 PromotionRecords sorted by `promotedAt` descending
- Display: source → target, type, reason, confidence

**Registry View** (if "registry" keyword):
- Run: `node scripts/lib/runbook-registry.js --org {org} --action stats`
- Display formatted registry overview: scope types, counts, statuses

**Recent View** (if "recent" keyword):
- For each non-archived runbook, load entry store
- Collect entries where `lastSeenAt` within last 14 days
- Sort by `lastSeenAt` descending, show top 20
- Display: runbookId, section, title, confidence, lastSeenAt

**Status View** (if "status" keyword):
- Run: `node scripts/lib/runbook-status-reporter.js --org {org}`
- Display: registered runbooks, total entries, by-status breakdown, stale entries, conflicts, promotions

### 4) Format Output

**Visual Elements**:
- Section dividers: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
- Headers: `📚 Title` (use emojis for visual clarity)
- Sections: Preserve markdown formatting
- Lists: Clean bullet points

**Truncation** (for long runbooks):
- If > 500 lines, show first 400 lines + summary
- Provide command to view full file
- Suggest using pager (`less`, `bat`)

### 5) Summary Statistics

**Always show at end**:
- Location of full runbook file
- Last updated date
- Next steps / tips

## CONSTRAINTS

- **Performance**: Instant display (<1 second)
- **Readability**: Terminal-friendly formatting
- **Navigation**: Clear section headers for quick scanning
- **Context**: Always show which org/instance

## OUTPUT FORMAT

### Full View Format
```
📚 Operational Runbook: {org}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{runbook content with visual separators}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 Full runbook: instances/{org}/RUNBOOK.md
💡 Tip: {context-aware suggestion}
```

### Summary View Format
```
📊 Runbook Summary: {org}

{key metrics in compact format}
NotebookLM Sources: {count} ({primary} primary, {detail} detail) or "Not configured"

Last Updated: {date}
Version: {version}

📄 Full runbook: instances/{org}/RUNBOOK.md
📓 Query: /notebook-query {org} "question" (if NotebookLM configured)
```

### Section View Format
```
📚 {Section Name}: {org}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{section content}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 Full section in: instances/{org}/RUNBOOK.md
```

### Error Format
```
🔍 Detected org: {org}

❌ Runbook not found: instances/{org}/RUNBOOK.md

💡 Generate a runbook first:
   /generate-runbook
```

## ADDITIONAL CONTEXT

### Viewing Options

**Terminal Pagers** (better for long runbooks):
```bash
# Using less
less instances/{org}/RUNBOOK.md

# Using bat (syntax highlighting)
bat instances/{org}/RUNBOOK.md
```

**Direct File Access**:
```bash
# Open in editor
code instances/{org}/RUNBOOK.md

# Cat with line numbers
cat -n instances/{org}/RUNBOOK.md
```

### Section Extraction

To extract specific sections programmatically:
```bash
# Workflows section
sed -n '/## Key Workflows/,/##/p' instances/{org}/RUNBOOK.md

# Exceptions section
sed -n '/## Known Exceptions/,/##/p' instances/{org}/RUNBOOK.md
```

### Best Practices

1. **Review before deployments**: Check known exceptions
2. **Reference during troubleshooting**: Look up similar patterns
3. **Onboarding**: Read full runbook when joining project
4. **Regular updates**: Run `/generate-runbook` after major changes

---

## EXECUTION STEPS (For Agent)

**IMPORTANT**: Follow these steps in order:

1. **Detect org** (auto-detect or prompt)
2. **Locate runbook** (verify file exists)
3. **Parse view mode** (full, section, or summary)
4. **Format output** (visual separators, headers)
5. **Display content** (preserve markdown structure)
6. **Show footer** (file location, tips)

**Error Handling**:
- Runbook not found: Clear message + how to create
- Invalid section: List available sections
- File read error: Report issue with debugging info

**User Communication**:
- Use visual separators for readability
- Include emojis for section identification
- Keep output clean and scannable
- Provide file path for direct access
