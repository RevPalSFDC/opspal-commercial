# Input Budget Contract

Standardize environment keys such as:
- `MAX_HOOK_INPUT_BYTES`
- `MAX_TOOL_ARGS_BYTES`
- `HOOK_PAYLOAD_GUARD_MODE` (`warn|block`)

Measure actual byte length before parsing JSON to avoid memory spikes.
