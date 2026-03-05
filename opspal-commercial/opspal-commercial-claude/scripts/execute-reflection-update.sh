#!/bin/bash

# Execute Reflection Status Update in Supabase
#
# This script prepares and executes the SQL update via Node.js

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f "../.env" ]; then
  export $(cat ../.env | grep -v '^#' | xargs)
fi

echo "Executing Supabase update for reflection dc5c05e3-e712-40e0-8ab9-bfeaf4b56934..."
echo ""

# Execute the update script
node perform-supabase-update.js

echo ""
echo "Update preparation complete."
echo "The SQL has been generated and saved to ../reports/update-reflection-*.sql"
echo ""
echo "To complete the update, the SQL needs to be executed via Supabase MCP."
