#!/bin/bash
# Pre-Write Alias Linter
#
# Scans file content being written for hardcoded org alias patterns.
# Emits non-blocking warnings when literal aliases are detected.
#
# Hook type: PreToolUse (Write tool)
# Exit codes:
#   0 - No issues (or documentation file, skipped)
#
# Source: Reflection Cohort - config/env (P2)
# Date: 2026-02-05

# Read tool input from stdin
INPUT=$(cat)

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Skip check for documentation/markdown files
if [[ "$FILE_PATH" =~ \.(md|mdx|txt|yaml|yml|json|csv)$ ]]; then
  exit 0
fi

# Skip check for test files
if [[ "$FILE_PATH" =~ (__tests__|\.test\.|\.spec\.|test/) ]]; then
  exit 0
fi

# Extract file content from tool input
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)

if [[ -z "$CONTENT" ]]; then
  exit 0
fi

# Check for hardcoded org alias patterns in the content
# Uses grep -E (extended regex) for portability
WARNINGS=""

# Pattern 1: --target-org followed by a literal word (not a variable $VAR or ${VAR})
# Match --target-org <word>, exclude lines with $ (variables)
MATCH=$(echo "$CONTENT" | grep -oE -- '--target-org [a-zA-Z][a-zA-Z0-9_-]+' | grep -v '\$' | head -1)
if [[ -n "$MATCH" ]]; then
  WARNINGS="${WARNINGS}Hardcoded org alias detected: ${MATCH}\n"
fi

# Pattern 2: " -o " followed by a literal word (short flag)
MATCH=$(echo "$CONTENT" | grep -oE -- ' -o [a-zA-Z][a-zA-Z0-9_-]+' | grep -v '\$' | head -1)
if [[ -n "$MATCH" ]]; then
  WARNINGS="${WARNINGS}Hardcoded org alias detected: ${MATCH}\n"
fi

if [[ -n "$WARNINGS" ]]; then
  echo "⚠️  Alias Linter Warning (non-blocking):"
  echo -e "$WARNINGS"
  echo "   Use SF_TARGET_ORG env var or resolveCurrentOrg() instead."
  echo "   See: agents/shared/explicit-org-requirement.md"
fi

# Always exit 0 — this is a non-blocking warning
exit 0
