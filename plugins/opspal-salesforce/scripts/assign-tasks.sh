#!/bin/bash
set -e

WORKSPACE_ID="REDACTED_ASANA_WORKSPACE"
ASSIGNEE_EMAIL="cacevedo@gorevpal.com"
ASANA_TOKEN="${ASANA_ACCESS_TOKEN}"

TASK_GIDS=(
  "1211517473355085"
  "1211517323835456"
  "1211517688229481"
  "1211517683705077"
  "1211517323626939"
)

echo "🔄 Updating Task Assignees"
echo "================================================================================"

# Find user GID by email
echo "🔍 Searching for user: ${ASSIGNEE_EMAIL}..."
USER_DATA=$(curl -s "https://app.asana.com/api/1.0/workspaces/${WORKSPACE_ID}/users" \
  -H "Authorization: Bearer ${ASANA_TOKEN}")

USER_GID=$(echo "$USER_DATA" | jq -r ".data[] | select(.email == \"${ASSIGNEE_EMAIL}\") | .gid")

if [ -z "$USER_GID" ]; then
  echo "❌ User not found: ${ASSIGNEE_EMAIL}"
  exit 1
fi

echo "✅ Found user GID: ${USER_GID}"
echo ""

# Update each task
for TASK_GID in "${TASK_GIDS[@]}"; do
  echo "📝 Updating task ${TASK_GID}..."

  RESULT=$(curl -s -X PUT "https://app.asana.com/api/1.0/tasks/${TASK_GID}" \
    -H "Authorization: Bearer ${ASANA_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"data\": {\"assignee\": \"${USER_GID}\"}}")

  TASK_NAME=$(echo "$RESULT" | jq -r '.data.name')
  echo "✅ Assigned: ${TASK_NAME}"
done

echo ""
echo "================================================================================"
echo "✅ All 5 tasks assigned to ${ASSIGNEE_EMAIL}"
