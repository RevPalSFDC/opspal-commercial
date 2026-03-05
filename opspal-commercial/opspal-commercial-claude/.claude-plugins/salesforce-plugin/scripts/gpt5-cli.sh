#!/usr/bin/env bash
set -euo pipefail

# Minimal GPT5 adapter CLI helper
# Usage:
#   ./scripts/gpt5-cli.sh health
#   ./scripts/gpt5-cli.sh tools
#   ./scripts/gpt5-cli.sh exec <tool> [json-args]

HOST="127.0.0.1"
PORT="${GPT5_ADAPTER_PORT:-4317}"
TOKEN="${GPT5_ADAPTER_AUTH_TOKEN:-}"

curl_json() {
  local method="$1" path="$2" body="${3:-}"
  local curl_args=( -s -X "$method" "http://${HOST}:${PORT}${path}" -H 'Content-Type: application/json' )
  if [[ -n "${TOKEN}" ]]; then
    curl_args+=( -H "x-auth-token: ${TOKEN}" )
  fi
  if [[ -n "${body}" ]]; then
    curl_args+=( --data "$body" )
  fi
  curl "${curl_args[@]}"
}

cmd="${1:-}"
case "$cmd" in
  health)
    curl_json GET "/api/v1/gpt5/health" | jq .
    ;;
  tools)
    curl_json GET "/api/v1/gpt5/tools" | jq '.count'
    ;;
  exec)
    tool="${2:-}"
    args_json="${3:-"{}"}"
    if [[ -z "$tool" ]]; then
      echo "Usage: $0 exec <tool> [json-args]" >&2; exit 1
    fi
    payload=$(jq -c --arg name "$tool" --argjson args "$args_json" '{name:$name, args:$args}' <<<"null")
    curl_json POST "/api/v1/gpt5/execute" "$payload" | jq .
    ;;
  *)
    echo "Usage: $0 {health|tools|exec <tool> [json-args]}" >&2
    exit 1
    ;;
esac

