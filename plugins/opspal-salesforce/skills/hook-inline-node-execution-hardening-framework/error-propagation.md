# Error Propagation

Map Node failures to deterministic hook exit behavior with structured diagnostics.

## Exit Code Matrix

| Scenario | Node Exit | timeout(1) Exit | Hook Action | Claude Code Effect |
|----------|-----------|-----------------|-------------|-------------------|
| Success | 0 | 0 | Forward stdout | Tool call proceeds |
| Validation block | 1 | 1 | Exit 1, print reason | Tool call denied |
| Parse error (bad input) | 2 | 2 | Exit 0 (fail open) | Advisory only |
| Timeout | — | 124 | Exit 0 (fail open) | Advisory only |
| OOM / SIGKILL | 137 | 137 | Exit 0 (fail open) | Advisory only |
| Node binary missing | — | 127 | Exit 0 (fail open) | Advisory only |

Advisory hooks (observe-only) always exit 0 regardless of Node exit code. Only explicitly blocking hooks — those that implement a hard safety gate — propagate non-zero exits.

## Fail-Open Template

```bash
run_node_advisory() {
  local script="$1"
  local log_file="$2"
  local hook_input="$3"
  local timeout_s="${HOOK_TIMEOUT:-10}"

  local node_out node_exit=0
  node_out=$(printf '%s' "$hook_input" | timeout "$timeout_s" node "$script" 2>>"$log_file") \
    || node_exit=$?

  case $node_exit in
    0)
      if printf '%s' "$node_out" | jq -e . >/dev/null 2>&1; then
        printf '%s\n' "$node_out"
      else
        printf '%s' "[$(basename "$script")] non-JSON output discarded" >>"$log_file"
        printf '{}\n'
      fi
      ;;
    124)
      printf '%s\n' "[$(basename "$script")] TIMEOUT after ${timeout_s}s" >>"$log_file"
      printf '{}\n'
      ;;
    *)
      printf '%s\n' "[$(basename "$script")] exited $node_exit" >>"$log_file"
      printf '{}\n'
      ;;
  esac
  return 0   # advisory hook always succeeds
}
```

## Fail-Closed Template (blocking hook)

```bash
run_node_blocker() {
  local script="$1"
  local log_file="$2"
  local hook_input="$3"

  local node_out node_exit=0
  node_out=$(printf '%s' "$hook_input" | timeout "${HOOK_TIMEOUT:-10}" node "$script" 2>>"$log_file") \
    || node_exit=$?

  if [[ $node_exit -eq 1 ]]; then
    # Node signalled a deterministic violation — honour it
    printf '%s\n' "$node_out"  # block reason surfaced to user
    exit 1
  elif [[ $node_exit -ne 0 ]]; then
    # Ambiguous failure — fail open, do not incorrectly block
    printf '%s\n' "[$(basename "$script")] ambiguous exit $node_exit — allowing" >>"$log_file"
    printf '{}\n'
    exit 0
  fi

  printf '%s\n' "$node_out"
  exit 0
}
```

## Crash Diagnostics

When Node crashes, its stderr lands in `$LOG_FILE`. Include the tool name and timestamp so crashes are traceable:

```bash
{
  printf '[%s] hook=%s script=%s exit=%s\n' \
    "$(date -u +%FT%TZ)" "$HOOK_NAME" "$(basename "$SCRIPT")" "$node_exit"
} >> "$LOG_FILE"
```

Rotate `$LOG_FILE` before it exceeds 5 MB — see `hook-log-retention-and-rotation-framework`.

## Signal Propagation with Cleanup

```bash
TMP=$(mktemp)
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT SIGTERM SIGINT SIGHUP

printf '%s' "$HOOK_INPUT" > "$TMP"
node "$SCRIPT" --input "$TMP" 2>>"$LOG_FILE" || node_exit=$?
```

The `trap` ensures temp files are removed even when the hook shell is interrupted.
