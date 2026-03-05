#!/bin/bash

##############################################################################
# Setup Validation Hooks - Salesforce Plugin
#
# Installs Git hooks for automated SOQL query validation and deployment checks
#
# This script:
# 1. Checks if hooks are already installed
# 2. Backs up existing hooks if present
# 3. Installs enhanced pre-commit hook with SOQL validation
# 4. Sets proper permissions
# 5. Tests hook installation
#
# Usage:
#   ./setup-validation-hooks.sh
#   ./setup-validation-hooks.sh --force  # Overwrite existing hooks
#
# Author: RevPal Engineering
# Date: 2025-10-24
# Version: 1.0.0
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"
BACKUP_DIR="$GIT_HOOKS_DIR/backups"
FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE=true
            shift
            ;;
        --help|-h)
            cat << EOF
Setup Validation Hooks - Salesforce Plugin

Installs Git hooks for automated SOQL query validation and deployment checks.

Usage:
  ./setup-validation-hooks.sh [OPTIONS]

Options:
  --force, -f    Overwrite existing hooks without prompting
  --help, -h     Show this help message

What gets installed:
  - Enhanced pre-commit hook with SOQL validation
  - Query linter integration
  - Deployment source validation checks
  - Plugin manifest validation (preserved if exists)

Post-installation:
  - Hooks run automatically on 'git commit'
  - Blocks commits with SOQL violations
  - Provides clear fix instructions

EOF
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

##############################################################################
# Functions
##############################################################################

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if in git repository
    if [ ! -d "$REPO_ROOT/.git" ]; then
        log_error "Not in a git repository"
        exit 1
    fi

    # Check if hooks directory exists
    if [ ! -d "$GIT_HOOKS_DIR" ]; then
        log_error "Git hooks directory not found: $GIT_HOOKS_DIR"
        exit 1
    fi

    # Check if query linter exists
    if [ ! -f "$REPO_ROOT/.claude-plugins/salesforce-plugin/scripts/qa/query-lint.js" ]; then
        log_warning "Query linter not found. SOQL validation will be skipped."
    fi

    # Check Node.js is available
    if ! command -v node &> /dev/null; then
        log_warning "Node.js not found. Query linter requires Node.js to run."
    fi

    log_success "Prerequisites checked"
}

backup_existing_hook() {
    local hook_name="$1"
    local hook_path="$GIT_HOOKS_DIR/$hook_name"

    if [ -f "$hook_path" ]; then
        mkdir -p "$BACKUP_DIR"

        local backup_file="$BACKUP_DIR/${hook_name}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$hook_path" "$backup_file"

        log_success "Backed up existing $hook_name to: ${backup_file#$REPO_ROOT/}"
    fi
}

install_pre_commit_hook() {
    local hook_path="$GIT_HOOKS_DIR/pre-commit"

    log_info "Installing pre-commit hook..."

    # Check if hook already exists
    if [ -f "$hook_path" ] && [ "$FORCE" != "true" ]; then
        if grep -q "SOQL Query Validation" "$hook_path" 2>/dev/null; then
            log_warning "Pre-commit hook with SOQL validation already installed"
            read -p "Reinstall anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Skipping pre-commit hook installation"
                return 0
            fi
        fi

        backup_existing_hook "pre-commit"
    fi

    # Create hook with SOQL validation
    cat > "$hook_path" << 'HOOK_EOF'
#!/bin/bash
# Pre-commit hook: Validate plugin manifests and SOQL queries before commit
# Prevents invalid plugin.json files and bad SOQL queries from reaching main branch
# Installed by: setup-validation-hooks.sh

set -e

echo "🔍 Pre-commit: Running validation checks..."

# ============================================================================
# Part 1: Plugin Manifest Validation
# ============================================================================

# Get list of modified plugin.json files
MODIFIED_MANIFESTS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.claude-plugins/.*/\.claude-plugin/plugin\.json$' || true)

if [ -n "$MODIFIED_MANIFESTS" ]; then
  echo ""
  echo "📦 Validating plugin manifests..."

  # Track validation status
  VALIDATION_FAILED=0
  FAILED_PLUGINS=()

  # Validate each modified manifest
  for manifest in $MODIFIED_MANIFESTS; do
    echo "  Checking: $manifest"

    # Run Claude Code validator if available
    if command -v claude &> /dev/null; then
      if claude plugin validate "$manifest" 2>&1 | grep -q "✔ Validation passed"; then
        echo "    ✓ Passed"
      else
        echo "    ✗ FAILED"
        VALIDATION_FAILED=1
        FAILED_PLUGINS+=("$manifest")
      fi
    else
      echo "    ⚠️  Claude CLI not available, skipping validation"
    fi
  done

  # Report results
  if [ $VALIDATION_FAILED -eq 1 ]; then
    echo ""
    echo "❌ Plugin manifest validation FAILED"
    echo ""
    echo "The following plugin manifests have validation errors:"
    for plugin in "${FAILED_PLUGINS[@]}"; do
      echo "  - $plugin"
    done
    echo ""
    echo "Fix the validation errors and try committing again."
    exit 1
  fi

  echo "✅ All plugin manifests validated successfully"
else
  echo "✓ No plugin manifests modified"
fi

# ============================================================================
# Part 2: SOQL Query Validation
# ============================================================================

echo ""
echo "🔍 Validating SOQL queries..."

# Check if any Salesforce plugin files were modified
MODIFIED_SF_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.claude-plugins/salesforce-plugin/(scripts|agents|commands).*\.(js|sh|md)$' || true)

if [ -z "$MODIFIED_SF_FILES" ]; then
  echo "✓ No Salesforce files modified, skipping SOQL validation"
  exit 0
fi

echo "Modified files requiring validation:"
echo "$MODIFIED_SF_FILES" | sed 's/^/  - /'
echo ""

# Run query linter
QUERY_LINTER=".claude-plugins/salesforce-plugin/scripts/qa/query-lint.js"

if [ ! -f "$QUERY_LINTER" ]; then
  echo "⚠️  Query linter not found, skipping SOQL validation"
  exit 0
fi

if ! command -v node &> /dev/null; then
  echo "⚠️  Node.js not found, skipping SOQL validation"
  exit 0
fi

# Run linter and capture output
LINT_OUTPUT=$(node "$QUERY_LINTER" 2>&1 || true)

# Check if violations were found
if echo "$LINT_OUTPUT" | grep -q "Found [1-9][0-9]* potential violations"; then
  # Extract violations from modified files only
  RELEVANT_VIOLATIONS=""

  for file in $MODIFIED_SF_FILES; do
    FILE_VIOLATIONS=$(echo "$LINT_OUTPUT" | grep -A3 "File: $file" || true)
    if [ -n "$FILE_VIOLATIONS" ]; then
      RELEVANT_VIOLATIONS="$RELEVANT_VIOLATIONS\n$FILE_VIOLATIONS"
    fi
  done

  if [ -n "$RELEVANT_VIOLATIONS" ]; then
    echo "❌ SOQL validation FAILED"
    echo ""
    echo "The following SOQL violations were found in modified files:"
    echo -e "$RELEVANT_VIOLATIONS"
    echo ""
    echo "Common fixes:"
    echo "  • Use FlowDefinitionView.ApiName instead of FlowVersionView.ApiName"
    echo "  • Use consistent operators in OR conditions (all LIKE or all =)"
    echo "  • Add --use-tooling-api flag for Tooling API objects"
    echo "  • Validate deployment source paths before deploying"
    echo ""
    echo "Run 'node $QUERY_LINTER' to see all violations"
    echo ""
    echo "Documentation:"
    echo "  • .claude-plugins/salesforce-plugin/docs/SOQL_BEST_PRACTICES.md"
    echo "  • .claude-plugins/salesforce-plugin/docs/SALESFORCE_TOOLING_API_FLOW_OBJECTS.md"
    echo ""
    echo "To bypass this check (not recommended):"
    echo "  git commit --no-verify"
    exit 1
  fi
fi

echo "✅ SOQL validation passed"
echo ""
echo "✨ All validation checks passed - proceeding with commit"
exit 0
HOOK_EOF

    chmod +x "$hook_path"
    log_success "Pre-commit hook installed"
}

test_hook() {
    log_info "Testing hook installation..."

    local hook_path="$GIT_HOOKS_DIR/pre-commit"

    # Check if hook is executable
    if [ ! -x "$hook_path" ]; then
        log_error "Pre-commit hook is not executable"
        exit 1
    fi

    # Check if hook contains SOQL validation
    if ! grep -q "SOQL Query Validation" "$hook_path" 2>/dev/null; then
        log_error "Pre-commit hook does not contain SOQL validation"
        exit 1
    fi

    log_success "Hook installation verified"
}

print_summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_success "Validation hooks setup complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "✨ What's enabled:"
    echo "   • Plugin manifest validation"
    echo "   • SOQL query validation"
    echo "   • Automatic error detection on commit"
    echo ""
    echo "📝 How it works:"
    echo "   1. Make changes to Salesforce plugin files"
    echo "   2. Stage changes: git add ."
    echo "   3. Commit: git commit -m 'message'"
    echo "   4. Hook automatically validates SOQL queries"
    echo "   5. If violations found, commit is blocked with clear instructions"
    echo ""
    echo "🔧 Manual validation:"
    echo "   node .claude-plugins/salesforce-plugin/scripts/qa/query-lint.js"
    echo ""
    echo "📚 Documentation:"
    echo "   .claude-plugins/salesforce-plugin/docs/SOQL_BEST_PRACTICES.md"
    echo "   .claude-plugins/salesforce-plugin/docs/SALESFORCE_TOOLING_API_FLOW_OBJECTS.md"
    echo ""
    echo "⏭️  Bypass hook (not recommended):"
    echo "   git commit --no-verify"
    echo ""
}

##############################################################################
# Main Execution
##############################################################################

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   Salesforce Plugin - Validation Hooks Setup          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

check_prerequisites
install_pre_commit_hook
test_hook
print_summary

exit 0
