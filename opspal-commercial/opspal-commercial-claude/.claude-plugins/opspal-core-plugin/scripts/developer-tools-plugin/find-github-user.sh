#!/bin/bash

# Find GitHub user by searching (requires knowing some info about them)
# Usage: ./find-github-user.sh "name or company"

QUERY="$1"

if [ -z "$QUERY" ]; then
  echo "Usage: $0 \"search query\""
  echo "Example: $0 \"John Doe RevPal\""
  exit 1
fi

echo "Searching GitHub for: $QUERY"
echo ""

gh api search/users -f q="$QUERY" --jq '.items[] | "\(.login) - \(.name // "No name") - \(.email // "No public email") - \(.html_url)"' | head -10
