#!/usr/bin/env bash

# =============================================================================
# Post-Reflect Skill Update Hook
# ACE Framework - Closes the feedback loop between reflections and skills
#
# Triggered: After /reflect or /devreflect commands save a reflection
# Purpose: Extract skills used, record executions, update confidence scores
#
# Version: 1.0.0
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Source error handler if available
if [[ -f "$PLUGIN_ROOT/hooks/lib/error-handler.sh" ]]; then
  source "$PLUGIN_ROOT/hooks/lib/error-handler.sh"
fi

# Configuration
VERBOSE="${ROUTING_VERBOSE:-0}"
ENABLE_SKILL_TRACKING="${ENABLE_SKILL_TRACKING:-1}"

# Logging function
log() {
  local level="$1"
  shift
  if [[ "$VERBOSE" == "1" ]] || [[ "$level" == "ERROR" ]]; then
    echo "[PostReflectSkillUpdate] [$level] $*" >&2
  fi
}

# Check if skill tracking is enabled
if [[ "$ENABLE_SKILL_TRACKING" != "1" ]]; then
  log "INFO" "Skill tracking disabled (ENABLE_SKILL_TRACKING=0)"
  exit 0
fi

# Check for required tools
if ! command -v jq &> /dev/null; then
  log "WARN" "jq not installed - skill tracking skipped"
  exit 0
fi

if ! command -v node &> /dev/null; then
  log "WARN" "node not installed - skill tracking skipped"
  exit 0
fi

# Find the most recent reflection file
find_recent_reflection() {
  local claude_dir="${HOME}/.claude"
  local reflection_file=""

  # Look for SESSION_REFLECTION or DEV_REFLECTION files modified in last 5 minutes
  if [[ -d "$claude_dir" ]]; then
    reflection_file=$(find "$claude_dir" -name "*REFLECTION*.json" -mmin -5 -type f 2>/dev/null | sort -r | head -1)
  fi

  # Also check project .claude directory
  if [[ -z "$reflection_file" ]] && [[ -d ".claude" ]]; then
    reflection_file=$(find ".claude" -name "*REFLECTION*.json" -mmin -5 -type f 2>/dev/null | sort -r | head -1)
  fi

  echo "$reflection_file"
}

# Extract skills used from reflection data
extract_skills_used() {
  local reflection_file="$1"

  # Primary location: .skills.skills_used (per reflection schema)
  local skills=$(jq -r '.skills.skills_used // empty' "$reflection_file" 2>/dev/null)

  if [[ -n "$skills" ]] && [[ "$skills" != "null" ]] && [[ "$skills" != "[]" ]]; then
    echo "$skills"
    return 0
  fi

  # Fallback: Try to extract skills_used array directly at root
  skills=$(jq -r '.skills_used // empty' "$reflection_file" 2>/dev/null)

  if [[ -n "$skills" ]] && [[ "$skills" != "null" ]] && [[ "$skills" != "[]" ]]; then
    echo "$skills"
    return 0
  fi

  # Try to infer skills from playbooks_referenced or strategies_used
  skills=$(jq -r '.playbooks_referenced // .strategies_used // empty' "$reflection_file" 2>/dev/null)

  if [[ -n "$skills" ]] && [[ "$skills" != "null" ]] && [[ "$skills" != "[]" ]]; then
    echo "$skills"
    return 0
  fi

  # Try to extract from session context
  skills=$(jq -r '.session_context.skills_applied // empty' "$reflection_file" 2>/dev/null)

  if [[ -n "$skills" ]] && [[ "$skills" != "null" ]] && [[ "$skills" != "[]" ]]; then
    echo "$skills"
    return 0
  fi

  # Return empty array if no skills found
  echo "[]"
}

# Determine outcome from reflection
determine_outcome() {
  local reflection_file="$1"

  # Check explicit outcome field
  local outcome=$(jq -r '.outcome // empty' "$reflection_file" 2>/dev/null)

  if [[ "$outcome" == "success" ]]; then
    echo "true"
    return 0
  elif [[ "$outcome" == "failure" ]]; then
    echo "false"
    return 0
  fi

  # Check for errors array
  local error_count=$(jq -r '.errors | length // 0' "$reflection_file" 2>/dev/null)

  if [[ "$error_count" -gt 0 ]]; then
    echo "false"
    return 0
  fi

  # Check total_issues
  local total_issues=$(jq -r '.total_issues // 0' "$reflection_file" 2>/dev/null)

  if [[ "$total_issues" -gt 2 ]]; then
    echo "false"
    return 0
  fi

  # Default to success if no errors found
  echo "true"
}

# Extract agent name from reflection
extract_agent() {
  local reflection_file="$1"

  # Try direct agent field
  local agent=$(jq -r '.agent // .executing_agent // empty' "$reflection_file" 2>/dev/null)

  if [[ -n "$agent" ]] && [[ "$agent" != "null" ]]; then
    echo "$agent"
    return 0
  fi

  # Try to infer from focus_area
  local focus=$(jq -r '.focus_area // empty' "$reflection_file" 2>/dev/null)

  case "$focus" in
    *cpq*|*CPQ*|*quote*)
      echo "sfdc-cpq-assessor"
      ;;
    *revops*|*RevOps*|*forecast*)
      echo "sfdc-revops-auditor"
      ;;
    *automation*|*flow*)
      echo "sfdc-automation-builder"
      ;;
    *deploy*|*metadata*)
      echo "sfdc-metadata-manager"
      ;;
    *hubspot*|*HubSpot*)
      echo "hubspot-orchestrator"
      ;;
    *)
      echo "sfdc-orchestrator"
      ;;
  esac
}

# Check Supabase connectivity before recording
check_supabase_connectivity() {
  # Check environment variables
  if [[ -z "$SUPABASE_URL" ]] || [[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
    log "WARN" "Supabase not configured - skipping remote recording"
    return 1
  fi

  # Quick connectivity test (timeout 2s)
  if ! curl -s --max-time 2 "$SUPABASE_URL/rest/v1/" &>/dev/null; then
    log "WARN" "Supabase unreachable - skipping remote recording"
    return 1
  fi

  return 0
}

# Fallback: Save to local queue if Supabase fails
save_to_local_queue() {
  local skill_id="$1"
  local agent="$2"
  local success="$3"
  local session_id="$4"
  local org="$5"

  local queue_file="$HOME/.claude/skill-execution-queue.jsonl"
  local timestamp=$(date -Iseconds 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z")

  # Create .claude directory if it doesn't exist
  mkdir -p "$HOME/.claude"

  # Append to queue file
  echo "{\"skill_id\":\"$skill_id\",\"agent\":\"$agent\",\"success\":$success,\"session_id\":\"$session_id\",\"org\":\"$org\",\"timestamp\":\"$timestamp\"}" >> "$queue_file"

  log "INFO" "Saved to local queue for retry: $skill_id (queue: $queue_file)"
  return 0
}

# Record skill execution via strategy-registry.js
record_skill_execution() {
  local skill_id="$1"
  local agent="$2"
  local success="$3"
  local session_id="$4"
  local org="$5"

  local registry_script="$PLUGIN_ROOT/scripts/lib/strategy-registry.js"

  if [[ ! -f "$registry_script" ]]; then
    log "WARN" "strategy-registry.js not found at $registry_script"
    return 1
  fi

  log "INFO" "Recording execution: skill=$skill_id agent=$agent success=$success"

  # Record execution
  node "$registry_script" record \
    --skill-id "$skill_id" \
    --agent "$agent" \
    --success "$success" \
    --session-id "$session_id" \
    ${org:+--org-alias "$org"} \
    2>&1 || {
      log "WARN" "Failed to record execution for $skill_id"
      return 1
    }

  return 0
}

# Update skill confidence
update_skill_confidence() {
  local skill_id="$1"

  local registry_script="$PLUGIN_ROOT/scripts/lib/strategy-registry.js"

  if [[ ! -f "$registry_script" ]]; then
    return 1
  fi

  log "INFO" "Updating confidence for skill: $skill_id"

  node "$registry_script" update-confidence \
    --skill-id "$skill_id" \
    2>&1 || {
      log "WARN" "Failed to update confidence for $skill_id"
      return 1
    }

  return 0
}

# Main processing
main() {
  log "INFO" "Post-reflect skill update hook started"

  # Find recent reflection
  local reflection_file
  reflection_file=$(find_recent_reflection)

  if [[ -z "$reflection_file" ]]; then
    log "INFO" "No recent reflection file found"
    exit 0
  fi

  log "INFO" "Processing reflection: $reflection_file"

  # Extract skills used
  local skills_json
  skills_json=$(extract_skills_used "$reflection_file")

  if [[ "$skills_json" == "[]" ]] || [[ -z "$skills_json" ]]; then
    log "INFO" "No skills found in reflection"
    exit 0
  fi

  # Extract outcome
  local success
  success=$(determine_outcome "$reflection_file")

  # Extract agent
  local agent
  agent=$(extract_agent "$reflection_file")

  # Extract session/org info
  local session_id
  session_id=$(jq -r '.session_id // .id // empty' "$reflection_file" 2>/dev/null)
  [[ -z "$session_id" ]] && session_id=$(basename "$reflection_file" .json)

  local org
  org=$(jq -r '.org // .org_alias // empty' "$reflection_file" 2>/dev/null)

  log "INFO" "Extracted: agent=$agent success=$success org=$org skills=$skills_json"

  # Check Supabase connectivity once before processing
  local supabase_available=0
  if check_supabase_connectivity; then
    supabase_available=1
    log "INFO" "Supabase connectivity confirmed"
  else
    log "WARN" "Supabase unavailable - will use local queue"
  fi

  # Process each skill
  local skill_count=0
  local processed=0
  local queued=0

  # Parse skills JSON array
  while IFS= read -r skill_id; do
    [[ -z "$skill_id" ]] && continue
    [[ "$skill_id" == "null" ]] && continue

    ((skill_count++))

    # Try to record execution if Supabase is available
    if [[ "$supabase_available" == "1" ]]; then
      if record_skill_execution "$skill_id" "$agent" "$success" "$session_id" "$org"; then
        ((processed++))

        # Update confidence (async, don't wait)
        update_skill_confidence "$skill_id" &
      else
        # Record failed, save to queue
        save_to_local_queue "$skill_id" "$agent" "$success" "$session_id" "$org"
        ((queued++))
      fi
    else
      # Supabase not available, save to queue
      save_to_local_queue "$skill_id" "$agent" "$success" "$session_id" "$org"
      ((queued++))
    fi

  done < <(echo "$skills_json" | jq -r '.[]' 2>/dev/null)

  log "INFO" "Processed $processed/$skill_count skill executions, queued $queued for retry"

  # Wait for background confidence updates
  wait

  # ===========================================================================
  # ACE FRAMEWORK: Record Agent-Level Execution
  # ===========================================================================
  # In addition to skill tracking, record agent-level performance for routing
  local ace_recorder="$PLUGIN_ROOT/scripts/lib/ace-execution-recorder.js"

  if [[ -f "$ace_recorder" ]] && command -v node &> /dev/null; then
    # Extract task description from reflection
    local task_desc
    task_desc=$(jq -r '.summary // .description // .focus_area // "Unknown task"' "$reflection_file" 2>/dev/null | head -c 200)

    # Detect category from reflection content
    local category=""
    local focus
    focus=$(jq -r '.focus_area // ""' "$reflection_file" 2>/dev/null)

    case "$focus" in
      *audit*|*assessment*|*review*)
        category="assessment"
        ;;
      *deploy*|*release*)
        category="deployment"
        ;;
      *create*|*build*|*new*)
        category="creation"
        ;;
      *fix*|*error*|*debug*)
        category="remediation"
        ;;
      *query*|*report*|*dashboard*)
        category="analysis"
        ;;
    esac

    # Extract error info if failed
    local error_type=""
    local error_msg=""
    if [[ "$success" == "false" ]]; then
      error_type=$(jq -r '.errors[0].category // .error_type // "unknown"' "$reflection_file" 2>/dev/null)
      error_msg=$(jq -r '.errors[0].message // .error_message // ""' "$reflection_file" 2>/dev/null | head -c 100)
    fi

    log "INFO" "Recording ACE execution: agent=$agent success=$success category=$category"

    # Record to ACE (async)
    (
      node "$ace_recorder" \
        --agent "$agent" \
        --success "$success" \
        --task "$task_desc" \
        ${category:+--category "$category"} \
        ${org:+--org "$org"} \
        ${error_type:+--error-type "$error_type"} \
        ${error_msg:+--error-message "$error_msg"} \
        ${ROUTING_VERBOSE:+--verbose} \
        2>/dev/null || log "WARN" "ACE recording failed"
    ) &
  fi

  log "INFO" "Post-reflect skill update complete"
}

# Run main
main "$@"

exit 0
