# Hook Reliability Audit & Fix Summary

**Date**: 2026-03-31
**Scope**: All 9 opspal-commercial plugins
**Based on**: Deep research report on persistent hook failures

---

## Confirmed Issues Fixed

### P0-1: Timeout Unit Mismatch (ALL PLUGINS)
- **Finding**: All hook `timeout` values used millisecond-like numbers (5000, 8000, 10000, etc.) but Claude Code expects **seconds**. `timeout: 5000` = 5000 seconds = 83 minutes, effectively disabling timeout protection.
- **Confirmed in**: All 9 plugin hooks.json files (opspal-core, opspal-salesforce, opspal-hubspot, opspal-marketo, opspal-okrs, opspal-gtm-planning, opspal-monday, opspal-ai-consult, opspal-data-hygiene)
- **Fix**: Converted all values: 5000→5, 8000→8, 10000→10, 15000→15, 30000→30, 60000→60
- **Regression guard**: Added validation in `scripts/validate-hooks-config.js` — any timeout > 120 is flagged as likely-milliseconds
- **Blast radius**: All hooks across all plugins. Hooks will now actually time out as intended.

### P0-2: Deploy Governance Bypass (SALESFORCE)
- **Finding**: `pre-deploy-agent-context-check.sh` emitted `{blockExecution: true, blockMessage: ...}` — a legacy schema NOT recognized by Claude's PreToolUse contract.
- **Confirmed in**: Line 257 of the hook. The dispatcher's `handle_child_output()` checks for `hookSpecificOutput.permissionDecision == "deny"`, so `blockExecution` was silently ignored → deploy commands were NOT being blocked.
- **Fix**: Replaced with canonical PreToolUse deny envelope: `{suppressOutput: true, hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "..."}}`
- **Verification**: Tested — hook now emits correct JSON that the dispatcher recognizes and blocks on.

### P0-3: Routing State Race Condition (CORE)
- **Finding**: `routing-state-manager.js` used `fs.writeFileSync()` directly, which can produce partial writes when concurrent hooks (Claude runs hooks in parallel) race on the same session key.
- **Confirmed in**: `writeStateFile()` function — no atomicity guarantees.
- **Fix**: Changed to write-to-temp-then-rename pattern: write to `<file>.tmp.<pid>`, `fsync`, then `rename` (atomic on POSIX).
- **Verification**: Save/get roundtrip test passes.

### P0-4: Shell Scoping Bug (SALESFORCE)
- **Finding**: `pre-deploy-flow-validation.sh` line 161 uses `local suggestion=""` outside any function scope. In bash 4+, `local` outside a function returns error code 1, which under `set -e` crashes the hook.
- **Confirmed in**: The line is at top-level scope inside an `if` block, not inside a function.
- **Fix**: Changed `local suggestion=""` to `suggestion=""`.
- **Verification**: Tested with a simulated `--metadata-dir /nonexistent` deploy — hook now correctly emits a deny response instead of crashing.

### P0-2b: Legacy blockExecution Across All Plugins (MARKETO + CORE)
- **Finding**: Same legacy `blockExecution` output format found in 8 Marketo hooks (15 instances) and the core agent plugin dispatcher. These are direct PreToolUse hooks — Claude silently ignores the legacy keys.
- **Confirmed in**: `pre-lead-merge.sh`, `pre-bulk-operation.sh`, `pre-bulk-export.sh`, `pre-orchestration.sh`, `pre-intelligence-analysis.sh`, `pre-campaign-delete.sh`, `pre-campaign-activation.sh`, `pre-campaign-clone.sh`, `pre-observability-extract.sh`, `pre-agent-plugin-dispatcher.sh`
- **Fix (Marketo)**: All 15 instances converted to canonical `{suppressOutput: true, hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: ...}}`.
- **Fix (Core dispatcher)**: `merge_hook_json()` now translates legacy `blockExecution` from child hooks into canonical `permissionDecision: "deny"`. Removed legacy `blockExecution` check from `handle_child_output()`.
- **Fix (Template)**: Updated `plugin-scaffolding/templates/hook-template.sh` `output_block()` to use canonical format.
- **Verification**: `grep -r '"blockExecution": true' plugins/**/*.sh` returns zero matches.

### P1-5: Timeout Validation Guard (REPO-WIDE)
- **Finding**: No mechanism prevented ms-like timeout values from being reintroduced.
- **Fix**: Added check in `scripts/validate-hooks-config.js` — any `timeout > 120` is flagged as an error with a suggested correction.
- **Verification**: Tested with a synthetic 5000 value — guard triggers correctly.

### P1-6: Silent Dependency Bypass (SALESFORCE)
- **Finding**: Governance hooks `pre-deploy-agent-context-check.sh` and `pre-bash-dispatcher.sh` silently `exit 0` when jq is missing, making it look like governance passed when it couldn't evaluate.
- **Confirmed in**: Both hooks had `echo "... skipping" >&2; exit 0` — no structured output, invisible to Claude.
- **Fix**: Both hooks now emit structured PreToolUse JSON with `additionalContext` warnings when jq is missing. The warning is visible to Claude and to operators inspecting hook output.
- **Design choice**: Allow (not block) when jq is missing to avoid breaking environments, but make the skip **observable** rather than silent.

---

## Issues Not Confirmed / Deferred

### H4: Registration Drift
- **Status**: Not confirmed as active cause. The merge/sync tooling appears functional — `validate-hooks-config.js` passes, all expected hook files exist.
- **Note**: Would require runtime `/hooks` inspection in a failing environment to confirm.

### H7: Tool Projection Loss
- **Status**: Confirmed as a known issue class (code has circuit-break logic for it), but this is an upstream Claude runtime behavior, not a hook defect.
- **Deferred**: No hook-level fix possible.

### H8: State Leakage Between Sessions
- **Status**: TTL-based cleanup exists in routing-state-manager. The atomic write fix (P0-3) reduces corruption risk. Full session isolation audit deferred.

### H9: Hook Retry/Idempotency
- **Status**: Unknown. No evidence of retries in Claude docs or debug traces provided.

### H10: Payload Serialization Edge Cases
- **Status**: Unknown. No concrete failure samples.

### H11: Process Lifecycle / Orphans
- **Status**: Hypothesized. Timeout normalization (P0-1) is the primary mitigation — hooks will now actually get killed after intended duration.

### H12: Observability Gaps
- **Status**: Confirmed as a known operational gap. The jq-missing fix (P1-6) improves observability for one failure class. Full telemetry standardization is a larger follow-up.

---

## Files Changed

| File | Change |
|------|--------|
| `plugins/opspal-core/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-salesforce/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-hubspot/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-marketo/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-okrs/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-gtm-planning/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-monday/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-ai-consult/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-data-hygiene/.claude-plugin/hooks.json` | Timeout ms→seconds (all values) |
| `plugins/opspal-salesforce/hooks/pre-deploy-agent-context-check.sh` | Fix output contract + jq warning |
| `plugins/opspal-salesforce/hooks/pre-deploy-flow-validation.sh` | Fix `local` outside function + jq warning |
| `plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh` | Add jq-missing structured warning |
| `plugins/opspal-core/scripts/lib/routing-state-manager.js` | Atomic write (tmp+rename) |
| `plugins/opspal-marketo/hooks/pre-lead-merge.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-bulk-operation.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-bulk-export.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-orchestration.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-intelligence-analysis.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-campaign-delete.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-campaign-activation.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-campaign-clone.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-marketo/hooks/pre-observability-extract.sh` | Fix blockExecution → canonical deny |
| `plugins/opspal-core/hooks/pre-agent-plugin-dispatcher.sh` | Translate legacy blockExecution in merger |
| `plugins/opspal-core/skills/plugin-scaffolding/templates/hook-template.sh` | Update template to canonical format |
| `scripts/validate-hooks-config.js` | Add timeout > 120 guard |

---

## Validation Commands Run

```bash
node scripts/validate-hooks-config.js           # ✅ PASS
node scripts/validate-active-hook-contracts.js   # ✅ PASS
bash scripts/test-claude-hooks-smoke.sh --skip-live  # ✅ PASS
```

Targeted repros:
- Flow validation with `--metadata-dir /nonexistent` → correct deny JSON (was crash)
- Deploy agent context check outside agent → correct deny JSON (was ignored legacy format)
- Routing state save/get roundtrip → OK with atomic writes

---

## Remaining Risks

1. **Timeout tightening may surface slow hooks**: Hooks that relied on effectively-infinite timeouts may now be killed. Monitor for "hook timed out" in debug traces. The 60s session-end-reliability hook is the most likely candidate.
2. **Parallel UserPromptSubmit hooks still share state**: The atomic write fix prevents corruption but doesn't serialize operations. A future consolidation into a single orchestrator hook would be the proper fix.
3. **No always-on telemetry**: Silent failures in non-governance hooks remain hard to detect without `--debug`.

---

## Recommended Follow-Ups

### 1. Consolidate UserPromptSubmit Hooks (Architecture)
- **Why**: 7 concurrent UserPromptSubmit hooks in opspal-core create inherent race conditions and ordering assumptions. The Salesforce `pre-bash-dispatcher.sh` pattern (single orchestrator calling child hooks sequentially) is proven and should be extended.
- **Scope**: Medium. Requires refactoring the 7-hook chain into a single dispatcher.

### 2. Add Always-On Hook Telemetry for Governance Hooks
- **Why**: When governance hooks fail silently (beyond the jq case), operators have no way to detect it without `--debug`.
- **Scope**: Small. Append `{timestamp, hook, exit_code, duration_ms, parse_ok}` to a JSONL file for routing-gate, permission, and deploy hooks.

### 3. Add Legacy Output Schema CI Check
- **Why**: `blockExecution` was found in 10+ files across 3 plugins. All were fixed in this pass. A CI check that greps for `blockExecution` in hook scripts would prevent regression.
- **Scope**: Small. Add to `validate-active-hook-contracts.js`.
