#!/bin/bash

# CSV Sanitization Utility for Salesforce Data
# Automatically cleans and validates CSV files for import

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/logs/csv-sanitizer.log"
BACKUP_DIR="$PROJECT_ROOT/data/csv-backups"

log_playbook_version() {
    local playbook_path="$1"
    local version="unknown"
    if command -v git >/dev/null 2>&1; then
        if git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
            version=$(git -C "$PROJECT_ROOT" log -1 --pretty=format:%h -- "$playbook_path" 2>/dev/null)
            if [[ -z "$version" ]]; then
                version="untracked"
            fi
        fi
    fi
    echo "Playbook: $playbook_path (version: $version)"
}

echo "\n═══════════════════════════════════════════════════════════════"
echo "CSV Sanitizer"
echo "═══════════════════════════════════════════════════════════════"

log_playbook_version "docs/playbooks/bulk-data-operations.md"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Function to detect file encoding
detect_encoding() {
    local file="$1"
    
    # Try to detect encoding
    if command -v file >/dev/null 2>&1; then
        local encoding=$(file -bi "$file" | sed -e 's/.*charset=\([^;]*\).*/\1/')
        echo "$encoding"
    else
        echo "unknown"
    fi
}

# Function to detect line endings
detect_line_endings() {
    local file="$1"
    
    if grep -q $'\r\n' "$file"; then
        echo "CRLF (Windows)"
        return 1
    elif grep -q $'\r' "$file"; then
        echo "CR (Old Mac)"
        return 2
    else
        echo "LF (Unix)"
        return 0
    fi
}

# Function to fix line endings
fix_line_endings() {
    local file="$1"
    local backup_file="$BACKUP_DIR/$(basename "$file").$(date +%Y%m%d_%H%M%S).backup"
    
    # Create backup
    cp "$file" "$backup_file"
    echo -e "${CYAN}Backup created: $backup_file${NC}"
    
    # Detect current line endings
    detect_line_endings "$file"
    local ending_type=$?
    
    case $ending_type in
        1)
            echo -e "${YELLOW}Converting CRLF to LF...${NC}"
            if command -v dos2unix >/dev/null 2>&1; then
                dos2unix "$file" 2>/dev/null
            else
                sed -i 's/\r$//' "$file"
            fi
            echo -e "${GREEN}✓ Line endings fixed${NC}"
            log_message "Fixed CRLF line endings in $file"
            ;;
        2)
            echo -e "${YELLOW}Converting CR to LF...${NC}"
            sed -i 's/\r/\n/g' "$file"
            echo -e "${GREEN}✓ Line endings fixed${NC}"
            log_message "Fixed CR line endings in $file"
            ;;
        0)
            echo -e "${GREEN}✓ Line endings already correct (LF)${NC}"
            ;;
    esac
}

# Function to fix encoding
fix_encoding() {
    local file="$1"
    local target_encoding="${2:-UTF-8}"
    local current_encoding=$(detect_encoding "$file")
    
    if [ "$current_encoding" != "$target_encoding" ] && [ "$current_encoding" != "unknown" ]; then
        echo -e "${YELLOW}Converting from $current_encoding to $target_encoding...${NC}"
        
        if command -v iconv >/dev/null 2>&1; then
            local temp_file="${file}.tmp"
            iconv -f "$current_encoding" -t "$target_encoding" "$file" > "$temp_file" 2>/dev/null
            if [ $? -eq 0 ]; then
                mv "$temp_file" "$file"
                echo -e "${GREEN}✓ Encoding converted to $target_encoding${NC}"
                log_message "Converted encoding from $current_encoding to $target_encoding for $file"
            else
                rm -f "$temp_file"
                echo -e "${RED}✗ Encoding conversion failed${NC}"
                return 1
            fi
        else
            echo -e "${YELLOW}⚠ iconv not available, skipping encoding conversion${NC}"
        fi
    else
        echo -e "${GREEN}✓ Encoding already $target_encoding or compatible${NC}"
    fi
}

# Function to validate CSV structure
validate_csv_structure() {
    local file="$1"
    local delimiter="${2:-,}"
    
    echo -e "${BLUE}Validating CSV structure...${NC}"
    
    # Count columns in header
    local header_columns=$(head -1 "$file" | awk -F"$delimiter" '{print NF}')
    echo "  Header columns: $header_columns"
    
    # Check consistency
    local inconsistent=0
    local line_num=0
    local max_check=1000  # Check first 1000 lines for performance
    
    while IFS= read -r line && [ $line_num -lt $max_check ]; do
        ((line_num++))
        [ $line_num -eq 1 ] && continue  # Skip header
        
        local columns=$(echo "$line" | awk -F"$delimiter" '{print NF}')
        if [ "$columns" -ne "$header_columns" ]; then
            echo -e "${YELLOW}  Line $line_num: $columns columns (expected $header_columns)${NC}"
            ((inconsistent++))
        fi
    done < "$file"
    
    if [ $inconsistent -eq 0 ]; then
        echo -e "${GREEN}✓ CSV structure is consistent${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Found $inconsistent inconsistent lines${NC}"
        return 1
    fi
}

# Function to escape special characters
escape_special_chars() {
    local file="$1"
    local temp_file="${file}.escaped"
    
    echo -e "${BLUE}Escaping special characters...${NC}"
    
    # Process the CSV properly handling quoted fields
    awk 'BEGIN {FS=OFS=","} 
    {
        for(i=1; i<=NF; i++) {
            # If field contains comma, newline, or quote, wrap in quotes
            if($i ~ /[,"\n]/) {
                # Escape existing quotes
                gsub(/"/, "\"\"", $i)
                # Wrap in quotes if not already
                if(substr($i,1,1) != "\"" || substr($i,length($i),1) != "\"") {
                    $i = "\"" $i "\""
                }
            }
        }
        print
    }' "$file" > "$temp_file"
    
    mv "$temp_file" "$file"
    echo -e "${GREEN}✓ Special characters escaped${NC}"
    log_message "Escaped special characters in $file"
}

# Function to remove BOM (Byte Order Mark)
remove_bom() {
    local file="$1"
    
    # Check for BOM
    if head -c 3 "$file" | grep -q $'\xef\xbb\xbf'; then
        echo -e "${YELLOW}BOM detected, removing...${NC}"
        # Remove BOM
        sed -i '1s/^\xEF\xBB\xBF//' "$file"
        echo -e "${GREEN}✓ BOM removed${NC}"
        log_message "Removed BOM from $file"
    else
        echo -e "${GREEN}✓ No BOM detected${NC}"
    fi
}

# Function to handle null values
fix_null_values() {
    local file="$1"
    local null_replacement="${2:-}"
    
    echo -e "${BLUE}Handling null values...${NC}"
    
    # Replace various null representations
    sed -i 's/\<NULL\>//gi' "$file"
    sed -i 's/\<null\>//gi' "$file"
    sed -i 's/\<NIL\>//gi' "$file"
    sed -i 's/\<None\>//gi' "$file"
    
    # Replace with specified value if provided
    if [ -n "$null_replacement" ]; then
        sed -i "s/,,/,$null_replacement,/g" "$file"
        sed -i "s/,$/,$null_replacement/g" "$file"
        echo -e "${GREEN}✓ Null values replaced with '$null_replacement'${NC}"
    else
        echo -e "${GREEN}✓ Null values cleaned${NC}"
    fi
    
    log_message "Fixed null values in $file"
}

# Function to validate Salesforce ID format
validate_salesforce_ids() {
    local file="$1"
    local id_column="${2:-1}"
    
    echo -e "${BLUE}Validating Salesforce IDs...${NC}"
    
    local invalid_ids=0
    local line_num=0
    
    # Skip header and check IDs
    tail -n +2 "$file" | while IFS=',' read -ra fields; do
        ((line_num++))
        local id_value="${fields[$((id_column - 1))]}"
        
        # Remove quotes
        id_value="${id_value%\"}"
        id_value="${id_value#\"}"
        
        # Check if it's a valid Salesforce ID (15 or 18 characters, alphanumeric)
        if [ -n "$id_value" ] && ! [[ "$id_value" =~ ^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$ ]]; then
            echo -e "${YELLOW}  Line $((line_num + 1)): Invalid ID format: $id_value${NC}"
            ((invalid_ids++))
        fi
    done
    
    if [ $invalid_ids -eq 0 ]; then
        echo -e "${GREEN}✓ All Salesforce IDs are valid${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ Found $invalid_ids invalid IDs${NC}"
        return 1
    fi
}

# Function to create field mapping
create_field_mapping() {
    local file="$1"
    local object_name="$2"
    
    echo -e "${BLUE}Creating field mapping for $object_name...${NC}"
    
    # Get header fields
    local headers=$(head -1 "$file")
    local mapping_file="${file%.csv}_mapping.json"
    
    echo "{" > "$mapping_file"
    echo "  \"object\": \"$object_name\"," >> "$mapping_file"
    echo "  \"mappings\": [" >> "$mapping_file"
    
    IFS=',' read -ra header_fields <<< "$headers"
    local first=true
    
    for field in "${header_fields[@]}"; do
        # Remove quotes and whitespace
        field=$(echo "$field" | tr -d '"' | xargs)
        
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$mapping_file"
        fi
        
        echo -n "    {\"csvField\": \"$field\", \"sfField\": \"$field\"}" >> "$mapping_file"
    done
    
    echo "" >> "$mapping_file"
    echo "  ]" >> "$mapping_file"
    echo "}" >> "$mapping_file"
    
    echo -e "${GREEN}✓ Field mapping created: $mapping_file${NC}"
    log_message "Created field mapping for $file"
}

# Function to generate import statistics
generate_stats() {
    local file="$1"
    
    echo -e "\n${BLUE}═══ CSV Statistics ═══${NC}"
    
    local total_lines=$(wc -l < "$file")
    local data_lines=$((total_lines - 1))
    local file_size=$(du -h "$file" | cut -f1)
    local columns=$(head -1 "$file" | awk -F',' '{print NF}')
    
    echo "  File: $(basename "$file")"
    echo "  Size: $file_size"
    echo "  Total lines: $total_lines"
    echo "  Data rows: $data_lines"
    echo "  Columns: $columns"
    echo "  Encoding: $(detect_encoding "$file")"
    detect_line_endings "$file"
    echo "  Line endings: $(detect_line_endings "$file")"
}

# Main sanitization function
sanitize_csv() {
    local file="$1"
    local options="${2:-all}"
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗ File not found: $file${NC}"
        return 1
    fi
    
    echo -e "${BLUE}═══ CSV Sanitization Process ═══${NC}"
    echo "File: $file"
    echo ""
    
    # Create working copy
    local work_file="${file%.csv}_sanitized.csv"
    cp "$file" "$work_file"
    
    # Show initial stats
    generate_stats "$file"
    
    echo -e "\n${BLUE}═══ Sanitization Steps ═══${NC}"
    
    # Run sanitization steps
    if [[ "$options" == *"all"* ]] || [[ "$options" == *"bom"* ]]; then
        remove_bom "$work_file"
    fi
    
    if [[ "$options" == *"all"* ]] || [[ "$options" == *"line"* ]]; then
        fix_line_endings "$work_file"
    fi
    
    if [[ "$options" == *"all"* ]] || [[ "$options" == *"encoding"* ]]; then
        fix_encoding "$work_file"
    fi
    
    if [[ "$options" == *"all"* ]] || [[ "$options" == *"escape"* ]]; then
        escape_special_chars "$work_file"
    fi
    
    if [[ "$options" == *"all"* ]] || [[ "$options" == *"null"* ]]; then
        fix_null_values "$work_file"
    fi
    
    if [[ "$options" == *"all"* ]] || [[ "$options" == *"validate"* ]]; then
        validate_csv_structure "$work_file"
    fi
    
    echo -e "\n${GREEN}✓ Sanitization complete${NC}"
    echo -e "${CYAN}Sanitized file: $work_file${NC}"
    
    # Show final stats
    echo ""
    generate_stats "$work_file"
    
    log_message "Completed sanitization of $file"
    return 0
}

# Function to batch sanitize multiple files
batch_sanitize() {
    local pattern="$1"
    local options="${2:-all}"
    
    echo -e "${BLUE}═══ Batch CSV Sanitization ═══${NC}"
    echo "Pattern: $pattern"
    echo ""
    
    local count=0
    for file in $pattern; do
        if [ -f "$file" ]; then
            ((count++))
            echo -e "\n${CYAN}[$count] Processing: $file${NC}"
            sanitize_csv "$file" "$options"
        fi
    done
    
    echo -e "\n${GREEN}✓ Processed $count files${NC}"
}

# Main menu
show_menu() {
    echo -e "\n${BLUE}═══ CSV Sanitizer for Salesforce ═══${NC}"
    echo "1) Sanitize single CSV"
    echo "2) Batch sanitize files"
    echo "3) Check file only (no changes)"
    echo "4) Fix line endings only"
    echo "5) Validate structure only"
    echo "6) Create field mapping"
    echo "7) Exit"
    echo -n "Select option: "
}

# Interactive mode
interactive_mode() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                echo -n "CSV file path: "
                read -r file
                sanitize_csv "$file" "all"
                ;;
            2)
                echo -n "File pattern (e.g., *.csv): "
                read -r pattern
                batch_sanitize "$pattern" "all"
                ;;
            3)
                echo -n "CSV file path: "
                read -r file
                generate_stats "$file"
                detect_line_endings "$file"
                validate_csv_structure "$file"
                ;;
            4)
                echo -n "CSV file path: "
                read -r file
                fix_line_endings "$file"
                ;;
            5)
                echo -n "CSV file path: "
                read -r file
                validate_csv_structure "$file"
                ;;
            6)
                echo -n "CSV file path: "
                read -r file
                echo -n "Salesforce object name: "
                read -r object
                create_field_mapping "$file" "$object"
                ;;
            7)
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac
    done
}

# Command line mode
if [ $# -eq 0 ]; then
    interactive_mode
else
    case "$1" in
        sanitize)
            sanitize_csv "$2" "${3:-all}"
            ;;
        batch)
            batch_sanitize "$2" "${3:-all}"
            ;;
        check)
            generate_stats "$2"
            detect_line_endings "$2"
            validate_csv_structure "$2"
            ;;
        line-endings)
            fix_line_endings "$2"
            ;;
        encoding)
            fix_encoding "$2" "${3:-UTF-8}"
            ;;
        validate)
            validate_csv_structure "$2" "${3:-,}"
            ;;
        mapping)
            create_field_mapping "$2" "$3"
            ;;
        *)
            echo "Usage: $0 {sanitize|batch|check|line-endings|encoding|validate|mapping} [options]"
            echo ""
            echo "Commands:"
            echo "  sanitize <file> [opts]   - Sanitize single CSV file"
            echo "  batch <pattern> [opts]   - Batch sanitize files"
            echo "  check <file>             - Check file without changes"
            echo "  line-endings <file>      - Fix line endings only"
            echo "  encoding <file> [enc]    - Fix encoding (default UTF-8)"
            echo "  validate <file> [delim]  - Validate structure"
            echo "  mapping <file> <object>  - Create field mapping"
            echo ""
            echo "Options: all|bom|line|encoding|escape|null|validate"
            exit 1
            ;;
    esac
fi
