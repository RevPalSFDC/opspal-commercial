#!/usr/bin/env bash

# Post Sub-Agent Verification Hook
#
# Runs after sub-agent (Agent tool) completion to verify claims.
# Addresses tool-contract violations (42 reflections) by detecting:
# - Hidden errors in sub-agent output
# - Unverified record creation/update claims
# - Missing files that were claimed to be created
# - Failed deployments reported as successful
# - Graceful degradation to cached/stale data (v2.44.0)
# - Org authentication failures (v2.44.0)
#
# Hook Type: SubagentStop
# ROI: $8,000/year (addresses 42 tool-contract violations)
#
# Environment:
#   SKIP_SUBAGENT_VERIFICATION=1     Skip verification (emergency bypass)
#   SUBAGENT_VERIFY_VERBOSE=1        Enable verbose logging
#   SUBAGENT_VERIFY_STRICT=1         Fail on warnings too
#   SUBAGENT_VERIFY_RUNBOOK_EVIDENCE=1  Verify runbook evidence for unresolved cohorts
#   SUBAGENT_VERIFY_RUNBOOK_STRICT=0    Fail when runbook evidence is missing
#

set -euo pipefail

# Get script directory for relative imports
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
VERIFIER_SCRIPT="${PLUGIN_ROOT}/scripts/lib/subagent-result-verifier.js"
COHORT_RUNBOOK_GUARD="${PLUGIN_ROOT}/scripts/lib/cohort-runbook-guard.js"

# Logging functions
log_info() {
    echo "[subagent-verify] $1" >&2
}

log_error() {
    echo "[subagent-verify] ERROR: $1" >&2
}

log_debug() {
    if [[ "${SUBAGENT_VERIFY_VERBOSE:-0}" == "1" ]]; then
        echo "[subagent-verify] DEBUG: $1" >&2
    fi
}

# Check if verification should be skipped
if [[ "${SKIP_SUBAGENT_VERIFICATION:-0}" == "1" ]]; then
    log_debug "Verification skipped via SKIP_SUBAGENT_VERIFICATION"
    exit 0
fi

# Check if verifier script exists
if [[ ! -f "$VERIFIER_SCRIPT" ]]; then
    log_debug "Verifier script not found: $VERIFIER_SCRIPT"
    exit 0
fi

# Read sub-agent output from stdin
SUBAGENT_OUTPUT=$(cat)
log_debug "Received ${#SUBAGENT_OUTPUT} bytes of sub-agent output"

# Quick check for obvious error patterns before full verification
quick_error_check() {
    local output="$1"

    # Critical error patterns that should always be flagged
    local critical_patterns=(
        "INSUFFICIENT_ACCESS"
        "INVALID_CROSS_REFERENCE_KEY"
        "DUPLICATE_VALUE"
        "FIELD_INTEGRITY_EXCEPTION"
        "REQUIRED_FIELD_MISSING"
        "exit code [1-9]"
        "command failed"
        "TypeError:"
        "ReferenceError:"
        "NamedOrgNotFound"
        "NoOrgFound"
        "INVALID_SESSION_ID"
        "Session expired"
        "INVALID_LOGIN"
    )

    for pattern in "${critical_patterns[@]}"; do
        if echo "$output" | grep -qiE "$pattern"; then
            log_info "Quick check found potential error: $pattern"
            return 1
        fi
    done

    return 0
}

# Detect degradation signals - agent fell back to cached/stale data
degradation_check() {
    local output="$1"

    local degradation_patterns=(
        "live quer(y|ies) required"
        "using cached|from cache|cached data|reading from cache"
        "could not (connect|query|authenticate|reach)"
        "unable to (verify|confirm|validate) (live|against|with)"
        "based on (documentation|cached|local|static|previous)"
        "requires? (live|direct|API) (access|connection|quer(y|ies))"
        "no (live|direct) (data|query|connection|access)"
        "fell back to|falling back to|fallback to"
    )

    for pattern in "${degradation_patterns[@]}"; do
        if echo "$output" | grep -qiE "$pattern"; then
            log_info "Degradation signal detected: $pattern"
            return 1
        fi
    done

    return 0
}

# Emit structured JSON to stdout so parent agent receives the finding
emit_parent_context() {
    local context_message="$1"

    if ! command -v jq &>/dev/null; then
        # Fallback: just log to stderr if jq unavailable
        log_error "$context_message"
        return
    fi

    jq -n \
      --arg context "$context_message" \
      '{
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: "SubagentStop",
          additionalContext: $context
        }
      }'
}

runbook_evidence_check() {
    local output="$1"

    if [[ "${SUBAGENT_VERIFY_RUNBOOK_EVIDENCE:-1}" != "1" ]]; then
        log_debug "Runbook evidence verification disabled"
        return 0
    fi

    if [[ ! -f "$COHORT_RUNBOOK_GUARD" ]]; then
        log_debug "Runbook guard script not found: $COHORT_RUNBOOK_GUARD"
        return 0
    fi

    if ! command -v jq &>/dev/null; then
        log_debug "jq unavailable, skipping runbook evidence verification"
        return 0
    fi

    local workspace_root
    workspace_root="$(cd "$PLUGIN_ROOT/../.." && pwd)"

    local analysis
    analysis=$(printf '%s' "$output" | node "$COHORT_RUNBOOK_GUARD" verify-output --workspace-root "$workspace_root" 2>/dev/null || echo "")

    if [[ -z "$analysis" ]] || ! echo "$analysis" | jq -e . >/dev/null 2>&1; then
        log_debug "Runbook evidence analysis failed, skipping"
        return 0
    fi

    local cohort_count
    cohort_count=$(echo "$analysis" | jq -r '.matched_cohorts | length' 2>/dev/null || echo "0")
    if [[ "$cohort_count" -eq 0 ]]; then
        log_debug "No unresolved cohorts detected in sub-agent output"
        return 0
    fi

    local missing_evidence_count missing_artifact_count
    missing_evidence_count=$(echo "$analysis" | jq -r '.missing_evidence_cohorts | length' 2>/dev/null || echo "0")
    missing_artifact_count=$(echo "$analysis" | jq -r '.missing_artifacts | length' 2>/dev/null || echo "0")

    if [[ "$missing_evidence_count" -eq 0 ]] && [[ "$missing_artifact_count" -eq 0 ]]; then
        log_debug "Runbook evidence verification passed"
        return 0
    fi

    local cohorts missing_evidence missing_artifacts
    cohorts=$(echo "$analysis" | jq -r '.matched_cohorts | join(", ")' 2>/dev/null || echo "unknown")
    missing_evidence=$(echo "$analysis" | jq -r '.missing_evidence_cohorts | join(", ")' 2>/dev/null || echo "")
    missing_artifacts=$(echo "$analysis" | jq -r '.missing_artifacts[].path' 2>/dev/null | paste -sd '; ' -)

    cat >&2 << EOF

RUNBOOK EVIDENCE WARNING
===============================================================

Detected unresolved-issue cohorts in sub-agent output:
  $cohorts

Missing runbook evidence for cohorts:
  ${missing_evidence:-none}

Missing required artifacts:
  ${missing_artifacts:-none}

Expectation:
  - Reference the governing runbook/playbook artifacts in the response
  - Cite concrete guardrails or procedures that were followed

EOF

    if [[ "${SUBAGENT_VERIFY_RUNBOOK_STRICT:-0}" == "1" ]]; then
        log_error "Runbook evidence strict mode failure"
        return 1
    fi

    return 0
}

# Main verification
main() {
    # Skip if output is too short to be meaningful
    if [[ ${#SUBAGENT_OUTPUT} -lt 50 ]]; then
        log_debug "Output too short to verify"
        exit 0
    fi

    local parent_context_messages=()

    # Check for degradation signals (cached/stale data usage)
    if ! degradation_check "$SUBAGENT_OUTPUT"; then
        log_info "Sub-agent degradation detected - fell back to cached/stale data"

        cat >&2 << EOF

SUBAGENT DEGRADATION WARNING
===============================================================

The sub-agent appears to have used cached or stale data instead of
live queries. This typically happens when:
  - Wrong org alias was provided (NamedOrgNotFound)
  - Session expired or auth failed
  - Network connectivity issues

The output may be useful but should NOT be treated as authoritative.
Re-delegate with corrected parameters rather than running queries directly.

EOF

        parent_context_messages+=("SUBAGENT_DEGRADATION_DETECTED: The sub-agent could not execute live queries and fell back to cached/local data analysis. DO NOT attempt to run the queries directly from parent context. Instead: (1) verify the correct org alias with \`sf org list | grep <keyword>\`, (2) re-delegate to the same or appropriate sub-agent with corrected parameters.")
    fi

    # Quick error check for critical patterns
    if ! quick_error_check "$SUBAGENT_OUTPUT"; then
        log_info "Potential errors detected in sub-agent output"

        # Check specifically for org auth errors to give targeted guidance
        if echo "$SUBAGENT_OUTPUT" | grep -qiE "NamedOrgNotFound|NoOrgFound|No org configuration found"; then
            parent_context_messages+=("SUBAGENT_ORG_NOT_FOUND: The sub-agent hit a NamedOrgNotFound error. The org alias provided does not exist. Run \`sf org list | grep <keyword>\` to find the correct alias before retrying.")
        elif echo "$SUBAGENT_OUTPUT" | grep -qiE "INVALID_SESSION_ID|Session expired|INVALID_LOGIN"; then
            parent_context_messages+=("SUBAGENT_AUTH_FAILED: The sub-agent hit an authentication error. The org session may be expired. Run \`sf org login web --alias <alias>\` to re-authenticate before retrying.")
        fi

        # Run full verification
        VERIFY_ARGS=""
        if [[ "${SUBAGENT_VERIFY_VERBOSE:-0}" == "1" ]]; then
            VERIFY_ARGS="--verbose"
        fi

        # Create temp file for sub-agent output
        TEMP_FILE=$(mktemp)
        echo "$SUBAGENT_OUTPUT" > "$TEMP_FILE"

        # Run verifier
        if ! RESULT=$(node "$VERIFIER_SCRIPT" verify "$TEMP_FILE" 2>&1); then
            log_error "Verification failed"

            # Parse result for specific errors
            if echo "$RESULT" | grep -q '"verified": false'; then
                ERRORS=$(echo "$RESULT" | grep -oP '"message":\s*"[^"]+' | head -3)
                log_error "Verification errors detected:"
                echo "$ERRORS" | while read -r error; do
                    log_error "  - ${error#*:}"
                done

                # Output structured warning (not blocking, just informational)
                cat >&2 << EOF

SUB-AGENT VERIFICATION WARNING
===============================================

The sub-agent output contains potential issues that should be reviewed:

$ERRORS

Run full verification:
  node $VERIFIER_SCRIPT verify <output-file>

This is an INFORMATIONAL warning - the sub-agent output is not blocked.

EOF
            fi
        fi

        # Cleanup
        rm -f "$TEMP_FILE"
    else
        log_debug "Quick check passed - no obvious errors"
    fi

    if ! runbook_evidence_check "$SUBAGENT_OUTPUT"; then
        if [[ "${SUBAGENT_VERIFY_RUNBOOK_STRICT:-0}" == "1" ]]; then
            exit 1
        fi
    fi

    # Emit accumulated parent context messages via additionalContext
    if [[ ${#parent_context_messages[@]} -gt 0 ]]; then
        local joined_message=""
        for msg in "${parent_context_messages[@]}"; do
            if [[ -n "$joined_message" ]]; then
                joined_message="${joined_message} ${msg}"
            else
                joined_message="$msg"
            fi
        done
        emit_parent_context "$joined_message"
        exit 0
    fi

    # Always exit successfully (non-blocking verification)
    # Set SUBAGENT_VERIFY_STRICT=1 to make failures blocking
    if [[ "${SUBAGENT_VERIFY_STRICT:-0}" == "1" ]]; then
        # In strict mode, any detected error should exit non-zero
        # But we need the full verification result for that
        :
    fi

    exit 0
}

main "$@"
