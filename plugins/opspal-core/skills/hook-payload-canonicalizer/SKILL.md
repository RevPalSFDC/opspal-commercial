---
name: hook-payload-canonicalizer
description: Canonicalize reconstructed hook payloads to avoid regex-induced JSON corruption in shell flows.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hook-payload-canonicalizer

## When to Use This Skill

- A hook script uses `sed`, `awk`, or string interpolation to reconstruct JSON from hook stdin, risking corruption on special characters
- Hook output JSON is inconsistently formatted (sometimes pretty-printed, sometimes minified) and downstream parsers break
- A shell hook receives a JSON payload and passes modified fields back without re-validating the JSON structure
- Unicode characters, newlines, or quotes in tool input values are breaking a hook's `jq` parse chain
- A hook is rebuilding a decision envelope by string concatenation instead of using `jq -n`

**Not for**: schema validation (use `hook-decision-contract-enforcer`) or byte-size enforcement (use `hook-payload-budget-guard`).

## Canonicalization Rules

| Anti-Pattern | Risk | Canonical Replacement |
|--------------|------|----------------------|
| `echo "{\"key\": $VAR}"` | Breaks on quotes/newlines in `$VAR` | `jq -n --arg key "$VAR" '{"key":$key}'` |
| `cat stdin \| sed 's/old/new/'` | Corrupts JSON on regex meta-chars | `jq '.field = "new_value"'` |
| Pretty-printed output | Breaks single-line log parsers | `jq -c` (compact output) |
| Reconstructing after `grep` | Loses non-matched fields | Parse whole JSON; mutate fields in `jq` |

## Workflow

1. **Audit JSON construction sites**: search the hook script for `echo`, `printf`, and string interpolation that builds JSON; flag every instance.
2. **Identify the canonical input shape**: read the hook's `tool_input` or `tool_result` schema from `./canonicalization-rules.md`; confirm required fields.
3. **Replace string-built JSON with `jq -n`**: rewrite each flagged construction using `jq` with `--arg`, `--argjson`, or `--slurpfile` to safely inject variable values.
4. **Enforce compact output**: pipe all JSON emitted to stdout through `jq -c` to guarantee single-line, valid output for log parsers.
5. **Add parse guard**: wrap stdin reads with `jq . 2>/dev/null || echo '{"action":"degraded","reason":"invalid JSON input"}' && exit 3` to handle malformed input without crashing.
6. **Run conformance tests**: execute the test cases in `./conformance-tests.md` — they cover ASCII, Unicode, newlines, empty strings, and nested objects.
7. **Verify with negative-path inputs**: send payloads containing `"`, `\n`, `$`, and backtick characters; confirm output remains valid JSON each time.

## References

- [Canonicalization Rules](./canonicalization-rules.md)
- [Reconstruction Safeguards](./reconstruction-safeguards.md)
- [Conformance Tests](./conformance-tests.md)
