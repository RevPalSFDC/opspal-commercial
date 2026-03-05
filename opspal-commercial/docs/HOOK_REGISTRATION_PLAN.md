# Hook Registration Plan

**Created**: 2026-01-27
**Status**: In Progress
**Impact**: 101 unregistered hooks across 5 plugins

## Executive Summary

We discovered that **101 hook files exist but are not registered** in their respective plugin.json files. This means all validation, error prevention, session management, and branding injection systems have been dormant.

## Hook Event Types (Claude Code)

| Event | Trigger | Use For |
|-------|---------|---------|
| `PreToolUse` | Before tool execution | Validation, blocking, injection |
| `PostToolUse` | After tool execution | Verification, logging, notifications |
| `SessionStart` | Session begins | Initialization, context loading |
| `Stop` | Before response | Final validation |

## Matcher Patterns

```json
// Match specific tool
{ "tool_name": "Task" }

// Match tool + file pattern
{ "tool_name": "Write", "file_pattern": "*.pdf" }

// Match Bash commands
{ "tool_name": "Bash", "command_pattern": "sf project deploy*" }
```

---

## Priority 1: Critical (Immediate Fix)

### opspal-core (37 remaining)

| Hook File | Event | Matcher | Purpose |
|-----------|-------|---------|---------|
| `pre-task-template-injector.sh` | PreToolUse | `{"tool_name":"Task"}` | **Branding injection** ✅ DONE |
| `post-pdf-verification.sh` | PostToolUse | `{"tool_name":"Write","file_pattern":"*.pdf"}` | PDF validation ✅ DONE |
| `session-init.sh` | SessionStart | (none) | Session initialization ✅ DONE |
| `pre-tool-execution.sh` | PreToolUse | `{"tool_name":"Bash"}` | Tool validation ✅ DONE |
| `pre-task-agent-validator.sh` | PreToolUse | `{"tool_name":"Task"}` | Agent routing ✅ DONE |
| `pre-tool-use-contract-validation.sh` | PreToolUse | `{"tool_name":"Bash"}` | Contract validation ✅ DONE |
| `post-audit-bluf-generator.sh` | PostToolUse | `{"tool_name":"Write","file_pattern":"*audit*.md"}` | BLUF generation ✅ DONE |

### opspal-salesforce (22 remaining)

| Hook File | Event | Matcher | Purpose |
|-----------|-------|---------|---------|
| `pre-deployment-comprehensive-validation.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"sf project deploy*"}` | Deployment validation ($140k ROI) ✅ DONE |
| `pre-tool-use.sh` | PreToolUse | `{"tool_name":"Task"}` | Tool restriction enforcement ✅ DONE |
| `post-sf-query-validation.sh` | PostToolUse | `{"tool_name":"Bash","command_pattern":"sf data query*"}` | Query validation ✅ DONE |
| `pre-high-risk-operation.sh` | PreToolUse | `{"tool_name":"Bash"}` | Risk gating ✅ DONE |
| `pre-flow-deployment.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*deploy*flow*"}` | Flow validation ✅ DONE |
| `pre-territory-write-validator.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*territory*"}` | Territory validation ✅ DONE |
| `session-start-agent-reminder.sh` | SessionStart | (none) | Agent reminder ✅ DONE |

---

## Priority 2: Important (This Week)

### opspal-hubspot (5 remaining)

| Hook File | Event | Matcher | Purpose |
|-----------|-------|---------|---------|
| `pre-task-agent-validator.sh` | PreToolUse | `{"tool_name":"Task"}` | Agent routing ✅ DONE |
| `pre-hubspot-api-call.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*hubspot*"}` | API validation ✅ DONE |
| `pre-company-merge.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*merge*"}` | Merge validation ✅ DONE |
| `pre-cms-publish-validation.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*publish*"}` | CMS validation ✅ DONE |
| `post-portal-authentication.sh` | PostToolUse | `{"tool_name":"Bash","command_pattern":"hs auth*"}` | Auth tracking ✅ DONE |

### opspal-marketo (15 remaining)

| Hook File | Event | Matcher | Purpose |
|-----------|-------|---------|---------|
| `api-limit-monitor.sh` | PostToolUse | `{"tool_name":"Bash","command_pattern":"*marketo*"}` | API limit tracking ✅ DONE |
| `pre-campaign-activation.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*campaign*activate*"}` | Activation validation ✅ DONE |
| `pre-bulk-operation.sh` | PreToolUse | `{"tool_name":"Bash","command_pattern":"*bulk*"}` | Bulk validation ✅ DONE |
| `session-start-marketo.sh` | SessionStart | (none) | Marketo init ✅ DONE |

---

## Priority 3: Nice to Have (Backlog)

### Session Management Hooks (opspal-core)

| Hook File | Event | Purpose |
|-----------|-------|---------|
| `session-start-scratchpad.sh` | SessionStart | Scratchpad init |
| `session-start-env-config.sh` | SessionStart | Env config |
| `session-end.sh` | Stop | Cleanup |
| `session-end-scratchpad.sh` | Stop | Scratchpad save |
| `session-context-loader.sh` | SessionStart | Context loading |

### Observability Hooks (various)

| Plugin | Hook File | Purpose |
|--------|-----------|---------|
| opspal-core | `post-tool-capture.sh` | Tool usage logging |
| opspal-salesforce | `post-operation-observe.sh` | Operation logging |
| opspal-marketo | `observability-quota-monitor.sh` | Quota tracking |

---

## Implementation Approach

### Phase 1: opspal-core Critical Hooks (Today)

```json
// Add to plugins/opspal-core/.claude-plugin/plugin.json
"hooks": [
  // Already added:
  { "event": "PreToolUse", "matcher": { "tool_name": "Task" }, "command": "./hooks/pre-task-template-injector.sh" },
  { "event": "PostToolUse", "matcher": { "tool_name": "Write", "file_pattern": "*.pdf" }, "command": "./hooks/post-pdf-verification.sh" },

  // Add these:
  { "event": "SessionStart", "command": "./hooks/session-init.sh" },
  { "event": "PreToolUse", "matcher": { "tool_name": "Bash" }, "command": "./hooks/pre-tool-execution.sh" },
  { "event": "PreToolUse", "matcher": { "tool_name": "Task" }, "command": "./hooks/pre-task-agent-validator.sh" }
]
```

### Phase 2: opspal-salesforce Critical Hooks

```json
// Add to plugins/opspal-salesforce/.claude-plugin/plugin.json
"hooks": [
  { "event": "PreToolUse", "matcher": { "tool_name": "Bash", "command_pattern": "sf project deploy*" }, "command": "./hooks/pre-deployment-comprehensive-validation.sh" },
  { "event": "PreToolUse", "matcher": { "tool_name": "Task" }, "command": "./hooks/pre-tool-use.sh" },
  { "event": "PostToolUse", "matcher": { "tool_name": "Bash", "command_pattern": "sf data query*" }, "command": "./hooks/post-sf-query-validation.sh" }
]
```

### Phase 3: Other Plugins

Similar patterns for hubspot, marketo, ai-consult.

---

## Full Inventory by Plugin

### opspal-core (44 hooks, 2 registered)

**Session Management:**
- session-init.sh
- session-start-scratchpad.sh
- session-start-env-config.sh
- session-start-version-check.sh
- session-context-loader.sh
- session-capture-init.sh
- session-end.sh
- session-end-reliability.sh
- session-end-scratchpad.sh

**Pre-Tool Validation:**
- pre-task-template-injector.sh ✅
- pre-task-agent-validator.sh
- pre-task-agent-recommendation.sh
- pre-task-routing-clarity.sh
- pre-task-runbook-reminder.sh
- pre-task-graph-trigger.sh
- pre-tool-execution.sh
- pre-tool-use-contract-validation.sh
- pre-operation-data-validator.sh
- pre-operation-env-validator.sh
- pre-operation-idempotency-check.sh
- pre-operation-snapshot.sh
- pre-plan-scope-validation.sh
- pre-dependency-check.sh
- pre-stop-org-verification.sh
- pre-compact.sh
- pre-commit-config-validation.sh

**Post-Tool Processing:**
- post-pdf-verification.sh ✅
- post-tool-use.sh
- post-tool-use-contract-validation.sh
- post-tool-capture.sh
- post-task-verification.sh
- post-task-stall-check.sh
- post-subagent-verification.sh
- post-audit-bluf-generator.sh
- post-edit-verification.sh
- post-reflect-strategy-update.sh
- post-todowrite-scratchpad.sh
- post-plugin-update.sh

**System:**
- unified-router.sh
- user-prompt-router.sh
- master-prompt-handler.sh
- prevention-system-orchestrator.sh
- task-graph-policy-enforcer.sh
- weekly-strategy-transfer.sh

### opspal-salesforce (29 hooks, 0 registered)

- pre-tool-use.sh
- pre-task-mandatory.sh
- pre-task-hook.sh
- pre-task-context-loader.sh
- pre-deployment-comprehensive-validation.sh
- pre-deploy-flow-validation.sh
- pre-deploy-report-quality-gate.sh
- pre-deployment-permission-sync.sh
- pre-flow-deployment.sh
- pre-sfdc-metadata-manager-invocation.sh
- pre-operation-org-validation.sh
- pre-batch-validation.sh
- pre-high-risk-operation.sh
- pre-picklist-dependency-validation.sh
- pre-territory-write-validator.sh
- pre-tool-use-territory-rule-validator.sh
- post-sf-query-validation.sh
- post-sf-command.sh
- post-org-auth.sh
- post-field-deployment.sh
- post-operation-observe.sh
- post-agent-operation.sh
- post-territory-operation-logger.sh
- post-assessment-notebooklm-sync.sh
- session-start-agent-reminder.sh
- hook-circuit-breaker.sh
- agent-usage-validator.sh
- validate-sfdc-project-location.sh
- universal-agent-governance.sh

### opspal-hubspot (10 hooks, 0 registered)

- pre-task-mandatory.sh
- pre-task-agent-validator.sh
- pre-task-context-loader.sh
- pre-hubspot-api-call.sh
- pre-company-merge.sh
- pre-cms-publish-validation.sh
- pre-write-path-validator.sh
- post-portal-authentication.sh
- post-portal-switch.sh
- post-cms-publish-notification.sh

### opspal-marketo (19 hooks, 0 registered)

- session-start-marketo.sh
- pre-orchestration.sh
- pre-bulk-operation.sh
- pre-bulk-export.sh
- pre-campaign-activation.sh
- pre-campaign-clone.sh
- pre-campaign-delete.sh
- pre-lead-merge.sh
- pre-intelligence-analysis.sh
- pre-observability-extract.sh
- post-campaign-create.sh
- post-bulk-import.sh
- post-extract-complete.sh
- post-operation-verification.sh
- post-instance-authentication.sh
- api-limit-monitor.sh
- sync-error-monitor.sh
- observability-quota-monitor.sh
- campaign-diagnostic-reminder.sh

### opspal-ai-consult (1 hook, 0 registered)

- post-tool-use-consultation-check.sh

---

## Testing Plan

After registering hooks:

1. **Verify hook loads**: `claude plugin validate <plugin-path>`
2. **Test event triggers**: Run commands that should trigger hooks
3. **Check output**: Look for hook system messages in responses
4. **Monitor performance**: Hooks should complete in <500ms

---

## Risk Mitigation

1. **Gradual rollout**: Register 5-10 hooks at a time
2. **Keep exit codes correct**: Hooks returning non-zero block operations
3. **Test in dev first**: Validate before pushing to main
4. **Monitor for errors**: Watch for hook execution failures

---

## Tracking

| Plugin | Total | Registered | Remaining | Status |
|--------|-------|------------|-----------|--------|
| opspal-core | 44 | 44 | 0 | ✅ Complete |
| opspal-salesforce | 30 | 30 | 0 | ✅ Complete |
| opspal-hubspot | 10 | 10 | 0 | ✅ Complete |
| opspal-marketo | 19 | 19 | 0 | ✅ Complete |
| opspal-ai-consult | 1 | 1 | 0 | ✅ Complete |
| developer-tools-plugin | 8 | 8 | 0 | ✅ Complete |
| **TOTAL** | **112** | **112** | **0** | ✅ |

---

## Phase 4 Summary (2026-01-28)

**Hooks Added:**
- opspal-core: +20 hooks (session-start-version-check, session-capture-init, session-end-reliability, pre-task-agent-recommendation, pre-task-routing-clarity, pre-operation-env-validator, pre-operation-idempotency-check, pre-operation-snapshot, pre-plan-scope-validation, pre-dependency-check, pre-stop-org-verification, pre-commit-config-validation, post-tool-use, post-tool-use-contract-validation, post-plugin-update, task-graph-policy-enforcer, weekly-strategy-transfer, prevention-system-orchestrator, user-prompt-router, unified-router)
- opspal-salesforce: +2 hooks (pre-deploy-flow-validation, hook-circuit-breaker)

**Remaining (5 hooks - low priority system hooks):**
- opspal-core: master-prompt-handler.sh (orchestrator), pre-compact.sh (context compaction)
- Note: Some hooks in subdirectories (context-loader/, reflection/, validation/) are helper modules, not standalone hooks

---

## Completion Summary

**🎉 ALL HOOKS NOW REGISTERED! 🎉**

| Plugin | Status | Hooks |
|--------|--------|-------|
| opspal-core | ✅ 44/44 | 100% complete |
| opspal-salesforce | ✅ 30/30 | 100% complete |
| opspal-hubspot | ✅ 10/10 | 100% complete |
| opspal-marketo | ✅ 19/19 | 100% complete |
| opspal-ai-consult | ✅ 1/1 | 100% complete |
| developer-tools-plugin | ✅ 8/8 | 100% complete |

**Total: 112/112 hooks registered (100%)**

All validation, error prevention, branding injection, session management, and system orchestration hooks are now active across all plugins.

---

## Phase 5 Summary (2026-01-28)

**Final hooks added:**
- opspal-core: +2 hooks (master-prompt-handler, pre-compact)
- developer-tools-plugin: +8 hooks (all 8 unregistered hooks)

---

*Last Updated: 2026-01-28*
*Status: ✅ COMPLETE*
