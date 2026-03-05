#!/bin/bash

# Phased Deployment Wrapper Script
# Simplifies the use of phased-deployment.js for common scenarios

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PHASED_DEPLOY="$SCRIPT_DIR/lib/phased-deployment.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function show_help() {
    echo "Phased Deployment Wrapper"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  object-with-perms <object_name> <org>  Deploy object with permission sets"
    echo "  from-config <config_file> <org>        Deploy using config file"
    echo "  validate <config_file> <org>           Validate deployment (dry run)"
    echo ""
    echo "Options:"
    echo "  --verbose    Show detailed output"
    echo "  --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 object-with-perms NPS_Score__c sample-org-uat"
    echo "  $0 from-config deploy-config.json myorg --verbose"
    echo "  $0 validate deploy-config.json myorg"
}

function deploy_object_with_perms() {
    local OBJECT_NAME=$1
    local ORG_ALIAS=$2
    local VERBOSE_FLAG=""

    if [[ "$3" == "--verbose" ]]; then
        VERBOSE_FLAG="--verbose"
    fi

    echo -e "${GREEN}Deploying ${OBJECT_NAME} with permission sets to ${ORG_ALIAS}${NC}"

    # Create temporary config
    TEMP_CONFIG="${TEMP_DIR:-/tmp}}-$$.json"
    cat > "$TEMP_CONFIG" <<EOF
{
  "description": "Deploy ${OBJECT_NAME} with permission sets",
  "objects": [
    "force-app/main/default/objects/${OBJECT_NAME}"
  ],
  "permissionSets": [
    "force-app/main/default/permissionsets"
  ],
  "dependentMetadata": [],
  "verifyObjects": [
    {
      "name": "${OBJECT_NAME}",
      "fields": ["Id", "Name"]
    }
  ],
  "rollbackOnFailure": false,
  "phasePause": 5000,
  "retryAttempts": 3
}
EOF

    # Run deployment
    node "$PHASED_DEPLOY" --config "$TEMP_CONFIG" --org "$ORG_ALIAS" $VERBOSE_FLAG

    # Cleanup
    rm -f "$TEMP_CONFIG"
}

function deploy_from_config() {
    local CONFIG_FILE=$1
    local ORG_ALIAS=$2
    local VERBOSE_FLAG=""

    if [[ "$3" == "--verbose" ]]; then
        VERBOSE_FLAG="--verbose"
    fi

    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
        exit 1
    fi

    echo -e "${GREEN}Deploying from config: ${CONFIG_FILE} to ${ORG_ALIAS}${NC}"

    node "$PHASED_DEPLOY" --config "$CONFIG_FILE" --org "$ORG_ALIAS" $VERBOSE_FLAG
}

function validate_deployment() {
    local CONFIG_FILE=$1
    local ORG_ALIAS=$2

    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Validating deployment (dry run) for ${ORG_ALIAS}${NC}"

    node "$PHASED_DEPLOY" --config "$CONFIG_FILE" --org "$ORG_ALIAS" --dry-run --verbose
}

# Main script logic
if [[ $# -eq 0 ]] || [[ "$1" == "--help" ]]; then
    show_help
    exit 0
fi

COMMAND=$1
shift

case "$COMMAND" in
    object-with-perms)
        if [[ $# -lt 2 ]]; then
            echo -e "${RED}Error: object-with-perms requires <object_name> and <org>${NC}"
            show_help
            exit 1
        fi
        deploy_object_with_perms "$@"
        ;;
    from-config)
        if [[ $# -lt 2 ]]; then
            echo -e "${RED}Error: from-config requires <config_file> and <org>${NC}"
            show_help
            exit 1
        fi
        deploy_from_config "$@"
        ;;
    validate)
        if [[ $# -lt 2 ]]; then
            echo -e "${RED}Error: validate requires <config_file> and <org>${NC}"
            show_help
            exit 1
        fi
        validate_deployment "$@"
        ;;
    *)
        echo -e "${RED}Error: Unknown command: $COMMAND${NC}"
        show_help
        exit 1
        ;;
esac