# Hook Reliability Remediation — Change Log

**Date**: 2026-03-31

---

## 1. Timeout Normalization (9 plugins)

**What changed**: All `timeout` values in every plugin's `.claude-plugin/hooks.json` converted from millisecond-like values to seconds.

**Why**: Claude Code interprets hook `timeout` in seconds. Values like `5000` were treated as 5000 seconds (83 minutes), effectively disabling timeout protection and allowing runaway hooks.

**Blast radius**: Every hook in every plugin. Hooks will now be cancelled after their intended duration (e.g., 5s, 10s, 60s) instead of running for hours.

**Rollback**: Revert the hooks.json files. To restore specific values, multiply current seconds by 1000.

---

## 2. Deploy Governance Output Contract Fix

**File**: `plugins/opspal-salesforce/hooks/pre-deploy-agent-context-check.sh`

**What changed**: Replaced legacy `{blockExecution: true, blockMessage: "..."}` output with canonical PreToolUse deny envelope: `{suppressOutput: true, hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "..."}}`.

**Why**: The dispatcher's `handle_child_output()` checks for `hookSpecificOutput.permissionDecision == "deny"` to short-circuit. The legacy `blockExecution` key was not recognized, causing the deploy block to be silently ignored — a governance bypass.

**Blast radius**: Only affects `sf project deploy` commands run outside an approved agent context. These will now be properly blocked as originally intended.

**Rollback**: Revert the file. Deploy governance will revert to being silently bypassed.

---

## 2b. Legacy blockExecution Eliminated Across All Plugins

**Files**:
- 8 Marketo hooks: `pre-lead-merge.sh`, `pre-bulk-operation.sh`, `pre-bulk-export.sh`, `pre-orchestration.sh`, `pre-intelligence-analysis.sh`, `pre-campaign-delete.sh`, `pre-campaign-activation.sh`, `pre-campaign-clone.sh`, `pre-observability-extract.sh`
- Core: `pre-agent-plugin-dispatcher.sh`
- Template: `plugin-scaffolding/templates/hook-template.sh`

**What changed**: All 15+ instances of `{"blockExecution": true, "blockMessage": "..."}` converted to `{"suppressOutput": true, "hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "..."}}`. The core agent dispatcher's `merge_hook_json()` now translates any remaining legacy `blockExecution` from child hooks to canonical format.

**Why**: Same governance bypass as #2. Claude does not recognize `blockExecution` — these blocks were silently ignored for campaign activation, bulk operations, lead merges, program cloning, and more.

**Blast radius**: All Marketo governance hooks and the core agent governance dispatcher. Operations that should have been blocked (campaign activation without validation, bulk deletes exceeding threshold, etc.) will now actually be blocked.

**Rollback**: Revert the files. Governance will revert to being silently bypassed.

---

## 3. Routing State Atomic Writes

**File**: `plugins/opspal-core/scripts/lib/routing-state-manager.js`

**What changed**: `writeStateFile()` now writes to a temporary file (`<path>.tmp.<pid>`), calls `fsync`, then renames to the target path. Previously used direct `fs.writeFileSync()`.

**Why**: Claude runs hooks in parallel. Multiple hooks writing to the same session state file could produce partial/corrupt JSON reads in other hooks, causing nondeterministic routing enforcement.

**Blast radius**: All routing state writes. The change is transparent — no behavioral difference on success, eliminates partial-write corruption on concurrent access.

**Rollback**: Replace the function body with `fs.writeFileSync(filePath, JSON.stringify(state, null, 2))`.

---

## 4. Shell Scoping Fix

**File**: `plugins/opspal-salesforce/hooks/pre-deploy-flow-validation.sh`

**What changed**: `local suggestion=""` at line 161 (top-level scope) changed to `suggestion=""`.

**Why**: `local` outside a function in bash returns exit code 1. Under `set -e`, this crashed the hook when the `--metadata-dir` invalid-path branch was hit — an intermittent failure that only appeared with specific deploy flags.

**Blast radius**: Minimal. Only affects deploys with `--metadata-dir` pointing to a non-existent directory.

**Rollback**: Change `suggestion=""` back to `local suggestion=""` (not recommended).

---

## 5. Timeout Validation Guard

**File**: `scripts/validate-hooks-config.js`

**What changed**: Added a check that flags any hook `timeout` value > 120 as a likely-milliseconds error.

**Why**: Prevents the timeout unit mismatch from silently re-entering the codebase.

**Blast radius**: None at runtime. Only affects the validation script output (CI/pre-commit).

**Rollback**: Remove the `if (typeof hook.timeout === 'number' && hook.timeout > 120)` block.

---

## 6. Explicit jq-Missing Warnings

**Files**:
- `plugins/opspal-salesforce/hooks/pre-deploy-agent-context-check.sh`
- `plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh`
- `plugins/opspal-salesforce/hooks/pre-deploy-flow-validation.sh`

**What changed**: When `jq` is not found, hooks now emit structured PreToolUse JSON with `additionalContext` warnings (for the two governance hooks) or clearer stderr messages (for flow validation). Previously they silently exited 0.

**Why**: Silent `exit 0` on missing jq made it look like governance checks passed when they couldn't run. The warning makes the skip observable to Claude and to operators.

**Blast radius**: Only affects environments where jq is not installed. Behavior changes from "silent pass" to "pass with visible warning".

**Rollback**: Revert to the original `echo "... skipping" >&2; exit 0` pattern.
