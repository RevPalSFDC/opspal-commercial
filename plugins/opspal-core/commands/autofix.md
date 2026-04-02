---
name: autofix
description: Autonomous reflection-to-fix loop -- analyzes open reflections, implements fixes, tests, and merges automatically
argument-hint: "[--max-fixes N] [--dry-run] [--skip-merge] [--resume] [--verbose]"
allowed-tools:
  - Task
  - Bash
  - Read
  - Write
  - Grep
  - Glob
thinking-mode: enabled
arguments:
  - name: max-fixes
    description: Maximum number of fixes per run (default 5)
    required: false
    default: "5"
  - name: dry-run
    description: Analyze reflections without implementing fixes
    required: false
    default: false
  - name: skip-merge
    description: Implement and test but don't merge to main
    required: false
    default: false
  - name: resume
    description: Resume an interrupted autofix run
    required: false
    default: false
  - name: verbose
    description: Enable detailed logging
    required: false
    default: false
---

# /autofix -- Autonomous Reflection-to-Fix Loop

Closes the loop from reflection analysis to auto-implemented, tested, and merged fixes. Processes open reflections from Supabase, generates fix plans via 5-Why RCA, implements each fix on an isolated branch, validates on a staging branch, and merges to main.

## Execution Steps

Execute the following steps:

### Step 1: Run the Autonomous Fix Executor

Build the command from `$ARGUMENTS`:

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/opspal-commercial/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

AUTOFIX_SCRIPT=$(find_script "autonomous-fix-executor.js")
if [ -z "$AUTOFIX_SCRIPT" ]; then echo "ERROR: autonomous-fix-executor.js not found"; exit 1; fi

node "$AUTOFIX_SCRIPT" \
  [--max-fixes N] \
  [--dry-run] \
  [--skip-merge] \
  [--resume] \
  [--verbose]
```

Pass through all flags from the user's invocation.

### Step 2: Display Results

The executor outputs a markdown results table. Display it to the user.

If `--dry-run` was used, show the analysis and ask the user if they want to proceed with implementation.

### Step 3: Post-Run Summary

After execution completes, read the ledger at `.autofix-ledger/<run-id>.json` and summarize:

1. **Fixes implemented**: How many reflections were auto-fixed
2. **Merged to main**: Whether the staging branch was merged
3. **Needs human**: Which issues require manual intervention (with links to Asana tasks if created)
4. **Next steps**: Suggest `/autofix --resume` if interrupted, or `/processreflections` for deeper analysis

## Safety Guardrails

- **Max 5 fixes per run** (configurable via `--max-fixes`)
- **Auto-revert on test failure** -- each fix is implemented on its own branch
- **Full test suite before merge** -- staging branch must pass all tests
- **Git stash preservation** -- user's uncommitted work is never lost
- **5-minute timeout per fix** -- prevents runaway processes
- **Non-code issues auto-route to needs-human** (auth, network, permissions)

## Examples

```bash
# Preview what would be fixed
/autofix --dry-run

# Fix up to 3 issues, don't merge yet
/autofix --max-fixes 3 --skip-merge

# Full autonomous run
/autofix

# Resume after interruption
/autofix --resume
```

## Workflow

```
/autofix
  │
  ├─ Phase 1: ANALYZE
  │   └─ Fetch reflections → cohort detection → fix plan generation
  │
  ├─ Phase 2: IMPLEMENT (per issue)
  │   └─ Branch → headless fixer → test → commit or revert
  │
  ├─ Phase 3: VALIDATE
  │   └─ Staging branch → merge passing fixes → full test suite
  │
  └─ Phase 4: REPORT
      └─ Merge to main │ Asana tasks for needs-human │ Update Supabase
```

## Integration

This command can also be triggered via the process-reflections script with the `--auto-fix` flag.
