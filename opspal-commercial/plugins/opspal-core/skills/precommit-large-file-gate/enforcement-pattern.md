# Enforcement Pattern

Compute staged file sizes via `git diff --cached --name-only` + `stat`/`wc -c`.
Block on hard threshold with a fix path:
- split file,
- move to artifact storage,
- add allowlist entry with rationale.
