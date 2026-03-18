#!/bin/bash

#
# Post-Assessment Planning Trigger
# QA-005: Automatically triggers implementation planning after assessment completion
#
# This hook detects when an assessment completes and suggests/triggers the
# implementation planner agent with assessment context.
#
# Usage:
#   Called automatically by hooks system as Stop hook:
#   echo '{"stop_hook_agent_name":"sfdc-revops-auditor"}' | ./post-assessment-planning-trigger.sh
#
#   Or manually with assessment file:
#   ./post-assessment-planning-trigger.sh <assessment-output-file>
#
# Environment:
#   AUTO_TRIGGER_PLANNING=1  - Automatically suggest planning (default: 1)
#   PLANNING_THRESHOLD=0     - Minimum findings to trigger planning (default: 0)
#   ORG_SLUG                 - Organization identifier for finding assessments
#

set -e

ASSESSMENT_OUTPUT="$1"
AUTO_TRIGGER="${AUTO_TRIGGER_PLANNING:-1}"
THRESHOLD="${PLANNING_THRESHOLD:-0}"

# Read hook input from stdin if available (Stop hook interface)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# If no assessment file provided, try to find the most recent one
if [ -z "$ASSESSMENT_OUTPUT" ]; then
    # Check if this is a Stop hook call (has agent name in input)
    AGENT_NAME=""
    if [ -n "$HOOK_INPUT" ] && command -v jq &>/dev/null; then
        AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.stop_hook_agent_name // ""' 2>/dev/null || echo "")
    fi

    # If not a Stop hook call (manual invocation with no args), show usage
    if [ -z "$AGENT_NAME" ] && [ -z "$HOOK_INPUT" ]; then
        echo "Usage: $0 <assessment-output-file>" >&2
        echo "  Or call as Stop hook with JSON input via stdin" >&2
        exit 1
    fi

    # Try to find recent assessment file based on ORG_SLUG
    if [ -n "${ORG_SLUG:-}" ]; then
        # Look for most recent assessment JSON in org's assessment directory
        ASSESSMENT_DIRS=(
            "orgs/${ORG_SLUG}/platforms/salesforce/*/assessments"
            "orgs/${ORG_SLUG}/assessments"
            "instances/salesforce/${ORG_SLUG}/assessments"
        )

        for pattern in "${ASSESSMENT_DIRS[@]}"; do
            # Use find to get most recent JSON file modified in last hour
            RECENT_FILE=$(find $pattern -name "*.json" -mmin -60 2>/dev/null | head -1 || echo "")
            if [ -n "$RECENT_FILE" ] && [ -f "$RECENT_FILE" ]; then
                ASSESSMENT_OUTPUT="$RECENT_FILE"
                break
            fi
        done
    fi

    # If still no assessment file, exit gracefully (not an error for Stop hook)
    if [ -z "$ASSESSMENT_OUTPUT" ]; then
        # This is normal when assessment didn't produce a file yet or ORG_SLUG not set
        echo '{"status":"skipped","reason":"No assessment file found"}'
        exit 0
    fi
fi

# Validate assessment file exists
if [ ! -f "$ASSESSMENT_OUTPUT" ]; then
    # File not found - exit gracefully for Stop hook, error for manual
    if [ -n "$HOOK_INPUT" ]; then
        echo '{"status":"skipped","reason":"Assessment file not found"}'
        exit 0  # Graceful exit for Stop hook
    else
        echo "Assessment file not found: $ASSESSMENT_OUTPUT" >&2
        exit 1
    fi
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "⚠️  jq not available, skipping planning trigger analysis" >&2
    echo '{"status":"skipped","reason":"jq not available"}'
    exit 0
fi

# Extract assessment metadata
ASSESSMENT_STATUS=$(jq -r '.metadata.assessment_status // "unknown"' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "unknown")
ORG_ALIAS=$(jq -r '.metadata.org_alias // "unknown"' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "unknown")
ASSESSMENT_DATE=$(jq -r '.metadata.assessment_date // "unknown"' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "unknown")

# Count findings across all sections
FINDINGS_COUNT=0

# Count data quality issues
DQ_INCOMPLETE=$(jq -r '.findings.data_quality.account_quality.incomplete_count // 0' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "0")
DQ_DUPLICATES=$(jq -r '.findings.data_quality.duplicates.duplicate_account_groups // 0' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "0")
FINDINGS_COUNT=$((FINDINGS_COUNT + DQ_INCOMPLETE + DQ_DUPLICATES))

# Count inactive users
INACTIVE_USERS=$(jq -r '.findings.user_behavior.user_activity.inactive_30_days // 0' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "0")
if [ "$INACTIVE_USERS" -gt 10 ]; then
    FINDINGS_COUNT=$((FINDINGS_COUNT + 1))
fi

# Count stuck leads/opportunities
STUCK_LEADS=$(jq -r '.findings.gtm_architecture.lead_conversion.stuck_examples | length' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "0")
STUCK_OPPS=$(jq -r '.findings.gtm_architecture.opportunity_pipeline.stuck_examples | length' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "0")
FINDINGS_COUNT=$((FINDINGS_COUNT + STUCK_LEADS + STUCK_OPPS))

# Check lifecycle governance compliance
LIFECYCLE_COMPLIANT=$(jq -r '.findings.lifecycle_governance.compliant // true' "$ASSESSMENT_OUTPUT" 2>/dev/null || echo "true")
if [ "$LIFECYCLE_COMPLIANT" = "false" ]; then
    FINDINGS_COUNT=$((FINDINGS_COUNT + 1))
fi

# Determine priority
PRIORITY="low"
if [ "$FINDINGS_COUNT" -gt 20 ]; then
    PRIORITY="critical"
elif [ "$FINDINGS_COUNT" -gt 10 ]; then
    PRIORITY="high"
elif [ "$FINDINGS_COUNT" -gt 5 ]; then
    PRIORITY="medium"
fi

# Log assessment completion (all info to stderr, stdout reserved for JSON)
echo "🔄 Assessment Complete" >&2
echo "   Org: $ORG_ALIAS" >&2
echo "   Status: $ASSESSMENT_STATUS" >&2
echo "   Date: $ASSESSMENT_DATE" >&2
echo "   Findings Count: $FINDINGS_COUNT" >&2
echo "   Priority: $PRIORITY" >&2

TRIGGER_PLANNING_FLAG="0"

# Check if planning should be triggered
if [ "$FINDINGS_COUNT" -gt "$THRESHOLD" ]; then
    echo "" >&2
    echo "📋 Implementation Planning Recommended" >&2
    echo "   $FINDINGS_COUNT finding(s) detected (threshold: $THRESHOLD)" >&2

    # Create planning context file
    PLANNING_CONTEXT_DIR="${ASSESSMENT_OUTPUT%/*}"
    PLANNING_CONTEXT_FILE="$PLANNING_CONTEXT_DIR/planning-context.json"

    jq -n \
        --arg assessmentType "revops" \
        --arg orgAlias "$ORG_ALIAS" \
        --arg assessmentDate "$ASSESSMENT_DATE" \
        --arg assessmentStatus "$ASSESSMENT_STATUS" \
        --arg assessmentFile "$ASSESSMENT_OUTPUT" \
        --argjson findingsCount "$FINDINGS_COUNT" \
        --arg priority "$PRIORITY" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{
            assessmentType: $assessmentType,
            orgAlias: $orgAlias,
            assessmentDate: $assessmentDate,
            assessmentStatus: $assessmentStatus,
            assessmentFile: $assessmentFile,
            findingsCount: $findingsCount,
            priority: $priority,
            timestamp: $timestamp,
            suggestedAgent: "implementation-planner",
            suggestedAction: (if $findingsCount > 0 then "Create implementation plan for remediation" else "Assessment complete, no remediation needed" end)
        }' > "$PLANNING_CONTEXT_FILE"

    echo "   Context saved: $PLANNING_CONTEXT_FILE" >&2

    if [ "$AUTO_TRIGGER" = "1" ]; then
        echo "" >&2
        echo "💡 Suggested Next Step:" >&2
        echo "   Use Task tool with implementation-planner agent:" >&2
        echo "" >&2
        echo "   Task(subagent_type='implementation-planner', prompt='''" >&2
        echo "   Create implementation plan based on RevOps assessment for $ORG_ALIAS." >&2
        echo "   Assessment file: $ASSESSMENT_OUTPUT" >&2
        echo "   Priority: $PRIORITY ($FINDINGS_COUNT findings)" >&2
        echo "   ''')" >&2
        TRIGGER_PLANNING_FLAG="1"
    fi
else
    echo "" >&2
    echo "✅ No planning needed" >&2
    echo "   Findings ($FINDINGS_COUNT) below threshold ($THRESHOLD)" >&2
fi

# Output valid JSON to stdout for hook system
echo "{\"status\":\"ok\",\"findings\":$FINDINGS_COUNT,\"priority\":\"$PRIORITY\",\"triggerPlanning\":$TRIGGER_PLANNING_FLAG}"
