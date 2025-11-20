#!/bin/bash

# Pre-Operation Validation Hook for Cross-Platform Essentials
#
# This hook runs before cross-platform operations to validate:
# - File paths exist (for PDF/diagram operations)
# - Required dependencies are installed
# - Mermaid syntax is valid
# - Output directories are writable
# - Instance names are valid
#
# Usage: Called automatically before agent operations
# Returns: 0 if validation passes, 1 if fails with error message

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Get operation details from arguments
OPERATION_TYPE="${1:-unknown}"  # diagram, pdf, planning, instance
OPERATION_CONTEXT="${2:-}"      # file path, instance name, etc.

# Helper functions
error() {
    echo -e "${RED}❌ Pre-flight Validation Failed${NC}" >&2
    echo -e "${RED}$1${NC}" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠️  Warning: $1${NC}" >&2
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 1. Check Node.js version
echo "Checking Node.js version..."

if ! command -v node &> /dev/null; then
    error "Node.js not installed. Install from: https://nodejs.org"
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    warn "Node.js version is old (v$NODE_VERSION). Recommended: v18+"
else
    success "Node.js version OK (v$NODE_VERSION)"
fi

# 2. Operation-specific validations
case "$OPERATION_TYPE" in
    diagram)
        echo "Validating diagram generation..."

        # Check if Mermaid CLI is installed (optional)
        if ! command -v mmdc &> /dev/null; then
            warn "Mermaid CLI not installed - diagrams will be code only (no images)"
            echo ""
            echo "To enable image generation:"
            echo "  npm install -g @mermaid-js/mermaid-cli"
            echo ""
            echo "Diagrams will still work as Mermaid code that can be:"
            echo "- Rendered at https://mermaid.live"
            echo "- Embedded in Markdown files"
            echo "- Used in GitHub/GitLab"
        else
            success "Mermaid CLI installed - image generation enabled"
        fi

        # Validate Mermaid syntax if provided
        if [ -n "$OPERATION_CONTEXT" ]; then
            # Check for common syntax errors
            if echo "$OPERATION_CONTEXT" | grep -q "graph\|flowchart\|sequenceDiagram\|classDiagram\|stateDiagram\|erDiagram\|gantt\|pie\|journey"; then
                success "Valid Mermaid diagram type detected"
            else
                warn "Could not detect Mermaid diagram type in input"
                echo "Supported types: graph, flowchart, sequenceDiagram, classDiagram, etc."
            fi

            # Check for common syntax mistakes
            if echo "$OPERATION_CONTEXT" | grep -q "-->.*-->"; then
                warn "Multiple arrows in single line may cause issues"
                echo "Consider: A --> B; B --> C"
            fi
        fi
        ;;

    pdf)
        echo "Validating PDF generation..."

        # Check if Puppeteer is available
        if ! npm list -g puppeteer &> /dev/null && ! npm list puppeteer &> /dev/null; then
            error "Puppeteer not installed - required for PDF generation

Install Puppeteer:
  npm install puppeteer

Or install globally:
  npm install -g puppeteer

Note: First install will download Chromium (~150MB)"
        fi

        success "Puppeteer installed - PDF generation enabled"

        # Check if input file exists
        if [ -n "$OPERATION_CONTEXT" ]; then
            INPUT_FILE=$(echo "$OPERATION_CONTEXT" | grep -oP '(?<=file:)[^ ]+' || echo "")

            if [ -n "$INPUT_FILE" ]; then
                if [ ! -f "$INPUT_FILE" ]; then
                    error "Input file not found: $INPUT_FILE

Check:
1. File path is correct
2. File exists: ls -la $INPUT_FILE
3. File is accessible"
                fi

                success "Input file exists: $INPUT_FILE"

                # Check file extension
                if [[ ! "$INPUT_FILE" =~ \.(md|markdown|txt|html)$ ]]; then
                    warn "Unexpected file extension: $INPUT_FILE"
                    echo "Supported formats: .md, .markdown, .txt, .html"
                fi
            fi
        fi

        # Check output directory is writable
        OUTPUT_DIR=$(echo "$OPERATION_CONTEXT" | grep -oP '(?<=output:)[^ ]+' || echo ".")

        if [ ! -w "$OUTPUT_DIR" ]; then
            error "Output directory is not writable: $OUTPUT_DIR

Fix:
1. Create directory: mkdir -p $OUTPUT_DIR
2. Set permissions: chmod u+w $OUTPUT_DIR
3. Or use different directory"
        fi

        success "Output directory is writable"
        ;;

    planning)
        echo "Validating implementation planning..."

        # Planning operations don't need special dependencies
        success "Planning operations ready"

        # Warn if output file already exists
        if [ -n "$OPERATION_CONTEXT" ]; then
            OUTPUT_FILE=$(echo "$OPERATION_CONTEXT" | grep -oP '(?<=output:)[^ ]+' || echo "")

            if [ -n "$OUTPUT_FILE" ] && [ -f "$OUTPUT_FILE" ]; then
                warn "Output file already exists: $OUTPUT_FILE"
                echo "It will be overwritten"
            fi
        fi
        ;;

    instance)
        echo "Validating instance management..."

        # Check if instance name is provided
        if [ -z "$OPERATION_CONTEXT" ]; then
            warn "No instance name provided"
        else
            INSTANCE_NAME=$(echo "$OPERATION_CONTEXT" | awk '{print $1}')
            echo "Target instance: $INSTANCE_NAME"

            # Validate instance name format
            if [[ ! "$INSTANCE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
                warn "Instance name contains special characters: $INSTANCE_NAME"
                echo "Recommended format: letters, numbers, hyphens, underscores only"
            fi

            success "Instance name format is valid"
        fi

        # Check if we're switching platforms
        if echo "$OPERATION_CONTEXT" | grep -qi "production\|prod"; then
            warn "Switching to production instance"
            echo "Ensure you:"
            echo "- Intend to work in production"
            echo "- Have tested in sandbox first"
            echo "- Have approval for production changes"
        fi
        ;;

    file)
        echo "Validating file operation..."

        # Check if file exists
        if [ -n "$OPERATION_CONTEXT" ]; then
            FILE_PATH=$(echo "$OPERATION_CONTEXT" | awk '{print $1}')

            if [ -f "$FILE_PATH" ]; then
                success "File exists: $FILE_PATH"

                # Check file size
                FILE_SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null || echo "0")
                FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))

                if [ "$FILE_SIZE_MB" -gt 10 ]; then
                    warn "Large file detected: ${FILE_SIZE_MB}MB"
                    echo "Processing may take longer"
                fi
            elif [ -d "$FILE_PATH" ]; then
                success "Directory exists: $FILE_PATH"
            else
                error "Path not found: $FILE_PATH"
            fi
        fi
        ;;

    *)
        # Unknown operation type - proceed with warning
        warn "Unknown operation type: $OPERATION_TYPE"
        echo "Proceeding without specific validation"
        ;;
esac

# 3. Check disk space (for PDF/diagram operations)
if [ "$OPERATION_TYPE" = "pdf" ] || [ "$OPERATION_TYPE" = "diagram" ]; then
    echo "Checking disk space..."

    AVAILABLE_SPACE=$(df -k . | tail -1 | awk '{print $4}')
    AVAILABLE_MB=$((AVAILABLE_SPACE / 1024))

    if [ "$AVAILABLE_MB" -lt 100 ]; then
        warn "Low disk space: ${AVAILABLE_MB}MB available"
        echo "PDF/diagram generation may fail if space runs out"
    else
        echo "Disk space OK: ${AVAILABLE_MB}MB available"
    fi
fi

# 4. Check for common path issues
if [ -n "$OPERATION_CONTEXT" ]; then
    # Check for spaces in paths
    if echo "$OPERATION_CONTEXT" | grep -q " "; then
        QUOTED_PATH=$(echo "$OPERATION_CONTEXT" | grep -oP '"[^"]+"' || echo "")
        if [ -z "$QUOTED_PATH" ]; then
            warn "Path contains spaces but is not quoted"
            echo "Ensure paths with spaces are properly quoted"
        fi
    fi

    # Check for special characters that might cause issues
    if echo "$OPERATION_CONTEXT" | grep -qP '[<>:|?*]'; then
        warn "Path contains special characters that may cause issues"
    fi
fi

# 5. Validate environment for specific operations
case "$OPERATION_TYPE" in
    diagram|pdf)
        # Check if running in headless environment (for Puppeteer)
        if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
            echo "Running in graphical environment"
        else
            echo "Running in headless environment (OK for server operations)"
        fi
        ;;
esac

# 6. Final validation summary
echo ""
success "All pre-flight validations passed"
echo "Proceeding with operation: $OPERATION_TYPE"

# Provide helpful tip based on operation
case "$OPERATION_TYPE" in
    diagram)
        echo ""
        echo "💡 Tip: Test your diagram at https://mermaid.live before generating"
        ;;
    pdf)
        echo ""
        echo "💡 Tip: Preview Markdown rendering before PDF generation"
        ;;
    planning)
        echo ""
        echo "💡 Tip: Be specific about requirements for better time estimates"
        ;;
    instance)
        echo ""
        echo "💡 Tip: Always verify current instance before making changes"
        ;;
esac

echo ""
exit 0
