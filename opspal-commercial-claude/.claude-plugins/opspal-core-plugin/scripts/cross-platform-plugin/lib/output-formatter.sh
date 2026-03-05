#!/bin/bash

###############################################################################
# OutputFormatter Bash Wrapper
#
# Purpose: Provides bash interface to OutputFormatter library for hooks
#
# Usage:
#   source output-formatter.sh
#   output_error "Title" "Description" "key1:value1,key2:value2" "rec1,rec2"
#   output_warning "Title" "Description" "key1:value1" "sug1,sug2"
#   output_success "Title" "Summary" "key1:value1" "step1,step2"
#   output_info "Title" "Content" "key1:value1"
###############################################################################

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMATTER_JS="$SCRIPT_DIR/output-formatter.js"

# Check if OutputFormatter exists
if [ ! -f "$FORMATTER_JS" ]; then
  echo "Error: OutputFormatter not found at $FORMATTER_JS" >&2
  return 1
fi

###############################################################################
# Error Output
#
# Args:
#   $1 - Title
#   $2 - Description (optional)
#   $3 - Details as "key1:value1,key2:value2" (optional)
#   $4 - Recommendations as "rec1,rec2,rec3" (optional)
#   $5 - Footer (optional)
#   $6 - Exit code (optional, default: 1)
###############################################################################
output_error() {
  local title="$1"
  local description="${2:-}"
  local details="${3:-}"
  local recommendations="${4:-}"
  local footer="${5:-}"
  local exit_code="${6:-1}"

  # Build JSON for Node.js call
  local json_details=""
  local json_recommendations=""

  # Parse details
  if [ -n "$details" ]; then
    json_details=$(echo "$details" | awk -F',' '{
      printf "{"
      for (i=1; i<=NF; i++) {
        split($i, kv, ":")
        if (i > 1) printf ","
        printf "\"%s\":\"%s\"", kv[1], kv[2]
      }
      printf "}"
    }')
  fi

  # Parse recommendations
  if [ -n "$recommendations" ]; then
    json_recommendations=$(echo "$recommendations" | awk -F',' '{
      printf "["
      for (i=1; i<=NF; i++) {
        if (i > 1) printf ","
        printf "\"%s\"", $i
      }
      printf "]"
    }')
  fi

  # Call Node.js OutputFormatter
  node "$FORMATTER_JS" format-error \
    --title "$title" \
    ${description:+--description "$description"} \
    ${json_details:+--details "$json_details"} \
    ${json_recommendations:+--recommendations "$json_recommendations"} \
    ${footer:+--footer "$footer"} \
    --exit-code "$exit_code" >&2

  return "$exit_code"
}

###############################################################################
# Warning Output
#
# Args:
#   $1 - Title
#   $2 - Description (optional)
#   $3 - Context as "key1:value1,key2:value2" (optional)
#   $4 - Suggestions as "sug1,sug2,sug3" (optional)
#   $5 - Footer (optional)
#   $6 - Exit code (optional, default: 2)
###############################################################################
output_warning() {
  local title="$1"
  local description="${2:-}"
  local context="${3:-}"
  local suggestions="${4:-}"
  local footer="${5:-}"
  local exit_code="${6:-2}"

  # Build JSON for Node.js call
  local json_context=""
  local json_suggestions=""

  # Parse context
  if [ -n "$context" ]; then
    json_context=$(echo "$context" | awk -F',' '{
      printf "{"
      for (i=1; i<=NF; i++) {
        split($i, kv, ":")
        if (i > 1) printf ","
        printf "\"%s\":\"%s\"", kv[1], kv[2]
      }
      printf "}"
    }')
  fi

  # Parse suggestions
  if [ -n "$suggestions" ]; then
    json_suggestions=$(echo "$suggestions" | awk -F',' '{
      printf "["
      for (i=1; i<=NF; i++) {
        if (i > 1) printf ","
        printf "\"%s\"", $i
      }
      printf "]"
    }')
  fi

  # Call Node.js OutputFormatter
  node "$FORMATTER_JS" format-warning \
    --title "$title" \
    ${description:+--description "$description"} \
    ${json_context:+--context "$json_context"} \
    ${json_suggestions:+--suggestions "$json_suggestions"} \
    ${footer:+--footer "$footer"} \
    --exit-code "$exit_code" >&2

  return "$exit_code"
}

###############################################################################
# Success Output
#
# Args:
#   $1 - Title
#   $2 - Summary (optional)
#   $3 - Metrics as "key1:value1,key2:value2" (optional)
#   $4 - Next steps as "step1,step2,step3" (optional)
#   $5 - Footer (optional)
###############################################################################
output_success() {
  local title="$1"
  local summary="${2:-}"
  local metrics="${3:-}"
  local next_steps="${4:-}"
  local footer="${5:-}"

  # Build JSON for Node.js call
  local json_metrics=""
  local json_next_steps=""

  # Parse metrics
  if [ -n "$metrics" ]; then
    json_metrics=$(echo "$metrics" | awk -F',' '{
      printf "{"
      for (i=1; i<=NF; i++) {
        split($i, kv, ":")
        if (i > 1) printf ","
        printf "\"%s\":\"%s\"", kv[1], kv[2]
      }
      printf "}"
    }')
  fi

  # Parse next steps
  if [ -n "$next_steps" ]; then
    json_next_steps=$(echo "$next_steps" | awk -F',' '{
      printf "["
      for (i=1; i<=NF; i++) {
        if (i > 1) printf ","
        printf "\"%s\"", $i
      }
      printf "]"
    }')
  fi

  # Call Node.js OutputFormatter
  node "$FORMATTER_JS" format-success \
    --title "$title" \
    ${summary:+--summary "$summary"} \
    ${json_metrics:+--metrics "$json_metrics"} \
    ${json_next_steps:+--next-steps "$json_next_steps"} \
    ${footer:+--footer "$footer"} >&2

  return 0
}

###############################################################################
# Info Output
#
# Args:
#   $1 - Title
#   $2 - Content (optional)
#   $3 - Details as "key1:value1,key2:value2" (optional)
#   $4 - Footer (optional)
###############################################################################
output_info() {
  local title="$1"
  local content="${2:-}"
  local details="${3:-}"
  local footer="${4:-}"

  # Build JSON for Node.js call
  local json_details=""

  # Parse details
  if [ -n "$details" ]; then
    json_details=$(echo "$details" | awk -F',' '{
      printf "{"
      for (i=1; i<=NF; i++) {
        split($i, kv, ":")
        if (i > 1) printf ","
        printf "\"%s\":\"%s\"", kv[1], kv[2]
      }
      printf "}"
    }')
  fi

  # Call Node.js OutputFormatter
  node "$FORMATTER_JS" format-info \
    --title "$title" \
    ${content:+--content "$content"} \
    ${json_details:+--details "$json_details"} \
    ${footer:+--footer "$footer"} >&2

  return 0
}
