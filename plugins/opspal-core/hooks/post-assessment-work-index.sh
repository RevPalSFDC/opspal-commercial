#!/usr/bin/env bash
#
# Post-Assessment Work Index Hook
#
# Purpose: Automatically create or update work index entries after assessment
#          agents complete their work. Captures session ID, deliverables,
#          and classification from agent output.
#
# Behavior:
#   1. Detects assessment agent completion from hook input
#   2. Extracts org, classification, deliverables from output
#   3. Auto-captures session ID from environment
#   4. Creates or updates WORK_INDEX.yaml entry
#   5. Links session to existing in-progress request if found
#
# Configuration:
#   WORK_INDEX_AUTO_CAPTURE=1     - Enable/disable auto-capture (default: 1)
#   WORK_INDEX_VERBOSE=1          - Show detailed output (default: 0)
#   WORK_INDEX_CATCH_ALL=1        - Capture ALL Agent completions (default: 0)
#   ORG_SLUG                      - **Required** for auto-capture to work
#   CLAUDE_SESSION_ID             - Session ID for tracking (auto from Claude)
#
# Supported Agent Categories (60+ agents):
#   - Salesforce: cpq-assessor, revops-auditor, automation-auditor, etc.
#   - HubSpot: assessment-analyzer, workflow-builder, data-operations, etc.
#   - Marketo: assessment-analyzer, campaign-manager, program-builder, etc.
#   - GTM Planning: strategic-reports, revenue-modeler, retention-analyst, etc.
#   - Cross-Platform: campaign-orchestrator, workflow-orchestrator, etc.
#   - Customer Success: cs-operations, expansion-orchestrator, etc.
#
# Feedback Behavior:
#   - Skips silently by default when auto-capture is disabled or the agent is not whitelisted
#   - Emits structured PostToolUse context when required configuration blocks capture
#   - Emits optional structured verbose context when WORK_INDEX_VERBOSE=1
#
# Version: 1.1.0
# Date: 2026-02-01
#

set -euo pipefail

# Plugin root detection - ALWAYS validate file exists before trusting any path
# Strategy order prioritizes actual file existence over environment variables

PLUGIN_ROOT=""

# Strategy 1: Known path from repo root (hooks run with CWD = repo root)
if [ -f "$(pwd)/plugins/opspal-core/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$(pwd)/plugins/opspal-core"
# Strategy 2: Check .claude-plugins symlink
elif [ -f "$(pwd)/.claude-plugins/opspal-core/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="$(pwd)/.claude-plugins/opspal-core"
# Strategy 3: CLAUDE_PLUGIN_ROOT env var (only if manager script exists there)
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-manager.js" ]; then
    PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
# Strategy 4: Fall back to $0-based detection
else
    if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    else
        SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    fi
    PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

# Configuration
ENABLED="${WORK_INDEX_AUTO_CAPTURE:-1}"
VERBOSE="${WORK_INDEX_VERBOSE:-0}"
CATCH_ALL="${WORK_INDEX_CATCH_ALL:-0}"
HOOK_CONTEXT=""

emit_post_tool_use_context() {
    local context="$1"

    jq -nc --arg context "$context" '{
        suppressOutput: true,
        hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: $context
        }
    }'
}

set_verbose_context() {
    local context="$1"

    if [ "$VERBOSE" = "1" ] && [ -z "$HOOK_CONTEXT" ]; then
        HOOK_CONTEXT="$context"
    fi
}

# Early exit if disabled
if [ "$ENABLED" != "1" ]; then
    exit 0
fi

# Early exit if ORG_SLUG is not set (no org context available)
[[ -z "${ORG_SLUG:-}" ]] && [[ -z "${CLIENT_ORG:-}" ]] && [[ -z "${SF_TARGET_ORG:-}" ]] && exit 0

# Read hook input (contains agent output details)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# Exit if no input
if [ -z "$HOOK_INPUT" ]; then
    set_verbose_context "Work-index hook skipped because no hook input was provided."
    if [ -n "$HOOK_CONTEXT" ]; then
        emit_post_tool_use_context "$HOOK_CONTEXT"
    fi
    exit 0
fi

# Extract agent name from input (JSON structure expected)
# PostToolUse/Agent events place the sub-agent type in .tool_input.subagent_type
# Also check CLAUDE_AGENT_NAME env var (set by Claude Code in sub-agent context)
# and fall back to .agent_type / .subagent_type for SubagentStop-style events.
AGENT_NAME=""
if [ -n "${CLAUDE_AGENT_NAME:-}" ]; then
    AGENT_NAME="$CLAUDE_AGENT_NAME"
elif command -v jq &> /dev/null; then
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_input.subagent_type // .agent_type // .subagent_type // .agent_name // empty' 2>/dev/null || true)
fi

# Try to load classification from external config file first (if jq available)
EXTERNAL_CLASSIFICATION=""
CONFIG_FILE="$PLUGIN_ROOT/config/work-index-agent-mappings.json"
if [ -n "$AGENT_NAME" ] && [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    EXTERNAL_CLASSIFICATION=$(jq -r --arg agent "$AGENT_NAME" '.mappings[$agent] // empty' "$CONFIG_FILE" 2>/dev/null || true)
fi

# Map of assessment agents to classifications (fallback if not in config file)
# Format: ["agent-name"]="classification:sub-type"
declare -A AGENT_CLASSIFICATIONS=(
    # Salesforce Assessment Agents
    ["sfdc-cpq-assessor"]="audit:cpq-assessment"
    ["sfdc-revops-auditor"]="audit:revops-audit"
    ["sfdc-automation-auditor"]="audit:automation-audit"
    ["sfdc-architecture-auditor"]="audit:architecture-audit"
    ["sfdc-security-admin"]="audit:security-audit"
    ["sfdc-object-auditor"]="audit:object-audit"
    ["sfdc-quality-auditor"]="audit:quality-audit"
    ["sfdc-permission-assessor"]="audit:permission-assessment"
    ["sfdc-reports-usage-auditor"]="audit:reports-usage-audit"

    # Salesforce Build Agents
    ["sfdc-apex-developer"]="build:apex-development"
    ["sfdc-lightning-developer"]="build:lightning-development"
    ["sfdc-automation-builder"]="build:flow-development"
    ["sfdc-permission-orchestrator"]="build:permission-set"
    ["sfdc-validation-rule-orchestrator"]="build:validation-rule"
    ["sfdc-trigger-orchestrator"]="build:trigger-development"

    # Salesforce Report/Dashboard Agents
    ["diagram-generator"]="report:executive-report"
    ["pipeline-intelligence-agent"]="report:pipeline-report"
    ["sfdc-reports-dashboards"]="report:custom-dashboard"
    ["sfdc-report-designer"]="report:report-design"
    ["sfdc-dashboard-designer"]="report:dashboard-design"
    ["unified-exec-dashboard-agent"]="report:executive-dashboard"

    # Salesforce Data Agents
    ["sfdc-data-import-manager"]="migration:data-import"
    ["sfdc-data-export-manager"]="migration:data-export"
    ["sfdc-data-operations"]="migration:data-operations"
    ["sfdc-data-generator"]="migration:data-generation"
    ["sfdc-csv-enrichment"]="migration:csv-enrichment"

    # Salesforce Configuration Agents
    ["sfdc-territory-orchestrator"]="configuration:territory-management"
    ["sfdc-layout-generator"]="configuration:layout-config"
    ["sfdc-layout-deployer"]="configuration:layout-deployment"
    ["sfdc-metadata-manager"]="configuration:metadata-config"
    ["sfdc-deployment-manager"]="configuration:deployment"

    # HubSpot Assessment Agents
    ["hubspot-assessment-analyzer"]="audit:hubspot-assessment"
    ["hubspot-data-hygiene-specialist"]="audit:data-quality-audit"
    ["hubspot-workflow-auditor"]="audit:workflow-audit"
    ["hubspot-integration-auditor"]="audit:integration-audit"

    # HubSpot Build Agents
    ["hubspot-workflow-builder"]="build:workflow-development"
    ["hubspot-automation-builder"]="build:automation-development"
    ["hubspot-form-builder"]="build:form-development"
    ["hubspot-report-builder"]="report:hubspot-report"

    # HubSpot Data Agents
    ["hubspot-data-operations-manager"]="migration:data-import"
    ["hubspot-contact-importer"]="migration:contact-import"
    ["hubspot-deal-importer"]="migration:deal-import"

    # Marketo Assessment Agents
    ["marketo-assessment-analyzer"]="audit:marketo-assessment"
    ["marketo-campaign-auditor"]="audit:campaign-audit"
    ["marketo-deliverability-auditor"]="audit:deliverability-audit"

    # Marketo Build Agents
    ["marketo-campaign-manager"]="build:campaign-development"
    ["marketo-program-builder"]="build:program-development"
    ["marketo-smart-campaign-builder"]="build:smart-campaign"

    # GTM Planning Agents
    ["gtm-strategic-reports-orchestrator"]="report:strategic-report"
    ["gtm-revenue-modeler"]="report:revenue-model"
    ["gtm-retention-analyst"]="report:retention-analysis"
    ["gtm-market-intelligence"]="report:market-intelligence"
    ["gtm-forecast-orchestrator"]="report:forecast-report"

    # Cross-Platform Agents
    ["multi-platform-campaign-orchestrator"]="build:campaign-orchestration"
    ["multi-platform-workflow-orchestrator"]="build:workflow-orchestration"
    ["data-migration-orchestrator"]="migration:platform-migration"
    ["unified-reporting-aggregator"]="report:unified-report"
    ["unified-data-quality-validator"]="audit:data-quality-audit"

    # Customer Success Agents
    ["cs-operations-orchestrator"]="report:cs-operations"
    ["account-expansion-orchestrator"]="report:expansion-analysis"
    ["sales-playbook-orchestrator"]="report:sales-playbook"
    ["sales-enablement-coordinator"]="consultation:enablement"

    # Support Agents
    ["sfdc-conflict-resolver"]="support:conflict-resolution"
    ["sfdc-remediation-executor"]="support:remediation"
    ["compliance-report-generator"]="report:compliance-report"

    # Analysis & Research Agents
    ["win-loss-analyzer"]="report:win-loss-analysis"
    ["benchmark-research-agent"]="report:benchmark-research"
    ["forecast-orchestrator"]="report:forecast-analysis"
    ["churn-predictor"]="report:churn-analysis"
    ["customer-health-scorer"]="report:health-scoring"

    # Intake & Planning Agents
    ["intelligent-intake-orchestrator"]="consultation:project-intake"
    ["notebooklm-knowledge-manager"]="report:knowledge-base"
    ["client-notebook-orchestrator"]="report:client-briefing"
    ["field-dictionary-manager"]="configuration:field-dictionary"
)

# Check if this is an assessment agent
# Priority: 1) External config file, 2) Hardcoded whitelist, 3) Catch-all, 4) Skip
CLASSIFICATION=""
SUB_TYPE=""
if [ -n "$EXTERNAL_CLASSIFICATION" ]; then
    # Use external config file mapping (highest priority)
    IFS=':' read -r CLASSIFICATION SUB_TYPE <<< "$EXTERNAL_CLASSIFICATION"
elif [ -n "$AGENT_NAME" ] && [ -n "${AGENT_CLASSIFICATIONS[$AGENT_NAME]:-}" ]; then
    # Use hardcoded whitelist mapping
    IFS=':' read -r CLASSIFICATION SUB_TYPE <<< "${AGENT_CLASSIFICATIONS[$AGENT_NAME]}"
elif [ "$CATCH_ALL" = "1" ] && [ -n "$AGENT_NAME" ]; then
    # Catch-all mode: capture ANY Agent completion with generic classification
    CLASSIFICATION="support"
    SUB_TYPE="general-request"
    set_verbose_context "Work-index catch-all mode applied to agent '$AGENT_NAME'."
else
    # Agent not in whitelist - skip silently by default, verbose mode surfaces structured context.
    set_verbose_context "Work-index capture skipped: agent '$AGENT_NAME' is not in the auto-capture list. Set WORK_INDEX_CATCH_ALL=1 or add it to $CONFIG_FILE."
    if [ -n "$HOOK_CONTEXT" ]; then
        emit_post_tool_use_context "$HOOK_CONTEXT"
    fi
    exit 0
fi

# Determine org slug
ORG=""
if [ -n "${ORG_SLUG:-}" ]; then
    ORG="$ORG_SLUG"
elif [ -n "${CLIENT_ORG:-}" ]; then
    ORG="$CLIENT_ORG"
elif [ -n "${SF_TARGET_ORG:-}" ]; then
    ORG="$SF_TARGET_ORG"
fi

# Exit if no org context - with prominent warning
if [ -z "$ORG" ]; then
    emit_post_tool_use_context "Work-index capture skipped because ORG_SLUG is not set for agent '$AGENT_NAME'. Export ORG_SLUG=<client-org-name> or set CLIENT_ORG before running assessment agents."
    exit 0
fi

# Path to work-index-manager
MANAGER_SCRIPT="$PLUGIN_ROOT/scripts/lib/work-index-manager.js"

if [ ! -f "$MANAGER_SCRIPT" ]; then
    set_verbose_context "Work-index manager script was not found, so capture was skipped."
    if [ -n "$HOOK_CONTEXT" ]; then
        emit_post_tool_use_context "$HOOK_CONTEXT"
    fi
    exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    set_verbose_context "Work-index capture skipped because Node.js is not available."
    if [ -n "$HOOK_CONTEXT" ]; then
        emit_post_tool_use_context "$HOOK_CONTEXT"
    fi
    exit 0
fi

# Extract additional details from hook input
TITLE=""
ABSTRACT=""
DELIVERABLE_PATH=""

if command -v jq &> /dev/null; then
    # Try to extract title/abstract from common fields
    TITLE=$(echo "$HOOK_INPUT" | jq -r '.title // .summary // empty' 2>/dev/null | head -c 200 || true)
    ABSTRACT=$(echo "$HOOK_INPUT" | jq -r '.abstract // .description // .summary // empty' 2>/dev/null | head -c 500 || true)
    DELIVERABLE_PATH=$(echo "$HOOK_INPUT" | jq -r '.output_path // .deliverable_path // empty' 2>/dev/null || true)
fi

# Generate title if not extracted
if [ -z "$TITLE" ]; then
    # Convert agent name to readable title
    case "$AGENT_NAME" in
        # Salesforce
        sfdc-cpq-assessor) TITLE="CPQ Assessment" ;;
        sfdc-revops-auditor) TITLE="RevOps Audit" ;;
        sfdc-automation-auditor) TITLE="Automation Audit" ;;
        sfdc-architecture-auditor) TITLE="Architecture Audit" ;;
        sfdc-security-admin) TITLE="Security Audit" ;;
        sfdc-object-auditor) TITLE="Object Audit" ;;
        sfdc-quality-auditor) TITLE="Quality Audit" ;;
        sfdc-permission-assessor) TITLE="Permission Assessment" ;;
        sfdc-reports-dashboards) TITLE="Reports/Dashboards Work" ;;
        sfdc-data-import-manager) TITLE="Data Import" ;;
        sfdc-data-export-manager) TITLE="Data Export" ;;
        sfdc-territory-orchestrator) TITLE="Territory Management" ;;

        # HubSpot
        hubspot-assessment-analyzer) TITLE="HubSpot Assessment" ;;
        hubspot-workflow-builder) TITLE="HubSpot Workflow Build" ;;
        hubspot-data-operations-manager) TITLE="HubSpot Data Operations" ;;

        # Marketo
        marketo-assessment-analyzer) TITLE="Marketo Assessment" ;;
        marketo-campaign-manager) TITLE="Marketo Campaign Work" ;;

        # GTM Planning
        gtm-strategic-reports-orchestrator) TITLE="Strategic Report" ;;
        gtm-revenue-modeler) TITLE="Revenue Modeling" ;;
        gtm-retention-analyst) TITLE="Retention Analysis" ;;
        gtm-forecast-orchestrator) TITLE="Forecast Report" ;;

        # Cross-Platform
        diagram-generator) TITLE="Diagram Generation" ;;
        pipeline-intelligence-agent) TITLE="Pipeline Analysis" ;;
        unified-exec-dashboard-agent) TITLE="Executive Dashboard" ;;
        data-migration-orchestrator) TITLE="Data Migration" ;;
        multi-platform-campaign-orchestrator) TITLE="Campaign Orchestration" ;;

        # Customer Success
        cs-operations-orchestrator) TITLE="CS Operations" ;;
        account-expansion-orchestrator) TITLE="Account Expansion Analysis" ;;

        # Default
        *) TITLE="Work: ${AGENT_NAME//-/ }" ;;
    esac
fi

# Get session ID if available
SESSION_ID="${CLAUDE_SESSION_ID:-}"

# Check for existing in-progress request to update
EXISTING_REQUEST=""
if [ "$VERBOSE" = "1" ]; then
    EXISTING_REQUEST=$(node "$MANAGER_SCRIPT" list "$ORG" --status in-progress --json 2>/dev/null | jq -r '.[0].id // empty' 2>/dev/null || true)
fi

# Build the command
if [ -n "$EXISTING_REQUEST" ]; then
    # Update existing request
    set_verbose_context "Work-index updating existing request $EXISTING_REQUEST."

    UPDATE_CMD=(node "$MANAGER_SCRIPT" update "$ORG" "$EXISTING_REQUEST" --status completed)
    [ -n "$ABSTRACT" ] && UPDATE_CMD+=(--abstract "$ABSTRACT")

    if "${UPDATE_CMD[@]}" 2>/dev/null; then
        set_verbose_context "Work-index updated request $EXISTING_REQUEST."
    fi

    # Add session if available
    if [ -n "$SESSION_ID" ]; then
        # Session linking would require extending the CLI - for now just log
        set_verbose_context "Work-index associated session $SESSION_ID with request $EXISTING_REQUEST."
    fi
else
    # Create new request
    ADD_CMD=(node "$MANAGER_SCRIPT" add "$ORG"
        --title "$TITLE"
        --classification "$CLASSIFICATION")

    [ -n "$SUB_TYPE" ] && ADD_CMD+=(--sub-type "$SUB_TYPE")
    [ -n "$ABSTRACT" ] && ADD_CMD+=(--abstract "$ABSTRACT")

    if OUTPUT=$("${ADD_CMD[@]}" 2>&1); then
        REQUEST_ID=$(echo "$OUTPUT" | grep -oP 'WRK-\d{8}-\d{3}' | head -1 || true)
        if [ -n "$REQUEST_ID" ]; then
            set_verbose_context "Work-index created request $REQUEST_ID."
        else
            set_verbose_context "Work-index created a new request entry."
        fi
    else
        set_verbose_context "Work-index create attempt failed to persist a request entry."
    fi
fi

if [ -n "$HOOK_CONTEXT" ]; then
    emit_post_tool_use_context "$HOOK_CONTEXT"
fi

# Always exit successfully - work indexing is non-blocking
exit 0
