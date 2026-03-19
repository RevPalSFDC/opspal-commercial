#!/bin/bash

# Post-PDF Verification Hook
#
# Runs after any PDF generation to verify:
# 1. PDF file actually exists
# 2. PDF is not suspiciously small (empty)
# 3. PDF has valid header
# 4. Mermaid diagrams were actually rendered (if expected)
#
# @reflection-driven Addresses agent hallucination pattern
# @version 1.0.0
# @created 2026-01-27

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
MIN_PDF_SIZE_KB=5
MIN_DIAGRAM_SIZE_KB=50

log_info() { echo -e "${GREEN}[PDF-VERIFY]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[PDF-VERIFY]${NC} $1"; }
log_error() { echo -e "${RED}[PDF-VERIFY]${NC} $1"; }

# Check if this is a PDF-related tool call
check_pdf_context() {
    local tool_name="${TOOL_NAME:-}"
    local tool_output="${TOOL_OUTPUT:-}"

    # Only run for relevant tools
    case "$tool_name" in
        Bash|Write|Agent|Task)
            # Check if output mentions PDF
            if echo "$tool_output" | grep -qi "\.pdf\|pdf generated\|pdf created"; then
                return 0
            fi
            ;;
    esac
    return 1
}

# Extract PDF paths from tool output
extract_pdf_paths() {
    local output="$1"

    # Find paths ending in .pdf
    echo "$output" | grep -oE '[a-zA-Z0-9_/.-]+\.pdf' | sort -u
}

# Verify a single PDF file
verify_pdf() {
    local pdf_path="$1"
    local expected_diagrams="${2:-0}"

    # Resolve relative paths
    if [[ ! "$pdf_path" = /* ]]; then
        pdf_path="$(pwd)/$pdf_path"
    fi

    # Check 1: File exists
    if [[ ! -f "$pdf_path" ]]; then
        log_error "PDF not found: $pdf_path"
        return 1
    fi

    # Check 2: File size
    local size_kb
    size_kb=$(du -k "$pdf_path" | cut -f1)

    if [[ $size_kb -lt $MIN_PDF_SIZE_KB ]]; then
        log_error "PDF too small (${size_kb}KB < ${MIN_PDF_SIZE_KB}KB): $pdf_path"
        return 1
    fi

    # Check 3: Valid PDF header
    local header
    header=$(head -c 5 "$pdf_path" 2>/dev/null || echo "")

    if [[ "$header" != "%PDF-" ]]; then
        log_error "Invalid PDF header: $pdf_path"
        return 1
    fi

    # Check 4: If diagrams expected, verify size is reasonable
    if [[ $expected_diagrams -gt 0 ]]; then
        local expected_min_kb=$((MIN_PDF_SIZE_KB + expected_diagrams * MIN_DIAGRAM_SIZE_KB))
        if [[ $size_kb -lt $expected_min_kb ]]; then
            log_warn "PDF may be missing diagrams (${size_kb}KB < expected ~${expected_min_kb}KB)"
        fi
    fi

    log_info "✅ Verified: $pdf_path (${size_kb}KB)"
    return 0
}

# Main
main() {
    # Skip if not PDF-related
    if ! check_pdf_context; then
        exit 0
    fi

    local tool_output="${TOOL_OUTPUT:-}"
    local pdf_paths
    pdf_paths=$(extract_pdf_paths "$tool_output")

    if [[ -z "$pdf_paths" ]]; then
        exit 0
    fi

    log_info "Verifying PDF outputs..."

    local failed=0
    while IFS= read -r pdf_path; do
        if [[ -n "$pdf_path" ]]; then
            # Count expected diagrams from output context
            local diagram_count=0
            if echo "$tool_output" | grep -qiE "mermaid|diagram"; then
                diagram_count=$(echo "$tool_output" | grep -oiE '[0-9]+ (mermaid|diagram)' | head -1 | grep -oE '[0-9]+' || echo "0")
            fi

            if ! verify_pdf "$pdf_path" "$diagram_count"; then
                failed=$((failed + 1))
            fi
        fi
    done <<< "$pdf_paths"

    if [[ $failed -gt 0 ]]; then
        log_error "PDF verification failed for $failed file(s)"
        # Don't block - just warn
        exit 0
    fi

    log_info "All PDF verifications passed"
}

main "$@"
