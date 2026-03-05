#!/bin/bash

##############################################################################
# Picklist Dependency Creation CLI Wrapper
# =========================================
#
# Simple command-line interface for creating picklist field dependencies.
#
# Usage:
#   ./scripts/cli/create-dependency.sh [options]
#
# Options:
#   -o, --org <alias>          Salesforce org alias (required)
#   -O, --object <name>        Object API name (required)
#   -c, --controlling <field>  Controlling field API name (required)
#   -d, --dependent <field>    Dependent field API name (required)
#   -m, --matrix <json>        Dependency matrix JSON (required)
#   -r, --record-types <list>  Comma-separated record types or 'all' (default: all)
#   --create-gvs               Create Global Value Sets
#   --gvs-controlling <name>   Controlling field GVS name
#   --gvs-dependent <name>     Dependent field GVS name
#   --dry-run                  Validate only, don't deploy
#   --interactive              Interactive mode with prompts
#   --help                     Show this help message
#
# Examples:
#   # Interactive mode
#   ./scripts/cli/create-dependency.sh --interactive
#
#   # Create simple dependency
#   ./scripts/cli/create-dependency.sh \
#     --org myorg \
#     --object Account \
#     --controlling Industry \
#     --dependent Account_Type__c \
#     --matrix '{"Technology":["SaaS","Hardware"],"Finance":["Banking"]}'
#
#   # Dry run (validation only)
#   ./scripts/cli/create-dependency.sh \
#     --org myorg \
#     --object Account \
#     --controlling Industry \
#     --dependent Account_Type__c \
#     --matrix '{"Technology":["SaaS"]}' \
#     --dry-run
#
##############################################################################

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOW_SCRIPT="${SCRIPT_DIR}/../examples/create-picklist-dependency-workflow.js"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Node.js script exists
if [ ! -f "$WORKFLOW_SCRIPT" ]; then
    echo -e "${RED}❌ Error: Workflow script not found at ${WORKFLOW_SCRIPT}${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js not found. Please install Node.js.${NC}"
    exit 1
fi

# Parse arguments and pass to Node.js script
node "$WORKFLOW_SCRIPT" "$@"
