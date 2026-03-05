#!/usr/bin/env bash

##
# Copyright 2024-2026 RevPal Corp.
#
# Run Phase 1: Reflection Processing
#
# This script performs pre-flight checks and executes Phase 1 analysis.
##

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Reflection Processing - Phase 1"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Pre-flight checks
echo "📋 Pre-flight Checks"
echo "-------------------"

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
fi
print_success "Node.js $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi
print_success "npm $(npm --version)"

# Check .env file
if [ ! -f "$PLUGIN_DIR/.env" ]; then
    print_error ".env file not found"
    echo ""
    echo "Create .env file with:"
    echo "  cp $PLUGIN_DIR/.env.example $PLUGIN_DIR/.env"
    echo ""
    echo "Then add your Supabase credentials:"
    echo "  SUPABASE_URL=https://your-project.supabase.co"
    echo "  SUPABASE_SERVICE_ROLE_KEY=eyJhbGci..."
    echo ""
    exit 1
fi
print_success ".env file exists"

# Check required packages
REQUIRED_PACKAGES=("@supabase/supabase-js" "dotenv")
MISSING_PACKAGES=()

for package in "${REQUIRED_PACKAGES[@]}"; do
    if [ ! -d "$PLUGIN_DIR/node_modules/$package" ]; then
        MISSING_PACKAGES+=("$package")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    print_warning "Missing packages: ${MISSING_PACKAGES[*]}"
    echo ""
    read -p "Install missing packages? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 Installing packages..."
        cd "$PLUGIN_DIR"
        npm install "${MISSING_PACKAGES[@]}"
        print_success "Packages installed"
    else
        print_error "Cannot proceed without required packages"
        exit 1
    fi
else
    print_success "All required packages installed"
fi

# Test Supabase connection
echo ""
echo "🔌 Testing Supabase Connection"
echo "------------------------------"

if ! node "$SCRIPT_DIR/test-supabase-connection.js"; then
    print_error "Supabase connection failed"
    echo ""
    echo "Fix your .env configuration and try again"
    exit 1
fi

# Create output directory
OUTPUT_DIR="$PLUGIN_DIR/output/reflection-processing"
mkdir -p "$OUTPUT_DIR"
print_success "Output directory ready: $OUTPUT_DIR"

# Execute Phase 1
echo ""
echo "▶️  Executing Phase 1"
echo "-------------------"
echo ""

if node "$SCRIPT_DIR/process-reflections-phase1.js"; then
    echo ""
    echo "=================================="
    print_success "Phase 1 completed successfully!"
    echo "=================================="
    echo ""
    echo "📄 Review the improvement plan:"
    echo "   ls -lh $OUTPUT_DIR/improvement-plan-*.md"
    echo ""
    echo "🔜 Next steps:"
    echo "   1. Review improvement plan"
    echo "   2. Verify cohort assignments"
    echo "   3. Get stakeholder approval"
    echo "   4. Run Phase 2 (when ready)"
    echo ""
    exit 0
else
    echo ""
    echo "=================================="
    print_error "Phase 1 failed"
    echo "=================================="
    echo ""
    echo "Check error messages above for details"
    exit 1
fi
