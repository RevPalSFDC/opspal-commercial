# IO Contract

Define exact stdin/stdout JSON schemas for shell-to-Node boundaries.
Avoid mixing human logs with machine output on stdout.

## Rules

- **stdin** is the sole channel for input. Never pass large payloads as command-line arguments — `ARG_MAX` on Linux (~2 MB) truncates silently.
- **stdout** must contain one complete JSON object and nothing else. Any text that is not valid JSON will be discarded or cause a parse error in the parent hook.
- **stderr** is for diagnostics only. All `console.log`, `console.warn`, and stack traces go here. Redirect with `2>>"$LOG_FILE"` in the shell caller.
- **Exit 0** means the Node script produced a valid result in stdout. **Exit non-zero** signals failure; the parent hook applies its fallback allow/block policy.

## Canonical Shell Invocation

```bash
NODE_EXIT=0
NODE_OUT=$(printf '%s' "$HOOK_INPUT" | timeout "${HOOK_TIMEOUT:-10}" node "$SCRIPT" 2>>"$LOG_FILE") || NODE_EXIT=$?

if [[ $NODE_EXIT -eq 124 ]]; then
  # timeout(1) fires SIGTERM, then SIGKILL; 124 = timed out
  echo "[$(basename "$0")] Node timed out — failing open" >&2
  printf '{}\n'; exit 0
fi

if [[ $NODE_EXIT -ne 0 ]]; then
  echo "[$(basename "$0")] Node exited $NODE_EXIT — failing open" >&2
  printf '{}\n'; exit 0
fi

# Validate output before forwarding
if ! printf '%s' "$NODE_OUT" | jq -e . >/dev/null 2>&1; then
  echo "[$(basename "$0")] Node output not JSON — failing open" >&2
  printf '{}\n'; exit 0
fi

printf '%s\n' "$NODE_OUT"
```

## Canonical Node Script Structure

```js
'use strict';
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch (e) {
    process.stderr.write('[validator] bad JSON input: ' + e.message + '\n');
    process.exit(2);  // parse error — distinct from validation failure
  }

  // All diagnostics → stderr
  process.stderr.write('[validator] processing tool: ' + input.tool_name + '\n');

  const result = validate(input);

  // Only JSON → stdout
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
});

process.stdin.on('error', err => {
  process.stderr.write('[validator] stdin error: ' + err.message + '\n');
  process.exit(2);
});
```

## Payload Size Guard

```bash
PAYLOAD_SIZE=$(printf '%s' "$HOOK_INPUT" | wc -c)
MAX_BYTES=131072   # 128 KB hard cap
if [[ $PAYLOAD_SIZE -gt $MAX_BYTES ]]; then
  # Trim to essential fields only before passing to Node
  HOOK_INPUT=$(printf '%s' "$HOOK_INPUT" | jq '{tool_input, tool_name}')
fi
```

## Output Schema for Claude Code hooks

```json
{
  "suppressOutput": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Validation passed"
  }
}
```

For a blocking hook (exit 1), stdout content is surfaced to the user as the block reason — keep it human-readable.
