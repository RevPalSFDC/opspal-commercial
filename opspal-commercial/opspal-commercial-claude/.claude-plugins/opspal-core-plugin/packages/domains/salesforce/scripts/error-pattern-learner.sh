#!/bin/bash

set -Eeuo pipefail
IFS=$'\n\t'

on_err() { echo "[ERROR] ${BASH_SOURCE[0]}:${2:-?} exit ${1:-?}" >&2; }
trap 'on_err $? $LINENO' ERR
trap 'true' EXIT

# Error Pattern Learning System for Salesforce
# Tracks errors, identifies patterns, and suggests automated fixes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ERROR_DB="$PROJECT_ROOT/data/error-patterns.db"
PATTERNS_DIR="$PROJECT_ROOT/data/error-patterns"
FIXES_DIR="$PROJECT_ROOT/data/auto-fixes"
LOG_FILE="$PROJECT_ROOT/logs/error-learner.log"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$PATTERNS_DIR" "$FIXES_DIR" "$(dirname "$LOG_FILE")"

# Initialize SQLite database
init_database() {
    if [ ! -f "$ERROR_DB" ]; then
        echo -e "${BLUE}Initializing error pattern database...${NC}"
        
        sqlite3 "$ERROR_DB" << 'SQL'
CREATE TABLE IF NOT EXISTS error_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_code TEXT NOT NULL,
    error_message TEXT,
    object_name TEXT,
    field_name TEXT,
    operation TEXT,
    occurrence_count INTEGER DEFAULT 1,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    fix_applied TEXT,
    fix_success_rate REAL DEFAULT 0,
    pattern_hash TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS error_fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id INTEGER,
    fix_type TEXT,
    fix_command TEXT,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pattern_id) REFERENCES error_patterns (id)
);

CREATE TABLE IF NOT EXISTS error_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_name TEXT,
    line_number INTEGER,
    raw_error TEXT,
    context TEXT,
    resolved BOOLEAN DEFAULT 0,
    resolution_method TEXT,
    FOREIGN KEY (pattern_id) REFERENCES error_patterns (id)
);

CREATE INDEX IF NOT EXISTS idx_error_code ON error_patterns(error_code);
CREATE INDEX IF NOT EXISTS idx_object_name ON error_patterns(object_name);
CREATE INDEX IF NOT EXISTS idx_pattern_hash ON error_patterns(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_timestamp ON error_instances(timestamp);
SQL
        
        echo -e "${GREEN}✓ Database initialized${NC}"
    fi
}

# Function to hash error pattern for deduplication
hash_pattern() {
    local error_code="$1"
    local object_name="$2"
    local field_name="$3"
    
    echo -n "${error_code}|${object_name}|${field_name}" | md5sum | cut -d' ' -f1
}

# Function to log error
log_error() {
    local error_code="$1"
    local error_message="$2"
    local object_name="${3:-}"
    local field_name="${4:-}"
    local operation="${5:-}"
    local file_name="${6:-}"
    local context="${7:-}"
    
    # Generate pattern hash
    local pattern_hash=$(hash_pattern "$error_code" "$object_name" "$field_name")
    
    # Check if pattern exists
    local pattern_id=$(sqlite3 "$ERROR_DB" "SELECT id FROM error_patterns WHERE pattern_hash='$pattern_hash'")
    
    if [ -z "$pattern_id" ]; then
        # New pattern
        sqlite3 "$ERROR_DB" << SQL
INSERT INTO error_patterns (error_code, error_message, object_name, field_name, operation, pattern_hash)
VALUES ('$error_code', '$error_message', '$object_name', '$field_name', '$operation', '$pattern_hash');
SQL
        pattern_id=$(sqlite3 "$ERROR_DB" "SELECT last_insert_rowid()")
        echo -e "${YELLOW}New error pattern detected: $error_code${NC}"
    else
        # Update existing pattern
        sqlite3 "$ERROR_DB" << SQL
UPDATE error_patterns 
SET occurrence_count = occurrence_count + 1,
    last_seen = CURRENT_TIMESTAMP
WHERE id = $pattern_id;
SQL
    fi
    
    # Log instance
    sqlite3 "$ERROR_DB" << SQL
INSERT INTO error_instances (pattern_id, file_name, raw_error, context)
VALUES ($pattern_id, '$file_name', '$error_message', '$context');
SQL
    
    echo -e "${GREEN}✓ Error logged (Pattern ID: $pattern_id)${NC}"
}

# Function to analyze error patterns
analyze_patterns() {
    echo -e "${BLUE}═══ Error Pattern Analysis ═══${NC}"
    
    # Top error patterns
    echo -e "\n${CYAN}Top 10 Error Patterns:${NC}"
    sqlite3 -column -header "$ERROR_DB" << SQL
SELECT 
    error_code,
    object_name,
    field_name,
    occurrence_count,
    ROUND(fix_success_rate, 2) as success_rate,
    datetime(last_seen) as last_seen
FROM error_patterns
ORDER BY occurrence_count DESC
LIMIT 10;
SQL
    
    # Patterns by object
    echo -e "\n${CYAN}Errors by Object:${NC}"
    sqlite3 -column -header "$ERROR_DB" << SQL
SELECT 
    object_name,
    COUNT(*) as pattern_count,
    SUM(occurrence_count) as total_occurrences
FROM error_patterns
WHERE object_name IS NOT NULL
GROUP BY object_name
ORDER BY total_occurrences DESC;
SQL
    
    # Recent patterns
    echo -e "\n${CYAN}Recent Error Patterns (Last 24 Hours):${NC}"
    sqlite3 -column -header "$ERROR_DB" << SQL
SELECT 
    error_code,
    object_name,
    occurrence_count,
    datetime(last_seen) as last_seen
FROM error_patterns
WHERE datetime(last_seen) > datetime('now', '-1 day')
ORDER BY last_seen DESC
LIMIT 5;
SQL
    
    # Success rate of fixes
    echo -e "\n${CYAN}Fix Success Rates:${NC}"
    sqlite3 -column -header "$ERROR_DB" << SQL
SELECT 
    f.fix_type,
    COUNT(*) as patterns_fixed,
    SUM(f.success_count) as successes,
    SUM(f.failure_count) as failures,
    ROUND(CAST(SUM(f.success_count) AS REAL) / 
          (SUM(f.success_count) + SUM(f.failure_count)) * 100, 2) as success_rate
FROM error_fixes f
GROUP BY f.fix_type
ORDER BY success_rate DESC;
SQL
}

# Function to suggest fix for error
suggest_fix() {
    local error_code="$1"
    local object_name="${2:-}"
    local field_name="${3:-}"
    
    local pattern_hash=$(hash_pattern "$error_code" "$object_name" "$field_name")
    
    # Get pattern ID
    local pattern_id=$(sqlite3 "$ERROR_DB" "SELECT id FROM error_patterns WHERE pattern_hash='$pattern_hash'")
    
    if [ -z "$pattern_id" ]; then
        echo -e "${YELLOW}No known pattern for this error${NC}"
        
        # Suggest based on error code
        case "$error_code" in
            "INVALID_FIELD")
                echo -e "${CYAN}Suggested fixes:${NC}"
                echo "  1. Verify field name with: ./scripts/field-verifier.sh verify $object_name $field_name"
                echo "  2. Check field permissions"
                echo "  3. Ensure field exists in target org"
                ;;
            "INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST")
                echo -e "${CYAN}Suggested fixes:${NC}"
                echo "  1. Validate picklist values: ./scripts/picklist-validator.sh validate $object_name $field_name"
                echo "  2. Check record type restrictions"
                echo "  3. Map values to allowed options"
                ;;
            "FIELD_CUSTOM_VALIDATION_EXCEPTION")
                echo -e "${CYAN}Suggested fixes:${NC}"
                echo "  1. Analyze validation rules: ./scripts/validation-rule-analyzer.sh analyze $object_name"
                echo "  2. Apply safe defaults: ./scripts/validation-rule-analyzer.sh bypass $object_name"
                echo "  3. Review required fields"
                ;;
            "UNABLE_TO_LOCK_ROW")
                echo -e "${CYAN}Suggested fixes:${NC}"
                echo "  1. Retry operation with exponential backoff"
                echo "  2. Reduce batch size"
                echo "  3. Check for concurrent operations"
                ;;
            *)
                echo "  No specific suggestions available"
                ;;
        esac
    else
        # Get successful fixes for this pattern
        echo -e "${CYAN}Known fixes for this pattern:${NC}"
        sqlite3 -column -header "$ERROR_DB" << SQL
SELECT 
    fix_type,
    fix_command,
    success_count,
    failure_count,
    ROUND(CAST(success_count AS REAL) / (success_count + failure_count) * 100, 2) as success_rate
FROM error_fixes
WHERE pattern_id = $pattern_id
ORDER BY success_rate DESC;
SQL
    fi
}

# Function to record fix result
record_fix_result() {
    local pattern_id="$1"
    local fix_type="$2"
    local fix_command="$3"
    local success="$4"  # 1 for success, 0 for failure
    
    # Check if fix exists
    local fix_id=$(sqlite3 "$ERROR_DB" "SELECT id FROM error_fixes WHERE pattern_id=$pattern_id AND fix_type='$fix_type'")
    
    if [ -z "$fix_id" ]; then
        # Create new fix record
        sqlite3 "$ERROR_DB" << SQL
INSERT INTO error_fixes (pattern_id, fix_type, fix_command, success_count, failure_count)
VALUES ($pattern_id, '$fix_type', '$fix_command', 0, 0);
SQL
        fix_id=$(sqlite3 "$ERROR_DB" "SELECT last_insert_rowid()")
    fi
    
    # Update counts
    if [ "$success" -eq 1 ]; then
        sqlite3 "$ERROR_DB" "UPDATE error_fixes SET success_count = success_count + 1 WHERE id = $fix_id"
        echo -e "${GREEN}✓ Fix recorded as successful${NC}"
    else
        sqlite3 "$ERROR_DB" "UPDATE error_fixes SET failure_count = failure_count + 1 WHERE id = $fix_id"
        echo -e "${RED}✗ Fix recorded as failed${NC}"
    fi
    
    # Update pattern success rate
    sqlite3 "$ERROR_DB" << SQL
UPDATE error_patterns 
SET fix_success_rate = (
    SELECT CAST(SUM(success_count) AS REAL) / (SUM(success_count) + SUM(failure_count))
    FROM error_fixes
    WHERE pattern_id = $pattern_id
)
WHERE id = $pattern_id;
SQL
}

# Function to auto-apply known fixes
auto_apply_fix() {
    local error_code="$1"
    local object_name="$2"
    local field_name="${3:-}"
    local file_name="${4:-}"
    
    local pattern_hash=$(hash_pattern "$error_code" "$object_name" "$field_name")
    local pattern_id=$(sqlite3 "$ERROR_DB" "SELECT id FROM error_patterns WHERE pattern_hash='$pattern_hash'")
    
    if [ -z "$pattern_id" ]; then
        echo -e "${YELLOW}No known fix for this error pattern${NC}"
        return 1
    fi
    
    # Get best fix (highest success rate)
    local fix_info=$(sqlite3 -separator '|' "$ERROR_DB" << SQL
SELECT fix_type, fix_command
FROM error_fixes
WHERE pattern_id = $pattern_id
ORDER BY CAST(success_count AS REAL) / (success_count + failure_count) DESC
LIMIT 1;
SQL
)
    
    if [ -z "$fix_info" ]; then
        echo -e "${YELLOW}No fixes recorded for this pattern${NC}"
        return 1
    fi
    
    local fix_type=$(echo "$fix_info" | cut -d'|' -f1)
    local fix_command=$(echo "$fix_info" | cut -d'|' -f2)

    echo -e "${BLUE}Applying fix: $fix_type${NC}"
    echo "Command: $fix_command"

    # Execute fix command safely (only allow simple, whitelisted commands)
    safe_execute_command() {
        local cmd="$1"
        # Reject dangerous metacharacters
        if [[ "$cmd" =~ [\;\|\&\`\$\<\>] ]]; then
            echo -e "${YELLOW}Refusing to execute potentially unsafe command${NC}"
            return 2
        fi
        # Only allow Salesforce CLI commands by default
        if [[ "$cmd" != sf\ * ]]; then
            echo -e "${YELLOW}Command not whitelisted for auto-execution${NC}"
            return 2
        fi
        # Naive split (commands with complex quoting will be refused above)
        read -r -a args <<< "$cmd"
        command -v "${args[0]}" >/dev/null 2>&1 || { echo "CLI not found: ${args[0]}"; return 127; }
        "${args[@]}"
    }

    safe_execute_command "$fix_command"
    local result=$?
    
    # Record result
    record_fix_result "$pattern_id" "$fix_type" "$fix_command" $((result == 0 ? 1 : 0))
    
    return $result
}

# Function to generate fix script
generate_fix_script() {
    local threshold="${1:-50}"  # Minimum occurrences to include
    local output_file="$FIXES_DIR/auto_fixes_$(date +%Y%m%d).sh"
    
    echo -e "${BLUE}Generating auto-fix script...${NC}"
    
    cat > "$output_file" << 'HEADER'
#!/bin/bash
# Auto-generated fix script based on error patterns
# Generated: DATE_PLACEHOLDER

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

set -Eeuo pipefail
IFS=$'\n\t'

# Safe executor for whitelisted commands
safe_execute_command() {
    local cmd="$1"
    if [[ "$cmd" =~ [\;\|\&\`\$\<\>] ]]; then
        echo "Refusing to execute unsafe command"
        return 2
    fi
    if [[ "$cmd" != sf\ * ]]; then
        echo "Command not whitelisted for auto-execution"
        return 2
    fi
    read -r -a args <<< "$cmd"
    command -v "${args[0]}" >/dev/null 2>&1 || { echo "CLI not found: ${args[0]}"; return 127; }
    "${args[@]}"
}

# Function to apply fixes based on error code
apply_fix() {
    local error_code="$1"
    local object_name="$2"
    local field_name="${3:-}"
    local file_name="${4:-}"
    
    case "$error_code" in
HEADER
    
    # Add cases for common errors
    sqlite3 "$ERROR_DB" << SQL | while IFS='|' read -r error_code fix_command occurrence_count; do
SELECT DISTINCT 
    p.error_code,
    f.fix_command,
    p.occurrence_count
FROM error_patterns p
JOIN error_fixes f ON p.id = f.pattern_id
WHERE p.occurrence_count >= $threshold
  AND f.success_count > f.failure_count
ORDER BY p.occurrence_count DESC;
SQL
        cat >> "$output_file" << FIX
        "$error_code")
            echo "Applying fix for $error_code (seen $occurrence_count times)"
            safe_execute_command "$fix_command"
            ;;
FIX
    done
    
    cat >> "$output_file" << 'FOOTER'
        *)
            echo "No automated fix available for error code: $error_code"
            return 1
            ;;
    esac
}

# Main execution
if [ $# -lt 2 ]; then
    echo "Usage: $0 <error_code> <object_name> [field_name] [file_name]"
    exit 1
fi

apply_fix "$1" "$2" "$3" "$4"
FOOTER
    
    # Replace placeholder
    sed -i "s/DATE_PLACEHOLDER/$(date)/g" "$output_file"
    
    chmod +x "$output_file"
    echo -e "${GREEN}✓ Fix script generated: $output_file${NC}"
}

# Function to import error from log file
import_from_log() {
    local log_file="$1"
    
    if [ ! -f "$log_file" ]; then
        echo -e "${RED}Log file not found: $log_file${NC}"
        return 1
    fi
    
    echo -e "${BLUE}Importing errors from log...${NC}"
    
    local imported=0
    
    # Parse Salesforce error patterns
    grep -E "INVALID_|ERROR|EXCEPTION|FAILED" "$log_file" | while IFS= read -r line; do
        # Extract error code
        local error_code=$(echo "$line" | grep -oE '[A-Z_]+_EXCEPTION|INVALID_[A-Z_]+|[A-Z_]+_ERROR' | head -1)
        
        if [ -n "$error_code" ]; then
            # Extract object and field if possible
            local object_name=$(echo "$line" | grep -oE 'Object: ([A-Za-z0-9_]+)' | cut -d' ' -f2)
            local field_name=$(echo "$line" | grep -oE 'Field: ([A-Za-z0-9_]+)' | cut -d' ' -f2)
            
            log_error "$error_code" "$line" "$object_name" "$field_name" "" "$(basename "$log_file")" ""
            ((imported++))
        fi
    done
    
    echo -e "${GREEN}✓ Imported $imported error patterns${NC}"
}

# Function to generate learning report
generate_report() {
    local report_file="$PATTERNS_DIR/error_report_$(date +%Y%m%d_%H%M%S).html"
    
    echo -e "${BLUE}Generating error pattern report...${NC}"
    
    cat > "$report_file" << 'HTML'
<!DOCTYPE html>
<html>
<head>
    <title>Error Pattern Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #d32f2f; color: white; padding: 20px; border-radius: 5px; }
        .section { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f5f5f5; padding: 10px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .metric { display: inline-block; margin: 10px 20px; }
        .metric-value { font-size: 2em; font-weight: bold; color: #d32f2f; }
        .metric-label { color: #666; }
        .success { color: #4caf50; }
        .warning { color: #ff9800; }
        .error { color: #d32f2f; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="header">
        <h1>Error Pattern Analysis Report</h1>
        <p>Generated: TIMESTAMP</p>
    </div>
    
    <div class="section">
        <h2>Summary Metrics</h2>
        <div class="metric">
            <div class="metric-value">TOTAL_PATTERNS</div>
            <div class="metric-label">Unique Patterns</div>
        </div>
        <div class="metric">
            <div class="metric-value">TOTAL_OCCURRENCES</div>
            <div class="metric-label">Total Occurrences</div>
        </div>
        <div class="metric">
            <div class="metric-value">FIX_SUCCESS_RATE%</div>
            <div class="metric-label">Fix Success Rate</div>
        </div>
    </div>
    
    <div class="section">
        <h2>Top Error Patterns</h2>
        <table>
            <tr>
                <th>Error Code</th>
                <th>Object</th>
                <th>Occurrences</th>
                <th>Fix Rate</th>
                <th>Last Seen</th>
            </tr>
            ERROR_PATTERNS_TABLE
        </table>
    </div>
    
    <div class="section">
        <h2>Error Trend</h2>
        <canvas id="trendChart"></canvas>
    </div>
    
    <div class="section">
        <h2>Recommended Actions</h2>
        <ul>
            RECOMMENDATIONS
        </ul>
    </div>
    
    <script>
        // Trend chart
        var ctx = document.getElementById('trendChart').getContext('2d');
        var chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: TREND_LABELS,
                datasets: [{
                    label: 'Error Occurrences',
                    data: TREND_DATA,
                    borderColor: '#d32f2f',
                    tension: 0.1
                }]
            }
        });
    </script>
</body>
</html>
HTML
    
    # Fill in data
    local total_patterns=$(sqlite3 "$ERROR_DB" "SELECT COUNT(*) FROM error_patterns")
    local total_occurrences=$(sqlite3 "$ERROR_DB" "SELECT SUM(occurrence_count) FROM error_patterns")
    local fix_success_rate=$(sqlite3 "$ERROR_DB" "SELECT ROUND(AVG(fix_success_rate) * 100, 2) FROM error_patterns WHERE fix_success_rate > 0")
    
    sed -i "s/TIMESTAMP/$(date)/g" "$report_file"
    sed -i "s/TOTAL_PATTERNS/$total_patterns/g" "$report_file"
    sed -i "s/TOTAL_OCCURRENCES/$total_occurrences/g" "$report_file"
    sed -i "s/FIX_SUCCESS_RATE/${fix_success_rate:-0}/g" "$report_file"
    
    # Add patterns table
    local patterns_table=$(sqlite3 -html "$ERROR_DB" << SQL
SELECT 
    error_code,
    COALESCE(object_name, 'N/A') as object_name,
    occurrence_count,
    ROUND(fix_success_rate * 100, 2) || '%' as fix_rate,
    datetime(last_seen) as last_seen
FROM error_patterns
ORDER BY occurrence_count DESC
LIMIT 10;
SQL
)
    sed -i "s|ERROR_PATTERNS_TABLE|$patterns_table|g" "$report_file"
    
    echo -e "${GREEN}✓ Report generated: $report_file${NC}"
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ Error Pattern Learning System ═══${NC}"
    echo "1) Log new error"
    echo "2) Analyze patterns"
    echo "3) Suggest fix for error"
    echo "4) Auto-apply fix"
    echo "5) Generate fix script"
    echo "6) Import from log file"
    echo "7) Generate report"
    echo "8) Show statistics"
    echo "9) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                echo -n "Error code: "
                read -r error_code
                echo -n "Error message: "
                read -r error_message
                echo -n "Object name (optional): "
                read -r object_name
                echo -n "Field name (optional): "
                read -r field_name
                log_error "$error_code" "$error_message" "$object_name" "$field_name"
                ;;
            2)
                analyze_patterns
                ;;
            3)
                echo -n "Error code: "
                read -r error_code
                echo -n "Object name (optional): "
                read -r object_name
                echo -n "Field name (optional): "
                read -r field_name
                suggest_fix "$error_code" "$object_name" "$field_name"
                ;;
            4)
                echo -n "Error code: "
                read -r error_code
                echo -n "Object name: "
                read -r object_name
                echo -n "Field name (optional): "
                read -r field_name
                auto_apply_fix "$error_code" "$object_name" "$field_name"
                ;;
            5)
                echo -n "Minimum occurrences threshold (default 50): "
                read -r threshold
                generate_fix_script "${threshold:-50}"
                ;;
            6)
                echo -n "Log file path: "
                read -r log_file
                import_from_log "$log_file"
                ;;
            7)
                generate_report
                ;;
            8)
                echo -e "${CYAN}Database Statistics:${NC}"
                echo "  Total patterns: $(sqlite3 "$ERROR_DB" 'SELECT COUNT(*) FROM error_patterns')"
                echo "  Total instances: $(sqlite3 "$ERROR_DB" 'SELECT COUNT(*) FROM error_instances')"
                echo "  Total fixes: $(sqlite3 "$ERROR_DB" 'SELECT COUNT(*) FROM error_fixes')"
                echo "  Database size: $(du -h "$ERROR_DB" | cut -f1)"
                ;;
            9)
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    done
}

# Initialize database
init_database

# Command line mode
if [ $# -eq 0 ]; then
    interactive_mode
else
    case "$1" in
        log)
            log_error "$2" "$3" "${4:-}" "${5:-}" "${6:-}"
            ;;
        analyze)
            analyze_patterns
            ;;
        suggest)
            suggest_fix "$2" "${3:-}" "${4:-}"
            ;;
        fix)
            auto_apply_fix "$2" "$3" "${4:-}" "${5:-}"
            ;;
        import)
            import_from_log "$2"
            ;;
        generate)
            generate_fix_script "${2:-50}"
            ;;
        report)
            generate_report
            ;;
        *)
            echo "Usage: $0 {log|analyze|suggest|fix|import|generate|report} [options]"
            echo ""
            echo "Commands:"
            echo "  log <code> <msg> [obj] [field]  - Log error pattern"
            echo "  analyze                          - Analyze patterns"
            echo "  suggest <code> [obj] [field]    - Suggest fix"
            echo "  fix <code> <obj> [field]        - Auto-apply fix"
            echo "  import <logfile>                - Import from log"
            echo "  generate [threshold]            - Generate fix script"
            echo "  report                          - Generate HTML report"
            exit 1
            ;;
    esac
fi
