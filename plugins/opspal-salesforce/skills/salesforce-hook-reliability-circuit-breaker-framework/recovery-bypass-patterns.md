# Recovery and Bypass Patterns

Primary source: `hooks/hook-circuit-breaker.sh`.

## Bypass Behavior While OPEN

When the circuit is open, the hook emits an advisory JSON payload and exits 0. Claude Code receives the message but the tool call is not blocked:

```bash
# From hook-circuit-breaker.sh — OPEN state bypass
echo '{
  "systemMessage": "⚠️  Hook circuit breaker is OPEN (too many failures). Hook bypassed for safety. Normal operation will resume after cooldown.",
  "circuitBreakerState": "OPEN",
  "bypassed": true
}'
exit 0
```

Key rules for bypass:
- Always exit 0 — never block Claude Code operations because a hook is failing.
- Always include `"bypassed": true` so downstream telemetry can filter bypass events.
- Always include a human-readable `systemMessage` explaining the state.

## Half-Open Recovery Probe

After `COOLDOWN_SECONDS` has elapsed, the circuit transitions to HALF-OPEN and allows one probe execution:

```bash
# should_attempt_execution returns "half-open" when cooldown expires from OPEN state
if [ "$should_execute" = "half-open" ]; then
  state_json=$(transition_state "$state_json" "HALF-OPEN")
  save_state "$state_json"
  should_execute="true"
  log_metrics "transition" "HALF-OPEN" 0
fi
```

If the probe succeeds, the circuit closes:
```bash
if [ "$current_state" = "HALF-OPEN" ]; then
  state_json=$(transition_state "$state_json" "CLOSED")
  log_metrics "recovery_success" "CLOSED" "$execution_time"
fi
```

If the probe fails, the circuit re-opens immediately with a fresh cooldown timer.

## Manual Circuit Reset

Force-close the circuit without waiting for cooldown (use only when the root cause is fixed):

```bash
STATE_FILE="${CLAUDE_PLUGIN_ROOT}/.claude/hook-circuit-state.json"
jq '.state = "CLOSED" | .failures = [] | .lastStateChange = now | .recoveryAttempts += 1' \
  "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
echo "Circuit manually reset to CLOSED"
```

## Gradual Ramp-Up After Recovery

For hooks that call external services (e.g., Slack webhooks, license server), implement graduated recovery to avoid thundering herd on service restart:

```bash
# After CLOSED transition from HALF-OPEN, use exponential backoff for first N calls
RECOVERY_CALL_COUNT=$(jq -r '.recoveryAttempts // 0' "$STATE_FILE")
if [[ $RECOVERY_CALL_COUNT -le 3 ]]; then
  # Add jitter delay proportional to recovery attempt number
  sleep "$(awk "BEGIN {print $RECOVERY_CALL_COUNT * 0.5}")"
fi
```

## Diagnosing Why the Circuit Opened

```bash
STATE_FILE="${CLAUDE_PLUGIN_ROOT}/.claude/hook-circuit-state.json"
METRICS_FILE="${CLAUDE_PLUGIN_ROOT}/.claude/hook-metrics.json"

echo "=== Circuit State ==="
jq . "$STATE_FILE"

echo ""
echo "=== Last 5 Failures ==="
jq '[.[] | select(.event == "failure")] | .[-5:]' "$METRICS_FILE"

echo ""
echo "=== Transition History ==="
jq '[.[] | select(.event == "transition")]' "$METRICS_FILE"
```

## Wrapping a Hook with the Circuit Breaker

```bash
# Invoke my-hook.sh through the circuit breaker
HOOK_SCRIPT="${PLUGIN_ROOT}/hooks/my-hook.sh" \
  bash "${PLUGIN_ROOT}/hooks/hook-circuit-breaker.sh"
```

The circuit breaker inherits stdin from the parent and passes it to the child hook. State is tracked per `HOOK_SCRIPT` basename.

## Disabling the Circuit Breaker for Testing

```bash
export CIRCUIT_BREAKER_DISABLED=true
bash hooks/my-hook.sh
```

Add a guard at the top of `hook-circuit-breaker.sh`:
```bash
if [[ "${CIRCUIT_BREAKER_DISABLED:-false}" == "true" ]]; then
  exec bash "$HOOK_SCRIPT"   # pass-through directly
fi
```
