# Fallback Semantics

When size exceeds budget:
- `warn` mode: continue and emit overflow diagnostics.
- `block` mode: reject with actionable reduction guidance.
- `degrade` mode: use compact summary context only.

Prefer explicit mode flags and default to `warn` for observational hooks, `block` for pre-execution risk hooks.
