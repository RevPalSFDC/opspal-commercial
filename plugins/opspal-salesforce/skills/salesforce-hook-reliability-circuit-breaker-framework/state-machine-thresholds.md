# State Machine and Thresholds

Primary source: `hooks/hook-circuit-breaker.sh`.

## States

- **CLOSED**: Normal operation. Hook executes on every call.
- **OPEN**: Hook failed >= `FAILURE_THRESHOLD` times within `FAILURE_WINDOW_SECONDS`. Hook is bypassed. Claude Code receives an advisory message and `exit 0`.
- **HALF-OPEN**: Cooldown has elapsed. One probe execution is attempted. Success → CLOSED. Failure → OPEN with reset cooldown.

## Default Thresholds (hook-circuit-breaker.sh)

```bash
FAILURE_THRESHOLD=3         # Open after 3 failures in the window
FAILURE_WINDOW_SECONDS=300  # Sliding window = 5 minutes
COOLDOWN_SECONDS=120        # Wait 2 minutes before half-open probe
HOOK_TIMEOUT=10             # Hard timeout per hook execution
```

Override via environment variable before invoking:
```bash
FAILURE_THRESHOLD=5 COOLDOWN_SECONDS=300 \
  HOOK_SCRIPT=hooks/my-hook.sh bash hooks/hook-circuit-breaker.sh
```

## Recommended Thresholds by Hook Category

| Category | Failure Threshold | Window | Cooldown | Recovery Requirement |
|----------|-------------------|--------|----------|----------------------|
| Routing advisory | 5 | 10 min | 10 min | 1 success |
| Pre-tool validation | 3 | 5 min | 2 min | 1 success |
| External API hooks | 2 | 5 min | 15 min | Health check |
| Post-tool logging | 10 | 5 min | 5 min | 1 success |
| Session-start hooks | 2 | session | 30 min | 1 success |

## State File Schema

```json
{
  "state": "CLOSED",
  "failures": [1712927400, 1712927410],
  "lastStateChange": 1712927400,
  "successCount": 42,
  "failureCount": 5,
  "openCount": 2,
  "recoveryAttempts": 1
}
```

Location: `${CLAUDE_PLUGIN_ROOT}/.claude/hook-circuit-state.json` (one file per hook name when using multiple instances — differentiate with `CB_NAME` env var).

## Sliding Window Failure Counting

Failures outside the window are evicted on every call, so the circuit does not trip on old failures:

```bash
# From hook-circuit-breaker.sh
local now=$(date +%s)
local window_start=$((now - FAILURE_WINDOW_SECONDS))
# Evict failures older than window
state_json=$(echo "$state_json" | jq --argjson ws "$window_start" \
  '.failures = [.failures[] | select(. > $ws)]')
RECENT_FAILURES=$(echo "$state_json" | jq '.failures | length')
```

## State Transitions

```
[CLOSED] + failure + recent_failures >= threshold → [OPEN], record openCount++
[CLOSED] + success → [CLOSED], clear failures array
[OPEN]   + cooldown expired → [HALF-OPEN], record recoveryAttempts++
[OPEN]   + call arrives before cooldown → bypass, exit 0
[HALF-OPEN] + success → [CLOSED]
[HALF-OPEN] + failure → [OPEN], reset cooldown timer
```
