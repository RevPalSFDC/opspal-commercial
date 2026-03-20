#!/bin/bash
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
#   - Shows message when agent not in whitelist (suggests WORK_INDEX_CATCH_ALL)
#   - Shows warning when ORG_SLUG not set (provides export command)
#   - Shows message when disabled (WORK_INDEX_AUTO_CAPTURE=0)
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
    PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
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

# Early exit if disabled
if [ "$ENABLED" != "1" ]; then
    echo "ℹ️  Work-index auto-capture disabled (WORK_INDEX_AUTO_CAPTURE=0)" >&2
    exit 0
fi

# Read hook input (contains agent output details)
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat)
fi

# Exit if no input
if [ -z "$HOOK_INPUT" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-index] No hook input, skipping" >&2
    exit 0
fi

# Extract agent name from input (JSON structure expected)
AGENT_NAME=""
if command -v jq &> /dev/null; then
    AGENT_NAME=$(echo "$HOOK_INPUT" | jq -r '.agent_name // .tool_name // empty' 2>/dev/null || true)
fi

# Try to load classification from external config file first (if jq available)
EXTERNAL_CLASSIFICATION=""
CONFIG_FILE="$PLUGIN_ROOT/config/work-index-agent-mappings.json"
if [ -n "$AGENT_NAME" ] && [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    EXTERNAL_CLASSIFICATION=$(jq -r --arg agent "$AGENT_NAME" '.mappings[$agent] // empty' "$CONFIG_FILE" 2>/dev/null || true)
    [ "$VERBOSE" = "1" ] && [ -n "$EXTERNAL_CLASSIFICATION" ] && echo "[work-index] Loaded classification from config: $EXTERNAL_CLASSIFICATION" >&2
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
    [ "$VERBOSE" = "1" ] && echo "[work-index] Using config file classification for '$AGENT_NAME'" >&2
elif [ -n "$AGENT_NAME" ] && [ -n "${AGENT_CLASSIFICATIONS[$AGENT_NAME]:-}" ]; then
    # Use hardcoded whitelist mapping
    IFS=':' read -r CLASSIFICATION SUB_TYPE <<< "${AGENT_CLASSIFICATIONS[$AGENT_NAME]}"
elif [ "$CATCH_ALL" = "1" ] && [ -n "$AGENT_NAME" ]; then
    # Catch-all mode: capture ANY Agent completion with generic classification
    CLASSIFICATION="support"
    SUB_TYPE="general-request"
    echo "[work-index] Using catch-all classification for agent '$AGENT_NAME'" >&2
else
    # Agent not in whitelist - provide user feedback
    echo "ℹ️  Work-index: Agent '$AGENT_NAME' not in auto-capture list" >&2
    echo "   Set WORK_INDEX_CATCH_ALL=1 to capture all agents, or add to whitelist" >&2
    echo "   Or add to: $CONFIG_FILE" >&2
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
    # Use ANSI colors for prominent warning (yellow background, bold)
    if [ -t 2 ]; then
        # Terminal output - use colors
        echo "" >&2
        echo -e "\033[1;43;30m ⚠️  WORK INDEX: ORG_SLUG NOT SET \033[0m" >&2
        echo -e "\033[1;33m    Work entry was NOT captured for this assessment.\033[0m" >&2
        echo "" >&2
        echo "    To enable auto-capture, set ORG_SLUG before running assessments:" >&2
        echo "" >&2
        echo -e "    \033[1;36mexport ORG_SLUG=<client-org-name>\033[0m" >&2
        echo "" >&2
        echo "    Or add to your shell profile (~/.bashrc or ~/.zshrc):" >&2
        echo "    # Set default org for current client engagement" >&2
        echo "    export ORG_SLUG=acme-corp" >&2
        echo "" >&2
    else
        # Non-terminal output - plain text
        echo "" >&2
        echo "======================================================" >&2
        echo "⚠️  WORK INDEX: ORG_SLUG NOT SET" >&2
        echo "    Work entry was NOT captured for this assessment." >&2
        echo "======================================================" >&2
        echo "" >&2
        echo "    To enable auto-capture:" >&2
        echo "    export ORG_SLUG=<client-org-name>" >&2
        echo "" >&2
    fi
    # Exit with code 78 (EX_CONFIG from sysexits.h) to indicate configuration issue
    # This is non-fatal but signals that the hook couldn't complete its purpose
    exit 78
fi

# Path to work-index-manager
MANAGER_SCRIPT="$PLUGIN_ROOT/scripts/lib/work-index-manager.js"

if [ ! -f "$MANAGER_SCRIPT" ]; then
    [ "$VERBOSE" = "1" ] && echo "[work-index] Manager script not found" >&2
    exit 0
fi

# Check if node is available
if ! command -v node &> /dev/null; then
    [ "$VERBOSE" = "1" ] && echo "[work-index] Node.js not available" >&2
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
    [ "$VERBOSE" = "1" ] && echo "[work-index] Updating existing request: $EXISTING_REQUEST" >&2

    UPDATE_CMD=(node "$MANAGER_SCRIPT" update "$ORG" "$EXISTING_REQUEST" --status completed)
    [ -n "$ABSTRACT" ] && UPDATE_CMD+=(--abstract "$ABSTRACT")

    if "${UPDATE_CMD[@]}" 2>/dev/null; then
        echo "[work-index] Updated work request: $EXISTING_REQUEST" >&2
    fi

    # Add session if available
    if [ -n "$SESSION_ID" ]; then
        # Session linking would require extending the CLI - for now just log
        [ "$VERBOSE" = "1" ] && echo "[work-index] Session ID: $SESSION_ID" >&2
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
            echo "[work-index] Created work request: $REQUEST_ID" >&2
        else
            echo "[work-index] Created work request" >&2
        fi
    else
        [ "$VERBOSE" = "1" ] && echo "[work-index] Failed to create request: $OUTPUT" >&2
    fi
fi

# Always exit successfully - work indexing is non-blocking
exit 0
