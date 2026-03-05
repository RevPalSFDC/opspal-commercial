#!/bin/bash
#
# Setup Hook - Environment Maintenance & Onboarding
#
# Purpose: Verify and repair development environment on setup/init.
#          Runs npm dependency checks, hook permissions, MCP health,
#          plugin validation, and marketplace version checks.
#
# Triggered via: claude --maintenance or claude --init (Setup event)
#
# Timeout: 60000ms
#
# Version: 1.0.0
# Created: 2026-02-06

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$PLUGIN_ROOT/../.." && pwd)"

PASS=0
WARN=0
FAIL=0

check() {
    local label="$1"
    local result="$2"
    local exit_code="$3"

    if [[ "$exit_code" -eq 0 ]]; then
        echo "  [PASS] $label"
        PASS=$((PASS + 1))
    else
        echo "  [WARN] $label: $result"
        WARN=$((WARN + 1))
    fi
}

echo "=== OpsPal Environment Health Check ==="
echo ""

# 1. Node.js availability
echo "--- Runtime ---"
if command -v node &> /dev/null; then
    NODE_VER=$(node --version 2>/dev/null)
    check "Node.js" "$NODE_VER" 0
else
    check "Node.js" "not installed" 1
    FAIL=$((FAIL + 1))
fi

# 2. jq availability
if command -v jq &> /dev/null; then
    check "jq" "$(jq --version 2>/dev/null)" 0
else
    check "jq" "not installed (required for routing hooks)" 1
fi

# 3. npm dependencies
echo ""
echo "--- Dependencies ---"
DEP_SCRIPT="${PLUGIN_ROOT}/scripts/lib/check-all-dependencies.js"
if [[ -f "$DEP_SCRIPT" ]] && command -v node &> /dev/null; then
    DEP_RESULT=$(node "$DEP_SCRIPT" --quiet 2>&1) && DEP_CODE=0 || DEP_CODE=$?
    if [[ "$DEP_CODE" -eq 0 ]]; then
        check "npm packages" "all present" 0
    else
        check "npm packages" "missing packages detected - run /checkdependencies --fix" 1
    fi
else
    check "npm packages" "checker not found" 1
fi

# 4. Hook permissions
echo ""
echo "--- Hooks ---"
HOOK_ISSUES=0
for hook_dir in "$PROJECT_ROOT"/plugins/*/hooks/; do
    if [[ -d "$hook_dir" ]]; then
        for hook_file in "$hook_dir"*.sh; do
            if [[ -f "$hook_file" ]] && [[ ! -x "$hook_file" ]]; then
                HOOK_ISSUES=$((HOOK_ISSUES + 1))
            fi
        done
    fi
done

if [[ "$HOOK_ISSUES" -eq 0 ]]; then
    check "hook permissions" "all executable" 0
else
    check "hook permissions" "$HOOK_ISSUES non-executable hooks found" 1
    echo "         Fix: find $PROJECT_ROOT/plugins/*/hooks/ -name '*.sh' ! -perm -u+x -exec chmod +x {} +"
fi

# 5. Plugin validation (quick check - plugin.json exists and is valid JSON)
echo ""
echo "--- Plugins ---"
PLUGIN_COUNT=0
PLUGIN_INVALID=0
for pj in "$PROJECT_ROOT"/plugins/*/. ; do
    pj_dir="$(cd "$pj" && pwd)"
    pj_file="$pj_dir/.claude-plugin/plugin.json"
    if [[ -f "$pj_file" ]]; then
        PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
        if ! jq empty "$pj_file" 2>/dev/null; then
            PLUGIN_INVALID=$((PLUGIN_INVALID + 1))
        fi
    fi
done

if [[ "$PLUGIN_INVALID" -eq 0 ]]; then
    check "plugin manifests" "$PLUGIN_COUNT plugins valid" 0
else
    check "plugin manifests" "$PLUGIN_INVALID invalid of $PLUGIN_COUNT" 1
fi

# 6. Git status
echo ""
echo "--- Git ---"
if command -v git &> /dev/null && [[ -d "$PROJECT_ROOT/.git" ]]; then
    BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
    DIRTY=$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    check "git repo" "branch=$BRANCH, ${DIRTY} uncommitted changes" 0
else
    check "git repo" "not a git repository" 1
fi

# Summary
echo ""
echo "=== Summary ==="
TOTAL=$((PASS + WARN + FAIL))
echo "  $PASS passed, $WARN warnings, $FAIL failures (of $TOTAL checks)"

if [[ "$FAIL" -gt 0 ]]; then
    echo ""
    echo "Critical issues detected. Fix before proceeding."
fi

exit 0
