# Deterministic Pruning Order

Use stable pruning order so repeated runs produce the same context:
1. Keep mandatory control fields.
2. Keep highest-signal task metadata.
3. Trim low-signal arrays and verbose traces.
4. Replace removed blocks with concise overflow markers.

Reference hooks:
- `plugins/opspal-core/hooks/subagent-start-context.sh` trims with fixed line windows.
- `plugins/opspal-core/hooks/post-tool-capture.sh` caps arrays and truncates error text.
