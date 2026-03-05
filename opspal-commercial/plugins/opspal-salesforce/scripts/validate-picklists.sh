#!/bin/bash

# Picklist Validation Script for Salesforce CSV Files
# Validates CSV files against Salesforce record type picklist restrictions

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_ORG="${SF_TARGET_ORG:-example-company-sandbox}"
VALIDATOR_SCRIPT="${PROJECT_ROOT}/mcp-tools/picklist-validator.js"

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS] <csv-file> <object-name>"
    echo ""
    echo "Validates Salesforce CSV files for record type picklist restrictions"
    echo ""
    echo "Arguments:"
    echo "  csv-file      Path to CSV file to validate"
    echo "  object-name   Salesforce object name (e.g., Opportunity, Account)"
    echo ""
    echo "Options:"
    echo "  -o, --org     Salesforce org alias (default: $DEFAULT_ORG)"
    echo "  -h, --help    Display this help message"
    echo ""
    echo "Examples:"
    echo "  $0 opportunities.csv Opportunity"
    echo "  $0 -o myorg accounts.csv Account"
    echo ""
    echo "The script will:"
    echo "  1. Validate picklist values against record type restrictions"
    echo "  2. Generate error report with problematic records"
    echo "  3. Create clean CSV with valid records only"
    echo "  4. Create fixed CSV with suggested record type updates"
    exit 0
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        echo "Please install Node.js: https://nodejs.org/"
        exit 1
    fi
    
    # Check Salesforce CLI
    if ! command -v sf &> /dev/null; then
        echo -e "${RED}❌ Salesforce CLI is not installed${NC}"
        echo "Please install SF CLI: npm install -g @salesforce/cli"
        exit 1
    fi
    
    # Check validator script
    if [[ ! -f "$VALIDATOR_SCRIPT" ]]; then
        echo -e "${RED}❌ Validator script not found at: $VALIDATOR_SCRIPT${NC}"
        echo "Please ensure MCP tools are installed"
        exit 1
    fi
    
    # Check MCP tools dependencies
    if [[ ! -d "${PROJECT_ROOT}/mcp-tools/node_modules" ]]; then
        echo -e "${YELLOW}⚠️  Installing MCP tools dependencies...${NC}"
        cd "${PROJECT_ROOT}/mcp-tools"
        npm install
        cd - > /dev/null
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}"
}

# Parse command line arguments
ORG="$DEFAULT_ORG"

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--org)
            ORG="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        -*)
            echo "Unknown option: $1"
            usage
            ;;
        *)
            break
            ;;
    esac
done

# Check required arguments
if [[ $# -lt 2 ]]; then
    echo -e "${RED}❌ Missing required arguments${NC}"
    usage
fi

CSV_FILE="$1"
OBJECT_NAME="$2"

# Validate inputs
if [[ ! -f "$CSV_FILE" ]]; then
    echo -e "${RED}❌ CSV file not found: $CSV_FILE${NC}"
    exit 1
fi

# Check prerequisites
check_prerequisites

# Check org connection
echo -e "${BLUE}🔗 Checking Salesforce org connection...${NC}"
if ! sf org display --target-org "$ORG" &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to org: $ORG${NC}"
    echo "Please authenticate: sf org login web --alias $ORG"
    exit 1
fi

echo -e "${GREEN}✅ Connected to org: $ORG${NC}"

# Run validation
echo -e "${BLUE}🚀 Running picklist validation...${NC}"
echo ""

# Execute validator
if node "$VALIDATOR_SCRIPT" "$CSV_FILE" "$OBJECT_NAME" "$ORG"; then
    echo ""
    echo -e "${GREEN}✅ Validation completed successfully!${NC}"
    echo -e "${GREEN}   No picklist restriction errors found.${NC}"
    exit 0
else
    EXIT_CODE=$?
    echo ""
    echo -e "${YELLOW}⚠️  Validation completed with errors${NC}"
    echo -e "${YELLOW}   Check the generated files for details:${NC}"
    
    # Show generated files
    BASE_NAME=$(basename "$CSV_FILE" .csv)
    DIR_NAME=$(dirname "$CSV_FILE")
    
    if [[ -f "${DIR_NAME}/${BASE_NAME}-errors.csv" ]]; then
        echo -e "   📁 Error records: ${DIR_NAME}/${BASE_NAME}-errors.csv"
    fi
    
    if [[ -f "${DIR_NAME}/${BASE_NAME}-clean.csv" ]]; then
        echo -e "   📁 Clean records: ${DIR_NAME}/${BASE_NAME}-clean.csv"
    fi
    
    if [[ -f "${DIR_NAME}/${BASE_NAME}-fixed.csv" ]]; then
        echo -e "   📁 Fixed records: ${DIR_NAME}/${BASE_NAME}-fixed.csv"
    fi
    
    echo ""
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo "   1. Review the error records to understand the issues"
    echo "   2. Use the clean CSV for immediate import (valid records only)"
    echo "   3. Use the fixed CSV after reviewing suggested record type changes"
    echo "   4. Or update the record types in Salesforce to allow these values"
    
    exit $EXIT_CODE
fi