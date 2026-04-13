---
name: xml-inline-parse-guard
description: Harden inline XML ingestion paths with format detection, parser safety, and policy-aware validation.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# xml-inline-parse-guard

## When to Use This Skill

- A hook or script ingests Salesforce metadata XML (Flow, Layout, PermissionSet) inline and fails silently when the XML is malformed
- A `Write` or `Edit` tool call delivers XML content that must be validated before it reaches the Salesforce deployment pipeline
- An XML file contains embedded CDATA, namespace declarations, or entity references that break naive string-based parsing in shell hooks
- A hook uses `grep` or `sed` to extract XML field values rather than a proper XML parser, risking incorrect extraction on multi-line elements
- A deployed Flow or Layout XML was rejected by Salesforce with a parse error that could have been caught at commit time

**Not for**: JSON or YAML validation (use `precommit-quality-enforcement-framework`) or Salesforce metadata schema validation beyond syntax correctness.

## Format Detection Heuristics

| Signal | Detected As | Parser to Use |
|--------|-------------|--------------|
| Starts with `<?xml` | XML | `xmllint --noout` |
| Root tag contains `xmlns:xsi` | SFDC metadata XML | `xmllint` + XSD schema |
| Contains `<![CDATA[` | XML with CDATA | `xmllint` (handles natively) |
| Starts with `{` or `[` | JSON (not XML) | Route to JSON validator |
| Ambiguous | Unknown | Emit `format_unknown` degraded signal |

## Workflow

1. **Detect format**: read the first 512 bytes of the incoming content and apply the heuristics table above; do not assume XML based on file extension alone.
2. **Select parser**: for standard XML use `xmllint --noout -`; for Salesforce metadata XML, additionally validate against the relevant XSD from `./parser-safety.md`.
3. **Run parse validation**: pipe content through `xmllint 2>&1`; capture stderr for error messages and stdout for success confirmation.
4. **Apply policy overlays**: consult `./policy-overlays.md` for content-level rules beyond syntax — e.g., block Flow XML that references deprecated API versions, or warn on Layout XML missing required field sections.
5. **Emit structured parse result**: output a JSON decision envelope with `parse_valid: true/false`, `format_detected`, and `error_message` (first xmllint error line, sanitized).
6. **Handle degraded mode**: if `xmllint` is not installed, emit `{"action":"degraded","reason":"xmllint not found; XML validation skipped"}` and exit 3 — never silently skip validation and exit 0.
7. **Test pass and fail paths**: test with (a) valid Flow XML → parse_valid: true, exit 0; (b) truncated XML → parse_valid: false, exit 1 with error message; (c) JSON content → format_unknown, exit 3.

## References

- [Format Detection](./format-detection.md)
- [Parser Safety](./parser-safety.md)
- [Policy Overlays](./policy-overlays.md)
