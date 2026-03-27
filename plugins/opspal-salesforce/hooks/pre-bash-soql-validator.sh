#!/usr/bin/env bash
#
# Pre-Bash SOQL Validator Hook
# Validates SOQL field names and query safety before execution.
#
# Triggered: Before `sf data query` commands
# Exit Codes:
#   0 = Continue execution with optional structured guidance
#   1 = Block execution (severe issue)

set -euo pipefail

if ! command -v jq &>/dev/null; then
    echo "[pre-bash-soql-validator] jq not found, skipping" >&2
    exit 0
fi

# Standalone guard — this hook is invoked by pre-bash-dispatcher.sh via
# run_child_hook() which sets DISPATCHER_CONTEXT=1 and pipes HOOK_INPUT.
# When run standalone (no dispatcher context and stdin is a terminal),
# exit 0 cleanly rather than failing on missing context.
if [[ "${DISPATCHER_CONTEXT:-0}" != "1" ]] && [[ -t 0 ]]; then
  echo "[$(basename "$0")] INFO: standalone invocation — no dispatcher context, skipping" >&2
  exit 0
fi


emit_pretool_context() {
    local context="$1"
    local updated_command="${2:-}"

    if [ -n "$updated_command" ]; then
        jq -nc \
          --arg context "$context" \
          --arg command "$updated_command" \
          '{
            suppressOutput: true,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "allow",
              additionalContext: $context,
              updatedInput: {
                command: $command
              }
            }
          }'
        return
    fi

    jq -nc \
      --arg context "$context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          additionalContext: $context
        }
      }'
}

emit_pretool_deny() {
    local reason="$1"
    local context="${2:-}"

    jq -nc \
      --arg reason "$reason" \
      --arg context "$context" \
      '{
        suppressOutput: true,
        hookSpecificOutput: (
          {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: $reason
          }
          + (if $context != "" then { additionalContext: $context } else {} end)
        )
      }'
}

extract_target_org() {
    local command="$1"

    if [[ "$command" =~ --target-org[[:space:]]+([^[:space:]]+) ]]; then
        printf '%s' "${BASH_REMATCH[1]}"
        return 0
    fi

    if [[ "$command" =~ -o[[:space:]]+([^[:space:]]+) ]]; then
        printf '%s' "${BASH_REMATCH[1]}"
        return 0
    fi

    printf '%s' "${SF_TARGET_ORG:-}"
}

extract_sobject_from_query() {
    local query="$1"

    printf '%s' "$query" | node -e '
const query = require("fs").readFileSync(0, "utf8");
const match = query.match(/\bFROM\s+([A-Za-z0-9_.]+)/i);
process.stdout.write(match ? match[1] : "");
'
}

extract_where_fields() {
    local query="$1"

    printf '%s' "$query" | node -e '
const query = require("fs").readFileSync(0, "utf8");
const whereMatch = query.match(/\bWHERE\b([\s\S]+)/i);
if (!whereMatch) {
  process.exit(0);
}
const clause = whereMatch[1]
  .replace(/\bORDER\s+BY\b[\s\S]*$/i, "")
  .replace(/\bGROUP\s+BY\b[\s\S]*$/i, "")
  .replace(/\bLIMIT\b[\s\S]*$/i, "")
  .replace(/\bOFFSET\b[\s\S]*$/i, "");
const fields = new Set();
for (const match of clause.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\b\s*(=|!=|<>|<|>|<=|>=|\bLIKE\b|\bIN\b|\bNOT\s+IN\b|\bINCLUDES\b|\bEXCLUDES\b)/gi)) {
  const field = match[1];
  if (!/^(AND|OR|NOT)$/i.test(field)) {
    fields.add(field);
  }
}
process.stdout.write(Array.from(fields).join("\n"));
'
}

escape_soql_apostrophes() {
    local query="$1"

    printf '%s' "$query" | node -e '
const query = require("fs").readFileSync(0, "utf8");
let output = "";
let inString = false;

for (let i = 0; i < query.length; i += 1) {
  const ch = query[i];
  const next = query[i + 1] || "";
  const prev = query[i - 1] || "";

  if (!inString) {
    output += ch;
    if (ch === "'\''") {
      inString = true;
    }
    continue;
  }

  if (ch === "\\" && next === "'\''") {
    output += ch + next;
    i += 1;
    continue;
  }

  if (ch === "'\''") {
    if (prev !== "\\" && /[A-Za-z0-9]/.test(next)) {
      output += "\\'\''";
      continue;
    }

    inString = false;
    output += ch;
    continue;
  }

  output += ch;
}

process.stdout.write(output);
'
}

check_textarea_where_clause() {
    local query="$1"
    local target_org="$2"
    local sobject="$3"

    if [[ -z "$target_org" ]] || [[ -z "$sobject" ]] || ! command -v sf >/dev/null 2>&1; then
        return 0
    fi

    local where_fields
    where_fields="$(extract_where_fields "$query")"
    if [[ -z "${where_fields// }" ]]; then
        return 0
    fi

    local describe_json
    describe_json="$(sf sobject describe --sobject "$sobject" --target-org "$target_org" --json 2>/dev/null || true)"
    if [[ -z "$describe_json" ]]; then
        return 0
    fi

    local textarea_fields=""
    textarea_fields="$(
        while IFS= read -r field_name; do
            [[ -z "$field_name" ]] && continue
            printf '%s' "$describe_json" | jq -r --arg field "$field_name" '
              (
                .result.fields // .fields // []
              )
              | map(select(
                  (.name == $field or .qualifiedApiName == $field)
                  and (
                    (.type // "" | ascii_downcase) == "textarea"
                    or (.type // "" | ascii_downcase) == "longtextarea"
                    or (.type // "" | ascii_downcase) == "richtextarea"
                  )
                ))
              | .[0].name // empty
            ' 2>/dev/null || true
        done <<< "$where_fields" | sed '/^$/d' | sort -u
    )"

    if [[ -n "${textarea_fields// }" ]]; then
        printf '%s' "$textarea_fields"
    fi
}

# Read input from stdin
INPUT=$(cat)

# Extract the command from tool_input
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // .tool_input // empty' 2>/dev/null)

# If no command or not a SOQL query, pass through
if [ -z "$COMMAND" ]; then
    exit 0
fi

# Extract SOQL query from the command
QUERY=""
if [[ "$COMMAND" =~ --query[[:space:]]+\"([^\"]+)\" ]]; then
    QUERY="${BASH_REMATCH[1]}"
elif [[ "$COMMAND" =~ --query[[:space:]]+\'([^\']+)\' ]]; then
    QUERY="${BASH_REMATCH[1]}"
elif [[ "$COMMAND" =~ --query[[:space:]]+([^[:space:]-]+) ]]; then
    QUERY="${BASH_REMATCH[1]}"
fi

# If no query found, pass through
if [ -z "$QUERY" ]; then
    exit 0
fi

TARGET_ORG="$(extract_target_org "$COMMAND")"
SOBJECT_NAME="$(extract_sobject_from_query "$QUERY")"
ESCAPED_QUERY="$(escape_soql_apostrophes "$QUERY")"

if echo "$COMMAND" | grep -qE '(^|[[:space:]])sf[[:space:]]+data[[:space:]]+query([[:space:]]|$)' && echo "$COMMAND" | grep -q -- '--bulk'; then
    emit_pretool_deny \
      "CRITICAL [SOQL_BULK_FLAG_DEPRECATED]: 'sf data query --bulk' was removed in SF CLI v2.125+." \
      "Use 'sf data export bulk --query \"${QUERY}\"' instead of 'sf data query --bulk'."
    exit 0
fi

if echo "$QUERY" | grep -qiE '\bFROM[[:space:]]+Flow(DefinitionView|VersionView)?\b' && echo "$QUERY" | grep -qiE "Status[[:space:]]*(=|IN)[[:space:]]*\\(?[[:space:]]*'Inactive'"; then
    emit_pretool_deny \
      "CRITICAL [FLOW_VERSION_STATUS_INVALID]: FlowVersionStatus does not support 'Inactive'." \
      "Use one of: Active, Draft, Obsolete. Flow deactivation is handled through FlowDefinition tooling updates, not Status = 'Inactive'."
    exit 0
fi

if [[ "$ESCAPED_QUERY" != "$QUERY" ]]; then
    emit_pretool_deny \
      "CRITICAL [SOQL_APOSTROPHE_ESCAPE]: Query contains an unescaped apostrophe inside a SOQL string literal." \
      "Escape embedded apostrophes as \\\\' inside the SOQL literal. Example fix: ${ESCAPED_QUERY}"
    exit 0
fi

# Known problematic patterns in SOQL
ISSUES=()

# Check for ApiName on FlowVersionView (should be DeveloperName)
if echo "$QUERY" | grep -qi "FlowVersionView" && echo "$QUERY" | grep -q "ApiName"; then
    ISSUES+=("FlowVersionView uses DeveloperName, not ApiName. Auto-correcting...")
fi

# Check for missing --use-tooling-api on Tooling API objects
TOOLING_OBJECTS="FlowDefinitionView|FlowVersionView|ApexClass|ApexTrigger|CustomField|CustomObject|ValidationRule|WorkflowRule"
if echo "$QUERY" | grep -qiE "$TOOLING_OBJECTS" && ! echo "$COMMAND" | grep -q "\-\-use-tooling-api"; then
    ISSUES+=("Query uses Tooling API object but missing --use-tooling-api flag")
fi

# Check for != operator (bash escapes != to \!= which breaks SOQL)
if echo "$QUERY" | grep -qE '[^<>!]!='; then
    ISSUES+=("SOQL uses != operator which bash may escape to \\!=. Use <> instead (SOQL-equivalent and shell-safe). See: agents/shared/soql-cli-escaping-guide.md")
fi

# Check for common field name mistakes
# Owner.Name is only polymorphic on certain objects (Task, Event, CaseComment)
if echo "$QUERY" | grep -q "Owner\.Name" && ! echo "$QUERY" | grep -qi "TYPEOF"; then
    if echo "$QUERY" | grep -qiE 'FROM\s+(Task|Event|CaseComment)'; then
        ISSUES+=("Owner.Name may fail on polymorphic lookup (Task/Event) - consider using TYPEOF or OwnerId")
    fi
fi

TEXTAREA_FIELDS="$(check_textarea_where_clause "$QUERY" "$TARGET_ORG" "$SOBJECT_NAME" || true)"
if [[ -n "${TEXTAREA_FIELDS// }" ]]; then
    ISSUES+=("WHERE clause filters on textarea field(s): $(printf '%s' "$TEXTAREA_FIELDS" | paste -sd ', ' -). Salesforce textarea filters are frequently non-filterable or slow; prefer exact Ids, helper formula fields, or a derived searchable field.")
fi

# If issues found, output warning with auto-fix suggestion for != operator
if [ ${#ISSUES[@]} -gt 0 ]; then
    WARNING_MSG=$(printf '%s\n' "${ISSUES[@]}")

    # If the only issue is !=, suggest auto-corrected command
    if echo "$QUERY" | grep -qE '[^<>!]!=' && [ ${#ISSUES[@]} -eq 1 ]; then
        FIXED_QUERY=$(echo "$QUERY" | sed 's/\([^<>!]\)!=/\1<>/g')
        # Escape regex-special characters in SOQL before using as sed pattern
        ESCAPED_QUERY=$(printf '%s' "$QUERY" | sed 's/[&/\\]/\\&/g; s/\[/\\[/g; s/\]/\\]/g; s/\./\\./g')
        ESCAPED_FIXED=$(printf '%s' "$FIXED_QUERY" | sed 's/[&/\\]/\\&/g')
        FIXED_COMMAND=$(echo "$COMMAND" | sed "s|$ESCAPED_QUERY|$ESCAPED_FIXED|")
        emit_pretool_context \
          "[SOQL Validator] != operator detected. Auto-replacing with <> (shell-safe equivalent)." \
          "$FIXED_COMMAND"
        exit 0
    fi

    emit_pretool_context "[SOQL Validator] Potential issues detected:\n$WARNING_MSG"
    # Exit 0 to allow execution with structured guidance.
    exit 0
fi

# No issues found
exit 0
