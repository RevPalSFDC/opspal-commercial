#!/bin/bash

# File Placement Validation Script
# Validates and corrects file placement according to project structure rules

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths
PROJECT_ROOT="${PROJECT_ROOT:-${PROJECT_ROOT:-/path/to/project}}"
INSTANCES_DIR="$PROJECT_ROOT/instances"
CONFIG_FILE="$PROJECT_ROOT/config/allowed-paths.json"
VIOLATIONS_LOG="$PROJECT_ROOT/logs/file-violations.log"
ARCHIVE_DIR="$PROJECT_ROOT/archive/misplaced-files"

# Create necessary directories
mkdir -p "$(dirname "$VIOLATIONS_LOG")"
mkdir -p "$ARCHIVE_DIR"

# Counters
VIOLATIONS_FOUND=0
FILES_MOVED=0
FILES_ARCHIVED=0

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$VIOLATIONS_LOG"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    echo "[ERROR] $1" >> "$VIOLATIONS_LOG"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "[WARNING] $1" >> "$VIOLATIONS_LOG"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Function to check if file matches forbidden pattern
is_forbidden_in_root() {
    local file=$1
    local filename=$(basename "$file")
    
    # Check global forbidden patterns
    if [[ "$filename" == *.cls ]] || \
       [[ "$filename" == *.trigger ]] || \
       [[ "$filename" == *.flow ]] || \
       [[ "$filename" == *.object-meta.xml ]] || \
       [[ "$filename" == *.field-meta.xml ]]; then
        return 0
    fi
    
    # Check if it's a force-app directory
    if [[ "$file" == *"/force-app/"* ]] && [[ "$file" != *"/instances/"* ]]; then
        return 0
    fi
    
    return 1
}

# Function to determine correct location for misplaced file
get_correct_location() {
    local file=$1
    local filename=$(basename "$file")
    local current_instance=""
    
    # Try to get current instance
    if [ -f "$HOME/.salesforce-instances/.current-instance" ]; then
        current_instance=$(cat "$HOME/.salesforce-instances/.current-instance")
    fi
    
    # Default to shared instance if no current instance
    if [ -z "$current_instance" ]; then
        current_instance="shared"
    fi
    
    # Determine target directory based on file type
    if [[ "$filename" == *.cls ]] || [[ "$filename" == *.trigger ]]; then
        echo "$INSTANCES_DIR/$current_instance/force-app/main/default/classes/$filename"
    elif [[ "$filename" == *.flow-meta.xml ]]; then
        echo "$INSTANCES_DIR/$current_instance/force-app/main/default/flows/$filename"
    elif [[ "$filename" == *.object-meta.xml ]] || [[ "$filename" == *.field-meta.xml ]]; then
        # Extract object name from path or filename
        local object_name=""
        if [[ "$file" == */objects/* ]]; then
            object_name=$(echo "$file" | sed -n 's:.*/objects/\([^/]*\)/.*:\1:p')
        fi
        if [ -n "$object_name" ]; then
            echo "$INSTANCES_DIR/$current_instance/force-app/main/default/objects/$object_name/$filename"
        else
            echo "$INSTANCES_DIR/$current_instance/force-app/main/default/objects/$filename"
        fi
    else
        echo "$INSTANCES_DIR/$current_instance/misc/$filename"
    fi
}

# Function to move misplaced file
move_misplaced_file() {
    local source=$1
    local target=$2
    
    # Create target directory if it doesn't exist
    local target_dir=$(dirname "$target")
    mkdir -p "$target_dir"
    
    # Create backup in archive
    local archive_file="$ARCHIVE_DIR/$(date +%Y%m%d_%H%M%S)_$(basename "$source")"
    cp "$source" "$archive_file" 2>/dev/null || true
    
    # Move the file
    if mv "$source" "$target" 2>/dev/null; then
        log "Moved: $source → $target"
        ((FILES_MOVED++))
        return 0
    else
        error "Failed to move: $source"
        return 1
    fi
}

# Function to scan for violations
scan_for_violations() {
    local scan_dir="${1:-$PROJECT_ROOT}"
    
    info "Scanning for file placement violations in: $scan_dir"
    
    # Check for Salesforce files in root directory
    while IFS= read -r -d '' file; do
        # Skip if already in instances directory
        if [[ "$file" == */instances/* ]]; then
            continue
        fi
        
        # Skip if in allowed directories
        if [[ "$file" == */agents/* ]] || \
           [[ "$file" == */scripts/* ]] || \
           [[ "$file" == */docs/* ]] || \
           [[ "$file" == */error-logging/* ]]; then
            continue
        fi
        
        # Check if this is a forbidden file
        if is_forbidden_in_root "$file"; then
            ((VIOLATIONS_FOUND++))
            warning "Violation found: $file"
            
            if [ "$AUTO_FIX" == "true" ]; then
                local correct_location=$(get_correct_location "$file")
                move_misplaced_file "$file" "$correct_location"
            fi
        fi
    done < <(find "$scan_dir" -maxdepth 5 -type f \( \
        -name "*.cls" -o \
        -name "*.trigger" -o \
        -name "*.flow-meta.xml" -o \
        -name "*.object-meta.xml" -o \
        -name "*.field-meta.xml" \
    \) -print0 2>/dev/null)
    
    # Check for force-app directory in wrong location
    if [ -d "$PROJECT_ROOT/force-app" ]; then
        ((VIOLATIONS_FOUND++))
        warning "Force-app directory found in root: $PROJECT_ROOT/force-app"
        
        if [ "$AUTO_FIX" == "true" ]; then
            # Determine target instance
            local current_instance=""
            if [ -f "$HOME/.salesforce-instances/.current-instance" ]; then
                current_instance=$(cat "$HOME/.salesforce-instances/.current-instance")
            fi
            
            if [ -z "$current_instance" ]; then
                current_instance="shared"
            fi
            
            local target_dir="$INSTANCES_DIR/$current_instance/force-app"
            
            if [ ! -d "$target_dir" ]; then
                info "Moving force-app to instance: $current_instance"
                mkdir -p "$INSTANCES_DIR/$current_instance"
                mv "$PROJECT_ROOT/force-app" "$target_dir"
                ((FILES_MOVED++))
                log "Moved force-app directory to $target_dir"
            else
                warning "Target force-app already exists in $current_instance, archiving current"
                local archive_name="force-app_$(date +%Y%m%d_%H%M%S)"
                mv "$PROJECT_ROOT/force-app" "$ARCHIVE_DIR/$archive_name"
                ((FILES_ARCHIVED++))
                log "Archived force-app directory to $ARCHIVE_DIR/$archive_name"
            fi
        fi
    fi
}

# Function to validate instance structure
validate_instance_structure() {
    local instance=$1
    local instance_dir="$INSTANCES_DIR/$instance"
    
    if [ ! -d "$instance_dir" ]; then
        warning "Instance directory does not exist: $instance"
        return 1
    fi
    
    info "Validating structure for instance: $instance"
    
    # Check required directories
    local required_dirs=("force-app/main/default" "config" "scripts" "docs")
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$instance_dir/$dir" ]; then
            warning "Missing required directory: $dir"
            if [ "$AUTO_FIX" == "true" ]; then
                mkdir -p "$instance_dir/$dir"
                log "Created directory: $instance_dir/$dir"
            fi
        fi
    done
    
    # Check for instance env file
    if [ ! -f "$instance_dir/.instance-env" ]; then
        warning "Missing .instance-env file for $instance"
        if [ "$AUTO_FIX" == "true" ]; then
            cat > "$instance_dir/.instance-env" << EOF
# Instance configuration for $instance
INSTANCE_NAME=$instance
INSTANCE_DIR=$instance_dir
CREATED=$(date -Iseconds)
EOF
            log "Created .instance-env for $instance"
        fi
    fi
    
    return 0
}

# Function to generate report
generate_report() {
    echo ""
    echo "========================================="
    echo "File Placement Validation Report"
    echo "========================================="
    echo "Scan completed: $(date)"
    echo ""
    echo "Violations found: $VIOLATIONS_FOUND"
    echo "Files moved: $FILES_MOVED"
    echo "Files archived: $FILES_ARCHIVED"
    echo ""
    
    if [ $VIOLATIONS_FOUND -gt 0 ] && [ "$AUTO_FIX" != "true" ]; then
        echo -e "${YELLOW}Run with --fix to automatically correct violations${NC}"
    fi
    
    if [ $FILES_MOVED -gt 0 ] || [ $FILES_ARCHIVED -gt 0 ]; then
        echo -e "${GREEN}Files have been reorganized successfully${NC}"
        echo "Archive location: $ARCHIVE_DIR"
    fi
    
    echo ""
    echo "Log file: $VIOLATIONS_LOG"
    echo "========================================="
}

# Parse command line arguments
AUTO_FIX=false
VALIDATE_ALL=false
TARGET_INSTANCE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --fix|-f)
            AUTO_FIX=true
            shift
            ;;
        --all|-a)
            VALIDATE_ALL=true
            shift
            ;;
        --instance|-i)
            TARGET_INSTANCE="$2"
            shift 2
            ;;
        --help|-h)
            echo "File Placement Validation Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -f, --fix         Automatically fix violations"
            echo "  -a, --all         Validate all instances"
            echo "  -i, --instance    Validate specific instance"
            echo "  -h, --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                # Scan for violations only"
            echo "  $0 --fix          # Scan and fix violations"
            echo "  $0 --all --fix    # Validate all instances and fix"
            echo "  $0 -i example-company-sandbox  # Validate specific instance"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Main execution
log "Starting file placement validation"

if [ "$AUTO_FIX" == "true" ]; then
    log "Auto-fix mode enabled"
fi

# Scan for violations in main directory
scan_for_violations "$PROJECT_ROOT"

# Validate instance structures
if [ "$VALIDATE_ALL" == "true" ]; then
    for instance_dir in "$INSTANCES_DIR"/*/; do
        if [ -d "$instance_dir" ]; then
            instance_name=$(basename "$instance_dir")
            validate_instance_structure "$instance_name"
        fi
    done
elif [ -n "$TARGET_INSTANCE" ]; then
    validate_instance_structure "$TARGET_INSTANCE"
fi

# Generate report
generate_report

exit 0