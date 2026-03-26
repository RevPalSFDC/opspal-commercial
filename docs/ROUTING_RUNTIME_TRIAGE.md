# Routing And Runtime Triage

Use this when a Salesforce workflow fails with specialist-routing or tool-projection errors.

## Fast Path

1. Run `npm run verify:routing-runtime-integrity -- --json`.
2. If `routingIntegrity.pass=false`, treat it as a repo-side bug before merge.
3. If `routingIntegrity.pass=true` and the incident class is `external_runtime_projection_loss`, treat it as a likely host runtime/UI projection bug.
4. If the incident class is `spawn_time_route_profile_mismatch`, treat it as a routing/enforcement bug.

## Decision Table

- Markdown/index mismatch or stale `routing-index.json`: repo metadata/index drift.
  Signs: `routing_metadata_drift`, `routing_index_stale_*`, `salesforce_agent_missing_*_bash`.
- Pending route cleared or auto-delegated to an agent outside the active profile: routing/enforcement bug.
  Signs: `ROUTING_REQUIRED_PROFILE_MISMATCH`, `ROUTING_AUTO_DELEGATION_PROFILE_MISMATCH`, `ROUTING_REQUIRED_AGENT_MISMATCH`.
- Runtime says a Bash-capable specialist only has `Read/Write` or `no Bash` while repo validators pass: host runtime/UI projection loss.
  Signs: incident class `external_runtime_projection_loss`, `ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH`, Claude debug log lines like `only has Read/Write tools` or `no Bash`.

## Where To Check

- Canonical routing rules: `plugins/opspal-core/config/routing-patterns.json`
- Capability/tool-fit rules: `plugins/opspal-core/config/routing-capability-rules.json`
- Generated artifact: `plugins/opspal-core/routing-index.json`
- Routing validator: `plugins/opspal-core/scripts/lib/validate-routing-integrity.js`
- Runtime incident verifier: `scripts/validate-runtime-incident-fixtures.js`
- Combined CI/local gate: `scripts/verify-routing-runtime-integrity.js`
- Replay fixture config: `scripts/config/runtime-incident-fixtures.json`
- Replay logs: `plugins/opspal-core/test/hooks/fixtures/`
- Hook/runtime logs: `$CLAUDE_HOOK_LOG_ROOT` or `.claude/logs/`
- Live smoke debug logs: `bash scripts/test-claude-hooks-smoke.sh --skip-live --keep-temp`

## Expected Outcomes

- `markdown/index mismatch` + validator failures: fix repo metadata or regenerate `routing-index.json`.
- `route/profile mismatch`: fix route derivation, allowed family, or spawn-time enforcement.
- `runtime says no Bash` + repo validators pass: capture the debug log, keep the CI report, and escalate as host/runtime projection drift.

## Projection-Loss Circuit-Break Protocol

When two or more specialists report Read/Write-only projection in the same session:

1. `post-subagent-verification.sh` detects the pattern via `projection_loss_check()` and records each event via `routing-state-manager.js record-projection-loss`.
2. On the second event with a different agent name, the state is updated with `projection_loss_circuit_broken: true`.
3. `post-subagent-verification.sh` emits `PROJECTION_LOSS_CIRCUIT_BREAK` in `additionalContext` to the parent.
4. `pre-tool-use-contract-validation.sh` reads `projection_loss_circuit_broken` from routing state and blocks all parent Bash with reason `PROJECTION_LOSS_CIRCUIT_BREAK`.
5. Do NOT attempt further specialist delegation or direct Bash recovery.
6. Surface the error to the user: this is a host/runtime UI projection bug, not a data or business logic failure.
7. To reset: close and re-open the Claude Code session to obtain a fresh agent spawn context.

**Signs:** `PROJECTION_LOSS_CIRCUIT_BREAK` in hook output or logs, two or more `SUBAGENT_PROJECTION_LOSS` events with different agent names in routing state.

**Distinguishing from other failures:**
- Single projection loss (event count = 1): `SUBAGENT_PROJECTION_LOSS` — may be transient, retry is allowed.
- Repeated projection loss (event count >= 2, different agents): `PROJECTION_LOSS_CIRCUIT_BREAK` — systemic, no retry.
- Parent fallback after specialist clearance: `ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH` — route was cleared but parent is executing instead.

## Compound Cleanup Routing

Multi-step Salesforce cleanup workflows (account naming + contact reparent + CSV + duplicate delete) now route to `sfdc-orchestrator` via three mechanisms:

1. **Mandatory patterns** (`routing-patterns.json`): `compound-salesforce-cleanup-indicators` catches common compound phrasing.
2. **Full-body scan** (`unified-router.sh`): When the normalized opener misses, the router scans the full raw message body against all mandatory patterns.
3. **Compound shape detection** (`unified-router.sh`): Counts 6 signal groups (naming, count/CSV, reparent, delete duplicate, bulk update, verify). If >= 3 match, forces `sfdc-orchestrator`.

Additionally, `detect_continue_intent()` now treats compound cleanup signals (reparent, duplicate account delete, etc.) as high-risk actions, preventing continuation prompts from suppressing routing.
