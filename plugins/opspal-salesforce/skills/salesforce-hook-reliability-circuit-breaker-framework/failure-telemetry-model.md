# Failure Telemetry Model

Primary source: `hooks/hook-circuit-breaker.sh`.

## Metrics Tracked

- **Failure timestamps** within the sliding window (Unix epoch integers in `state.failures[]`)
- **Open/close transition events** (`openCount`, `lastStateChange`)
- **Recovery attempt outcomes** (`recoveryAttempts`)
- **Per-execution timing** (`executionTimeMs` in `hook-metrics.json`)

## Metrics File Schema

`${CLAUDE_PLUGIN_ROOT}/.claude/hook-metrics.json` — a JSON array capped at 1000 entries:

```json
[
  {
    "timestamp": 1712927400,
    "event": "success",
    "state": "CLOSED",
    "executionTimeMs": 45,
    "hook": "pre-soql-validation.sh"
  },
  {
    "timestamp": 1712927410,
    "event": "failure",
    "state": "CLOSED",
    "executionTimeMs": 10003,
    "hook": "pre-soql-validation.sh"
  },
  {
    "timestamp": 1712927410,
    "event": "transition",
    "state": "OPEN",
    "executionTimeMs": 0,
    "hook": "pre-soql-validation.sh"
  }
]
```

Entry types: `success`, `failure`, `bypassed`, `transition`, `recovery_success`.

## Writing Metrics (from hook-circuit-breaker.sh)

```bash
log_metrics() {
  local event="$1"
  local state="$2"
  local execution_time_ms="${3:-0}"

  local metric="{
    \"timestamp\": $(date +%s),
    \"event\": \"$event\",
    \"state\": \"$state\",
    \"executionTimeMs\": $execution_time_ms,
    \"hook\": \"$(basename "$HOOK_SCRIPT")\"
  }"

  mkdir -p "$(dirname "$METRICS_FILE")"
  if [ -f "$METRICS_FILE" ]; then
    local existing
    existing=$(cat "$METRICS_FILE")
    # Keep last 1000 entries — self-capping
    echo "$existing" | jq --argjson m "$metric" '. += [$m] | .[-1000:]' > "$METRICS_FILE"
  else
    echo "[$metric]" > "$METRICS_FILE"
  fi
}
```

## Querying Telemetry

```bash
METRICS="${HOME}/.claude/hook-metrics.json"

# Failure rate in last hour
NOW=$(date +%s)
WINDOW=$((NOW - 3600))
jq --argjson w "$WINDOW" '[.[] | select(.timestamp > $w and .event == "failure")] | length' "$METRICS"

# Average execution time by hook
jq 'group_by(.hook) | map({
  hook: .[0].hook,
  avg_ms: (map(.executionTimeMs) | add / length | floor),
  count: length
})' "$METRICS"

# Circuit open transitions
jq '[.[] | select(.event == "transition" and .state == "OPEN")] | length' "$METRICS"

# Time since last failure
jq '[.[] | select(.event == "failure")] | last | .timestamp' "$METRICS"
```

## Alerting on High Failure Rates

Add to `session-start-sf-context.sh` to surface circuit health at session start:

```bash
if [[ -f "${CLAUDE_PLUGIN_ROOT}/.claude/hook-circuit-state.json" ]]; then
  STATE=$(jq -r '.state' "${CLAUDE_PLUGIN_ROOT}/.claude/hook-circuit-state.json")
  OPEN_COUNT=$(jq -r '.openCount // 0' "${CLAUDE_PLUGIN_ROOT}/.claude/hook-circuit-state.json")
  if [[ "$STATE" == "OPEN" ]]; then
    echo "⚠️  Hook circuit breaker is OPEN (${OPEN_COUNT} open events). Run /hooks-health to diagnose." >&2
  fi
fi
```

## Execution Time Percentiles (jq)

```bash
jq '[.[] | select(.executionTimeMs > 0) | .executionTimeMs] | sort |
  {
    p50: .[length * 0.5 | floor],
    p90: .[length * 0.9 | floor],
    p99: .[length * 0.99 | floor],
    max: last
  }' "$METRICS"
```

High p99 values (>8000 ms) indicate timeout risk — consider reducing `HOOK_TIMEOUT` threshold or optimizing the hook script.
