---
name: precommit-quality-enforcement-framework
description: Enforce pre-commit hook quality gates for secrets, silent failures, mock data, and boundary violations.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# precommit-quality-enforcement-framework

## When to Use This Skill

- Adding a new pre-commit check and needing a consistent gate structure (scan order, exit behavior, message format)
- A credential pattern (`SFDC_TOKEN`, `HUBSPOT_API_KEY`, AWS key prefix) was found in staged files and needs a blocking gate
- A hook script silently exits 0 on scan errors, causing quality gates to be bypassed without notice
- Mock/test data (hardcoded record IDs, fake emails, `test@test.com`) is leaking into production-bound config files
- A cross-plugin boundary violation (e.g., a plugin referencing another plugin's internal scripts) needs a commit-time block

**Not for**: large-file enforcement (use `precommit-large-file-gate`) or XML parse safety (use `xml-inline-parse-guard`).

## Quality Gate Execution Order

Gates run in this sequence; the first block exits immediately:

| Order | Gate | Trigger | Exit on Fail |
|-------|------|---------|-------------|
| 1 | Credential scan | Any staged file | Block (exit 1) |
| 2 | Boundary violation scan | `plugins/**` staged files | Block (exit 1) |
| 3 | Mock/test data lint | `config/**`, `*.json` staged | Block (exit 1) |
| 4 | JSON/YAML/XML parse validation | Structured files staged | Block (exit 1) |
| 5 | Silent-failure check | `hooks/*.sh` staged | Warn (exit 0) |

## Workflow

1. **Map the trigger surface**: identify which staged file patterns each gate applies to; consult `./quality-gate-matrix.md` for the canonical pattern list.
2. **Implement credential scanning first**: scan for API key prefixes, token patterns, and `.env` content using patterns from `./credential-scanning.md`; block immediately on any match.
3. **Run boundary violation scan**: for any staged `plugins/**` file, check if it references paths outside its own plugin directory; block if cross-plugin internal references are introduced.
4. **Lint for mock data**: scan `config/` and JSON files for hardcoded test values (`test@`, `fake_`, record ID patterns like `0015g000`); block if found in non-test paths.
5. **Validate structured file syntax**: run `jq . <file>` for JSON and `xmllint --noout <file>` for XML on all staged structured files; block on parse errors.
6. **Check for silent failures in hook scripts**: grep staged `hooks/*.sh` for missing `set -e` or bare `exit 0` after error paths; emit a warning (do not block) with a link to `hook-shell-safety-hardener`.
7. **Emit a gate summary**: print a one-line summary per gate (passed/failed) before exiting so the developer knows exactly which gate blocked them.

## Routing Boundaries

Use this skill for pre-commit hook quality gate design and enforcement.
Defer to `hook-shell-safety-hardener` for individual script hardening and `xml-inline-parse-guard` for XML-specific parse safety.

## References

- [Quality Gate Matrix](./quality-gate-matrix.md)
- [Credential and Boundary Scanning](./credential-scanning.md)
- [Error Handling and Mock Linting](./error-handling-lint.md)
