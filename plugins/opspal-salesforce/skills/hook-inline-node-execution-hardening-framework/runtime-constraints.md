# Runtime Constraints

Set explicit timeouts and memory-aware payload handling for inline Node steps.

## Timeout Budget

Claude Code's hook executor applies a per-hook wall-clock limit. The Salesforce plugin sets `HOOK_TIMEOUT=10` seconds in `hook-circuit-breaker.sh`. Node scripts must complete well inside that window.

| Hook phase | Suggested Node budget | Remaining for shell overhead |
|------------|----------------------|------------------------------|
| PreToolUse validation | 3 s | 7 s |
| PostToolUse logging | 5 s | 5 s |
| Circuit-breaker wrapper | 10 s total (full budget) | — |

Always use the `timeout` command — never rely on Node to self-terminate:

```bash
HOOK_TIMEOUT="${HOOK_TIMEOUT:-10}"
timeout "$HOOK_TIMEOUT" node "$SCRIPT" < "$TMP_IN" > "$TMP_OUT" 2>>"$LOG_FILE" || node_exit=$?
if [[ ${node_exit:-0} -eq 124 ]]; then
  echo "[$(basename "$0")] Node timed out — allowing as advisory" >&2
  exit 0
fi
```

## Memory Constraints

Hook processes share the host's memory with Claude Code. Large Node scripts that load heavy frameworks (e.g., xml2js with full document trees) can spike RSS above 200 MB on large deployments.

Techniques to control memory:
- Stream XML/JSON rather than loading entire document into memory.
- Use `--max-old-space-size` to cap Node heap if needed: `node --max-old-space-size=128 "$SCRIPT"`.
- Truncate oversized stdin payloads before passing to Node (see IO Contract).

```bash
# Cap heap at 128 MB for lightweight validators
node --max-old-space-size=128 "$SCRIPT" < "$TMP_IN"
```

## Node Binary Discovery

In Desktop/GUI contexts the PATH may not include the Node binary. Check before invoking:

```bash
if ! command -v node &>/dev/null; then
  # Try common NVM locations
  for candidate in "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -1)/bin/node" \
                   /usr/local/bin/node /opt/homebrew/bin/node; do
    if [[ -x "$candidate" ]]; then
      alias node="$candidate"
      break
    fi
  done
fi
if ! command -v node &>/dev/null; then
  echo "[hook] node not found — skipping" >&2
  exit 0
fi
```

## Version Guard

Some scripts rely on Node 18+ features (e.g., native `fetch`, `structuredClone`):

```bash
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [[ "${NODE_MAJOR:-0}" -lt 18 ]]; then
  echo "[hook] node ${NODE_MAJOR} < 18 — skipping" >&2
  exit 0
fi
```

## Concurrency Safety

Multiple hooks can run concurrently for parallel tool calls. State files written by Node scripts must be atomic:

```js
// Atomic write using rename (POSIX guarantee)
const fs = require('fs');
const tmp = stateFile + '.tmp.' + process.pid;
fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
fs.renameSync(tmp, stateFile);  // atomic on POSIX
```

## Dependency Availability Check

```bash
# Guard for jq (required by many hooks before node is called)
if ! command -v jq &>/dev/null; then
  echo "[$(basename "$0")] jq not found, skipping" >&2
  exit 0
fi

# Guard for node
if ! command -v node &>/dev/null; then
  echo "[$(basename "$0")] node not found, skipping" >&2
  exit 0
fi
```

Both guards appear in every production hook in this plugin (`hook-circuit-breaker.sh`, `universal-agent-governance.sh`, `pre-bash-dispatcher.sh`).

## SIGTERM / SIGKILL Handling in Node

When `timeout` expires it sends SIGTERM, then SIGKILL. Register a cleanup handler:

```js
process.on('SIGTERM', () => {
  process.stderr.write('[validator] SIGTERM received — exiting\n');
  // flush any pending writes
  process.exit(0);
});
```

Do not rely on SIGTERM being delivered before SIGKILL — it may not be if the timeout is very short.
