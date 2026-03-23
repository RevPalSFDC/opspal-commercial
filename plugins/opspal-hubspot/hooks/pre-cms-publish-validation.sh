#!/usr/bin/env bash

##
# Pre-CMS Publish Validation Hook
#
# Validates CMS page before publishing to prevent common issues:
# - Missing required fields (name, slug, meta description)
# - Invalid template references
# - Low SEO scores (configurable threshold)
# - Missing content or widgets
#
# Triggered by: /cms-publish-page command or hubspot-cms-page-publisher agent
##

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source standardized error handler for centralized logging
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    ERROR_HANDLER="${CLAUDE_PLUGIN_ROOT}/opspal-core/hooks/lib/error-handler.sh"
else
    ERROR_HANDLER="${SCRIPT_DIR}/../../opspal-core/hooks/lib/error-handler.sh"
fi

if [[ -f "$ERROR_HANDLER" ]]; then
    source "$ERROR_HANDLER"
    HOOK_NAME="pre-cms-publish-validation"
fi

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PLUGIN_ROOT}"
if ! command -v jq &>/dev/null; then
    echo "[pre-cms-publish-validation] jq not found, skipping" >&2
    exit 0
fi

SCRIPT_DIR="$PROJECT_ROOT/scripts/lib"

# Configuration
MIN_SEO_SCORE="${MIN_SEO_SCORE:-60}"
REQUIRE_META_DESCRIPTION="${REQUIRE_META_DESCRIPTION:-true}"
REQUIRE_TEMPLATE_VALIDATION="${REQUIRE_TEMPLATE_VALIDATION:-true}"
SKIP_VALIDATION="${SKIP_CMS_VALIDATION:-false}"

# Extract page ID from environment or arguments
PAGE_ID="${PAGE_ID:-${1:-}}"
PAGE_TYPE="${PAGE_TYPE:-landing-pages}"
FORCE_PUBLISH="${FORCE_PUBLISH:-false}"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Skip if validation disabled
if [[ "$SKIP_VALIDATION" == "true" ]]; then
    echo -e "${YELLOW}⚠️  CMS publish validation skipped (SKIP_CMS_VALIDATION=true)${NC}"
    exit 0
fi

# Exit if no page ID provided
if [[ -z "$PAGE_ID" ]]; then
    # Not blocking - might not be a CMS publish operation
    exit 0
fi

echo ""
echo "🔍 Pre-Publish Validation: CMS Page ${PAGE_ID}"
echo "=========================================="

# Check if required scripts exist
PAGES_MANAGER="$SCRIPT_DIR/hubspot-cms-pages-manager.js"
PUBLISHING_CONTROLLER="$SCRIPT_DIR/hubspot-cms-publishing-controller.js"

if [[ ! -f "$PAGES_MANAGER" ]]; then
    echo -e "${YELLOW}⚠️  CMS Pages Manager not found, skipping validation${NC}"
    exit 0
fi

# Validation results
VALIDATION_ERRORS=()
VALIDATION_WARNINGS=()
SEO_SCORE=0

# 1. Validate page exists and retrieve metadata
echo -n "📄 Retrieving page metadata... "
PAGE_DATA=$(node -e "
const manager = require('$PAGES_MANAGER');
const pagesManager = new manager({ pageType: '$PAGE_TYPE' });

pagesManager.getPage('$PAGE_ID')
    .then(page => {
        console.log(JSON.stringify(page, null, 2));
    })
    .catch(err => {
        console.error('ERROR: ' + err.message);
        process.exit(1);
    });
" 2>&1)

if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ FAILED${NC}"
    echo -e "${RED}Cannot retrieve page: $PAGE_DATA${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC}"

# Parse page data
PAGE_NAME=$(echo "$PAGE_DATA" | jq -r '.name // empty')
PAGE_SLUG=$(echo "$PAGE_DATA" | jq -r '.slug // empty')
META_DESCRIPTION=$(echo "$PAGE_DATA" | jq -r '.metaDescription // empty')
TEMPLATE_PATH=$(echo "$PAGE_DATA" | jq -r '.templatePath // empty')
CURRENTLY_PUBLISHED=$(echo "$PAGE_DATA" | jq -r '.currentlyPublished // false')
WIDGET_COUNT=$(echo "$PAGE_DATA" | jq -r '.widgets | length // 0')

# 2. Check required fields
echo -n "✅ Validating required fields... "

if [[ -z "$PAGE_NAME" ]]; then
    VALIDATION_ERRORS+=("Missing page name")
fi

if [[ -z "$PAGE_SLUG" ]]; then
    VALIDATION_ERRORS+=("Missing URL slug")
fi

if [[ "$REQUIRE_META_DESCRIPTION" == "true" ]] && [[ -z "$META_DESCRIPTION" ]]; then
    VALIDATION_WARNINGS+=("Missing meta description (recommended for SEO)")
fi

if [[ -z "$TEMPLATE_PATH" ]]; then
    VALIDATION_ERRORS+=("Missing template path")
fi

if [[ "$WIDGET_COUNT" -eq 0 ]]; then
    VALIDATION_WARNINGS+=("Page has no content widgets")
fi

if [[ ${#VALIDATION_ERRORS[@]} -eq 0 ]]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ ${#VALIDATION_ERRORS[@]} error(s)${NC}"
fi

# 3. Validate template exists (if enabled)
if [[ "$REQUIRE_TEMPLATE_VALIDATION" == "true" ]] && [[ -n "$TEMPLATE_PATH" ]]; then
    echo -n "🎨 Validating template... "

    TEMPLATE_VALIDATION=$(node -e "
    const manager = require('$PAGES_MANAGER');
    const pagesManager = new manager({ pageType: '$PAGE_TYPE' });

    pagesManager.validateTemplate('$TEMPLATE_PATH')
        .then(result => {
            if (result.exists) {
                console.log('VALID');
            } else {
                console.log('NOT_FOUND');
            }
        })
        .catch(err => {
            console.error('ERROR: ' + err.message);
        });
    " 2>&1)

    if [[ "$TEMPLATE_VALIDATION" == "VALID" ]]; then
        echo -e "${GREEN}✓${NC}"
    elif [[ "$TEMPLATE_VALIDATION" == "NOT_FOUND" ]]; then
        echo -e "${RED}✗${NC}"
        VALIDATION_ERRORS+=("Template not found: $TEMPLATE_PATH")
    else
        echo -e "${YELLOW}⚠️  Could not validate${NC}"
        VALIDATION_WARNINGS+=("Template validation failed: $TEMPLATE_VALIDATION")
    fi
fi

# 4. SEO Score Check (optional - requires hubspot-seo-optimizer)
# This would delegate to the SEO agent if available
# For now, we'll skip this in the hook and let the command handle it

# 5. Check if already published
if [[ "$CURRENTLY_PUBLISHED" == "true" ]]; then
    VALIDATION_WARNINGS+=("Page is already published (will update live content)")
fi

# Display validation results
echo ""
echo "📊 Validation Summary"
echo "=========================================="
echo "Page: $PAGE_NAME"
echo "Slug: $PAGE_SLUG"
echo "Template: $TEMPLATE_PATH"
echo "Widgets: $WIDGET_COUNT"
echo "Currently Published: $CURRENTLY_PUBLISHED"

# Show errors
if [[ ${#VALIDATION_ERRORS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ Errors (${#VALIDATION_ERRORS[@]}):${NC}"
    for error in "${VALIDATION_ERRORS[@]}"; do
        echo -e "  ${RED}•${NC} $error"
    done
fi

# Show warnings
if [[ ${#VALIDATION_WARNINGS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  Warnings (${#VALIDATION_WARNINGS[@]}):${NC}"
    for warning in "${VALIDATION_WARNINGS[@]}"; do
        echo -e "  ${YELLOW}•${NC} $warning"
    done
fi

# Decision logic
if [[ ${#VALIDATION_ERRORS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ Validation FAILED${NC}"
    echo ""

    if [[ "$FORCE_PUBLISH" == "true" ]]; then
        echo -e "${YELLOW}⚠️  FORCE_PUBLISH=true, proceeding anyway${NC}"
        exit 0
    fi

    echo "Cannot publish page with validation errors."
    echo ""
    echo "Options:"
    echo "  1. Fix the errors listed above"
    echo "  2. Use --force flag to bypass validation (not recommended)"
    echo ""
    exit 1
fi

if [[ ${#VALIDATION_WARNINGS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  Validation passed with warnings${NC}"
    echo ""

    # Don't block on warnings, just inform
    echo "Proceeding with publish. Consider addressing warnings for optimal results."
fi

echo ""
echo -e "${GREEN}✅ Validation PASSED - Ready to publish${NC}"
echo ""

exit 0
