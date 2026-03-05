#!/bin/bash

# Claude Code Configuration Optimizer
# Optimizes settings to reduce BashTool pre-flight check delays

SETTINGS_FILE="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
BACKUP_FILE="${SETTINGS_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "=========================================="
echo "Claude Code Configuration Optimizer"
echo "=========================================="
echo ""

# Backup current settings
if [ -f "$SETTINGS_FILE" ]; then
    cp "$SETTINGS_FILE" "$BACKUP_FILE"
    echo "✓ Backed up current settings to: $BACKUP_FILE"
else
    echo "⚠️  Settings file not found: $SETTINGS_FILE"
    exit 1
fi

# Function to count Bash permissions
count_permissions() {
    jq '.permissions.allow | map(select(startswith("Bash"))) | length' "$SETTINGS_FILE"
}

# Function to analyze current configuration
analyze_config() {
    echo ""
    echo "Current Configuration Analysis:"
    echo "-------------------------------"
    
    local bash_count=$(count_permissions)
    echo "Bash command permissions: $bash_count"
    
    local total_allow=$(jq '.permissions.allow | length' "$SETTINGS_FILE")
    echo "Total allow permissions: $total_allow"
    
    local mcp_servers=$(jq '.enabledMcpjsonServers | length' "$SETTINGS_FILE")
    echo "Enabled MCP servers: $mcp_servers"
    
    local additional_dirs=$(jq '.permissions.additionalDirectories | length' "$SETTINGS_FILE")
    echo "Additional directories: $additional_dirs"
    
    echo ""
    if [ "$bash_count" -gt 100 ]; then
        echo "⚠️  High number of Bash permissions detected"
        echo "   This may contribute to slow pre-flight checks"
    fi
    
    if [ "$total_allow" -gt 150 ]; then
        echo "⚠️  Large permission list detected"
        echo "   Consider consolidating permissions using wildcards"
    fi
}

# Function to optimize bash permissions
optimize_bash_permissions() {
    echo ""
    echo "Optimizing Bash permissions..."
    
    # Create optimized permissions list
    # Group similar commands and use wildcards more effectively
    
    # Read current permissions and optimize
    jq '
    .permissions.allow |= (
        # Remove duplicates
        unique |
        # Group common bash commands
        map(
            if startswith("Bash(./scripts/") then
                "Bash(./scripts/*:*)"
            elif startswith("Bash(./deploy") then
                "Bash(./deploy*:*)"
            elif startswith("Bash(export SF_") then
                "Bash(export SF_*)"
            elif startswith("Bash(SF_OAUTH_SERVER_PORT=") then
                "Bash(SF_OAUTH_SERVER_PORT=*)"
            else
                .
            end
        ) |
        # Remove duplicates after grouping
        unique |
        # Sort for consistency
        sort
    )' "$SETTINGS_FILE" > "${SETTINGS_FILE}.optimized"
    
    echo "✓ Created optimized configuration"
    
    # Show reduction
    local original_count=$(jq '.permissions.allow | length' "$SETTINGS_FILE")
    local optimized_count=$(jq '.permissions.allow | length' "${SETTINGS_FILE}.optimized")
    local reduction=$((original_count - optimized_count))
    
    echo "   Original permissions: $original_count"
    echo "   Optimized permissions: $optimized_count"
    echo "   Reduction: $reduction permissions"
}

# Function to add performance settings
add_performance_settings() {
    echo ""
    echo "Adding performance optimization settings..."
    
    # Add performance-related settings
    jq '
    .performance = {
        "bashPreflightTimeout": 3000,
        "bashCommandTimeout": 120000,
        "concurrentBashLimit": 5,
        "apiRetryCount": 3,
        "apiRetryDelay": 1000,
        "cacheEnabled": true,
        "cacheTTL": 300000
    }' "${SETTINGS_FILE}.optimized" > "${SETTINGS_FILE}.perf"
    
    mv "${SETTINGS_FILE}.perf" "${SETTINGS_FILE}.optimized"
    echo "✓ Added performance settings"
}

# Function to validate JSON
validate_json() {
    if jq empty "$1" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to apply optimized configuration
apply_optimization() {
    echo ""
    read -p "Apply optimized configuration? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if validate_json "${SETTINGS_FILE}.optimized"; then
            mv "$SETTINGS_FILE" "${SETTINGS_FILE}.original"
            mv "${SETTINGS_FILE}.optimized" "$SETTINGS_FILE"
            echo "✓ Applied optimized configuration"
            echo "  Original saved as: ${SETTINGS_FILE}.original"
        else
            echo "✗ Optimized configuration has JSON errors. Not applied."
            return 1
        fi
    else
        echo "Optimization not applied. Optimized config saved as: ${SETTINGS_FILE}.optimized"
    fi
}

# Function to revert to backup
revert_config() {
    if [ -f "${SETTINGS_FILE}.original" ]; then
        cp "${SETTINGS_FILE}.original" "$SETTINGS_FILE"
        echo "✓ Reverted to original configuration"
    elif [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$SETTINGS_FILE"
        echo "✓ Reverted to backup configuration"
    else
        echo "✗ No backup found to revert to"
        return 1
    fi
}

# Main execution
case "${1:-optimize}" in
    analyze)
        analyze_config
        ;;
    optimize)
        analyze_config
        optimize_bash_permissions
        add_performance_settings
        apply_optimization
        ;;
    revert)
        revert_config
        ;;
    help|*)
        echo "Usage: $0 {analyze|optimize|revert|help}"
        echo ""
        echo "Commands:"
        echo "  analyze   - Analyze current configuration"
        echo "  optimize  - Optimize configuration (default)"
        echo "  revert    - Revert to original configuration"
        echo "  help      - Show this help message"
        ;;
esac
