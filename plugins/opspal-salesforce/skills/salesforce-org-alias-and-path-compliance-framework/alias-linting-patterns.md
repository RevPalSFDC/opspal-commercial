# Alias Linting Patterns

Primary source: `hooks/pre-write-alias-linter.sh`.

## What the Linter Detects

The linter scans file content being written (PreToolUse on Write tool) for hardcoded org alias patterns. It emits non-blocking warnings — exit code is always 0.

## Pattern 1: `--target-org` with Literal Alias

```bash
# Detected by: grep -oE -- '--target-org [a-zA-Z][a-zA-Z0-9_-]+' | grep -v '\$'
MATCH=$(echo "$CONTENT" | grep -oE -- '--target-org [a-zA-Z][a-zA-Z0-9_-]+' | grep -v '\$' | head -1)
```

Detects:
- `--target-org prod`
- `--target-org acme-production`
- `--target-org my_sandbox`

Does NOT flag:
- `--target-org "$SF_TARGET_ORG"` (variable reference)
- `--target-org "${TARGET_ORG}"` (variable reference)

## Pattern 2: Short `-o` Flag with Literal Alias

```bash
# Detected by: grep -oE -- ' -o [a-zA-Z][a-zA-Z0-9_-]+'  | grep -v '\$'
MATCH=$(echo "$CONTENT" | grep -oE -- ' -o [a-zA-Z][a-zA-Z0-9_-]+' | grep -v '\$' | head -1)
```

Detects:
- `sf deploy -o prod`
- `sfdx force:org:open -o my-sandbox`

## Pattern 3: Hardcoded sf config set

```bash
# Flag sf config set target-org with literal alias
if echo "$CONTENT" | grep -qE 'sf config set.*target-org [a-zA-Z][a-zA-Z0-9_-]+' | grep -v '\$'; then
  WARNINGS+="sf config set with hardcoded alias — sets global default permanently\n"
fi
```

## Pattern 4: Hardcoded Org ID

```bash
# Salesforce org IDs start with 00D
if echo "$CONTENT" | grep -qE '00D[a-zA-Z0-9]{12}'; then
  WARNINGS+="Hardcoded Org ID detected — use Organization.Id from SOQL instead\n"
fi
```

## File Exclusion Rules

The linter skips files that are legitimately allowed to contain literal org names:

```bash
# Exclude documentation, config files, test files
if [[ "$FILE_PATH" =~ \.(md|mdx|txt|yaml|yml|json|csv)$ ]]; then exit 0; fi
if [[ "$FILE_PATH" =~ (__tests__|\.test\.|\.spec\.|test/) ]]; then exit 0; fi
```

YAML and JSON config files are excluded because `sfdx-project.json` legitimately contains sandbox aliases.

## Warning Output Format

```
⚠️  Alias Linter Warning (non-blocking):
Hardcoded org alias detected: --target-org prod

   Use SF_TARGET_ORG env var or resolveCurrentOrg() instead.
   See: agents/shared/explicit-org-requirement.md
```

## Integration with Pre-Write Hook

The linter is wired as a PreToolUse hook on the Write tool:

```json
{
  "name": "pre-write-alias-linter",
  "type": "shell",
  "command": "bash hooks/pre-write-alias-linter.sh",
  "events": ["PreToolUse"],
  "matchers": [{"tool_name": "Write"}]
}
```

## Extending the Linter

Add custom patterns by appending to the WARNINGS accumulator:

```bash
# Custom pattern: detect SFDX_USERNAME env var used as literal value
SFDX_LITERAL=$(echo "$CONTENT" | grep -oE 'SFDX_USERNAME=[a-zA-Z0-9_@.]+' | grep -v '\$' | head -1)
if [[ -n "$SFDX_LITERAL" ]]; then
  WARNINGS+="Hardcoded SFDX_USERNAME value detected: ${SFDX_LITERAL}\n"
fi
```
