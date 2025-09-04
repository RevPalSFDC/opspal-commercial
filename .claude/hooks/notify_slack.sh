#!/usr/bin/env bash
set -euo pipefail

# Read the notification payload from stdin
read -r payload

# Extract the message from the payload
msg=$(echo "$payload" | jq -r '.message // "Claude Code Notification"' 2>/dev/null || echo "Claude Code Notification")

# Check if Slack webhook URL is available
: "${SLACK_WEBHOOK_URL:=}"

# Try to load from .env if not in environment
if [[ -z "$SLACK_WEBHOOK_URL" ]] && [[ -f ".env" ]]; then
  source .env 2>/dev/null || true
fi

# If still no webhook URL, check parent directory .env
if [[ -z "${SLACK_WEBHOOK_URL:-}" ]] && [[ -f "../.env" ]]; then
  source ../.env 2>/dev/null || true
fi

# Send notification if webhook is configured
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  # Format the message for Slack
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  project_name="RevPal Agent System"
  
  # Create Slack payload with formatting
  slack_payload=$(jq -n \
    --arg text "$msg" \
    --arg project "$project_name" \
    --arg time "$timestamp" \
    '{
      "text": $text,
      "blocks": [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": $project
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": $text
          }
        },
        {
          "type": "context",
          "elements": [
            {
              "type": "mrkdwn",
              "text": ("🕐 " + $time + " | 🤖 Claude Code")
            }
          ]
        }
      ]
    }')
  
  # Send to Slack webhook
  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H 'Content-type: application/json' \
    --data "$slack_payload" \
    "$SLACK_WEBHOOK_URL" 2>/dev/null || echo "failed\n500")
  
  # Extract status code
  status_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | head -n -1)
  
  # Log result
  if [[ "$status_code" == "200" ]]; then
    echo "✅ Slack notification sent successfully" >&2
  else
    echo "⚠️  Failed to send Slack notification (HTTP $status_code)" >&2
    echo "Response: $body" >&2
  fi
else
  echo "ℹ️  Slack webhook not configured. Set SLACK_WEBHOOK_URL to enable notifications." >&2
fi

# Always exit successfully to avoid blocking Claude Code
exit 0