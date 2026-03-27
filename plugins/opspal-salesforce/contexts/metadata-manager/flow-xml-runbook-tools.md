# Flow XML Tools And Techniques Context

Use this context when selecting scripts, commands, and utilities for Flow XML work.

## Tooling Guidance

- Use the existing Flow validators before deploy.
- Prefer deterministic CLI and script workflows over manual XML editing when helpers exist.
- Capture the exact command or script used for validation and deployment evidence.
- Reuse shared tooling for field extraction, rollback, and metadata comparison.

## Required Checks

- Verify the script or CLI command matches the target flow operation.
- Validate XML after structural edits and before deployment.
- Keep deploy commands org-aware and environment-safe.
- Record any generated artifacts that will be reused downstream.

## Full Runbook

Reference `docs/runbooks/flow-xml-development/03-tools-and-techniques.md` for the complete toolchain.
