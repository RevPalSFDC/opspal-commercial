---
name: evidence-capture-packager
description: Package operational evidence artifacts into a review-ready bundle with index and retention metadata.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:ui-documentation-generator
version: 1.0.0
---

# evidence-capture-packager

## When to Use This Skill

- Packaging artifacts from a completed audit (CPQ, RevOps, automation) into a review-ready bundle for client delivery
- Preparing evidence for an incident postmortem: timestamped logs, screenshots, API responses, and diff outputs
- Creating a release gate evidence bundle before production deployments to satisfy change-management requirements
- Assembling governance review packages with index, retention metadata, and redaction confirmation
- Archiving assessment session artifacts so they are discoverable and reproducible after session compaction

**Not for**: Writing the narrative analysis of the evidence — use `postmortem-rca-writer` or the relevant assessment agent for that.

## Required Inputs

| Input | Description |
|-------|-------------|
| Evidence paths | File paths or glob patterns for artifacts to include |
| Review context | Type of review (audit, incident, release gate, governance) and audience |
| Retention policy | Retention duration and who is authorized to access the bundle |

## Output Artifacts

- Evidence index (`evidence-index.json`) listing every artifact with path, hash, and timestamp
- Timestamped artifact manifest with capture method (API response, screenshot, file read, bash output)
- Redaction checklist confirming secrets, PII, and confidential deal terms have been removed or masked

## Workflow

1. Enumerate all artifact paths using Glob — do not rely on a manually provided list; discover what actually exists.
2. Hash each artifact (SHA-256) to establish integrity at capture time; record in the index.
3. Apply the redaction checklist: scan each artifact for env var patterns, API keys, email addresses, and deal-specific financials; mask or exclude.
4. Annotate each artifact with capture context: tool used, timestamp, agent or session ID, and review type.
5. Generate the evidence index and manifest; write to the designated output path (e.g., `orgs/{org}/evidence/{review-id}/`).
6. Confirm required artifacts are present against the review-type checklist (see retention policy); flag any gaps.

## Safety Checks

- Redact secrets and PII before any artifact enters the bundle — never include raw `.env` files or API key values
- Preserve source integrity: do not modify artifact content; only add metadata wrappers
- Flag missing required artifacts as BLOCKING — incomplete evidence bundles must not be delivered as final
