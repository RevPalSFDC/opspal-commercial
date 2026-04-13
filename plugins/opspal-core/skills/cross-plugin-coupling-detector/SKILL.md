---
name: cross-plugin-coupling-detector
description: Map cross-plugin dependencies in scripts/hooks and surface high-risk coupling edges.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:cross-platform-pipeline-orchestrator
version: 1.0.0
---

# cross-plugin-coupling-detector

## When to Use This Skill

- Pre-release architecture review: confirming that opspal-salesforce hooks do not directly `require()` opspal-hubspot scripts
- A new script in one plugin references a path in another plugin's `scripts/lib/` — validating whether this coupling is approved
- Running the docs:ci gate and the coupling check is failing — diagnosing which edges are new and unapproved
- Generating a coupling graph before a major refactor to understand the blast radius of script moves
- Auditing hook files for cross-plugin `source` or `bash` invocations that violate boundary policy

**Not for**: Enforcing import rules at runtime — this is a static analysis / governance tool, not a runtime blocker.

## Required Inputs

| Input | Description |
|-------|-------------|
| Plugin scope | One or more plugin directories to scan (e.g., `opspal-salesforce`, `opspal-hubspot`) |
| Allowed dependency edges | Approved cross-plugin references (typically only `opspal-core` as a shared dependency) |
| Baseline exceptions | Previously documented approved violations with justification |

## Output Artifacts

- Coupling graph (nodes = plugins, edges = dependency references with file locations)
- Severity-ranked violations (new unapproved edges = CRITICAL, approved exceptions = INFO)
- Decoupling action plan with recommended refactor path (extract to `opspal-core` shared lib vs. inline copy)

## Workflow

1. Scope the scan: list the plugin directories to analyze and load the approved-edges baseline from config.
2. Grep all `scripts/`, `hooks/`, and `agents/` files for cross-plugin path references (relative paths like `../../opspal-hubspot/scripts/`).
3. Build the coupling graph: map each reference to its source plugin, target plugin, and file location.
4. Diff against the approved-edges baseline to identify new violations.
5. Rank violations by severity: direct script imports are CRITICAL; agent cross-references are MEDIUM; documentation links are INFO.
6. Generate the decoupling action plan: for each violation, recommend either extracting shared logic to `opspal-core/scripts/lib/` or eliminating the dependency.

## Safety Checks

- Fail closed for new unapproved edges — the docs:ci gate must not pass until the violation is either removed or added to the baseline with justification
- Keep detection separate from enforcement: this skill reports violations; it does not auto-delete or auto-refactor
- Require a documented rollback path before any remediation changes are applied to production plugin code
