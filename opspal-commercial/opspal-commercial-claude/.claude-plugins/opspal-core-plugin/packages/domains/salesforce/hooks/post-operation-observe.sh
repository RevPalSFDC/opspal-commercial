#!/bin/bash
# Post-Operation Observer Hook
#
# Triggered after: Agent operations (deployments, assessments, data operations)
# Purpose: Capture structured telemetry for Living Runbook System
#
# ✅ NON-BLOCKING: Failures don't break agent workflows
# ✅ AUTO-DETECTION: Extracts context from environment/operation
# ✅ LIGHTWEIGHT: Minimal overhead (<100ms)
#
# Environment Variables (Auto-detected):
#   CLAUDE_AGENT_NAME - Current agent name
#   ORG - Salesforce org alias
#   OPERATION_TYPE - Type of operation performed
#   OPERATION_CONTEXT - JSON context (objects, fields, workflows)
#
# Exit Codes:
#   0 - Always (non-fatal to avoid breaking workflows)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/packages/opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../../opspal-core/cross-platform-plugin/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="post-operation-observe"
    # Lenient mode - this hook should not block operations
    set_lenient_mode 2>/dev/null || true
fi

set +e  # Don't exit on errors (graceful degradation)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Debug mode (set DEBUG_OBSERVER=1 for verbose output)
DEBUG=${DEBUG_OBSERVER:-0}

if [ "$DEBUG" = "1" ]; then
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}📊 Post-Operation Observer${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

# ==============================================================================
# FUNCTION: Detect Plugin Root
# ==============================================================================

resolve_domain_root() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/scripts" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "$1"
}

detect_plugin_root() {
  local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local domain_root
  domain_root="$(resolve_domain_root "$script_dir")"

  if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
    local domain_name
    domain_name="$(basename "$domain_root")"
    case "$CLAUDE_PLUGIN_ROOT" in
      *"/packages/domains/$domain_name"|*/"$domain_name"-plugin) echo "$CLAUDE_PLUGIN_ROOT"; return 0 ;;
    esac
  fi

  echo "$domain_root"
}

# ==============================================================================
# FUNCTION: Auto-detect Org from Context
# ==============================================================================

detect_org() {
  # Priority 1: Environment variable
  if [ -n "$ORG" ]; then
    echo "$ORG"
    return 0
  fi

  # Priority 2: From current directory path
  # Pattern: /instances/{org}/ or /instances/{org}-{env}/
  local cwd="$PWD"
  if [[ "$cwd" =~ /instances/([^/]+) ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  # Priority 3: From most recent sf org command (if available)
  if command -v sf &>/dev/null; then
    local default_org=$(sf config get target-org --json 2>/dev/null | grep -oP '"value":\s*"\K[^"]+' || echo "")
    if [ -n "$default_org" ]; then
      echo "$default_org"
      return 0
    fi
  fi

  # No org detected
  return 1
}

# ==============================================================================
# FUNCTION: Auto-detect Operation Type
# ==============================================================================

detect_operation_type() {
  # Priority 1: Environment variable
  if [ -n "$OPERATION_TYPE" ]; then
    echo "$OPERATION_TYPE"
    return 0
  fi

  # Priority 2: From agent name
  local agent="${CLAUDE_AGENT_NAME:-unknown}"
  case "$agent" in
    *orchestrator* | *deployer*)
      echo "deployment"
      ;;
    *workflow*)
      echo "workflow-operation"
      ;;
    # Flow-specific detection (NEW v3.42.0)
    *flow* | *automation-builder* | *template-specialist* | *batch-operator*)
      # Check if this is a Flow Scanner operation (v3.56.0)
      if echo "$@" | grep -qE "auto-fix|sarif|flow-validator\.yml"; then
        echo "flow-scanner-operation"
      else
        echo "flow-operation"
      fi
      ;;
    # Validation Rules detection (NEW v3.50.0)
    *validation-rule* | *validation-orchestrator* | *validation-segmentation*)
      echo "validation-rule-operation"
      ;;
    # Apex Trigger detection (NEW v3.50.0)
    *trigger-orchestrator* | *trigger-segmentation* | *trigger-wizard*)
      echo "trigger-operation"
      ;;
    # Permission Set detection (NEW v3.50.0)
    *permission-orchestrator* | *permission-segmentation* | *permission-wizard*)
      echo "permission-set-operation"
      ;;
    *field* | *metadata*)
      echo "metadata-operation"
      ;;
    *assessment* | *audit*)
      echo "assessment"
      ;;
    *data*)
      echo "data-operation"
      ;;
    *cpq*)
      echo "cpq-operation"
      ;;
    *)
      echo "general-operation"
      ;;
  esac
}

# ==============================================================================
# FUNCTION: Extract Context from Environment
# ==============================================================================

extract_context() {
  local context_json="{}"

  # If OPERATION_CONTEXT is already set as JSON, use it
  if [ -n "$OPERATION_CONTEXT" ]; then
    # Validate JSON
    if echo "$OPERATION_CONTEXT" | jq empty 2>/dev/null; then
      echo "$OPERATION_CONTEXT"
      return 0
    fi
  fi

  # Build context from individual env vars
  local objects="${OPERATION_OBJECTS:-}"
  local fields="${OPERATION_FIELDS:-}"
  local workflows="${OPERATION_WORKFLOWS:-}"

  # Flow-specific context (NEW v3.42.0)
  local flows="${OPERATION_FLOWS:-}"
  local flow_operation="${FLOW_OPERATION_TYPE:-}"  # create, modify, validate, deploy, batch
  local flow_count="${FLOW_COUNT:-0}"
  local templates_used="${TEMPLATES_USED:-}"

  # Validation Rule context (NEW v3.50.0)
  local validation_rules="${VALIDATION_RULES:-}"
  local validation_complexity="${VALIDATION_COMPLEXITY:-}"
  local validation_template="${VALIDATION_TEMPLATE:-}"

  # Trigger context (NEW v3.50.0)
  local triggers="${TRIGGERS:-}"
  local trigger_template="${TRIGGER_TEMPLATE:-}"
  local trigger_events="${TRIGGER_EVENTS:-}"  # beforeInsert, afterUpdate, etc.

  # Permission Set context (NEW v3.50.0)
  local permission_sets="${PERMISSION_SETS:-}"
  local permission_complexity="${PERMISSION_COMPLEXITY:-}"
  local permission_tier="${PERMISSION_TIER:-}"  # 1=foundational, 2=composed
  local permission_template="${PERMISSION_TEMPLATE:-}"

  # Flow Scanner context (NEW v3.56.0)
  local flow_scanner_auto_fix="${FLOW_SCANNER_AUTO_FIX:-false}"
  local flow_scanner_patterns="${FLOW_SCANNER_PATTERNS:-}"  # Comma-separated patterns fixed
  local flow_scanner_sarif="${FLOW_SCANNER_SARIF:-false}"
  local flow_scanner_config="${FLOW_SCANNER_CONFIG:-false}"  # .flow-validator.yml used

  # Use jq to build JSON if available, otherwise construct manually
  if command -v jq &>/dev/null; then
    context_json=$(jq -n \
      --arg objects "$objects" \
      --arg fields "$fields" \
      --arg workflows "$workflows" \
      --arg flows "$flows" \
      --arg flow_operation "$flow_operation" \
      --argjson flow_count "$flow_count" \
      --arg templates_used "$templates_used" \
      --arg validation_rules "$validation_rules" \
      --arg validation_complexity "$validation_complexity" \
      --arg validation_template "$validation_template" \
      --arg triggers "$triggers" \
      --arg trigger_template "$trigger_template" \
      --arg trigger_events "$trigger_events" \
      --arg permission_sets "$permission_sets" \
      --arg permission_complexity "$permission_complexity" \
      --arg permission_tier "$permission_tier" \
      --arg permission_template "$permission_template" \
      --arg flow_scanner_auto_fix "$flow_scanner_auto_fix" \
      --arg flow_scanner_patterns "$flow_scanner_patterns" \
      --arg flow_scanner_sarif "$flow_scanner_sarif" \
      --arg flow_scanner_config "$flow_scanner_config" \
      '{
        objects: ($objects | split(",") | map(select(length > 0))),
        fields: ($fields | split(",") | map(select(length > 0))),
        workflows: ($workflows | split(",") | map(select(length > 0))),
        flows: ($flows | split(",") | map(select(length > 0))),
        flow_operation: $flow_operation,
        flow_count: $flow_count,
        templates_used: ($templates_used | split(",") | map(select(length > 0))),
        validation_rules: ($validation_rules | split(",") | map(select(length > 0))),
        validation_complexity: $validation_complexity,
        validation_template: $validation_template,
        triggers: ($triggers | split(",") | map(select(length > 0))),
        trigger_template: $trigger_template,
        trigger_events: ($trigger_events | split(",") | map(select(length > 0))),
        permission_sets: ($permission_sets | split(",") | map(select(length > 0))),
        permission_complexity: $permission_complexity,
        permission_tier: $permission_tier,
        permission_template: $permission_template,
        flow_scanner: {
          auto_fix_used: ($flow_scanner_auto_fix == "true"),
          auto_fix_patterns: ($flow_scanner_patterns | split(",") | map(select(length > 0))),
          sarif_output: ($flow_scanner_sarif == "true"),
          config_file_used: ($flow_scanner_config == "true")
        }
      }')
  else
    # Fallback: simple JSON construction
    context_json="{\"objects\": [], \"fields\": [], \"workflows\": [], \"flows\": [], \"flow_operation\": \"\", \"flow_count\": 0, \"templates_used\": [], \"validation_rules\": [], \"validation_complexity\": \"\", \"validation_template\": \"\", \"triggers\": [], \"trigger_template\": \"\", \"trigger_events\": [], \"permission_sets\": [], \"permission_complexity\": \"\", \"permission_tier\": \"\", \"permission_template\": \"\", \"flow_scanner\": {\"auto_fix_used\": false, \"auto_fix_patterns\": [], \"sarif_output\": false, \"config_file_used\": false}}"
  fi

  echo "$context_json"
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Detect plugin root
PLUGIN_ROOT=$(detect_plugin_root)
OBSERVER_SCRIPT="$PLUGIN_ROOT/scripts/lib/runbook-observer.js"

if [ ! -f "$OBSERVER_SCRIPT" ]; then
  if [ "$DEBUG" = "1" ]; then
    echo -e "${YELLOW}⚠️  Observer script not found: $OBSERVER_SCRIPT${NC}"
    echo -e "   Skipping observation capture"
  fi
  exit 0  # Non-fatal
fi

# Detect org
ORG_ALIAS=$(detect_org)
if [ -z "$ORG_ALIAS" ]; then
  if [ "$DEBUG" = "1" ]; then
    echo -e "${YELLOW}⚠️  Could not detect org alias${NC}"
    echo -e "   Skipping observation capture"
  fi
  exit 0  # Non-fatal
fi

# Detect operation type
OPERATION=$(detect_operation_type)

# Extract context
CONTEXT=$(extract_context)

# Build observer command
CMD=(node "$OBSERVER_SCRIPT" \
  --org "$ORG_ALIAS" \
  --operation "$OPERATION" \
  --outcome "${OPERATION_OUTCOME:-success}")

# Add agent if available
if [ -n "$CLAUDE_AGENT_NAME" ]; then
  CMD+=(--agent "$CLAUDE_AGENT_NAME")
fi

# Add context if non-empty
if [ "$CONTEXT" != "{}" ] && [ "$CONTEXT" != '{"objects": [], "fields": [], "workflows": []}' ]; then
  CMD+=(--context "$CONTEXT")
fi

# Add notes if available
if [ -n "$OPERATION_NOTES" ]; then
  CMD+=(--notes "$OPERATION_NOTES")
fi

# Debug output
if [ "$DEBUG" = "1" ]; then
  echo -e "${YELLOW}🔍 Detection Summary:${NC}"
  echo -e "   Plugin Root: $PLUGIN_ROOT"
  echo -e "   Org: $ORG_ALIAS"
  echo -e "   Operation: $OPERATION"
  echo -e "   Agent: ${CLAUDE_AGENT_NAME:-auto-detect}"
  echo -e "   Context: $CONTEXT"
  echo -e ""
  echo -e "${YELLOW}📤 Running observer...${NC}"
  echo -e "   Command: ${CMD[*]}"
  echo -e ""
fi

# Execute observer (with timeout to prevent hanging)
timeout 5s "${CMD[@]}" 2>&1 | while IFS= read -r line; do
  if [ "$DEBUG" = "1" ]; then
    echo -e "   $line"
  fi
done

# Capture exit code (but don't fail the hook)
OBSERVER_EXIT=$?

# ==============================================================================
# Phase 3.1: Post-Flow Deployment State Verification
# ==============================================================================

# Check if this was a flow deployment and we have a snapshot
if [[ "$OPERATION" == "flow_deployment" || "$OPERATION" == "deploy" ]]; then
    STATE_SYNCHRONIZER="$PLUGIN_ROOT/scripts/lib/flow-state-synchronizer.js"
    ENABLE_STATE_VERIFY="${ENABLE_FLOW_STATE_VERIFY:-1}"

    if [ "$ENABLE_STATE_VERIFY" = "1" ] && [ -f "$STATE_SYNCHRONIZER" ]; then
        # Check if we have snapshot info from pre-deployment
        if [ -n "$FLOW_SNAPSHOT_ID" ] && [ -n "$FLOW_SNAPSHOT_ORG" ]; then
            if [ "$DEBUG" = "1" ]; then
                echo -e "${YELLOW}🔍 Verifying post-deployment state...${NC}"
                echo -e "   Snapshot ID: $FLOW_SNAPSHOT_ID"
            fi

            # Run verification
            VERIFY_RESULT=$(timeout 10s node "$STATE_SYNCHRONIZER" "$FLOW_SNAPSHOT_ORG" verify "$FLOW_SNAPSHOT_ID" --json 2>&1) || true
            VERIFY_SUCCESS=$(echo "$VERIFY_RESULT" | jq -r '.success // false' 2>/dev/null || echo "false")
            STATE_CHANGED=$(echo "$VERIFY_RESULT" | jq -r '.stateChanged // false' 2>/dev/null || echo "false")

            if [ "$VERIFY_SUCCESS" = "true" ]; then
                if [ "$STATE_CHANGED" = "true" ]; then
                    if [ "$DEBUG" = "1" ]; then
                        echo -e "${GREEN}✅ Flow state verified - changes detected as expected${NC}"
                    fi
                else
                    if [ "$DEBUG" = "1" ]; then
                        echo -e "${YELLOW}⚠️  Flow state unchanged - deployment may not have applied${NC}"
                    fi
                fi
            else
                if [ "$DEBUG" = "1" ]; then
                    VERIFY_ERROR=$(echo "$VERIFY_RESULT" | jq -r '.error // "Unknown error"' 2>/dev/null || echo "Unknown error")
                    echo -e "${YELLOW}⚠️  State verification failed: $VERIFY_ERROR${NC}"
                    echo -e "   Rollback available: node $STATE_SYNCHRONIZER $FLOW_SNAPSHOT_ORG rollback $FLOW_SNAPSHOT_ID"
                fi
            fi
        elif [ "$DEBUG" = "1" ]; then
            echo -e "${YELLOW}⚠️  No pre-deployment snapshot found - skipping verification${NC}"
        fi
    fi
fi

if [ "$DEBUG" = "1" ]; then
  if [ $OBSERVER_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ Observation recorded${NC}"
  elif [ $OBSERVER_EXIT -eq 124 ]; then
    echo -e "${YELLOW}⚠️  Observer timeout (non-fatal)${NC}"
  else
    echo -e "${YELLOW}⚠️  Observer failed with exit code $OBSERVER_EXIT (non-fatal)${NC}"
  fi
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fi

# Always exit 0 (non-fatal)
exit 0
