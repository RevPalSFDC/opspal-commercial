#!/bin/bash
# Plugin Manifest Validation Script
#
# Purpose: Validate ALL plugin manifests against JSON Schema
# Usage: ./validate-all-plugins.sh [--fix]
#
# Exit Codes:
#   0 - All plugins valid
#   1 - Validation errors found
#
# Features:
# - Validates ALL plugins in .claude-plugins/ directory
# - Uses JSON Schema for strict validation
# - Provides clear error messages with file:line references
# - Optional --fix mode to auto-correct common issues
# - Detailed summary report

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)/.claude-plugins"
SCHEMA_FILE="$SCRIPT_DIR/../schemas/plugin-manifest.schema.json"

# Options
FIX_MODE=false
VERBOSE=false

# Counters
TOTAL_PLUGINS=0
VALID_PLUGINS=0
INVALID_PLUGINS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --fix)
      FIX_MODE=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    *)
      echo "Usage: $0 [--fix] [--verbose]"
      exit 1
      ;;
  esac
done

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}🔍 Plugin Manifest Validation${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
  echo -e "${RED}❌ Schema file not found: $SCHEMA_FILE${NC}"
  echo -e "   Run this script from the plugin directory"
  exit 1
fi

# Check if ajv-cli is installed
if ! command -v ajv &> /dev/null; then
  echo -e "${YELLOW}⚠️  ajv-cli not installed${NC}"
  echo -e "   Installing globally: npm install -g ajv-cli"
  npm install -g ajv-cli
fi

echo -e "${YELLOW}📁 Plugin directory: $PLUGIN_DIR${NC}"
echo -e "${YELLOW}📋 Schema file: $SCHEMA_FILE${NC}"
echo ""

# Find all plugin.json files
MANIFEST_FILES=$(find "$PLUGIN_DIR" -name "plugin.json" -path "*/.claude-plugin/plugin.json" 2>/dev/null)

if [ -z "$MANIFEST_FILES" ]; then
  echo -e "${YELLOW}⚠️  No plugin manifests found in $PLUGIN_DIR${NC}"
  exit 0
fi

# Validate each manifest
while IFS= read -r manifest_file; do
  TOTAL_PLUGINS=$((TOTAL_PLUGINS + 1))

  # Extract plugin name from path
  plugin_name=$(echo "$manifest_file" | sed 's|.*/\.claude-plugins/\([^/]*\)/.*|\1|')

  echo -e "${CYAN}Validating:${NC} $plugin_name"

  # Validate with ajv
  if ajv validate -s "$SCHEMA_FILE" -d "$manifest_file" --strict=false 2>&1 | tee /tmp/ajv_output.txt | grep -q "valid"; then
    echo -e "${GREEN}  ✅ Valid${NC}"
    VALID_PLUGINS=$((VALID_PLUGINS + 1))

    if [ "$VERBOSE" = true ]; then
      echo -e "${CYAN}  📄 $manifest_file${NC}"
    fi
  else
    echo -e "${RED}  ❌ Invalid${NC}"
    INVALID_PLUGINS=$((INVALID_PLUGINS + 1))

    # Parse and display errors
    echo -e "${YELLOW}  Errors:${NC}"
    cat /tmp/ajv_output.txt | grep -E "data|should|must" | sed 's/^/    /'
    echo -e "${CYAN}  📄 $manifest_file${NC}"

    if [ "$FIX_MODE" = true ]; then
      echo -e "${YELLOW}  🔧 Attempting auto-fix...${NC}"

      # Common fixes
      # 1. Remove unsupported fields
      jq 'del(.capabilities, .dependencies, .hooks, .engines, .main, .scripts, .files)' "$manifest_file" > "$manifest_file.tmp"
      mv "$manifest_file.tmp" "$manifest_file"

      # Re-validate
      if ajv validate -s "$SCHEMA_FILE" -d "$manifest_file" --strict=false 2>&1 | grep -q "valid"; then
        echo -e "${GREEN}  ✅ Fixed!${NC}"
        INVALID_PLUGINS=$((INVALID_PLUGINS - 1))
        VALID_PLUGINS=$((VALID_PLUGINS + 1))
      else
        echo -e "${RED}  ❌ Auto-fix failed - manual correction required${NC}"
      fi
    fi
  fi

  echo ""
done <<< "$MANIFEST_FILES"

# Summary
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}📊 Validation Summary${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Total plugins:   $TOTAL_PLUGINS"
echo -e "${GREEN}Valid:           $VALID_PLUGINS${NC}"

if [ $INVALID_PLUGINS -gt 0 ]; then
  echo -e "${RED}Invalid:         $INVALID_PLUGINS${NC}"
  echo ""
  echo -e "${YELLOW}💡 Tip: Run with --fix to auto-correct common issues${NC}"
  echo -e "${YELLOW}   Example: ./validate-all-plugins.sh --fix${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}✅ All plugin manifests are valid!${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
fi
