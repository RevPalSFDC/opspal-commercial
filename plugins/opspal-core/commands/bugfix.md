---
name: bugfix
description: Parallel hypothesis bug fix pipeline -- generates 3 hypotheses, tests each on its own branch, presents results
argument-hint: "<bug description> [--test-cmd <cmd>] [--files <file1,file2>] [--dry-run] [--resume]"
allowed-tools:
  - Agent
  - Bash
  - Read
  - Write
  - Grep
  - Glob
thinking-mode: enabled
arguments:
  - name: description
    description: Description of the bug (error messages, failing test, unexpected behavior)
    required: true
  - name: test-cmd
    description: Test command to verify fix (auto-detected from jest.config.js if not provided)
    required: false
  - name: files
    description: Comma-separated list of suspected source files
    required: false
  - name: dry-run
    description: Generate hypotheses without executing fixes
    required: false
    default: false
  - name: resume
    description: Resume an interrupted bugfix run
    required: false
    default: false
---

# /bugfix -- Parallel Hypothesis Bug Fix Pipeline

Eliminates serial guess-and-check debugging by generating 3 ranked hypotheses and testing each in parallel on isolated branches.

## Execution Steps

Execute the following steps in order:

### Step 1: Parse Input & Detect Context

Parse the user's bug description from `$ARGUMENTS`. Extract:
- `--test-cmd` if provided, otherwise auto-detect from nearest `jest.config.js` or `package.json` test script
- `--files` if provided, otherwise use Grep to find affected source files from the bug description
- `--dry-run` flag
- `--resume` flag

If `--resume` is set, run:
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

LEDGER=$(find_script "hypothesis-result-ledger.js") && node "$LEDGER" resumable
```
Read the latest resumable run's ledger file, then skip to Step 4.

### Step 2: Discover Affected Files

If `--files` was not provided:
1. Use Grep to search for keywords from the bug description (function names, error messages, variable names)
2. Use Glob to find test files matching patterns like `*.test.js`, `*.spec.ts`
3. Read the failing test file to understand what's being tested
4. Read the source file(s) under test

### Step 3: Generate Hypotheses

Use the Agent tool to invoke the bugfix hypothesis agent:

```
Agent(
  subagent_type='opspal-core:bugfix-hypothesis-agent',
  model='sonnet',
  prompt='Analyze this bug and generate 3 hypotheses:

Bug Description: <user's description>
Test Command: <detected or provided test command>
Affected Files: <discovered files>

<include content of affected source and test files>

Generate exactly 3 hypotheses as JSON. Include the bugfix_run_id: "bugfix-<timestamp>"'
)
```

Parse the JSON response to extract the hypotheses array.

### Step 4: Execute Hypotheses

Run the parallel hypothesis executor:

```bash
EXECUTOR=$(find_script "parallel-hypothesis-executor.js") && node "$EXECUTOR" \
  --run-id=<run-id> \
  --hypotheses='<json-array-from-step-3>' \
  --test-cmd='<test-command>' \
  [--dry-run] \
  [--verbose]
```

### Step 5: Present Results

Read the ledger file at `.bugfix-ledger/<run-id>.json` and display a results table:

```markdown
## Bugfix Results

| Hypothesis | Confidence | Root Cause | Status | Branch |
|-----------|------------|------------|--------|--------|
| #1 | 60% | <root cause> | PASS | fix/bugfix-abc-hyp-1 |
| #2 | 25% | <root cause> | FAIL | fix/bugfix-abc-hyp-2 |
| #3 | 15% | <root cause> | TIMEOUT | fix/bugfix-abc-hyp-3 |

### Recommended Action
- **Adopt hypothesis #1**: `git merge fix/bugfix-abc-hyp-1`
- **Cleanup**: `git branch -D fix/bugfix-abc-hyp-2 fix/bugfix-abc-hyp-3`
```

If no hypotheses passed, suggest manual debugging with the analysis from Step 3.

### Step 6: Prompt User

Ask the user which hypothesis to adopt (if any passed). Offer:
1. Merge the winning branch
2. Review the diff first (`git diff main...fix/bugfix-abc-hyp-N`)
3. Keep all branches for manual review
4. Clean up and discard all branches

## Notes

- Each hypothesis runs on its own branch, so the user's work is never at risk
- Git stash is used to preserve uncommitted changes
- The ledger file persists for resume capability
- Timeout is 5 minutes per hypothesis by default
