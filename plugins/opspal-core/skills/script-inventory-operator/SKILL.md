---
name: script-inventory-operator
description: Create a deterministic inventory of scripts and tooling clusters with ownership and risk metadata.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:platform-instance-manager
version: 1.0.0
---

# script-inventory-operator

## When to Use This Skill

- Before a major plugin refactor: cataloging all scripts across `opspal-core`, `opspal-salesforce`, and other plugins to find duplication and consolidation candidates
- After a plugin migration: verifying no orphaned scripts remain in deprecated directories
- Ownership audit: mapping scripts to the agent or hook that invokes them to identify unmaintained or dead code
- Pre-release hygiene: confirming the `scripts/lib/` shared library is not growing cross-plugin coupling violations
- Investigating script-heavy incidents: quickly locating which script a hook invokes without tracing the full execution chain

**Not for**: Automatically deleting or consolidating scripts — this skill produces the inventory and recommendations only; execution requires explicit approval.

## Required Inputs

| Input | Description |
|-------|-------------|
| Scope paths | Plugin directories to scan (e.g., `plugins/opspal-core/scripts/`, `plugins/opspal-salesforce/scripts/`) |
| Include / exclude filters | File patterns to include (e.g., `*.js`, `*.sh`) and directories to exclude (`node_modules/`, `vendor/`) |
| Ownership mapping | Agent and hook manifests used to infer which script is invoked by which component |

## Output Artifacts

- Script inventory report: every script with path, size, last-modified date, and inferred owner
- Cluster and duplication summary: scripts with identical or near-identical logic grouped by cluster
- Candidate consolidation list: scripts recommended for extraction to `scripts/lib/` shared, with risk level (LOW/MEDIUM/HIGH)

## Workflow

1. Glob all script files within the scope paths, excluding `node_modules/`, `vendor/`, and generated artifact directories.
2. For each script, record: path, size, last-modified date, and whether it is directly referenced in a `plugin.json`, agent, hook, or command file.
3. Run ownership inference: grep agent and hook files for script invocations; flag scripts with zero invocation references as candidates for removal review.
4. Detect duplication clusters: compare script content fingerprints to identify scripts with >80% overlap across plugins.
5. Generate the inventory report and consolidation candidate list with risk levels — HIGH risk if the script is invoked from more than 3 call sites.
6. Present the candidate list for human review; do not delete or move any scripts without explicit approval.

## Safety Checks

- Exclude generated and vendor directories from all scans — never inventory auto-generated outputs
- Do not delete or move any script automatically — the inventory is advisory only
- Mark confidence level for inferred ownership: HIGH (direct reference found), MEDIUM (pattern match), LOW (no reference found)
