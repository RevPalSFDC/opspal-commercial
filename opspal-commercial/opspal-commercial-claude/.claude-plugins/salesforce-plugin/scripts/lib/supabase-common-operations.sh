#!/bin/bash

##############################################################################
# Supabase Common Operations - Reference Implementation
#
# Purpose: Demonstrate CORRECT usage patterns for Supabase operations
#
# THIS IS THE RIGHT WAY - Use existing tools, not custom curl commands
#
# Usage:
#   ./supabase-common-operations.sh <operation> [args]
#
# Operations:
#   query-recent              - Get recent reflections
#   query-search <keyword>    - Search reflections
#   query-stats               - Get statistics
#   update-status <id> <status> - Update reflection status
#   submit <json-path>        - Submit new reflection
#
##############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use CLAUDE_PLUGIN_ROOT if available, otherwise calculate
if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
  PLUGIN_ROOT="$CLAUDE_PLUGIN_ROOT"
else
  PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
  cat << EOF
${GREEN}Supabase Common Operations - Reference Implementation${NC}

This script demonstrates the CORRECT way to interact with Supabase.

${YELLOW}Operations:${NC}
  query-recent              Get recent reflections
  query-search <keyword>    Search reflections by keyword
  query-stats               Get reflection statistics
  query-org <org-name>      Get reflections for specific org
  submit <json-path>        Submit new reflection

${YELLOW}Examples:${NC}
  $0 query-recent
  $0 query-search "workflow"
  $0 query-org hivemq
  $0 submit /path/to/reflection.json

${RED}NEVER DO THIS:${NC}
  ❌ curl -X GET "\$SUPABASE_URL/rest/v1/reflections?..."
  ❌ node /tmp/custom-query.js
  ❌ Writing custom Supabase queries from scratch

${GREEN}ALWAYS DO THIS:${NC}
  ✅ Use existing query-reflections.js script
  ✅ Use existing submit-reflection.js script
  ✅ Check CLAUDE.md for schema and available queries
  ✅ Reference this script for examples

EOF
  exit 1
}

# Check if operation is provided
OPERATION="${1:-}"
if [ -z "$OPERATION" ]; then
  usage
fi

# Navigate to plugin root for consistent script paths
cd "$PLUGIN_ROOT"

case "$OPERATION" in
  query-recent)
    echo -e "${GREEN}✅ Using existing query-reflections.js script${NC}"
    echo "Command: node scripts/lib/query-reflections.js recent"
    echo ""
    node scripts/lib/query-reflections.js recent
    ;;

  query-search)
    KEYWORD="${2:-}"
    if [ -z "$KEYWORD" ]; then
      echo -e "${RED}❌ Error: Keyword required${NC}"
      echo "Usage: $0 query-search <keyword>"
      exit 1
    fi
    echo -e "${GREEN}✅ Using existing query-reflections.js script${NC}"
    echo "Command: node scripts/lib/query-reflections.js search \"$KEYWORD\""
    echo ""
    node scripts/lib/query-reflections.js search "$KEYWORD"
    ;;

  query-stats)
    echo -e "${GREEN}✅ Using existing query-reflections.js script${NC}"
    echo "Command: node scripts/lib/query-reflections.js orgStats"
    echo ""
    node scripts/lib/query-reflections.js orgStats
    ;;

  query-org)
    ORG="${2:-}"
    if [ -z "$ORG" ]; then
      echo -e "${RED}❌ Error: Org name required${NC}"
      echo "Usage: $0 query-org <org-name>"
      exit 1
    fi
    echo -e "${GREEN}✅ Using existing query-reflections.js script${NC}"
    echo "Command: node scripts/lib/query-reflections.js myOrg \"$ORG\""
    echo ""
    node scripts/lib/query-reflections.js myOrg "$ORG"
    ;;

  submit)
    JSON_PATH="${2:-}"
    if [ -z "$JSON_PATH" ] || [ ! -f "$JSON_PATH" ]; then
      echo -e "${RED}❌ Error: Valid JSON file path required${NC}"
      echo "Usage: $0 submit <json-path>"
      exit 1
    fi
    echo -e "${GREEN}✅ Using existing submit-reflection.js script${NC}"
    echo "Command: node scripts/lib/submit-reflection.js \"$JSON_PATH\""
    echo ""
    node scripts/lib/submit-reflection.js "$JSON_PATH"
    ;;

  list-queries)
    echo -e "${GREEN}Available Pre-Built Queries:${NC}"
    echo ""
    echo "Standard Queries:"
    echo "  recent       - Last 20 reflections"
    echo "  topIssues    - Most common issue types"
    echo "  orgStats     - Statistics by org"
    echo "  priorityTrend - Priority trends (3 months)"
    echo "  topROI       - Top 10 by ROI"
    echo "  totalROI     - Total ROI impact"
    echo "  recentIssues - Recent P0/P1 issues"
    echo ""
    echo "Workflow Queries:"
    echo "  triage       - New reflections needing review"
    echo "  backlog      - Accepted reflections pending implementation"
    echo "  status       - Implementation status summary"
    echo ""
    echo "Parameterized Queries:"
    echo "  search <keyword>  - Full-text search"
    echo "  myOrg <org-name>  - Reflections for specific org"
    echo "  detail <id>       - Full details for reflection"
    echo ""
    echo "Usage: node scripts/lib/query-reflections.js <query-name> [param]"
    ;;

  schema)
    echo -e "${GREEN}Supabase Reflections Table Schema:${NC}"
    echo ""
    echo "Column Name            Type        Description"
    echo "─────────────────────  ──────────  ────────────────────────────────"
    echo "id                     UUID        Primary key"
    echo "created_at             timestamp   When reflection was created"
    echo "user_email             text        User who submitted"
    echo "org                    text        Salesforce org name"
    echo "focus_area             text        Session focus"
    echo "outcome                text        Session outcome"
    echo "duration_minutes       integer     Session length"
    echo "total_issues           integer     Issues identified"
    echo "priority_issues        jsonb       High-priority issues"
    echo "roi_annual_value       numeric     Estimated annual ROI"
    echo "reflection_status      text        Workflow status (NOT 'status'!)"
    echo "data                   jsonb       Full reflection JSON"
    echo "search_vector          tsvector    Full-text search index"
    echo "asana_project_id       text        Linked Asana project"
    echo "asana_task_id          text        Linked Asana task"
    echo "asana_task_url         text        Asana task URL"
    echo "reviewed_at            timestamp   When reviewed"
    echo "reviewed_by            text        Who reviewed"
    echo "rejection_reason       text        Why rejected (if applicable)"
    echo "implementation_notes   text        Implementation notes"
    echo ""
    echo -e "${YELLOW}⚠️  Common Mistakes:${NC}"
    echo "  ❌ Using 'submitted_at' - Column doesn't exist! Use 'created_at'"
    echo "  ❌ Using 'status' - Column doesn't exist! Use 'reflection_status'"
    echo ""
    ;;

  help|--help|-h)
    usage
    ;;

  *)
    echo -e "${RED}❌ Unknown operation: $OPERATION${NC}"
    echo ""
    usage
    ;;
esac

exit 0
