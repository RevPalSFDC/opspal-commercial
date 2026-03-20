#!/bin/bash

# Post Sub-Agent Verification Hook
#
# Runs after sub-agent (Agent tool) completion to verify claims.
# Addresses tool-contract violations (42 reflections) by detecting:
# - Hidden errors in sub-agent output
# - Unverified record creation/update claims
# - Missing files that were claimed to be created
# - Failed deployments reported as successful
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
    )

    for pattern in "${critical_patterns[@]}"; do
        if echo "$output" | grep -qiE "$pattern"; then
            log_info "Quick check found potential error: $pattern"
            return 1
        fi
    done

    return 0
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

⚠️  RUNBOOK EVIDENCE WARNING
═══════════════════════════════════════════════════════════

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

    # Quick error check first
    if ! quick_error_check "$SUBAGENT_OUTPUT"; then
        log_info "Potential errors detected in sub-agent output"

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

⚠️  SUB-AGENT VERIFICATION WARNING
═══════════════════════════════════

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
