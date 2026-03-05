#!/bin/bash

# Strict error handling
set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[AUTOMATION METADATA RETRIEVAL]${NC} $1"
}

# Error handling function
error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

# Check Prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Salesforce CLI
    if ! command -v sf &> /dev/null; then
        error "Salesforce CLI (sf) not installed. Please install Salesforce CLI."
    fi

    # Check authenticated orgs
    org_list=$(sf org list --json | jq -r '.result.nonScratchOrgs[] | select(.isDefaultUsername == true) | .alias')
    if [ -z "$org_list" ]; then
        error "No authenticated Salesforce org found. Please authenticate first using 'sf auth web login'."
    fi

    log "Authenticated org found: ${org_list}"
}

# Main execution
main() {
    clear
    echo "🤖 Salesforce Automation Metadata Retrieval"
    echo "----------------------------------------"

    # Validate prerequisites
    check_prerequisites

    # Set up directories
    base_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
    manifest_dir="${base_dir}/manifest"
    retrieved_dir="${base_dir}/retrieved-metadata"
    reports_dir="${base_dir}/reports/automation-analysis"

    mkdir -p "${manifest_dir}" "${retrieved_dir}" "${reports_dir}"

    # Generate package.xml
    log "Generating automation metadata package..."
    node "${base_dir}/scripts/generate-automation-package.js" || error "Failed to generate package.xml"

    # Retrieve metadata
    log "Retrieving automation metadata..."
    node "${base_dir}/scripts/analyze-automation-metadata.js" || error "Failed to retrieve and analyze metadata"

    # Summary
    log "🎉 Automation Metadata Retrieval Complete!"
    log "Metadata Location: ${retrieved_dir}"
    log "Analysis Reports: ${reports_dir}"
}

# Run main function
main