#!/bin/bash

##############################################################################
# Setup Monitoring Cron Jobs
# 
# Configures cron jobs for all Salesforce monitoring scripts based on the
# monitoring configuration file. Creates a unified monitoring schedule.
#
# Usage:
#   ./setup-monitoring-crons.sh [--org <alias>] [--config-file <path>] [--dry-run] [--remove]
#
# Options:
#   --org <alias>           Override default org alias
#   --config-file <path>    Path to monitoring config file
#   --dry-run               Show what would be configured without making changes
#   --remove                Remove existing monitoring cron jobs
#   --install-deps          Install required dependencies (jq, mailutils)
##############################################################################

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/monitoring-config.json"
CRONTAB_BACKUP="${SCRIPT_DIR}/crontab-backup-$(date +%Y%m%d-%H%M%S)"
CRON_COMMENT="# Salesforce Monitoring Scripts"

# Default values
ORG_ALIAS=""
DRY_RUN=false
REMOVE_CRONS=false
INSTALL_DEPS=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

##############################################################################
# Utility Functions
##############################################################################

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "${level}" in
        "ERROR")
            echo -e "${RED}[${timestamp}] [ERROR] ${message}${NC}" >&2
            ;;
        "WARN")
            echo -e "${YELLOW}[${timestamp}] [WARN] ${message}${NC}"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[${timestamp}] [SUCCESS] ${message}${NC}"
            ;;
        "INFO")
            echo -e "${BLUE}[${timestamp}] [INFO] ${message}${NC}"
            ;;
        *)
            echo "[${timestamp}] ${message}"
            ;;
    esac
}

check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    local missing_deps=()
    
    # Check for required commands
    if ! command -v sf &> /dev/null; then
        missing_deps+=("salesforce-cli")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if ! command -v crontab &> /dev/null; then
        missing_deps+=("cron")
    fi
    
    if ! command -v node &> /dev/null; then
        missing_deps+=("nodejs")
    fi
    
    # Check optional dependencies
    if ! command -v mailx &> /dev/null && ! command -v mail &> /dev/null; then
        log "WARN" "Email utilities (mailx/mail) not found - email alerts will be disabled"
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log "ERROR" "Missing required dependencies: ${missing_deps[*]}"
        log "INFO" "Install missing dependencies or use --install-deps flag"
        return 1
    fi
    
    log "SUCCESS" "All required dependencies found"
    return 0
}

install_dependencies() {
    log "INFO" "Installing required dependencies..."
    
    # Detect package manager
    if command -v apt-get &> /dev/null; then
        log "INFO" "Using apt-get package manager"
        sudo apt-get update
        sudo apt-get install -y jq cron mailutils nodejs npm
    elif command -v yum &> /dev/null; then
        log "INFO" "Using yum package manager"
        sudo yum update -y
        sudo yum install -y jq cronie mailx nodejs npm
    elif command -v brew &> /dev/null; then
        log "INFO" "Using Homebrew package manager"
        brew install jq mailutils node
    else
        log "ERROR" "No supported package manager found (apt-get, yum, brew)"
        log "INFO" "Please install dependencies manually: jq, cron, mailutils, nodejs, npm"
        return 1
    fi
    
    # Install Salesforce CLI if not present
    if ! command -v sf &> /dev/null; then
        log "INFO" "Installing Salesforce CLI..."
        npm install -g @salesforce/cli
    fi
    
    log "SUCCESS" "Dependencies installed successfully"
}

load_config() {
    if [[ ! -f "${CONFIG_FILE}" ]]; then
        log "ERROR" "Configuration file not found: ${CONFIG_FILE}"
        return 1
    fi
    
    if ! jq empty "${CONFIG_FILE}" >/dev/null 2>&1; then
        log "ERROR" "Invalid JSON in configuration file: ${CONFIG_FILE}"
        return 1
    fi
    
    log "INFO" "Configuration loaded from: ${CONFIG_FILE}"
}

get_default_org() {
    jq -r '.monitoring.defaultOrg // "production"' "${CONFIG_FILE}"
}

get_enabled_schedules() {
    jq -r '.monitoring.schedules | to_entries[] | select(.value.enabled == true) | .key' "${CONFIG_FILE}"
}

get_schedule_config() {
    local schedule_name="$1"
    jq -r ".monitoring.schedules.${schedule_name}" "${CONFIG_FILE}"
}

##############################################################################
# Cron Management Functions
##############################################################################

backup_crontab() {
    log "INFO" "Backing up current crontab to ${CRONTAB_BACKUP}"
    crontab -l > "${CRONTAB_BACKUP}" 2>/dev/null || true
}

remove_monitoring_crons() {
    log "INFO" "Removing existing monitoring cron jobs..."
    
    # Get current crontab without monitoring entries
    crontab -l 2>/dev/null | grep -v "${CRON_COMMENT}" | grep -v "scripts/monitoring/" > ${TEMP_DIR:-/tmp} || true
    
    # Install cleaned crontab
    crontab ${TEMP_DIR:-/tmp}
    rm -f ${TEMP_DIR:-/tmp}
    
    log "SUCCESS" "Monitoring cron jobs removed"
}

generate_cron_entry() {
    local schedule_name="$1"
    local org_alias="$2"
    
    local schedule_config
    schedule_config=$(get_schedule_config "${schedule_name}")
    
    local cron_schedule
    local script_name
    local description
    local options_json
    
    cron_schedule=$(echo "${schedule_config}" | jq -r '.cron')
    script_name=$(echo "${schedule_config}" | jq -r '.script')
    description=$(echo "${schedule_config}" | jq -r '.description')
    options_json=$(echo "${schedule_config}" | jq -r '.options // {}')
    
    # Build command arguments from options
    local cmd_args="--org ${org_alias}"
    
    # Parse options and convert to command line arguments
    while IFS= read -r option; do
        local key value
        key=$(echo "${option}" | cut -d'=' -f1)
        value=$(echo "${option}" | cut -d'=' -f2-)
        
        if [[ "${key}" != "null" ]] && [[ "${value}" != "null" ]]; then
            cmd_args+=" --${key} ${value}"
        fi
    done <<< "$(echo "${options_json}" | jq -r 'to_entries[] | "\(.key)=\(.value)"')"
    
    # Determine script path and execution method
    local script_path="${SCRIPT_DIR}/${script_name}"
    local exec_cmd
    
    if [[ "${script_name}" == *.sh ]]; then
        exec_cmd="${script_path} ${cmd_args}"
    else
        exec_cmd="node ${script_path} ${cmd_args}"
    fi
    
    # Generate cron entry with error logging
    local log_file="${SCRIPT_DIR}/../../reports/cron-$(basename "${script_name}" .js .sh).log"
    local cron_entry="${cron_schedule} cd ${PROJECT_ROOT} && ${exec_cmd} >> ${log_file} 2>&1"
    
    echo "# ${description}"
    echo "${cron_entry}"
    echo ""
}

install_monitoring_crons() {
    local org_alias="$1"
    
    log "INFO" "Installing monitoring cron jobs for org: ${org_alias}"
    
    # Generate new cron entries
    local temp_cron_file="${TEMP_DIR:-/tmp}"
    
    # Add header
    echo "${CRON_COMMENT}" > "${temp_cron_file}"
    echo "# Generated on $(date) for org: ${org_alias}" >> "${temp_cron_file}"
    echo "" >> "${temp_cron_file}"
    
    # Process each enabled schedule
    while IFS= read -r schedule_name; do
        [[ -z "${schedule_name}" ]] && continue
        
        log "INFO" "Configuring schedule: ${schedule_name}"
        generate_cron_entry "${schedule_name}" "${org_alias}" >> "${temp_cron_file}"
    done <<< "$(get_enabled_schedules)"
    
    # Get existing crontab (without monitoring entries)
    local existing_cron="${TEMP_DIR:-/tmp}"
    crontab -l 2>/dev/null | grep -v "${CRON_COMMENT}" | grep -v "scripts/monitoring/" > "${existing_cron}" || true
    
    # Combine existing and new cron entries
    local new_crontab="${TEMP_DIR:-/tmp}"
    cat "${existing_cron}" "${temp_cron_file}" > "${new_crontab}"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "DRY RUN - Would install the following cron jobs:"
        echo "========================================"
        cat "${temp_cron_file}"
        echo "========================================"
    else
        # Install new crontab
        crontab "${new_crontab}"
        log "SUCCESS" "Monitoring cron jobs installed successfully"
    fi
    
    # Cleanup temp files
    rm -f "${temp_cron_file}" "${existing_cron}" "${new_crontab}"
}

verify_cron_installation() {
    local org_alias="$1"
    
    log "INFO" "Verifying cron installation..."
    
    local monitoring_entries
    monitoring_entries=$(crontab -l 2>/dev/null | grep -c "scripts/monitoring/" || true)
    
    if [[ "${monitoring_entries}" -gt 0 ]]; then
        log "SUCCESS" "${monitoring_entries} monitoring cron jobs found"
        
        log "INFO" "Installed monitoring schedules:"
        crontab -l 2>/dev/null | grep "scripts/monitoring/" | while read -r line; do
            echo "  ${line}"
        done
    else
        log "WARN" "No monitoring cron jobs found"
    fi
    
    # Check cron service status
    if systemctl is-active --quiet cron || systemctl is-active --quiet crond; then
        log "SUCCESS" "Cron service is running"
    else
        log "WARN" "Cron service may not be running"
        log "INFO" "Start cron service with: sudo systemctl start cron (or crond)"
    fi
}

setup_log_rotation() {
    log "INFO" "Setting up log rotation for monitoring logs..."
    
    local logrotate_config="/etc/logrotate.d/salesforce-monitoring"
    local log_pattern="${PROJECT_ROOT}/reports/**/*.log"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "INFO" "DRY RUN - Would create logrotate config: ${logrotate_config}"
        return
    fi
    
    # Create logrotate configuration
    sudo tee "${logrotate_config}" > /dev/null << EOF
${log_pattern} {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    create 644 $(whoami) $(whoami)
}
EOF
    
    log "SUCCESS" "Log rotation configured: ${logrotate_config}"
}

##############################################################################
# Main Functions
##############################################################################

show_usage() {
    cat << EOF
Salesforce Monitoring Cron Setup

Configures cron jobs for automated Salesforce monitoring based on configuration.

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --org <alias>           Override default org alias from config
    --config-file <path>    Path to monitoring configuration file
    --dry-run               Show what would be configured without making changes
    --remove                Remove existing monitoring cron jobs
    --install-deps          Install required dependencies
    --help                  Show this help message

EXAMPLES:
    # Setup monitoring for production org
    $0 --org production
    
    # Preview what would be installed
    $0 --org sandbox --dry-run
    
    # Remove all monitoring crons
    $0 --remove
    
    # Install dependencies and setup monitoring
    $0 --install-deps --org production

SCHEDULES CONFIGURED:
    - Daily Flow Complexity Audit (2 AM)
    - Weekly Flow Consolidation Check (Sunday 6 AM)
    - Daily Validation Rule Monitor (7 AM)
    - Daily System Health Dashboard (8 AM)

DEPENDENCIES:
    - Salesforce CLI (sf)
    - jq (JSON processor)
    - cron (task scheduler)
    - Node.js (JavaScript runtime)
    - mailutils (optional - for email alerts)

CONFIGURATION:
    Edit ${CONFIG_FILE} to customize schedules, thresholds, and alert settings.

EOF
}

main() {
    log "INFO" "Starting Salesforce Monitoring Cron Setup"
    
    # Install dependencies if requested
    if [[ "${INSTALL_DEPS}" == "true" ]]; then
        install_dependencies
    fi
    
    # Check dependencies
    if ! check_dependencies; then
        log "ERROR" "Dependency check failed. Use --install-deps to install missing packages."
        exit 1
    fi
    
    # Load configuration
    load_config
    
    # Determine org alias
    if [[ -z "${ORG_ALIAS}" ]]; then
        ORG_ALIAS=$(get_default_org)
        log "INFO" "Using default org from config: ${ORG_ALIAS}"
    else
        log "INFO" "Using specified org: ${ORG_ALIAS}"
    fi
    
    # Backup current crontab
    backup_crontab
    
    # Remove existing monitoring crons if requested
    if [[ "${REMOVE_CRONS}" == "true" ]]; then
        remove_monitoring_crons
        log "SUCCESS" "Monitoring cron jobs removed successfully"
        return 0
    fi
    
    # Remove and reinstall monitoring crons
    remove_monitoring_crons
    install_monitoring_crons "${ORG_ALIAS}"
    
    # Setup log rotation
    setup_log_rotation
    
    # Verify installation
    if [[ "${DRY_RUN}" != "true" ]]; then
        verify_cron_installation "${ORG_ALIAS}"
    fi
    
    # Final instructions
    log "SUCCESS" "Monitoring cron setup completed!"
    echo ""
    log "INFO" "NEXT STEPS:"
    log "INFO" "1. Verify cron entries: crontab -l"
    log "INFO" "2. Check cron service: systemctl status cron"
    log "INFO" "3. Monitor log files in: ${PROJECT_ROOT}/reports/"
    log "INFO" "4. Test scripts manually before relying on cron"
    log "INFO" "5. Configure email settings in monitoring-config.json"
    echo ""
    log "INFO" "Crontab backup saved to: ${CRONTAB_BACKUP}"
}

##############################################################################
# CLI Argument Parsing
##############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --org)
            ORG_ALIAS="$2"
            shift 2
            ;;
        --config-file)
            CONFIG_FILE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --remove)
            REMOVE_CRONS=true
            shift
            ;;
        --install-deps)
            INSTALL_DEPS=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log "ERROR" "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Execute main function
main "$@"