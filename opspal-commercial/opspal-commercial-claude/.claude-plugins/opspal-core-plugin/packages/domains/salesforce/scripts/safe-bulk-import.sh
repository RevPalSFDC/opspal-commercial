#!/bin/bash

##############################################################################
# safe-bulk-import.sh - Salesforce CLI Bulk Import with Line Ending Fix
##############################################################################
# This script handles the known Salesforce CLI bulk import CSV line ending 
# issue by automatically converting files to the appropriate format before
# importing, preventing "LineEnding is invalid on user data" errors.
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS] -o OBJECT -f CSV_FILE

Safely import CSV data to Salesforce using bulk API with automatic line ending conversion.

OPTIONS:
    -o OBJECT       Salesforce object API name (e.g., Account, Contact, CustomObject__c)
    -f CSV_FILE     Path to CSV file to import
    -a ALIAS        Salesforce org alias (optional, uses default if not specified)
    -m MODE         Import mode: insert, update, upsert, delete (default: upsert)
    -i ID_FIELD     External ID field for upsert (default: Id)
    -w WAIT         Wait time in minutes for async operation (default: 10)
    -k KEEP         Keep converted file after import (y/n, default: n)
    -l LINE_FORMAT  Force line ending format: LF, CRLF, or AUTO (default: CRLF)
    -d              Diagnostic mode - analyze file without importing
    -h              Display this help message

EXAMPLES:
    # Basic upsert to Account object
    $0 -o Account -f accounts.csv

    # Insert new Contacts to specific org
    $0 -o Contact -f contacts.csv -a myorg -m insert

    # Upsert with external ID field
    $0 -o Product2 -f products.csv -i External_ID__c

    # Delete records
    $0 -o Lead -f leads_to_delete.csv -m delete

EOF
    exit 1
}

# Function to detect OS and line endings
detect_platform() {
    case "$(uname -s)" in
        Linux*)     PLATFORM="Linux";;
        Darwin*)    PLATFORM="Mac";;
        CYGWIN*|MINGW*|MSYS*) PLATFORM="Windows";;
        *)          PLATFORM="Unknown";;
    esac
    echo -e "${BLUE}Detected platform: ${PLATFORM}${NC}"
}

# Function to check if file has correct line endings
check_line_endings() {
    local file="$1"
    
    # Check for CRLF (Windows)
    if file "$file" | grep -q "CRLF"; then
        echo "CRLF"
    # Check for CR (old Mac)
    elif file "$file" | grep -q "CR"; then
        echo "CR"
    # Default to LF (Unix/Linux/Mac)
    else
        echo "LF"
    fi
}

# Function to install dos2unix if not present
ensure_dos2unix() {
    if ! command -v dos2unix &> /dev/null; then
        echo -e "${YELLOW}dos2unix not found. Installing...${NC}"
        
        if [[ "$PLATFORM" == "Linux" ]]; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y dos2unix
            elif command -v yum &> /dev/null; then
                sudo yum install -y dos2unix
            elif command -v dnf &> /dev/null; then
                sudo dnf install -y dos2unix
            else
                echo -e "${RED}Unable to install dos2unix automatically. Please install manually.${NC}"
                exit 1
            fi
        elif [[ "$PLATFORM" == "Mac" ]]; then
            if command -v brew &> /dev/null; then
                brew install dos2unix
            else
                echo -e "${RED}Please install Homebrew or dos2unix manually.${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Please install dos2unix manually for your platform.${NC}"
            exit 1
        fi
    fi
}

# Function to convert file to appropriate line endings
convert_line_endings() {
    local input_file="$1"
    local output_file="$2"
    local force_format="$3"  # Optional: force specific format (LF or CRLF)
    local current_endings=$(check_line_endings "$input_file")
    
    echo -e "${BLUE}Current line endings: ${current_endings}${NC}"
    
    # Copy file first
    cp "$input_file" "$output_file"
    
    # Determine target format
    local target_format=""
    if [[ -n "$force_format" ]]; then
        target_format="$force_format"
        echo -e "${YELLOW}Forcing conversion to ${target_format} format${NC}"
    else
        # IMPORTANT: Based on the error, Salesforce seems to expect CRLF by default
        # Even on Unix/Linux systems, we should try CRLF first
        target_format="CRLF"
        echo -e "${YELLOW}Using CRLF format for Salesforce compatibility${NC}"
    fi
    
    # Perform conversion
    if [[ "$target_format" == "CRLF" ]]; then
        # Convert to CRLF (Windows format)
        if [[ "$current_endings" != "CRLF" ]]; then
            echo -e "${YELLOW}Converting to CRLF line endings...${NC}"
            if command -v unix2dos &> /dev/null; then
                unix2dos "$output_file" 2>/dev/null
            else
                # Fallback method: add CR before each LF
                sed -i 's/$/\r/' "$output_file"
                # Remove any double CRs that might have been created
                sed -i 's/\r\r$/\r/' "$output_file"
            fi
        else
            echo -e "${GREEN}File already has CRLF line endings${NC}"
        fi
    else
        # Convert to LF (Unix/Linux/Mac format)
        if [[ "$current_endings" != "LF" ]]; then
            echo -e "${YELLOW}Converting to LF line endings...${NC}"
            if command -v dos2unix &> /dev/null; then
                dos2unix "$output_file" 2>/dev/null
            else
                # Fallback method: remove CR characters
                sed -i 's/\r$//' "$output_file"
            fi
        else
            echo -e "${GREEN}File already has LF line endings${NC}"
        fi
    fi
    
    # Verify conversion
    local new_endings=$(check_line_endings "$output_file")
    echo -e "${GREEN}Line endings after conversion: ${new_endings}${NC}"
    
    if [[ "$target_format" == "CRLF" ]] && [[ "$new_endings" != "CRLF" ]]; then
        echo -e "${YELLOW}Warning: Conversion to CRLF may not have been successful${NC}"
        echo -e "${YELLOW}Attempting alternative conversion method...${NC}"
        
        # Alternative method using awk
        awk 'sub("$", "\r")' "$input_file" > "$output_file.tmp" && mv "$output_file.tmp" "$output_file"
    fi
}

# Function to validate CSV file
validate_csv() {
    local file="$1"
    
    # Check if file exists
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}Error: CSV file not found: $file${NC}"
        exit 1
    fi
    
    # Check if file is empty
    if [[ ! -s "$file" ]]; then
        echo -e "${RED}Error: CSV file is empty: $file${NC}"
        exit 1
    fi
    
    # Check for common CSV issues
    local first_line=$(head -n 1 "$file")
    
    # Check for BOM
    if [[ "$first_line" == *$'\xEF\xBB\xBF'* ]]; then
        echo -e "${YELLOW}Warning: File contains BOM marker. Removing...${NC}"
        sed -i '1s/^\xEF\xBB\xBF//' "$file"
    fi
    
    # Check for spaces after commas
    if echo "$first_line" | grep -q ', "'; then
        echo -e "${YELLOW}Warning: Found spaces after commas. This may cause import issues.${NC}"
        echo -e "${YELLOW}Removing spaces between commas and quotes...${NC}"
        sed -i 's/, "/,"/g' "$file"
        sed -i 's/" ,/",/g' "$file"
    fi
    
    echo -e "${GREEN}CSV validation passed${NC}"
}

# Function to perform the import
perform_import() {
    local object="$1"
    local file="$2"
    local mode="$3"
    local id_field="$4"
    local wait="$5"
    local org_alias="$6"
    
    # Build command
    local cmd="sf data"
    
    # Add operation based on mode
    case "$mode" in
        insert|update|upsert)
            cmd="$cmd upsert bulk"
            ;;
        delete)
            cmd="$cmd delete bulk"
            ;;
        *)
            echo -e "${RED}Error: Invalid mode: $mode${NC}"
            exit 1
            ;;
    esac
    
    # Add object and file
    cmd="$cmd --sobject $object --file \"$file\""
    
    # Add external ID for upsert
    if [[ "$mode" == "upsert" ]] && [[ -n "$id_field" ]]; then
        cmd="$cmd --external-id $id_field"
    fi
    
    # Add wait time
    cmd="$cmd --wait $wait"
    
    # Add org alias if specified
    if [[ -n "$org_alias" ]]; then
        cmd="$cmd --target-org $org_alias"
    fi
    
    echo -e "${BLUE}Executing: $cmd${NC}"
    
    # Execute command and capture output
    if eval "$cmd"; then
        echo -e "${GREEN}Import completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}Import failed. Attempting fallback method...${NC}"
        return 1
    fi
}

# Function for fallback import method
fallback_import() {
    local object="$1"
    local file="$2"
    local mode="$3"
    local org_alias="$4"
    
    echo -e "${YELLOW}Attempting fallback import using smaller batch size...${NC}"
    
    # Split file into smaller chunks (1000 records each)
    local header=$(head -n 1 "$file")
    local temp_dir=$(mktemp -d)
    
    # Split file (keeping header)
    tail -n +2 "$file" | split -l 1000 - "$temp_dir/chunk_"
    
    local success=true
    local chunk_num=1
    
    for chunk in "$temp_dir"/chunk_*; do
        # Add header to chunk
        echo "$header" > "$temp_dir/import_$chunk_num.csv"
        cat "$chunk" >> "$temp_dir/import_$chunk_num.csv"
        
        echo -e "${BLUE}Importing chunk $chunk_num...${NC}"
        
        if perform_import "$object" "$temp_dir/import_$chunk_num.csv" "$mode" "" "5" "$org_alias"; then
            echo -e "${GREEN}Chunk $chunk_num imported successfully${NC}"
        else
            echo -e "${RED}Chunk $chunk_num failed${NC}"
            success=false
        fi
        
        ((chunk_num++))
        
        # Small delay between chunks
        sleep 2
    done
    
    # Cleanup
    rm -rf "$temp_dir"
    
    if $success; then
        echo -e "${GREEN}Fallback import completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}Some chunks failed during fallback import${NC}"
        return 1
    fi
}

# Function for diagnostic mode
run_diagnostics() {
    local file="$1"
    
    echo -e "${GREEN}=== CSV File Diagnostics ===${NC}"
    echo ""
    
    # File info
    echo -e "${BLUE}File Information:${NC}"
    echo "  Path: $file"
    echo "  Size: $(du -h "$file" | cut -f1)"
    echo "  Lines: $(wc -l < "$file")"
    echo ""
    
    # Line endings
    echo -e "${BLUE}Line Ending Analysis:${NC}"
    local endings=$(check_line_endings "$file")
    echo "  Current format: $endings"
    
    # Check for different line ending types
    local lf_count=$(grep -c $'\n' "$file" 2>/dev/null || echo "0")
    local crlf_count=$(grep -c $'\r\n' "$file" 2>/dev/null || echo "0")
    local cr_count=$(grep -c $'\r' "$file" 2>/dev/null || echo "0")
    
    echo "  LF occurrences: $lf_count"
    echo "  CRLF occurrences: $crlf_count"
    echo "  CR occurrences: $cr_count"
    echo ""
    
    # CSV structure
    echo -e "${BLUE}CSV Structure:${NC}"
    echo "  Headers: $(head -n 1 "$file")"
    echo "  Fields: $(head -n 1 "$file" | awk -F',' '{print NF}')"
    echo ""
    
    # Common issues
    echo -e "${BLUE}Checking for Common Issues:${NC}"
    
    # BOM check
    if head -c 3 "$file" | grep -q $'\xef\xbb\xbf'; then
        echo -e "  ${YELLOW}⚠ BOM marker detected${NC}"
    else
        echo -e "  ${GREEN}✓ No BOM marker${NC}"
    fi
    
    # Spaces after commas
    if head -n 5 "$file" | grep -q ', "'; then
        echo -e "  ${YELLOW}⚠ Spaces found after commas${NC}"
    else
        echo -e "  ${GREEN}✓ No spaces after commas${NC}"
    fi
    
    # Mixed line endings
    if [[ $lf_count -gt 0 ]] && [[ $crlf_count -gt 0 ]]; then
        echo -e "  ${YELLOW}⚠ Mixed line endings detected${NC}"
    else
        echo -e "  ${GREEN}✓ Consistent line endings${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}Recommendations:${NC}"
    echo "  - File will be converted to CRLF format for Salesforce compatibility"
    echo "  - Any BOM markers will be removed"
    echo "  - Spaces after commas will be cleaned"
    echo ""
    echo -e "${GREEN}Diagnostics complete!${NC}"
}

# Main script
main() {
    # Initialize variables
    local object=""
    local csv_file=""
    local org_alias=""
    local mode="upsert"
    local id_field="Id"
    local wait="10"
    local keep_converted="n"
    local line_format="CRLF"  # Default to CRLF for Salesforce
    local diagnostic_mode=false
    
    # Parse arguments
    while getopts "o:f:a:m:i:w:k:l:dh" opt; do
        case $opt in
            o) object="$OPTARG";;
            f) csv_file="$OPTARG";;
            a) org_alias="$OPTARG";;
            m) mode="$OPTARG";;
            i) id_field="$OPTARG";;
            w) wait="$OPTARG";;
            k) keep_converted="$OPTARG";;
            l) line_format="$OPTARG";;
            d) diagnostic_mode=true;;
            h) usage;;
            *) usage;;
        esac
    done
    
    # For diagnostic mode, only require CSV file
    if $diagnostic_mode; then
        if [[ -z "$csv_file" ]]; then
            echo -e "${RED}Error: CSV file is required for diagnostics${NC}"
            usage
        fi
        
        # Run diagnostics and exit
        run_diagnostics "$csv_file"
        exit 0
    fi
    
    # Validate required arguments for import
    if [[ -z "$object" ]] || [[ -z "$csv_file" ]]; then
        echo -e "${RED}Error: Object and CSV file are required${NC}"
        usage
    fi
    
    echo -e "${GREEN}=== Salesforce Safe Bulk Import ===${NC}"
    echo -e "${BLUE}Object: $object${NC}"
    echo -e "${BLUE}File: $csv_file${NC}"
    echo -e "${BLUE}Mode: $mode${NC}"
    echo -e "${BLUE}Line Format: $line_format${NC}"
    
    # Detect platform
    detect_platform
    
    # Ensure dos2unix is installed
    ensure_dos2unix
    
    # Validate CSV
    validate_csv "$csv_file"
    
    # Create temporary converted file
    local converted_file="${csv_file}.converted"
    
    # Convert line endings based on specified format
    if [[ "$line_format" == "AUTO" ]]; then
        # Let the function decide based on platform
        convert_line_endings "$csv_file" "$converted_file"
    else
        # Force specific format
        convert_line_endings "$csv_file" "$converted_file" "$line_format"
    fi
    
    # Perform import
    if perform_import "$object" "$converted_file" "$mode" "$id_field" "$wait" "$org_alias"; then
        echo -e "${GREEN}Import successful!${NC}"
    else
        # Try fallback method
        if fallback_import "$object" "$converted_file" "$mode" "$org_alias"; then
            echo -e "${GREEN}Import completed using fallback method${NC}"
        else
            echo -e "${RED}Import failed. Please check the error messages above.${NC}"
            echo -e "${YELLOW}Tip: You may want to try using the Salesforce Data Import Wizard in the web UI${NC}"
        fi
    fi
    
    # Cleanup or keep converted file
    if [[ "$keep_converted" == "y" ]]; then
        echo -e "${BLUE}Converted file saved as: $converted_file${NC}"
    else
        rm -f "$converted_file"
    fi
    
    echo -e "${GREEN}=== Import Process Complete ===${NC}"
}

# Run main function
main "$@"