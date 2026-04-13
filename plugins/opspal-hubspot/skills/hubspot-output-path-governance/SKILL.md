---
name: hubspot-output-path-governance
description: Enforce hook-based output path and artifact placement governance for generated HubSpot artifacts.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-output-path-governance

## When to Use This Skill

- A HubSpot hook or script is writing generated artifacts (reports, exports, migration files) and the output path must be validated before writing
- Enforcing that no generated file is written outside of approved output directories (`output/`, `reports/`, `cache/`, `logs/`)
- Reviewing a hook that produces artifacts to confirm it respects the client-centric org folder structure (`orgs/{org}/platforms/hubspot/{portal}/`)
- Adding a non-blocking guidance pattern when an artifact is written to a tolerated-but-non-canonical path
- Auditing a plugin release to confirm no script writes to `scripts/`, `hooks/`, `agents/`, or other source-controlled directories

**Not for**: Tempfile lifecycle (use `hubspot-hook-subprocess-and-tempfile-safety`), CMS publish paths, or Salesforce export paths.

## Artifact Classification and Allowed Paths

| Artifact Type | Canonical Path | Tolerated Path | Blocked Path |
|---|---|---|---|
| Portal export (contacts, deals) | `output/hubspot/{portal}/exports/` | `output/` root | `scripts/`, `hooks/` |
| Migration run data | `output/migrations/{run-id}/` | `output/` root | Any source dir |
| Audit/compliance reports | `reports/hubspot/{portal}/` | `reports/` root | `agents/`, `commands/` |
| Hook runtime logs | `logs/` | None | Any non-`logs/` dir |
| Cache files | `cache/hubspot/{portal}/` | `.cache/` | `config/`, `templates/` |
| Temp scratch files | `$TMPDIR` via `mktemp` | `/tmp/` | Plugin source dirs |

## Workflow

1. **Intercept the write operation** — the PostToolUse hook fires after any `Write` or `Bash` tool call that creates a file. Parse the output path from `tool_input.file_path` or the bash command's redirection target.
2. **Classify the artifact** — match the output path against the classification table above. Determine if the path is canonical, tolerated, or blocked.
3. **Evaluate portal-centric structure** — confirm the path includes the portal ID segment when writing portal-specific data. If `HUBSPOT_PORTAL_ID` is set in the environment, the path must contain it.
4. **Block writes to source directories** — if the path resolves under `scripts/`, `hooks/`, `agents/`, `commands/`, `skills/`, or `templates/`, emit a `block` decision with a clear remediation path.
5. **Emit non-blocking guidance for tolerated paths** — if the path is tolerated but not canonical, emit a `warn` with the recommended canonical path in the `remediation` field of the response envelope.
6. **Log the path governance decision** — write `{ts, artifact_type, path, decision, canonical_path}` to `logs/output-path-audit.jsonl` for compliance review.

## Routing Boundaries

Use this skill for output path validation and artifact placement governance only.
Defer to `hubspot-hook-subprocess-and-tempfile-safety` for tempfile lifecycle and to `hubspot-hook-response-contracts` for envelope formatting.

## References

- [Output Path Validation](./path-validation.md)
- [Artifact Classification Rules](./artifact-classification.md)
- [Nonblocking Guidance Patterns](./nonblocking-guidance.md)
