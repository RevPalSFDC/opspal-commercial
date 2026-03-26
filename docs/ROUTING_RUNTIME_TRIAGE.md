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
