#!/bin/bash

# Tool Availability Checker for Salesforce Agents
# Verifies required tools are available and provides fallback mechanisms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Tool definitions
declare -A REQUIRED_TOOLS=(
    ["composite-api.js"]="$SCRIPT_DIR/lib/composite-api.js"
    ["bulk-api-handler.js"]="$SCRIPT_DIR/lib/bulk-api-handler.js"
    ["factmap-parser.js"]="$SCRIPT_DIR/lib/factmap-parser.js"
    ["query-monitor.js"]="$SCRIPT_DIR/monitoring/query-monitor.js"
    ["metadata-validator.js"]="$SCRIPT_DIR/lib/metadata-validator.js"
    ["template-generator.js"]="$SCRIPT_DIR/lib/template-generator.js"
)

declare -A OPTIONAL_TOOLS=(
    ["dashboard-refresh-system.js"]="$SCRIPT_DIR/dashboard-refresh-system.js"
    ["report-migration-tool.sh"]="$SCRIPT_DIR/report-migration-tool.sh"
    ["report-dashboard-semantic-diff.js"]="$SCRIPT_DIR/lib/report-dashboard-semantic-diff.js"
    ["import-pipeline-test.sh"]="$SCRIPT_DIR/import-pipeline-test.sh"
)

declare -A SHELL_LIBS=(
    ["shell-commons.sh"]="$SCRIPT_DIR/lib/shell-commons.sh"
    ["salesforce-deployment-utils.sh"]="$SCRIPT_DIR/lib/salesforce-deployment-utils.sh"
    ["validation-commons.sh"]="$SCRIPT_DIR/lib/validation-commons.sh"
)

# Check tool availability
check_tool() {
    local tool_name="$1"
    local tool_path="$2"
    local required="${3:-true}"
    
    if [ -f "$tool_path" ]; then
        echo "✅ $tool_name: Available"
        return 0
    else
        if [ "$required" = "true" ]; then
            echo "❌ $tool_name: MISSING (Required)"
        else
            echo "⚠️  $tool_name: Missing (Optional)"
        fi
        return 1
    fi
}

# Check npm dependencies
check_npm_deps() {
    local deps_needed=false
    
    echo "Checking npm dependencies..."
    
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo "❌ node_modules directory not found"
        deps_needed=true
    fi
    
    # Check specific packages
    local packages=("xml2js")
    for pkg in "${packages[@]}"; do
        if [ ! -d "$PROJECT_ROOT/node_modules/$pkg" ]; then
            echo "❌ Missing npm package: $pkg"
            deps_needed=true
        else
            echo "✅ npm package: $pkg"
        fi
    done
    
    if [ "$deps_needed" = "true" ]; then
        echo ""
        echo "Install missing dependencies with:"
        echo "  cd $PROJECT_ROOT && npm install xml2js"
        return 1
    fi
    
    return 0
}

# Create symlinks for instance access
create_instance_symlinks() {
    local instance_dir="$1"
    
    if [ ! -d "$instance_dir" ]; then
        echo "Instance directory not found: $instance_dir"
        return 1
    fi
    
    echo "Creating symlinks for instance: $instance_dir"
    
    # Create scripts/lib directory in instance
    mkdir -p "$instance_dir/scripts/lib"
    
    # Link essential tools
    for tool_name in "${!REQUIRED_TOOLS[@]}"; do
        local tool_path="${REQUIRED_TOOLS[$tool_name]}"
        local link_path="$instance_dir/scripts/lib/$(basename "$tool_path")"
        
        if [ -f "$tool_path" ] && [ ! -e "$link_path" ]; then
            ln -s "$tool_path" "$link_path"
            echo "  Linked: $(basename "$tool_path")"
        fi
    done
    
    echo "✅ Symlinks created for instance"
}

# Generate capability report
generate_capability_report() {
    local report_file="${1:-tool-capability-report.json}"
    
    echo "Generating capability report..."
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "project_root": "$PROJECT_ROOT",
  "capabilities": {
EOF
    
    # Check required tools
    local first=true
    for tool_name in "${!REQUIRED_TOOLS[@]}"; do
        local tool_path="${REQUIRED_TOOLS[$tool_name]}"
        local available="false"
        [ -f "$tool_path" ] && available="true"
        
        [ "$first" = "false" ] && echo "," >> "$report_file"
        echo -n "    \"$tool_name\": {
      \"path\": \"$tool_path\",
      \"available\": $available,
      \"required\": true
    }" >> "$report_file"
        first=false
    done
    
    # Check optional tools
    for tool_name in "${!OPTIONAL_TOOLS[@]}"; do
        local tool_path="${OPTIONAL_TOOLS[$tool_name]}"
        local available="false"
        [ -f "$tool_path" ] && available="true"
        
        echo "," >> "$report_file"
        echo -n "    \"$tool_name\": {
      \"path\": \"$tool_path\",
      \"available\": $available,
      \"required\": false
    }" >> "$report_file"
    done
    
    cat >> "$report_file" << EOF

  },
  "fallback_strategies": {
    "composite-api.js": "Use individual API calls instead of batching",
    "bulk-api-handler.js": "Use standard data loader or SF CLI commands",
    "query-monitor.js": "Skip performance monitoring, use basic queries",
    "metadata-validator.js": "Manual validation or skip pre-checks",
    "template-generator.js": "Use manual XML creation"
  }
}
EOF
    
    echo "✅ Report generated: $report_file"
}

# Provide fallback commands
suggest_fallbacks() {
    echo ""
    echo "=== FALLBACK STRATEGIES ==="
    echo ""
    
    if [ ! -f "${REQUIRED_TOOLS['composite-api.js']}" ]; then
        echo "Without composite-api.js:"
        echo "  Use: sf data create/update record (individual operations)"
        echo ""
    fi
    
    if [ ! -f "${REQUIRED_TOOLS['bulk-api-handler.js']}" ]; then
        echo "Without bulk-api-handler.js:"
        echo "  Use: sf data import tree or sf data upsert bulk"
        echo ""
    fi
    
    if [ ! -f "${REQUIRED_TOOLS['query-monitor.js']}" ]; then
        echo "Without query-monitor.js:"
        echo "  Use: sf data query without performance monitoring"
        echo ""
    fi
}

# Main execution
main() {
    local mode="${1:-check}"
    local target="${2:-}"
    
    echo "=== TOOL AVAILABILITY CHECKER ==="
    echo ""
    
    case "$mode" in
        check)
            echo "Required Tools:"
            local required_missing=0
            for tool_name in "${!REQUIRED_TOOLS[@]}"; do
                check_tool "$tool_name" "${REQUIRED_TOOLS[$tool_name]}" true || ((required_missing++))
            done
            
            echo ""
            echo "Optional Tools:"
            for tool_name in "${!OPTIONAL_TOOLS[@]}"; do
                check_tool "$tool_name" "${OPTIONAL_TOOLS[$tool_name]}" false
            done
            
            echo ""
            echo "Shell Libraries:"
            for lib_name in "${!SHELL_LIBS[@]}"; do
                check_tool "$lib_name" "${SHELL_LIBS[$lib_name]}" true || ((required_missing++))
            done
            
            echo ""
            check_npm_deps
            
            if [ $required_missing -gt 0 ]; then
                echo ""
                echo "⚠️  $required_missing required tools are missing"
                suggest_fallbacks
                exit 1
            else
                echo ""
                echo "✅ All required tools are available"
                exit 0
            fi
            ;;
        
        symlink)
            if [ -z "$target" ]; then
                echo "Usage: $0 symlink <instance_directory>"
                exit 1
            fi
            create_instance_symlinks "$target"
            ;;
        
        report)
            generate_capability_report "${target:-tool-capability-report.json}"
            ;;
        
        install-missing)
            echo "Installing missing tools..."
            
            # Install npm dependencies if needed
            if [ ! -d "$PROJECT_ROOT/node_modules/xml2js" ]; then
                echo "Installing npm dependencies..."
                cd "$PROJECT_ROOT"
                npm install xml2js --save
            fi
            
            echo "✅ Installation complete"
            ;;
        
        help|--help|-h)
            cat << HELP
Tool Availability Checker

Usage: $0 [mode] [target]

Modes:
  check           - Check tool availability (default)
  symlink <dir>   - Create symlinks in instance directory
  report [file]   - Generate capability report
  install-missing - Install missing dependencies
  help           - Show this help message

Examples:
  $0 check
  $0 symlink ./instances/myinstance
  $0 report capability.json

HELP
            exit 0
            ;;
        
        *)
            echo "Unknown mode: $mode"
            echo "Run '$0 help' for usage"
            exit 1
            ;;
    esac
}

main "$@"
